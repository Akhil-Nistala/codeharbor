import { useEffect, useState } from "react";
import apiClient from "../api/client";
import { AuthContext } from "./useAuth";

// Holds the logged-in user's id for the whole app. The token itself lives in
// an httpOnly cookie the page can't read, so on load we ask the API who we are.
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiClient
      .get("/auth/me")
      .then((res) => setCurrentUser(res.data.userId))
      .catch(() => setCurrentUser(null))
      .finally(() => setChecking(false));
  }, []);

  // If any request comes back 401 (cookie expired or cleared), drop the user
  // so RequireAuth sends them to the login page.
  useEffect(() => {
    const interceptorId = apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) setCurrentUser(null);
        return Promise.reject(error);
      }
    );

    return () => apiClient.interceptors.response.eject(interceptorId);
  }, []);

  const handleSignup = async (username, email, password) => {
    const res = await apiClient.post("/auth/signup", { username, email, password });
    setCurrentUser(res.data.userId);
  };

  const handleLogin = async (email, password) => {
    const res = await apiClient.post("/auth/login", { email, password });
    setCurrentUser(res.data.userId);
  };

  const handleLogout = async () => {
    try {
      // Clears the httpOnly cookie, which only the server can do.
      await apiClient.post("/auth/logout");
    } catch {
      // Still log out locally even if the server is unreachable.
    }
    setCurrentUser(null);
  };

  const value = { currentUser, checking, handleSignup, handleLogin, handleLogout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
