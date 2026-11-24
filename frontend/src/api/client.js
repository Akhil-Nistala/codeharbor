import axios from "axios";
import apiBaseUrl from "../config/api";

// Shared Axios instance for the API. withCredentials lets the browser send and
// store the httpOnly refresh-token cookie. AuthProvider adds the response
// interceptor that refreshes expired access tokens.
const apiClient = axios.create({ baseURL: `${apiBaseUrl}/api/v1`, withCredentials: true });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Shared across callers, so a burst of parallel 401s sends exactly one
// /auth/refresh request. That matters: refresh tokens are single-use, so a
// second concurrent refresh with the same cookie would be rejected.
let refreshPromise = null;

export const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = apiClient
      .post("/auth/refresh")
      .then((response) => {
        localStorage.setItem("token", response.data.token);
        return response.data.token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

export default apiClient;
