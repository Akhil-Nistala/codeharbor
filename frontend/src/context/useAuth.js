import { createContext, useContext } from "react";

// Kept apart from AuthProvider so AuthContext.jsx exports only a component,
// which React Fast Refresh needs.
export const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);
