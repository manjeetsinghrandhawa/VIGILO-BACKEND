import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import Notification from "../notifications/notifications.model.js";
const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Name is required" },
        len: {
          args: [3, 100],
          msg: "Name must be at least 3 characters long",
        },
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: { msg: "Please enter valid email" },
        notEmpty: { msg: "Email is required" },
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Password is required" },
        len: {
          args: [6, 255],
          msg: "Password must be at least 6 characters long",
        },
      },
    },
    role: {
      type: DataTypes.ENUM("user", "admin", "guard"), 
      allowNull: false,
    },
     avatar: {
      type: DataTypes.STRING, 
      allowNull: true,
      validate: {
        isUrl: { msg: "Avatar must be a valid URL" },
      },
    },
    mobile: {
      type: DataTypes.STRING, 
      allowNull: true,
      validate: {
        len: {
          args: [10, 15],
          msg: "Mobile number must be between 10 to 15 digits",
        },
      },
    },
     // ✅ NEW FIELD
    countryCode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Address is required" },
        len: {
          args: [5, 255],
          msg: "Address must be at least 5 characters long",
        },
      },
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    blocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    tableName: "users",
    paranoid: true, 
  }
);

User.hasMany(Notification, {
  foreignKey: "userId",
  as: "notifications",
});


export default User;
