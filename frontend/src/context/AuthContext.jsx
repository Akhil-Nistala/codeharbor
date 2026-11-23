import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { AuthContext } from "./useAuth";

// A 401 from these means bad credentials, not an expired session, so it
// should surface as a form error instead of logging the user out.
const AUTH_PATHS = ["/auth/login", "/auth/signup"];

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("userId"));
  const navigate = useNavigate();

  useEffect(() => {
    const interceptorId = apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && !AUTH_PATHS.includes(error.config?.url)) {
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          setCurrentUser(null);
          navigate("/auth");
        }
        return Promise.reject(error);
      }
    );

    return () => apiClient.interceptors.response.eject(interceptorId);
  }, [navigate]);

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

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    setCurrentUser(null);
    navigate("/auth");
  };

  const value = { currentUser, handleSignup, handleLogin, handleLogout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
