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
      attributes: ["locationAddress"],  // Fetch order name here
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
      const start = moment(shift.startTime).tz(tz);
      const end = moment(shift.endTime).tz(tz);

      let dynamicStatus = shift.status;

      if (now.isBefore(start)) dynamicStatus = "upcoming";
      else if (now.isBetween(start, end)) dynamicStatus = "ongoing";
      else if (now.isSameOrAfter(end)) dynamicStatus = "completed";

      // Only update DB if the status changed
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
        orderLocationAddress: shift.order?.locationAddress || null,   // NEW FIELD
        date: moment(shift.startTime).tz(tz).format("YYYY-MM-DD"),
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

// Delete a schedule by ID
export const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Schedule ID is required",
      });
    }

    const schedule = await Scheduling.findByPk(id);

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

export const clockIn = async (req, res, next) => {
  try {
    const { staticId, guardId } = req.body;

    if (!staticId || !guardId) {
      return next(new ErrorHandler("staticId and guardId are required", 400));
    }

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

    // EARLY CLOCK-IN → DO NOT CLOCK IN, JUST SEND WARNING
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

    // CALCULATE SHIFT DURATION
    const shiftDuration = getShiftDuration(shiftStart, shiftEnd);

    return res.status(200).json({
      success: true,
      message: "Clock-In successful",
      warnings,
      data: {
        staticId,
        guardId,

        shiftDate: formatDate(shiftStart),
        shiftDuration,  // 🔥 NEW FIELD

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

// Clock-Out API

export const clockOut = async (req, res, next) => {
  try {
    const { staticId, guardId } = req.body;

    if (!staticId || !guardId) {
      return next(new ErrorHandler("staticId and guardId are required", 400));
    }

    // Fetch assignment
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
    const clockOut = now;

    let warnings = [];
    let status = "completed";

    // 1️⃣ CHECK IF GUARD IS CLOCKING OUT EARLY
    if (clockOut < shiftEnd) {
      warnings.push("Shift hours are not completed.");
      status = "ended_early";
    }

    // 2️⃣ CALCULATE TOTAL HOURS WORKED
    const totalMs = clockOut - clockIn;
    const totalHours = Number((totalMs / (1000 * 60 * 60)).toFixed(2));

    // 3️⃣ CALCULATE OVERTIME
    let overtimeHours = 0;

    if (clockOut > shiftEnd) {
      const overtimeMs = clockOut - shiftEnd;
      overtimeHours = Number((overtimeMs / (1000 * 60 * 60)).toFixed(2));
      status = "overtime";
    }

    // 4️⃣ SAVE CLOCK-OUT DATA
    assignment.clockOutTime = clockOut;
    assignment.totalHours = totalHours;
    assignment.status = status;
    await assignment.save();

    // -----------------------------
    // 5️⃣ FINAL RESPONSE
    // -----------------------------
    return res.status(200).json({
      success: true,
      message: "Clock-Out successful",
      warnings,
      data: {
        shiftDate: formatDate(shiftStart),

        // Normalized times
        clockInTime: formatTime(clockIn),
        clockOutTime: formatTime(clockOut),
        shiftStartTime: formatTime(shiftStart),
        shiftEndTime: formatTime(shiftEnd),

        totalHours,
        overtimeHours,
        status,

        // raw timestamps for DB or logs
        raw: {
          clockInTime: clockIn,
          clockOutTime: clockOut,
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime
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




