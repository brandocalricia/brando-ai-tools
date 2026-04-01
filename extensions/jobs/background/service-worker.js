chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Brando for Job Search installed.");
  }
});
