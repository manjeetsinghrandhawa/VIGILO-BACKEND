import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";
import Order from "../order/order.model.js";
import PatrolCheckpoint from "./patrolCheckpoint.model.js";

const PatrolRun = sequelize.define(
  "PatrolRun",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    patrolId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    orderId: {
  type: DataTypes.UUID,
  allowNull: true,
  references: {
    model: "orders",
    key: "id",
  },
  onDelete: "CASCADE",
},


    guardId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    vehicleId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    startDateTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    estimatedCompletion: {
      type: DataTypes.DATE,
    },

    // 🔵 Execution lifecycle
    status: {
      type: DataTypes.ENUM("accepted","rejected","pending","upcoming","ongoing", "scheduled", "active", "completed"),
      defaultValue: "pending",
    },

    // 🟡 Approval lifecycle (like static shift)
    approvalStatus: {
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
      defaultValue: "pending",
    },

    // 🔢 Execution tracking
    totalCheckpoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    completedCheckpoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    totalSubSites: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    completedSubSites: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    totalSites: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    completedSites: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    notes: {
      type: DataTypes.TEXT,
    },

    siteIds: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    runStructure: {
  type: DataTypes.JSON,
},
  },
  {
    tableName: "PatrolRuns",
    timestamps: true,
  }
);


User.hasMany(PatrolRun, {
  foreignKey: "guardId",
  as: "patrolRun",
});

PatrolRun.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});

/**
 * ===========================
 * 🔗 PATROL RUN ↔ ORDER
 * ===========================
 */

Order.hasMany(PatrolRun, {
  foreignKey: "orderId",
  as: "patrolRuns",
});

PatrolRun.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});

PatrolRun.hasMany(PatrolCheckpoint, {
  foreignKey: "patrolRunId",
  as: "runCheckpoints",
  onDelete: "CASCADE",
});

PatrolCheckpoint.belongsTo(PatrolRun, {
  foreignKey: "patrolRunId",
  as: "patrolRun",
});


export default PatrolRun;
