import os
import logging

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Validate critical env vars on startup
_REQUIRED_VARS = {
    "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_SERVICE_KEY": SUPABASE_SERVICE_KEY,
    "STRIPE_SECRET_KEY": STRIPE_SECRET_KEY,
    "STRIPE_WEBHOOK_SECRET": STRIPE_WEBHOOK_SECRET,
}
for _name, _val in _REQUIRED_VARS.items():
    if not _val:
        raise RuntimeError(f"Missing required environment variable: {_name}")

# Stripe price IDs — set these in Railway env vars
# Create 6 prices in Stripe: one per extension + one bundle
STRIPE_PRICE_IDS = {
    "linkedin": os.environ.get("STRIPE_PRICE_LINKEDIN", ""),
    "youtube": os.environ.get("STRIPE_PRICE_YOUTUBE", ""),
    "gmail": os.environ.get("STRIPE_PRICE_GMAIL", ""),
    "jobs": os.environ.get("STRIPE_PRICE_JOBS", ""),
    "reviews": os.environ.get("STRIPE_PRICE_REVIEWS", ""),
    "bundle": os.environ.get("STRIPE_PRICE_BUNDLE", ""),
}

# Annual Stripe price IDs
STRIPE_PRICE_IDS_ANNUAL = {
    "linkedin": os.environ.get("STRIPE_PRICE_LINKEDIN_ANNUAL", ""),
    "youtube": os.environ.get("STRIPE_PRICE_YOUTUBE_ANNUAL", ""),
    "gmail": os.environ.get("STRIPE_PRICE_GMAIL_ANNUAL", ""),
    "jobs": os.environ.get("STRIPE_PRICE_JOBS_ANNUAL", ""),
    "reviews": os.environ.get("STRIPE_PRICE_REVIEWS_ANNUAL", ""),
    "bundle": os.environ.get("STRIPE_PRICE_BUNDLE_ANNUAL", ""),
}

# Legacy fallback (used if individual prices aren't set yet)
STRIPE_PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

MODEL_FAST = "claude-haiku-4-5-20251001"
MODEL_SMART = "claude-sonnet-4-20250514"

FREE_DAILY_LIMITS = {
    "linkedin": 3,
    "youtube": 5,
    "gmail": 3,
    "jobs": 3,
    "reviews": 3,
}
