// Brando for Shopping — content script
// Detects product pages on Amazon, BestBuy, and Walmart, scrapes reviews,
// and injects a "Brando Summary" badge trigger into the page.

const BADGE_ID = "brando-summary-badge";
const BADGE_BTN_ID = "brando-summary-btn";

// ── Site detection ────────────────────────────────────────────────────────────

function detectSite() {
  const host = location.hostname;
  if (host.includes("amazon.com")) return "amazon";
  if (host.includes("bestbuy.com")) return "bestbuy";
  if (host.includes("walmart.com")) return "walmart";
  return null;
}

function isProductPage(site) {
  const path = location.pathname;
  if (site === "amazon") return /\/dp\/|\/gp\/product\//.test(path);
  if (site === "bestbuy") return /\/site\/.*\/\d+\.p/.test(path);
  if (site === "walmart") return /\/ip\//.test(path);
  return false;
}

// ── Scrapers ──────────────────────────────────────────────────────────────────

function scrapeAmazonReviews() {
  const reviews = [];
  // Customer reviews section
  document.querySelectorAll('[data-hook="review"]').forEach((el) => {
    const body = el.querySelector('[data-hook="review-body"]');
    const rating = el.querySelector('[data-hook="review-star-rating"], [data-hook="cmps-review-star-rating"]');
    if (body) {
      reviews.push({
        text: body.innerText.trim().substring(0, 500),
        rating: rating ? rating.innerText.trim() : null,
      });
    }
  });
  return reviews;
}

function scrapeAmazonProduct() {
  const name =
    document.getElementById("productTitle")?.innerText.trim() ||
    document.querySelector("h1.a-size-large")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

function scrapeBestBuyReviews() {
  const reviews = [];
  document.querySelectorAll(".review-item, [class*='ugc-review']").forEach((el) => {
    const body =
      el.querySelector(".pre-white-space, .ugc-review-body, p[class*='body']") ||
      el.querySelector("p");
    const rating = el.querySelector("[title*='out of 5'], .c-ratings-reviews-v4");
    if (body) {
      reviews.push({
        text: body.innerText.trim().substring(0, 500),
        rating: rating ? rating.getAttribute("title") || rating.innerText.trim() : null,
      });
    }
  });
  return reviews;
}

function scrapeBestBuyProduct() {
  const name =
    document.querySelector(".sku-title h1")?.innerText.trim() ||
    document.querySelector("h1[class*='heading']")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

function scrapeWalmartReviews() {
  const reviews = [];
  document.querySelectorAll('[itemprop="review"], [data-testid="review-card"], .Grid-col').forEach((el) => {
    const body =
      el.querySelector('[itemprop="reviewBody"]') ||
      el.querySelector("[data-testid='review-text'], span[class*='review']");
    const rating = el.querySelector('[itemprop="ratingValue"]');
    if (body) {
      reviews.push({
        text: body.innerText.trim().substring(0, 500),
        rating: rating ? rating.getAttribute("content") || rating.innerText : null,
      });
    }
  });
  return reviews;
}

function scrapeWalmartProduct() {
  const name =
    document.querySelector("[itemprop='name'] h1, h1[itemprop='name']")?.innerText.trim() ||
    document.querySelector("h1.f3")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

function scrapeAll(site) {
  if (site === "amazon") return { reviews: scrapeAmazonReviews(), product: scrapeAmazonProduct() };
  if (site === "bestbuy") return { reviews: scrapeBestBuyReviews(), product: scrapeBestBuyProduct() };
  if (site === "walmart") return { reviews: scrapeWalmartReviews(), product: scrapeWalmartProduct() };
  return { reviews: [], product: {} };
}

// ── Badge injection ───────────────────────────────────────────────────────────

function injectBadge(reviewCount) {
  if (document.getElementById(BADGE_ID)) return;

  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.className = "brando-summary-badge";

  const btn = document.createElement("button");
  btn.id = BADGE_BTN_ID;
  btn.className = "brando-summary-btn";
  btn.innerHTML = `
    <span class="brando-logo">B</span>
    <span class="brando-btn-text">Brando Summary</span>
    ${reviewCount > 0 ? `<span class="brando-review-count">${reviewCount} reviews</span>` : ""}
  `;
  btn.title = "Summarize reviews with Brando AI";
  btn.addEventListener("click", handleBadgeClick);

  badge.appendChild(btn);
  document.body.appendChild(badge);
}

function removeBadge() {
  const existing = document.getElementById(BADGE_ID);
  if (existing) existing.remove();
}

function handleBadgeClick() {
  const btn = document.getElementById(BADGE_BTN_ID);
  if (btn) {
    btn.textContent = "Opening Brando...";
    btn.disabled = true;
    setTimeout(() => {
      btn.innerHTML = `
        <span class="brando-logo">B</span>
        <span class="brando-btn-text">Brando Summary</span>
      `;
      btn.disabled = false;
    }, 2000);
  }
  // Re-scrape on click to get the freshest data before user opens popup
  const site = detectSite();
  if (site) {
    const { reviews, product } = scrapeAll(site);
    chrome.storage.local.set({
      scrapedReviews: reviews,
      scrapedProduct: product,
      scrapedTabId: null, // will be set by service worker context
    });
  }
  chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  const site = detectSite();
  if (!site || !isProductPage(site)) return;

  const { reviews, product } = scrapeAll(site);

  // Persist for popup to read
  chrome.tabs.getCurrent?.((tab) => {
    chrome.storage.local.set({
      scrapedReviews: reviews,
      scrapedProduct: product,
      scrapedTabId: tab?.id ?? null,
    });
  });

  // Also send to background so it can store the tab id
  chrome.runtime.sendMessage({
    type: "REVIEWS_SCRAPED",
    reviews,
    product,
  });

  injectBadge(reviews.length);
}

// Run on load; also watch for SPA navigation (Amazon, Walmart use pushState)
init();

let lastUrl = location.href;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    removeBadge();
    setTimeout(init, 1500); // wait for new page content
  }
});
navObserver.observe(document.body, { childList: true, subtree: true });
