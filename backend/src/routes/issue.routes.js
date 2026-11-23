import { Router } from "express";

import { deleteIssueById, getIssueById, updateIssueById } from "../controllers/issue.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireObjectId } from "../middleware/objectId.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { updateIssueSchema } from "../validators/issue.validator.js";

// Issues are created and listed under their repository (see repo.routes.js);
// these routes address a single issue directly.
const router = Router();
const issueId = requireObjectId("id", "issue id");

router.get("/:id", issueId, getIssueById);
router.put("/:id", requireAuth, issueId, validate(updateIssueSchema), updateIssueById);
router.delete("/:id", requireAuth, issueId, deleteIssueById);

export default router;
