const jwt = require("jsonwebtoken");

// Verifies the bearer token and attaches the caller's id as req.userId.
// Every route that creates/modifies data should sit behind this.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing authentication token" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Like requireAuth, but never rejects the request — just attaches req.userId
// when a valid token is present. Used by routes that behave differently for
// logged-in users (e.g. showing private repos to their owner) but are still
// reachable anonymously.
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    } catch {
      // invalid/expired token on an optional route — just treat as anonymous
    }
  }

  next();
}

module.exports = { requireAuth, optionalAuth };
