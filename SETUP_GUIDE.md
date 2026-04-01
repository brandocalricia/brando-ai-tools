# Brando AI Tools — Full Setup & Launch Guide

Everything you need to get all 5 extensions working, tested, secured, and making money.

**What you already have working:**
- LinkedIn extension tested and working (on old standalone repo)
- Supabase project with users + usage tables
- Stripe account with test keys
- Railway deployment (for old linkedin-post-gen)
- Chrome Web Store developer account (verification pending)
- Landing page on bolt.host

**What still needs to be done:**
- Deploy the new monorepo backend to Railway
- Update Supabase schema for multi-extension usage tracking
- Test all 5 extensions locally
- Publish extensions to Chrome Web Store
- Switch Stripe to live mode
- Set Anthropic API spending limits

---

## COST BREAKDOWN

| Service | Cost | Notes |
|---------|------|-------|
| Anthropic API | $5 minimum (already paid) | Haiku is ~$0.001 per generation. $5 lasts thousands of requests |
| Railway | $5/month (already paying) | One backend serves all 5 extensions |
| Chrome Web Store | $5 one-time (already paid) | Publish unlimited extensions |
| Stripe | Free until you earn | 2.9% + $0.30 per transaction |
| Supabase | Free | Free tier covers this easily |
| Landing page | Free | Bolt + Netlify |

**Monthly overhead: $5** (just Railway). Everything else is free or already paid.

---

## PHASE 1: SECURITY HARDENING (do this FIRST)

### 1a. Set Anthropic API Spending Limit (CRITICAL — protects your money)
1. Go to **https://console.anthropic.com**
2. Click **Settings** → **Limits**
3. Set **Monthly spending limit** to **$20**
4. This means even if someone abuses your API, max damage is $20/month
5. As revenue grows, increase this gradually ($50, $100, etc.)
6. With Haiku at ~$0.001 per generation, $20 covers ~20,000 generations

### 1b. Verify Backend Security (already done in code)
The backend already has these protections:
- ✅ All endpoints require auth (JWT token from Supabase)
- ✅ CORS locked to specific extension IDs only
- ✅ Input length limits on all text fields
- ✅ Server-side usage enforcement (can't bypass by modifying extension)
- ✅ Stripe webhook signature verification
- ✅ Docs/Swagger UI disabled in production
- ✅ Rate limiting: 60 requests/minute per IP
- ✅ Daily generation caps even on "unlimited" extensions (anti-abuse)
- ✅ max_tokens capped on all Claude API calls (prevents runaway costs)

### 1c. Things to NEVER do
- NEVER commit `.env` files or API keys to GitHub
- NEVER put your Supabase service key in extension code (it's server-side only)
- NEVER use `allow_origins=["*"]` in production CORS
- NEVER disable webhook signature verification

---

## PHASE 2: UPDATE SUPABASE SCHEMA

Your existing Supabase `usage` table needs an `extension` column for multi-extension tracking.

### 2a. Run Schema Migration
1. Go to **Supabase** → **SQL Editor**
2. Run this query:

```sql
-- Add extension column to usage table
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS extension text NOT NULL DEFAULT 'linkedin';

-- Drop old unique constraint and add new one
ALTER TABLE public.usage DROP CONSTRAINT IF EXISTS usage_user_id_date_key;
ALTER TABLE public.usage ADD CONSTRAINT usage_user_id_date_extension_key UNIQUE (user_id, date, extension);
```

3. Verify: go to **Table Editor** → **usage** — you should see the new `extension` column

---

## PHASE 3: DEPLOY NEW BACKEND TO RAILWAY

You have two options: update the existing Railway project or create a new one.

### Option A: Update Existing Railway Project (recommended)
1. Go to Railway → your `linkedin-post-gen` service → **Settings**
2. Change **Source Repo** to `brandocalricia/brando-ai-tools`
3. Keep **Root Directory** as `backend`
4. Railway will auto-deploy

### Option B: Create New Railway Project
1. Railway → **New Project** → **Deploy from GitHub Repo** → select `brando-ai-tools`
2. Set **Root Directory** to `backend`
3. Add all environment variables (same as before — see Phase 3b)
4. Generate a public domain

### 3a. Verify Environment Variables
Go to Railway → Variables and make sure ALL of these are set:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SUPABASE_URL` | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` (long key) |
| `STRIPE_SECRET_KEY` | `sk_test_...` (test for now, live later) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_ID` | `price_...` |
| `STRIPE_SUCCESS_URL` | `https://linkedin-post-generator-landing.bolt.host` |
| `STRIPE_CANCEL_URL` | `https://linkedin-post-generator-landing.bolt.host` |
| `ALLOWED_ORIGINS` | See 3b below |

### 3b. Set ALLOWED_ORIGINS
This is a comma-separated list of extension IDs. For now, you only have the LinkedIn extension ID. As you publish more extensions, add their IDs here.

Format: `chrome-extension://ID1,chrome-extension://ID2,chrome-extension://ID3`

For now: `chrome-extension://ggcgoadbnnclgdibigejighpdafgfpdo`

After publishing each new extension, add its ID.

### 3c. Verify Deployment
Open browser: `https://YOUR-RAILWAY-URL/health`
Should see: `{"status":"ok","timestamp":"..."}`

Test the LinkedIn endpoint:
```
curl -X POST https://YOUR-RAILWAY-URL/api/linkedin/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"type":"post","topic":"test","tone":"casual","length":"short"}'
```

### 3d. Update Stripe Webhook URL (if you changed Railway projects)
1. Go to Stripe → Developers → Webhooks
2. Update the endpoint URL to your new Railway URL: `https://YOUR-RAILWAY-URL/webhook`
3. If you created a new webhook, copy the signing secret and update `STRIPE_WEBHOOK_SECRET` in Railway

---

## PHASE 4: TEST EACH EXTENSION LOCALLY

### 4a. Start the Backend Locally
```bash
cd "C:\Users\bzcni\OneDrive\Desktop\vs code projects\brando-ai-tools\backend"
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Set environment variables (Windows PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-your-key"
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_KEY="your-service-key"
$env:STRIPE_SECRET_KEY="sk_test_your-key"
$env:STRIPE_WEBHOOK_SECRET="whsec_your-key"
$env:STRIPE_PRICE_ID="price_your-id"
$env:ALLOWED_ORIGINS="*"

# Or Windows CMD:
set ANTHROPIC_API_KEY=sk-ant-your-key
# ... etc

uvicorn main:app --reload --port 8000
```

### 4b. Load Extensions in Chrome
1. Open `chrome://extensions`
2. Toggle **Developer mode** ON (top right)
3. Click **Load unpacked**
4. Select `extensions/linkedin/` → test it
5. Repeat for `extensions/youtube/`, `extensions/gmail/`, `extensions/jobs/`, `extensions/reviews/`

**Important:** You can have all 5 loaded at once. Each has its own manifest and runs independently.

### 4c. Test Each Extension

**LinkedIn (you already tested this):**
1. Click extension → sign up or log in
2. Type a topic → Generate post
3. Try Smart reply tab
4. Verify usage badge counts down (3/3, 2/3, 1/3)
5. Verify upgrade button opens Stripe checkout

**YouTube:**
1. Go to any YouTube video
2. Click the Brando for YouTube extension
3. The video URL should auto-fill
4. Click Summarize
5. Verify you get a summary with TL;DR, takeaways, timestamps

**Gmail:**
1. Go to Gmail and compose a new email
2. Click the Brando for Gmail extension
3. Rewrite tab: paste text, pick tone, click Rewrite
4. Compose tab: describe what you want, click Compose
5. Verify output looks good

**Job Search:**
1. Go to a LinkedIn job listing, Indeed, or Glassdoor
2. Click the Brando for Job Search extension
3. Paste job text → Analyze
4. Try Match me tab with a resume
5. Verify analysis output

**Shopping:**
1. Go to an Amazon product page
2. Click the Brando for Shopping extension
3. Click Summarize reviews
4. Verify pros/cons/verdict output

### 4d. Common Issues & Fixes

| Problem | Fix |
|---------|-----|
| "Failed to connect to server" | Make sure `uvicorn` is running on port 8000 |
| "Invalid or expired token" | Log out and log back in |
| 401 on every request | Check that `ALLOWED_ORIGINS` includes `*` for local testing |
| YouTube "Could not retrieve transcript" | That video has no captions. Try a different video |
| Gmail content script not showing | Refresh Gmail after loading the extension |
| Extension icon not appearing | Click the puzzle piece icon in Chrome toolbar and pin it |
| Import errors when starting uvicorn | Make sure you're in the `backend/` directory and venv is activated |

---

## PHASE 5: PUBLISH TO CHROME WEB STORE

### 5a. Current Status
- LinkedIn extension: draft saved, waiting on CWS developer verification
- Other 4 extensions: not yet submitted

### 5b. Submission Order (recommended)
1. **LinkedIn** — already drafted, submit as soon as verification clears
2. **YouTube** — submit next (simple, high demand)
3. **Shopping** — submit next (free = fastest growth, funnels to paid)
4. **Gmail** — submit after YouTube/Shopping are live
5. **Job Search** — submit last (most complex)

### 5c. Before Submitting Each Extension

For each extension, you need to:

1. **Update `API_BASE` in popup.js** — change from `http://localhost:8000` to your Railway URL
2. **Update `host_permissions` in manifest.json** — add your Railway URL
3. **Update `ALLOWED_ORIGINS` in Railway** — add the new extension's ID after publishing

Example for YouTube popup.js line 1:
```js
const API_BASE = "https://YOUR-RAILWAY-URL";
```

Example for YouTube manifest.json:
```json
"host_permissions": [
  "https://www.youtube.com/*",
  "https://YOUR-RAILWAY-URL/*"
]
```

3. **Create icons** — each extension needs its own icon16.png, icon48.png, icon128.png
4. **Take screenshots** — 1280x800 or 640x400
5. **Zip the extension** — make sure manifest.json is at the zip root

### 5d. Chrome Web Store Listing Info for Each Extension

**Brando for LinkedIn:**
- Already drafted — just submit when verified

**Brando for YouTube:**
- Category: Tools
- Short description: "Summarize any YouTube video in seconds. Get key takeaways, timestamps, and a TL;DR."
- Single purpose: "Summarizes YouTube video transcripts using AI."
- Permissions justification: "activeTab is used to detect YouTube video URLs. Storage saves auth tokens."
- Host permission justification: "Host permission for youtube.com detects the current video URL. Host permission for the API domain sends requests to our backend."

**Brando for Gmail:**
- Category: Productivity
- Short description: "Rewrite emails, adjust tone, or compose from scratch with AI. Works right inside Gmail."
- Single purpose: "Rewrites and composes emails using AI."
- Host permission justification: "Host permission for mail.google.com injects a rewrite button in compose windows. Host permission for the API domain sends requests to our backend."

**Brando for Job Search:**
- Category: Tools
- Short description: "Analyze any job listing with AI. Extract key skills, estimate salary, and see how well you match."
- Single purpose: "Analyzes job listings and matches resumes using AI."
- Host permission justification: "Host permissions for LinkedIn Jobs, Indeed, and Glassdoor inject an analyze button on job listings. Host permission for the API domain sends requests to our backend."

**Brando for Shopping:**
- Category: Shopping
- Short description: "AI-powered review summaries for any product. See pros, cons, and a buy/skip verdict in seconds."
- Single purpose: "Summarizes product reviews using AI."
- Host permission justification: "Host permissions for Amazon, Best Buy, and Walmart scrape visible reviews from product pages. Host permission for the API domain sends requests to our backend."

**For ALL extensions:**
- Privacy policy URL: `https://linkedin-post-generator-landing.bolt.host/privacy`
- Homepage URL: `https://linkedin-post-generator-landing.bolt.host`
- Data usage: check "Personally identifiable information" and "Authentication information"
- Check all 3 certification boxes
- Distribution: Public, all regions
- Payments: "Contains in-app purchases" (except Shopping — use "Free of charge")

### 5e. After Each Extension Is Approved
1. Copy the extension ID from the CWS listing URL
2. Add `chrome-extension://NEW_ID` to `ALLOWED_ORIGINS` in Railway (comma-separated)
3. Update the cross-promotion links in all other extensions' popup.html with the real CWS URLs

---

## PHASE 6: SWITCH STRIPE TO LIVE MODE

Do this ONLY after at least the LinkedIn extension is live on the Chrome Web Store.

### 6a. Create Live Product
1. In Stripe, toggle **Live mode** ON (top-right switch)
2. Go to **Product catalog** → **Add product**
3. Name: `Brando Pro`
4. Price: `$14.99/month` (or $7.99 if you want to keep individual extension pricing for now)
5. Copy the new `price_...` ID

### 6b. Create Live Webhook
1. Stripe → Developers → Webhooks → **Add endpoint**
2. URL: `https://YOUR-RAILWAY-URL/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy the signing secret (`whsec_...`)

### 6c. Get Live API Key
1. Stripe → Developers → API keys (in Live mode)
2. Copy the secret key (`sk_live_...`)

### 6d. Update Railway Variables
Update these 3 variables in Railway:
- `STRIPE_SECRET_KEY` → `sk_live_...`
- `STRIPE_WEBHOOK_SECRET` → new live `whsec_...`
- `STRIPE_PRICE_ID` → new live `price_...`

Railway auto-redeploys. Live payments are now active.

### 6e. Test a Real Payment
1. Use a real card to subscribe to Pro
2. Verify the webhook fires (Stripe → Developers → Webhooks → recent deliveries)
3. Verify your Supabase `users` table shows `plan = "pro"`
4. Verify the extension shows "Pro"
5. Cancel the subscription in Stripe and verify it goes back to "Free"

---

## PHASE 7: MONITOR & PROTECT YOUR MONEY

### 7a. Set Up Anthropic Alerts
1. Go to **console.anthropic.com** → **Settings** → **Limits**
2. Set monthly limit to **$20** (increase as needed)
3. Check usage daily for the first week after launch

### 7b. Monitor Stripe Dashboard
1. Check Stripe dashboard weekly for revenue
2. Watch for failed payments and disputes
3. Set up Stripe email notifications for payouts

### 7c. Monitor Railway Logs
1. Railway → your service → **Logs**
2. Watch for unusual error patterns or high request volumes
3. If you see thousands of requests from one IP, that's abuse — the rate limiter should catch it

### 7d. Cost Per User Math
- Claude Haiku: ~$0.001 per generation (less than a tenth of a cent)
- Free user: 3 generations/day × 30 days = 90 generations/month = **$0.09/month** per active free user
- Pro user at $7.99/month: even if they do 100 generations/day, that's $3/month in API costs = **$5/month profit per Pro user**
- You need **1 Pro user to cover your Railway costs** ($5/month)
- At **650 Pro users**, you hit your $5,200/month goal

### 7e. Emergency: If Your API Costs Spike
1. Check Anthropic dashboard for unusual usage
2. Check Railway logs for the source
3. If needed: set `ALLOWED_ORIGINS` to just your verified extension IDs (blocks unauthorized callers)
4. Nuclear option: rotate your `ANTHROPIC_API_KEY` on console.anthropic.com — old key immediately stops working

---

## PHASE 8: LAUNCH CHECKLIST

### Before first extension goes live:
- [ ] Anthropic spending limit set ($20/month)
- [ ] Supabase schema updated with `extension` column
- [ ] New backend deployed to Railway
- [ ] `/health` endpoint returns OK
- [ ] Stripe webhook URL updated (if Railway URL changed)
- [ ] All env vars set in Railway
- [ ] `ALLOWED_ORIGINS` includes your extension IDs
- [ ] Landing page rebranded to "Brando" on bolt.new
- [ ] Privacy policy page accessible at /privacy

### For each extension before publishing:
- [ ] `API_BASE` in popup.js changed to Railway URL
- [ ] `host_permissions` in manifest.json includes Railway URL
- [ ] Extension tested locally (auth, generate, upgrade)
- [ ] Custom icons created (16, 48, 128 px)
- [ ] Screenshots taken (1280x800 or 640x400)
- [ ] Extension zipped (manifest.json at zip root)
- [ ] CWS listing filled out (description, privacy, permissions)
- [ ] Test account created for CWS reviewer

### After each extension is approved:
- [ ] Extension ID added to `ALLOWED_ORIGINS` in Railway
- [ ] Cross-promotion links updated in other extensions
- [ ] Landing page updated with CWS install link

### Before going live with real payments:
- [ ] Stripe switched to Live mode
- [ ] New product created in Live mode
- [ ] New webhook created in Live mode
- [ ] 3 Railway vars updated (key, webhook secret, price ID)
- [ ] Real payment tested end-to-end
- [ ] Cancellation tested end-to-end

---

## QUICK REFERENCE: WHAT TO DO RIGHT NOW

In order:
1. **Set Anthropic spending limit** → console.anthropic.com → $20/month
2. **Run Supabase migration** → add `extension` column to usage table
3. **Deploy new backend** → update Railway to use brando-ai-tools repo
4. **Test LinkedIn extension** → verify it still works with new backend (API path is now `/api/linkedin/generate` instead of `/generate`)
5. **Rebrand landing page** → paste the Bolt AI prompt
6. **Wait for CWS verification** → then submit LinkedIn extension
7. **Test YouTube extension locally** → then submit to CWS
8. **Continue down the list** → Gmail, Jobs, Shopping
9. **Switch Stripe to live** → after first extension is approved
10. **Start making money**
