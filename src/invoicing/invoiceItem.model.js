import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
// import Invoice from "./invoicing.model.js";

const InvoiceItem = sequelize.define(
  "InvoiceItem",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    invoiceId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    referenceId: {
      type: DataTypes.UUID,
      allowNull: true, 
      // alarmId / patrolId (null for custom service)
    },

    itemType: {
      type: DataTypes.ENUM("alarm", "patrol", "custom"),
      allowNull: false,
    },

    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

    unitPrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    totalPrice: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: "invoice_items",
    paranoid: true,
  }
);

/* ✅ SAFE association */
InvoiceItem.associate = () => {
  const { Invoice } = sequelize.models;

  InvoiceItem.belongsTo(Invoice, {
    foreignKey: "invoiceId",
    as: "invoice",
    onDelete: "CASCADE",
  });
};



export default InvoiceItem;
