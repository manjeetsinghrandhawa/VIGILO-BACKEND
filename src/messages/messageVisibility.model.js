import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const MessageVisibility = sequelize.define(
  "MessageVisibility",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    messageId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    isHidden: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    hiddenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "message_visibility",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["messageId", "userId"],
      },
      {
        fields: ["userId", "isHidden"],
      },
    ],
  }
);

export default MessageVisibility;
