const API_BASE = "https://brando-ai-tools-production.up.railway.app";
const FREE_DAILY_LIMIT = 5;

let usageToday = 0;
let isPro = false;
let lastRequest = null;
let accessToken = null;
let userEmail = null;

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
    isPro = data.pro_extensions?.youtube || data.plan === "pro";
    usageToday = data.usage?.youtube || 0;
    userEmail = data.email;
    showMainApp();
    await autoFillCurrentTab();
  } catch {
    await chrome.storage.local.remove(["accessToken", "userEmail"]);
    accessToken = null;
    showAuthScreen();
  }
}

async function autoFillCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && isYouTubeUrl(tab.url)) {
      document.getElementById("video-url").value = tab.url;
      document.getElementById("video-detected").classList.remove("hidden");
    }
  } catch {}
}

function isYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === "www.youtube.com" || parsed.hostname === "youtube.com") &&
      parsed.searchParams.has("v")
    ) || parsed.hostname === "youtu.be";
  } catch {
    return false;
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
    isPro = data.user.plan === "pro" || (data.user.plan && data.user.plan.includes("youtube"));
    usageToday = 0;
    await chrome.storage.local.set({ accessToken, userEmail });
    showMainApp();
    await autoFillCurrentTab();
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
      await autoFillCurrentTab();
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

function setupButtons() {
  document.getElementById("summarize-btn").addEventListener("click", summarize);
  document.getElementById("copy-btn").addEventListener("click", copyToClipboard);
  document.getElementById("regen-btn").addEventListener("click", regenerate);
  document.getElementById("upgrade-btn")?.addEventListener("click", () => openUpgrade("youtube"));
  document.getElementById("bundle-btn")?.addEventListener("click", () => openUpgrade("bundle"));
  document.getElementById("footer-upgrade").addEventListener("click", (e) => {
    e.preventDefault();
    openUpgrade("youtube");
  });
  document.getElementById("footer-bundle").addEventListener("click", (e) => {
    e.preventDefault();
    openUpgrade("bundle");
  });

  document.getElementById("video-url").addEventListener("input", () => {
    document.getElementById("video-detected").classList.add("hidden");
  });
}

function extractVideoId(url) {
  const match = url.match(/(?:v=|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

async function fetchTranscriptClientSide(videoId) {
  // Method 1: Inject script into the YouTube tab to get captions from player data
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes("youtube.com")) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // ytInitialPlayerResponse is set by YouTube on the page
          const player = window.ytInitialPlayerResponse ||
            (typeof ytInitialPlayerResponse !== "undefined" ? ytInitialPlayerResponse : null);
          if (!player) return null;

          const tracks =
            player?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (!tracks || tracks.length === 0) return null;

          // Find English track, fall back to first
          let url = null;
          for (const t of tracks) {
            if (t.languageCode && t.languageCode.startsWith("en")) {
              url = t.baseUrl;
              break;
            }
          }
          if (!url) url = tracks[0].baseUrl;
          return url;
        },
      });

      const captionUrl = results?.[0]?.result;
      if (captionUrl) {
        const resp = await fetch(captionUrl + "&fmt=json3");
        const data = await resp.json();
        const snippets = [];
        for (const event of (data.events || [])) {
          for (const seg of (event.segs || [])) {
            const text = (seg.utf8 || "").trim();
            if (text && text !== "\n") snippets.push(text);
          }
        }
        if (snippets.length > 0) return snippets.join(" ");
      }
    }
  } catch (e) {
    console.warn("Method 1 (tab inject) failed:", e);
  }

  // Method 2: Fetch the watch page HTML and parse caption URLs
  try {
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      credentials: "include",
    });
    const html = await pageResp.text();

    // Use a more robust extraction — find the full captionTracks array
    const marker = '"captionTracks":';
    const idx = html.indexOf(marker);
    if (idx === -1) return null;

    // Extract the JSON array by counting brackets
    let start = idx + marker.length;
    while (start < html.length && html[start] !== "[") start++;
    if (start >= html.length) return null;

    let depth = 0;
    let end = start;
    for (let i = start; i < html.length; i++) {
      if (html[i] === "[") depth++;
      else if (html[i] === "]") depth--;
      if (depth === 0) { end = i + 1; break; }
    }

    const tracksJson = html.substring(start, end);
    const tracks = JSON.parse(tracksJson);
    if (!tracks || tracks.length === 0) return null;

    let captionUrl = null;
    for (const t of tracks) {
      if (t.languageCode && t.languageCode.startsWith("en")) {
        captionUrl = t.baseUrl;
        break;
      }
    }
    if (!captionUrl) captionUrl = tracks[0].baseUrl;
    if (!captionUrl) return null;

    const capsResp = await fetch(captionUrl + "&fmt=json3");
    const data = await capsResp.json();
    const snippets = [];
    for (const event of (data.events || [])) {
      for (const seg of (event.segs || [])) {
        const text = (seg.utf8 || "").trim();
        if (text && text !== "\n") snippets.push(text);
      }
    }
    return snippets.length > 0 ? snippets.join(" ") : null;
  } catch (e) {
    console.warn("Method 2 (page fetch) failed:", e);
  }

  return null;
}

async function summarize() {
  const videoUrl = document.getElementById("video-url").value.trim();
  if (!videoUrl) {
    showError("Enter a YouTube URL.");
    return;
  }
  if (!isYouTubeUrl(videoUrl)) {
    showError("That doesn't look like a YouTube video URL.");
    return;
  }
  if (!canGenerate()) {
    showUpgradePrompt();
    return;
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    showError("Could not extract video ID from URL.");
    return;
  }

  showLoading();
  hideOutput();
  hideError();
  hideUpgradePrompt();
  setButtonDisabled(true);

  // Try fetching transcript from the browser first
  let transcript = null;
  try {
    transcript = await fetchTranscriptClientSide(videoId);
  } catch (e) {
    console.warn("Client-side transcript fetch failed:", e);
  }

  lastRequest = {
    video_url: videoUrl,
    video_title: "",
    style: document.getElementById("summary-style").value,
    length: document.getElementById("summary-length").value,
  };

  if (transcript) {
    // Send transcript text directly — backend doesn't need to fetch it
    lastRequest.transcript = transcript;
  }

  hideLoading();
  setButtonDisabled(false);
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
    isPro = data.pro_extensions?.youtube || data.plan === "pro";
    usageToday = data.usage?.youtube || 0;
    updateUI();
  } catch {}
}

async function callAPI(request) {
  showLoading();
  hideOutput();
  hideError();
  hideUpgradePrompt();
  setButtonDisabled(true);
  await refreshPlanStatus();
  if (!canGenerate()) {
    hideLoading();
    setButtonDisabled(false);
    showUpgradePrompt();
    return;
  }
  try {
    const response = await fetch(`${API_BASE}/api/youtube/summarize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        video_url: request.video_url,
        video_title: request.video_title || "",
        transcript: request.transcript || "",
      }),
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
    showOutput(data.summary);
    if (data.usage_remaining >= 0) {
      usageToday = FREE_DAILY_LIMIT - data.usage_remaining;
    }
    updateUI();
  } catch (err) {
    showError(err.message || "Failed to connect to server.");
  } finally {
    hideLoading();
    setButtonDisabled(false);
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
function setButtonDisabled(disabled) {
  document.getElementById("summarize-btn").disabled = disabled;
}

async function copyToClipboard() {
  const text = document.getElementById("output-text").textContent;
  await navigator.clipboard.writeText(text);
  showToast("Copied!");
}

async function openUpgrade(extension = "youtube") {
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

function showToast(msg) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1500);
}
