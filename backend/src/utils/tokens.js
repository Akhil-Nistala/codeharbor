import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { RefreshToken } from "../models/refreshToken.model.js";

// Short-lived, so a leaked access token is only useful briefly. The refresh
// token is what keeps the user logged in.
const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_NAME = "refreshToken";

export const signAccessToken = (user) =>
  jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

export const verifyAccessToken = (token) => jwt.verify(token, process.env.JWT_SECRET);

export const bearerToken = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
};

export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Refresh tokens are opaque random strings, not JWTs. They're only ever
// checked against the database, so there's nothing to gain from making them
// self-describing.
export const issueRefreshToken = async (userId, family = crypto.randomUUID()) => {
  const token = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(token),
    family,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  });
  return token;
};

// httpOnly keeps the token out of reach of JavaScript (and so of XSS). The
// cookie is scoped to the auth routes, so it isn't sent with every API call.
const cookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    // Cross-site deployments (frontend and API on different sites) need
    // SameSite=None, which browsers only accept together with Secure.
    sameSite: process.env.COOKIE_SAMESITE || (isProduction ? "none" : "lax"),
    path: "/api/v1/auth"
  };
};

export const setRefreshCookie = (res, token) =>
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS });

export const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
