import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import Static from "../shift/static.model.js";
import User from "../user/user.model.js";

const Incident = sequelize.define("Incident", {
  id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  location: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  images: {
    type: DataTypes.ARRAY(DataTypes.STRING), 
    allowNull: true,
  },
},{
    tableName: "incidents",
    timestamps: true,
    paranoid: true,
  });

Incident.belongsTo(Static, {
  foreignKey: "shiftId",
  as: "shift",
  onDelete: "CASCADE",
});

Incident.belongsTo(User, {
  foreignKey: "reportedBy",
  as: "reporter",
  onDelete: "SET NULL",
});

Incident.belongsTo(User, {
  foreignKey: "assignedGuard",
  as: "assignedGuardUser",
  onDelete: "SET NULL",
});


export default Incident;
