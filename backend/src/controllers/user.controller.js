import bcrypt from "bcryptjs";

import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}, "username email createdAt");
  res.status(200).json(users);
});

const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(user);
});

const updateUserProfile = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const updateFields = {};
  if (email) updateFields.email = email;
  if (password) updateFields.password = await bcrypt.hash(password, 10);

  const user = await User.findByIdAndUpdate(req.params.id, updateFields, { new: true });
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json(user);
});

const deleteUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.status(200).json({ success: true, message: "User profile deleted" });
});

// Toggles :id in the *caller's* followedUsers list.
const toggleFollow = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id === req.userId) {
    throw new ApiError(400, "You can't follow yourself");
  }

  const [me, target] = await Promise.all([User.findById(req.userId), User.findById(id)]);
  if (!me) {
    throw new ApiError(401, "Your account no longer exists");
  }
  if (!target) {
    throw new ApiError(404, "User not found");
  }

  const alreadyFollowing = me.followedUsers.some((userId) => userId.toString() === id);

  if (alreadyFollowing) {
    me.followedUsers = me.followedUsers.filter((userId) => userId.toString() !== id);
  } else {
    me.followedUsers.push(id);
  }

  await me.save();
  res.status(200).json({ following: !alreadyFollowing, followedUsers: me.followedUsers });
});

export { deleteUserProfile, getAllUsers, getUserProfile, toggleFollow, updateUserProfile };
