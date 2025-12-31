import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("admin", "guard", "user"),
      allowNull: false,
    },

    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },

    data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "notifications",
    timestamps: true,
    underscored: true,
  }
);



Notification.associate=()=>{
    const { User } = sequelize.models;

    Notification.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});
}


export default Notification;
