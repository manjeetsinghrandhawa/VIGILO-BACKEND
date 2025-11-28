import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

import User from "../user/user.model.js";

const Scheduling = sequelize.define(
  "Scheduling",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    startTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    endTime: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    site: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    guardId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    tableName: "scheduling",
    timestamps: true,
    paranoid: true,
  }
);

Scheduling.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});

Scheduling.belongsTo(User, {
    foreignKey: "reportedBy",
    as: "reporter",
    onDelete: "SET NULL",
  });


export default Scheduling;
