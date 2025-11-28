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

    let { page = 1, limit = 10, status } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;
    const tz = getTimeZone();
    const now = moment().tz(tz);
    const allowedStatuses = ["upcoming", "ongoing", "completed"];

    // Fetch shifts assigned to the logged-in guard
    const { count, rows: shifts } = await Static.findAndCountAll({
      attributes: ["id", "orderId", "type", "description", "startTime", "endTime", "status", "createdAt"],
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
