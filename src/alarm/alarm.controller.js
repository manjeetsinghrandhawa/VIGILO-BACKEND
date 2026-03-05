import { StatusCodes } from "http-status-codes";
import Alarm from "./alarm.model.js";
import userModel from "../user/user.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
import AlarmGuards from "./alarmGuards.model.js";
import PatrolSite from "../patrolling/patrolSite.model.js";
import PatrolRun from "../patrolling/patrolRun.model.js";
import { notifyGuardAndAdmin } from "../../utils/notification.helper.js";
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
        siteName: site.name,
        siteAddress: site.address || null,
        vehicleId: patrolRun.vehicleId || null,
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
               siteName: site.name,
              vehicleId: patrolRun.vehicleId,
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

export const getMyAlarms = async (req, res) => {
  try {
    const guardId = req.user?.id;

    if (!guardId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    let { page = 1, limit = 20, filter = "pending" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const offset = (page - 1) * limit;

    /* =====================================================
       🔥 VALID FILTER CHECK
    ===================================================== */

    const allowedFilters = [
      "pending",
      "ongoing",
      "completed",
      "cancelled",
      "not_respond",
      "absent",
      "delayed",
    ];

    if (!allowedFilters.includes(filter)) {
      return res.status(400).json({
        success: false,
        message: "Invalid filter value",
      });
    }

    /* =====================================================
       🔥 MAP FILTER TO ALARM STATUS
    ===================================================== */

    let alarmStatusWhere = {};

    if (filter === "pending") alarmStatusWhere.status = "pending";
    if (filter === "ongoing") alarmStatusWhere.status = "ongoing";
    if (filter === "completed") alarmStatusWhere.status = "completed";
    if (filter === "cancelled") alarmStatusWhere.status = "cancelled";
    if (filter === "not_respond") alarmStatusWhere.status = "not_respond";
    if (filter === "absent") alarmStatusWhere.status = "absent";
    if (filter === "delayed") alarmStatusWhere.status = "delayed";

    /* =====================================================
       🔥 FETCH ALARMS
    ===================================================== */

    const { count, rows } = await Alarm.findAndCountAll({
  where: alarmStatusWhere,
  include: [
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      attributes: ["id", "name", "email"],
      required: true,
      through: {
        attributes: ["status", "createdAt"],
      },
    },
    {
      model: PatrolRun,
      as: "patrolRun",
      attributes: ["id", "patrolId", "vehicleId"],
    },
    {
      model: PatrolSite,
      as: "site",
      attributes: ["id", "name"],
    },
  ],
  order: [["createdAt", "DESC"]],
  limit,
  offset,
});

    /* =====================================================
       🔥 COUNTS FOR ALL TABS
    ===================================================== */

    const countByStatus = async (status) => {
  return Alarm.count({
    where: { status },
    include: [
      {
        model: User,
        as: "guards",
        where: { id: guardId },
        required: true,
      },
    ],
  });
};

    const pendingCount = await countByStatus("pending");
    const ongoingCount = await countByStatus("ongoing");
    const completedCount = await countByStatus("completed");
    const cancelledCount = await countByStatus("cancelled");
    const notRespondCount = await countByStatus("not_respond");
    const absentCount = await countByStatus("absent");
    const delayedCount = await countByStatus("delayed");

    /* =====================================================
       🔥 FORMAT RESPONSE
    ===================================================== */

    const alarms = rows.map((alarm) => {
      const guard = alarm.guards?.[0];
const guardAssignment = guard?.AlarmGuards;

      return {
        id: alarm.id,
        title: alarm.title,
        description: alarm.description,
        alarmType: alarm.alarmType,
        priority: alarm.priority,
        patrolRunId: alarm.patrolRunId,
        patrolId: alarm.patrolId,
        vehicleId: alarm.vehicleId || null,
        siteId: alarm.siteId,
        siteName: alarm.siteName || null,
        siteAddress: alarm.siteAddress || null,
        specificLocation: alarm.specificLocation,
        etaMinutes: alarm.etaMinutes,
        slaTimeMinutes: alarm.slaTimeMinutes,
        totalTimeMinutes: alarm.totalTimeMinutes,
        unitPrice: alarm.unitPrice,
        price: alarm.price,
        status: alarm.status,
        breach: alarm.breach,
        createdAt: alarm.createdAt,
        guardAssignmentStatus: guardAssignment?.status || null,
        assignedAt: guardAssignment?.createdAt || null,
      };
    });

    return res.status(200).json({
      success: true,
      filter,
      counts: {
        pending: pendingCount,
        ongoing: ongoingCount,
        completed: completedCount,
        cancelled: cancelledCount,
        not_respond: notRespondCount,
        absent: absentCount,
        delayed: delayedCount,
      },
      data: alarms,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("GET MY ALARMS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAlarmDetailsForGuard = async (req, res) => {
  try {
    const { alarmId } = req.params;
    const guardId = req.user.id;

    /* =====================================================
       🔎 VERIFY ALARM IS ASSIGNED TO THIS GUARD
    ===================================================== */

    const alarmGuard = await AlarmGuards.findOne({
      where: {
        alarmId,
        guardId,
      },
      include: [
        {
          model: Alarm,
          as: "alarm",
          include: [
            {
              model: PatrolSite,
              as: "site",
              attributes: ["id", "name"],
            },
            {
              model: PatrolRun,
              as: "patrolRun",
              attributes: ["id", "patrolId", "vehicleId", "status"],
            },
            {
              model: User,
              as: "guards",
              attributes: ["id", "name", "email"],
              through: {
                attributes: ["status", "createdAt"],
              },
            },
          ],
        },
      ],
    });

    if (!alarmGuard) {
      return res.status(404).json({
        success: false,
        message: "Alarm not found or not assigned to you",
      });
    }

    const alarm = alarmGuard.alarm;

    /* =====================================================
       🧠 FORMAT GUARDS
    ===================================================== */

    const guards = alarm.guards.map((guard) => ({
      id: guard.id,
      name: guard.name,
      email: guard.email,
      status: guard.AlarmGuards.status,
      assignedAt: guard.AlarmGuards.createdAt,
    }));

    /* =====================================================
       📤 RESPONSE
    ===================================================== */

    return res.status(200).json({
      success: true,
      type: "alarm_details",
      data: {
        id: alarm.id,
        title: alarm.title,
        description: alarm.description,
        alarmType: alarm.alarmType,
        priority: alarm.priority,
        siteId: alarm?.siteId || null,
        siteName: alarm.siteName,
        siteAddress: alarm.siteAddress,
        patrolRunId: alarm.patrolRun.id,
        patrolId: alarm.patrolRun.patrolId,
        vehicleId: alarm.patrolRun.vehicleId,
        status: alarm.patrolRun.status,

        specificLocation: alarm.specificLocation,

        etaMinutes: alarm.etaMinutes,
        slaTimeMinutes: alarm.slaTimeMinutes,
        totalTimeMinutes: alarm.totalTimeMinutes,

        unitPrice: alarm.unitPrice,
        price: alarm.price,

        alarmStatus: alarm.status,
        guardAssignmentStatus: alarmGuard.status,

        breach: alarm.breach,
        billed: alarm.billed,

        createdAt: alarm.createdAt,
        resolvedAt: alarm.resolvedAt,

        guards,
      },
    });
  } catch (error) {
    console.error("GET ALARM DETAILS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const respondToAlarm = async (req, res) => {
  try {
    const { alarmId } = req.params;
    const { action } = req.body;
    const guardId = req.user.id;

    /* =====================================================
       🔎 VALIDATION
    ===================================================== */

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be accept or reject",
      });
    }

    /* =====================================================
       🔎 FETCH ALARM
    ===================================================== */

    const alarm = await Alarm.findByPk(alarmId);

    if (!alarm) {
      return res.status(404).json({
        success: false,
        message: "Alarm not found",
      });
    }

    if (alarm.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending alarms can be responded",
      });
    }

    /* =====================================================
       🔎 FETCH ALARM GUARD
    ===================================================== */

    const alarmGuard = await AlarmGuards.findOne({
      where: { alarmId, guardId },
    });

    if (!alarmGuard) {
      return res.status(404).json({
        success: false,
        message: "Alarm assignment not found for this guard",
      });
    }

    if (alarmGuard.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Alarm already responded",
      });
    }

    /* =====================================================
       🔎 FETCH GUARD DETAILS
    ===================================================== */

    const guard = await User.findByPk(guardId);

    if (!guard) {
      return res.status(404).json({
        success: false,
        message: "Guard not found",
      });
    }

    /* =====================================================
       ✅ ACCEPT ALARM
    ===================================================== */

    if (action === "accept") {
      alarm.status = "ongoing";
      alarmGuard.status = "ongoing";

      await alarm.save();
      await alarmGuard.save();

      await notifyGuardAndAdmin({
        guardId,
        alarmId: alarm.id,
        status: "ALARM_ACCEPTED",
        type: "ALARM",
        guardMessage: `You accepted alarm "${alarm.title}"`,
        adminMessage: `Guard accepted alarm "${alarm.title}"`,
      });

      return res.status(200).json({
        success: true,
        message: "Alarm accepted successfully",
        data: {
          alarm,
          guard,
        },
      });
    }

    /* =====================================================
       ❌ REJECT ALARM
    ===================================================== */

    if (action === "reject") {
      alarm.status = "rejected";
      alarmGuard.status = "rejected";

      await alarm.save();
      await alarmGuard.save();

      await notifyGuardAndAdmin({
        guardId,
        alarmId: alarm.id,
        status: "ALARM_REJECTED",
        type: "ALARM",
        guardMessage: `You rejected alarm "${alarm.title}"`,
        adminMessage: `Guard rejected alarm "${alarm.title}"`,
      });

      return res.status(200).json({
        success: true,
        message: "Alarm rejected successfully",
        data: {
          alarm,
          guard,
        },
      });
    }
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};