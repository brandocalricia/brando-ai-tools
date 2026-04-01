import os
import logging
import time
from collections import defaultdict
from datetime import datetime, date

import httpx
import stripe
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel

from core.auth import auth_client, db_request, get_current_user, get_user_plan
from core.usage import get_usage_today
from core.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    STRIPE_PRICE_ID, ALLOWED_ORIGINS,
    FREE_DAILY_LIMITS,
)

# IMPORTANT: Set a monthly spending limit on console.anthropic.com → Settings → Limits
# Recommended: $20/mo to start, increase as revenue grows

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Brando AI Tools API", docs_url=None, redoc_url=None)

# --- Rate limiting (runs before CORS) ---
request_counts = defaultdict(list)
RATE_LIMIT = 60  # requests per minute
RATE_WINDOW = 60  # seconds


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    client_ip = request.client.host
    now = time.time()
    # Clean old entries
    request_counts[client_ip] = [t for t in request_counts[client_ip] if now - t < RATE_WINDOW]
    if len(request_counts[client_ip]) >= RATE_LIMIT:
        return JSONResponse(status_code=429, content={"detail": "Too many requests. Try again later."})
    request_counts[client_ip].append(now)
    response = await call_next(request)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Import and include route modules
from routes.linkedin import router as linkedin_router
from routes.youtube import router as youtube_router
from routes.gmail import router as gmail_router
from routes.jobs import router as jobs_router
from routes.reviews import router as reviews_router

app.include_router(linkedin_router)
app.include_router(youtube_router)
app.include_router(gmail_router)
app.include_router(jobs_router)
app.include_router(reviews_router)


# --- Auth endpoints (shared across all extensions) ---

class AuthRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
async def signup(req: AuthRequest):
    try:
        res = auth_client.sign_up({"email": req.email, "password": req.password})
        if not res.user:
            raise HTTPException(status_code=400, detail="Signup failed.")
        db_request("POST", "users", body={
            "id": res.user.id,
            "email": req.email,
            "plan": "free",
        })
        return {
            "access_token": res.session.access_token if res.session else None,
            "user": {"id": res.user.id, "email": req.email, "plan": "free"},
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Signup failed. Email may already be in use.")


@app.post("/auth/login")
async def login(req: AuthRequest):
    try:
        res = auth_client.sign_in_with_password(
            {"email": req.email, "password": req.password}
        )
        plan = get_user_plan(res.user.id)
        return {
            "access_token": res.session.access_token,
            "user": {
                "id": res.user.id,
                "email": res.user.email,
                "plan": plan,
            },
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password.")


@app.get("/auth/me")
async def me(user=Depends(get_current_user)):
    plan = get_user_plan(user.id)
    usage = {}
    for ext in FREE_DAILY_LIMITS:
        usage[ext] = get_usage_today(user.id, ext)
    return {
        "id": user.id,
        "email": user.email,
        "plan": plan,
        "usage": usage,
    }


# --- Stripe endpoints ---

@app.post("/create-checkout-session")
async def create_checkout_session(user=Depends(get_current_user)):
    rows = db_request("GET", "users", params={
        "id": f"eq.{user.id}",
        "select": "stripe_customer_id",
    })
    customer_id = rows[0]["stripe_customer_id"] if rows and rows[0].get("stripe_customer_id") else None

    if not customer_id:
        customer = stripe.Customer.create(email=user.email, metadata={"user_id": user.id})
        customer_id = customer.id
        db_request("PATCH", "users", params={"id": f"eq.{user.id}"}, body={
            "stripe_customer_id": customer_id,
        })

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
        mode="subscription",
        success_url=os.environ.get("STRIPE_SUCCESS_URL", "https://brando.ai/success"),
        cancel_url=os.environ.get("STRIPE_CANCEL_URL", "https://brando.ai"),
        metadata={"user_id": user.id},
    )
    return {"checkout_url": session.url}


def safe_get(obj, key, default=None):
    try:
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)
    except Exception:
        return default


def find_user_id_from_customer(customer_id: str) -> str | None:
    rows = db_request("GET", "users", params={
        "stripe_customer_id": f"eq.{customer_id}",
        "select": "id",
    })
    return rows[0]["id"] if rows else None


def update_user_plan(user_id: str, plan: str):
    url = f"{SUPABASE_URL}/rest/v1/users?id=eq.{user_id}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    with httpx.Client() as client:
        res = client.patch(url, headers=headers, json={"plan": plan})
    logger.info(f"update_user_plan({user_id}, {plan}) — status={res.status_code}")
    res.raise_for_status()


@app.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as e:
        logger.error(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    event_type = event["type"] if isinstance(event, dict) else event.type
    logger.info(f"Webhook received: {event_type}")

    try:
        event_data = event["data"]["object"] if isinstance(event, dict) else event.data.object

        if event_type == "checkout.session.completed":
            customer_id = safe_get(event_data, "customer")
            metadata = safe_get(event_data, "metadata", {})
            user_id = safe_get(metadata, "user_id") if metadata else None
            if not user_id:
                user_id = find_user_id_from_customer(customer_id)
            if user_id:
                update_user_plan(user_id, "pro")
                logger.info(f"Updated user {user_id} to pro")

        elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
            customer_id = safe_get(event_data, "customer")
            user_id = find_user_id_from_customer(customer_id)
            if user_id:
                status = safe_get(event_data, "status")
                is_active = status in ("active", "trialing")
                update_user_plan(user_id, "pro" if is_active else "free")

        elif event_type == "invoice.payment_failed":
            customer_id = safe_get(event_data, "customer")
            attempt_count = safe_get(event_data, "attempt_count", 0)
            if attempt_count >= 3:
                user_id = find_user_id_from_customer(customer_id)
                if user_id:
                    update_user_plan(user_id, "free")

    except Exception as e:
        logger.error(f"Webhook error: {type(e).__name__}: {e}", exc_info=True)
        return JSONResponse(content={"received": True, "error": str(e)}, status_code=200)

    return JSONResponse(content={"received": True})


# --- Pages ---

CONFIRM_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Email Confirmed — Brando</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;
background:#f5f5f5;color:#1a1a1a}
.card{text-align:center;background:#fff;padding:48px 40px;border-radius:12px;
box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:420px}
.check{width:56px;height:56px;background:#e8f5e9;border-radius:50%;
display:inline-flex;align-items:center;justify-content:center;margin-bottom:20px}
.check svg{width:28px;height:28px;color:#2e7d32}
h1{font-size:22px;font-weight:600;margin-bottom:8px}
p{font-size:14px;color:#666;line-height:1.5}
</style>
</head>
<body>
<div class="card">
<div class="check">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
<polyline points="20 6 9 17 4 12"></polyline>
</svg>
</div>
<h1>Email confirmed!</h1>
<p>You can close this tab and go back to the Brando extension to log in.</p>
</div>
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
async def root():
    return CONFIRM_HTML


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
