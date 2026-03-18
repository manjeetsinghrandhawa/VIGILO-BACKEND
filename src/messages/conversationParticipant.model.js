import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const ConversationParticipant = sequelize.define(
"ConversationParticipant",
{
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  conversationId: {
    type: DataTypes.UUID,
    allowNull: false
  },

  userId: {
    type: DataTypes.UUID,
    allowNull: false
  },

  role: {
    type: DataTypes.ENUM("admin", "member"),
    defaultValue: "member"
  },

  isMuted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  isPinned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },

  leftAt: {
    type: DataTypes.DATE,
    allowNull: true
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  lastReadMessageId: {
    type: DataTypes.UUID,
    allowNull: true
  }

},
{
  tableName: "conversation_participants",
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ["conversationId", "userId"]
    }
  ]
});

export default ConversationParticipant;