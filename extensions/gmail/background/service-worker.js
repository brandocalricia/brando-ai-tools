chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      usageToday: 0,
      usageDate: new Date().toDateString(),
      isPro: false,
    });
    console.log("Brando for Gmail installed.");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_AUTH_STATE") {
    chrome.storage.local.get(["isPro", "userEmail"], (data) => {
      sendResponse(data);
    });
    return true;
  }
  if (message.type === "SET_PRO") {
    chrome.storage.local.set({ isPro: true }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
