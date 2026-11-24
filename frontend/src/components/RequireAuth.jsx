import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

// Route guard: renders its children only for a logged-in user, otherwise
// redirects to /auth. "Logged in" means the API confirmed the session via
// /auth/me. This is a UX guard; the API enforces access itself.
const RequireAuth = ({ children }) => {
  const { currentUser, checking } = useAuth();

  if (checking) {
    return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  }

  return currentUser ? children : <Navigate to="/auth" replace />;
};

export default RequireAuth;
