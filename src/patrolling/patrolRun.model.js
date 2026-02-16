import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

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
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("scheduled", "active", "completed"),
      defaultValue: "scheduled",
    },

    notes: {
      type: DataTypes.TEXT,
    },
    siteIds: {
  type: DataTypes.JSON,   // or ARRAY(UUID) if using Postgres
  allowNull: false,
},

  },
  {
    tableName: "PatrolRuns",
    timestamps: true,
  }
);

User.hasMany(PatrolRun, {
  foreignKey: "guardId",
  as: "patrolRuns",
});

PatrolRun.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});

export default PatrolRun;
