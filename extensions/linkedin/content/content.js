const BUTTON_CLASS = "brando-reply-btn";

function createReplyButton() {
  const btn = document.createElement("button");
  btn.className = BUTTON_CLASS;
  btn.textContent = "AI Reply";
  btn.title = "Generate a smart reply with Brando";
  btn.addEventListener("click", handleReplyClick);
  return btn;
}

function handleReplyClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const postContainer = e.target.closest(
    ".feed-shared-update-v2, .occludable-update, [data-urn]"
  );
  if (!postContainer) return;
  const postTextEl = postContainer.querySelector(
    ".feed-shared-text, .update-components-text, .break-words"
  );
  const postText = postTextEl ? postTextEl.innerText.trim() : "";
  if (!postText) {
    alert("Couldn't read the post text. Try opening the post first.");
    return;
  }
  chrome.storage.local.set({
    replyContext: {
      text: postText.substring(0, 1500),
      timestamp: Date.now(),
    },
  });
  showNudge(e.target);
}

function showNudge(anchor) {
  const existing = document.querySelector(".brando-nudge");
  if (existing) existing.remove();
  const nudge = document.createElement("div");
  nudge.className = "brando-nudge";
  nudge.textContent = "Post captured! Click the Brando extension icon to generate a reply.";
  anchor.parentElement.appendChild(nudge);
  setTimeout(() => nudge.remove(), 3000);
}

function injectButtons() {
  const actionBars = document.querySelectorAll(
    ".feed-shared-social-action-bar, .social-actions-button"
  );
  actionBars.forEach((bar) => {
    if (bar.querySelector(`.${BUTTON_CLASS}`)) return;
    const btn = createReplyButton();
    bar.appendChild(btn);
  });
}

const observer = new MutationObserver(() => {
  injectButtons();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

setTimeout(injectButtons, 1500);
