const API_BASE = "https://brando-ai-tools-production.up.railway.app";
const FREE_DAILY_LIMIT = 3;

let currentMode = "rewrite";
let usageToday = 0;
let isPro = false;
let lastRequest = null;
let accessToken = null;
let userEmail = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initTheme();
  setupAuthButtons();
  setupTabs();
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
    isPro = data.pro_extensions?.gmail || data.plan === "pro";
    usageToday = data.usage?.gmail || 0;
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
    isPro = data.user.plan === "pro" || (data.user.plan && data.user.plan.includes("gmail"));
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

function showMainApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");
  document.getElementById("user-email").textContent = userEmail;
  updateUI();
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

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentMode = tab.dataset.mode;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".mode-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`${currentMode}-mode`).classList.add("active");
      hideOutput();
      hideError();
    });
  });
}

function setupButtons() {
  document.getElementById("rewrite-btn").addEventListener("click", handleRewrite);
  document.getElementById("compose-btn").addEventListener("click", handleCompose);
  document.getElementById("copy-btn").addEventListener("click", copyToClipboard);
  document.getElementById("regen-btn").addEventListener("click", regenerate);
  document.querySelectorAll(".btn-upgrade[data-ext]").forEach((btn) => {
    btn.addEventListener("click", () => openUpgrade(btn.dataset.ext, btn.dataset.period));
  });
  document.querySelectorAll(".btn-bundle[data-ext]").forEach((btn) => {
    btn.addEventListener("click", () => openUpgrade(btn.dataset.ext, btn.dataset.period));
  });
  document.getElementById("review-rate-btn").addEventListener("click", async () => {
    chrome.tabs.create({ url: "https://chromewebstore.google.com/detail/EXTENSION_ID_PLACEHOLDER/reviews" });
    await chrome.storage.local.set({ brando_review_prompted: true });
    document.getElementById("review-prompt").classList.add("hidden");
  });
  document.getElementById("review-dismiss-btn").addEventListener("click", async () => {
    await chrome.storage.local.set({ brando_review_prompted: true });
    document.getElementById("review-prompt").classList.add("hidden");
  });
  document.getElementById("footer-upgrade").addEventListener("click", (e) => {
    e.preventDefault();
    openUpgrade("gmail");
  });
  document.getElementById("footer-bundle").addEventListener("click", (e) => {
    e.preventDefault();
    openUpgrade("bundle");
  });
}

async function handleRewrite() {
  const text = document.getElementById("rewrite-text").value.trim();
  if (!text) {
    showError("Paste the email text you want to rewrite.");
    return;
  }
  if (!canGenerate()) {
    showUpgradePrompt();
    return;
  }
  lastRequest = {
    mode: "rewrite",
    text,
    tone: document.getElementById("rewrite-tone").value,
  };
  await callAPI(lastRequest);
}

async function handleCompose() {
  const prompt = document.getElementById("compose-prompt").value.trim();
  if (!prompt) {
    showError("Describe what you want to write.");
    return;
  }
  if (!canGenerate()) {
    showUpgradePrompt();
    return;
  }
  lastRequest = {
    mode: "compose",
    description: prompt,
    tone: document.getElementById("compose-tone").value,
  };
  await callAPI(lastRequest);
}

async function regenerate() {
  if (lastRequest) {
    await callAPI(lastRequest);
  }
}

async function refreshPlanStatus() {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    isPro = data.pro_extensions?.gmail || data.plan === "pro";
    usageToday = data.usage?.gmail || 0;
    updateUI();
  } catch {}
}

async function callAPI(request) {
  showLoading();
  hideOutput();
  hideError();
  hideUpgradePrompt();
  setButtonsDisabled(true);
  await refreshPlanStatus();
  if (!canGenerate()) {
    hideLoading();
    setButtonsDisabled(false);
    showUpgradePrompt();
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/gmail/rewrite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request),
    });
    if (response.status === 401) {
      await handleLogout();
      return;
    }
    if (response.status === 429) {
      showUpgradePrompt();
      return;
    }
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Something went wrong.");
    }
    const data = await response.json();
    showOutput(data.text);
    if (data.usage_remaining >= 0) {
      usageToday = FREE_DAILY_LIMIT - data.usage_remaining;
    }
    updateUI();
    await incrementAndCheckReview();
  } catch (err) {
    showError(err.message || "Failed to connect to server.");
  } finally {
    hideLoading();
    setButtonsDisabled(false);
  }
}

function canGenerate() {
  return isPro || usageToday < FREE_DAILY_LIMIT;
}

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

function showOutput(text) {
  document.getElementById("output-text").textContent = text;
  document.getElementById("output-area").classList.remove("hidden");
}
function hideOutput() { document.getElementById("output-area").classList.add("hidden"); }
function showLoading() { document.getElementById("loading").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loading").classList.add("hidden"); }
function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideError() { document.getElementById("error").classList.add("hidden"); }
function showUpgradePrompt() { document.getElementById("upgrade-prompt").classList.remove("hidden"); }
function hideUpgradePrompt() { document.getElementById("upgrade-prompt").classList.add("hidden"); }
function setButtonsDisabled(disabled) {
  document.getElementById("rewrite-btn").disabled = disabled;
  document.getElementById("compose-btn").disabled = disabled;
}

async function copyToClipboard() {
  const text = document.getElementById("output-text").textContent;
  await navigator.clipboard.writeText(text);
  showToast("Copied!");
}

async function incrementAndCheckReview() {
  const stored = await chrome.storage.local.get(["brando_total_generations", "brando_review_prompted"]);
  const total = (stored.brando_total_generations || 0) + 1;
  await chrome.storage.local.set({ brando_total_generations: total });
  if (total >= 10 && !stored.brando_review_prompted) {
    document.getElementById("review-prompt").classList.remove("hidden");
  }
}

async function openUpgrade(extension = "gmail", billingPeriod = "monthly") {
  try {
    const res = await fetch(`${API_BASE}/create-checkout-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ extension, billing_period: billingPeriod }),
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

function showToast(msg) {
  const toast = document.querySelector(".toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1500);
}
