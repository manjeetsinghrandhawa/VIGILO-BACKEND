import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const MessageReceipt = sequelize.define(
  "MessageReceipt",
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

    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    seenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "message_receipts",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["messageId", "userId"],
      },
    ],
  }
);

export default MessageReceipt;
