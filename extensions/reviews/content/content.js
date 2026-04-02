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

function parseWalmartReviewsFromDoc(doc) {
  const reviews = [];
  const seen = new Set();
  // New Walmart layout: enhanced-review-content contains review text in <p> tags
  doc.querySelectorAll('[data-testid="enhanced-review-content"]').forEach((el) => {
    const p = el.querySelector("p");
    if (p) {
      const text = p.innerText.trim().substring(0, 500);
      if (text.length > 20 && !seen.has(text)) {
        seen.add(text);
        reviews.push({ text, rating: null });
      }
    }
  });
  // Fallback: old Walmart layout
  if (reviews.length === 0) {
    doc.querySelectorAll('[itemprop="review"], [data-testid="review-card"]').forEach((el) => {
      const body =
        el.querySelector('[itemprop="reviewBody"]') ||
        el.querySelector("[data-testid='review-text']");
      const rating = el.querySelector('[itemprop="ratingValue"]');
      if (body) {
        const text = body.innerText.trim().substring(0, 500);
        if (text.length > 20 && !seen.has(text)) {
          seen.add(text);
          reviews.push({
            text,
            rating: rating ? rating.getAttribute("content") || rating.innerText : null,
          });
        }
      }
    });
  }
  return reviews;
}

function scrapeWalmartReviews() {
  return parseWalmartReviewsFromDoc(document);
}

async function scrapeWalmartReviewsAsync() {
  let reviews = scrapeWalmartReviews();
  if (reviews.length > 5) return reviews;

  // Extract product ID from URL: /ip/product-name/ID or /ip/ID
  const match = location.pathname.match(/\/ip\/(?:.*\/)?(\d+)/);
  if (!match) return reviews;
  const productId = match[1];

  try {
    // Fetch page 1 and page 2 of reviews to get ~20
    const [resp1, resp2] = await Promise.all([
      fetch(`https://www.walmart.com/reviews/product/${productId}?page=1`),
      fetch(`https://www.walmart.com/reviews/product/${productId}?page=2`),
    ]);
    const [html1, html2] = await Promise.all([resp1.text(), resp2.text()]);
    const doc1 = new DOMParser().parseFromString(html1, "text/html");
    const doc2 = new DOMParser().parseFromString(html2, "text/html");
    const r1 = parseWalmartReviewsFromDoc(doc1);
    const r2 = parseWalmartReviewsFromDoc(doc2);
    const fetched = [...r1, ...r2];
    if (fetched.length > reviews.length) reviews = fetched;
  } catch {}
  return reviews;
}

function scrapeWalmartProduct() {
  const name =
    document.querySelector("h1[itemprop='name']")?.innerText.trim() ||
    document.querySelector("[itemprop='name'] h1")?.innerText.trim() ||
    document.querySelector("h1")?.innerText.trim() ||
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

// ── eBay scraper ─────────────────────────────────────────────────────────────

function scrapeEbayReviews() {
  const reviews = [];
  const seen = new Set();
  document.querySelectorAll('.x-review-section').forEach((section) => {
    const rightCol = section.querySelector('.x-review-section__r');
    if (!rightCol) return;
    const text = rightCol.innerText.trim().substring(0, 500);
    if (text.length > 20 && !seen.has(text)) {
      seen.add(text);
      reviews.push({ text, rating: null });
    }
  });
  return reviews;
}

function scrapeEbayProduct() {
  const name =
    document.querySelector('h1.x-item-title__mainTitle span')?.innerText.trim() ||
    document.querySelector('h1[itemprop="name"]')?.innerText.trim() ||
    document.querySelector('h1')?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

// ── Lowe's scraper ───────────────────────────────────────────────────────────

function scrapeLowesReviews() {
  const reviews = [];
  const seen = new Set();
  document.querySelectorAll('.review-row').forEach((row) => {
    const text = row.innerText.trim().substring(0, 500);
    // Filter out very short or boilerplate text
    if (text.length > 30 && !seen.has(text)) {
      seen.add(text);
      reviews.push({ text, rating: null });
    }
  });
  return reviews;
}

async function scrapeLowesReviewsAsync() {
  // First check if reviews are already in the DOM
  let reviews = scrapeLowesReviews();
  if (reviews.length > 3) return reviews;

  // Click the reviews accordion to expand it and load reviews
  const accordionWrapper = document.querySelector('[data-testid="reviews-accordion"]');
  if (accordionWrapper) {
    // Must scroll into view first, then click the button inside
    accordionWrapper.scrollIntoView({ behavior: "instant" });
    await new Promise((r) => setTimeout(r, 300));
    const btn = accordionWrapper.querySelector("button.accordion-header");
    if (btn && btn.classList.contains("closed")) {
      btn.click();
      await new Promise((r) => setTimeout(r, 2500));
    }

    // Click "Show 10 More" buttons to load more reviews (up to 3 clicks = ~34 reviews)
    for (let i = 0; i < 3; i++) {
      const showMore = [...accordionWrapper.querySelectorAll("button")].find((b) => /show.*more/i.test(b.innerText));
      if (!showMore) break;
      showMore.click();
      await new Promise((r) => setTimeout(r, 1500));
    }

    reviews = scrapeLowesReviews();
  }
  return reviews;
}

function scrapeLowesProduct() {
  const name =
    document.querySelector('h1[class*="productTitle"]')?.innerText.trim() ||
    document.querySelector('h1')?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

// ── Home Depot scraper ───────────────────────────────────────────────────────

function scrapeHomeDepotReviews() {
  const reviews = [];
  const seen = new Set();
  // Home Depot uses various review selectors depending on page version
  const selectors = [
    '.review-content', '.review_item', '[class*="review-body"]',
    '[class*="ReviewBody"]', '[class*="review-text"]',
  ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      const text = el.innerText.trim().substring(0, 500);
      if (text.length > 20 && !seen.has(text)) {
        seen.add(text);
        reviews.push({ text, rating: null });
      }
    });
    if (reviews.length > 0) break;
  }
  return reviews;
}

function scrapeHomeDepotProduct() {
  const name =
    document.querySelector('h1.product-title__title')?.innerText.trim() ||
    document.querySelector('h1[class*="product"]')?.innerText.trim() ||
    document.querySelector('h1')?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

// ── Newegg scraper ───────────────────────────────────────────────────────────

// Content scripts can't access window.__initialState__ (isolated world).
// Bridge: inject a <script> that reads it and writes to a hidden DOM element.
function extractNeweggSSRData() {
  return new Promise((resolve) => {
    const el = document.getElementById("brando-ssr-data");
    if (el) { resolve(el.textContent); return; }

    const script = document.createElement("script");
    script.textContent = `
      (function() {
        var s = window.__initialState__;
        var list = s && s.SyncLoadReviews && s.SyncLoadReviews.SearchResult && s.SyncLoadReviews.SearchResult.CustomerReviewList;
        var title = s && s.ItemDetail && s.ItemDetail.ItemInfo && s.ItemDetail.ItemInfo.Title;
        var el = document.createElement("div");
        el.id = "brando-ssr-data";
        el.style.display = "none";
        el.textContent = JSON.stringify({ reviews: list || [], title: title || "" });
        document.body.appendChild(el);
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    // Read back from the DOM element
    setTimeout(() => {
      const dataEl = document.getElementById("brando-ssr-data");
      resolve(dataEl ? dataEl.textContent : "{}");
    }, 50);
  });
}

function parseNeweggReviews(list) {
  const reviews = [];
  const seen = new Set();
  if (list && Array.isArray(list)) {
    list.forEach((r) => {
      const parts = [r.Comments, r.Pros ? "Pros: " + r.Pros : "", r.Cons ? "Cons: " + r.Cons : ""].filter(Boolean);
      const text = parts.join(" ").trim().substring(0, 500);
      if (text.length > 20 && !seen.has(text)) {
        seen.add(text);
        reviews.push({ text, rating: r.Rating ? String(r.Rating) : null });
      }
    });
  }
  return reviews;
}

async function scrapeNeweggReviewsAsync() {
  const raw = await extractNeweggSSRData();
  try {
    const data = JSON.parse(raw);
    return parseNeweggReviews(data.reviews);
  } catch {
    return [];
  }
}

function scrapeNeweggReviews() {
  // Sync fallback: try reading from the bridge element if it already exists
  const el = document.getElementById("brando-ssr-data");
  if (el) {
    try {
      const data = JSON.parse(el.textContent);
      return parseNeweggReviews(data.reviews);
    } catch {}
  }
  return [];
}

async function scrapeNeweggProductAsync() {
  const raw = await extractNeweggSSRData();
  try {
    const data = JSON.parse(raw);
    if (data.title) return { name: data.title, url: location.href };
  } catch {}
  const name =
    document.querySelector("h1.product-title")?.innerText.trim() ||
    document.querySelector("h1")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

function scrapeNeweggProduct() {
  const el = document.getElementById("brando-ssr-data");
  if (el) {
    try {
      const data = JSON.parse(el.textContent);
      if (data.title) return { name: data.title, url: location.href };
    } catch {}
  }
  const name =
    document.querySelector("h1.product-title")?.innerText.trim() ||
    document.querySelector("h1")?.innerText.trim() ||
    document.title;
  return { name, url: location.href };
}

// ── scrapeAll ────────────────────────────────────────────────────────────────

function scrapeAll(site) {
  if (site === "amazon") return { reviews: scrapeAmazonReviews(), product: scrapeAmazonProduct() };
  if (site === "bestbuy") return { reviews: scrapeBestBuyReviews(), product: scrapeBestBuyProduct() };
  if (site === "walmart") return { reviews: scrapeWalmartReviews(), product: scrapeWalmartProduct() };
  if (site === "newegg") return { reviews: scrapeNeweggReviews(), product: scrapeNeweggProduct() };
  if (site === "ebay") return { reviews: scrapeEbayReviews(), product: scrapeEbayProduct() };
  if (site === "lowes") return { reviews: scrapeLowesReviews(), product: scrapeLowesProduct() };
  if (site === "homedepot") return { reviews: scrapeHomeDepotReviews(), product: scrapeHomeDepotProduct() };
  // All other sites use generic scraper
  return { reviews: scrapeGenericReviews(), product: scrapeGenericProduct() };
}

async function scrapeAllAsync(site) {
  if (site === "bestbuy") {
    return { reviews: await scrapeBestBuyReviewsAsync(), product: scrapeBestBuyProduct() };
  }
  if (site === "walmart") {
    return { reviews: await scrapeWalmartReviewsAsync(), product: scrapeWalmartProduct() };
  }
  if (site === "newegg") {
    return { reviews: await scrapeNeweggReviewsAsync(), product: await scrapeNeweggProductAsync() };
  }
  if (site === "lowes") {
    return { reviews: await scrapeLowesReviewsAsync(), product: scrapeLowesProduct() };
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

async function handleBadgeClick() {
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
  const { reviews, product } = await scrapeAllAsync(site);
  chrome.storage.local.set({
    scrapedReviews: reviews,
    scrapedProduct: product,
    scrapedSite: site,
    scrapedUrl: location.href,
  });
  chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
}

// ── SSR data extraction (runs in page main world via injected script) ────────

function extractSSRData() {
  return new Promise((resolve) => {
    const existing = document.getElementById("brando-ssr-data");
    if (existing) { resolve(existing.textContent); return; }

    const script = document.createElement("script");
    script.textContent = `
      (function() {
        var reviews = [];
        var title = "";

        // Newegg __initialState__
        if (window.__initialState__) {
          var s = window.__initialState__;
          var list = s.SyncLoadReviews && s.SyncLoadReviews.SearchResult && s.SyncLoadReviews.SearchResult.CustomerReviewList;
          if (list) reviews = list;
          if (s.ItemDetail && s.ItemDetail.ItemInfo) title = s.ItemDetail.ItemInfo.Title || "";
        }

        // Next.js __NEXT_DATA__
        if (reviews.length === 0 && window.__NEXT_DATA__) {
          var nd = JSON.stringify(window.__NEXT_DATA__);
          title = title || (window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps && window.__NEXT_DATA__.props.pageProps.product && window.__NEXT_DATA__.props.pageProps.product.name) || "";
        }

        var el = document.createElement("div");
        el.id = "brando-ssr-data";
        el.style.display = "none";
        el.textContent = JSON.stringify({ reviews: reviews, title: title });
        document.body.appendChild(el);
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();

    setTimeout(() => {
      const dataEl = document.getElementById("brando-ssr-data");
      resolve(dataEl ? dataEl.textContent : "{}");
    }, 50);
  });
}

// ── Scroll and scrape (for lazy-loaded reviews) ──────────────────────────────

async function scrollAndScrape() {
  const site = detectSite();

  // Step 0: Try clicking review accordions/tabs to expand them
  const accordionSelectors = [
    '[data-testid="reviews-accordion"] button',
    '[data-testid="reviews-accordion"]',
    'button[aria-controls*="review"]',
    '[class*="review"] button.accordion',
    'a[href="#reviews"]',
    'button:has(> span:contains("Reviews"))',
  ];
  for (const sel of accordionSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) { el.click(); break; }
    } catch {}
  }

  // Step 1: Scroll progressively to trigger lazy-loading
  const scrollPositions = [0.3, 0.5, 0.7, 0.85, 1.0];
  for (const pos of scrollPositions) {
    window.scrollTo(0, document.body.scrollHeight * pos);
    await new Promise((r) => setTimeout(r, 800));
  }

  // Step 2: Wait for content to render
  await new Promise((r) => setTimeout(r, 1500));

  // Step 3: Scrape after lazy content has loaded
  const { reviews, product } = await scrapeAllAsync(site);

  if (reviews.length > 0) {
    chrome.storage.local.set({
      scrapedReviews: reviews,
      scrapedProduct: product,
      scrapedSite: site,
      scrapedUrl: location.href,
    });
    injectBadge(reviews.length);
  }

  // Scroll back to top
  window.scrollTo(0, 0);

  return { reviews, product, site };
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const site = detectSite();
  if (!isProductPage(site)) return;

  const { reviews, product } = await scrapeAllAsync(site);

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
  } else {
    // No reviews on first scrape — start observing for lazy-loaded reviews
    startReviewObserver(site);
  }
}

// ── MutationObserver for lazy-loaded reviews ─────────────────────────────────

let reviewObserver = null;

function startReviewObserver(site) {
  if (reviewObserver) return; // already watching

  let debounceTimer = null;
  reviewObserver = new MutationObserver(() => {
    // Debounce: wait for mutations to settle
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const { reviews, product } = await scrapeAllAsync(site);
      if (reviews.length > 0) {
        chrome.storage.local.set({
          scrapedReviews: reviews,
          scrapedProduct: product,
          scrapedSite: site,
          scrapedUrl: location.href,
        });
        injectBadge(reviews.length);
        // Stop observing once we found reviews
        if (reviewObserver) { reviewObserver.disconnect(); reviewObserver = null; }
      }
    }, 1000);
  });

  reviewObserver.observe(document.body, { childList: true, subtree: true });

  // Auto-stop after 30 seconds to avoid performance issues
  setTimeout(() => {
    if (reviewObserver) { reviewObserver.disconnect(); reviewObserver = null; }
  }, 30000);
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
    }).catch(() => {
      const { reviews, product } = scrapeAll(site);
      sendResponse({ reviews, product, site });
    });
    return true;
  }
  if (msg.type === "SCROLL_AND_SCRAPE") {
    scrollAndScrape().then(({ reviews, product, site }) => {
      sendResponse({ reviews, product, site });
    }).catch(() => {
      const site = detectSite();
      const { reviews, product } = scrapeAll(site);
      sendResponse({ reviews, product, site });
    });
    return true;
  }
});

// Run on load; also watch for SPA navigation
init();

let lastUrl = location.href;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    removeBadge();
    if (reviewObserver) { reviewObserver.disconnect(); reviewObserver = null; }
    setTimeout(init, 1500);
  }
});
navObserver.observe(document.body, { childList: true, subtree: true });
