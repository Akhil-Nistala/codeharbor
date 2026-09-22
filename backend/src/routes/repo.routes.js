const express = require("express");
const repoController = require("../controllers/repo.controller");
const { requireAuth, optionalAuth } = require("../middleware/auth.middleware");
const { requireRepoOwner } = require("../middleware/authorize.middleware");

const router = express.Router();

router.post("/repo/create", requireAuth, repoController.createRepository);
router.get("/repo/all", optionalAuth, repoController.getAllRepositories);
router.get("/repo/user/:userID", optionalAuth, repoController.fetchRepositoriesForCurrentUser);
router.get("/repo/name/:name", optionalAuth, repoController.fetchRepositoryByName);
router.get("/repo/:id", optionalAuth, repoController.fetchRepositoryById);
router.put("/repo/update/:id", requireAuth, requireRepoOwner("id"), repoController.updateRepositoryById);
router.delete("/repo/delete/:id", requireAuth, requireRepoOwner("id"), repoController.deleteRepositoryById);
router.patch("/repo/toggle/:id", requireAuth, requireRepoOwner("id"), repoController.toggleVisibilityById);

module.exports = router;
