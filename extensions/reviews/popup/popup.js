const API_BASE = "https://brando-ai-tools-production.up.railway.app";
const FREE_DAILY_LIMIT = 3;

let accessToken = null;
let userEmail = null;
let isPro = false;
let usageToday = 0;
let lastReviews = null;
let lastProductInfo = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  setupAuthButtons();
  setupButtons();
  await checkExistingSession();
});

async function initTheme() {
  const stored = await chrome.storage.local.get(["darkMode"]);
  if (stored.darkMode) {
    document.body.classList.add("dark");
    document.getElementById("theme-toggle").textContent = "\u2600";
  }
  document.getElementById("theme-toggle").addEventListener("click", async () => {
    const isDark = document.body.classList.toggle("dark");
    document.getElementById("theme-toggle").textContent = isDark ? "\u2600" : "\u263D";
    await chrome.storage.local.set({ darkMode: isDark });
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function setupAuthButtons() {
  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("signup-btn").addEventListener("click", handleSignup);
  document.getElementById("forgot-btn").addEventListener("click", handleForgotPassword);
  document.getElementById("logout-btn").addEventListener("click", handleLogout);

  document.getElementById("auth-email").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("auth-password").focus();
  });
  document.getElementById("auth-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
}

async function checkExistingSession() {
  const stored = await chrome.storage.local.get(["accessToken", "userEmail"]);
  if (!stored.accessToken) {
    showAuthScreen();
    return;
  }
  accessToken = stored.accessToken;
  userEmail = stored.userEmail;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    isPro = data.pro_extensions?.reviews || data.plan === "pro";
    usageToday = data.usage?.reviews || 0;
    userEmail = data.email;
    showMainApp();
  } catch {
    await chrome.storage.local.remove(["accessToken", "userEmail"]);
    accessToken = null;
    showAuthScreen();
  }
}

async function handleLogin() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    showAuthError("Enter your email and password.");
    return;
  }
  setAuthLoading(true);
  hideAuthError();
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Login failed.");
    accessToken = data.access_token;
    userEmail = data.user.email;
    isPro = data.user.plan === "pro" || (data.user.plan && data.user.plan.includes("reviews"));
    usageToday = 0;
    await chrome.storage.local.set({ accessToken, userEmail });
    showMainApp();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    setAuthLoading(false);
  }
}

async function handleSignup() {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    showAuthError("Enter your email and password.");
    return;
  }
  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.");
    return;
  }
  setAuthLoading(true);
  hideAuthError();
  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Signup failed.");
    if (data.access_token) {
      accessToken = data.access_token;
      userEmail = data.user.email;
      isPro = false;
      usageToday = 0;
      await chrome.storage.local.set({ accessToken, userEmail });
      showMainApp();
    } else {
      showAuthError("Check your email to confirm your account, then log in.");
    }
  } catch (err) {
    showAuthError(err.message);
  } finally {
    setAuthLoading(false);
  }
}

async function handleLogout() {
  accessToken = null;
  userEmail = null;
  usageToday = 0;
  isPro = false;
  await chrome.storage.local.remove(["accessToken", "userEmail"]);
  showAuthScreen();
}

async function handleForgotPassword() {
  const email = document.getElementById("auth-email").value.trim();
  if (!email) {
    showAuthError("Enter your email address first.");
    return;
  }
  const btn = document.getElementById("forgot-btn");
  btn.disabled = true;
  btn.textContent = "Sending...";
  hideAuthError();
  try {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    showAuthError(data.message || "Check your email for a reset link.");
    document.getElementById("auth-error").style.color = "#2e7d32";
  } catch {
    showAuthError("Something went wrong. Try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Forgot password?";
  }
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("main-app").classList.add("hidden");
  document.getElementById("auth-email").value = "";
  document.getElementById("auth-password").value = "";
  hideAuthError();
}

async function showMainApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");
  document.getElementById("user-email").textContent = userEmail;
  updateUI();
  await loadPageContext();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideAuthError() {
  const el = document.getElementById("auth-error");
  el.classList.add("hidden");
  el.style.color = "";
}

function setAuthLoading(loading) {
  document.getElementById("login-btn").disabled = loading;
  document.getElementById("signup-btn").disabled = loading;
  document.getElementById("login-btn").textContent = loading ? "Loading..." : "Log in";
}

// ── Page context ──────────────────────────────────────────────────────────────

function isKnownShoppingSite(url) {
  const patterns = [
    { host: "amazon.com", path: /\/dp\/|\/gp\/product\// },
    { host: "amazon.co", path: /\/dp\/|\/gp\/product\// },
    { host: "bestbuy.com", path: /\/site\/|\/product\// },
    { host: "bestbuy.com", path: /\/reviews/ },
    { host: "walmart.com", path: /\/ip\// },
    { host: "target.com", path: /\/p\// },
    { host: "newegg.com", path: /\/p\/|\/Product\// },
    { host: "homedepot.com", path: /\/p\// },
    { host: "lowes.com", path: /\/pd\// },
    { host: "ebay.com", path: /\/itm\// },
  ];
  try {
    const u = new URL(url);
    return patterns.some((p) => u.hostname.includes(p.host) && p.path.test(u.pathname));
  } catch { return false; }
}

async function loadPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return showNoProduct();

    // Method 1: Try content script message
    let needsMoreReviews = false;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_REVIEWS" });
      if (response && response.product) {
        lastReviews = response.reviews || [];
        lastProductInfo = response.product;
        // If Best Buy returned few reviews, try Method 2 for more (lazy-loaded reviews)
        if (tab.url.includes("bestbuy.com") && lastReviews.length <= 5) {
          needsMoreReviews = true;
        } else {
          showProductInfo(lastProductInfo, tab.url, lastReviews.length);
          return;
        }
      }
    } catch {}

    // Method 2: Inject a scraper via chrome.scripting (works even if content script didn't load, or Best Buy needs more reviews)
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          const name =
            document.querySelector('[itemprop="name"]')?.innerText?.trim() ||
            document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
            document.getElementById("productTitle")?.innerText?.trim() ||
            document.querySelector(".sku-title h1")?.innerText?.trim() ||
            document.querySelector("h1")?.innerText?.trim() ||
            document.title;

          const reviews = [];
          const seen = new Set();

          function parseBBList(container) {
            const r = [];
            if (!container) return r;
            container.querySelectorAll(":scope > li").forEach((li) => {
              const body = li.querySelector("p[id^='ugc-line-clamp']") || li.querySelector("p.body-copy-lg");
              const ratingEl = li.querySelector("span.sr-only");
              if (body) {
                const t = body.innerText.trim().substring(0, 500);
                if (t.length > 20 && !seen.has(t)) { seen.add(t); r.push({ text: t, rating: ratingEl ? ratingEl.innerText.trim() : null }); }
              }
            });
            return r;
          }

          // Amazon reviews
          document.querySelectorAll('[data-hook="review"]').forEach((el) => {
            const body = el.querySelector('[data-hook="review-body"]');
            if (body) { const t = body.innerText.trim().substring(0, 500); if (t.length > 10 && !seen.has(t)) { seen.add(t); reviews.push({ text: t, rating: null }); } }
          });
          document.querySelectorAll('.review-text-content, [data-hook="review-collapsed"]').forEach((el) => {
            const t = el.innerText.trim().substring(0, 500); if (t.length > 20 && !seen.has(t)) { seen.add(t); reviews.push({ text: t, rating: null }); }
          });
          if (reviews.length === 0) {
            const agg = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
            const star = document.querySelector('#acrPopover .a-icon-alt, [data-hook="rating-out-of-text"]');
            if (agg) reviews.push({ text: `Overall: ${star ? star.innerText.trim() + " — " : ""}${agg.innerText.trim()}`, rating: star ? star.innerText.trim() : null });
          }
          // Best Buy reviews — try DOM first, then fetch reviews page
          if (reviews.length === 0 && location.hostname.includes("bestbuy.com")) {
            let bb = parseBBList(document.getElementById("stand-alone-review-list"));
            if (bb.length === 0) bb = parseBBList(document.getElementById("review-list"));
            if (bb.length <= 3) {
              try {
                const baseUrl = location.href.replace(/#.*$/, "").replace(/\/reviews.*$/, "");
                const resp = await fetch(baseUrl + "/reviews?pageSize=20");
                const html = await resp.text();
                const doc = new DOMParser().parseFromString(html, "text/html");
                const fetched = parseBBList(doc.getElementById("stand-alone-review-list") || doc.getElementById("review-list"));
                if (fetched.length > bb.length) bb = fetched;
              } catch {}
            }
            reviews.push(...bb);
          }
          // Generic reviews
          if (reviews.length === 0) {
            const sels = ['[itemprop="review"]', '[itemprop="reviewBody"]', '.review', '.customer-review', '.product-review', '[class*="review-text"]', '[class*="review-body"]', '[data-testid*="review"]'];
            for (const sel of sels) {
              document.querySelectorAll(sel).forEach((el) => {
                const t = (el.querySelector('[class*="body"], [class*="text"], p') || el).innerText.trim().substring(0, 500);
                if (t.length > 20 && !seen.has(t)) { seen.add(t); reviews.push({ text: t, rating: null }); }
              });
              if (reviews.length > 0) break;
            }
          }
          return { product: { name, url: location.href }, reviews };
        },
      });
      if (results && results[0]?.result?.product) {
        const data = results[0].result;
        lastReviews = data.reviews || [];
        lastProductInfo = data.product;
        showProductInfo(lastProductInfo, tab.url, lastReviews.length);
        return;
      }
    } catch {}

    // Method 3: If it's a known shopping site, show product info anyway
    if (isKnownShoppingSite(tab.url)) {
      lastReviews = [];
      lastProductInfo = { name: tab.title || "Product page", url: tab.url };
      showProductInfo(lastProductInfo, tab.url, 0);
      return;
    }

    showNoProduct();
  } catch {
    showNoProduct();
  }
}

function showProductInfo(product, url, reviewCount = 0) {
  const siteEl = document.getElementById("product-site");
  const nameEl = document.getElementById("product-name");

  let site = "Shopping site";
  try {
    const hostname = new URL(url).hostname.replace("www.", "");
    const siteMap = {
      "amazon.com": "Amazon", "bestbuy.com": "Best Buy", "walmart.com": "Walmart",
      "target.com": "Target", "newegg.com": "Newegg", "homedepot.com": "Home Depot",
      "lowes.com": "Lowe's", "ebay.com": "eBay",
    };
    for (const [domain, name] of Object.entries(siteMap)) {
      if (hostname.includes(domain)) { site = name; break; }
    }
    if (site === "Shopping site") {
      site = hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1);
    }
  } catch {}

  siteEl.textContent = site;
  nameEl.textContent = product.name || "Product detected";

  document.getElementById("product-info").classList.remove("hidden");
  document.getElementById("no-product").classList.add("hidden");

  const btn = document.getElementById("summarize-btn");
  if (reviewCount > 0) {
    btn.disabled = false;
    btn.textContent = `Summarize ${reviewCount} review${reviewCount === 1 ? "" : "s"}`;
  } else {
    btn.disabled = false;
    btn.textContent = "Summarize reviews";
  }
}

function showNoProduct() {
  document.getElementById("product-info").classList.add("hidden");
  document.getElementById("no-product").classList.remove("hidden");
  document.getElementById("summarize-btn").disabled = true;
}

// ── Summarize ─────────────────────────────────────────────────────────────────

function setupButtons() {
  document.getElementById("summarize-btn").addEventListener("click", summarizeReviews);
  document.getElementById("copy-btn").addEventListener("click", copyToClipboard);
  document.getElementById("regen-btn").addEventListener("click", summarizeReviews);
  document.getElementById("upgrade-btn")?.addEventListener("click", () => openUpgrade("reviews"));
  document.getElementById("bundle-btn")?.addEventListener("click", () => openUpgrade("bundle"));
  document.getElementById("footer-upgrade").addEventListener("click", (e) => {
    e.preventDefault();
    openUpgrade("reviews");
  });
  document.getElementById("footer-bundle").addEventListener("click", (e) => {
    e.preventDefault();
    openUpgrade("bundle");
  });
}

function canGenerate() {
  return isPro || usageToday < FREE_DAILY_LIMIT;
}

async function refreshPlanStatus() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    isPro = data.pro_extensions?.reviews || data.plan === "pro";
    usageToday = data.usage?.reviews || 0;
    updateUI();
  } catch {}
}

async function summarizeReviews() {
  if (!lastReviews || lastReviews.length === 0) {
    showError("No reviews found on this page. Try scrolling down to load reviews first, then click Summarize again.");
    return;
  }

  if (!canGenerate()) {
    showUpgradePrompt();
    return;
  }

  showLoading();
  hideOutput();
  hideError();
  hideUpgradePrompt();
  document.getElementById("summarize-btn").disabled = true;

  await refreshPlanStatus();
  if (!canGenerate()) {
    hideLoading();
    document.getElementById("summarize-btn").disabled = false;
    showUpgradePrompt();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/reviews/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        product_title: lastProductInfo?.name || "",
        reviews_text: lastReviews.map((r) => r.text || r).join("\n\n"),
        product_url: lastProductInfo?.url || "",
      }),
    });

    if (res.status === 401) {
      await handleLogout();
      return;
    }
    if (res.status === 429) {
      showUpgradePrompt();
      return;
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Something went wrong.");
    }

    const data = await res.json();
    if (data.usage_remaining >= 0) {
      usageToday = FREE_DAILY_LIMIT - data.usage_remaining;
    }
    renderSummary(data);
    updateUI();
  } catch (err) {
    showError(err.message || "Failed to connect to server.");
  } finally {
    hideLoading();
    document.getElementById("summarize-btn").disabled = false;
  }
}

function renderSummary(data) {
  // Verdict bar
  const verdictBar = document.getElementById("verdict-bar");
  const verdictLabel = document.getElementById("verdict-label");
  if (data.verdict) {
    const v = data.verdict.toLowerCase();
    verdictLabel.textContent = data.verdict;
    verdictLabel.className = "verdict-label";
    if (v.includes("buy")) verdictLabel.classList.add("verdict-buy");
    else if (v.includes("skip")) verdictLabel.classList.add("verdict-skip");
    else verdictLabel.classList.add("verdict-maybe");
    verdictBar.classList.remove("hidden");
  } else {
    verdictBar.classList.add("hidden");
  }

  // Pros
  const prosSection = document.getElementById("pros-section");
  const prosList = document.getElementById("pros-list");
  if (data.pros && data.pros.length > 0) {
    prosList.textContent = "";
    data.pros.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      prosList.appendChild(li);
    });
    prosSection.classList.remove("hidden");
  } else {
    prosSection.classList.add("hidden");
  }

  // Cons
  const consSection = document.getElementById("cons-section");
  const consList = document.getElementById("cons-list");
  if (data.cons && data.cons.length > 0) {
    consList.textContent = "";
    data.cons.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      consList.appendChild(li);
    });
    consSection.classList.remove("hidden");
  } else {
    consSection.classList.add("hidden");
  }

  // Fallback plain text
  const outputText = document.getElementById("output-text");
  if (data.summary) {
    outputText.textContent = data.summary;
    outputText.classList.remove("hidden");
  } else if (data.text) {
    outputText.textContent = data.text;
    outputText.classList.remove("hidden");
  } else {
    outputText.classList.add("hidden");
  }

  document.getElementById("output-area").classList.remove("hidden");
}

function copyToClipboard() {
  const parts = [];
  const verdict = document.getElementById("verdict-label").textContent;
  if (verdict) parts.push(`Verdict: ${verdict}`);

  const pros = [...document.querySelectorAll("#pros-list li")].map((li) => `+ ${li.textContent}`);
  if (pros.length) parts.push("Pros:\n" + pros.join("\n"));

  const cons = [...document.querySelectorAll("#cons-list li")].map((li) => `- ${li.textContent}`);
  if (cons.length) parts.push("Cons:\n" + cons.join("\n"));

  const summary = document.getElementById("output-text").textContent;
  if (summary) parts.push(summary);

  navigator.clipboard.writeText(parts.join("\n\n"));
  showToast("Copied!");
}

// ── Upgrade ──────────────────────────────────────────────────────────────────

async function openUpgrade(extension = "reviews") {
  try {
    const res = await fetch(`${API_BASE}/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ extension }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Could not start checkout.");
    }
    const data = await res.json();
    chrome.tabs.create({ url: data.checkout_url });
  } catch (err) {
    showError(err.message);
  }
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function updateUI() {
  const badge = document.getElementById("usage-badge");
  const planLabel = document.getElementById("plan-label");
  const footerGroup = document.getElementById("footer-upgrade-group");

  if (isPro) {
    badge.textContent = "Pro";
    badge.className = "usage-badge";
    planLabel.textContent = "Pro plan";
    planLabel.className = "plan-label pro";
    footerGroup.classList.add("hidden");
  } else {
    footerGroup.classList.remove("hidden");
    const remaining = FREE_DAILY_LIMIT - usageToday;
    badge.textContent = `${remaining}/${FREE_DAILY_LIMIT} left`;
    if (remaining <= 0) {
      badge.className = "usage-badge out";
    } else if (remaining === 1) {
      badge.className = "usage-badge warning";
    } else {
      badge.className = "usage-badge";
    }
    planLabel.textContent = "Free plan";
    planLabel.className = "plan-label";
  }
}

function showLoading() { document.getElementById("loading").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loading").classList.add("hidden"); }
function hideOutput() { document.getElementById("output-area").classList.add("hidden"); }
function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError() { document.getElementById("error").classList.add("hidden"); }
function showUpgradePrompt() { document.getElementById("upgrade-prompt").classList.remove("hidden"); }
function hideUpgradePrompt() { document.getElementById("upgrade-prompt").classList.add("hidden"); }

function showToast(msg) {
  const toast = document.querySelector(".toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1500);
}
