import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";
import Static from "../shift/static.model.js";

const ShiftChangeRequest = sequelize.define(
  "ShiftChangeRequest",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    shiftId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    requestedBy: {
      type: DataTypes.UUID,
      allowNull: false, // guard/user ID
    },

    requestedStartTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    requestedEndTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      defaultValue: "pending",
    },

    adminComment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "shift_change_requests",
    timestamps: true,
  }
);

/* Associations */
ShiftChangeRequest.belongsTo(User, {
  foreignKey: "requestedBy",
  as: "requester",
});

ShiftChangeRequest.belongsTo(Static, {
  foreignKey: "shiftId",
  as: "shift",
});

export default ShiftChangeRequest;
