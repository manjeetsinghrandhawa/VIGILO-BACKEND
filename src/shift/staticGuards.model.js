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
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
      allowNull: false,
      defaultValue: "pending",
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

// Associations
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

export default StaticGuards;
