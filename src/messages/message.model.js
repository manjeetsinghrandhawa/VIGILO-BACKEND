import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Message = sequelize.define("Message", {

  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },

  conversationId: {
    type: DataTypes.UUID,
    allowNull: false
  },

  senderId: {
    type: DataTypes.UUID,
    allowNull: false
  },

  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  attachments: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },

  replyToMessageId: {
    type: DataTypes.UUID,
    allowNull: true
  },

  isEdited: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  editedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },

  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },

  isDeletedForEveryone: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  type: {
    type: DataTypes.ENUM("text","image","file","system"),
    defaultValue: "text"
  },

  status: {
    type: DataTypes.ENUM("sent","delivered","seen"),
    defaultValue: "sent"
  }

},{
  tableName: "messages",
  timestamps: true
});

export default Message;