import { StatusCodes } from "http-status-codes";
import catchAsyncError from "../../utils/catchAsyncError.js";
import ErrorHandler from "../../utils/errorHandler.js";
import Order from "./order.model.js";
import User from "../user/user.model.js";
import userModel from "../user/user.model.js";
import { getTimeZone, toUTC } from "../../utils/timeZone.js";
import sequelize from "../../config/database.js";
import moment from "moment-timezone";
import { Op } from "sequelize";
import Static from "../shift/static.model.js";
import StaticGuards from "../shift/staticGuards.model.js";
import Incident from "../incident/incident.model.js";
import ShiftChangeRequest from "./shiftChangeRequest.model.js";
import { notifyAdminOnly } from "../../utils/notifyAdminOnly.helper.js";


export const createOrder = catchAsyncError(async (req, res, next) => {
  const { 
    serviceType, 
    locationName,
    locationAddress, 
    siteService, 
    guardsRequired, 
    description, 
    startDate, 
    endDate, 
    startTime, 
    endTime, 
    images 
  } = req.body;

  const userId = req.user?.id;
  if (!userId) {
    return next(new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED));
  }

  const user = await userModel.findByPk(userId);
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  if (!serviceType ||!locationName || !locationAddress || !siteService || !guardsRequired || !startDate) {
    return next(new ErrorHandler("Required fields are missing", StatusCodes.BAD_REQUEST));
  }

  if (
    typeof siteService !== "object" ||
    typeof siteService.lat !== "number" ||
    typeof siteService.lng !== "number"
  ) {
    return next(
      new ErrorHandler("Invalid siteService format — must include lat and lng as numbers", StatusCodes.BAD_REQUEST)
    );
  }
const sitePoint = sequelize.literal(
    `ST_GeomFromText('POINT(${siteService.lng} ${siteService.lat})', 4326)`
  );

  const newOrder = await Order.create({
    userId,
    serviceType,
    locationName,
    locationAddress,
    siteService: sitePoint,
    guardsRequired,
    description,
    startDate: toUTC(startDate),
    endDate: toUTC(endDate),
    startTime,
    endTime,
    images,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Order created successfully",
    data: newOrder,
  });
});



export const getUserOrders = catchAsyncError(async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return next(
      new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
    );
  }

  // Extract query params
  let { page = 1, limit = 10, status } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;

  const offset = (page - 1) * limit;

  // Build filter condition
  const whereCondition = { userId };
  const allowedStatuses = [
    "pending",
    "upcoming",
    "ongoing",
    "completed",
    "cancelled",
  ];

  if (status && allowedStatuses.includes(status)) {
    whereCondition.status = status;
  }

  // Fetch paginated + filtered data
  const { count, rows: orders } = await Order.findAndCountAll({
    where: whereCondition,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  // If no orders found
  if (!orders.length) {
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "No orders found for this user",
      data: [],
      pagination: {
        total: 0,
        page,
        totalPages: 0,
        limit,
      },
    });
  }

  // Success response
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Orders fetched successfully",
    data: orders,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
});

export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      where: {
        id: id,
        userId: userId, // 🔐 ownership check
      },
      
      include: [
        {
          model: Static,
          as: "statics",
          attributes: [
            "id",
            "date",
            "startTime",
            "endTime",
            "status",
          ],
          include: [
            {
              model: User,
              as: "guards",
              attributes: ["id", "name", "avatar"],
              through: {
                model: StaticGuards,
                attributes: [
                  "status",
                  "totalHours",
                  "clockInTime",
                  "clockOutTime",
                  "requestOffStatus",
                  "changeShiftStatus"
                ],
              },
            },
          ],
        },
      ],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};


export const cancelOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const order = await Order.findByPk(id);
  if(!order){
    return next(
      new ErrorHandler("Order not found", StatusCodes.NOT_FOUND)
    );
  }

  if(order.status!=="pending"){
    return next(
      new ErrorHandler("Only pending orders can be cancelled", StatusCodes.BAD_REQUEST)
    );
  }
  
  order.status="cancelled";
  await order.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Order cancelled successfully",
    data: order,
  })
});

export const acceptOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findByPk(id);

  if (!order) {
    return next(
      new ErrorHandler("Order not found", StatusCodes.NOT_FOUND)
    );
  }

  if (order.status !== "pending") {
    return next(
      new ErrorHandler(
        "Only pending orders can be accepted",
        StatusCodes.BAD_REQUEST
      )
    );
  }

  const tz = getTimeZone();
  const now = moment().tz(tz);

  /**
   * 🕒 Build full order start datetime
   */
  const orderStartDateTime = moment
    .utc(order.startDate)
    .tz(tz)
    .set({
      hour: moment(order.startTime, "HH:mm").hour(),
      minute: moment(order.startTime, "HH:mm").minute(),
      second: 0,
    });

  /**
   * 🔴 If order start time has already passed → MISSED
   */
  if (now.isAfter(orderStartDateTime)) {
    order.status = "missed";
    await order.save();

    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: "Order start time has passed. Order marked as missed.",
      data: order,
    });
  }

  /**
   * 🟢 Accept order → UPCOMING
   */
  order.status = "upcoming";
  await order.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: 'Order accepted successfully — status set to "upcoming".',
    data: order,
  });
});

export const getAllOrders = catchAsyncError(async (req, res, next) => {
  let { page = 1, limit = 10, status, serviceType, search = "" } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);
  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;

  const offset = (page - 1) * limit;

  const allowedStatuses = [
    "pending",
    "upcoming",
    "ongoing",
    "completed",
    "cancelled",
    "missed",
    "order_missed",
  ];

  const allowedServiceTypes = [
    "static",
    "premiumSecurity",
    "standardPatrol",
    "24/7Monitoring",
    "healthcareSecurity",
    "industrialSecurity",
  ];

  const { count, rows: orders } = await Order.findAndCountAll({
    where: {
      // Status filter
      ...(status && allowedStatuses.includes(status) && { status }),
      
      // Service type filter
      ...(serviceType && allowedServiceTypes.includes(serviceType) && { serviceType }),
      
      // Search filter - SIMPLE like guards/clients
      ...(search && {
        [Op.or]: [
          { locationName: { [Op.iLike]: `%${search}%` } },
          { locationAddress: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
        ],
      }),
    },
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "name", "email", "mobile", "address"],
      },
    ],
    attributes: [
      "id",
      "status",
      "serviceType",
      "locationName",
      "locationAddress",
      "guardsRequired",
      "description",
      "startDate",
      "endDate",
      "startTime",
      "endTime",
      "images",
      "createdAt",
      "updatedAt",
      "siteService",
      "userId",
    ],
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Orders fetched successfully",
    data: orders,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
});




export const getAdminOrderById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const order = await Order.findByPk(id, {
    include: [
      {
        model: User,
        as: "user", 
        attributes: ["id", "name", "email", "mobile", "address"], 
      },
    ],
  });

  if (!order) {
    return next(new ErrorHandler("Order not found", StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Admin order fetched successfully",
    data: order,
  });
});

export const editOrder = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  
  // Find the order
  const order = await Order.findByPk(id);
  if (!order) {
    return next(new ErrorHandler("Order not found", StatusCodes.NOT_FOUND));
  }

  // Prevent editing completed or cancelled orders
  if (["completed", "cancelled"].includes(order.status)) {
    return next(
      new ErrorHandler(
        "Cannot edit completed or cancelled orders", 
        StatusCodes.BAD_REQUEST
      )
    );
  }

  const {
    serviceType,
    locationName,
    locationAddress,
    siteService,
    guardsRequired,
    description,
    startDate,
    endDate,
    startTime,
    endTime,
    images
  } = req.body;

  // Build update object with only provided fields
  const updateData = {};
  
  if (serviceType !== undefined) updateData.serviceType = serviceType;
  if (locationName !== undefined) updateData.locationName = locationName;
  if (locationAddress !== undefined) updateData.locationAddress = locationAddress;
  if (guardsRequired !== undefined) updateData.guardsRequired = guardsRequired;
  if (description !== undefined) updateData.description = description;
  if (startTime !== undefined) updateData.startTime = startTime;
  if (endTime !== undefined) updateData.endTime = endTime;
  if (images !== undefined) updateData.images = images;

  // Handle date conversions
  if (startDate) {
    updateData.startDate = toUTC(startDate);
  }
  if (endDate) {
    updateData.endDate = toUTC(endDate);
  }

  // Handle siteService geometry update
  if (siteService) {
    if (
      typeof siteService !== "object" ||
      typeof siteService.lat !== "number" ||
      typeof siteService.lng !== "number"
    ) {
      return next(
        new ErrorHandler(
          "Invalid siteService format — must include lat and lng as numbers",
          StatusCodes.BAD_REQUEST
        )
      );
    }
    
    updateData.siteService = sequelize.literal(
      `ST_GeomFromText('POINT(${siteService.lng} ${siteService.lat})', 4326)`
    );
  }

  // Update the order
  await order.update(updateData);

  // Fetch fresh data to return
  const updatedOrder = await Order.findByPk(id);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Order updated successfully",
    data: updatedOrder
  });
});

export const getUserUpcomingOrders = async (req, res, next) => {
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
    );
  }

  let { page = 1, limit = 10 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 10;

  const offset = (page - 1) * limit;

  const { count, rows: orders } = await Order.findAndCountAll({
    where: {
      userId,
      status: "upcoming",
    },
    order: [
      ["startDate", "ASC"],
      ["startTime", "ASC"],
    ],
    limit,
    offset,
  });

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Upcoming orders fetched successfully",
    data: orders,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
};



export const getUserOngoingOrders = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const offset = (page - 1) * limit;

    const { count, rows: orders } = await Order.findAndCountAll({
      where: {
        userId,
        status: "ongoing",
      },
      order: [
        ["startDate", "ASC"],
        ["startTime", "ASC"],
      ],
      limit,
      offset,

      include: [
        {
          model: Static,
          as: "statics",
          attributes: [
            "id",
            "date",
            "startTime",
            "endTime",
            "status",
          ],
          include: [
            {
              model: User,
              as: "guards",
              attributes: ["id", "name", "avatar"],
              through: {
                model: StaticGuards,
                attributes: [
                  "status",
                  "totalHours",
                  "clockInTime",
                  "clockOutTime",
                  "requestOffStatus",
                  "changeShiftStatus"
                ],
              },
            },
          ],
        },
      ],
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Ongoing orders with assigned guards fetched successfully",
      data: orders,
      pagination: {
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getRequestedOrders = async (req, res, next) => {
  try {
    const userId = req.user.id; // logged-in client

    const orders = await Order.findAll({
      where: {
        userId,
        status: "pending",
      },
      order: [["createdAt", "DESC"]],
    });

    res.status(StatusCodes.OK).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    console.error("Get Requested Orders error:", error);
    return next(
      new ErrorHandler(
        "Failed to get requested orders",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getOrderHistory = async (req, res, next) => {
  try {
    const userId = req.user.id; // logged-in user

    const orders = await Order.findAll({
      where: {
        userId,
        status: {
          [Op.in]: ["completed", "cancelled","missed", "order_missed","ongoing"],
        },
      },
      order: [["updatedAt", "DESC"]],

      include: [
        {
          model: Static,
          as: "statics",
          attributes: [
            "id",
            "date",
            "startTime",
            "endTime",
            "status",
          ],
          include: [
            {
              model: User,
              as: "guards",
              attributes: ["id", "name", "avatar"],
              through: {
                model: StaticGuards,
                attributes: [
                  "status",
                  "totalHours",
                  "clockInTime",
                  "clockOutTime",
                  "requestOffStatus",
                  "changeShiftStatus"
                ],
              },
            },
          ],
        },
      ],
    });

    res.status(StatusCodes.OK).json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyOrdersByDate = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
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

    // ✅ Exact date range
    const startOfDay = moment.tz(date, tz).startOf("day").toDate();
    const endOfDay = moment.tz(date, tz).endOf("day").toDate();

    const orders = await Order.findAll({
      where: {
        userId,
        startDate: {
          [Op.between]: [startOfDay, endOfDay],
        },
      },
      include: [
        {
          model: Static,
          as: "statics",
          required: false, // 👈 order can exist without shifts
          include: [
            {
              model: Incident,
              as: "incidents",
              required: false,
            },
          ],
        },
      ],
      order: [
        ["startDate", "ASC"],
        [{ model: Static, as: "statics" }, "startTime", "ASC"],
      ],
    });

    const response = orders.map(order => ({
      id: order.id,
      serviceType: order.serviceType,
      locationName: order.locationName,
      locationAddress: order.locationAddress,
      guardsRequired: order.guardsRequired,
      status: order.status,
      description: order.description,
      startDate: moment(order.startDate).tz(tz).format("YYYY-MM-DD"),
      endDate: order.endDate
        ? moment(order.endDate).tz(tz).format("YYYY-MM-DD")
        : null,
      startTime: order.startTime,
      endTime: order.endTime,
      images: order.images || [],
      createdAt: order.createdAt,

      // 👇 SHIFTS DATA
      shifts: (order.statics || []).map(shift => ({
        id: shift.id,
        type: shift.type,
        status: shift.status,
        description: shift.description,
        startTime: shift.startTime,
        endTime: shift.endTime,
        createdAt: shift.createdAt,

        // 👇 INCIDENTS (OPTIONAL)
        incidents: (shift.incidents || []).map(incident => ({
          id: incident.id,
          type: incident.type,
          description: incident.description,
          status: incident.status,
          createdAt: incident.createdAt,
        })),
      })),
    }));

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Orders and shifts fetched successfully for selected date",
      date,
      count: response.length,
      data: response,
    });
  } catch (error) {
    console.error("GET MY ORDERS BY DATE ERROR:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const requestShiftChange = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id: shiftId } = req.params; // ✅ rename for clarity
    const { startTime, endTime, reason } = req.body;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    if (!startTime || !endTime || !reason) {
      return next(
        new ErrorHandler(
          "Start time, end time and reason are required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // ✅ Verify shift exists
    const shift = await Static.findByPk(shiftId);
    if (!shift) {
      return next(
        new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND)
      );
    }

    // ❗ Prevent duplicate pending request for same shift
    const existingRequest = await ShiftChangeRequest.findOne({
      where: {
        shiftId, // ✅ FIXED
        requestedBy: userId,
        status: "pending",
      },
    });

    if (existingRequest) {
      return next(
        new ErrorHandler(
          "You already have a pending request for this shift",
          StatusCodes.CONFLICT
        )
      );
    }

    const tz = getTimeZone();

    const requestedStart = moment.tz(startTime, tz).utc().toDate();
    const requestedEnd = moment.tz(endTime, tz).utc().toDate();

    // ✅ CREATE REQUEST (DO NOT SET id)
    const request = await ShiftChangeRequest.create({
      shiftId, // ✅ REQUIRED FIELD
      requestedBy: userId,
      requestedStartTime: requestedStart,
      requestedEndTime: requestedEnd,
      reason,
      status: "pending",
    });

    // 🔔 Notify admin
    await notifyAdminOnly({
      title: "Shift Change Request",
      type: "SHIFT_CHANGE_REQUEST",
      message: "A guard requested a shift time change.",
      data: {
        shiftId,
        requestId: request.id,
        requestedBy: userId,
      },
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Shift change request sent to admin",
      data: request,
    });
  } catch (error) {
    console.error("SHIFT CHANGE REQUEST ERROR:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
    });
  }
};






