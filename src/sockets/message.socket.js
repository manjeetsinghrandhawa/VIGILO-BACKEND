import Message from "../messages/message.model.js";
import ConversationParticipant from "../messages/conversationParticipant.model.js";
import MessageReceipt from "../messages/messageReceipt.model.js";
import MessageVisibility from "../messages/messageVisibility.model.js";
import { Op } from "sequelize";

const normalizeId = (value) => (value === null || value === undefined ? null : String(value));

const recomputeMessageStatus = async (messageId) => {
  const receipts = await MessageReceipt.findAll({
    where: { messageId },
    attributes: ["deliveredAt", "seenAt"],
  });

  if (!receipts.length) {
    await Message.update({ status: "sent" }, { where: { id: messageId } });
    return;
  }

  const allSeen = receipts.every((r) => !!r.seenAt);
  const allDelivered = receipts.every((r) => !!r.deliveredAt || !!r.seenAt);

  if (allSeen) {
    await Message.update({ status: "seen" }, { where: { id: messageId } });
    return;
  }

  if (allDelivered) {
    await Message.update({ status: "delivered" }, { where: { id: messageId } });
    return;
  }

  await Message.update({ status: "sent" }, { where: { id: messageId } });
};

const buildMessagePayload = async (message) => {
  const payload = message.toJSON ? message.toJSON() : message;

  if (!payload.replyToMessageId) {
    return { ...payload, replyTo: null };
  }

  const reply = await Message.findByPk(payload.replyToMessageId, {
    attributes: ["id", "content", "senderId", "type", "attachments", "createdAt", "isDeletedForEveryone"],
  });

  return {
    ...payload,
    replyTo: reply
      ? {
          id: reply.id,
          content: reply.content,
          senderId: reply.senderId,
          type: reply.type,
          attachments: reply.attachments || [],
          createdAt: reply.createdAt,
          isDeletedForEveryone: reply.isDeletedForEveryone,
        }
      : null,
  };
};

const messageSocket = (io, socket, onlineUsers) => {
  socket.on("sendMessage", async (data) => {
    try {
      const {
        conversationId,
        message,
        type = "text",
        replyToMessageId = null,
        attachments = [],
      } = data;
      const senderId = normalizeId(socket.userId);
      const normalizedMessage = typeof message === "string" ? message.trim() : "";
      const normalizedAttachments = Array.isArray(attachments) ? attachments : [];

      if (!senderId || !conversationId || (!normalizedMessage && !normalizedAttachments.length)) {
        return;
      }

      const senderMembership = await ConversationParticipant.findOne({
        where: {
          conversationId,
          userId: senderId,
          isActive: true,
        },
      });

      if (!senderMembership) {
        return;
      }

      const newMessage = await Message.create({
        conversationId,
        senderId,
        content: normalizedMessage || null,
        attachments: normalizedAttachments,
        type,
        replyToMessageId,
      });

      const messagePayload = await buildMessagePayload(newMessage);

      const participants = await ConversationParticipant.findAll({
        where: {
          conversationId,
          isActive: true,
          userId: { [Op.ne]: senderId },
        },
      });

      if (participants.length) {
        await MessageReceipt.bulkCreate(
          participants.map((participant) => ({
            messageId: newMessage.id,
            userId: participant.userId,
          }))
        );
      }

      for (const participant of participants) {
        const receiverUserId = normalizeId(participant.userId);
        const receiverSocket = onlineUsers.get(receiverUserId);

        io.to(`user:${receiverUserId}`).emit("receiveMessage", messagePayload);

        if (receiverSocket) {
          await MessageReceipt.update(
            {
              deliveredAt: new Date(),
            },
            {
              where: {
                messageId: newMessage.id,
                userId: receiverUserId,
              },
            }
          );
        }
      }

      await recomputeMessageStatus(newMessage.id);

  io.to(conversationId).emit("newMessage", messagePayload);
    } catch (error) {
      console.error("Send message error:", error);
    }
  });

  socket.on("typing", async ({ conversationId }) => {
    if (!socket.userId || !conversationId) return;

    const isMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: socket.userId,
        isActive: true,
      },
    });

    if (!isMember) return;

    socket.to(conversationId).emit("userTyping", { userId: socket.userId, conversationId });
  });

  socket.on("stopTyping", async ({ conversationId }) => {
    if (!socket.userId || !conversationId) return;

    const isMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: socket.userId,
        isActive: true,
      },
    });

    if (!isMember) return;

    socket.to(conversationId).emit("userStoppedTyping", { userId: socket.userId, conversationId });
  });

  socket.on("markSeen", async ({ messageId, conversationId }) => {
    if (!socket.userId || !conversationId || !messageId) return;

    const isMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: socket.userId,
        isActive: true,
      },
    });

    if (!isMember) return;

    await MessageReceipt.update(
      {
        deliveredAt: new Date(),
        seenAt: new Date(),
      },
      {
        where: {
          messageId,
          userId: socket.userId,
        },
      }
    );

    await recomputeMessageStatus(messageId);

    io.to(conversationId).emit("messageSeen", { messageId, seenBy: socket.userId });
  });

  socket.on("x", async ({ messageId, conversationId, content }) => {
    try {
      if (!socket.userId || !messageId || !conversationId || !content) return;

      const isMember = await ConversationParticipant.findOne({
        where: {
          conversationId,
          userId: socket.userId,
          isActive: true,
        },
      });

      if (!isMember) return;

      const message = await Message.findOne({
        where: {
          id: messageId,
          conversationId,
          senderId: socket.userId,
        },
      });

      if (!message || message.isDeletedForEveryone) return;

      await message.update({
        content: String(content).trim(),
        isEdited: true,
        editedAt: new Date(),
      });

      io.to(conversationId).emit("messageUpdated", {
        id: message.id,
        conversationId,
        content: message.content,
        isEdited: message.isEdited,
        editedAt: message.editedAt,
      });
    } catch (error) {
      console.error("Edit message error:", error);
    }
  });

  socket.on("deleteMessage", async ({ messageId, conversationId }) => {
    try {
      if (!socket.userId || !messageId || !conversationId) return;

      const isMember = await ConversationParticipant.findOne({
        where: {
          conversationId,
          userId: socket.userId,
          isActive: true,
        },
      });

      if (!isMember) return;

      const message = await Message.findOne({
        where: {
          id: messageId,
          conversationId,
          senderId: socket.userId,
        },
      });

      if (!message) return;

      await message.update({
        content: "This message was deleted",
        isDeletedForEveryone: true,
        deletedAt: new Date(),
        isEdited: false,
        editedAt: null,
      });

      io.to(conversationId).emit("messageDeleted", {
        id: message.id,
        conversationId,
        isDeletedForEveryone: true,
        deletedAt: message.deletedAt,
      });
    } catch (error) {
      console.error("Delete message error:", error);
    }
  });

  socket.on("deleteMessageForMe", async ({ messageId, conversationId }) => {
    try {
      if (!socket.userId || !messageId || !conversationId) return;

      const isMember = await ConversationParticipant.findOne({
        where: {
          conversationId,
          userId: socket.userId,
          isActive: true,
        },
      });

      if (!isMember) return;

      const message = await Message.findOne({
        where: {
          id: messageId,
          conversationId,
        },
      });

      if (!message) return;

      await MessageVisibility.upsert({
        messageId,
        userId: socket.userId,
        isHidden: true,
        hiddenAt: new Date(),
      });

      socket.emit("messageDeletedForMe", {
        messageId,
        conversationId,
        userId: socket.userId,
      });
    } catch (error) {
      console.error("Delete message for me error:", error);
    }
  });

  socket.on("joinConversation", async (conversationId) => {
    if (!socket.userId || !conversationId) return;

    const isMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: socket.userId,
        isActive: true,
      },
    });

    if (!isMember) return;

    socket.join(conversationId);
  });
};

export default messageSocket;