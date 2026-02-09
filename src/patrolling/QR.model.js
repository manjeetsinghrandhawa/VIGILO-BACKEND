import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import PatrolCheckPoint from "./patrolCheckpoint.model.js"; // adjust path if needed

const QR = sequelize.define(
  "QR",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    checkPointId: {
      type: DataTypes.UUID,
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

    qrUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "qrs",
    timestamps: true,
  }
);




export default QR;
