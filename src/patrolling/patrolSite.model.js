import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const PatrolSite = sequelize.define(
  "PatrolSite",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // 👤 Admin who created the site
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // 🏢 Client to whom the site belongs
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    address: {
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

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "PatrolSites",
    timestamps: true,
    paranoid: true,
  }
);

//
// 🔗 Associations
//

// Admin → created sites
User.hasMany(PatrolSite, {
  foreignKey: "createdBy",
  as: "createdPatrolSites",
});

PatrolSite.belongsTo(User, {
  foreignKey: "createdBy",
  as: "creator",
});

// Client → assigned sites
User.hasMany(PatrolSite, {
  foreignKey: "clientId",
  as: "clientPatrolSites",
});

PatrolSite.belongsTo(User, {
  foreignKey: "clientId",
  as: "client",
});

export default PatrolSite;
