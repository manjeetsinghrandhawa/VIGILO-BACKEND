import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import userModel from "../user/user.model.js";

const License = sequelize.define(
  "License",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    licenseName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    expiryDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    renewalDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    images: {
      type: DataTypes.JSON, // array of image URLs
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM("active", "expired"),
      defaultValue: "active",
    },
  },
  {
    tableName: "licenses",
    timestamps: true,
  }
);

// Associations
License.belongsTo(userModel, { foreignKey: "userId" });
userModel.hasMany(License, { foreignKey: "userId" });

export default License;
