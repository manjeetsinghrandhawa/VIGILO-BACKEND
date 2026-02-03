import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import PatrolSite from "./patrolSite.model.js";

const PatrolSubSite = sequelize.define(
  "PatrolSubSite",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    siteId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    unitPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    estimatedDuration: {
      type: DataTypes.INTEGER, // minutes
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: "PatrolSubSites",
    timestamps: true,
    paranoid: true,
  }
);

// Associations
PatrolSite.hasMany(PatrolSubSite, {
  foreignKey: "siteId",
  as: "subSites",
  onDelete: "CASCADE",
});

PatrolSubSite.belongsTo(PatrolSite, {
  foreignKey: "siteId",
  as: "site",
});

export default PatrolSubSite;
