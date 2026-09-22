import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiBaseUrl from "../config/api";

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const client = axios.create({ baseURL: apiBaseUrl });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("userId"));
  const navigate = useNavigate();

  useEffect(() => {
    const interceptorId = client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("userId");
          setCurrentUser(null);
          navigate("/auth");
        }
        return Promise.reject(error);
      }
    );

    return () => client.interceptors.response.eject(interceptorId);
  }, [navigate]);

  const handleSignup = async (username, email, password) => {
    const res = await client.post("/signup", { username, email, password });
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("userId", res.data.userId);
    setCurrentUser(res.data.userId);
  };

  const handleLogin = async (email, password) => {
    const res = await client.post("/login", { email, password });
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("userId", res.data.userId);
    setCurrentUser(res.data.userId);
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

export { client as apiClient };
