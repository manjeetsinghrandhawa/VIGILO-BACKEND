import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import CheckPoint from "./patrolCheckpoint.model.js"; // adjust path if needed

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
      references: {
        model: CheckPoint,
        key: "id",
      },
      onDelete: "CASCADE",
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

QR.belongsTo(CheckPoint, {
  foreignKey: "checkPointId",
  as: "checkPoint",
});

CheckPoint.hasOne(QR, {
  foreignKey: "checkPointId",
  as: "qr",
});


export default QR;
