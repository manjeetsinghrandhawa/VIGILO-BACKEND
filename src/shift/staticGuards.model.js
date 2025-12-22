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
      type: DataTypes.ENUM("absent", "pending", "accepted", "rejected","ongoing", "completed", "overtime","ended_early","missed","overtime_started","overtime_ended","missed_respond"),
      allowNull: false,
      defaultValue: "pending",
    },
    clockInTime: {
  type: DataTypes.DATE,
  allowNull: true
},
clockOutTime: {
  type: DataTypes.DATE,
  allowNull: true
},
totalHours: {
  type: DataTypes.FLOAT,
  allowNull: true
}

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

// StaticGuards → Static (one assignment belongs to one shift)
StaticGuards.belongsTo(Static, {
  foreignKey: "staticId",
  as: "static",
});

// StaticGuards → User (one assignment belongs to one guard)
StaticGuards.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});


export default StaticGuards;
