import { StatusCodes } from "http-status-codes";
import moment from "moment-timezone";
import { getTimeZone } from "../../utils/timeZone.js";
import catchAsyncError from "../../utils/catchAsyncError.js";
import ErrorHandler from "../../utils/errorHandler.js";
import Order from "../order/order.model.js";
import Static from "./static.model.js";
import StaticGuards from "./staticGuards.model.js";
import User from "../user/user.model.js";

export const assignShift = catchAsyncError(async (req, res, next) => {
  const { orderId } = req.params;
  const { description, startTime, endTime,date, guardIds } = req.body;

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

const start = date
  ? moment.tz(`${date}T${startTime}`, tz).utc().toDate()
  : moment.tz(startTime, tz).utc().toDate();

const end = date
  ? moment.tz(`${date}T${endTime}`, tz).utc().toDate()
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
  await StaticGuards.bulkCreate(guardAssignments);

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

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Shift assigned successfully",
    data: createdShift,
  });
});

export const getAllShifts = catchAsyncError(async (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
    );
  }

  let { page = 1, limit = 10, status } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;

  const offset = (page - 1) * limit;
  const allowedStatuses = ["upcoming", "ongoing", "completed"];
  const tz = getTimeZone();
  const now = moment().tz(tz);

  // Fetch shifts assigned to the logged-in guard
  const { count, rows: shifts } = await Static.findAndCountAll({
    attributes: ["id", "type", "description", "startTime", "endTime", "status"],
    include: [
      {
        model: User,
        as: "guards",
        attributes: ["id", "name", "email"],
        through: {
          attributes: ["status", "createdAt"],
          where: { guardId: userId },
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

    // ✅ Only update DB if the status changed
    if (shift.status !== dynamicStatus) {
      await shift.update({ status: dynamicStatus });
    }

    updatedShifts.push({
      id: shift.id,
      type: shift.type,
      description: shift.description,
      startTime: shift.startTime,
      endTime: shift.endTime,
      status: dynamicStatus,
      guardName: shift.guards[0]?.name || "Unknown",
      guardStatus: shift.guards[0]?.StaticGuards?.status || "pending",
    });
  }

  // Apply optional filter
  const filteredShifts =
    status && allowedStatuses.includes(status)
      ? updatedShifts.filter((s) => s.status === status)
      : updatedShifts;

  res.status(StatusCodes.OK).json({
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
});


export const respondToShift = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { staticId } = req.params;
    const { status } = req.body;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    if (!["accepted", "rejected"].includes(status)) {
      return next(
        new ErrorHandler(
          "Invalid status. Use 'accepted' or 'rejected'.",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 1️⃣ Check if shift exists
    const shift = await Static.findByPk(staticId);
    if (!shift) {
      return next(new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND));
    }

    // 2️⃣ Check guard assignment
    const staticGuard = await StaticGuards.findOne({
      where: { staticId, guardId: userId },
    });

    if (!staticGuard) {
      return next(
        new ErrorHandler(
          "You are not assigned to this shift",
          StatusCodes.FORBIDDEN
        )
      );
    }

    // 3️⃣ Prevent re-response
    if (["accepted", "rejected"].includes(staticGuard.status)) {
      return next(
        new ErrorHandler(
          `You have already ${staticGuard.status} this shift`,
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 4️⃣ Update guard response
    staticGuard.status = status;
    await staticGuard.save();

    // 5️⃣ Update shift status based on guard response
    if (status === "accepted") {
      await shift.update({ status: "upcoming" });
    }

    if (status === "rejected") {
      await shift.update({ status: "cancelled" });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: `Shift ${status} successfully`,
      data: {
        staticId,
        guardId: userId,
        guardStatus: staticGuard.status,
        shiftStatus: shift.status,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getStaticShiftById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
    );
  }

  const staticShift = await Static.findByPk(id, {
    include: [
      {
        model: User,
        as: "guards",
        attributes: ["id", "name", "email"],
        where: { id: userId }, 
        required: false,
        through: { attributes: ["status", "createdAt", "updatedAt"] },
      },
    ],
  });

  if (!staticShift) {
    return next(new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Shift fetched successfully",
    data: staticShift,
  });
});

