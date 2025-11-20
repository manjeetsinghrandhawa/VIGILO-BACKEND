import { DataTypes, UUIDV4 } from "sequelize";
import sequelize from "../../config/database.js";

const UserVerify = sequelize.define(
  "UserVerify",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: { msg: "Enter valid email" },
        notEmpty: { msg: "Email is required for verification" },
      },
    },
    otp: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    expireIn: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM("register", "forgotPassword"),
      allowNull: false,
      defaultValue: "register",
    },
    isUsed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    tableName: "Userverifys",
  }
);

export default UserVerify;