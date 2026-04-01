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
from pydantic import BaseModel, EmailStr, field_validator

from core.auth import auth_client, db_request, get_current_user, get_user_plan, is_pro_for
from core.usage import get_usage_today
from core.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    STRIPE_PRICE_ID, STRIPE_PRICE_IDS, ALLOWED_ORIGINS,
    FREE_DAILY_LIMITS,
)

# IMPORTANT: Set a monthly spending limit on console.anthropic.com → Settings → Limits
# Recommended: $20/mo to start, increase as revenue grows

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Brando AI Tools API", docs_url=None, redoc_url=None)

# --- Rate limiting (runs before CORS) ---
request_counts: dict[str, list[float]] = {}
RATE_LIMIT = 60  # requests per minute
RATE_WINDOW = 60  # seconds
MAX_TRACKED_IPS = 10000  # prevent unbounded memory growth
_last_cleanup = 0.0


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Let CORS preflight through without rate limiting
    if request.method == "OPTIONS":
        response = await call_next(request)
        return response

    global _last_cleanup
    client_ip = request.client.host
    now = time.time()

    # Periodic cleanup: prune stale IPs every 5 minutes
    if now - _last_cleanup > 300:
        stale_ips = [ip for ip, ts in request_counts.items() if not ts or now - ts[-1] > RATE_WINDOW]
        for ip in stale_ips:
            del request_counts[ip]
        # Hard cap: if still too many IPs, drop oldest
        if len(request_counts) > MAX_TRACKED_IPS:
            request_counts.clear()
        _last_cleanup = now

    # Clean old entries for this IP
    if client_ip in request_counts:
        request_counts[client_ip] = [t for t in request_counts[client_ip] if now - t < RATE_WINDOW]
    else:
        request_counts[client_ip] = []

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
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters.")
        if len(v) > 128:
            raise ValueError("Password must be under 128 characters.")
        return v


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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@app.post("/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    """Send a password reset email via Supabase Auth."""
    try:
        with httpx.Client() as client:
            client.post(
                f"{SUPABASE_URL}/auth/v1/recover",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Content-Type": "application/json",
                },
                json={"email": req.email},
            )
    except Exception:
        pass  # Don't reveal whether the email exists
    return {"message": "If that email is registered, you'll receive a password reset link."}


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
    pro_extensions = {}
    for ext in FREE_DAILY_LIMITS:
        usage[ext] = get_usage_today(user.id, ext)
        pro_extensions[ext] = is_pro_for(user.id, ext)
    return {
        "id": user.id,
        "email": user.email,
        "plan": plan,
        "pro_extensions": pro_extensions,
        "usage": usage,
    }


# --- Stripe endpoints ---

class CheckoutRequest(BaseModel):
    extension: str = "bundle"  # "linkedin", "youtube", "gmail", "jobs", "reviews", or "bundle"


@app.post("/create-checkout-session")
async def create_checkout_session(req: CheckoutRequest = CheckoutRequest(), user=Depends(get_current_user)):
    ext = req.extension
    valid_options = list(STRIPE_PRICE_IDS.keys())
    if ext not in valid_options:
        raise HTTPException(status_code=400, detail=f"Invalid extension. Choose from: {', '.join(valid_options)}")

    # Get the right Stripe price ID
    price_id = STRIPE_PRICE_IDS.get(ext, "")
    if not price_id:
        # Fallback to legacy single price ID
        price_id = STRIPE_PRICE_ID
    if not price_id:
        raise HTTPException(status_code=500, detail="Payment not configured for this extension.")

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
        line_items=[{"price": price_id, "quantity": 1}],
        mode="subscription",
        success_url=os.environ.get("STRIPE_SUCCESS_URL", "https://brando.ai/success"),
        cancel_url=os.environ.get("STRIPE_CANCEL_URL", "https://brando.ai"),
        metadata={"user_id": user.id, "extension": ext},
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
            ext = safe_get(metadata, "extension", "bundle") if metadata else "bundle"
            if not user_id:
                user_id = find_user_id_from_customer(customer_id)
            if user_id:
                if ext == "bundle":
                    # Bundle = full pro across everything
                    update_user_plan(user_id, "pro")
                else:
                    # Individual extension — merge with existing plan
                    current_plan = get_user_plan(user_id)
                    if current_plan == "pro":
                        pass  # already has bundle, nothing to do
                    elif current_plan == "free":
                        update_user_plan(user_id, ext)
                    else:
                        # Already has some individual extensions, add this one
                        existing = set(current_plan.split(","))
                        existing.add(ext)
                        # If they now have all 5, upgrade to full pro
                        all_exts = set(FREE_DAILY_LIMITS.keys())
                        if existing >= all_exts:
                            update_user_plan(user_id, "pro")
                        else:
                            update_user_plan(user_id, ",".join(sorted(existing)))
                logger.info(f"Updated user {user_id} — extension={ext}")

        elif event_type in ("customer.subscription.deleted", "customer.subscription.updated"):
            customer_id = safe_get(event_data, "customer")
            user_id = find_user_id_from_customer(customer_id)
            if user_id:
                status = safe_get(event_data, "status")
                is_active = status in ("active", "trialing")
                if not is_active:
                    # Subscription cancelled — figure out which extension to remove
                    # Get the price ID from the subscription to know which extension
                    items = safe_get(event_data, "items")
                    item_data = safe_get(items, "data", []) if items else []
                    cancelled_ext = None
                    if item_data:
                        first_item = item_data[0] if isinstance(item_data, list) and len(item_data) > 0 else None
                        if first_item:
                            price_obj = safe_get(first_item, "price")
                            price_id = safe_get(price_obj, "id") if price_obj else None
                            # Reverse lookup: which extension does this price belong to?
                            for ext_name, pid in STRIPE_PRICE_IDS.items():
                                if pid and pid == price_id:
                                    cancelled_ext = ext_name
                                    break

                    if cancelled_ext == "bundle" or not cancelled_ext:
                        # Bundle cancelled or can't determine — reset to free
                        update_user_plan(user_id, "free")
                    else:
                        # Individual extension cancelled — remove just that one
                        current_plan = get_user_plan(user_id)
                        if current_plan == "pro":
                            # Had bundle, now removing one doesn't make sense — reset to free
                            update_user_plan(user_id, "free")
                        elif current_plan == "free":
                            pass  # already free
                        else:
                            existing = set(current_plan.split(","))
                            existing.discard(cancelled_ext)
                            if existing:
                                update_user_plan(user_id, ",".join(sorted(existing)))
                            else:
                                update_user_plan(user_id, "free")

        elif event_type == "invoice.payment_failed":
            customer_id = safe_get(event_data, "customer")
            attempt_count = safe_get(event_data, "attempt_count", 0)
            if attempt_count >= 3:
                user_id = find_user_id_from_customer(customer_id)
                if user_id:
                    update_user_plan(user_id, "free")

    except Exception as e:
        logger.error(f"Webhook error: {type(e).__name__}: {e}", exc_info=True)
        # Return 200 so Stripe doesn't retry, but don't leak error details
        return JSONResponse(content={"received": True, "error": "processing_error"}, status_code=200)

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
