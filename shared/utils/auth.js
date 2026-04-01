// Brando Shared Auth Helpers
const BrandoAuth = {
  async login(email, password) {
    const data = await BrandoAPI.post("/auth/login", { email, password });
    await chrome.storage.local.set({
      accessToken: data.access_token,
      userEmail: data.user.email,
    });
    return data;
  },

  async signup(email, password) {
    const data = await BrandoAPI.post("/auth/signup", { email, password });
    if (data.access_token) {
      await chrome.storage.local.set({
        accessToken: data.access_token,
        userEmail: data.user.email,
      });
    }
    return data;
  },

  async logout() {
    await chrome.storage.local.remove(["accessToken", "userEmail"]);
  },

  async getMe() {
    return BrandoAPI.get("/auth/me");
  },

  async isLoggedIn() {
    const { accessToken } = await chrome.storage.local.get(["accessToken"]);
    return !!accessToken;
  },
};
