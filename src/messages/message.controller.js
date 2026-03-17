import Conversation from "./conversation.model.js";
import ConversationParticipant from "./conversationParticipant.model.js";
import Message from "./message.model.js";
import User from "../user/user.model.js";
import { Op } from "sequelize";


/*
CREATE OR GET CONVERSATION
Admin ↔ Guard
Admin ↔ Client
*/
export const createOrGetConversation = async (req, res) => {
  try {

    const { user1, user2 } = req.body;

    // Find existing conversation
    const participants = await ConversationParticipant.findAll({
      where: {
        userId: {
          [Op.in]: [user1, user2]
        }
      }
    });

    let conversationId = null;

    if (participants.length >= 2) {
      conversationId = participants[0].conversationId;
    }

    // If conversation exists
    if (conversationId) {
      return res.json({ conversationId });
    }

    // Create new conversation
    const conversation = await Conversation.create();

    await ConversationParticipant.bulkCreate([
      {
        conversationId: conversation.id,
        userId: user1
      },
      {
        conversationId: conversation.id,
        userId: user2
      }
    ]);

    res.json(conversation);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


/*
GET CHAT MESSAGES
*/
export const getMessages = async (req, res) => {

  try {

    const { conversationId } = req.params;

    const messages = await Message.findAll({
      where: { conversationId },
      order: [["createdAt", "ASC"]],
    });

    res.json(messages);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

};


/*
GET CHAT LIST (WhatsApp Sidebar)
*/
export const getChatList = async (req, res) => {

  try {

    const { userId } = req.params;

    const conversations = await ConversationParticipant.findAll({
      where: { userId },
      include: [
        {
          model: Conversation,
          include: [
            {
              model: Message,
              limit: 1,
              order: [["createdAt", "DESC"]],
            }
          ]
        }
      ]
    });

    const chatList = await Promise.all(
      conversations.map(async (c) => {

        const otherParticipant = await ConversationParticipant.findOne({
          where: {
            conversationId: c.conversationId,
            userId: { [Op.ne]: userId }
          }
        });

        const user = await User.findByPk(otherParticipant.userId);

        const unreadCount = await Message.count({
          where: {
            conversationId: c.conversationId,
            senderId: { [Op.ne]: userId },
            status: { [Op.ne]: "seen" }
          }
        });

        return {
          conversationId: c.conversationId,
          name: user.name,
          avatar: user.avatar,
          lastMessage:
            c.Conversation.Messages.length > 0
              ? c.Conversation.Messages[0].content
              : null,
          unreadCount
        };

      })
    );

    res.json(chatList);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

};


/*
MARK ALL MESSAGES AS READ
*/
export const markMessagesRead = async (req, res) => {

  try {

    const { conversationId, userId } = req.body;

    await Message.update(
      { status: "seen" },
      {
        where: {
          conversationId,
          senderId: { [Op.ne]: userId }
        }
      }
    );

    res.json({ message: "Messages marked as read" });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

};


/*
GET CONVERSATION PARTICIPANTS
*/
export const getConversationParticipants = async (req, res) => {

  try {

    const { conversationId } = req.params;

    const participants = await ConversationParticipant.findAll({
      where: { conversationId },
      include: [
        {
          model: User,
          attributes: ["id", "name", "avatar", "role"]
        }
      ]
    });

    res.json(participants);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }

};