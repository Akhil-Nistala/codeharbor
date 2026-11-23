import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import repoRoutes from "./routes/repo.routes.js";
import issueRoutes from "./routes/issue.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

// Builds and exports the Express app without connecting to the database or
// opening a port — server.js does that. Keeping them apart lets tests import
// the app and send it requests directly with supertest.
const app = express();

// Auth is a bearer token in the Authorization header (no cookies), so a
// credentialed CORS setup isn't needed.
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));

app.get("/health", (req, res) => res.status(200).json({ success: true, status: "ok" }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/repos", repoRoutes);
app.use("/api/v1/issues", issueRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
