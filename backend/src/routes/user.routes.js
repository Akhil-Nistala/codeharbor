const express = require("express");
const userController = require("../controllers/user.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireSelf } = require("../middleware/authorize.middleware");

const router = express.Router();

router.get("/allUsers", userController.getAllUsers);
router.post("/signup", userController.signup);
router.post("/login", userController.login);
router.get("/userProfile/:id", userController.getUserProfile);
router.put("/updateProfile/:id", requireAuth, requireSelf("id"), userController.updateUserProfile);
router.delete("/deleteProfile/:id", requireAuth, requireSelf("id"), userController.deleteUserProfile);
router.patch("/user/:id/follow", requireAuth, userController.toggleFollow);

module.exports = router;
