import { StatusCodes } from "http-status-codes";
import moment from "moment-timezone";
import { getTimeZone } from "../../utils/timeZone.js";
import catchAsyncError from "../../utils/catchAsyncError.js";
import ErrorHandler from "../../utils/errorHandler.js";
import Order from "../order/order.model.js";
import Static from "./static.model.js";
import StaticGuards from "./staticGuards.model.js";
import User from "../user/user.model.js";
import Incident from "../incident/incident.model.js";
import Notification from "../notifications/notifications.model.js";
import PatrolRun from "../patrolling/patrolRun.model.js";
import PatrolGuards from "../patrolling/PatrolGuards.model.js";
import PatrolSite from "../patrolling/patrolSite.model.js";
import PatrolSubSite from "../patrolling/patrolSubSite.model.js";
import PatrolCheckpoint from "../patrolling/patrolCheckpoint.model.js";
import Alarm from "../alarm/alarm.model.js";

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
    attributes: ["id", "type", "description", "startTime", "endTime", "status", "shiftTotalHours", "createdAt"],
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
      shiftTotalHours: shift?.shiftTotalHours || null,
      createdAt: shift.createdAt,
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
    const { staticId } = req.params; // same param used
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

    /**
     * =====================================================
     * 1️⃣ TRY STATIC SHIFT FIRST (UNCHANGED LOGIC)
     * =====================================================
     */
    const shift = await Static.findByPk(staticId);

    if (shift) {
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

      if (["accepted", "rejected"].includes(staticGuard.status)) {
        return next(
          new ErrorHandler(
            `You have already ${staticGuard.status} this shift`,
            StatusCodes.BAD_REQUEST
          )
        );
      }

      staticGuard.status = status;
      await staticGuard.save();

      if (status === "accepted") {
        await shift.update({ status: "upcoming" });
      }

      if (status === "rejected") {
        await shift.update({ status: "cancelled" });
      }

      const guard = await User.findByPk(userId);

      await Notification.create({
        userId,
        role: "guard",
        title: "Shift Response Recorded",
        message: `You have ${status} the shift successfully.`,
        type: "SHIFT_RESPONSE",
        data: { staticId, response: status },
      });

      const admins = await User.findAll({
        where: { role: "admin" },
        attributes: ["id"],
      });

      await Notification.bulkCreate(
        admins.map((admin) => ({
          userId: admin.id,
          role: "admin",
          title: "Shift Response Update",
          message: `Guard ${guard?.name || "Guard"} has ${status} the shift.`,
          type: "SHIFT_RESPONSE",
          data: {
            staticId,
            guardId: userId,
            guardName: guard?.name,
            response: status,
          },
        }))
      );

      return res.status(StatusCodes.OK).json({
  success: true,
  message: `Shift ${status} successfully`,
  data: {
    id: shift.id,
    type: "static",
    shiftStatus: shift.status,
    guardResponse: staticGuard.status,
    guardId: userId,
    guardName: guard?.name,
    startDateTime: shift.startTime,
endDateTime: shift.endTime,
  },
});

    }

    /**
     * =====================================================
     * 2️⃣ IF NOT STATIC → CHECK PATROL RUN
     * =====================================================
     */

    const patrolRun = await PatrolRun.findByPk(staticId);

    if (!patrolRun) {
      return next(new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND));
    }

    const patrolGuard = await PatrolGuards.findOne({
      where: { patrolRunId: patrolRun.id, guardId: userId },
    });

    if (!patrolGuard) {
      return next(
        new ErrorHandler(
          "You are not assigned to this patrol run",
          StatusCodes.FORBIDDEN
        )
      );
    }

    if (["accepted", "rejected"].includes(patrolGuard.status)) {
      return next(
        new ErrorHandler(
          `You have already ${patrolGuard.status} this patrol`,
          StatusCodes.BAD_REQUEST
        )
      );
    }

    if (status === "accepted") {
  // Step 1: Get OTHER guards (exclude current)
  const otherGuards = await PatrolGuards.findAll({
    where: {
      patrolRunId: patrolRun.id,
      guardId: { [Op.ne]: userId },
    },
  });

  // Step 2: Check if ALL OTHER guards are already "upcoming"
  const allOthersUpcoming = otherGuards.every(
    (g) => g.status === "upcoming"
  );

  // Step 3: Update current guard
  await patrolGuard.update({ status: "upcoming" });

  if (allOthersUpcoming) {
    // 🔥 All others already upcoming → make full patrol upcoming

    let updatedStructure = patrolRun.runStructure;

    updatedStructure = updatedStructure.map((site) => ({
      ...site,
      status: "upcoming",
      subSites: site.subSites.map((sub) => ({
        ...sub,
        status: "upcoming",
        checkpoints: sub.checkpoints.map((cp) => ({
          ...cp,
          status: "upcoming",
        })),
      })),
      checkpoints: site.checkpoints.map((cp) => ({
        ...cp,
        status: "upcoming",
      })),
    }));

    await patrolRun.update({
      status: "upcoming",
      runStructure: updatedStructure,
    });
  }
}

    if (status === "rejected") {
  // Step 1: Get OTHER guards (exclude current)
  const otherGuards = await PatrolGuards.findAll({
    where: {
      patrolRunId: patrolRun.id,
      guardId: { [Op.ne]: userId },
    },
  });

  // Step 2: Check if ALL OTHER guards are already "cancelled"
  const allOthersCancelled = otherGuards.every(
    (g) => g.status === "cancelled"
  );

  // Step 3: Update current guard
  await patrolGuard.update({ status: "cancelled" });

  if (allOthersCancelled) {
    // 🔥 All others already cancelled → cancel full patrol

    await patrolRun.update({ status: "cancelled" });

    // (Optional but recommended) ensure all guards are cancelled
    await PatrolGuards.update(
      { status: "cancelled" },
      { where: { patrolRunId: patrolRun.id } }
    );
  }
}

    /**
     * 🔔 Notifications (Patrol)
     */
    const guard = await User.findByPk(userId);

    // Guard notification
    await Notification.create({
      userId,
      role: "guard",
      title: "Patrol Response Recorded",
      message: `You have ${status} the patrol successfully.`,
      type: "PATROL_RESPONSE",
      data: {
        patrolRunId: patrolRun.id,
        response: status,
      },
    });

    // Admin notifications
    const admins = await User.findAll({
      where: { role: "admin" },
      attributes: ["id"],
    });

    await Notification.bulkCreate(
      admins.map((admin) => ({
        userId: admin.id,
        role: "admin",
        title: "Patrol Response Update",
        message: `Guard ${guard?.name || "Guard"} has ${status} the patrol.`,
        type: "PATROL_RESPONSE",
        data: {
          patrolRunId: patrolRun.id,
          guardId: userId,
          guardName: guard?.name,
          response: status,
        },
      }))
    );

    return res.status(StatusCodes.OK).json({
  success: true,
  message: `Patrol ${status} successfully`,
  data: {
    id: patrolRun.id,
    type: "patrol",
    patrolStatus: patrolRun.status,
    guardResponse: patrolGuard.status,
    guardId: userId,
    guardName: guard?.name,
    startDateTime: patrolRun.startDateTime,
    estimatedCompletionTime: patrolRun.estimatedCompletionTime,
    runStructure: patrolRun.runStructure, // optional (send only if frontend needs it)
  },
});


  } catch (error) {
    next(error);
  }
};



export const getMyShiftDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    /**
     * =========================================
     * 🔹 1️⃣ TRY FINDING STATIC SHIFT FIRST
     * =========================================
     */
    const staticShift = await Static.findOne({
      where: { id },
      attributes: [
        "id",
        "orderId",
        "type",
        "description",
        "startTime",
        "endTime",
        "status",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          required: true,
          attributes: ["id", "name", "email"],
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
        {
          model: Order,
          as: "order",
          attributes: ["locationName", "locationAddress", "images","serviceType"],
        },
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
      ],
    });

    if (staticShift) {
      const guard = staticShift.guards[0];
      const pivot = guard.StaticGuards;

      return res.status(StatusCodes.OK).json({
        success: true,
        type: "static",
        data: {
          shift: staticShift,
          order: staticShift.order,
          guard: {
            id: guard.id,
            name: guard.name,
            email: guard.email,
            assignment: pivot,
          },
          incidents: staticShift.incidents || [],
        },
      });
    }

    /**
     * =========================================
     * 🔹 2️⃣ IF NOT STATIC → CHECK PATROL RUN
     * =========================================
     */
    const patrolRun = await PatrolRun.findOne({
      where: { id },
      attributes: [
        "id",
        "patrolId",
        "orderId",
        "vehicleId",
        "notes",
        "status",
        "startDateTime",
        "estimatedCompletion",
        "runStructure",
        "totalSites",
        "totalSubSites",
        "totalCheckpoints",
        "completedSites",
        "completedSubSites",
        "completedCheckpoints",
        "createdAt",
        "updatedAt",
        "unitPrice",
      ],
      include: [
        {
          model: User,
          as: "guards",
          where: { id: guardId },
          required: true,
          attributes: ["id", "name", "email"],
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
        {
          model: Order,
          as: "order",
          attributes: [
            "locationName",
            "locationAddress",
            "images",
            "serviceType",
          ],
        },
        {
  model: Alarm,
  as: "alarms",
  attributes: [
    "id",
    "title",
    "description",
    "alarmType",
    "priority",
    "status",
    "breach",
    "siteId",
    "specificLocation",
    "etaMinutes",
    "slaTimeMinutes",
    "totalTimeMinutes",
    "unitPrice",
    "price",
    "createdAt",
    "updatedAt",
  ],
}
      ],
    });

    if (patrolRun) {
      const guard = patrolRun.guards[0];
      const pivot = guard.PatrolGuards;

      return res.status(StatusCodes.OK).json({
        success: true,
        type: "patrol",
        data: {
          patrol: {
            id: patrolRun.id,
            patrolId: patrolRun.patrolId,
            vehicleId: patrolRun.vehicleId,
            description: patrolRun.notes,
            status: patrolRun.status,
            startTime: patrolRun.startDateTime,
            endTime: patrolRun.estimatedCompletion,
            totalSites: patrolRun.totalSites,
            totalSubSites: patrolRun.totalSubSites,
            totalCheckpoints: patrolRun.totalCheckpoints,
            completedSites: patrolRun.completedSites,
            completedSubSites: patrolRun.completedSubSites,
            completedCheckpoints: patrolRun.completedCheckpoints,
            createdAt: patrolRun.createdAt,
          },
          alarms: patrolRun.alarms || [],

          order: patrolRun.order,

          guard: {
            id: guard.id,
            name: guard.name,
            email: guard.email,
            guardStatus: pivot.status,
            clockInTime: pivot.clockInTime,
            clockOutTime: pivot.clockOutTime,
            overtimeStartTime: pivot.overtimeStartTime,
            overtimeEndTime: pivot.overtimeEndTime,
            overtimeHours: pivot.overtimeHours,
            totalHours: pivot.totalHours,
            assignedAt: pivot.createdAt,
          },

          // 🔥 THIS IS THE IMPORTANT PART
          sites: patrolRun.runStructure || [],
        },
      });
    }

    /**
     * ❌ NOT FOUND
     */
    return next(new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND));
  } catch (error) {
    console.error("GET SHIFT DETAILS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


