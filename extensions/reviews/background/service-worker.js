chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      scrapedReviews: null,
      scrapedProduct: null,
      scrapedTabId: null,
    });
    chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REVIEWS_SCRAPED") {
    chrome.storage.local.set({
      scrapedReviews: message.reviews,
      scrapedProduct: message.product,
      scrapedTabId: sender.tab?.id ?? null,
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "OPEN_POPUP") {
    // Chrome MV3 doesn't allow programmatic popup open from content scripts,
    // but we can badge-update to prompt the user to click the extension icon.
    chrome.action.setBadgeText({ text: "!", tabId: sender.tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: "#e47911" });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "", tabId: sender.tab?.id });
    }, 5000);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_AUTH_STATE") {
    chrome.storage.local.get(["userEmail", "accessToken"], (data) => {
      sendResponse(data);
    });
    return true;
  }
});

// Clear stale scrape data when tab navigates away
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.storage.local.get(["scrapedTabId"], (data) => {
      if (data.scrapedTabId === tabId) {
        chrome.storage.local.set({ scrapedReviews: null, scrapedProduct: null, scrapedTabId: null });
      }
    });
  }
});
