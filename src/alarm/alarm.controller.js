import { StatusCodes } from "http-status-codes";
import Alarm from "./alarm.model.js";
import userModel from "../user/user.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
import AlarmGuards from "./alarmGuards.model.js";
// import catchAsyncError from "../middlewares/catchAsyncError.js";

import sequelize from "../../config/database.js";
import User from "../user/user.model.js";

export const createAlarm = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const {
      title,
      description,
      alarmType,
      priority,
      siteName,
      specificLocation,
      guardIds,
      etaMinutes,
      slaTimeMinutes,
      unitPrice,
      price,
    } = req.body;

    /* =====================================================
       🔎 BASIC VALIDATIONS
    ===================================================== */

    if (!title || !alarmType || !priority || !siteName) {
      return res.status(400).json({
        success: false,
        message:
          "title, alarmType, priority and siteName are required fields",
      });
    }

    if (!Array.isArray(guardIds) || guardIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one guard must be assigned",
      });
    }

    if (!slaTimeMinutes || slaTimeMinutes < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid SLA time is required",
      });
    }

    if (unitPrice < 0 ) {
      return res.status(400).json({
        success: false,
        message: "Price values must be non-negative",
      });
    }

    /* =====================================================
       🔎 ENUM VALIDATION
    ===================================================== */

    const allowedAlarmTypes = [
      "intrusion",
      "panic",
      "fire",
      "medical",
      "motion",
      "other",
    ];

    const allowedPriorities = ["low", "medium", "high", "critical"];

    if (!allowedAlarmTypes.includes(alarmType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid alarmType value",
      });
    }

    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority value",
      });
    }

    /* =====================================================
       🔎 VERIFY GUARDS EXIST
    ===================================================== */

    const guards = await User.findAll({
      where: { id: guardIds },
      transaction: t,
    });

    if (guards.length !== guardIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more guardIds are invalid",
      });
    }

    /* =====================================================
       🟢 CREATE ALARM
    ===================================================== */

    const alarm = await Alarm.create(
      {
        title: title.trim(),
        description: description || null,
        alarmType,
        priority,
        siteName: siteName.trim(),
        specificLocation: specificLocation || null,
        etaMinutes: etaMinutes || null,
        slaTimeMinutes,
        unitPrice,
        price,
        status: "pending",
      },
      { transaction: t }
    );

    /* =====================================================
       🟢 CREATE ALARM GUARDS
    ===================================================== */

    const alarmGuardsData = [];

    for (const guardId of guardIds) {
      const alarmGuard = await AlarmGuards.create(
        {
          alarmId: alarm.id,
          guardId,
          status: "pending",
        },
        { transaction: t }
      );

      alarmGuardsData.push(alarmGuard);
    }

    await t.commit();

    /* =====================================================
       📤 RESPONSE
    ===================================================== */

    return res.status(201).json({
      success: true,
      type: "alarm",
      data: {
        alarm: {
          id: alarm.id,
          title: alarm.title,
          description: alarm.description,
          alarmType: alarm.alarmType,
          priority: alarm.priority,
          siteName: alarm.siteName,
          specificLocation: alarm.specificLocation,
          etaMinutes: alarm.etaMinutes,
          slaTimeMinutes: alarm.slaTimeMinutes,
          unitPrice: alarm.unitPrice,
          price: alarm.price,
          status: alarm.status,
          billed: alarm.billed,
          createdAt: alarm.createdAt,
          updatedAt: alarm.updatedAt,
        },
        guards: guards.map((guard) => ({
          id: guard.id,
          name: guard.name,
          email: guard.email,
          phone: guard.phone,
        })),
        alarmGuards: alarmGuardsData,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};