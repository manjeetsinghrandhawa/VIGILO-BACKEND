import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";

const Invoice = sequelize.define(
  "Invoice",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    invoiceNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    billingMonth: {
      type: DataTypes.INTEGER, // 1–12
      allowNull: false,
      validate: {
        min: 1,
        max: 12,
      },
    },

    billingYear: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    dueDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("draft", "sent", "paid", "overdue"),
      defaultValue: "draft",
    },

    subtotal: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    tax: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    totalAmount: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: "invoices",
    paranoid: true,
  }
);




export default Invoice;
