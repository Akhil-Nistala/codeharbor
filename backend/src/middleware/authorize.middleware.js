const Repository = require("../models/repo.model");

// Must run after requireAuth. Only lets the request through if the
// authenticated user owns the repository named by :id / :repoId in the URL.
function requireRepoOwner(paramName = "id") {
  return async (req, res, next) => {
    try {
      const repository = await Repository.findById(req.params[paramName]);
      if (!repository) {
        return res.status(404).json({ message: "Repository not found" });
      }
      if (repository.owner.toString() !== req.userId) {
        return res.status(403).json({ message: "Only the repository owner can do that" });
      }
      req.repository = repository;
      next();
    } catch {
      return res.status(400).json({ message: "Invalid repository id" });
    }
  };
}

// Only lets the request through if the authenticated user is the profile
// they're trying to modify.
function requireSelf(paramName = "id") {
  return (req, res, next) => {
    if (req.params[paramName] !== req.userId) {
      return res.status(403).json({ message: "You can only do that to your own account" });
    }
    next();
  };
}

module.exports = { requireRepoOwner, requireSelf };
