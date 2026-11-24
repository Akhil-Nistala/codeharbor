import axios from "axios";
import apiBaseUrl from "../config/api";

// Shared Axios instance for the API. The session JWT lives in an httpOnly
// cookie, so there's no token to attach here: withCredentials makes the
// browser send (and accept) that cookie on cross-origin requests (local dev,
// or a directly-called API).
const apiClient = axios.create({ baseURL: `${apiBaseUrl}/api/v1`, withCredentials: true });

export default apiClient;
