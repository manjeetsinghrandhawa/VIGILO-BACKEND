import messageSocket from "../sockets/message.socket.js";
import jwt from "jsonwebtoken";
import UserPresence from "../messages/userPresence.model.js";

const onlineUsers = new Map();

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

        if (!resolvedUserId) return;

        socket.userId = resolvedUserId;
        onlineUsers.set(resolvedUserId, socket.id);

        UserPresence.upsert({
          userId: resolvedUserId,
          isOnline: true,
          socketId: socket.id,
          lastSeenAt: new Date(),
        }).catch((error) => {
          console.error("Presence register error:", error.message);
        });

        io.emit("presence:update", {
          userId: resolvedUserId,
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

      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);

          UserPresence.upsert({
            userId,
            isOnline: false,
            socketId: null,
            lastSeenAt: new Date(),
          }).catch((error) => {
            console.error("Presence disconnect error:", error.message);
          });

          io.emit("presence:update", {
            userId,
            isOnline: false,
            lastSeenAt: new Date(),
          });
        }
      }

      console.log("User disconnected");
    });

  });

};

export default initSocket;