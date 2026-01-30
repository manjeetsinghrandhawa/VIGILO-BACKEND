import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const GuardBankDetails = sequelize.define(
  "GuardBankDetails",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // one guard = one primary bank account
    },

    accountHolderName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    accountNickname: {
      type: DataTypes.STRING,
    },

    bankName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    accountNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bsb:{
        type: DataTypes.STRING,
        allowNull: false,
    },

    ifscCode: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    branchName: {
      type: DataTypes.STRING,
    },

    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "GuardBankDetails",
    timestamps: true,
    paranoid: true,
  }
);

// Associations
User.hasOne(GuardBankDetails, {
  foreignKey: "userId",
  as: "bankDetails",
  onDelete: "CASCADE",
});

GuardBankDetails.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

export default GuardBankDetails;
