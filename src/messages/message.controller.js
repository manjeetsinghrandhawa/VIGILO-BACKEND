import Conversation from "./conversation.model.js";
import ConversationParticipant from "./conversationParticipant.model.js";
import Message from "./message.model.js";
import MessageReceipt from "./messageReceipt.model.js";
import MessageVisibility from "./messageVisibility.model.js";
import UserPresence from "./userPresence.model.js";
import User from "../user/user.model.js";
import { Op } from "sequelize";

const getAuthUserId = (req) => req.userId || req.user?.id;

const ensureParticipant = async (conversationId, userId) => {
  if (!conversationId || !userId) return false;

  const participant = await ConversationParticipant.findOne({
    where: {
      conversationId,
      userId,
      isActive: true,
    },
  });

  return !!participant;
};

const createInitialReceipts = async (conversationId, senderId, messageId) => {
  const recipients = await ConversationParticipant.findAll({
    where: {
      conversationId,
      isActive: true,
      userId: { [Op.ne]: senderId },
    },
    attributes: ["userId"],
  });

  if (!recipients.length) return;

  await MessageReceipt.bulkCreate(
    recipients.map((recipient) => ({
      messageId,
      userId: recipient.userId,
    }))
  );
};

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

const getHiddenMessageIds = async (userId, conversationId) => {
  const hiddenRows = await MessageVisibility.findAll({
    where: {
      userId,
      isHidden: true,
    },
    include: [
      {
        model: Message,
        as: "message",
        where: { conversationId },
        attributes: [],
        required: true,
      },
    ],
    attributes: ["messageId"],
  });

  return hiddenRows.map((row) => row.messageId);
};

const enrichMessagesWithReply = async (messages) => {
  const replyIds = [...new Set(messages.map((m) => m.replyToMessageId).filter(Boolean))];

  if (!replyIds.length) {
    return messages.map((msg) => ({ ...msg.toJSON(), replyTo: null }));
  }

  const replyMessages = await Message.findAll({
    where: { id: { [Op.in]: replyIds } },
    attributes: ["id", "content", "senderId", "type", "createdAt", "attachments", "isDeletedForEveryone"],
  });

  const replyMap = new Map(replyMessages.map((msg) => [msg.id, msg]));

  return messages.map((msg) => {
    const raw = msg.toJSON();
    const reply = raw.replyToMessageId ? replyMap.get(raw.replyToMessageId) : null;

    return {
      ...raw,
      replyTo: reply
        ? {
            id: reply.id,
            content: reply.content,
            senderId: reply.senderId,
            type: reply.type,
            createdAt: reply.createdAt,
            attachments: reply.attachments || [],
            isDeletedForEveryone: reply.isDeletedForEveryone,
          }
        : null,
    };
  });
};

export const createOrGetConversation = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { userId } = req.body;

    if (!authUserId || !userId) {
      return res.status(400).json({ message: "auth user and userId are required" });
    }

    if (authUserId === userId) {
      return res.status(400).json({ message: "Cannot create conversation with yourself" });
    }

    const authConversations = await ConversationParticipant.findAll({
      where: {
        userId: authUserId,
        isActive: true,
      },
      attributes: ["conversationId"],
    });

    const candidateConversationIds = authConversations.map((item) => item.conversationId);

    if (candidateConversationIds.length) {
      const otherParticipant = await ConversationParticipant.findOne({
        where: {
          conversationId: { [Op.in]: candidateConversationIds },
          userId,
          isActive: true,
        },
        include: [
          {
            model: Conversation,
            as: "conversation",
            where: { type: "direct" },
            required: true,
          },
        ],
      });

      if (otherParticipant) {
        return res.json({ conversationId: otherParticipant.conversationId, isNew: false });
      }
    }

    const conversation = await Conversation.create({
      type: "direct",
      createdBy: authUserId,
    });

    await ConversationParticipant.bulkCreate([
      {
        conversationId: conversation.id,
        userId: authUserId,
        role: "member",
      },
      {
        conversationId: conversation.id,
        userId,
        role: "member",
      },
    ]);

    return res.status(201).json({
      conversationId: conversation.id,
      isNew: true,
      type: conversation.type,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createGroupConversation = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { name, memberIds = [], avatar, description } = req.body;

    if (!authUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const memberSet = new Set(memberIds.filter(Boolean));
    memberSet.add(authUserId);

    if (memberSet.size < 2) {
      return res.status(400).json({ message: "At least 2 members required" });
    }

    const conversation = await Conversation.create({
      type: "group",
      name: name.trim(),
      avatar: avatar || null,
      description: description || null,
      createdBy: authUserId,
    });

    const participants = [...memberSet].map((memberId) => ({
      conversationId: conversation.id,
      userId: memberId,
      role: memberId === authUserId ? "admin" : "member",
    }));

    await ConversationParticipant.bulkCreate(participants);

    return res.status(201).json({
      message: "Group created",
      conversationId: conversation.id,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;
    const { cursor, limit = 30 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

    const isMember = await ensureParticipant(conversationId, authUserId);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    const where = {
      conversationId,
      ...(cursor ? { createdAt: { [Op.lt]: new Date(cursor) } } : {}),
    };

    const hiddenMessageIds = await getHiddenMessageIds(authUserId, conversationId);
    if (hiddenMessageIds.length) {
      where.id = { [Op.notIn]: hiddenMessageIds };
    }

    const messages = await Message.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: safeLimit,
    });

    const ordered = [...messages].reverse();
    const enriched = await enrichMessagesWithReply(ordered);
    const nextCursor = messages.length ? messages[messages.length - 1].createdAt : null;

    return res.json({
      conversationId,
      messages: enriched,
      pagination: {
        limit: safeLimit,
        hasMore: messages.length === safeLimit,
        nextCursor,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getChatList = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);

    const memberships = await ConversationParticipant.findAll({
      where: {
        userId: authUserId,
        isActive: true,
      },
      include: [
        {
          model: Conversation,
          as: "conversation",
          required: true,
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    const chatList = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = membership.conversation;

        const hiddenMessageIds = await getHiddenMessageIds(authUserId, membership.conversationId);
        const messageWhere = {
          conversationId: membership.conversationId,
          ...(hiddenMessageIds.length ? { id: { [Op.notIn]: hiddenMessageIds } } : {}),
        };

        const [lastMessage, unreadCount] = await Promise.all([
          Message.findOne({
            where: messageWhere,
            order: [["createdAt", "DESC"]],
          }),
          Message.count({
            where: {
              ...messageWhere,
              senderId: { [Op.ne]: authUserId },
              status: { [Op.ne]: "seen" },
            },
          }),
        ]);

        let title = conversation.name;
        let avatar = conversation.avatar;

        if (conversation.type === "direct") {
          const otherParticipant = await ConversationParticipant.findOne({
            where: {
              conversationId: membership.conversationId,
              userId: { [Op.ne]: authUserId },
              isActive: true,
            },
            include: [{ model: User, as: "User", attributes: ["id", "name", "avatar", "role"] }],
          });

          if (otherParticipant?.User) {
            title = otherParticipant.User.name;
            avatar = otherParticipant.User.avatar;
          }
        }

        return {
          conversationId: membership.conversationId,
          type: conversation.type,
          title,
          avatar,
          isMuted: membership.isMuted,
          isPinned: membership.isPinned,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                type: lastMessage.type,
                senderId: lastMessage.senderId,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
        };
      })
    );

    return res.json(chatList);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const markMessagesRead = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const conversationId = req.params.conversationId || req.body.conversationId;
    const { messageId } = req.body;

    if (!conversationId) {
      return res.status(400).json({ message: "conversationId is required" });
    }

    const isMember = await ensureParticipant(conversationId, authUserId);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    const unreadMessages = await Message.findAll({
      where: {
        conversationId,
        senderId: { [Op.ne]: authUserId },
      },
      attributes: ["id"],
    });

    if (unreadMessages.length) {
      const unreadMessageIds = unreadMessages.map((message) => message.id);

      const existingReceipts = await MessageReceipt.findAll({
        where: {
          messageId: { [Op.in]: unreadMessageIds },
          userId: authUserId,
        },
        attributes: ["messageId"],
      });

      const existingReceiptIds = new Set(existingReceipts.map((receipt) => receipt.messageId));
      const missingReceiptRows = unreadMessageIds
        .filter((id) => !existingReceiptIds.has(id))
        .map((id) => ({
          messageId: id,
          userId: authUserId,
        }));

      if (missingReceiptRows.length) {
        await MessageReceipt.bulkCreate(missingReceiptRows);
      }

      await MessageReceipt.update(
        {
          deliveredAt: new Date(),
          seenAt: new Date(),
        },
        {
          where: {
            messageId: { [Op.in]: unreadMessageIds },
            userId: authUserId,
          },
        }
      );

      await Promise.all(unreadMessageIds.map((id) => recomputeMessageStatus(id)));
    }

    if (messageId) {
      await ConversationParticipant.update(
        { lastReadMessageId: messageId },
        {
          where: {
            conversationId,
            userId: authUserId,
          },
        }
      );
    }

    return res.json({ message: "Messages marked as read" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getConversationParticipants = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;

    const isMember = await ensureParticipant(conversationId, authUserId);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    const participants = await ConversationParticipant.findAll({
      where: {
        conversationId,
        isActive: true,
      },
      include: [
        {
          model: User,
          as: "User",
          attributes: ["id", "name", "avatar", "role"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    return res.json(participants);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const addGroupParticipants = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;
    const { userIds = [] } = req.body;

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation || conversation.type !== "group") {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const authMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: authUserId,
        isActive: true,
      },
    });

    if (!authMember || authMember.role !== "admin") {
      return res.status(403).json({ message: "Only group admins can add participants" });
    }

    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const existing = await ConversationParticipant.findAll({
      where: {
        conversationId,
        userId: { [Op.in]: uniqueIds },
      },
    });

    const existingIds = new Set(existing.map((item) => item.userId));

    const inactiveExisting = existing.filter((item) => !item.isActive);
    if (inactiveExisting.length) {
      await Promise.all(
        inactiveExisting.map((item) =>
          item.update({
            isActive: true,
            leftAt: null,
            joinedAt: new Date(),
          })
        )
      );
    }

    const toInsert = uniqueIds
      .filter((id) => !existingIds.has(id))
      .map((id) => ({
        conversationId,
        userId: id,
        role: "member",
      }));

    if (toInsert.length) {
      await ConversationParticipant.bulkCreate(toInsert);
    }

    return res.json({ message: "Participants added", addedCount: toInsert.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const removeGroupParticipant = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId, userId } = req.params;

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation || conversation.type !== "group") {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const authMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: authUserId,
        isActive: true,
      },
    });

    if (!authMember || authMember.role !== "admin") {
      return res.status(403).json({ message: "Only group admins can remove participants" });
    }

    const participant = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId,
        isActive: true,
      },
    });

    if (!participant) {
      return res.status(404).json({ message: "Participant not found" });
    }

    await participant.update({
      isActive: false,
      leftAt: new Date(),
    });

    return res.json({ message: "Participant removed" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const leaveGroup = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation || conversation.type !== "group") {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const participant = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: authUserId,
        isActive: true,
      },
    });

    if (!participant) {
      return res.status(404).json({ message: "You are not an active participant" });
    }

    await participant.update({
      isActive: false,
      leftAt: new Date(),
    });

    return res.json({ message: "Left group successfully" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateGroupConversation = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;
    const { name, avatar, description } = req.body;

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation || conversation.type !== "group") {
      return res.status(404).json({ message: "Group conversation not found" });
    }

    const authMember = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: authUserId,
        isActive: true,
      },
    });

    if (!authMember || authMember.role !== "admin") {
      return res.status(403).json({ message: "Only group admins can update group info" });
    }

    await conversation.update({
      ...(name !== undefined ? { name } : {}),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(description !== undefined ? { description } : {}),
    });

    return res.json({ message: "Group updated" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const setConversationPreferences = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;
    const { isMuted, isPinned } = req.body;

    const participant = await ConversationParticipant.findOne({
      where: {
        conversationId,
        userId: authUserId,
        isActive: true,
      },
    });

    if (!participant) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    await participant.update({
      ...(isMuted !== undefined ? { isMuted: !!isMuted } : {}),
      ...(isPinned !== undefined ? { isPinned: !!isPinned } : {}),
    });

    return res.json({ message: "Conversation preferences updated" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { conversationId } = req.params;
    const { content, type = "text", replyToMessageId = null, attachments = [] } = req.body;

    const normalizedContent = typeof content === "string" ? content.trim() : "";
    const normalizedAttachments = Array.isArray(attachments) ? attachments : [];

    if (!normalizedContent && !normalizedAttachments.length) {
      return res.status(400).json({ message: "Either message content or attachments are required" });
    }

    const isMember = await ensureParticipant(conversationId, authUserId);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    if (replyToMessageId) {
      const replyMessage = await Message.findOne({
        where: {
          id: replyToMessageId,
          conversationId,
        },
      });

      if (!replyMessage) {
        return res.status(400).json({ message: "replyToMessageId must belong to this conversation" });
      }
    }

    const message = await Message.create({
      conversationId,
      senderId: authUserId,
      content: normalizedContent || null,
      attachments: normalizedAttachments,
      type,
      replyToMessageId,
    });

    await createInitialReceipts(conversationId, authUserId, message.id);
    await recomputeMessageStatus(message.id);

    const [enriched] = await enrichMessagesWithReply([message]);

    return res.status(201).json({ message: "Sent", data: enriched });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const editMessage = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || !String(content).trim()) {
      return res.status(400).json({ message: "Updated content is required" });
    }

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.senderId !== authUserId) {
      return res.status(403).json({ message: "Only sender can edit message" });
    }

    if (message.isDeletedForEveryone) {
      return res.status(400).json({ message: "Deleted message cannot be edited" });
    }

    await message.update({
      content: String(content).trim(),
      isEdited: true,
      editedAt: new Date(),
    });

    return res.json({ message: "Message updated", data: message });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteMessageForEveryone = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { messageId } = req.params;

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.senderId !== authUserId) {
      return res.status(403).json({ message: "Only sender can delete this message for everyone" });
    }

    await message.update({
      content: "This message was deleted",
      isDeletedForEveryone: true,
      deletedAt: new Date(),
      isEdited: false,
      editedAt: null,
    });

    return res.json({ message: "Message deleted for everyone", data: message });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getMessageReceipts = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { messageId } = req.params;

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isMember = await ensureParticipant(message.conversationId, authUserId);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    const receipts = await MessageReceipt.findAll({
      where: { messageId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "avatar", "role"],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    return res.json({ messageId, receipts });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteMessageForMe = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);
    const { messageId } = req.params;

    const message = await Message.findByPk(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isMember = await ensureParticipant(message.conversationId, authUserId);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to access this conversation" });
    }

    await MessageVisibility.upsert({
      messageId,
      userId: authUserId,
      isHidden: true,
      hiddenAt: new Date(),
    });

    return res.json({ message: "Message deleted for me" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getUserPresence = async (req, res) => {
  try {
    const { userId } = req.params;

    const presence = await UserPresence.findOne({
      where: { userId },
    });

    if (!presence) {
      return res.json({
        userId,
        isOnline: false,
        lastSeenAt: null,
      });
    }

    return res.json({
      userId: presence.userId,
      isOnline: presence.isOnline,
      lastSeenAt: presence.lastSeenAt,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getBulkPresence = async (req, res) => {
  try {
    const userIds = String(req.query.userIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (!userIds.length) {
      return res.status(400).json({ message: "userIds query param is required" });
    }

    const rows = await UserPresence.findAll({
      where: {
        userId: { [Op.in]: userIds },
      },
    });

    const map = new Map(rows.map((row) => [row.userId, row]));
    const data = userIds.map((userId) => {
      const row = map.get(userId);
      return {
        userId,
        isOnline: row ? row.isOnline : false,
        lastSeenAt: row ? row.lastSeenAt : null,
      };
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const heartbeatPresence = async (req, res) => {
  try {
    const authUserId = getAuthUserId(req);

    await UserPresence.upsert({
      userId: authUserId,
      isOnline: true,
      lastSeenAt: new Date(),
    });

    return res.json({ message: "Presence heartbeat updated" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};