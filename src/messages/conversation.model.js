import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Conversation = sequelize.define("Conversation", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },

  type: {
    type: DataTypes.ENUM("direct", "group"),
    defaultValue: "direct"
  },

  name: {
    type: DataTypes.STRING,
    allowNull: true
  },

  avatar: {
    type: DataTypes.STRING,
    allowNull: true
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  createdBy: {
    type: DataTypes.UUID,
    allowNull: true
  },

  isArchived: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }

}, {
  tableName: "conversations",
  timestamps: true
});

export default Conversation;