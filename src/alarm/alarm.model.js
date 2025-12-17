import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const Alarm = sequelize.define(
  "Alarm",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    // Alarm Basic Info
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Alarm title is required" },
      },
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    alarmType: {
      type: DataTypes.ENUM(
        "intrusion",
        "panic",
        "fire",
        "medical",
        "motion",
        "other"
      ),
      allowNull: false,
    },

    priority: {
      type: DataTypes.ENUM("low", "medium", "high", "critical"),
      allowNull: false,
    },

    // Site / Location
    siteName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    specificLocation: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Guard Assignment
    assignedGuardId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    etaMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    slaTimeMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },

    // Billing
    unitPrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: {
        min: 0,
      },
    },

    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: {
        min: 0,
      },
    },

    // Alarm Lifecycle
    status: {
      type: DataTypes.ENUM(
        "active",
        "assigned",
        "in_progress",
        "resolved",
        "cancelled"
      ),
      defaultValue: "active",
    },

    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Invoicing
    invoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    billed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    tableName: "alarms",
    paranoid: true, // soft delete
  }
);

Alarm.belongsToMany(User, {
  through: "AlarmGuards",
  foreignKey: "alarmId",
  otherKey: "userId",
  as: "guards",
  onDelete: "CASCADE",
});

User.belongsToMany(Alarm, {
  through: "AlarmGuards",
  foreignKey: "userId",
  otherKey: "alarmId",
  as: "alarms",
  onDelete: "CASCADE",
});

export default Alarm;
