// Content script for Brando YouTube — runs in ISOLATED world on YouTube pages.
// Listens for captured transcripts from the MAIN world intercept script
// and stores them via chrome.storage for the popup to read.

// Listen for transcript data from the MAIN world interceptor
window.addEventListener("brando-transcript-captured", (e) => {
  const { videoId, transcript, timestamp } = e.detail || {};
  if (videoId && transcript) {
    chrome.storage.local.set({
      yt_transcript: transcript,
      yt_video_id: videoId,
      yt_timestamp: timestamp,
    });
  }
});

// Also listen for popup requests to get the current transcript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TRANSCRIPT") {
    chrome.storage.local.get(["yt_transcript", "yt_video_id", "yt_timestamp"], (data) => {
      sendResponse(data);
    });
    return true; // keep channel open for async response
  }
});
