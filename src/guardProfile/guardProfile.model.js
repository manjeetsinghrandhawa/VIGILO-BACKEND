import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const GuardProfile = sequelize.define(
  "GuardProfile",
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

    // Employee info
    firstName: DataTypes.STRING,
    middleName: DataTypes.STRING,
    lastName: DataTypes.STRING,
    title: DataTypes.STRING,

    dob: DataTypes.DATEONLY,
    gender: DataTypes.ENUM("male", "female", "other"),

    // Contact
    email: DataTypes.STRING,
    mobile: DataTypes.STRING,
    street: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    postcode: DataTypes.STRING,

    // Emergency contact
    emergencyName: DataTypes.STRING,
    emergencyRelationship: DataTypes.STRING,
    emergencyPhone: DataTypes.STRING,
    emergencyEmail: DataTypes.STRING,
    emergencyStreet: DataTypes.STRING,
    emergencyCity: DataTypes.STRING,
    emergencyState: DataTypes.STRING,
    emergencyPostcode: DataTypes.STRING,

    profileCompleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "GuardProfile",
    timestamps: true,
    paranoid: true,
  }
);

// Associations
User.hasOne(GuardProfile, {
  foreignKey: "userId",
  as: "profile",
  onDelete: "CASCADE",
});

GuardProfile.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

export default GuardProfile;
