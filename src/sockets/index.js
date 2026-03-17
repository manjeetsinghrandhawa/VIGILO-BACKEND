import messageSocket from "../sockets/message.socket.js";

const onlineUsers = new Map();

const initSocket = (io) => {

  io.on("connection", (socket) => {

    console.log("User connected:", socket.id);

    // register user
    socket.on("register", (userId) => {
      onlineUsers.set(userId, socket.id);
    });

    // load message socket
    messageSocket(io, socket, onlineUsers);

    socket.on("disconnect", () => {

      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
        }
      }

      console.log("User disconnected");
    });

  });

};

export default initSocket;