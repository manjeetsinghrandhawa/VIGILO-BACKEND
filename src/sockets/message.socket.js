import Message from "../messages/message.model.js";
import ConversationParticipant from "../messages/conversationParticipant.model.js";

const messageSocket = (io, socket, onlineUsers) => {
  socket.on("sendMessage", async (data) => {
    try {
      const { conversationId, senderId, message } = data;

      const newMessage = await Message.create({
        conversationId,
        senderId,
        content: message,
      });

      const participants = await ConversationParticipant.findAll({
        where: { conversationId },
      });

      for (const participant of participants) {
        if (participant.userId !== senderId) {
          const receiverSocket = onlineUsers.get(participant.userId);

          if (receiverSocket) {
            io.to(receiverSocket).emit("receiveMessage", newMessage);
            await newMessage.update({ status: "delivered" });
          }
        }
      }
    } catch (error) {
      console.error("Send message error:", error);
    }
  });

  socket.on("typing", ({ conversationId, userId }) => {
    socket.to(conversationId).emit("userTyping", { userId });
  });

  socket.on("stopTyping", ({ conversationId, userId }) => {
    socket.to(conversationId).emit("userStoppedTyping", { userId });
  });

  socket.on("markSeen", async ({ messageId, conversationId }) => {
    await Message.update({ status: "seen" }, { where: { id: messageId } });
    io.to(conversationId).emit("messageSeen", { messageId });
  });

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
  });
};

export default messageSocket;