// This script runs in the MAIN world to intercept YouTube's timedtext fetch requests.
// YouTube requires a POT (Proof of Origin Token) to fetch captions, which is only
// available in the player's internal request. We capture the response here.

(function () {
  const originalFetch = window.fetch;

  window.fetch = function (...args) {
    const request = args[0];
    const url = typeof request === "string" ? request : request?.url || "";

    // Intercept timedtext caption requests
    if (url.includes("/api/timedtext") && url.includes("lang=")) {
      return originalFetch.apply(this, args).then(async (response) => {
        try {
          const clone = response.clone();
          const text = await clone.text();
          if (text && text.length > 50) {
            // Parse the transcript from JSON3 or XML format
            let transcript = "";
            try {
              const data = JSON.parse(text);
              const snippets = [];
              for (const event of (data.events || [])) {
                for (const seg of (event.segs || [])) {
                  const t = (seg.utf8 || "").trim();
                  if (t && t !== "\n") snippets.push(t);
                }
              }
              transcript = snippets.join(" ");
            } catch {
              // Try XML
              const matches = text.match(/<text[^>]*>([\s\S]*?)<\/text>/g) || [];
              const snippets = [];
              for (const tag of matches) {
                const inner = tag.replace(/<[^>]+>/g, "")
                  .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">").replace(/&#39;/g, "'")
                  .replace(/&quot;/g, '"').trim();
                if (inner) snippets.push(inner);
              }
              transcript = snippets.join(" ");
            }

            if (transcript.length > 50) {
              // Extract video ID from the URL
              const urlParams = new URLSearchParams(url.split("?")[1] || "");
              const videoId = urlParams.get("v") || "";

              // Store via custom event so the content script (isolated world) can pick it up
              window.dispatchEvent(
                new CustomEvent("brando-transcript-captured", {
                  detail: { videoId, transcript, timestamp: Date.now() },
                })
              );
            }
          }
        } catch (e) {
          // Silently ignore errors — don't break YouTube
        }
        return response;
      });
    }

    return originalFetch.apply(this, args);
  };
})();
