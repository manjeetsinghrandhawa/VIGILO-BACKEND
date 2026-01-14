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

export const getOrderById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const order = await Order.findByPk(id);
  if(!order){
    return next(
      new ErrorHandler("Order not found", StatusCodes.NOT_FOUND)
    );
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Order fetched successfully",
    data: order,
  })
});

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
    return next(new ErrorHandler("Order not found", StatusCodes.NOT_FOUND));
  }

  if (order.status !== "pending") {
    return next(
      new ErrorHandler("Only pending orders can be accepted", StatusCodes.BAD_REQUEST)
    );
  }

  const tz = getTimeZone();
  const now = moment().tz(tz);
  const start = moment.utc(order.startDate).tz(tz);
  const end = order.endDate ? moment.utc(order.endDate).tz(tz) : null;

  let newStatus;

  if (now.isBefore(start)) {
    newStatus = "upcoming";
  } else if (end && now.isSameOrAfter(end)) {
    newStatus = "completed";
  } else {
    newStatus = "ongoing";
  }

  order.status = newStatus;
  await order.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: `Order accepted successfully — status set to "${newStatus}".`,
    data: order,
  });
});

export const getAllOrders = catchAsyncError(async (req, res, next) => {
  let { page = 1, limit = 10, status, serviceType, search } = req.query;

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
  ];

  const allowedServiceTypes = [
    "static",
    "premiumSecurity",
    "standardPatrol",
    "24/7Monitoring",
    "healthcareSecurity",
    "industrialSecurity",
  ];

  const whereCondition = {};

  if (status && allowedStatuses.includes(status)) {
    whereCondition.status = status;
  }

  if (serviceType && allowedServiceTypes.includes(serviceType)) {
    whereCondition.serviceType = serviceType;
  }

  if (search) {
    whereCondition[Op.or] = [
      { id: { [Op.iLike]: `%${search}%` } },
      { customerName: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { count, rows: orders } = await Order.findAndCountAll({
  where: whereCondition,
  order: [["createdAt", "DESC"]],
  limit,
  offset,
  attributes: [
    "id",
    "status",
    "serviceType",
    "locationName",       // ← ADD THIS
    "locationAddress",
    "guardsRequired",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "images",
    "createdAt",
    "updatedAt",
    "siteService",         // ← Add this too
  ]
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
