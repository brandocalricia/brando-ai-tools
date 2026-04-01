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
- Update Supabase schema for multi-extension usage tracking + per-extension plans
- Test all 5 extensions locally
- Publish extensions to Chrome Web Store
- Create 6 Stripe products (5 individual + 1 bundle)
- Switch Stripe to live mode
- Set Anthropic API spending limits

---

## PRICING MODEL

| Plan | Price | What it unlocks |
|------|-------|-----------------|
| Free | $0 | 3 generations/day per extension (YouTube gets 5/day) |
| Individual Pro | $3.99/mo each | Unlimited for that one extension only |
| Bundle Pro | $14.99/mo | Unlimited across all 5 extensions |

**How the plan field works in the database:**
- `"free"` — no paid subscriptions
- `"pro"` — bundle subscriber, everything unlocked
- `"linkedin"` — only LinkedIn Pro purchased
- `"linkedin,youtube"` — two individual extensions purchased (comma-separated)
- If a user buys all 5 individually, it auto-upgrades to `"pro"`

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
- ✅ Daily generation caps on all extensions (3/day free, including Shopping)
- ✅ max_tokens capped on all Claude API calls (prevents runaway costs)
- ✅ Per-extension Pro checks (buying LinkedIn Pro doesn't unlock YouTube)

### 1c. Things to NEVER do
- NEVER commit `.env` files or API keys to GitHub
- NEVER put your Supabase service key in extension code (it's server-side only)
- NEVER use `allow_origins=["*"]` in production CORS
- NEVER disable webhook signature verification

---

## PHASE 2: UPDATE SUPABASE SCHEMA

Your existing Supabase tables need updates for multi-extension usage tracking and per-extension plans.

### 2a. Run Schema Migration
1. Go to **Supabase** → **SQL Editor**
2. Run this query:

```sql
-- Add extension column to usage table
ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS extension text NOT NULL DEFAULT 'linkedin';

-- Drop old unique constraint and add new one
ALTER TABLE public.usage DROP CONSTRAINT IF EXISTS usage_user_id_date_key;
ALTER TABLE public.usage ADD CONSTRAINT usage_user_id_date_extension_key UNIQUE (user_id, date, extension);

-- Remove old plan CHECK constraint so plan can store comma-separated extension names
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_check;
```

3. Verify: go to **Table Editor** → **usage** — you should see the new `extension` column
4. Verify: go to **Table Editor** → **users** — the `plan` column should accept any text value now

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

| Variable | Value | Notes |
|----------|-------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | |
| `SUPABASE_URL` | `https://your-project.supabase.co` | |
| `SUPABASE_SERVICE_KEY` | `eyJhbGci...` (long key) | |
| `STRIPE_SECRET_KEY` | `sk_test_...` (test for now, live later) | |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | |
| `STRIPE_PRICE_ID` | `price_...` | Legacy fallback, optional if individual prices set |
| `STRIPE_PRICE_LINKEDIN` | `price_...` | Stripe price for LinkedIn Pro ($3.99/mo) |
| `STRIPE_PRICE_YOUTUBE` | `price_...` | Stripe price for YouTube Pro ($3.99/mo) |
| `STRIPE_PRICE_GMAIL` | `price_...` | Stripe price for Gmail Pro ($3.99/mo) |
| `STRIPE_PRICE_JOBS` | `price_...` | Stripe price for Job Search Pro ($3.99/mo) |
| `STRIPE_PRICE_REVIEWS` | `price_...` | Stripe price for Shopping Pro ($3.99/mo) |
| `STRIPE_PRICE_BUNDLE` | `price_...` | Stripe price for Bundle Pro ($14.99/mo) |
| `STRIPE_SUCCESS_URL` | `https://your-landing-page.com` | Where users go after payment |
| `STRIPE_CANCEL_URL` | `https://your-landing-page.com` | Where users go if they cancel |
| `ALLOWED_ORIGINS` | See 3b below | |

**Note:** You don't need all 6 Stripe prices right away. The backend falls back to `STRIPE_PRICE_ID` if an individual price isn't set. Set them up properly in Phase 6 when you switch to live mode.

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
$env:STRIPE_PRICE_LINKEDIN="price_your-linkedin-id"
$env:STRIPE_PRICE_YOUTUBE="price_your-youtube-id"
$env:STRIPE_PRICE_GMAIL="price_your-gmail-id"
$env:STRIPE_PRICE_JOBS="price_your-jobs-id"
$env:STRIPE_PRICE_REVIEWS="price_your-reviews-id"
$env:STRIPE_PRICE_BUNDLE="price_your-bundle-id"
$env:ALLOWED_ORIGINS="*"

# Or Windows CMD:
set ANTHROPIC_API_KEY=sk-ant-your-key
# ... etc

uvicorn main:app --reload --port 8000
```

**Note:** For local testing, you can set `ALLOWED_ORIGINS=*` and use a single `STRIPE_PRICE_ID` for all extensions. The per-extension prices only matter in production.

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
5. Verify "Upgrade LinkedIn Pro — $3.99/mo" button appears when limit hit
6. Verify "Get all 5 Brando tools — $14.99/mo" bundle button appears too
7. Verify upgrade button opens Stripe checkout

**YouTube:**
1. Go to any YouTube video
2. Click the Brando for YouTube extension
3. The video URL should auto-fill
4. Click Summarize
5. Verify you get a summary with TL;DR, takeaways, timestamps
6. Verify usage badge and upgrade buttons work

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
1. Go to an Amazon product page with reviews
2. Click the Brando for Shopping extension
3. Click Summarize reviews
4. Verify pros/cons/verdict output
5. Verify usage badge shows 3/3 (not "FREE" or unlimited)

### 4d. Test the Upgrade Flow
For each extension:
1. Use up all 3 free generations
2. Verify the upgrade prompt appears with TWO buttons:
   - **"Upgrade [Extension] Pro — $3.99/mo"** (filled button, individual)
   - **"Get all 5 Brando tools — $14.99/mo"** (outlined button, bundle)
3. Click the individual button → verify Stripe checkout opens for that extension
4. Click the bundle button → verify Stripe checkout opens for the bundle
5. After paying, verify only the correct extension(s) unlock:
   - Individual purchase: only that extension shows "Pro"
   - Bundle purchase: all 5 extensions show "Pro"

### 4e. Test Per-Extension Pro Logic
1. Create a test user
2. Purchase LinkedIn Pro only (via test mode)
3. Verify:
   - LinkedIn shows "Pro" badge and unlimited usage
   - YouTube still shows "3/5 left" and upgrade prompt
   - Gmail still shows "3/3 left" and upgrade prompt
4. Now purchase YouTube Pro for the same user
5. Verify:
   - LinkedIn: still Pro
   - YouTube: now Pro
   - Gmail: still free
6. The `plan` field in Supabase should now show `linkedin,youtube`

### 4f. Common Issues & Fixes

| Problem | Fix |
|---------|-----|
| "Failed to connect to server" | Make sure `uvicorn` is running on port 8000 |
| "Invalid or expired token" | Log out and log back in |
| 401 on every request | Check that `ALLOWED_ORIGINS` includes `*` for local testing |
| YouTube "Could not retrieve transcript" | That video has no captions. Try a different video |
| Gmail content script not showing | Refresh Gmail after loading the extension |
| Extension icon not appearing | Click the puzzle piece icon in Chrome toolbar and pin it |
| Import errors when starting uvicorn | Make sure you're in the `backend/` directory and venv is activated |
| "Payment not configured for this extension" | Set the `STRIPE_PRICE_*` env var for that extension, or set `STRIPE_PRICE_ID` as fallback |
| Upgrade button does nothing | Check browser console for errors. Make sure checkout endpoint gets `Content-Type: application/json` |
| User has Pro but extension shows Free | The extension might be checking the wrong field. Check browser console for the `/auth/me` response — should have `pro_extensions.{ext}: true` |

---

## PHASE 5: PUBLISH TO CHROME WEB STORE

### 5a. Current Status
- LinkedIn extension: draft saved, waiting on CWS developer verification
- Other 4 extensions: not yet submitted

### 5b. Submission Order (recommended)
1. **LinkedIn** — already drafted, submit as soon as verification clears
2. **YouTube** — submit next (simple, high demand)
3. **Shopping** — submit next (3 free/day, good funnel to paid)
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
- Payments: "Contains in-app purchases" (all extensions now have paid upgrades)

### 5e. After Each Extension Is Approved
1. Copy the extension ID from the CWS listing URL
2. Add `chrome-extension://NEW_ID` to `ALLOWED_ORIGINS` in Railway (comma-separated)
3. Update the cross-promotion links in all other extensions' popup.html with the real CWS URLs

---

## PHASE 6: SET UP STRIPE PRODUCTS (TEST MODE FIRST, THEN LIVE)

### 6a. Create Test Products First
While still in Stripe **Test mode**, create all 6 products to test the flow:

1. Go to Stripe → **Product catalog** → **Add product** (repeat 6 times):

| Product Name | Price | Billing | Env Var |
|-------------|-------|---------|---------|
| Brando LinkedIn Pro | $3.99/month | Recurring | `STRIPE_PRICE_LINKEDIN` |
| Brando YouTube Pro | $3.99/month | Recurring | `STRIPE_PRICE_YOUTUBE` |
| Brando Gmail Pro | $3.99/month | Recurring | `STRIPE_PRICE_GMAIL` |
| Brando Job Search Pro | $3.99/month | Recurring | `STRIPE_PRICE_JOBS` |
| Brando Shopping Pro | $3.99/month | Recurring | `STRIPE_PRICE_REVIEWS` |
| Brando Pro Bundle (All 5) | $14.99/month | Recurring | `STRIPE_PRICE_BUNDLE` |

2. For each product, copy the `price_...` ID
3. Set all 6 as env vars in Railway (or locally for testing)

### 6b. Test Payment Flows in Test Mode
Use Stripe's test card `4242 4242 4242 4242` (any future expiry, any CVC):

1. **Test individual purchase:**
   - Hit limit on LinkedIn → click "Upgrade LinkedIn Pro — $3.99/mo"
   - Complete checkout with test card
   - Verify webhook fires in Stripe → Developers → Webhooks → Recent deliveries
   - Verify Supabase `users.plan` = `"linkedin"`
   - Verify LinkedIn extension shows "Pro" badge
   - Verify YouTube extension still shows free usage

2. **Test bundle purchase:**
   - From any extension, click "Get all 5 Brando tools — $14.99/mo"
   - Complete checkout
   - Verify Supabase `users.plan` = `"pro"`
   - Verify ALL 5 extensions show "Pro" badge

3. **Test cancellation:**
   - Go to Stripe → Customers → find the test user → cancel subscription
   - Verify the webhook fires
   - Verify Supabase `users.plan` reverts to `"free"` (for bundle) or removes that extension (for individual)
   - Verify the extension goes back to free with usage limits

### 6c. Switch to Live Mode
Do this ONLY after at least one extension is live on the Chrome Web Store:

1. In Stripe, toggle **Live mode** ON (top-right switch)
2. Repeat Step 6a — create the same 6 products in Live mode
3. Create live webhook:
   - Stripe → Developers → Webhooks → **Add endpoint**
   - URL: `https://YOUR-RAILWAY-URL/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the signing secret (`whsec_...`)
4. Get live API key: Stripe → Developers → API keys → copy `sk_live_...`

### 6d. Update Railway Variables for Live Mode
Update these variables in Railway:

| Variable | Old (test) | New (live) |
|----------|-----------|------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test) | `whsec_...` (live) |
| `STRIPE_PRICE_LINKEDIN` | `price_...` (test) | `price_...` (live) |
| `STRIPE_PRICE_YOUTUBE` | `price_...` (test) | `price_...` (live) |
| `STRIPE_PRICE_GMAIL` | `price_...` (test) | `price_...` (live) |
| `STRIPE_PRICE_JOBS` | `price_...` (test) | `price_...` (live) |
| `STRIPE_PRICE_REVIEWS` | `price_...` (test) | `price_...` (live) |
| `STRIPE_PRICE_BUNDLE` | `price_...` (test) | `price_...` (live) |

Railway auto-redeploys. Live payments are now active.

### 6e. Test a Real Payment
1. Use a real card to subscribe to one extension's Pro ($3.99)
2. Verify the webhook fires (Stripe → Developers → Webhooks → recent deliveries)
3. Verify Supabase `users.plan` shows the extension name (e.g. `"linkedin"`)
4. Verify the extension shows "Pro"
5. Verify other extensions still show free
6. Cancel the subscription and verify it goes back to `"free"`
7. Refund yourself in Stripe

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
- Single-extension Pro user at $3.99/month: even if they do 100 generations/day, that's $3/month in API costs = **$1/month profit**
- Bundle Pro user at $14.99/month: even across all 5 tools, API costs stay under $5/month = **$10/month profit per bundle user**
- You need **1 bundle Pro user to cover your Railway costs** ($5/month)
- At **150 bundle Pro users**, you're at $1,500/month profit
- At **500 bundle Pro users**, you're at $5,000/month profit

### 7e. Revenue Scenarios

| Scenario | Individual Pro users | Bundle Pro users | Monthly Revenue | Monthly API Cost | Profit |
|----------|---------------------|-----------------|-----------------|-----------------|--------|
| Just starting | 10 | 2 | $69.88 | ~$5 | ~$60 |
| Growing | 50 | 20 | $498.50 | ~$30 | ~$463 |
| Sustainable | 100 | 100 | $1,898 | ~$100 | ~$1,793 |
| Goal | 200 | 500 | $8,298 | ~$400 | ~$7,893 |

### 7f. Emergency: If Your API Costs Spike
1. Check Anthropic dashboard for unusual usage
2. Check Railway logs for the source
3. If needed: set `ALLOWED_ORIGINS` to just your verified extension IDs (blocks unauthorized callers)
4. Nuclear option: rotate your `ANTHROPIC_API_KEY` on console.anthropic.com — old key immediately stops working

---

## PHASE 8: LAUNCH CHECKLIST

### Before first extension goes live:
- [ ] Anthropic spending limit set ($20/month)
- [ ] Supabase schema updated with `extension` column + plan constraint removed
- [ ] New backend deployed to Railway
- [ ] `/health` endpoint returns OK
- [ ] Stripe webhook URL updated (if Railway URL changed)
- [ ] All env vars set in Railway (including 6 Stripe price IDs)
- [ ] `ALLOWED_ORIGINS` includes your extension IDs
- [ ] Landing page rebranded to "Brando" on bolt.new
- [ ] Landing page shows correct pricing ($3.99/mo individual, $14.99/mo bundle)
- [ ] Privacy policy page accessible at /privacy

### For each extension before publishing:
- [ ] `API_BASE` in popup.js changed to Railway URL
- [ ] `host_permissions` in manifest.json includes Railway URL
- [ ] Extension tested locally (auth, generate, usage limits, both upgrade buttons)
- [ ] Verified individual Pro button opens checkout for that extension only
- [ ] Verified bundle button opens checkout for the bundle
- [ ] Custom icons created (16, 48, 128 px)
- [ ] Screenshots taken (1280x800 or 640x400)
- [ ] Extension zipped (manifest.json at zip root)
- [ ] CWS listing filled out (description, privacy, permissions)
- [ ] Test account created for CWS reviewer
- [ ] Payments marked as "Contains in-app purchases"

### After each extension is approved:
- [ ] Extension ID added to `ALLOWED_ORIGINS` in Railway
- [ ] Cross-promotion links updated in other extensions with real CWS URLs
- [ ] Landing page updated with CWS install link

### Before going live with real payments:
- [ ] All 6 Stripe test products created and tested
- [ ] Individual purchase tested (correct extension unlocked, others stay free)
- [ ] Bundle purchase tested (all extensions unlocked)
- [ ] Cancellation tested (correct extension removed, or all removed for bundle)
- [ ] Stripe switched to Live mode
- [ ] All 6 live products created with correct prices
- [ ] Live webhook created with correct URL and events
- [ ] All Stripe env vars updated in Railway with live values
- [ ] Real payment tested end-to-end
- [ ] Real cancellation tested end-to-end

---

## QUICK REFERENCE: WHAT TO DO RIGHT NOW

In order:
1. **Set Anthropic spending limit** → console.anthropic.com → $20/month
2. **Run Supabase migration** → add `extension` column + remove plan constraint
3. **Create 6 Stripe test products** → 5 individual ($3.99) + 1 bundle ($14.99)
4. **Deploy new backend** → update Railway to use brando-ai-tools repo, set all env vars
5. **Test LinkedIn extension** → verify it works with new backend, test both upgrade buttons
6. **Test all other extensions locally** → YouTube, Gmail, Jobs, Shopping
7. **Test payment flows** → individual purchase, bundle purchase, cancellation
8. **Rebrand landing page** → paste the Bolt AI prompt (show $3.99/mo + $14.99/mo pricing)
9. **Wait for CWS verification** → then submit LinkedIn extension
10. **Submit remaining extensions** → YouTube, Shopping, Gmail, Jobs
11. **Switch Stripe to live** → after first extension is approved
12. **Start making money**

---

## QUICK REFERENCE: STRIPE ENV VARS

```
STRIPE_SECRET_KEY=sk_test_xxx        # or sk_live_xxx in production
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_LINKEDIN=price_xxx      # $3.99/mo individual
STRIPE_PRICE_YOUTUBE=price_xxx       # $3.99/mo individual
STRIPE_PRICE_GMAIL=price_xxx         # $3.99/mo individual
STRIPE_PRICE_JOBS=price_xxx          # $3.99/mo individual
STRIPE_PRICE_REVIEWS=price_xxx       # $3.99/mo individual
STRIPE_PRICE_BUNDLE=price_xxx        # $14.99/mo all 5
STRIPE_PRICE_ID=price_xxx            # legacy fallback (optional)
```

---

## QUICK REFERENCE: HOW THE PAYMENT FLOW WORKS

```
User clicks "Upgrade LinkedIn Pro — $3.99/mo"
  → Extension sends POST /create-checkout-session { extension: "linkedin" }
  → Backend looks up STRIPE_PRICE_LINKEDIN env var
  → Creates Stripe checkout session with metadata: { user_id, extension: "linkedin" }
  → User completes payment on Stripe

Stripe fires webhook → POST /webhook
  → Event: checkout.session.completed
  → Backend reads metadata.extension = "linkedin"
  → Updates users.plan from "free" to "linkedin"
  → Extension checks /auth/me → pro_extensions.linkedin = true → shows "Pro"

User clicks "Get all 5 Brando tools — $14.99/mo"
  → Same flow but extension = "bundle"
  → Backend sets users.plan = "pro"
  → All extensions see pro_extensions.* = true → all show "Pro"

User who already has "linkedin" buys "youtube":
  → Backend merges: plan = "linkedin,youtube"
  → LinkedIn and YouTube show Pro, others stay free

User who already has 4 extensions buys the 5th:
  → Backend auto-upgrades: plan = "pro" (full bundle equivalent)

User cancels LinkedIn subscription:
  → Webhook fires with subscription.deleted
  → Backend removes "linkedin" from plan
  → plan goes from "linkedin,youtube" to "youtube"
  → LinkedIn goes back to free, YouTube stays Pro

User cancels bundle:
  → Backend sets plan = "free"
  → All extensions go back to free
```
