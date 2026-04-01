import os

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID = os.environ.get("STRIPE_PRICE_ID", "")
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "").split(",")

MODEL_FAST = "claude-haiku-4-5-20251001"
MODEL_SMART = "claude-sonnet-4-20250514"

FREE_DAILY_LIMITS = {
    "linkedin": 3,
    "youtube": 5,
    "gmail": 3,
    "jobs": 3,
    "reviews": 50,  # Shows as "unlimited" to users but capped at 50/day to prevent API abuse
}
