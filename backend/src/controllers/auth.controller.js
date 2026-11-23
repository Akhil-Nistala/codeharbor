import bcrypt from "bcryptjs";

import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signAccessToken } from "../utils/tokens.js";

const signup = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ username }, { email }] });
  if (existingUser) {
    throw new ApiError(409, "Username or email already in use");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({ username, email, password: hashedPassword });

  res.status(201).json({ success: true, token: signAccessToken(user), userId: user._id });
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

  res.status(200).json({ success: true, token: signAccessToken(user), userId: user._id });
});

export { login, signup };
