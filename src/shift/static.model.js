import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import Order from "../order/order.model.js";
import User from "../user/user.model.js";
import Incident from "../incident/incident.model.js";


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
      type: DataTypes.ENUM("absent", "pending", "upcoming", "ongoing", "completed","cancelled","ended_early","missed","overtime_started","overtime_ended","missed_respond","missed_endovertime"),
      allowNull: false,
      defaultValue: "pending",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    date: {
  type: DataTypes.DATEONLY,
  allowNull: false,
},

endDate: {
  type: DataTypes.DATEONLY,
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
    shiftTotalHours: {
      type: DataTypes.FLOAT,
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

Static.hasMany(Incident, {
  foreignKey: "shiftId",
  as: "incidents",
});




export default Static;
