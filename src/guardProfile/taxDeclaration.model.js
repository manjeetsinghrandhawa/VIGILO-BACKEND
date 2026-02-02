import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const GuardTaxDeclaration = sequelize.define(
  "GuardTaxDeclaration",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true, // one tax declaration per guard
    },

    // Tax related fields
    hasTFN: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },

    tfnNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    changedNameSinceLastTFN: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },

    isAustralianResident: {
      type: DataTypes.ENUM(
        "australian_resident",
        "foreign_resident",
        "working_holiday_maker"
      ),
      allowNull: false,
    },

    claimTaxFreeThreshold: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },

    hasStudentLoan: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },

    paymentBasis: {
      type: DataTypes.ENUM(
        "australian_resident",
        "foreign_resident",
        "working_holiday_maker"
      ),
      allowNull: false,
    },

    // Verification flag
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "GuardTaxDeclaration",
    timestamps: true,
    paranoid: true,
  }
);

// Associations
User.hasOne(GuardTaxDeclaration, {
  foreignKey: "userId",
  as: "taxDeclaration",
  onDelete: "CASCADE",
});

GuardTaxDeclaration.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

export default GuardTaxDeclaration;
