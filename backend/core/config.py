import os

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
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
# Legacy fallback (used if individual prices aren't set yet)
STRIPE_PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",")

MODEL_FAST = "claude-haiku-4-5-20251001"
MODEL_SMART = "claude-sonnet-4-20250514"

FREE_DAILY_LIMITS = {
    "linkedin": 3,
    "youtube": 5,
    "gmail": 3,
    "jobs": 3,
    "reviews": 3,
}
