const API_BASE = "http://localhost:8000";

let accessToken = null;
let userEmail = null;
let lastReviews = null;
let lastProductInfo = null;

document.addEventListener("DOMContentLoaded", async () => {
  setupAuthButtons();
  setupButtons();
  await checkExistingSession();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

function setupAuthButtons() {
  document.getElementById("login-btn").addEventListener("click", handleLogin);
  document.getElementById("signup-btn").addEventListener("click", handleSignup);
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
  await chrome.storage.local.remove(["accessToken", "userEmail"]);
  showAuthScreen();
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
  await loadPageContext();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideAuthError() {
  document.getElementById("auth-error").classList.add("hidden");
}

function setAuthLoading(loading) {
  document.getElementById("login-btn").disabled = loading;
  document.getElementById("signup-btn").disabled = loading;
  document.getElementById("login-btn").textContent = loading ? "Loading..." : "Log in";
}

// ── Page context ──────────────────────────────────────────────────────────────

async function loadPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const stored = await chrome.storage.local.get(["scrapedReviews", "scrapedProduct", "scrapedTabId"]);
    if (stored.scrapedTabId === tab.id && stored.scrapedReviews) {
      lastReviews = stored.scrapedReviews;
      lastProductInfo = stored.scrapedProduct || {};
      showProductInfo(lastProductInfo, tab.url);
    } else {
      showNoProduct();
    }
  } catch {
    showNoProduct();
  }
}

function showProductInfo(product, url) {
  const siteEl = document.getElementById("product-site");
  const nameEl = document.getElementById("product-name");

  let site = "Unknown site";
  if (url.includes("amazon.com")) site = "Amazon";
  else if (url.includes("bestbuy.com")) site = "Best Buy";
  else if (url.includes("walmart.com")) site = "Walmart";

  siteEl.textContent = site;
  nameEl.textContent = product.name || "Product detected";

  document.getElementById("product-info").classList.remove("hidden");
  document.getElementById("no-product").classList.add("hidden");
  document.getElementById("summarize-btn").disabled = false;
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
}

async function summarizeReviews() {
  if (!lastReviews || lastReviews.length === 0) {
    showError("No reviews found on this page. Make sure you're on a product page.");
    return;
  }

  showLoading();
  hideOutput();
  hideError();
  document.getElementById("summarize-btn").disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/reviews/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        reviews: lastReviews,
        product_name: lastProductInfo?.name || "",
        product_url: lastProductInfo?.url || "",
      }),
    });

    if (res.status === 401) {
      await handleLogout();
      return;
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Something went wrong.");
    }

    const data = await res.json();
    renderSummary(data);
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
    prosList.innerHTML = data.pros.map((p) => `<li>${p}</li>`).join("");
    prosSection.classList.remove("hidden");
  } else {
    prosSection.classList.add("hidden");
  }

  // Cons
  const consSection = document.getElementById("cons-section");
  const consList = document.getElementById("cons-list");
  if (data.cons && data.cons.length > 0) {
    consList.innerHTML = data.cons.map((c) => `<li>${c}</li>`).join("");
    consSection.classList.remove("hidden");
  } else {
    consSection.classList.add("hidden");
  }

  // Fallback plain text
  const outputText = document.getElementById("output-text");
  if (data.summary) {
    outputText.textContent = data.summary;
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

// ── UI helpers ────────────────────────────────────────────────────────────────

function showLoading() { document.getElementById("loading").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loading").classList.add("hidden"); }
function hideOutput() { document.getElementById("output-area").classList.add("hidden"); }
function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError() { document.getElementById("error").classList.add("hidden"); }

function showToast(msg) {
  const toast = document.querySelector(".toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1500);
}
