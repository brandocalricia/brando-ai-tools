// This script runs in the MAIN world on YouTube pages.
// It extracts captions by finding YouTube's timedtext URL from performance entries
// (which includes the required POT token), then re-fetches and parses the transcript.

(function () {
  function parseTranscript(text) {
    if (!text || text.length < 50) return null;
    try {
      const data = JSON.parse(text);
      const snippets = [];
      for (const event of (data.events || [])) {
        for (const seg of (event.segs || [])) {
          const t = (seg.utf8 || "").trim();
          if (t && t !== "\n") snippets.push(t);
        }
      }
      if (snippets.length > 0) return snippets.join(" ");
    } catch {}
    const matches = text.match(/<text[^>]*>([\s\S]*?)<\/text>/g) || [];
    if (matches.length > 0) {
      const snippets = [];
      for (const tag of matches) {
        const inner = tag.replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">").replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"').trim();
        if (inner) snippets.push(inner);
      }
      if (snippets.length > 0) return snippets.join(" ");
    }
    return null;
  }

  function extractAndStore() {
    try {
      const entries = performance.getEntriesByType("resource");
      const ttEntry = entries.find(e => e.name.includes("/api/timedtext") && e.name.includes("v="));
      if (!ttEntry) return false;

      const urlParams = new URLSearchParams(ttEntry.name.split("?")[1] || "");
      const videoId = urlParams.get("v") || "";

      fetch(ttEntry.name)
        .then(r => r.text())
        .then(text => {
          const transcript = parseTranscript(text);
          if (transcript && transcript.length > 50) {
            window.dispatchEvent(
              new CustomEvent("brando-transcript-captured", {
                detail: { videoId, transcript, timestamp: Date.now() },
              })
            );
          }
        })
        .catch(() => {});

      return true;
    } catch {
      return false;
    }
  }

  // Try immediately, then poll every 2s for up to 30s
  // (YouTube may not have loaded captions yet on first try)
  if (!extractAndStore()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (extractAndStore() || attempts > 15) {
        clearInterval(interval);
      }
    }, 2000);
  }

  // Also watch for SPA navigation (YouTube changes videos without page reload)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Wait for new video's captions to load
      setTimeout(() => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (extractAndStore() || attempts > 15) {
            clearInterval(interval);
          }
        }, 2000);
      }, 3000);
    }
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
