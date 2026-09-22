const express = require("express");
const issueController = require("../controllers/issue.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/issue/create/:id", requireAuth, issueController.createIssue);
router.put("/issue/update/:id", requireAuth, issueController.updateIssueById);
router.delete("/issue/delete/:id", requireAuth, issueController.deleteIssueById);
router.get("/repo/:id/issues", issueController.getAllIssues);
router.get("/issue/:id", issueController.getIssueById);

module.exports = router;
