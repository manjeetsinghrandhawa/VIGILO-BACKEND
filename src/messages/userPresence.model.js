import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const UserPresence = sequelize.define(
  "UserPresence",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },

    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    socketId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "user_presence",
    timestamps: true,
    indexes: [
      {
        fields: ["isOnline", "updatedAt"],
      },
    ],
  }
);

export default UserPresence;
