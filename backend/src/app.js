import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import repoRoutes from "./routes/repo.routes.js";
import issueRoutes from "./routes/issue.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// Builds and exports the Express app without connecting to the database or
// opening a port — server.js does that. Keeping them apart lets tests import
// the app and send it requests directly with supertest.
const app = express();

// credentials: true lets the browser send the auth cookie. That isn't allowed
// together with a "*" origin, so without CLIENT_ORIGIN the request's own
// origin is reflected back instead (fine for local dev; set CLIENT_ORIGIN in prod).
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(cookieParser());
// JSON only, no form-encoded bodies: an HTML form on another site can't send
// JSON, and a cross-site fetch with JSON needs a CORS preflight that only
// the allowed origin passes. Part of the CSRF defence, alongside SameSite=Lax.
app.use(express.json({ limit: "40kb" }));

app.get("/health", (req, res) => res.status(200).json({ success: true, status: "ok" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/repos", repoRoutes);
app.use("/api/v1/issues", issueRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
