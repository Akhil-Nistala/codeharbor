import { Router } from "express";

import { login, logout, refresh, signup } from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.middleware.js";
import { loginSchema, signupSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);
// Both read the refresh token from its cookie, not from a Bearer header.
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
