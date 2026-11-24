import { ApiError } from "../utils/ApiError.js";
import { AUTH_COOKIE_NAME, verifySessionToken } from "../utils/tokens.js";

// Reads the JWT from the httpOnly cookie, verifies its signature and expiry,
// and attaches the caller's id as req.userId. Every route that creates or
// modifies data should sit behind this.
export const requireAuth = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return next(new ApiError(401, "Not logged in"));
  }

  try {
    req.userId = verifySessionToken(token).id;
    next();
  } catch {
    next(new ApiError(401, "Session expired, please log in again"));
  }
};

// Like requireAuth, but never rejects the request: just attaches req.userId
// when a valid cookie is present. Used by routes that behave differently for
// logged-in users (e.g. showing private repos to their owner) but are still
// reachable anonymously.
export const optionalAuth = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (token) {
    try {
      req.userId = verifySessionToken(token).id;
    } catch {
      // invalid/expired token on an optional route: treat as anonymous
    }
  }

  next();
};
