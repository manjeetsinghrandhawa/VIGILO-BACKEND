import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import PatrolSite from "./patrolSite.model.js";
import PatrolSubSite from "./patrolSubSite.model.js";
import QR from "./QR.model.js";

const PatrolCheckpoint = sequelize.define(
  "PatrolCheckpoint",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    siteId: {
      type: DataTypes.UUID,
      allowNull: true, // can belong directly to site
    },

    subSiteId: {
      type: DataTypes.UUID,
      allowNull: true, // or to a sub-site
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },

    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },

    verificationRange: {
      type: DataTypes.INTEGER, // meters
      defaultValue: 20,
    },

    priorityLevel: {
      type: DataTypes.ENUM("low", "medium", "high"),
      defaultValue: "medium",
    },

    description: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: "PatrolCheckpoints",
    timestamps: true,
    paranoid: true,
  }
);

// Associations
PatrolSite.hasMany(PatrolCheckpoint, {
  foreignKey: "siteId",
  as: "checkpoints",
});

PatrolSubSite.hasMany(PatrolCheckpoint, {
  foreignKey: "subSiteId",
  as: "checkpoints",
});

PatrolCheckpoint.belongsTo(PatrolSite, {
  foreignKey: "siteId",
  as: "site",
});

PatrolCheckpoint.belongsTo(PatrolSubSite, {
  foreignKey: "subSiteId",
  as: "subSite",
});

export default PatrolCheckpoint;
