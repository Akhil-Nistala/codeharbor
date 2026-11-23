import axios from "axios";
import apiBaseUrl from "../config/api";

// Shared Axios instance for the API. AuthProvider adds the response
// interceptor that handles expired sessions.
const apiClient = axios.create({ baseURL: `${apiBaseUrl}/api/v1` });

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
