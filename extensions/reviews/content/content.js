// Brando for Shopping — content script
// Detects product pages on any shopping site, scrapes reviews,
// and injects a "Brando Summary" badge trigger into the page.

const BADGE_ID = "brando-summary-badge";
const BADGE_BTN_ID = "brando-summary-btn";

// ── Site detection ────────────────────────────────────────────────────────────

function detectSite() {
  const host = location.hostname;
  if (host.includes("amazon.com") || host.includes("amazon.co")) return "amazon";
  if (host.includes("bestbuy.com")) return "bestbuy";
  if (host.includes("walmart.com")) return "walmart";
  if (host.includes("target.com")) return "target";
  if (host.includes("newegg.com")) return "newegg";
  if (host.includes("homedepot.com")) return "homedepot";
  if (host.includes("lowes.com")) return "lowes";
  if (host.includes("ebay.com")) return "ebay";
  // Generic — any site with reviews
  return "generic";
}

function isProductPage(site) {
  const path = location.pathname;
  if (site === "amazon") return /\/dp\/|\/gp\/product\//.test(path);
  if (site === "bestbuy") return /\/site\/|\/product\//.test(path) || /\/reviews/.test(path);
  if (site === "walmart") return /\/ip\//.test(path);
  if (site === "target") return /\/p\//.test(path);
  if (site === "newegg") return /\/p\/|\/Product\//.test(path);
  if (site === "homedepot") return /\/p\//.test(path);
  if (site === "lowes") return /\/pd\//.test(path);
  if (site === "ebay") return /\/itm\//.test(path);
  // Generic: check if page has review-like content
  if (site === "generic") return hasReviewContent();
  return false;
}

function hasReviewContent() {
  // Look for common review indicators on any page
  const reviewSelectors = [
    '[itemprop="review"]', '[itemprop="reviewBody"]',
    '[data-hook="review"]', '.review', '.reviews',
    '.customer-review', '.product-review', '.user-review',
    '[class*="review-text"]', '[class*="review-body"]',
    '[class*="ReviewText"]', '[class*="ReviewBody"]',
    '.bv-content-review', '.pr-review', '.ugc-review',
    '[data-testid*="review"]', '[data-automation*="review"]',
  ];
  for (const sel of reviewSelectors) {
    if (document.querySelector(sel)) return true;
  }
  // Also check for star rating elements as a product page signal
  const ratingSelectors = [
    '[itemprop="ratingValue"]', '[itemprop="aggregateRating"]',
    '[class*="star-rating"]', '[class*="StarRating"]',
    '[class*="rating"]', '[data-rating]',
  ];
  for (const sel of ratingSelectors) {
    if (document.querySelector(sel)) return true;
  }
  return false;
}

// ── Scrapers ──────────────────────────────────────────────────────────────────

function scrapeAmazonReviews() {
  const reviews = [];
  // Full review items (often lazy-loaded below the fold)
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
  // Top reviews snippet section (visible without scrolling)
  if (reviews.length === 0) {
    document.querySelectorAll('.review-text-content, [data-hook="review-collapsed"], .a-expander-content.reviewText').forEach((el) => {
      const text = el.innerText.trim();
      if (text.length > 20) {
        reviews.push({ text: text.substring(0, 500), rating: null });
      }
    });
  }
  // Review highlights / feature bullets
  if (reviews.length === 0) {
    document.querySelectorAll('#cr-lighthouse-hsa-thing .a-fixed-left-grid-col, [data-hook="cr-lighthouse-feature"]').forEach((el) => {
      const text = el.innerText.trim();
      if (text.length > 10) {
        reviews.push({ text: text.substring(0, 500), rating: null });
      }
    });
  }
  // Aggregate rating text as fallback context
  if (reviews.length === 0) {
    const aggRating = document.querySelector('#acrCustomerReviewText, [data-hook="total-review-count"]');
    const starText = document.querySelector('#acrPopover .a-icon-alt, [data-hook="rating-out-of-text"]');
    if (aggRating) {
      reviews.push({
        text: `Overall: ${starText ? starText.innerText.trim() + " — " : ""}${aggRating.innerText.trim()}`,
        rating: starText ? starText.innerText.trim() : null,
      });
    }
  }
  return reviews;
}

function scrapeAmazonProduct() {
  const name =
    document.getElementById("productTitle")?.innerText.trim() ||
    document.querySelector("h1.a-size-large")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

function parseBestBuyReviewList(container) {
  const reviews = [];
  if (!container) return reviews;
  container.querySelectorAll(":scope > li").forEach((li) => {
    const body =
      li.querySelector("p[id^='ugc-line-clamp-reviews']") ||
      li.querySelector("p[id^='ugc-line-clamp']") ||
      li.querySelector("div.relative p.body-copy-lg") ||
      li.querySelector("p.body-copy-lg");
    const ratingEl = li.querySelector("span.sr-only");
    const ratingText = ratingEl ? ratingEl.innerText.trim() : null;
    if (body) {
      reviews.push({
        text: body.innerText.trim().substring(0, 500),
        rating: ratingText,
      });
    }
  });
  return reviews;
}

function scrapeBestBuyReviews() {
  // Check both list IDs (product page vs dedicated reviews page)
  let reviews = parseBestBuyReviewList(document.getElementById("stand-alone-review-list"));
  if (reviews.length === 0) {
    reviews = parseBestBuyReviewList(document.getElementById("review-list"));
  }
  // Fallback: older layout
  if (reviews.length === 0) {
    document.querySelectorAll(".review-item, [class*='ugc-review'], [class*='review-entry'], [data-testid='sku-review']").forEach((el) => {
      const body =
        el.querySelector(".pre-white-space, .ugc-review-body, p[class*='body']") ||
        el.querySelector("p");
      const rating = el.querySelector("[title*='out of 5'], .c-ratings-reviews-v4, span.sr-only");
      if (body) {
        reviews.push({
          text: body.innerText.trim().substring(0, 500),
          rating: rating ? rating.getAttribute("title") || rating.innerText.trim() : null,
        });
      }
    });
  }
  return reviews;
}

async function scrapeBestBuyReviewsAsync() {
  // First try DOM scraping
  let reviews = scrapeBestBuyReviews();
  if (reviews.length > 3) return reviews;

  // Fetch the dedicated reviews page to get 20 reviews
  try {
    const baseUrl = location.href.replace(/#.*$/, "").replace(/\/reviews.*$/, "");
    const reviewsUrl = baseUrl + "/reviews?pageSize=20";
    const resp = await fetch(reviewsUrl);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const list = doc.getElementById("stand-alone-review-list") || doc.getElementById("review-list");
    if (list) {
      const fetched = parseBestBuyReviewList(list);
      if (fetched.length > reviews.length) reviews = fetched;
    }
  } catch {}
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

function scrapeGenericReviews() {
  const reviews = [];
  const seen = new Set();

  // Strategy 1: schema.org itemprop reviews
  document.querySelectorAll('[itemprop="review"], [itemprop="reviewBody"]').forEach((el) => {
    const bodyEl = el.querySelector('[itemprop="reviewBody"]') || el;
    const text = bodyEl.innerText.trim().substring(0, 500);
    if (text.length > 20 && !seen.has(text)) {
      seen.add(text);
      const ratingEl = el.querySelector('[itemprop="ratingValue"]');
      reviews.push({
        text,
        rating: ratingEl ? ratingEl.getAttribute("content") || ratingEl.innerText.trim() : null,
      });
    }
  });

  // Strategy 2: common CSS class patterns
  if (reviews.length === 0) {
    const reviewSelectors = [
      '.review', '.customer-review', '.product-review', '.user-review',
      '.review-item', '.review-card', '.review-entry',
      '[class*="review-text"]', '[class*="review-body"]', '[class*="review-content"]',
      '[class*="ReviewText"]', '[class*="ReviewBody"]', '[class*="ReviewContent"]',
      '.bv-content-review', '.pr-review', '.ugc-review',
      '[data-testid*="review"]', '[data-hook="review"]',
    ];

    for (const sel of reviewSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        // Try to find the text body within the review element
        const bodyEl =
          el.querySelector('[class*="body"], [class*="text"], [class*="content"], p') || el;
        const text = bodyEl.innerText.trim().substring(0, 500);
        if (text.length > 20 && !seen.has(text)) {
          seen.add(text);
          const ratingEl = el.querySelector('[class*="star"], [class*="rating"], [data-rating]');
          reviews.push({
            text,
            rating: ratingEl
              ? ratingEl.getAttribute("data-rating") || ratingEl.getAttribute("title") || ratingEl.innerText.trim()
              : null,
          });
        }
      });
      if (reviews.length > 0) break; // found reviews with this selector
    }
  }

  return reviews;
}

function scrapeGenericProduct() {
  // Try schema.org, Open Graph, or common patterns for product name
  const name =
    document.querySelector('[itemprop="name"]')?.innerText.trim() ||
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    document.querySelector("h1")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

function scrapeAll(site) {
  if (site === "amazon") return { reviews: scrapeAmazonReviews(), product: scrapeAmazonProduct() };
  if (site === "bestbuy") return { reviews: scrapeBestBuyReviews(), product: scrapeBestBuyProduct() };
  if (site === "walmart") return { reviews: scrapeWalmartReviews(), product: scrapeWalmartProduct() };
  // All other sites (including target, newegg, homedepot, lowes, ebay) use generic scraper
  return { reviews: scrapeGenericReviews(), product: scrapeGenericProduct() };
}

async function scrapeAllAsync(site) {
  if (site === "bestbuy") {
    return { reviews: await scrapeBestBuyReviewsAsync(), product: scrapeBestBuyProduct() };
  }
  return scrapeAll(site);
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
  const { reviews, product } = scrapeAll(site);
  chrome.storage.local.set({
    scrapedReviews: reviews,
    scrapedProduct: product,
    scrapedSite: site,
    scrapedUrl: location.href,
  });
  chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const site = detectSite();
  if (!isProductPage(site)) return;

  const { reviews, product } = await scrapeAllAsync(site);

  // For generic sites, only proceed if we actually found reviews
  if (site === "generic" && reviews.length === 0) return;

  // Persist for popup to read
  chrome.storage.local.set({
    scrapedReviews: reviews,
    scrapedProduct: product,
    scrapedSite: site,
    scrapedUrl: location.href,
  });

  // Also send to background so it can store the tab id
  chrome.runtime.sendMessage({
    type: "REVIEWS_SCRAPED",
    reviews,
    product,
  });

  if (reviews.length > 0) {
    injectBadge(reviews.length);
  }
}

// Listen for scrape requests from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCRAPE_REVIEWS") {
    const site = detectSite();
    scrapeAllAsync(site).then(({ reviews, product }) => {
      chrome.storage.local.set({
        scrapedReviews: reviews,
        scrapedProduct: product,
        scrapedSite: site,
        scrapedUrl: location.href,
      });
      sendResponse({ reviews, product, site });
    });
    return true; // keep message channel open for async
  }
});

// Run on load; also watch for SPA navigation
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
