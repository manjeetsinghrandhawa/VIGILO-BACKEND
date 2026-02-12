import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import Static from "./static.model.js";
import User from "../user/user.model.js";

const StaticGuards = sequelize.define(
  "StaticGuards",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    staticId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Static,
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

    status: {
      type: DataTypes.ENUM(
        "absent",
        "pending",
        "accepted",
        "upcoming",
        "rejected",
        "ongoing",
        "completed",
        "overtime",
        "ended_early",
        "missed",
        "overtime_started",
        "overtime_ended",
        "missed_respond",
        "missed_endovertime",
        // 🆕 REQUEST OFF
    "request_off_pending",
    "request_off_approved",
    "request_off_rejected"
      ),
      allowNull: false,
      defaultValue: "pending",
    },

    /* 🆕 REQUEST OFF STATUS (SEPARATE) */
requestOffStatus: {
  type: DataTypes.ENUM("none", "pending", "approved", "rejected"),
  defaultValue: "none",
  allowNull: false,
},

    /* 🆕 REQUEST OFF FIELDS */
requestOffDate: {
  type: DataTypes.DATEONLY,
  allowNull: true,
},

requestOffReason: {
  type: DataTypes.STRING,
  allowNull: true,
},

requestOffNotes: {
  type: DataTypes.TEXT,
  allowNull: true,
},

requestOffRequestedAt: {
  type: DataTypes.DATE,
  allowNull: true,
},

requestOffActionedAt: {
  type: DataTypes.DATE,
  allowNull: true,
},

requestOffActionedBy: {
  type: DataTypes.UUID,
  allowNull: true, // admin id
},

changeShiftStatus: {
  type: DataTypes.ENUM("pending", "accepted", "rejected"),
  allowNull: true,
},

changeShiftDate: {
  type: DataTypes.DATEONLY,
  allowNull: true,
},

changeShiftStartTime: {
  type: DataTypes.TIME,
  allowNull: true,
},

changeShiftEndTime: {
  type: DataTypes.TIME,
  allowNull: true,
},

changeShiftReason: {
  type: DataTypes.TEXT,
  allowNull: true,
},

changeShiftRequestedAt: {
  type: DataTypes.DATE,
  allowNull: true,
},


    clockInTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    clockOutTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    /** 🔥 OVERTIME FIELDS (MISSING EARLIER) */
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
    tableName: "static_guards",
    indexes: [
      {
        unique: true,
        fields: ["staticId", "guardId"],
      },
    ],
  }
);

/* Associations */
Static.belongsToMany(User, {
  through: StaticGuards,
  foreignKey: "staticId",
  as: "guards",
});

User.belongsToMany(Static, {
  through: StaticGuards,
  foreignKey: "guardId",
  as: "statics",
});

StaticGuards.belongsTo(Static, {
  foreignKey: "staticId",
  as: "static",
});

StaticGuards.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});

export default StaticGuards;
