import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, { refreshAccessToken } from "../api/client";
import { AuthContext } from "./useAuth";

// A 401 from these means bad credentials or a dead session, not an expired
// access token, so it must never trigger a refresh-and-retry.
const NO_REFRESH_PATHS = ["/auth/login", "/auth/signup", "/auth/refresh", "/auth/logout"];

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("userId"));
  const navigate = useNavigate();

  const expireSession = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    setCurrentUser(null);
    navigate("/auth");
  }, [navigate]);

  useEffect(() => {
    const interceptorId = apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config;
        const shouldRefresh =
          error.response?.status === 401 &&
          original &&
          !original._retried &&
          !NO_REFRESH_PATHS.includes(original.url);

        if (!shouldRefresh) {
          return Promise.reject(error);
        }

        // The access token has expired: get a new one with the refresh
        // cookie and replay the request once.
        original._retried = true;
        try {
          await refreshAccessToken();
        } catch {
          expireSession();
          return Promise.reject(error);
        }
        // The request interceptor reattaches the new token from localStorage.
        return apiClient(original);
      }
    );

    return () => apiClient.interceptors.response.eject(interceptorId);
  }, [expireSession]);

  const storeSession = ({ token, userId }) => {
    localStorage.setItem("token", token);
    localStorage.setItem("userId", userId);
    setCurrentUser(userId);
  };

  const handleSignup = async (username, email, password) => {
    const res = await apiClient.post("/auth/signup", { username, email, password });
    storeSession(res.data);
  };

  const handleLogin = async (email, password) => {
    const res = await apiClient.post("/auth/login", { email, password });
    storeSession(res.data);
  };

  const handleLogout = async () => {
    try {
      // Revokes the refresh token on the server and clears its cookie.
      await apiClient.post("/auth/logout");
    } catch {
      // Still log out locally even if the server is unreachable.
    }
    expireSession();
  };

  const value = { currentUser, handleSignup, handleLogin, handleLogout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
