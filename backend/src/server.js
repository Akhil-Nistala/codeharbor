require("dotenv").config();
const { createServer } = require("node:http");
const { Server } = require("socket.io");

const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 3002;

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
  }

  const host = await connectDB(process.env.MONGODB_URI);
  console.log(`MongoDB connected: ${host}`);

  const httpServer = createServer(app);

  // Reserved for real-time notifications (e.g. "new issue opened on your
  // repo") — wired up but not yet driving any UI. Documented in the README
  // as a known stub rather than left unexplained.
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN || "*", methods: ["GET", "POST"] }
  });
  io.on("connection", (socket) => {
    socket.on("joinRoom", (userId) => socket.join(userId));
  });

  httpServer.listen(PORT, () => {
    console.log(`CodeHarbor server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
