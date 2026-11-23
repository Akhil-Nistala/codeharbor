import { Router } from "express";

import {
  deleteUserProfile,
  getAllUsers,
  getUserProfile,
  toggleFollow,
  updateUserProfile
} from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireSelf } from "../middleware/authorize.middleware.js";
import { requireObjectId } from "../middleware/objectId.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateProfileSchema } from "../validators/user.validator.js";

const router = Router();
const userId = requireObjectId("id", "user id");

router.get("/", getAllUsers);
router.get("/:id", userId, getUserProfile);
router.put("/:id", requireAuth, userId, requireSelf("id"), validate(updateProfileSchema), updateUserProfile);
router.delete("/:id", requireAuth, userId, requireSelf("id"), deleteUserProfile);
router.patch("/:id/follow", requireAuth, userId, toggleFollow);

export default router;
