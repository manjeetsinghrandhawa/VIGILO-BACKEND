// controllers/scheduling/scheduling.controller.js
import Scheduling from "./scheduling.model.js";
import User from "../user/user.model.js";
import Static from "../shift/static.model.js";
import { Op } from "sequelize";
import { getTimeZone } from "../../utils/timeZone.js";
import moment from "moment-timezone";
import { StatusCodes } from "http-status-codes";
import Order from "../order/order.model.js";
import StaticGuards from "../shift/staticGuards.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
import Incident from "../incident/incident.model.js";
import Notification from "../notifications/notifications.model.js";
import { notifyGuardAndAdmin } from "../../utils/notification.helper.js";
import userModel from "../user/user.model.js";
import ShiftChangeRequest from "../order/shiftChangeRequest.model.js";
import PatrolRun from "../patrolling/patrolRun.model.js";
import PatrolGuards from "../patrolling/PatrolGuards.model.js";





export const createSchedule = async (req, res, next) => {
  try {
    const {
      description,
      startTime,
      endTime,
      date,
      endDate,
      guardIds,
      orderId,
    } = req.body;

    // =========================
    // 🔒 VALIDATIONS
    // =========================
    if (!orderId) {
      return next(
        new ErrorHandler("Order ID is required", StatusCodes.BAD_REQUEST)
      );
    }

    if (!startTime || !endTime) {
      return next(
        new ErrorHandler(
          "Start time and end time are required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    if (!Array.isArray(guardIds) || guardIds.length === 0) {
      return next(
        new ErrorHandler(
          "At least one guard must be assigned",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      return next(
        new ErrorHandler("Order not found", StatusCodes.NOT_FOUND)
      );
    }

    const guards = await User.findAll({ where: { id: guardIds } });
    if (guards.length !== guardIds.length) {
      return next(
        new ErrorHandler(
          "One or more guard IDs are invalid",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // =========================
    // 🕒 DATE & TIME SETUP
    // =========================
    const tz = getTimeZone();
    const today = moment().tz(tz);

    const startDate = moment(date).tz(tz).startOf("day");
    const finalEndDate = endDate
      ? moment(endDate).tz(tz).startOf("day")
      : startDate.clone();

    const isSameDay = startDate.isSame(finalEndDate, "day");

    const createdShifts = [];

    // =========================
    // 🔹 SAME DAY SHIFT
    // =========================
    if (isSameDay) {
      for (const guardId of guardIds) {
        let shiftStart = moment.tz(
          `${startDate.format("YYYY-MM-DD")} ${startTime}`,
          "YYYY-MM-DD HH:mm",
          tz
        );

        let shiftEnd = moment.tz(
          `${startDate.format("YYYY-MM-DD")} ${endTime}`,
          "YYYY-MM-DD HH:mm",
          tz
        );

        // 🌙 Overnight shift logic (UNCHANGED)
        if (shiftEnd.isBefore(shiftStart)) {
          shiftEnd.add(1, "day");
        }
        // ✅ Calculate total hours safely
const shiftTotalHours = shiftEnd.diff(shiftStart, "minutes") / 60;

        const shiftStatus = today.isAfter(shiftEnd)
          ? "completed"
          : "pending";

        // ✅ Create UNIQUE shift for this guard
        const shift = await Static.create({
          orderId,
          description,
          date: startDate.format("YYYY-MM-DD"),
          endDate: startDate.format("YYYY-MM-DD"),
          startTime: shiftStart.utc().toDate(),
          endTime: shiftEnd.utc().toDate(),
          type: "static",
          status: shiftStatus,
          shiftTotalHours,
        });

        // ✅ Link only ONE guard to this shift
        await StaticGuards.create({
          staticId: shift.id,
          guardId,
          status: shiftStatus,
        });

        createdShifts.push(shift);
      }
    }

    // =========================
    // 🔹 MULTI DAY SHIFT
    // =========================
     else {
      let currentDay = startDate.clone();

      while (currentDay.isSameOrBefore(finalEndDate)) {
        for (const guardId of guardIds) {
          let shiftStart = moment.tz(
            `${currentDay.format("YYYY-MM-DD")} ${startTime}`,
            "YYYY-MM-DD HH:mm",
            tz
          );

          let shiftEnd = moment.tz(
            `${currentDay.format("YYYY-MM-DD")} ${endTime}`,
            "YYYY-MM-DD HH:mm",
            tz
          );

          // 🌙 Overnight shift logic (UNCHANGED)
          if (shiftEnd.isBefore(shiftStart)) {
            shiftEnd.add(1, "day");
          }
          // ✅ Calculate total hours
const shiftTotalHours = shiftEnd.diff(shiftStart, "minutes") / 60;

          const shiftStatus = today.isAfter(shiftEnd)
            ? "completed"
            : "pending";

          // ✅ Create UNIQUE shift
          const shift = await Static.create({
            orderId,
            description,
            date: currentDay.format("YYYY-MM-DD"),
            endDate: currentDay.format("YYYY-MM-DD"),
            startTime: shiftStart.utc().toDate(),
            endTime: shiftEnd.utc().toDate(),
            type: "static",
            status: shiftStatus,
            shiftTotalHours,
          });

          // ✅ Attach ONLY this guard
          await StaticGuards.create({
            staticId: shift.id,
            guardId,
            status: shiftStatus,
          });

          createdShifts.push(shift);
        }

        currentDay.add(1, "day");
      }
    }

    // =========================
    // 📦 FETCH CREATED SHIFTS
    // =========================
    const populatedShifts = await Static.findAll({
      where: {
        id: createdShifts.map((s) => s.id),
      },
      order: [["date", "ASC"]],
      include: [
        {
          model: User,
          as: "guards",
          attributes: ["id", "name", "email"],
          through: {
            attributes: ["status", "createdAt"],
          },
        },
      ],
    });

    // =========================
    //  NOTIFICATIONS
    // =========================
    // =========================
//  PER-DAY NOTIFICATIONS
// =========================
const notifications = [];

for (const shift of createdShifts) {
  const shiftDate = moment(shift.date).format("DD MMM YYYY");

  for (const guardId of guardIds) {
    notifications.push({
      userId: guardId,
      role: "guard",
      title: "New Shift Assigned",
      message: `You have been assigned a shift on ${shiftDate} from ${startTime} to ${endTime}.`,
      type: "SHIFT_ASSIGNED",
      data: {
        orderId,
        shiftId: shift.id,
        date: shift.date,
        startTime,
        endTime,
      },
    });
  }
}

await Notification.bulkCreate(notifications);


    // =========================
    // ✅ RESPONSE
    // =========================
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Shift assigned successfully",
      data: populatedShifts,
    });
  } catch (error) {
    console.error("CREATE SCHEDULE ERROR:", error);
    return next(
      new ErrorHandler(
        "Internal server error",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


export const editSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      description,
      startTime,
      endTime,
      date,
      endDate,
      guardIds,
    } = req.body;

    const staticShift = await Static.findByPk(id);

    if (!staticShift) {
      return next(
        new ErrorHandler("Schedule not found", StatusCodes.NOT_FOUND)
      );
    }

    const tz = getTimeZone();

    /**
     * 🕒 DATE NORMALIZATION
     */
    const normalizedStartDate = date
      ? moment(date).format("YYYY-MM-DD")
      : moment(staticShift.startTime).tz(tz).format("YYYY-MM-DD");

    const normalizedEndDate = endDate
      ? moment(endDate).format("YYYY-MM-DD")
      : moment(staticShift.endTime).tz(tz).format("YYYY-MM-DD");

    /**
     * 🕒 BUILD MOMENT OBJECTS (TIMEZONE SAFE)
     */
    const shiftStartMoment = startTime
      ? moment.tz(
          `${normalizedStartDate} ${startTime}`,
          "YYYY-MM-DD HH:mm",
          tz
        )
      : moment(staticShift.startTime).tz(tz);

    const shiftEndMoment = endTime
      ? moment.tz(
          `${normalizedEndDate} ${endTime}`,
          "YYYY-MM-DD HH:mm",
          tz
        )
      : moment(staticShift.endTime).tz(tz);

    /**
     * 🌙 OVERNIGHT SHIFT HANDLING
     * (If end is before start → add 1 day)
     */
    if (shiftEndMoment.isBefore(shiftStartMoment)) {
      shiftEndMoment.add(1, "day");
    }

    /**
     * ⏱️ CALCULATE TOTAL HOURS SAFELY
     */
    const totalMinutes = shiftEndMoment.diff(shiftStartMoment, "minutes");

    if (totalMinutes <= 0) {
      return next(
        new ErrorHandler(
          "Invalid shift timing. End time must be after start time.",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    const shiftTotalHours = Number((totalMinutes / 60).toFixed(2));

    /**
     * 🔄 CONVERT TO UTC FOR DB STORAGE
     */
    const start = shiftStartMoment.utc().toDate();
    const end = shiftEndMoment.utc().toDate();

    /**
     * 🏗️ UPDATE SHIFT (INCLUDING TOTAL HOURS)
     */
    await staticShift.update({
      description: description ?? staticShift.description,
      startTime: start,
      endTime: end,
      shiftTotalHours,
    });

    /**
     * 👮 GUARD ASSIGNMENT LOGIC
     */
    if (Array.isArray(guardIds)) {
      const guards = await User.findAll({ where: { id: guardIds } });

      if (guards.length !== guardIds.length) {
        return next(
          new ErrorHandler(
            "One or more guard IDs are invalid",
            StatusCodes.BAD_REQUEST
          )
        );
      }

      const existingAssignments = await StaticGuards.findAll({
        where: { staticId: staticShift.id },
      });

      const existingGuardMap = new Map(
        existingAssignments.map((a) => [a.guardId, a])
      );

      const incomingGuardSet = new Set(guardIds);

      const toCreate = [];
      const toRemove = [];

      // Identify new guards
      for (const guardId of guardIds) {
        if (!existingGuardMap.has(guardId)) {
          toCreate.push({
            staticId: staticShift.id,
            guardId,
            status: "upcoming",
          });
        }
      }

      // Identify removed guards
      for (const assignment of existingAssignments) {
        if (!incomingGuardSet.has(assignment.guardId)) {
          toRemove.push(assignment.guardId);
        }
      }

      // Remove deleted guards
      if (toRemove.length > 0) {
        await StaticGuards.destroy({
          where: {
            staticId: staticShift.id,
            guardId: toRemove,
          },
        });
      }

      // Add new guards
      if (toCreate.length > 0) {
  const newlyCreatedShifts = [];

  for (const { guardId } of toCreate) {
    // Create new shift copying existing shift data
    const newShift = await Static.create({
      orderId: staticShift.orderId,
      description: staticShift.description,
      date: normalizedStartDate,
      endDate: normalizedEndDate,
      startTime: start,
      endTime: end,
      type: staticShift.type,
      status: staticShift.status,
      shiftTotalHours,
    });

    // Assign ONLY this guard
    await StaticGuards.create({
      staticId: newShift.id,
      guardId,
      status: staticShift.status,
    });

    newlyCreatedShifts.push({ guardId, shift: newShift });
  }

  // 🔔 Notifications for each new shift
  const notificationsPayload = newlyCreatedShifts.map(
    ({ guardId, shift }) => ({
      userId: guardId,
      role: "guard",
      title: "New Shift Assigned",
      message: "You have been assigned a new shift.",
      type: "SHIFT_ASSIGNED",
      data: {
        shiftId: shift.id,
        startTime: shiftStartMoment.format("HH:mm"),
        endTime: shiftEndMoment.format("HH:mm"),
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        totalHours: shiftTotalHours,
      },
    })
  );

  await Notification.bulkCreate(notificationsPayload);
}


      // Notify only newly added guards
      if (toCreate.length > 0) {
        const notificationsPayload = toCreate.map(({ guardId }) => ({
          userId: guardId,
          role: "guard",
          title: "New Shift Assigned",
          message: "You have been assigned a new shift.",
          type: "SHIFT_ASSIGNED",
          data: {
            shiftId: staticShift.id,
            startTime: shiftStartMoment.format("HH:mm"),
            endTime: shiftEndMoment.format("HH:mm"),
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            totalHours: shiftTotalHours,
          },
        }));

        await Notification.bulkCreate(notificationsPayload);
      }
    }

    /**
     * 📦 FETCH UPDATED SHIFT
     */
    const updatedShift = await Static.findByPk(staticShift.id, {
      include: [
        {
          model: User,
          as: "guards",
          attributes: ["id", "name", "email"],
          through: { attributes: ["status", "createdAt"] },
        },
      ],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Schedule updated successfully",
      data: updatedShift,
    });
  } catch (error) {
    console.error("EDIT SCHEDULE ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getAllSchedules = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    let { page = 1, limit, status } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 5000;

    const offset = (page - 1) * limit;
    const tz = getTimeZone();
    const now = moment().tz(tz);

    const allowedStatuses = ["absent","pending", "upcoming", "ongoing", "completed", "cancelled"];

    const { count, rows: shifts } = await Static.findAndCountAll({
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "startTime",
        "endTime",
        "status",
        "shiftTotalHours",
        "createdAt",
      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress"],
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
      order: [["startTime", "ASC"]],
      limit,
      offset,
    });

    if (!shifts.length) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "No shifts found",
        data: [],
        pagination: {
          total: 0,
          page,
          totalPages: 0,
          limit,
        },
      });
    }

    const formattedShifts = shifts.map((shift) => {
      // ⏱ Compute ONLY for UI (no DB update)
      const startLocal = moment(shift.startTime).tz(tz);
      const endLocal = moment(shift.endTime).tz(tz);

      // let computedStatus = shift.status;

      // if (shift.status === "upcoming") {
      //   if (now.isBetween(startLocal, endLocal)) computedStatus = "ongoing";
      //   else if (now.isSameOrAfter(endLocal)) computedStatus = "completed";
      // }

      return {
        id: shift.id,
        orderId: shift.orderId,
        shiftTotalHours: shift?.shiftTotalHours || null,
        orderLocationName: shift.order?.locationName || null,
        orderLocationAddress: shift.order?.locationAddress || null,
        date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
        type: shift.type,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: shift.status,          // 🔒 DB status (unchanged)
        // displayStatus: computedStatus, // 👀 UI-only
        createdAt: shift.createdAt,
        guards: Array.isArray(shift.guards)
          ? shift.guards.map((g) => ({
              id: g.id,
              name: g.name,
              email: g.email,
              assignmentStatus: g.StaticGuards?.status || "pending",
              assignedAt: g.StaticGuards?.createdAt || null,
            }))
          : [],
      };
    });

    // Optional filter
    const filteredShifts =
      status && allowedStatuses.includes(status)
        ? formattedShifts.filter((s) => s.status === status)
        : formattedShifts;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Shifts fetched successfully",
      data: filteredShifts,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("GET ALL SCHEDULES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const getMyAllShifts = async (req, res, next) => {
  try {
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    let { page = 1, limit = 20 } = req.query;
    const { filter = "all" } = req.body;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const offset = (page - 1) * limit;
    const tz = getTimeZone();
    const now = moment().tz(tz);

    /**
     * 🔥 FILTER LOGIC
     */
    let shiftWhere = {};
    let guardThroughWhere = { guardId };

    if (filter === "upcoming") {
      shiftWhere.status = "upcoming";
      guardThroughWhere.status = "accepted";
    }

    if (filter === "newRequests") {
      shiftWhere.status = "pending";
      guardThroughWhere.status = "pending";
    }

     /**
     * 📊 TOTAL COUNT (ALL SHIFTS – NO FILTER)
     */
    // ✅ ALL SHIFTS
    const allCount = await Static.count({
      include: [
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          through: { attributes: [] },
          required: true,
        },
      ],
    });

    // ✅ UPCOMING SHIFTS
    const upcomingCount = await Static.count({
      where: { status: "upcoming" },
      include: [
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          through: {
            where: { status: "accepted" },
            attributes: [],
          },
          required: true,
        },
      ],
    });

    // ✅ NEW REQUESTS
    const newRequestsCount = await Static.count({
      where: { status: "pending" },
      include: [
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          through: {
            where: { status: "pending" },
            attributes: [],
          },
          required: true,
        },
      ],
    });


    // "all" → no extra conditions

    const { count, rows: shifts } = await Static.findAndCountAll({
      where: shiftWhere,
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "startTime",
        "endTime",
        "status",
        "shiftTotalHours",
        "createdAt",
      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress"],
        },
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          attributes: ["id", "name", "email"],
          through: {
            where: guardThroughWhere,
            attributes: ["status", "createdAt"],
          },
          required: true,
        },
        {
      model: Incident,
      as: "incidents",
      required: false, // 🔑 VERY IMPORTANT (don’t filter shifts)
      attributes: [
        "id",
        "name",
        "location",
        "description",
        "images",
        "createdAt",
      ],
    },
      ],
      order: [["startTime", "DESC"]],
      limit,
      offset,
    });

    const response = [];

    for (const shift of shifts) {
      const guard = shift.guards[0];
      const assignmentStatus = guard.StaticGuards?.status;

      let finalStatus = shift.status;

    

      response.push({
        id: shift.id,
        orderId: shift.orderId,
        orderLocationName: shift.order?.locationName || null,
        orderLocationAddress: shift.order?.locationAddress || null,
        date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
        type: shift.type,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: finalStatus,
        shiftTotalHours: shift?.shiftTotalHours || null,
        createdAt: shift.createdAt,

        guard: {
          id: guard.id,
          name: guard.name,
          email: guard.email,
          assignmentStatus,
          assignedAt: guard.StaticGuards?.createdAt,
        },
        incidents: shift.incidents || [],
        incidentsCount: shift.incidents?.length || 0,

      });
    }

    // ===============================
// 🔹 PATROL COUNTS
// ===============================

// ALL PATROL RUNS
const patrolAllCount = await PatrolRun.count({
  include: [
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      through: { attributes: [] },
      required: true,
    },
  ],
});

// UPCOMING PATROL RUNS
const patrolUpcomingCount = await PatrolRun.count({
  where: { status: "upcoming" }, // adjust if your logic differs
  include: [
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      through: { where: { status: "accepted" }, attributes: [] },
      required: true,
    },
  ],
});

// PENDING PATROL RUNS
const patrolPendingCount = await PatrolRun.count({
  where: { status: "pending" },
  include: [
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      through: { where: { status: "pending" }, attributes: [] },
      required: true,
    },
  ],
});
    // **
    //  * 🔹 FETCH PATROL RUNS (ONLY FOR ALL + NEW REQUESTS)
    //  */
    let patrolResponse = [];

if (filter === "all" || filter === "newRequests") {
  let patrolWhere = {};

  if (filter === "newRequests") {
    patrolWhere.status = "pending";
  }

  

  const patrolRuns = await PatrolRun.findAll({
    where: patrolWhere,
    include: [
      {
        model: User,
        as: "guards",
        where: { id: guardId },
        attributes: ["id", "name", "email"],
        through: {
          where:
            filter === "newRequests"
              ? { status: "pending" }
              : {},
          attributes: ["status", "createdAt"],
        },
        required: true,
      },
      {
        model: Order,
        as: "order",
        attributes: [
          "locationName",
          "locationAddress",
          "serviceType",
        ],
      },
    ],
    order: [["startDateTime", "DESC"]],
  });



  patrolResponse = patrolRuns.map((run) => {
    const guard = run.guards[0];
    const guardStatus = guard.PatrolGuards?.status;

    return {
      id: run.id,
      patrolId: run.patrolId,
      vehicleId: run.vehicleId,
      orderId: run.orderId,
      orderLocationName: run.order?.locationName || null,
      orderLocationAddress: run.order?.locationAddress || null,
      date: moment.utc(run.startDateTime).format("YYYY-MM-DD"),
      type: run.order?.serviceType || "patrol",
      description: run.notes || "Patrol Run",
      startTime: run.startDateTime,
      endTime: run.estimatedCompletion,
      status: run.status,
      shiftTotalHours: null,
      createdAt: run.createdAt,
      totalSites: run.totalSites,
      totalSubSites: run.totalSubSites,
      totalCheckpoints: run.totalCheckpoints,
      completedSites: run.completedSites,
      completedSubSites: run.completedSubSites,
      completedCheckpoints: run.completedCheckpoints,
      guard: {
        id: guard?.id,
        name: guard?.name,
        email: guard?.email,
        guardStatus: guardStatus || "unknown",
        assignedAt: guard.PatrolGuards?.createdAt,
      },
    };
  });
}

    /**
     * =====================================
     * 🔥 MERGE + SORT + PAGINATE
     * =====================================
     */
    let combined = [...response, ...patrolResponse];

    combined.sort(
      (a, b) => new Date(b.startTime) - new Date(a.startTime)
    );

    const totalCombined = combined.length;
    const paginatedData = combined.slice(offset, offset + limit);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Shifts fetched successfully",
      filter,
      counts: {
 counts: {
  all: allCount + patrolAllCount,
  upcoming: upcomingCount + patrolUpcomingCount,
  newRequests: newRequestsCount + patrolPendingCount,
},
},
      data: paginatedData,
      pagination: {
        total: totalCombined,
        page,
        totalPages: Math.ceil(totalCombined / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("GET MY ALL SHIFTS ERROR:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


// export const getMySchedules = async (req, res, next) => {
//   try {
//     const guardId = req.user?.id;

//     if (!guardId) {
//       return next(
//         new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
//       );
//     }

//     let { page = 1, limit = 20, status } = req.query;

//     page = parseInt(page);
//     limit = parseInt(limit);
//     if (isNaN(page) || page < 1) page = 1;
//     if (isNaN(limit) || limit < 1) limit = 20;

//     const offset = (page - 1) * limit;

//     const tz = getTimeZone();
//     const now = moment().tz(tz);
//     const allowedStatuses = ["upcoming", "ongoing", "completed"];

//     const { count, rows: shifts } = await Static.findAndCountAll({
//       attributes: [
//         "id",
//         "orderId",
//         "type",
//         "description",
//         "startTime",
//         "endTime",
//         "status",
//         "createdAt",
//       ],
//       include: [
//         {
//           model: Order,
//           as: "order",
//           attributes: ["locationName", "locationAddress"],
//         },
//         {
//           model: User,
//           as: "guards",
//           where: { id: guardId }, // 🔥 FILTER BY LOGGED-IN GUARD
//           attributes: ["id", "name", "email"],
//           through: {
//             attributes: ["status", "createdAt"],
//           },
//           required: true, // 🔥 IMPORTANT
//         },
//       ],
//       order: [["startTime", "ASC"]],
//       limit,
//       offset,
//     });

//     if (!shifts.length) {
//       return res.status(StatusCodes.OK).json({
//         success: true,
//         message: "No shifts found",
//         data: [],
//         pagination: {
//           total: 0,
//           page,
//           totalPages: 0,
//           limit,
//         },
//       });
//     }

//     const formattedShifts = [];

//     for (const shift of shifts) {
//       const startLocal = moment(shift.startTime).tz(tz);
//       const endLocal = moment(shift.endTime).tz(tz);

//       let finalStatus = shift.status;

// // 🔒 DO NOT override manual terminal states
//       const lockedStatuses = ["ended_early", "missed_respond"];

//       if (!lockedStatuses.includes(shift.status)) {

//         // ❌ Guard never responded to shift request
//         if (
//           shift.status === "pending" &&
//           assignment?.status === "pending" &&
//           now.isAfter(endLocal)
//         ) {
//           finalStatus = "missed_respond";
//         }

//         // ⏳ UPCOMING
//         else if (now.isBefore(startLocal)) {
//           finalStatus = "upcoming";
//         }

//         // ▶️ ONGOING
//         else if (now.isBetween(startLocal, endLocal)) {
//           finalStatus = "ongoing";
//         }

//         // ✅ COMPLETED
//         else if (now.isSameOrAfter(endLocal)) {
//           finalStatus = "completed";
//         }

//         // 🔥 Update DB only here
//         if (finalStatus !== shift.status) {
//           try {
//             await shift.update({ status: finalStatus });
//           } catch (err) {
//             console.warn(`Shift ${shift.id} status update failed`);
//           }
//         }
//       }


//       const guard = shift.guards[0]; // only one guard here

//       formattedShifts.push({
//         id: shift.id,
//         orderId: shift.orderId,
//         orderLocationName: shift.order?.locationName || null,
//         orderLocationAddress: shift.order?.locationAddress || null,
//         date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
//         type: shift.type,
//         description: shift.description,
//         startTime: shift.startTime,
//         endTime: shift.endTime,
//         status: finalStatus,
//         createdAt: shift.createdAt,
//         guard: {
//           id: guard.id,
//           name: guard.name,
//           email: guard.email,
//           assignmentStatus: guard.StaticGuards?.status || "pending",
//           assignedAt: guard.StaticGuards?.createdAt || null,
//         },
//       });
//     }

//     const filteredShifts =
//       status && allowedStatuses.includes(status)
//         ? formattedShifts.filter((s) => s.status === status)
//         : formattedShifts;

//     return res.status(StatusCodes.OK).json({
//       success: true,
//       message: "My shifts fetched successfully",
//       data: filteredShifts,
//       pagination: {
//         total: count,
//         page,
//         totalPages: Math.ceil(count / limit),
//         limit,
//       },
//     });
//   } catch (error) {
//     console.error("GET MY SCHEDULES ERROR:", error.stack || error);
//     return res.status(500).json({
//       status: "error",
//       message: error.message,
//     });
//   }
// };

export const getMyUpcomingSchedules = async (req, res, next) => {
  try {
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    let { page = 1, limit = 20 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const offset = (page - 1) * limit;

    const tz = getTimeZone();
    const now = moment().tz(tz);

    const { count, rows: shifts } = await Static.findAndCountAll({
      where: {
        status: "upcoming", // ✅ ONLY upcoming shifts
      },
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "startTime",
        "endTime",
        "status",
        "shiftTotalHours",
        "createdAt",
      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress"],
        },
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          attributes: ["id", "name", "email"],
          through: {
            where: { status: "accepted" }, // ✅ guard must have accepted
            attributes: ["status", "createdAt"],
          },
          required: true,
        },
      ],
      order: [["startTime", "ASC"]],
      limit,
      offset,
    });

    const upcomingShifts = [];

    for (const shift of shifts) {
      const startLocal = moment(shift.startTime).tz(tz);

      // ✅ Extra safety: ensure future shifts only
      if (!now.isBefore(startLocal)) continue;

      const guard = shift.guards[0];

      upcomingShifts.push({
        id: shift.id,
        orderId: shift.orderId,
        orderLocationName: shift.order?.locationName || null,
        orderLocationAddress: shift.order?.locationAddress || null,
        date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
        type: shift.type,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        shiftTotalHours: shift?.shiftTotalHours || null,
        status: shift.status, // always "upcoming"
        createdAt: shift.createdAt,
        guard: {
          id: guard.id,
          name: guard.name,
          email: guard.email,
          assignmentStatus: guard.StaticGuards?.status || "accepted",
          assignedAt: guard.StaticGuards?.createdAt || null,
        },
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Upcoming shifts fetched successfully",
      data: upcomingShifts,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("GET MY UPCOMING SCHEDULES ERROR:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getMyNewShiftRequests = async (req, res, next) => {
  try {
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    let { page = 1, limit = 20 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const offset = (page - 1) * limit;

    const tz = getTimeZone();
    const now = moment().tz(tz);

    const { count, rows: shifts } = await Static.findAndCountAll({
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "startTime",
        "endTime",
        "status",
        "shiftTotalHours",
        "createdAt",
      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress"],
        },
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          attributes: ["id", "name", "email"],
          through: {
            where: { status: "pending" },
            attributes: ["status", "createdAt"],
          },
          required: true,
        },
      ],
      order: [["startTime", "ASC"]],
      limit,
      offset,
    });

    const newRequests = [];

    for (const shift of shifts) {
      const startLocal = moment(shift.startTime).tz(tz);

      // Ignore already started shifts
      if (now.isSameOrAfter(startLocal)) continue;

      const guard = shift.guards[0];

      newRequests.push({
        id: shift.id,
        orderId: shift.orderId,
        orderLocationName: shift.order?.locationName || null,
        orderLocationAddress: shift.order?.locationAddress || null,
        date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
        type: shift.type,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        shiftTotalHours: shift?.shiftTotalHours || null,
        status: "pending",
        createdAt: shift.createdAt,
        guard: {
          id: guard.id,
          name: guard.name,
          email: guard.email,
          assignmentStatus: guard.StaticGuards?.status,
          assignedAt: guard.StaticGuards?.createdAt,
        },
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "New shift requests fetched successfully",
      data: newRequests,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("GET MY NEW SHIFT REQUESTS ERROR:", error.stack || error);
    return next(
      new ErrorHandler(
        "Failed to fetch new shift requests",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};




// Delete a schedule by ID
export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Schedule ID is required",
      });
    }

    const schedule = await Static.findByPk(id);

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    await schedule.destroy();

    return res.status(200).json({
      success: true,
      message: "Schedule deleted successfully",
    });
  } catch (error) {
    console.error("DELETE SCHEDULE ERROR:", error.stack || error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// FORMAT TIME: "HH:MM"
const formatTime = (date) => {
  if (!date) return null;
  return date.toTimeString().slice(0, 5);
};

// FORMAT DATE: "YYYY-MM-DD"
const formatDate = (date) => {
  if (!date) return null;
  return date.toISOString().split("T")[0];
};

// SHIFT DURATION: Converts ms → "Xh Ym"
const getShiftDuration = (start, end) => {
  if (!start || !end) return null;

  let diffMs = end - start;
  if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // handle overnight shift

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

// CLOCK-IN completed for both static shifts and patrol runs (with safety checks and detailed responses)
export const clockIn = async (req, res, next) => {
  try {
    const { staticId, patrolRunId, guardId, type } = req.body;

const shiftId = type === "static" ? staticId : patrolRunId;

if (!shiftId || !guardId || !type) {
  return next(
    new ErrorHandler("shiftId, guardId and type are required", 400)
  );
}

    const isStatic = type === "static";
    const ShiftModel = isStatic ? Static : PatrolRun;
    const ShiftGuardModel = isStatic ? StaticGuards : PatrolGuards;
    const shiftAlias = isStatic ? "static" : "patrolRun";

    // 🚫 Guard already in an active shift
const activeShift = await ShiftGuardModel.findOne({
  where: { guardId, status: "ongoing" },
  include: [
    {
      model: ShiftModel,
      as: shiftAlias,
      attributes: isStatic
  ? [
      "id",
      "orderId",
      "type",
      "description",
      "startTime",
      "endTime",
      "status",
      "shiftTotalHours",
      "createdAt",
    ]
  : [
      "id",
      "orderId",
      "notes",
      "startDateTime",
      "estimatedCompletion",
      "status",
      "createdAt",
    ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress"],
        },
      ],
    },
  ],
});

if (activeShift) {
  const shift = activeShift[shiftAlias];
  // 🛑 Safety check
  if (!shift) {
    return res.status(400).json({
      success: false,
      message: "Active shift found but shift details are missing.",
      assignmentId: activeShift.id,
      shiftId: shift.id,
      shiftType: type,
      orderId: shift.orderId,
    });
  }
  const shiftStart = new Date(
  isStatic ? shift.startTime : shift.startDateTime
);

const shiftEnd = new Date(
  isStatic ? shift.endTime : shift.estimatedCompletion
);

  return res.status(400).json({
    success: false,
    message:
      "You must clock out from the previous shift before starting a new one.",
    activeShift: {
      assignmentId: activeShift.id,
      shiftId: shift.id,
      shiftType: type,
      orderId: shift.orderId,
      guardId: guardId,
      guardName: activeShift.User?.name || null,
      guardName: activeShift.name || null,
      guardStatus: activeShift.status,

      // 📍 Location details
      locationName: shift.order?.locationName || null,
      locationAddress: shift.order?.locationAddress || null,

      // 🕒 Shift timing
      shiftDate: formatDate(shiftStart),
      startTime: formatTime(shiftStart),
      endTime: formatTime(shiftEnd),
      shiftTotalHours: shift?.shiftTotalHours || null,

      // 📌 Status info
      shiftStatus: shift.status,
      assignmentStatus: activeShift.status,

      // ⏱️ Clock-in info
      clockInTime: activeShift.clockInTime
        ? formatTime(activeShift.clockInTime)
        : null,

      // 📝 Extra context
      description: isStatic ? shift.description : shift.notes,
      createdAt: shift.createdAt,
    },
  });
}


    // Fetch assignment
    const assignment = await ShiftGuardModel.findOne({
      where: {
  [isStatic ? "staticId" : "patrolRunId"]: shiftId,
  guardId,
},
      include: [{ model: ShiftModel, as: shiftAlias }],
    });

    if (!assignment) {
      return next(new ErrorHandler("Shift assignment not found", 404));
    }

    const shift = assignment[shiftAlias];
    if (!shift) {
      return next(new ErrorHandler("Shift details missing", 404));
    }

    // 🚫 Only upcoming shifts
    if (shift.status !== "upcoming") {
      return res.status(400).json({
        success: false,
        message: "Clock-in is allowed only for upcoming shifts",
      });
    }

    if (assignment.clockInTime) {
      return next(new ErrorHandler("You have already clocked in", 400));
    }

    const now = new Date();
    const shiftStart = new Date(
  isStatic ? shift.startTime : shift.startDateTime
);

const shiftEnd = new Date(
  isStatic ? shift.endTime : shift.estimatedCompletion
);

    const oneHourBeforeStart = new Date(shiftStart.getTime() - 60 * 60 * 1000);
    const oneHourAfterEnd = new Date(shiftEnd.getTime() + 60 * 60 * 1000);

    let warnings = [];

    // 🚫 Too early
    if (now < oneHourBeforeStart) {
      return res.status(400).json({
        success: false,
        message: "Clock-in is allowed only 1 hour before shift start",
        allowedAfter: oneHourBeforeStart,
      });
    }

    // 🚫 Too late (missed completely)
    if (now > shiftEnd) {
      assignment.status = "absent";
      await assignment.save();

      await shift.update({ status: "absent" });

      // 🔔 Optional notification hook
      await notifyGuardAndAdmin({
        guardId,
        shiftId: shift.id,
        status: "ABSENT_NO_CLOCK_IN",
        type: "CLOCK_IN",
        guardMessage: `You missed clocking in for shift ${formatDate(
          shiftStart
        )}. Please inform your supervisor.`,
        adminMessage: `Guard marked absent (missed clock-in) for shift on ${formatDate(
          shiftStart
        )}.`,
      });

      return res.status(400).json({
        success: false,
        message:
          "Shift timing is already completed. You are marked absent.",
        data: {
          shiftId: shift.id,
          shiftDate: formatDate(shiftStart),
          startTime: formatTime(shiftStart),
          endTime: formatTime(shiftEnd),
          attemptedAt: formatTime(now),
          shiftTotalHours: shift?.shiftTotalHours || null,
          status: "absent",
        },
      });
    }

    // ⚠️ Late clock-in (between startTime and endTime)
    if (now > shiftStart && now <= shiftEnd) {
      const lateMinutes = Math.floor(
        (now.getTime() - shiftStart.getTime()) / (1000 * 60)
      );
      warnings.push(`You are late by ${lateMinutes} minutes`);
    }

    // ⚠️ Shift already completed (clock-in after endTime but within 1 hr)
// ❌ Shift completed → mark ABSENT and block clock-in
if (now > shiftEnd && now <= oneHourAfterEnd) {
  // 🔴 Mark assignment absent
  assignment.status = "absent";
  await assignment.save();

  // 🔴 Mark shift absent
  await shift.update({ status: "absent" });

  return res.status(400).json({
    success: false,
    message: "Shift already completed. You are marked absent.",
    data: {
      shiftId: shift.id,
      shiftDate: formatDate(shiftStart),
      shiftStartTime: formatTime(shiftStart),
      shiftEndTime: formatTime(shiftEnd),
      attemptedAt: formatTime(now),
        shiftTotalHours: shift?.shiftTotalHours || null,
      status: "absent",
    },
  });
}


    // 🚫 No overtime if next shift starts immediately
    const nextShift = await ShiftGuardModel.findOne({
      where: { guardId },
      include: [
        {
          model: ShiftModel,
          as: shiftAlias,
          where: {
  [isStatic ? "startTime" : "startDateTime"]: shiftEnd,
},
        },
      ],
    });

    if (nextShift) {
      warnings.push("Next shift starts immediately. Overtime not allowed.");
    }

    // ✅ CLOCK-IN
assignment.clockInTime = now;
assignment.status = "ongoing";
await assignment.save();

// ✅ Update shift status
await shift.update({ status: "ongoing" });

// 🔔 Notifications
const guard = await User.findByPk(guardId, {
  attributes: ["id", "name"],
});

// ⏱️ Late or on-time logic
if (now > shiftStart) {
  const lateMinutes = Math.floor(
    (now.getTime() - shiftStart.getTime()) / (1000 * 60)
  );

  await notifyGuardAndAdmin({
    guardId,
    shiftId: shiftId,
    status: "CLOCK_IN_LATE",
    type: "CLOCK_IN",
    guardMessage: `You clocked in late by ${lateMinutes} minutes.`,
    adminMessage: `Guard ${guard?.name || "Guard"} clocked in late by ${lateMinutes} minutes.`,
  });
} else {
  await notifyGuardAndAdmin({
    guardId,
    shiftId: shiftId,
    status: "CLOCK_IN_SUCCESS",
    type: "CLOCK_IN",
    guardMessage: `You clocked in successfully at ${formatTime(now)}.`,
    adminMessage: `Guard ${guard?.name || "Guard"} clocked in successfully at ${formatTime(now)}.`,
  });
}


    return res.status(200).json({
      success: true,
      message: `Clock-In successful at ${formatTime(now)}`,
      warnings,
      data: {
        shiftId: shiftId,
        shiftStatus: shift.status,
        guardId,
        guardName: guard?.name || null,
        guardStatus: assignment.status,
        shiftType: type,
        shiftDate: formatDate(shiftStart),
        shiftTotalHours: shift?.shiftTotalHours || null,
        clockInTime: formatTime(now),
        shiftStartTime: formatTime(shiftStart),
        shiftEndTime: formatTime(shiftEnd),
      },
    });
  } catch (error) {
    console.error("CLOCK-IN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



// CLOCK-OUT completed for both static shifts and patrol runs (with overtime calculation and detailed responses)
export const clockOut = async (req, res, next) => {
  try {
    const { staticId, patrolRunId, guardId, type } = req.body;

    const shiftId = type === "static" ? staticId : patrolRunId;

    if (!shiftId || !guardId || !type) {
      return next(
        new ErrorHandler("shiftId, guardId and type are required", 400)
      );
    }

    const isStatic = type === "static";
    const ShiftModel = isStatic ? Static : PatrolRun;
    const ShiftGuardModel = isStatic ? StaticGuards : PatrolGuards;
    const shiftAlias = isStatic ? "static" : "patrolRun";

    // Fetch assignment
    const assignment = await ShiftGuardModel.findOne({
      where: {
        [isStatic ? "staticId" : "patrolRunId"]: shiftId,
        guardId,
      },
      include: [{ model: ShiftModel, as: shiftAlias }],
    });

    if (!assignment) {
      return next(new ErrorHandler("Shift assignment not found", 404));
    }

    if (!assignment.clockInTime) {
      return next(new ErrorHandler("You have not clocked in yet", 400));
    }

    if (assignment.clockOutTime) {
      return next(new ErrorHandler("You have already clocked out", 400));
    }

    const shift = assignment[shiftAlias];
    const now = new Date();
    const clockIn = new Date(assignment.clockInTime);

    const shiftStart = new Date(
      isStatic ? shift.startTime : shift.startDateTime
    );

    const shiftEnd = new Date(
      isStatic ? shift.endTime : shift.estimatedCompletion
    );

    let warnings = [];
    let assignmentStatus = "completed";
    let shiftStatus = "completed";

    /**
     * ======================================================
     * STATIC SHIFT LOGIC (UNCHANGED)
     * ======================================================
     */

    if (isStatic) {
      const oneHourAfterEnd = new Date(shiftEnd.getTime() + 60 * 60 * 1000);
      const thirtyMinAfterEnd = new Date(shiftEnd.getTime() + 30 * 60 * 1000);

      // 🚫 Too late → ABSENT
      if (now > oneHourAfterEnd) {
        assignment.status = "absent";
        assignment.clockOutTime = null;
        await assignment.save();

        await shift.update({ status: "absent" });

        return res.status(400).json({
          success: false,
          message: "Shift marked as absent due to late clock-out",
          data: {
            shiftEndTime: formatTime(shiftEnd),
            allowedTill: formatTime(oneHourAfterEnd),
          },
        });
      }

      // ⚠️ Early clock-out
      if (now < shiftEnd) {
        assignmentStatus = "ended_early";
        shiftStatus = "ended_early";
        warnings.push("Shift ended early.");
      }

      // ⚠️ Late but acceptable
      if (now > thirtyMinAfterEnd) {
        warnings.push("Late_clock-out");
      }
    }

    /**
     * ======================================================
     * PATROL RUN LOGIC (NEW)
     * ======================================================
     */

    if (!isStatic) {
      if (!["ongoing", "delayed","absent"].includes(shift.status)) {
        return res.status(400).json({
          success: false,
          message: "Patrol run can only be clocked out from ongoing or delayed status",
        });
      }

      // ongoing → check completion
      if (shift.status === "ongoing") {
        if (now >= shiftEnd) {
          shiftStatus = "completed";
          assignmentStatus = "completed";
        } else {
          warnings.push("Patrol run ended before estimated completion.");
        }
      }

      // delayed → remain delayed
      if (shift.status === "delayed") {
        shiftStatus = "delayed";
        assignmentStatus = "completed";
      }

      // absent → remain absent
      if (shift.status === "absent") {
        shiftStatus = "absent";
        assignmentStatus = "completed";
      }
    }

    /**
     * ======================================================
     * CALCULATE HOURS
     * ======================================================
     */

    const totalMs = now - clockIn;
    const totalHours = Number((totalMs / (1000 * 60 * 60)).toFixed(2));

    /**
     * ======================================================
     * SAVE
     * ======================================================
     */

    assignment.clockOutTime = now;
    assignment.totalHours = totalHours;
    assignment.status = assignmentStatus;

    await assignment.save();

    await shift.update({ status: shiftStatus });
    await assignment.update({status: assignmentStatus});

    /**
     * ======================================================
     * NOTIFICATIONS
     * ======================================================
     */

    await notifyGuardAndAdmin({
      guardId,
      shiftId,
      status: shiftStatus,
      guardMessage: "You have successfully clocked out.",
      adminMessage: "Guard clocked out successfully.",
      type: "CLOCK_OUT",
    });

    /**
     * ======================================================
     * RESPONSE
     * ======================================================
     */

    return res.status(200).json({
      success: true,
      message: "Clock-Out successful",
      warnings,
      data: {
        shiftType: type,
        shiftDate: formatDate(shiftStart),
        clockInTime: formatTime(clockIn),
        clockOutTime: formatTime(now),
        shiftStartTime: formatTime(shiftStart),
        shiftEndTime: formatTime(shiftEnd),
        shiftTotalHours: shift?.shiftTotalHours || null,
        totalHours,
        assignmentStatus,
        shiftStatus,
      },
    });
  } catch (error) {
    console.error("CLOCK-OUT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getTotalLoginHours = (clockInTime, clockOutTime, now) => {
  if (!clockInTime) return "00.00";

  const end = clockOutTime ? moment(clockOutTime) : now;

  return moment
    .duration(end.diff(moment(clockInTime)))
    .asHours()
    .toFixed(2);
};


export const getMyTodayShiftCard = async (req, res) => {
  try {
    const guardId = req.user?.id;
    if (!guardId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const tz = getTimeZone();
    const now = moment().tz(tz);
    const graceMinutes = 10;
    const COMPLETED_VISIBLE_MINUTES = 10;


    /**
 * 0️⃣ OVERTIME STARTED shift (highest priority)
 */
let shift = await Static.findOne({
  where: {
    status: "overtime_started",
  },
  include: [
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      through: {
        where: { status: "overtime_started" },
        attributes: [
          "clockInTime",
          "clockOutTime",
          "overtimeStartTime",
          "overtimeEndTime",
          "overtimeHours",
        ],
      },
      required: true,
    },
    {
      model: Order,
      as: "order",
      attributes: ["locationName", "locationAddress"],
    },
     {
      model: Incident,
      as: "incidents",
      required: false, // 🔑 VERY IMPORTANT (don’t filter shifts)
      attributes: [
        "id",
        "name",
        "location",
        "description",
        "images",
        "createdAt",
      ],
    },
  ],
  order: [["startTime", "ASC"]],
});

/**
 * 1️⃣ RECENTLY COMPLETED shift (within 10 minutes)
 */
if (!shift) {
  const completedThreshold = moment(now)
    .subtract(COMPLETED_VISIBLE_MINUTES, "minutes")
    .toDate();

  shift = await Static.findOne({
    where: {
      status: "completed",
    },
    include: [
      {
        model: User,
        as: "guards",
        where: { id: guardId },
        through: {
          where: {
            status: "completed",
            clockOutTime: {
              [Op.gte]: completedThreshold, // 🔥 KEY LINE
            },
          },
          attributes: [
            "clockInTime",
            "clockOutTime",
            "overtimeStartTime",
            "overtimeEndTime",
            "overtimeHours",
          ],
        },
        required: true,
      },
      {
        model: Order,
        as: "order",
        attributes: ["locationName", "locationAddress"],
      },
       {
      model: Incident,
      as: "incidents",
      required: false, // 🔑 VERY IMPORTANT (don’t filter shifts)
      attributes: [
        "id",
        "name",
        "location",
        "description",
        "images",
        "createdAt",
      ],
    },
    ],
    order: [["endTime", "DESC"]],
  });
}


    /**
 * 1️⃣ ONGOING shift
 */
if (!shift) {
  shift = await Static.findOne({
    where: {
      status: "ongoing",
    },
    include: [
      {
        model: User,
        as: "guards",
        where: { id: guardId },
        through: {
          where: { status: "ongoing" },
          attributes: [
            "clockInTime",
            "clockOutTime",
            "overtimeStartTime",
            "overtimeEndTime",
            "overtimeHours",
          ],
        },
        required: true,
      },
      {
        model: Order,
        as: "order",
        attributes: ["locationName", "locationAddress"],
      },
       {
      model: Incident,
      as: "incidents",
      required: false, // 🔑 VERY IMPORTANT (don’t filter shifts)
      attributes: [
        "id",
        "name",
        "location",
        "description",
        "images",
        "createdAt",
      ],
    },
    ],
    order: [["startTime", "ASC"]],
  });
}

/**
 * 2️⃣ PATROL ONGOING
 */
if (!shift) {

  const patrol = await PatrolRun.findOne({
    where: {
      status: "ongoing",
    },
    attributes: [
        "id",
        "patrolId",
        "vehicleId",
        "notes",
        "status",
        "startDateTime",
        "estimatedCompletion",
        "runStructure",
        "createdAt",
        "updatedAt",
        "totalSites",
        "completedSites",
        "totalSubSites",
        "completedSubSites",
        "totalCheckpoints",
        "completedCheckpoints",

      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: [
            "id",
            "locationName",
            "locationAddress",
            "images",
            "serviceType",
            "startDate",
            "startTime",
            "status",
          ],
          include: [
            {
              model: User,
              as: "user", // client
              attributes: ["id", "name", "email", "mobile","avatar"],
            },
          ],
        },
        {
          model: User,
          as: "guards",
          where: { id: guardId }, // REQUIRED
          required: true,
          attributes: ["id", "name", "email", "avatar"],
          through: {
            attributes: [
              "status",
              "clockInTime",
              "clockOutTime",
              "overtimeStartTime",
              "overtimeEndTime",
              "overtimeHours",
              "totalHours",
              "createdAt",
            ],
          },
        },
      ],
    order: [["startDateTime", "ASC"]],
  });

  if (patrol) {

  const guard = patrol.guards.find(g => g.id === guardId);
  const pivot = guard?.PatrolGuards;

  const clockInTime = pivot?.clockInTime || null;
  const clockOutTime = pivot?.clockOutTime || null;

  const overtimeStartTime = pivot?.overtimeStartTime || null;
  const overtimeEndTime = pivot?.overtimeEndTime || null;
  const overtimeHours = pivot?.overtimeHours || null;

  return res.status(200).json({
    success: true,
    type: "patrol",
    data: {

      patrol: {
        id: patrol.id,
        patrolId: patrol.patrolId,
        vehicleId: patrol.vehicleId,
        notes: patrol.notes,
        status: patrol.status,

        startTime: patrol.startDateTime,
        endTime: patrol.estimatedCompletion,

        totalSites: patrol.totalSites,
        completedSites: patrol.completedSites,

        totalSubSites: patrol.totalSubSites,
        completedSubSites: patrol.completedSubSites,

        totalCheckpoints: patrol.totalCheckpoints,
        completedCheckpoints: patrol.completedCheckpoints,

        runStructure: patrol.runStructure,
      },

      order: patrol.order || null,

      client: patrol.order?.user || null,

      guards: patrol.guards || [],

      timing: {
        startTime: patrol.startDateTime,
        endTime: patrol.estimatedCompletion,
      },

      attendance: {
        clockInTime,
        clockOutTime,

        overtime: {
          overtimeStartTime,
          overtimeEndTime,
          overtimeHours,
        },
      },

      progress: {
        sites: {
          total: patrol.totalSites,
          completed: patrol.completedSites,
        },
        subSites: {
          total: patrol.totalSubSites,
          completed: patrol.completedSubSites,
        },
        checkpoints: {
          total: patrol.totalCheckpoints,
          completed: patrol.completedCheckpoints,
        },
      },

      meta: {
        createdAt: patrol.createdAt,
        updatedAt: patrol.updatedAt,
      },
    },
  });

}
}

/**
 * 3️⃣ PATROL DELAYED
 */
if (!shift) {

  const patrol = await PatrolRun.findOne({
    where: {
      status: "delayed",
    },
    attributes: [
        "id",
        "patrolId",
        "vehicleId",
        "notes",
        "status",
        "startDateTime",
        "estimatedCompletion",
        "runStructure",
        "createdAt",
        "updatedAt",
        "totalSites",
        "completedSites",
        "totalSubSites",
        "completedSubSites",
        "totalCheckpoints",
        "completedCheckpoints",
      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: [
            "id",
            "locationName",
            "locationAddress",
            "images",
            "serviceType",
            "startDate",
            "startTime",
            "status",
          ],
          include: [
            {
              model: User,
              as: "user", // client
              attributes: ["id", "name", "email", "mobile","avatar"],
            },
          ],
        },
        {
          model: User,
          as: "guards",
          where: { id: guardId }, // REQUIRED
          required: true,
          attributes: ["id", "name", "email", "avatar"],
          through: {
            attributes: [
              "status",
              "clockInTime",
              "clockOutTime",
              "overtimeStartTime",
              "overtimeEndTime",
              "overtimeHours",
              "totalHours",
              "createdAt",
            ],
          },
        },
      ],
    order: [["startDateTime", "ASC"]],
  });

  if (patrol) {

  const guard = patrol.guards.find(g => g.id === guardId);
  const pivot = guard?.PatrolGuards;

  const clockInTime = pivot?.clockInTime || null;
  const clockOutTime = pivot?.clockOutTime || null;

  const overtimeStartTime = pivot?.overtimeStartTime || null;
  const overtimeEndTime = pivot?.overtimeEndTime || null;
  const overtimeHours = pivot?.overtimeHours || null;

  return res.status(200).json({
    success: true,
    type: "patrol",
    data: {

      patrol: {
        id: patrol.id,
        patrolId: patrol.patrolId,
        vehicleId: patrol.vehicleId,
        notes: patrol.notes,
        status: patrol.status,

        startTime: patrol.startDateTime,
        endTime: patrol.estimatedCompletion,

        totalSites: patrol.totalSites,
        completedSites: patrol.completedSites,

        totalSubSites: patrol.totalSubSites,
        completedSubSites: patrol.completedSubSites,

        totalCheckpoints: patrol.totalCheckpoints,
        completedCheckpoints: patrol.completedCheckpoints,

        runStructure: patrol.runStructure,
      },

      order: patrol.order || null,

      client: patrol.order?.user || null,

      guards: patrol.guards || [],

      timing: {
        startTime: patrol.startDateTime,
        endTime: patrol.estimatedCompletion,
      },

      attendance: {
        clockInTime,
        clockOutTime,

        overtime: {
          overtimeStartTime,
          overtimeEndTime,
          overtimeHours,
        },
      },

      progress: {
        sites: {
          total: patrol.totalSites,
          completed: patrol.completedSites,
        },
        subSites: {
          total: patrol.totalSubSites,
          completed: patrol.completedSubSites,
        },
        checkpoints: {
          total: patrol.totalCheckpoints,
          completed: patrol.completedCheckpoints,
        },
      },

      meta: {
        createdAt: patrol.createdAt,
        updatedAt: patrol.updatedAt,
      },
    },
  });

}
}

    /**
 * 2️⃣ NEXT UPCOMING shift (nearest future)
 */
if (!shift) {
  shift = await Static.findOne({
    where: {
      status: "upcoming",
      endTime: {
        [Op.gte]: now.toDate(), // ✅ FIX
      },
    },
    include: [
      {
        model: User,
        as: "guards",
        where: { id: guardId },
        through: {
          where: { status: "accepted" },
          attributes: [
            "clockInTime",
            "clockOutTime",
            "overtimeStartTime",
            "overtimeEndTime",
            "overtimeHours",
          ],
        },
        required: true,
      },
      {
        model: Order,
        as: "order",
        attributes: ["locationName", "locationAddress"],
      },
       {
      model: Incident,
      as: "incidents",
      required: false, // 🔑 VERY IMPORTANT (don’t filter shifts)
      attributes: [
        "id",
        "name",
        "location",
        "description",
        "images",
        "createdAt",
      ],
    },
    ],
    order: [["startTime", "ASC"]], // ✅ nearest upcoming
  });
}

/**
 * 6️⃣ PATROL UPCOMING
 */
if (!shift) {

  const patrol = await PatrolRun.findOne({
    where: {
      status: "upcoming",
      estimatedCompletion: {
        [Op.gte]: now.toDate(),
      },
    },
    attributes: [
        "id",
        "patrolId",
        "vehicleId",
        "notes",
        "status",
        "startDateTime",
        "estimatedCompletion",
        "runStructure",
        "createdAt",
        "updatedAt",
        "totalSites",
        "completedSites",
        "totalSubSites",
        "completedSubSites",
        "totalCheckpoints",
        "completedCheckpoints",
      ],
      include: [
        {
          model: Order,
          as: "order",
          attributes: [
            "id",
            "locationName",
            "locationAddress",
            "images",
            "serviceType",
            "startDate",
            "startTime",
            "status",
          ],
          include: [
            {
              model: User,
              as: "user", // client
              attributes: ["id", "name", "email", "mobile","avatar"],
            },
          ],
        },
        {
          model: User,
          as: "guards",
          where: { id: guardId }, // REQUIRED
          required: true,
          attributes: ["id", "name", "email", "avatar"],
          through: {
            where: { status: "accepted" },
            attributes: [
              "status",
              "clockInTime",
              "clockOutTime",
              "overtimeStartTime",
              "overtimeEndTime",
              "overtimeHours",
              "totalHours",
              "createdAt",
            ],
          },
        },
      ],
    order: [["startDateTime", "ASC"]],
  });

  if (patrol) {

  const guard = patrol.guards.find(g => g.id === guardId);
  const pivot = guard?.PatrolGuards;

  const clockInTime = pivot?.clockInTime || null;
  const clockOutTime = pivot?.clockOutTime || null;

  const overtimeStartTime = pivot?.overtimeStartTime || null;
  const overtimeEndTime = pivot?.overtimeEndTime || null;
  const overtimeHours = pivot?.overtimeHours || null;

  return res.status(200).json({
    success: true,
    type: "patrol",
    data: {

      patrol: {
        id: patrol.id,
        patrolId: patrol.patrolId,
        vehicleId: patrol.vehicleId,
        notes: patrol.notes,
        status: patrol.status,

        startTime: patrol.startDateTime,
        endTime: patrol.estimatedCompletion,

        totalSites: patrol.totalSites,
        completedSites: patrol.completedSites,

        totalSubSites: patrol.totalSubSites,
        completedSubSites: patrol.completedSubSites,

        totalCheckpoints: patrol.totalCheckpoints,
        completedCheckpoints: patrol.completedCheckpoints,

        runStructure: patrol.runStructure,
      },

      order: patrol.order || null,

      client: patrol.order?.user || null,

      guards: patrol.guards || [],

      timing: {
        startTime: patrol.startDateTime,
        endTime: patrol.estimatedCompletion,
      },

      attendance: {
        clockInTime,
        clockOutTime,

        overtime: {
          overtimeStartTime,
          overtimeEndTime,
          overtimeHours,
        },
      },

      progress: {
        sites: {
          total: patrol.totalSites,
          completed: patrol.completedSites,
        },
        subSites: {
          total: patrol.totalSubSites,
          completed: patrol.completedSubSites,
        },
        checkpoints: {
          total: patrol.totalCheckpoints,
          completed: patrol.completedCheckpoints,
        },
      },

      meta: {
        createdAt: patrol.createdAt,
        updatedAt: patrol.updatedAt,
      },
    },
  });

}
}

    /**
     * 3️⃣ No shift
     */
    if (!shift) {
      return res.status(200).json({
        success: true,
        message: "No ongoing or upcoming shifts",
        data: null,
      });
    }

    /**
     * 4️⃣ Build response
     */
    const guard = shift.guards[0];
    const pivot = guard.StaticGuards;
    const overtimeStartTime = pivot?.overtimeStartTime || null;
const overtimeEndTime = pivot?.overtimeEndTime || null;
const overtimeHours = pivot?.overtimeHours || null;



    const clockInTime = pivot?.clockInTime || null;
    const clockOutTime = pivot?.clockOutTime || null;

    const startLocal = moment(shift.startTime).tz(tz);

    const totalLoginHours = getTotalLoginHours(
      clockInTime,
      clockOutTime,
      now
    );

    return res.status(200).json({
      success: true,
      data: {
        shiftId: shift.id,
        date: startLocal.format("YYYY-MM-DD"),
        type: shift.type,
        status: shift.status,
        description: shift.description,
        shiftTotalHours: shift?.shiftTotalHours || null,

        order: {
          locationName: shift.order?.locationName || null,
          locationAddress: shift.order?.locationAddress || null,
        },
        incidents: shift.incidents || [],
        incidentsCount: shift.incidents?.length || 0,
        

        timing: {
          startTime: shift.startTime,
          endTime: shift.endTime,
        },

        attendance: {
          clockInTime,
          clockOutTime,
          totalLoginHours,

           overtime: {
    overtimestartTime: overtimeStartTime,
    overtimeendTime: overtimeEndTime,
    overtimehours: overtimeHours,
  },

  totalLoginHours,
        },

        clockInInfo:
          shift.status === "upcoming"
            ? {
                enabled: now.isSameOrAfter(
                  moment(startLocal).subtract(1, "hour")
                ),
                message: `Clock-in available from ${moment(startLocal)
                  .subtract(1, "hour")
                  .format("hh:mm A")}`,
              }
            : null,
      },
    });
  } catch (error) {
    console.error("TODAY SHIFT CARD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};



export const startOvertime = async (req, res) => {
  try {
    const { staticId, guardId } = req.body;

    if (!staticId || !guardId) {
      return res.status(400).json({
        success: false,
        message: "staticId and guardId are required",
      });
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [{ model: Static, as: "static" }],
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Shift assignment not found",
      });
    }

    const shift = assignment.static;
    if (!shift) {
      return res.status(404).json({
        success: false,
        message: "Shift not found",
      });
    }

    const now = new Date();
    const shiftEndTime = new Date(shift.endTime);

    // 🚫 Already started
    if (assignment.status === "overtime_started") {
      return res.status(400).json({
        success: false,
        message: "Overtime already started",
      });
    }

    /**
     * ✅ CASE 1: Completed shift
     */
    const completedCase =
      assignment.status === "completed" &&
      shift.status === "completed";

    /**
     * ✅ CASE 2: Ongoing shift but end time passed
     */
    const ongoingOvertimeCase =
      assignment.status === "ongoing" &&
      shift.status === "ongoing" &&
      now > shiftEndTime;

    if (!completedCase && !ongoingOvertimeCase) {
      return res.status(400).json({
        success: false,
        message:
          "Overtime can be started only after shift end or completion",
      });
    }

    // ⏱️ Apply 30-minute rule ONLY for completed shifts
    let allowedTill = null;

    if (completedCase) {
      if (!assignment.clockOutTime) {
        return res.status(400).json({
          success: false,
          message: "Clock-out required before overtime",
        });
      }

      const clockOutTime = new Date(assignment.clockOutTime);
      allowedTill = new Date(
        clockOutTime.getTime() + 30 * 60 * 1000
      );

      if (now > allowedTill) {
        return res.status(400).json({
          success: false,
          message: "Overtime window expired (30 minutes exceeded)",
        });
      }
    }

    if (ongoingOvertimeCase) {
      if (!assignment.clockInTime) {
        return res.status(400).json({
          success: false,
          message: "Clock-in time missing",
        });
      }
      const clockInTime = new Date(assignment.clockInTime);


      // ⏱ Calculate total hours (same logic as clockOut API)
      const totalMs = now - clockInTime;
      const totalHours = Number(
        (totalMs / (1000 * 60 * 60)).toFixed(2)
      );

      assignment.clockOutTime = now;
      assignment.totalHours = totalHours;
      assignment.status = "completed";

      await assignment.save();
      await shift.update({ status: "completed" });
    }

    /**
     * ✅ START OVERTIME
     */
    assignment.status = "overtime_started";
    assignment.overtimeStartTime = now;

    await assignment.save();
    await shift.update({ status: "overtime_started" });

    // 🔔 NOTIFICATIONS
    await notifyGuardAndAdmin({
      guardId,
      shiftId: staticId,
      status: "overtime_started",
      type: "OVERTIME_STARTED",
      guardMessage: `Overtime started successfully at ${now.toLocaleTimeString()}.`,
      adminMessage: `Guard ${guardId} started overtime at ${now.toLocaleTimeString()}.`,
    });

    return res.status(200).json({
      success: true,
      message: "Overtime started successfully",
      data: {
        shiftId: staticId,
        guardId,
        overtimeStartTime: assignment.overtimeStartTime,
        allowedTill, // null for ongoing case
      },
    });
  } catch (error) {
    console.error("START OVERTIME ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const endOvertime = async (req, res) => {
  try {
    const { staticId, guardId } = req.body;

    if (!staticId || !guardId) {
      return res.status(400).json({
        success: false,
        message: "staticId and guardId are required",
      });
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [
        {
          model: Static,
          as: "static",
          include: [
            {
              model: Order,
              as: "order",
              attributes: ["locationName", "locationAddress"],
            },
          ],
        },
        {
          model: User,
          as: "guard",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Shift assignment not found",
      });
    }

    const shift = assignment.static;

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: "Shift not found",
      });
    }

    // 🚫 Must be in overtime
    if (assignment.status !== "overtime_started") {
      return res.status(400).json({
        success: false,
        message: "Overtime is not active for this shift",
      });
    }



    if (!assignment.overtimeStartTime) {
      return res.status(400).json({
        success: false,
        message: "Overtime start time missing",
      });
    }

    const now = new Date();
      const clockIn = new Date(assignment.clockInTime);
    const clockOut = new Date(assignment.clockOutTime);
    const overtimeStart = new Date(assignment.overtimeStartTime);

    // 🧮 OVERTIME CALCULATION
    const overtimeMs = now - overtimeStart;
    const overtimeDurationHours = Number(
      (overtimeMs / (1000 * 60 * 60)).toFixed(2)
    );

    // 📌 EXISTING SHIFT HOURS (already saved in startOvertime)
    const existingShiftHours = Number(assignment.totalHours || 0);

    // ✅ FINAL TOTAL HOURS
    const finalTotalHours = Number(
      (existingShiftHours + overtimeDurationHours).toFixed(2)
    );

    // ✅ SAVE OVERTIME END
    assignment.overtimeEndTime = now;
    assignment.overtimeHours = overtimeDurationHours;
    assignment.totalHours = finalTotalHours;
    assignment.status = "overtime_ended";
    await assignment.save();

    await shift.update({ status: "overtime_ended" });

    // 🔔 NOTIFICATIONS (GUARD + ADMIN)
    await notifyGuardAndAdmin({
      guardId,
      shiftId: staticId,
      status: "overtime_ended",
      type: "OVERTIME_ENDED",
      guardMessage: `Your overtime ended successfully at ${now.toLocaleTimeString()}.`,
      adminMessage: `Guard ${
        assignment.guard?.name || "Guard"
      } ended overtime at ${now.toLocaleTimeString()} (OT: ${overtimeDurationHours} hrs).`,
    });

    return res.status(200).json({
      success: true,
      message: "Overtime ended successfully",
      data: {
        shift: {
          id: shift.id,
          orderId: shift.orderId,
          type: shift.type,
          description: shift.description,
          startTime: shift.startTime,
          endTime: shift.endTime,
          status: shift.status,
          shiftTotalHours: shift?.shiftTotalHours || null,
          location: {
            name: shift.order?.locationName || null,
            address: shift.order?.locationAddress || null,
          },
        },
        guard: {
          id: assignment.guard?.id || guardId,
          name: assignment.guard?.name || null,
          email: assignment.guard?.email || null,
        },
        timing: {
          clockInTime: clockIn,
          clockOutTime: clockOut,
          overtimeStartTime: overtimeStart,
          overtimeEndTime: now,
        },
        duration: {
          shiftHours: shift?.shiftTotalHours || null,
          overtimeHours: overtimeDurationHours,
          totalHours: finalTotalHours,
          
        },
      },
    });
  } catch (error) {
    console.error("END OVERTIME ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getMyShiftsByDate = async (req, res, next) => {
  try {
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    const { date } = req.body;

    if (!date) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Date is required (YYYY-MM-DD)",
      });
    }

    const tz = getTimeZone();

    // 🔥 Create day range (local → UTC safe)
    const startOfDay = moment.tz(date, tz).startOf("day").toDate();
    const endOfDay = moment.tz(date, tz).endOf("day").toDate();

const shifts = await Static.findAll({
  where: {
    startTime: {
      [Op.between]: [startOfDay, endOfDay],
    },
  },
  attributes: [
    "id",
    "orderId",
    "type",
    "description",
    "startTime",
    "endTime",
    "status",
    "shiftTotalHours",
    "createdAt",
  ],
  include: [
    {
      model: Order,
      as: "order",
      attributes: ["locationName", "locationAddress"],
    },
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      attributes: ["id", "name", "email"],
      through: {
        attributes: ["status", "createdAt"],
      },
      required: true,
    },
    {
      model: Incident,
      as: "incidents",
      required: false, // 🔑 VERY IMPORTANT (don’t filter shifts)
      attributes: [
        "id",
        "name",
        "location",
        "description",
        "images",
        "createdAt",
      ],
    },
  ],
  order: [["startTime", "ASC"]],
});


    const staticResponse = shifts.map((shift) => {
  const guard = shift.guards[0];

  return {
    id: shift.id,
    orderId: shift.orderId,
    orderLocationName: shift.order?.locationName || null,
    orderLocationAddress: shift.order?.locationAddress || null,
    date: moment(shift.startTime).tz(tz).format("YYYY-MM-DD"),
    type: shift.type,
    description: shift.description,
    startTime: shift.startTime,
    endTime: shift.endTime,
    status: shift.status,
    shiftTotalHours: shift?.shiftTotalHours || null,
    createdAt: shift.createdAt,

    guard: {
      id: guard.id,
      name: guard.name,
      email: guard.email,
      assignmentStatus: guard.StaticGuards?.status,
      assignedAt: guard.StaticGuards?.createdAt,
    },

    incidents: shift.incidents || [],
    incidentsCount: shift.incidents?.length || 0,
  };
});

/**
 * ================================
 * 🔹 FETCH PATROL RUNS (UPDATED LIKE getMyAllShifts)
 * ================================
 */
const patrolRuns = await PatrolRun.findAll({
  where: {
    startDateTime: {
      [Op.between]: [startOfDay, endOfDay],
    },
  },
  include: [
    {
      model: User,
      as: "guards",
      where: { id: guardId },
      attributes: ["id", "name", "email"],
      through: {
        attributes: ["status", "createdAt"],
      },
      required: true,
    },
    {
      model: Order,
      as: "order",
      attributes: ["locationName", "locationAddress", "serviceType"],
    },
  ],
  order: [["startDateTime", "ASC"]],
});

const patrolResponse = patrolRuns.map((run) => {
  const guard = run.guards[0];
  const guardStatus = guard?.PatrolGuards?.status;

  return {
    id: run.id,
    patrolId: run.patrolId,
    vehicleId: run.vehicleId,
    orderId: run.orderId,

    orderLocationName: run.order?.locationName || null,
    orderLocationAddress: run.order?.locationAddress || null,

    date: moment(run.startDateTime).tz(tz).format("YYYY-MM-DD"),
    type: run.order?.serviceType || "patrol",
    description: run.notes || "Patrol Run",

    startTime: run.startDateTime,
    endTime: run.estimatedCompletion,
    status: run.status,

    shiftTotalHours: null,
    createdAt: run.createdAt,

    totalSites: run.totalSites,
    totalSubSites: run.totalSubSites,
    totalCheckpoints: run.totalCheckpoints,
    completedSites: run.completedSites,
    completedSubSites: run.completedSubSites,
    completedCheckpoints: run.completedCheckpoints,

    guard: {
      id: guard?.id,
      name: guard?.name,
      email: guard?.email,
      guardStatus: guardStatus || "unknown",
      assignedAt: guard?.PatrolGuards?.createdAt,
    },

    
  };
});


    /**
     * ================================
     * 🔥 MERGE STATIC + PATROL
     * ================================
     */
    const combined = [...staticResponse, ...patrolResponse];

    combined.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));


    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Shifts fetched successfully for selected date",
      date,
      count: combined.length,
      data: combined,
    });
  } catch (error) {
    console.error("GET MY SHIFTS BY DATE ERROR:", error.stack || error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const requestOffStaticShift = async (req, res) => {
  try {
    const { staticId, requestOffDate, reason, notes } = req.body;
    const guardId = req.user.id;

    if (!staticId || !requestOffDate || !reason) {
      return res.status(400).json({
        success: false,
        message: "staticId, requestOffDate and reason are required",
      });
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [{ model: Static, as: "static" }],
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Shift assignment not found",
      });
    }

    /* 🚫 Allow request-off ONLY for UPCOMING shifts */
    if (!["upcoming", "accepted"].includes(assignment.status)) {
  return res.status(400).json({
    success: false,
    message: "Request off is allowed only for upcoming or accepted shifts",
  });
}


    /* 🚫 Prevent duplicate request */
    if (assignment.requestOffStatus === "pending") {
      return res.status(400).json({
        success: false,
        message: "Request off already submitted",
      });
    }

    await assignment.update({
      requestOffStatus: "pending",
      requestOffDate,
      requestOffReason: reason,
      requestOffNotes: notes || null,
      requestOffRequestedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Request off submitted successfully",
      data: {
        staticId,
        guardId,

        // ✅ Actual shift status remains unchanged
        shiftStatus: assignment.static?.status,
        shiftStartTime: assignment.static.startTime,
        shiftEndTime: assignment.static.endTime,
        shiftDate: assignment.static.startTime,
        shiftTotalHours: assignment.static?.shiftTotalHours || null,

        // ✅ Separate request off status
        requestOffStatus: "pending",

        requestOffDate,
      },
    });
  } catch (error) {
    console.error("REQUEST OFF ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const requestChangeStaticShift = async (req, res) => {
  try {
    const {
      staticId,
      changeDate,
      startTime,
      endTime,
      reason,
    } = req.body;

    const guardId = req.user.id;

    if (!staticId || !changeDate || !startTime || !endTime || !reason) {
      return res.status(400).json({
        success: false,
        message:
          "staticId, changeDate, startTime, endTime and reason are required",
      });
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [{ model: Static, as: "static" }],
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Shift assignment not found",
      });
    }

    /* ✅ Only UPCOMING shifts allowed */
    if (!["upcoming", "accepted"].includes(assignment.status)) {
      return res.status(400).json({
        success: false,
        message: "Change shift request is allowed only for upcoming shifts",
      });
    }

    /* 🚫 Prevent duplicate request */
    if (assignment.changeShiftStatus === "pending") {
      return res.status(400).json({
        success: false,
        message: "Change shift request already submitted",
      });
    }

    await assignment.update({
      changeShiftStatus: "pending",
      changeShiftDate: changeDate,
      changeShiftStartTime: startTime,
      changeShiftEndTime: endTime,
      changeShiftReason: reason,
      changeShiftRequestedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Change shift request submitted successfully",
      data: {
        /* 🔑 IDs */
        staticId,
        guardId,

        /* 🔁 ACTUAL SHIFT DATA (UNCHANGED) */
        shiftStatus: assignment.static?.status,
        shiftStartTime: assignment.static.startTime,
        shiftEndTime: assignment.static.endTime,
        shiftDate: assignment.static.startTime,
          shiftTotalHours: assignment.static?.shiftTotalHours || null,

        /* 🔄 CHANGE SHIFT REQUEST DATA */
        changeShiftStatus: "pending",
        requestedDate: changeDate,
        requestedStartTime: startTime,
        requestedEndTime: endTime,
        reason,

        requestedAt: assignment.changeShiftRequestedAt,
      },
    });
  } catch (error) {
    console.error("CHANGE SHIFT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getTimeSheets = async (req, res) => {
  try {
    const { guardId, fromDate, toDate } = req.query;
    const userId = req.userId; // ✅ always exists after auth

    // 🔐 FETCH USER ROLE SAFELY
    const loggedInUser = await userModel.findByPk(userId, {
      attributes: ["id", "role"],
    });

    if (!loggedInUser) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const role = loggedInUser.role;
    const tz = getTimeZone();

    /**
     * 🔍 WHERE CONDITIONS
     */
    const where = {};

    // 👮 Guard → only his own shifts
    if (role === "guard") {
      where.guardId = userId;
    }

    // 🧑‍💼 Admin → optional guard filter
    if (role === "admin" && guardId) {
      where.guardId = guardId;
    }

    /**
     * 📅 DATE FILTER
     */
    if (fromDate && toDate) {
      where["$static.startTime$"] = {
        [Op.between]: [
          moment.tz(fromDate, tz).startOf("day").utc().toDate(),
          moment.tz(toDate, tz).endOf("day").utc().toDate(),
        ],
      };
    }

    /**
     * 📦 FETCH DATA
     */
    const records = await StaticGuards.findAll({
      where,
      include: [
  {
    model: Static,
    as: "static",
    required: true, // 🔥 VERY IMPORTANT
    attributes: [
      "id",
      "orderId",
      "type",
      "status",
      "description",
      "startTime",
      "endTime",
      "shiftTotalHours"
    ],
     include: [
      {
        model: Order,
        as: "order",
        attributes: [
          "serviceType",
          "locationName",
          "locationAddress",
          "images",
        ],
      },
    ],
  },
  {
    model: User,
    as: "guard",
    attributes: ["id", "name", "email"],
  },
],

      order: [[{ model: Static, as: "static" }, "startTime", "DESC"]],
    });

    /**
     * 🧾 FORMAT RESPONSE
     */
    const data = records
  .filter(row => row.static) // 🛡️ extra safety
  .map((row) => {
    const shiftStart = moment.utc(row.static.startTime).tz(tz);
    const shiftEnd = moment.utc(row.static.endTime).tz(tz);

    return {
      shiftId: row.static.id,
      orderId: row.static.orderId,
      shiftType: row.static?.type || null,
      shiftTotalHours: row.static?.shiftTotalHours || null,
      // 📍 ORDER DETAILS
  serviceType: row.static.order?.serviceType || null,
  locationName: row.static.order?.locationName || null,
  locationAddress: row.static.order?.locationAddress || null,
  images: row.static.order?.images || [],

      date: shiftStart.format("DD MMM YYYY"),

      shiftStartTime: shiftStart.format("hh:mm A"),
      shiftEndTime: shiftEnd.format("hh:mm A"),

      clockInTime: row.clockInTime
        ? moment.utc(row.clockInTime).tz(tz).format("hh:mm A")
        : null,

      clockOutTime: row.clockOutTime
        ? moment.utc(row.clockOutTime).tz(tz).format("hh:mm A")
        : null,

      totalHours: row.totalHours ?? 0,

      shiftStatus: row.static.status,
      guardShiftStatus: row.status,

      overtimeStartTime: row.overtimeStartTime
        ? moment.utc(row.overtimeStartTime).tz(tz).format("hh:mm A")
        : null,

      overtimeEndTime: row.overtimeEndTime
        ? moment.utc(row.overtimeEndTime).tz(tz).format("hh:mm A")
        : null,

      overtimeHours: row.overtimeHours ?? 0,

      requestOffStatus: row.requestOffStatus,
      changeShiftStatus: row.changeShiftStatus,

      description: row.static.description,

      guard: {
        id: row.guard.id,
        name: row.guard.name,
        email: row.guard.email,
      },
    };
  });


    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Timesheet Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const getStaticShiftDetailsForAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    /** 🔐 Ensure admin */
    const admin = await User.findByPk(userId);
    if (!admin || admin.role !== "admin") {
      return next(
        new ErrorHandler("Access denied", StatusCodes.FORBIDDEN)
      );
    }

    /** 🔍 FETCH SHIFT */
    const staticShift = await Static.findByPk(id, {
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "date",
        "endDate",
        "status",
        "startTime",
        "endTime",
          "shiftTotalHours",
        "createdAt",
      ],
      include: [
        /** 👮 Assigned Guards + Timesheet */
        {
          model: User,
          as: "guards",
          attributes: ["id", "name", "email", "mobile"],
          through: {
  attributes: [
    "status",
    "clockInTime",
    "clockOutTime",
    "overtimeStartTime",
    "overtimeEndTime",
    "overtimeHours",
    "totalHours",

    // 🆕 CHANGE SHIFT FIELDS
    "changeShiftStatus",
    "changeShiftDate",
    "changeShiftStartTime",
    "changeShiftEndTime",
    "changeShiftReason",
    "changeShiftRequestedAt",

    // REQUEST OFF
    "requestOffStatus",
    "requestOffDate",
    "requestOffReason",
    "requestOffNotes",
    "requestOffRequestedAt",
    "requestOffActionedAt",
    "requestOffActionedBy",
  ],
},

        },

        /** 📍 Order / Client / Location */
        {
          model: Order,
          as: "order",
          attributes: [
            "serviceType",
            "locationName",
            "locationAddress",
            "images",
            "siteService",
            "guardsRequired",
            "description",
            "startDate",
            "endDate",
            "startTime",
            "endTime",
          ],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "name", "email", "mobile"],
            },
          ],
        },

        /** 🚨 Incidents */
        {
          model: Incident,
          as: "incidents",
          attributes: [
            "id",
            "name",
            "location",
            "description",
            "images",
            "createdAt",
          ],
          include: [
            {
              model: User,
              as: "reporter",
              attributes: ["id", "name", "email"],
            },
          ],
        },
        /** 🔁 SHIFT CHANGE REQUESTS (User Requested) */
{
  model: ShiftChangeRequest,
  as: "shiftChangeRequests",
  attributes: [
    "id",
    "requestedStartTime",
    "requestedEndTime",
    "reason",
    "status",
    "adminComment",
    "createdAt",
  ],
  include: [
    {
      model: User,
      as: "requester",
      attributes: ["id", "name", "email", "mobile"],
    },
  ],
},

      ],
    });

    if (!staticShift) {
      return next(new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND));
    }

    /** 🧾 FORMAT RESPONSE */
    const guards = staticShift.guards.map((guard) => {
      const t = guard.StaticGuards;

      return {
        id: guard.id,
        name: guard.name,
        email: guard.email,
        phone: guard.mobile,

        assignmentStatus: t.status,

        timesheet: {
          clockInTime: t.clockInTime,
          clockOutTime: t.clockOutTime,
          totalHours: t.totalHours ?? 0,

          overtime: {
            startTime: t.overtimeStartTime,
            endTime: t.overtimeEndTime,
            hours: t.overtimeHours ?? 0,
          },
        },
        changeShiftRequest: t.changeShiftStatus
      ? {
          status: t.changeShiftStatus,
          requestedDate: t.changeShiftDate,
          requestedStartTime: t.changeShiftStartTime,
          requestedEndTime: t.changeShiftEndTime,
          reason: t.changeShiftReason,
          requestedAt: t.changeShiftRequestedAt,
        }
      : null,

      requestOffRequest:
  t.requestOffStatus && t.requestOffStatus !== "none"
    ? {
        status: t.requestOffStatus,
        requestedDate: t.requestOffDate,
        reason: t.requestOffReason,
        notes: t.requestOffNotes,
        requestedAt: t.requestOffRequestedAt,
        actionedAt: t.requestOffActionedAt,
        actionedBy: t.requestOffActionedBy,
      }
    : null,

      };
    });

    /** 🧾 FORMAT FORMAL SHIFT CHANGE REQUESTS */
    const shiftChangeRequests =
      staticShift.shiftChangeRequests?.map((req) => ({
        id: req.id,
        status: req.status,
        reason: req.reason,
        requestedStartTime: req.requestedStartTime,
        requestedEndTime: req.requestedEndTime,
        requestedAt: req.createdAt,
        adminComment: req.adminComment || null,

        requestedBy: {
          id: req.requester?.id,
          name: req.requester?.name,
          email: req.requester?.email,
          phone: req.requester?.mobile,
        },
      })) || [];

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Shift details fetched successfully",
      data: {
        shift: {
          id: staticShift.id,
          type: staticShift.type,
          description: staticShift.description,
          date: staticShift.date,
          endDate: staticShift.endDate,
          status: staticShift.status,
          startTime: staticShift.startTime,
          endTime: staticShift.endTime,
            shiftTotalHours: staticShift?.shiftTotalHours || null,
          createdAt: staticShift.createdAt,
        },

        client: staticShift.order?.user || null,

        order: staticShift.order
          ? {
              serviceType: staticShift.order.serviceType,
              locationName: staticShift.order.locationName,
              locationAddress: staticShift.order.locationAddress,
              images: staticShift.order.images || [],
              siteService: staticShift.order.siteService,
              guardsRequired: staticShift.order.guardsRequired,
              description: staticShift.order.description,
              startDate: staticShift.order.startDate,
              endDate: staticShift.order.endDate,
              startTime: staticShift.order.startTime,
              endTime: staticShift.order.endTime,
            }
          : null,

        guards,
        shiftChangeRequests, // ✅ NEW SECTION

        incidents: staticShift.incidents || [],
      },
    });
  } catch (error) {
    console.error("ADMIN SHIFT DETAILS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getUpcomingShiftAlerts = async (req, res, next) => {
  try {
    const tz = getTimeZone();

    // Current time in UTC (DB is stored in UTC)
    const now = moment().tz(tz).utc();

    // 30 minutes from now
    const nextThirtyMinutes = moment(now).add(30, "minutes");

    // ==============================
    // Fetch shifts starting within 30 mins
    // ==============================
    const upcomingShifts = await Static.findAll({
      where: {
        status: "upcoming",
        startTime: {
          [Op.between]: [now.toDate(), nextThirtyMinutes.toDate()],
        },
      },
      include: [
        {
          model: User,
          as: "guards",
          attributes: ["id", "name", "email"],
          through: {
            attributes: ["status"],
          },
        },
        {
            model: Order,
          as: "order", // ✅ Correct alias
          attributes: ["id", "locationName","description"],
          include: [
            {
              model: User,
              as: "user", // ✅ Must match your Order model association
              attributes: ["id", "name", "email"],
            },
          ],
        },
      ],
      order: [["startTime", "ASC"]],
    });

    // ==============================
    //  Count
    // ==============================
    const count = upcomingShifts.length;

    // ==============================
    //  Format Response (Optional Clean Format)
    // ==============================
    // ==============================
//  Format Response (Updated)
// ==============================
const formattedShifts = upcomingShifts.map((shift) => {
  const guard = shift.guards?.[0];
  const order = shift.order;
  const client = order?.user;

  return {
    shiftId: shift.id,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    description: shift.description,
    shiftTotalHours: shift?.shiftTotalHours || null,

    guard: guard
      ? {
          id: guard.id,
          name: guard.name,
          email: guard.email,
        }
      : null,

    order: order
      ? {
          id: order.id,
          locationName: order.locationName,
          description: order.description,
          client: client
            ? {
                id: client.id,
                name: client.name,
                email: client.email,
              }
            : null,
        }
      : null,
  };
});


    return res.status(StatusCodes.OK).json({
      success: true,
      count,
      data: formattedShifts,
    });
  } catch (error) {
    console.error("GET UPCOMING SHIFT ALERTS ERROR:", error);
    return next(
      new ErrorHandler(
        "Internal server error",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


export const respondToChangeShiftRequest = async (req, res) => {
  try {
    const { staticId, guardId, action } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 🔐 Ensure admin
    const admin = await User.findByPk(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!staticId || !guardId || !action) {
      return res.status(400).json({
        success: false,
        message: "staticId, guardId and action are required",
      });
    }

    if (!["accepted", "rejected"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'accepted' or 'rejected'",
      });
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [
        { model: User, as: "guard", attributes: ["id", "name"] },
      ],
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Shift assignment not found",
      });
    }

    if (assignment.changeShiftStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "No pending change shift request",
      });
    }

    // ✅ ONLY update request status
    assignment.changeShiftStatus = action;
    await assignment.save();

    const now = new Date();

    // 🔔 Notifications
    await notifyGuardAndAdmin({
      guardId,
      shiftId: staticId,
      status: `Change shift ${action}`,
      type: "CHANGE_SHIFT_RESPONSE",
      guardMessage:
        action === "accepted"
          ? "Your shift change request has been approved by admin."
          : "Your shift change request has been rejected by admin.",
      adminMessage: `You have ${action} the change shift request of guard ${
        assignment.guard?.name || "Guard"
      }.`,
    });

    return res.status(200).json({
      success: true,
      message: `Change shift request ${action} successfully`,
      data: {
        staticId,
        guardId,
        changeShiftStatus: action,
        respondedAt: now,
      },
    });
  } catch (error) {
    console.error("RESPOND CHANGE SHIFT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const respondToRequestOffStaticShift = async (req, res) => {
  try {
    const { staticId, guardId, action } = req.body;
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 🔐 Ensure admin
    const admin = await User.findByPk(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (!staticId || !guardId || !action) {
      return res.status(400).json({
        success: false,
        message: "staticId, guardId and action are required",
      });
    }

    if (!["accepted", "rejected"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'accepted' or 'rejected'",
      });
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [
        { model: User, as: "guard", attributes: ["id", "name"] },
      ],
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Shift assignment not found",
      });
    }

    if (assignment.requestOffStatus !== "pending") {
      return res.status(400).json({
        success: false,
        message: "No pending request off found",
      });
    }

    const now = new Date();

    // ✅ Update request off fields
    assignment.requestOffStatus = action;
    assignment.requestOffActionedAt = now;
    assignment.requestOffActionedBy = adminId;

    await assignment.save();

    // 🔔 Notifications
    await notifyGuardAndAdmin({
      guardId,
      shiftId: staticId,
      status: `Request off ${action}`,
      type: "REQUEST_OFF_RESPONSE",
      guardMessage:
        action === "accepted"
          ? "Your shift-off request has been accepted by admin."
          : "Your shift-off request has been rejected by admin.",
      adminMessage: `You have ${action} the shift-off request of guard ${
        assignment.guard?.name || "Guard"
      }.`,
    });

    return res.status(200).json({
      success: true,
      message: `Shift-off request ${action} successfully`,
      data: {
        staticId,
        guardId,
        requestOffStatus: action,
        respondedAt: now,
      },
    });
  } catch (error) {
    console.error("RESPOND REQUEST OFF ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const respondToUserShiftChangeRequest = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    const { requestId, action, adminComment } = req.body;

    if (!adminId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    // 🔐 Ensure admin
    const admin = await User.findByPk(adminId);
    if (!admin || admin.role !== "admin") {
      return next(
        new ErrorHandler("Access denied", StatusCodes.FORBIDDEN)
      );
    }

    if (!requestId || !action) {
      return next(
        new ErrorHandler(
          "requestId and action are required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    if (!["accepted", "rejected"].includes(action)) {
      return next(
        new ErrorHandler(
          "Action must be 'accepted' or 'rejected'",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 🔍 Find request
    const request = await ShiftChangeRequest.findByPk(requestId, {
      include: [
        {
          model: User,
          as: "requester",
          attributes: ["id", "name"],
        },
        {
          model: Static,
          as: "shift",
          attributes: ["id", "startTime", "endTime"],
        },
      ],
    });

    if (!request) {
      return next(
        new ErrorHandler("Shift change request not found", StatusCodes.NOT_FOUND)
      );
    }

    if (request.status !== "pending") {
      return next(
        new ErrorHandler(
          "This request has already been responded to",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // ✅ Update request status
    request.status = action;
    request.adminComment = adminComment || null;
    await request.save();

    const now = new Date();

    // 🔔 Send Notifications
    await notifyGuardAndAdmin({
      guardId: request.requestedBy,
      shiftId: request.shiftId,
      status: `shift_change_${action}`,
      type: "SHIFT_CHANGE_RESPONSE",

      guardMessage:
        action === "accepted"
          ? `Your shift change request has been approved by admin.`
          : `Your shift change request has been rejected by admin.`,

      adminMessage:
        action === "accepted"
          ? `You approved the shift change request of ${request.requester?.name}.`
          : `You rejected the shift change request of ${request.requester?.name}.`,
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Shift change request ${action} successfully`,
      data: {
        requestId: request.id,
        shiftId: request.shiftId,
        requestedBy: request.requestedBy,
        status: request.status,
        adminComment: request.adminComment,
        respondedAt: now,
      },
    });
  } catch (error) {
    console.error("RESPOND USER SHIFT CHANGE ERROR:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
    });
  }
};











