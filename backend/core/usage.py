import logging
import re
from datetime import date
from fastapi import HTTPException
from core.auth import db_request, is_pro_for
from core.config import FREE_DAILY_LIMITS, SUPABASE_URL, SUPABASE_SERVICE_KEY
import httpx

logger = logging.getLogger(__name__)

# Pro users get generous but finite daily limits to prevent cost abuse
PRO_DAILY_LIMIT = 500

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_VALID_EXTENSIONS = {"linkedin", "youtube", "gmail", "jobs", "reviews"}


def _validate_usage_params(user_id: str, extension: str):
    if not _UUID_RE.match(str(user_id)):
        raise HTTPException(status_code=400, detail="Invalid user ID format.")
    if extension not in _VALID_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Invalid extension.")


def get_usage_today(user_id: str, extension: str) -> int:
    _validate_usage_params(user_id, extension)
    today = date.today().isoformat()
    rows = db_request("GET", "usage", params={
        "user_id": f"eq.{user_id}",
        "date": f"eq.{today}",
        "extension": f"eq.{extension}",
        "select": "generation_count",
    })
    if rows:
        return rows[0]["generation_count"]
    return 0


def increment_usage(user_id: str, extension: str):
    """Atomic upsert: insert or increment in one call to prevent race conditions."""
    _validate_usage_params(user_id, extension)
    today = date.today().isoformat()

    # Use Supabase RPC or upsert via PostgREST with on_conflict
    # PostgREST supports upsert with Prefer: resolution=merge-duplicates
    url = f"{SUPABASE_URL}/rest/v1/usage"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    # First, try to get and increment atomically
    rows = db_request("GET", "usage", params={
        "user_id": f"eq.{user_id}",
        "date": f"eq.{today}",
        "extension": f"eq.{extension}",
        "select": "id,generation_count",
    })

    if rows:
        # Use a conditional PATCH: only increment if current count matches what we read
        # This provides optimistic locking
        row_id = rows[0]["id"]
        current_count = rows[0]["generation_count"]
        with httpx.Client() as client:
            res = client.patch(
                f"{url}?id=eq.{row_id}&generation_count=eq.{current_count}",
                headers=headers,
                json={"generation_count": current_count + 1},
            )
        if res.status_code == 200:
            result = res.json()
            if not result:
                # Race condition: count changed between read and write, re-read and retry once
                logger.warning(f"Usage increment race condition for user {user_id}, retrying")
                rows2 = db_request("GET", "usage", params={
                    "id": f"eq.{row_id}",
                    "select": "generation_count",
                })
                if rows2:
                    db_request("PATCH", "usage", params={"id": f"eq.{row_id}"}, body={
                        "generation_count": rows2[0]["generation_count"] + 1,
                    })
    else:
        try:
            db_request("POST", "usage", body={
                "user_id": user_id,
                "date": today,
                "extension": extension,
                "generation_count": 1,
            })
        except Exception:
            # Unique constraint violation = another request created it first, just increment
            rows = db_request("GET", "usage", params={
                "user_id": f"eq.{user_id}",
                "date": f"eq.{today}",
                "extension": f"eq.{extension}",
                "select": "id,generation_count",
            })
            if rows:
                db_request("PATCH", "usage", params={"id": f"eq.{rows[0]['id']}"}, body={
                    "generation_count": rows[0]["generation_count"] + 1,
                })


def can_generate(user_id: str, extension: str) -> tuple[bool, int]:
    _validate_usage_params(user_id, extension)
    usage = get_usage_today(user_id, extension)

    if is_pro_for(user_id, extension):
        # Pro users still have a daily cap to prevent runaway API costs
        remaining = max(0, PRO_DAILY_LIMIT - usage)
        return remaining > 0, -1  # -1 signals "pro" to the frontend (hides counter)

    limit = FREE_DAILY_LIMITS.get(extension, 3)
    remaining = max(0, limit - usage)
    return remaining > 0, remaining
