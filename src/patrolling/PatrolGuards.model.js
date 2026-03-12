import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import PatrolRun from "./patrolRun.model.js";
import User from "../user/user.model.js";

const PatrolGuards = sequelize.define(
  "PatrolGuards",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    patrolRunId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: PatrolRun,
        key: "id",
      },
      onDelete: "CASCADE",
    },

    guardId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    paymentAmount: {
  type: DataTypes.DECIMAL(10, 2),
},

    status: {
      type: DataTypes.ENUM(
        "accepted",
        "rejected",
        "pending",
        "upcoming",
        "ongoing",
        "scheduled",
        "active",
        "completed",
        "ended",
        "cancelled",
        "delayed",
        "absent",
         "ended_early",
        "missed",
        "overtime_started",
        "overtime_ended"
      ),
      allowNull: false,
      defaultValue: "scheduled",
    },

    clockInTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    clockOutTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    overtimeStartTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    overtimeEndTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    overtimeHours: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    totalHours: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "patrol_guards",
    indexes: [
      {
        unique: true,
        fields: ["patrolRunId", "guardId"],
      },
    ],
  }
);

// Many-to-Many via PatrolGuards

PatrolRun.belongsToMany(User, {
  through: PatrolGuards,
  foreignKey: "patrolRunId",
  as: "guards",
});

User.belongsToMany(PatrolRun, {
  through: PatrolGuards,
  foreignKey: "guardId",
  as: "patrolRuns",
});

PatrolGuards.belongsTo(PatrolRun, {
  foreignKey: "patrolRunId",
  as: "patrolRun",
});

PatrolGuards.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});


export default PatrolGuards;
