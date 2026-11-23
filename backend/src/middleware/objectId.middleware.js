import mongoose from "mongoose";

import { ApiError } from "../utils/ApiError.js";

// Rejects a malformed :id up front with a 400, instead of letting Mongoose
// throw a CastError that would surface as a 500.
export const requireObjectId = (paramName = "id", label = "id") => (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
    return next(new ApiError(400, `Invalid ${label}`));
  }
  next();
};
