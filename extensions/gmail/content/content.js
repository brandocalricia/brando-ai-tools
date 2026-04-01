const BUTTON_CLASS = "brando-gmail-btn";
const BUTTON_ATTR = "data-brando-injected";

function createBrandoButton(composeBox) {
  const btn = document.createElement("button");
  btn.className = BUTTON_CLASS;
  btn.textContent = "Brando";
  btn.title = "Rewrite or compose with Brando AI";
  btn.setAttribute("type", "button");
  btn.addEventListener("click", (e) => handleBrandoClick(e, composeBox));
  return btn;
}

function handleBrandoClick(e, composeBox) {
  e.preventDefault();
  e.stopPropagation();

  // Grab current text from the compose body
  const bodyEl = composeBox.querySelector(
    "[contenteditable='true'], textarea"
  );
  const currentText = bodyEl ? (bodyEl.innerText || bodyEl.value || "").trim() : "";

  // Store context for the popup to read
  chrome.storage.local.set({
    gmailContext: {
      text: currentText.substring(0, 3000),
      timestamp: Date.now(),
    },
  });

  showNudge(e.target, currentText);
}

function showNudge(anchor, currentText) {
  const existing = document.querySelector(".brando-gmail-nudge");
  if (existing) existing.remove();

  const nudge = document.createElement("div");
  nudge.className = "brando-gmail-nudge";

  if (currentText) {
    nudge.textContent = "Email captured! Click the Brando icon in your toolbar to rewrite or improve it.";
  } else {
    nudge.textContent = "Click the Brando icon in your toolbar to compose a new email with AI.";
  }

  anchor.parentElement.appendChild(nudge);
  setTimeout(() => nudge.remove(), 3500);
}

function injectIntoCompose(composeWindow) {
  if (composeWindow.getAttribute(BUTTON_ATTR)) return;
  composeWindow.setAttribute(BUTTON_ATTR, "true");

  // Find the toolbar row in the compose window
  const toolbar = composeWindow.querySelector(
    ".btC, .aDh, [gh='mtb'], .wO.nr"
  );
  if (!toolbar) return;

  const btn = createBrandoButton(composeWindow);
  toolbar.appendChild(btn);
}

function scanForComposeWindows() {
  // Gmail compose windows match these selectors
  const composeWindows = document.querySelectorAll(
    ".T-I.J-J5-Ji.ao0.v7.T-I-atl.L3, .nH.Hd[gh='cm'], form[target='upload_iframe_cm_fwkl']"
  );
  composeWindows.forEach(injectIntoCompose);

  // Broader fallback: any compose container
  const composeForms = document.querySelectorAll("[role='dialog'] form, .compose-form");
  composeForms.forEach(injectIntoCompose);
}

// MutationObserver watches for compose windows being added to the DOM
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (!mutation.addedNodes.length) continue;
    // Quick check before doing a full DOM scan
    for (const node of mutation.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (
        node.matches("[gh='cm'], [role='dialog'], .nH") ||
        node.querySelector("[gh='cm'], .btC, .aDh")
      ) {
        scanForComposeWindows();
        break;
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial scan after a short delay to let Gmail finish rendering
setTimeout(scanForComposeWindows, 1500);
