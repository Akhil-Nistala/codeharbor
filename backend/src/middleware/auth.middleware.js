import { ApiError } from "../utils/ApiError.js";
import { bearerToken, verifyAccessToken } from "../utils/tokens.js";

// Verifies the bearer token and attaches the caller's id as req.userId.
// Every route that creates/modifies data should sit behind this.
export const requireAuth = (req, res, next) => {
  const token = bearerToken(req);

  if (!token) {
    return next(new ApiError(401, "Missing authentication token"));
  }

  try {
    req.userId = verifyAccessToken(token).id;
    next();
  } catch {
    next(new ApiError(401, "Invalid or expired token"));
  }
};

// Like requireAuth, but never rejects the request — just attaches req.userId
// when a valid token is present. Used by routes that behave differently for
// logged-in users (e.g. showing private repos to their owner) but are still
// reachable anonymously.
export const optionalAuth = (req, res, next) => {
  const token = bearerToken(req);

  if (token) {
    try {
      req.userId = verifyAccessToken(token).id;
    } catch {
      // invalid/expired token on an optional route — just treat as anonymous
    }
  }

  next();
};
