const express = require("express");
const userRoutes = require("./user.routes");
const repoRoutes = require("./repo.routes");
const issueRoutes = require("./issue.routes");

const router = express.Router();

router.get("/", (req, res) => res.json({ message: "CodeHarbor API" }));
router.get("/health", (req, res) => res.json({ status: "ok" }));

router.use(userRoutes);
router.use(repoRoutes);
router.use(issueRoutes);

module.exports = router;
