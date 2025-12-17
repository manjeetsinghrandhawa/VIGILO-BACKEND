import { StatusCodes } from "http-status-codes";
import Alarm from "./alarm.model.js";
import userModel from "../user/user.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
// import catchAsyncError from "../middlewares/catchAsyncError.js";

export const createAlarm = async (req, res, next) => {
  try {
    const {
      alarmTitle,
      alarmSite,
      alarmType,
      alarmPriority,
      assignedGuards = [],
      etaMinutes,
      slaMinutes,
      unitPrice,
      specificLocation,
      description
    } = req.body;

    // 🔹 Basic validation
    if (
      !alarmTitle ||
      !alarmSite ||
      !alarmType ||
      !alarmPriority ||
      !slaMinutes ||
      !unitPrice
    ) {
      return next(
        new ErrorHandler(
          "Required alarm fields are missing",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 🔹 Fetch guards from userModel using IDs
    let guards = [];
    if (assignedGuards.length > 0) {
      guards = await userModel.findAll({
        where: {
          id: assignedGuards,
          role: "guard" // ensures valid guards
        },
        attributes: ["id", "name"]
      });

      if (guards.length !== assignedGuards.length) {
        return next(
          new ErrorHandler(
            "One or more guard IDs are invalid",
            StatusCodes.BAD_REQUEST
          )
        );
      }
    }

    // 🔹 Create Alarm
    const alarm = await Alarm.create({
      alarmTitle,
      siteName: alarmSite,
      alarmType,
      priority: alarmPriority,
      etaMinutes,
      slaMinutes,
      unitPrice,
      specificLocation,
      description,
      status: "active"
    });

    // 🔹 Assign guards (many-to-many)
    if (guards.length > 0) {
      await alarm.setUsers(guards); 
      // ⚠️ This assumes Alarm.belongsToMany(User)
    }

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Alarm created successfully",
      data: {
        id: alarm.id,
        alarmTitle: alarm.alarmTitle,
        siteName: alarm.siteName,
        alarmType: alarm.alarmType,
        priority: alarm.priority,
        etaMinutes: alarm.etaMinutes,
        slaMinutes: alarm.slaMinutes,
        unitPrice: alarm.unitPrice,
        specificLocation: alarm.specificLocation,
        description: alarm.description,
        status: alarm.status,
        assignedGuards: guards.map(g => ({
          id: g.id
        })),
        createdAt: alarm.createdAt
      }
    });

  } catch (error) {
      console.error("Generate Alarm Error:", error);
      return next(
        new ErrorHandler(
          "Failed to generate alarm",
          StatusCodes.INTERNAL_SERVER_ERROR
        )
      );
    }
};
