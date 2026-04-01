import messageSocket from "../sockets/message.socket.js";
import jwt from "jsonwebtoken";
import UserPresence from "../messages/userPresence.model.js";

const onlineUsers = new Map();
const normalizeId = (value) => (value === null || value === undefined ? null : String(value));

const initSocket = (io) => {

  io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    // register user
    socket.on("register", (payload) => {
      try {
        let resolvedUserId = null;

        if (payload && typeof payload === "object" && payload.token) {
          const decoded = jwt.verify(payload.token, process.env.JWT_SECRET);
          resolvedUserId = decoded?.id || null;
        } else if (typeof payload === "string") {
          // Legacy fallback for older clients sending plain userId.
          resolvedUserId = payload;
        }

        const normalizedUserId = normalizeId(resolvedUserId);
        if (!normalizedUserId) return;

        socket.userId = normalizedUserId;
        onlineUsers.set(normalizedUserId, socket.id);
        socket.join(`user:${normalizedUserId}`);

        UserPresence.upsert({
          userId: normalizedUserId,
          isOnline: true,
          socketId: socket.id,
          lastSeenAt: new Date(),
        }).catch((error) => {
          console.error("Presence register error:", error.message);
        });

        io.emit("presence:update", {
          userId: normalizedUserId,
          isOnline: true,
          lastSeenAt: null,
        });
      } catch (error) {
        console.error("Socket register error:", error.message);
      }
    });

    socket.on("presence:heartbeat", async () => {
      if (!socket.userId) return;

      await UserPresence.upsert({
        userId: socket.userId,
        isOnline: true,
        socketId: socket.id,
        lastSeenAt: new Date(),
      });
    });

    // load message socket
    messageSocket(io, socket, onlineUsers);

    socket.on("disconnect", () => {
      if (socket.userId) {
        const normalizedUserId = normalizeId(socket.userId);
        onlineUsers.delete(normalizedUserId);

        UserPresence.upsert({
          userId: normalizedUserId,
          isOnline: false,
          socketId: null,
          lastSeenAt: new Date(),
        }).catch((error) => {
          console.error("Presence disconnect error:", error.message);
        });

        io.emit("presence:update", {
          userId: normalizedUserId,
          isOnline: false,
          lastSeenAt: new Date(),
        });
      }

      console.log("User disconnected");
    });

  });

};

export default initSocket;