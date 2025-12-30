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

export const createSchedule = async (req, res, next) => {
  try {
    const { description, startTime, endTime, date, guardIds, orderId } = req.body;
    console.log("Incoming Create Schedule Body:", req.body);


    // Validate input
    if (!orderId) {
      return next(new ErrorHandler("Order ID is required", StatusCodes.BAD_REQUEST));
    }

    if (!startTime || !endTime) {
      return next(new ErrorHandler("Start time and end time are required", StatusCodes.BAD_REQUEST));
    }

    if (!Array.isArray(guardIds) || guardIds.length === 0) {
      return next(new ErrorHandler("At least one guard must be assigned", StatusCodes.BAD_REQUEST));
    }

    // Check if order exists
    const order = await Order.findByPk(orderId);
    if (!order) {
      return next(new ErrorHandler("Order not found", StatusCodes.NOT_FOUND));
    }

    // Validate guards
    const guards = await User.findAll({ where: { id: guardIds } });
    if (guards.length !== guardIds.length) {
      return next(new ErrorHandler("One or more guard IDs are invalid", StatusCodes.BAD_REQUEST));
    }

    const tz = getTimeZone();

// Normalize date
const normalizedDate = date
  ? moment(date).format("YYYY-MM-DD")
  : null;

const start = normalizedDate
  ? moment.tz(`${normalizedDate} ${startTime}`, "YYYY-MM-DD HH:mm", tz).utc().toDate()
  : moment.tz(startTime, tz).utc().toDate();

const end = normalizedDate
  ? moment.tz(`${normalizedDate} ${endTime}`, "YYYY-MM-DD HH:mm", tz).utc().toDate()
  : moment.tz(endTime, tz).utc().toDate();


    // Create Static (shift)
    const staticShift = await Static.create({
      orderId,
      description,
      startTime: start,
      endTime: end,
      type: "static",
      status: "pending",
    });

    // Assign guards (create StaticGuards records)
    const guardAssignments = guardIds.map((guardId) => ({
      staticId: staticShift.id,
      guardId,
      status: "pending",
    }));

    // Use try/catch around the pivot creation so we can clean up the staticShift if it fails
    try {
      await StaticGuards.bulkCreate(guardAssignments);
    } catch (pivotErr) {
      // rollback staticShift if pivot failed (optional but recommended)
      await staticShift.destroy().catch(() => {});
      return next(new ErrorHandler("Failed to assign guards", StatusCodes.INTERNAL_SERVER_ERROR));
    }

    // Fetch full static with guards
    const createdShift = await Static.findByPk(staticShift.id, {
      include: [
        {
          model: User,
          as: "guards",
          attributes: ["id", "name", "email"],
          through: { attributes: ["status", "createdAt"] },
        },
      ],
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Shift assigned successfully",
      data: createdShift,
    });
  } catch (error) {
    console.error("CREATE SCHEDULE ERROR:", error.stack || error);
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
      ],
      order: [["startTime", "ASC"]],
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
        createdAt: shift.createdAt,
        guard: {
          id: guard.id,
          name: guard.name,
          email: guard.email,
          assignmentStatus,
          assignedAt: guard.StaticGuards?.createdAt,
        },
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Shifts fetched successfully",
      filter,
      data: response,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
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

// CLOCK-IN
export const clockIn = async (req, res, next) => {
  try {
    const { staticId, guardId, type } = req.body;

    if (!staticId || !guardId || !type) {
      return next(
        new ErrorHandler("staticId, guardId and type are required", 400)
      );
    }

    const isStatic = type === "static";
    const ShiftModel = isStatic ? Static : Patrol;
    const ShiftGuardModel = isStatic ? StaticGuards : PatrolGuards;
    const shiftAlias = isStatic ? "static" : "patrol";

    // 🚫 Guard already in an active shift
const activeShift = await ShiftGuardModel.findOne({
  where: { guardId, status: "ongoing" },
  include: [
    {
      model: ShiftModel,
      as: shiftAlias,
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "startTime",
        "endTime",
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
  const shiftStart = new Date(shift.startTime);
  const shiftEnd = new Date(shift.endTime);

  return res.status(400).json({
    success: false,
    message:
      "You must clock out from the previous shift before starting a new one.",
    activeShift: {
      assignmentId: activeShift.id,
      shiftId: shift.id,
      shiftType: type,
      orderId: shift.orderId,

      // 📍 Location details
      locationName: shift.order?.locationName || null,
      locationAddress: shift.order?.locationAddress || null,

      // 🕒 Shift timing
      shiftDate: formatDate(shiftStart),
      startTime: formatTime(shiftStart),
      endTime: formatTime(shiftEnd),
      duration: getShiftDuration(shiftStart, shiftEnd),

      // 📌 Status info
      shiftStatus: shift.status,
      assignmentStatus: activeShift.status,

      // ⏱️ Clock-in info
      clockInTime: activeShift.clockInTime
        ? formatTime(activeShift.clockInTime)
        : null,

      // 📝 Extra context
      description: shift.description,
      createdAt: shift.createdAt,
    },
  });
}


    // Fetch assignment
    const assignment = await ShiftGuardModel.findOne({
      where: { staticId, guardId },
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
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);

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
    if (now > oneHourAfterEnd) {
      return res.status(400).json({
        success: false,
        message: "Shift time already completed. Clock-in not allowed.",
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
          where: { startTime: shiftEnd },
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

    return res.status(200).json({
      success: true,
      message: "Clock-In successful",
      warnings,
      data: {
        shiftId: staticId,
        guardId,
        shiftType: type,
        shiftDate: formatDate(shiftStart),
        shiftDuration: getShiftDuration(shiftStart, shiftEnd),
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



// CLOCK-OUT
export const clockOut = async (req, res, next) => {
  try {
    const { staticId, guardId } = req.body;

    if (!staticId || !guardId) {
      return next(new ErrorHandler("staticId and guardId are required", 400));
    }

    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [{ model: Static, as: "static" }],
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

    const shift = assignment.static;
    const now = new Date();

    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);
    const clockIn = new Date(assignment.clockInTime);

    const oneHourAfterEnd = new Date(shiftEnd.getTime() + 60 * 60 * 1000);
    const thirtyMinAfterEnd = new Date(shiftEnd.getTime() + 30 * 60 * 1000);

    let warnings = [];
    let assignmentStatus = "completed";
    let shiftStatus = "completed";

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

    // ⚠️ Late but acceptable (after 30 mins)
    if (now > thirtyMinAfterEnd) {
      warnings.push("Late_clock-out");
    }

    // ⏱ TOTAL HOURS (shift only)
    const totalMs = now - clockIn;
    const totalHours = Number((totalMs / (1000 * 60 * 60)).toFixed(2));

    // ✅ SAVE
    assignment.clockOutTime = now;
    assignment.totalHours = totalHours;
    assignment.status = assignmentStatus;
    await assignment.save();

    await shift.update({ status: shiftStatus });

    return res.status(200).json({
      success: true,
      message: "Clock-Out successful",
      warnings,
      data: {
        shiftDate: formatDate(shiftStart),
        clockInTime: formatTime(clockIn),
        clockOutTime: formatTime(now),
        shiftStartTime: formatTime(shiftStart),
        shiftEndTime: formatTime(shiftEnd),
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

    /**
     * 1️⃣ ONGOING shift (highest priority)
     */
    let shift = await Static.findOne({
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
            attributes: ["clockInTime", "clockOutTime","overtimeStartTime",
    "overtimeEndTime",
    "overtimeHours"],
          },
          required: true,
        },
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress"],
        },
      ],
      order: [["startTime", "ASC"]],
    });

    /**
     * 2️⃣ NEXT UPCOMING shift (future OR within grace window)
     */
    /**
 * 2️⃣ NEXT UPCOMING shift (nearest future)
 */
if (!shift) {
  shift = await Static.findOne({
    where: {
      status: "upcoming",
      startTime: {
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
    ],
    order: [["startTime", "ASC"]], // ✅ nearest upcoming
  });
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

        order: {
          locationName: shift.order?.locationName || null,
          locationAddress: shift.order?.locationAddress || null,
        },

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

    // 🚫 Must be clocked out
    if (!assignment.clockOutTime) {
      return res.status(400).json({
        success: false,
        message: "You must clock out before starting overtime",
      });
    }

    // 🚫 Shift must be completed
    if (assignment.status !== "completed" || shift.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Overtime can be started only after shift completion",
      });
    }

    const now = new Date();
    const clockOutTime = new Date(assignment.clockOutTime);

    // ⏱️ 30-minute window after clock-out
    const overtimeDeadline = new Date(
      clockOutTime.getTime() + 30 * 60 * 1000
    );

    if (now > overtimeDeadline) {
      return res.status(400).json({
        success: false,
        message: "Overtime window expired (30 minutes exceeded)",
      });
    }

    // 🚫 Already started
    if (assignment.status === "overtime_started") {
      return res.status(400).json({
        success: false,
        message: "Overtime already started",
      });
    }

    // ✅ START OVERTIME
    assignment.status = "overtime_started";
    assignment.overtimeStartTime = now;
    await assignment.save();

    await shift.update({ status: "overtime_started" });

    return res.status(200).json({
      success: true,
      message: "Overtime started successfully",
      data: {
        shiftId: staticId,
        guardId,
        overtimeStartTime: assignment.overtimeStartTime,
        allowedTill: overtimeDeadline,
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

    const now = new Date();
    const clockIn = new Date(assignment.clockInTime);
    const clockOut = new Date(assignment.clockOutTime);

    // ⏱️ TEMP: Overtime starts from clockOutTime
    const overtimeStart = new Date(assignment.overtimeStartTime);

    const shiftMs = clockOut - clockIn;
    const overtimeMs = now - overtimeStart;
    const totalMs = shiftMs + overtimeMs;

    const shiftDurationHours = Number(
      (shiftMs / (1000 * 60 * 60)).toFixed(2)
    );
    const overtimeDurationHours = Number(
      (overtimeMs / (1000 * 60 * 60)).toFixed(2)
    );
    const totalWorkedHours = Number(
      (totalMs / (1000 * 60 * 60)).toFixed(2)
    );

    // ✅ SAVE OVERTIME END
    assignment.overtimeEndTime = now;
    assignment.overtimeHours = overtimeDurationHours;
    assignment.totalHours = totalWorkedHours;
    assignment.status = "overtime_ended";
    await assignment.save();

    await shift.update({ status: "overtime_ended" });

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
          shiftHours: shiftDurationHours,
          overtimeHours: overtimeDurationHours,
          totalWorkedHours,
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


    const response = shifts.map((shift) => {
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


    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Shifts fetched successfully for selected date",
      date,
      count: response.length,
      data: response,
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











