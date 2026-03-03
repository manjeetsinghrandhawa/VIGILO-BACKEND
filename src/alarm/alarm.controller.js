import { StatusCodes } from "http-status-codes";
import Alarm from "./alarm.model.js";
import userModel from "../user/user.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
import AlarmGuards from "./alarmGuards.model.js";
import PatrolSite from "../patrolling/patrolSite.model.js";
import PatrolRun from "../patrolling/patrolRun.model.js";
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
      siteId,
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

    if (!title || !alarmType || !priority || !siteId) {
      return res.status(400).json({
        success: false,
        message:
          "title, alarmType, priority and siteId are required fields",
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

    if (unitPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Unit price must be non-negative",
      });
    }

    /* =====================================================
       🔎 VERIFY SITE EXISTS
    ===================================================== */

    const site = await PatrolSite.findByPk(siteId, { transaction: t });

    if (!site) {
      return res.status(400).json({
        success: false,
        message: "Invalid siteId",
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
       🔎 FIND LATEST ONGOING PATROL CONTAINING THIS SITE
    ===================================================== */

    const ongoingPatrols = await PatrolRun.findAll({
      where: { status: "ongoing" },
      order: [["startDateTime", "DESC"]], // latest first
      transaction: t,
    });

    const patrolRun = ongoingPatrols.find((run) =>
      run.siteIds?.includes(siteId)
    );

    if (!patrolRun) {
      return res.status(400).json({
        success: false,
        message: "No ongoing patrol found for this site",
      });
    }

    /* =====================================================
       🧮 CALCULATE TOTAL TIME
    ===================================================== */

    const totalTimeMinutes =
      Number(slaTimeMinutes) + Number(etaMinutes || 0);

    /* =====================================================
       🟢 CREATE ALARM
    ===================================================== */

    const alarm = await Alarm.create(
      {
        title: title.trim(),
        description: description || null,
        alarmType,
        priority,
        patrolRunId: patrolRun.id,
        patrolId: patrolRun.patrolId, // business patrol ID
        siteId,
        specificLocation: specificLocation || null,
        etaMinutes,
        slaTimeMinutes,
        totalTimeMinutes,
        unitPrice,
        price,
        guardIds,
        status: "pending",
        breach: false,
      },
      { transaction: t }
    );

    /* =====================================================
       🟢 SAVE ALARM INTO PATROL runStructure SNAPSHOT
    ===================================================== */

    const updatedRunStructure = patrolRun.runStructure.map((site) => {
      if (site.id === siteId) {
        return {
          ...site,
          alarms: [
            ...(site.alarms || []),
            {
              id: alarm.id,
              title: alarm.title,
              alarmType: alarm.alarmType,
              priority: alarm.priority,
              status: alarm.status,
              breach: alarm.breach,
              createdAt: alarm.createdAt,
              guardIds: alarm.guardIds,
            },
          ],
        };
      }
      return site;
    });

    await patrolRun.update(
      { runStructure: updatedRunStructure },
      { transaction: t }
    );

    /* =====================================================
       🟢 CREATE ALARM GUARDS (UNCHANGED)
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
        alarm,
        patrol: {
          patrolRunId: patrolRun.id,
          patrolId: patrolRun.patrolId,
        },
        guards,
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