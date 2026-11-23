import mongoose from "mongoose";

import { Repository } from "../models/repo.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Must run after requireAuth. Only lets the request through if the
// authenticated user owns the repository named by the given URL param.
export const requireRepoOwner = (paramName = "id") =>
  asyncHandler(async (req, res, next) => {
    const id = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, "Invalid repository id");
    }

    const repository = await Repository.findById(id);
    if (!repository) {
      throw new ApiError(404, "Repository not found");
    }
    if (repository.owner.toString() !== req.userId) {
      throw new ApiError(403, "Only the repository owner can do that");
    }

    req.repository = repository;
    next();
  });

// Only lets the request through if the authenticated user is the account
// they're trying to modify.
export const requireSelf = (paramName = "id") => (req, res, next) => {
  if (req.params[paramName] !== req.userId) {
    return next(new ApiError(403, "You can only do that to your own account"));
  }
  next();
};
