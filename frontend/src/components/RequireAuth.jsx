import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

// Route guard: renders its children only for a logged-in user, otherwise
// redirects to /auth. This is a UX guard; the API enforces access itself.
const RequireAuth = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/auth" replace />;
};

export default RequireAuth;
