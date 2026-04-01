// Brando Shared API Client
const BrandoAPI = {
  baseUrl: "http://localhost:8000",

  async request(endpoint, options = {}) {
    const token = (await chrome.storage.local.get(["accessToken"])).accessToken;
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      await chrome.storage.local.remove(["accessToken", "userEmail"]);
      throw new Error("Session expired. Please log in again.");
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Request failed (${res.status})`);
    }

    return res.json();
  },

  get(endpoint) {
    return this.request(endpoint);
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};
