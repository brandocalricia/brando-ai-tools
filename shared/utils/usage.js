// Brando Shared Usage UI Helpers
const BrandoUsage = {
  updateBadge(badge, isPro, remaining, limit) {
    if (isPro) {
      badge.textContent = "Pro";
      badge.className = "usage-badge";
    } else {
      badge.textContent = `${remaining}/${limit} left`;
      if (remaining <= 0) {
        badge.className = "usage-badge out";
      } else if (remaining === 1) {
        badge.className = "usage-badge warning";
      } else {
        badge.className = "usage-badge";
      }
    }
  },

  updatePlanLabel(label, upgradeLink, isPro) {
    if (isPro) {
      label.textContent = "Pro plan";
      label.className = "plan-label pro";
      if (upgradeLink) upgradeLink.classList.add("hidden");
    } else {
      label.textContent = "Free plan";
      label.className = "plan-label";
      if (upgradeLink) upgradeLink.classList.remove("hidden");
    }
  },

  showToast(msg) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1500);
  },
};
