import bcrypt from "bcryptjs";

import { User } from "../models/user.model.js";
import { RefreshToken } from "../models/refreshToken.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  hashToken,
  issueRefreshToken,
  setRefreshCookie,
  signAccessToken
} from "../utils/tokens.js";

// Starts a session: a refresh token in an httpOnly cookie, and a short-lived
// access token in the body for the frontend to send as a Bearer header.
const startSession = async (res, user, status) => {
  const refreshToken = await issueRefreshToken(user._id);
  setRefreshCookie(res, refreshToken);
  res.status(status).json({ success: true, token: signAccessToken(user), userId: user._id });
};

const signup = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });
  if (existingUser) {
    throw new ApiError(409, "Username or email already in use");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, password: hashedPassword });

  await startSession(res, user, 201);
});

// Compared against when the email doesn't exist, so "unknown user" and
// "wrong password" take about the same time and can't be told apart by timing.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");

  // Same status and message for both failure cases, so the endpoint can't be
  // used to discover which emails are registered.
  const isPasswordCorrect = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !isPasswordCorrect) {
    throw new ApiError(401, "Invalid email or password");
  }

  await startSession(res, user, 200);
});

const revokeFamily = (family) =>
  RefreshToken.updateMany({ family, revokedAt: null }, { revokedAt: new Date() });

// Exchanges a valid refresh token (from the httpOnly cookie) for a new access
// token, and rotates the refresh token while it's at it.
const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!presented) {
    throw new ApiError(401, "Missing refresh token");
  }

  const reject = (message) => {
    clearRefreshCookie(res);
    throw new ApiError(401, message);
  };

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(presented) });
  if (!stored) reject("Invalid refresh token");

  if (stored.revokedAt) {
    // An already-rotated token came back, so someone else holds a copy.
    // Revoke every token from this login, which logs out both the attacker
    // and the real user.
    await revokeFamily(stored.family);
    reject("Refresh token reuse detected");
  }

  if (stored.expiresAt <= new Date()) reject("Refresh token expired");

  const user = await User.findById(stored.user);
  if (!user) reject("Invalid refresh token");

  // Conditional update: if two requests race with the same token, only one
  // wins. The loser is rejected rather than getting a second sibling token.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { revokedAt: new Date() }
  );
  if (!claimed) reject("Refresh token already used");

  const newRefreshToken = await issueRefreshToken(user._id, stored.family);
  setRefreshCookie(res, newRefreshToken);

  res.status(200).json({ success: true, token: signAccessToken(user), userId: user._id });
});

// Revokes the current login's token family. Doesn't need a valid access token,
// so logging out still works after the access token has expired.
const logout = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE_NAME];

  if (presented) {
    const stored = await RefreshToken.findOne({ tokenHash: hashToken(presented) });
    if (stored) await revokeFamily(stored.family);
  }

  clearRefreshCookie(res);
  res.status(200).json({ success: true, message: "Logged out" });
});

export { login, logout, refresh, signup };
