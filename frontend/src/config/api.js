// Base URL for REST calls. In production builds it defaults to "" (same origin):
// the host proxies /api to the backend (see vercel.json), so the frontend
// never needs to know the backend's URL and CORS doesn't come into play.
const apiBaseUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:3002");

export default apiBaseUrl;
