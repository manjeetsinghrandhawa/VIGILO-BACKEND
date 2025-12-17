import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import Order from "../order/order.model.js";
import User from "../user/user.model.js";

const Static = sequelize.define(
  "Static",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Order,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "static",
    },
    status: {
      type: DataTypes.ENUM("upcoming", "ongoing", "completed"),
      allowNull: false,
      defaultValue: "upcoming",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isDate: { msg: "Invalid start time" },
      },
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isDate: { msg: "Invalid end time" },
      },
    },
  },
  {
    timestamps: true,
    tableName: "statics",
    paranoid: true,
  }
);

// Association: one Order → many Statics
Order.hasMany(Static, {
  foreignKey: "orderId",
  as: "statics",
  onDelete: "CASCADE",
});

Static.belongsTo(Order, {
  foreignKey: "orderId",
  as: "order",
});








export default Static;
