import { DataTypes } from "sequelize";
import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    serviceType: {
      type: DataTypes.ENUM(
        "static",
        "patrol",
        "premiumSecurity",
        "standardPatrol",
        "24/7Monitoring",
        "healthcareSecurity",
        "industrialSecurity"
      ),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Service type is required" },
      },
    },
   locationName: {
  type: DataTypes.STRING,
  allowNull: true,   // <-- FIX
},


    locationAddress: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Location address is required" },
        len: {
          args: [5, 255],
          msg: "Address must be at least 5 characters long",
        },
      },
    },
     siteService: {
 type: DataTypes.GEOGRAPHY('POINT', 4326), 
    allowNull: false,
    comment: "Stores latitude and longitude",
},
    guardsRequired: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: {
          args: [1],
          msg: "At least one guard is required",
        },
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Start date is required" },
        isDate: { msg: "Invalid start date" },
      },
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: { msg: "Invalid end date" },
      },
    },
    startTime: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        is: {
          args: /^([0-1]\d|2[0-3]):([0-5]\d)$/,
          msg: "Start time must be in HH:mm format",
        },
      },
    },
    endTime: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        is: {
          args: /^([0-1]\d|2[0-3]):([0-5]\d)$/,
          msg: "End time must be in HH:mm format",
        },
      },
    },
    status: {
      type: DataTypes.ENUM(
        "pending",
        "missed",
        "upcoming",
        "ongoing",
        "completed",
        "cancelled"
      ),
      defaultValue: "pending",
      allowNull: false,
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.STRING), // store multiple image URLs
      allowNull: true,
      validate: {
        areUrls(value) {
          if (value && !Array.isArray(value)) {
            throw new Error("Images must be an array of URLs");
          }
          if (
            value &&
            value.some(
              (url) => typeof url !== "string" || !/^https?:\/\/.+/.test(url)
            )
          ) {
            throw new Error("Each image must be a valid URL");
          }
        },
      },
    },
  },
  {
    timestamps: true,
    tableName: "orders",
    paranoid: true,
  }
);

// Define associations
User.hasMany(Order, { foreignKey: "userId", as: "orders", onDelete: "CASCADE" });
Order.belongsTo(User, { foreignKey: "userId",as: "user" });

export default Order;
