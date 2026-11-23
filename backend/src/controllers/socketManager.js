import { Server } from "socket.io";

// Reserved for real-time notifications (e.g. "new issue opened on your
// repo") — wired up but not yet driving any UI. Documented in the README
// as a known stub rather than left unexplained.
export const connectToSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN || "*", methods: ["GET", "POST"] }
  });

  io.on("connection", (socket) => {
    socket.on("joinRoom", (userId) => socket.join(userId));
  });

  return io;
};
