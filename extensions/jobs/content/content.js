const BUTTON_CLASS = "brando-analyze-btn";

// Site-specific selectors for extracting job text
const SITE_SELECTORS = {
  linkedin: {
    jobText: [
      ".jobs-description__content",
      ".jobs-description-content__text",
      ".job-view-layout",
    ],
    container: [
      ".jobs-unified-top-card",
      ".job-view-layout",
      ".jobs-search__job-details",
    ],
  },
  indeed: {
    jobText: [
      "#jobDescriptionText",
      ".jobsearch-jobDescriptionText",
      '[data-testid="jobsearch-JobComponent-description"]',
    ],
    container: [
      ".jobsearch-JobComponent",
      '[data-testid="jobsearch-ViewJobLayout"]',
      ".jobsearch-RightPane",
    ],
  },
  glassdoor: {
    jobText: [
      '[class*="JobDescription"]',
      ".desc",
      '[data-test="jobDescriptionContent"]',
    ],
    container: [
      '[class*="JobDetails"]',
      '[class*="jobDetails"]',
      ".jobDescriptionWrapper",
    ],
  },
};

function getSite() {
  const host = location.hostname;
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("indeed.com")) return "indeed";
  if (host.includes("glassdoor.com")) return "glassdoor";
  return null;
}

function extractJobText() {
  const site = getSite();
  if (!site) return "";
  const selectors = SITE_SELECTORS[site]?.jobText || [];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 100) {
      return el.innerText.trim().substring(0, 4000);
    }
  }
  return "";
}

function findJobContainer() {
  const site = getSite();
  if (!site) return null;
  const selectors = SITE_SELECTORS[site]?.container || [];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function createAnalyzeButton() {
  const btn = document.createElement("button");
  btn.className = BUTTON_CLASS;
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    Analyze with Brando
  `;
  btn.title = "Analyze this job listing with Brando AI";
  btn.addEventListener("click", handleAnalyzeClick);
  return btn;
}

function handleAnalyzeClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const jobText = extractJobText();
  if (!jobText) {
    showNudge(e.currentTarget, "Couldn't read the job description. Try opening the full listing.");
    return;
  }

  chrome.storage.local.set({
    jobContext: {
      text: jobText,
      timestamp: Date.now(),
      url: location.href,
    },
  });

  showNudge(e.currentTarget, "Job captured! Click the Brando icon to analyze.");
}

function showNudge(anchor, message) {
  const existing = document.querySelector(".brando-nudge");
  if (existing) existing.remove();

  const nudge = document.createElement("div");
  nudge.className = "brando-nudge";
  nudge.textContent = message;

  const wrapper = anchor.closest(`.${BUTTON_CLASS}-wrapper`);
  if (wrapper) {
    wrapper.appendChild(nudge);
  } else {
    anchor.parentElement.appendChild(nudge);
  }

  setTimeout(() => nudge.remove(), 3500);
}

function injectButton() {
  if (document.querySelector(`.${BUTTON_CLASS}`)) return;

  const container = findJobContainer();
  if (!container) return;

  const jobText = extractJobText();
  if (!jobText) return;

  const wrapper = document.createElement("div");
  wrapper.className = `${BUTTON_CLASS}-wrapper`;
  const btn = createAnalyzeButton();
  wrapper.appendChild(btn);

  container.insertBefore(wrapper, container.firstChild);
}

const observer = new MutationObserver(() => {
  if (!document.querySelector(`.${BUTTON_CLASS}`)) {
    injectButton();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

setTimeout(injectButton, 1500);
setTimeout(injectButton, 3000);
