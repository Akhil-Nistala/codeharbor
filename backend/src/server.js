import "dotenv/config";

import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = process.env.PORT || 3002;

const start = async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
  }

  const host = await connectDB(process.env.MONGO_URI);
  console.log(`MongoDB connected: ${host}`);

  app.listen(PORT, () => {
    console.log(`CodeHarbor server listening on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
