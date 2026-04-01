import logging
import httpx
from fastapi import HTTPException, Header
from gotrue import SyncGoTrueClient
from .config import SUPABASE_URL, SUPABASE_SERVICE_KEY

logger = logging.getLogger(__name__)

auth_client = SyncGoTrueClient(
    url=f"{SUPABASE_URL}/auth/v1",
    headers={"apikey": SUPABASE_SERVICE_KEY},
)


def db_request(method: str, table: str, params: dict | None = None, body: dict | None = None):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    with httpx.Client() as client:
        if method == "GET":
            res = client.get(url, headers=headers, params=params)
        elif method == "POST":
            res = client.post(url, headers=headers, params=params, json=body)
        elif method == "PATCH":
            res = client.patch(url, headers=headers, params=params, json=body)
        else:
            raise ValueError(f"Unsupported method: {method}")
    res.raise_for_status()
    return res.json() if res.text else None


async def get_current_user(authorization: str = Header(...)):
    token = authorization.replace("Bearer ", "")
    try:
        res = auth_client.get_user(token)
        return res.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


def get_user_plan(user_id: str) -> str:
    rows = db_request("GET", "users", params={
        "id": f"eq.{user_id}",
        "select": "plan",
    })
    if rows:
        return rows[0]["plan"]
    return "free"
