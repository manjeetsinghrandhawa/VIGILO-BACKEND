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
      status: "upcoming",
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

// Fetch weekly schedules with guard and site details
export const getAllSchedules = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED));
    }

    let { page = 1, limit, status } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 5000;

    const offset = (page - 1) * limit;
    const tz = getTimeZone();
    const now = moment().tz(tz);
    const allowedStatuses = ["upcoming", "ongoing", "completed"];

    // Fetch shifts assigned to the logged-in guard
    const { count, rows: shifts } = await Static.findAndCountAll({
      attributes: ["id", "orderId", "type", "description", "startTime", "endTime", "status", "createdAt"],
      include: [
         {
      model: Order,
      as:"order",
      attributes: ["locationName","locationAddress"],  // Fetch order name here
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
        message: "No shifts found for this user",
        data: [],
        pagination: {
          total: 0,
          page,
          totalPages: 0,
          limit,
        },
      });
    }

    const updatedShifts = [];

     for (const shift of shifts) {
      // FOR STATUS CHECKING ONLY — we convert UTC → LOCAL here
      const startLocal = moment(shift.startTime).tz(tz);
      const endLocal = moment(shift.endTime).tz(tz);

      // Determine dynamic shift status
      let dynamicStatus = shift.status;

      if (now.isBefore(startLocal)) dynamicStatus = "upcoming";
      else if (now.isBetween(startLocal, endLocal)) dynamicStatus = "ongoing";
      else if (now.isSameOrAfter(endLocal)) dynamicStatus = "completed";

      // Update DB only if status changed
      if (shift.status !== dynamicStatus) {
        try {
          await shift.update({ status: dynamicStatus });
        } catch (uErr) {
          console.warn(`Failed to update status for shift ${shift.id}:`, uErr.message);
        }
      }

      updatedShifts.push({
        id: shift.id,
        orderId: shift.orderId,
        orderLocationName: shift.order?.locationName || null, // NEW FIELD
        orderLocationAddress: shift.order?.locationAddress || null,   // NEW FIELD
        // date MUST be from UTC startTime WITHOUT timezone conversion
        date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
        type: shift.type,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: dynamicStatus,
        createdAt: shift.createdAt,
        guards: Array.isArray(shift.guards)
          ? shift.guards.map((g) => ({
              id: g.id,
              name: g.name,
              email: g.email,
              StaticGuards: {
                status: g.StaticGuards?.status || "pending",
                createdAt: g.StaticGuards?.createdAt || null,
              },
            }))
          : [],
      });
    }

    // Apply optional filter
    const filteredShifts =
      status && allowedStatuses.includes(status) ? updatedShifts.filter((s) => s.status === status) : updatedShifts;

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
    console.error("GET ALL SCHEDULES ERROR:", error.stack || error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

export const getMySchedules = async (req, res, next) => {
  try {
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    let { page = 1, limit = 20, status } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const offset = (page - 1) * limit;

    const tz = getTimeZone();
    const now = moment().tz(tz);
    const allowedStatuses = ["upcoming", "ongoing", "completed"];

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
          where: { id: guardId }, // 🔥 FILTER BY LOGGED-IN GUARD
          attributes: ["id", "name", "email"],
          through: {
            attributes: ["status", "createdAt"],
          },
          required: true, // 🔥 IMPORTANT
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

    const formattedShifts = [];

    for (const shift of shifts) {
      const startLocal = moment(shift.startTime).tz(tz);
      const endLocal = moment(shift.endTime).tz(tz);

      let dynamicStatus = shift.status;

      if (now.isBefore(startLocal)) dynamicStatus = "upcoming";
      else if (now.isBetween(startLocal, endLocal)) dynamicStatus = "ongoing";
      else if (now.isSameOrAfter(endLocal)) dynamicStatus = "completed";

      if (shift.status !== dynamicStatus) {
        try {
          await shift.update({ status: dynamicStatus });
        } catch (err) {
          console.warn(`Shift ${shift.id} status update failed`);
        }
      }

      const guard = shift.guards[0]; // only one guard here

      formattedShifts.push({
        id: shift.id,
        orderId: shift.orderId,
        orderLocationName: shift.order?.locationName || null,
        orderLocationAddress: shift.order?.locationAddress || null,
        date: moment.utc(shift.startTime).format("YYYY-MM-DD"),
        type: shift.type,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        status: dynamicStatus,
        createdAt: shift.createdAt,
        guard: {
          id: guard.id,
          name: guard.name,
          email: guard.email,
          assignmentStatus: guard.StaticGuards?.status || "pending",
          assignedAt: guard.StaticGuards?.createdAt || null,
        },
      });
    }

    const filteredShifts =
      status && allowedStatuses.includes(status)
        ? formattedShifts.filter((s) => s.status === status)
        : formattedShifts;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "My shifts fetched successfully",
      data: filteredShifts,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    console.error("GET MY SCHEDULES ERROR:", error.stack || error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};

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
      ],
      order: [["startTime", "ASC"]],
      limit,
      offset,
    });

    const upcomingShifts = [];

    for (const shift of shifts) {
      const startLocal = moment(shift.startTime).tz(tz);

      // 🔥 UPCOMING ONLY
      if (!now.isBefore(startLocal)) continue;

      // Optional: keep DB status in sync
      if (shift.status !== "upcoming") {
        try {
          await shift.update({ status: "upcoming" });
        } catch (err) {
          console.warn(`Shift ${shift.id} status update failed`);
        }
      }

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
        status: "upcoming",
        createdAt: shift.createdAt,
        guard: {
          id: guard.id,
          name: guard.name,
          email: guard.email,
          assignmentStatus: guard.StaticGuards?.status || "pending",
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
      status: "error",
      message: error.message,
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
    const { staticId, guardId } = req.body;

    if (!staticId || !guardId) {
      return next(new ErrorHandler("staticId and guardId are required", 400));
    }

    // 🚫 EDGE CASE 2: Check if guard is already in ANY active shift
    const activeShift = await StaticGuards.findOne({
      where: {
        guardId,
        status: { [Op.in]: ["ongoing"] }
      }
    });

    if (activeShift) {
      return res.status(400).json({
        success: false,
        message:
          "You must clock out from the previous shift before starting a new one.",
        lastActiveShiftId: activeShift.staticId
      });
    }

    // Fetch assignment for this shift
    const assignment = await StaticGuards.findOne({
      where: { staticId, guardId },
      include: [{ model: Static, as: "static" }],
    });

    if (!assignment) return next(new ErrorHandler("Shift assignment not found", 404));

    const shift = assignment.static;
    if (!shift) return next(new ErrorHandler("Shift details missing", 404));

    if (assignment.clockInTime) {
      return next(new ErrorHandler("You have already clocked in", 400));
    }

    const now = new Date();
    const shiftStart = new Date(shift.startTime);
    const shiftEnd = new Date(shift.endTime);

    let warnings = [];

    // EARLY CLOCK-IN
    if (now < shiftStart) {
      return res.status(400).json({
        success: false,
        message: `Clock-In is early. You can clock-in after ${shiftStart.toLocaleString()}`,
        allowedAfter: shiftStart,
      });
    }

    // OVERTIME CLOCK-IN WARNING
    if (now > shiftEnd) {
      warnings.push("Your shift has already ended. You are clocking in during overtime.");
    }

    // FIND NEXT SHIFT
    const nextShift = await StaticGuards.findOne({
      where: { guardId },
      include: [
        {
          model: Static,
          as: "static",
          where: { startTime: { [Op.gt]: shiftEnd } },
        },
      ],
      order: [[{ model: Static, as: "static" }, "startTime", "ASC"]],
    });

    let nextShiftStartTime = null;
    if (nextShift) {
      nextShiftStartTime = new Date(nextShift.static.startTime);

      const minsLeft = (nextShiftStartTime - now) / (1000 * 60);
      if (minsLeft < 30 && minsLeft > 0) {
        warnings.push(`Your next shift starts in ${Math.floor(minsLeft)} minutes.`);
      }
    }

    // SAVE CLOCK-IN
    assignment.clockInTime = now;
    assignment.status = "ongoing";
    await assignment.save();

    const shiftDuration = getShiftDuration(shiftStart, shiftEnd);

    return res.status(200).json({
      success: true,
      message: "Clock-In successful",
      warnings,
      data: {
        staticId,
        guardId,
        shiftDate: formatDate(shiftStart),
        shiftDuration,
        clockInTime: formatTime(now),
        shiftStartTime: formatTime(shiftStart),
        shiftEndTime: formatTime(shiftEnd),
        nextShiftStartTime: formatTime(nextShiftStartTime),
        raw: {
          clockIn: now,
          shiftStart,
          shiftEnd,
          nextShiftStartTime,
        },
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

    let clockOut = now;
    let warnings = [];
    let status = "completed";

    // 1️⃣ EDGE CASE 1 — AUTO CLOCK OUT 1 MIN BEFORE NEXT SHIFT
    const nextShift = await StaticGuards.findOne({
      where: { guardId },
      include: [{ model: Static, as: "static" }],
      order: [[{ model: Static, as: "static" }, "startTime", "ASC"]],
    });

    if (nextShift) {
      const nextStart = new Date(nextShift.static.startTime);

      // If next shift starts exactly when this one ends
      if (nextStart.getTime() === shiftEnd.getTime()) {
        // Auto clock out at shiftEnd - 1 minute
        const autoClockOut = new Date(shiftEnd.getTime() - 1 * 60 * 1000);

        if (now > autoClockOut) {
          clockOut = autoClockOut;
          warnings.push(
            `Auto Clock-Out applied at ${formatTime(autoClockOut)} due to immediate next shift.`
          );
        }
      }
    }

    // 2️⃣ CLOCKING OUT EARLY
    if (clockOut < shiftEnd) {
      warnings.push("Shift hours are not completed.");
      status = "ended_early";
    }

    // 3️⃣ TOTAL HOURS WORKED
    const totalMs = clockOut - clockIn;
    const totalHours = Number((totalMs / (1000 * 60 * 60)).toFixed(2));

    // 4️⃣ OVERTIME
    let overtimeHours = 0;
    if (clockOut > shiftEnd) {
      const overtimeMs = clockOut - shiftEnd;
      overtimeHours = Number((overtimeMs / (1000 * 60 * 60)).toFixed(2));
      status = "overtime";
    }

    // 5️⃣ SAVE CLOCK-OUT
    assignment.clockOutTime = clockOut;
    assignment.totalHours = totalHours;
    assignment.status = status;
    await assignment.save();

    return res.status(200).json({
      success: true,
      message: "Clock-Out successful",
      warnings,
      data: {
        shiftDate: formatDate(shiftStart),
        clockInTime: formatTime(clockIn),
        clockOutTime: formatTime(clockOut),
        shiftStartTime: formatTime(shiftStart),
        shiftEndTime: formatTime(shiftEnd),
        totalHours,
        overtimeHours,
        status,
        raw: {
          clockInTime: clockIn,
          clockOutTime: clockOut,
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime,
        }
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





