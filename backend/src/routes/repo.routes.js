import { Router } from "express";

import {
  createRepository,
  deleteRepositoryById,
  fetchRepositoriesForUser,
  fetchRepositoryById,
  fetchRepositoryByName,
  getAllRepositories,
  toggleVisibilityById,
  updateRepositoryById
} from "../controllers/repo.controller.js";
import { createIssue, getAllIssues } from "../controllers/issue.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";
import { requireRepoOwner } from "../middleware/authorize.middleware.js";
import { requireObjectId } from "../middleware/objectId.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { createRepoSchema, updateRepoSchema } from "../validators/repo.validator.js";
import { createIssueSchema } from "../validators/issue.validator.js";

const router = Router();
const repoId = requireObjectId("id", "repository id");

router.get("/", optionalAuth, getAllRepositories);
router.post("/", requireAuth, validate(createRepoSchema), createRepository);

// Declared before /:id so "user" and "name" aren't parsed as repository ids.
router.get("/user/:userId", optionalAuth, requireObjectId("userId", "user id"), fetchRepositoriesForUser);
router.get("/name/:name", optionalAuth, fetchRepositoryByName);

router.get("/:id", optionalAuth, repoId, fetchRepositoryById);
router.put("/:id", requireAuth, requireRepoOwner("id"), validate(updateRepoSchema), updateRepositoryById);
router.delete("/:id", requireAuth, requireRepoOwner("id"), deleteRepositoryById);
router.patch("/:id/visibility", requireAuth, requireRepoOwner("id"), toggleVisibilityById);

router.get("/:id/issues", repoId, getAllIssues);
router.post("/:id/issues", requireAuth, repoId, validate(createIssueSchema), createIssue);

export default router;
