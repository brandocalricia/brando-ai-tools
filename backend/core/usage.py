from datetime import date
from .auth import db_request, is_pro_for
from .config import FREE_DAILY_LIMITS


def get_usage_today(user_id: str, extension: str) -> int:
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
    today = date.today().isoformat()
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
    else:
        db_request("POST", "usage", body={
            "user_id": user_id,
            "date": today,
            "extension": extension,
            "generation_count": 1,
        })


def can_generate(user_id: str, extension: str) -> tuple[bool, int]:
    if is_pro_for(user_id, extension):
        return True, -1
    limit = FREE_DAILY_LIMITS.get(extension, 3)
    usage = get_usage_today(user_id, extension)
    remaining = max(0, limit - usage)
    return remaining > 0, remaining
