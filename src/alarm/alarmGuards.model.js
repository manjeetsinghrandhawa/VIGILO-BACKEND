// models/alarm/alarmGuards.model.js
import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const AlarmGuards = sequelize.define(
  "AlarmGuards",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    alarmId: {
  type: DataTypes.UUID,
  allowNull: false,
  references: {
    model: "alarms",   // table name string
    key: "id",
  },
  onDelete: "CASCADE",
},

    guardId: {
  type: DataTypes.UUID,
  allowNull: false,
  references: {
    model: "users",   // table name string
    key: "id",
  },
  onDelete: "CASCADE",
},

    status: {
      type: DataTypes.ENUM(
        "pending",
        "accepted",
        "rejected",
        "on_the_way",
        "arrived",
        "resolved",
        "cancelled"
      ),
      defaultValue: "pending",
    },

    assignedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    arrivedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "alarm_guards",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["alarmId", "guardId"],
      },
    ],
  }
);

export default AlarmGuards;