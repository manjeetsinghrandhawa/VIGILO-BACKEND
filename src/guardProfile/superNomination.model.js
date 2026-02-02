import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const GuardSuperNomination = sequelize.define(
  "GuardSuperNomination",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },

    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "GuardSuperNomination",
    timestamps: true,
    paranoid: true,
  }
);

// Associations
User.hasOne(GuardSuperNomination, {
  foreignKey: "userId",
  as: "superNomination",
  onDelete: "CASCADE",
});

GuardSuperNomination.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

export default GuardSuperNomination;
