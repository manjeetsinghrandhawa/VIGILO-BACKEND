import { StatusCodes } from "http-status-codes";
import catchAsyncError from "../../utils/catchAsyncError.js";
import ErrorHandler from "../../utils/errorHandler.js";
import Incident from "./incident.model.js";
import Static from "../shift/static.model.js";
import User from "../user/user.model.js";

export const createIncident = catchAsyncError(async (req, res, next) => {
  const { name, location, description, images, shiftId } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return next(
      new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
    );
  }

  if (!name || !location || !shiftId) {
    return next(
      new ErrorHandler("Name, location, and shiftId are required", StatusCodes.BAD_REQUEST)
    );
  }

  const shift = await Static.findByPk(shiftId);
  if (!shift) {
    return next(
      new ErrorHandler("Shift not found", StatusCodes.NOT_FOUND)
    );
  }

  const incident = await Incident.create({
    name,
    location,
    description: description || null,
    images: images?.length ? images : null,
    shiftId,
    reportedBy: userId,
  });

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Incident reported successfully",
    data: incident,
  });
});

export const getAllIncidents = catchAsyncError(async (req, res, next) => {
  let { page = 1, limit = 10 } = req.query;
  let {shiftId}=req.params;

  if (!shiftId) {
    return next(
      new ErrorHandler("shiftId is required", StatusCodes.BAD_REQUEST)
    );
  }

  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const { count, rows: incidents } = await Incident.findAndCountAll({
    where: { shiftId },
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Incidents fetched successfully",
    data: incidents,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
});


export const editIncident = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { name, location, description, images } = req.body;

  const incident = await Incident.findByPk(id);
  if (!incident) {
    return next(new ErrorHandler("Incident not found", StatusCodes.NOT_FOUND));
  }

  await incident.update({
    name: name ?? incident.name,
    location: location ?? incident.location,
    description: description ?? incident.description,
    imageUrls: images?.length ? images : incident.imageUrls,
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Incident updated successfully",
    data: incident,
  });
});

export const deleteIncident = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const incident = await Incident.findByPk(id);

  if (!incident) {
    return next(new ErrorHandler("Incident not found", StatusCodes.NOT_FOUND));
  }

  await incident.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Incident deleted successfully",
  });
});

export const getIncidentById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const incident = await Incident.findByPk(id);

  if (!incident) {
    return next(new ErrorHandler("Incident not found", StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Incident fetched successfully",
    data: incident,
  });
});

export const getAllIncidentsForAdmin = catchAsyncError(async (req, res, next) => {
  let { page = 1, limit = 10 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const { count, rows: incidents } = await Incident.findAndCountAll({
    order: [["createdAt", "DESC"]],
    
    limit,
    offset,
    include: [
      {
        model: User,
        as: "assignedGuardUser",
        attributes: ["id", "name"]
      },
      {
        model: User,
        as: "reporter",
        attributes: ["id", "name"]
      },
      {
        model: Static,
        as: "shift",
        attributes: ["id", "type"]
      }
    ]
    
    
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "All incidents fetched successfully",
    data: incidents,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
});

export const getIncidentByIdForAdmin = catchAsyncError(async (req, res, next) => {
  console.log("1");
  const { id } = req.params;
  console.log(id,"id");
  const incident = await Incident.findByPk(id,{
    include: [
      {
        model: User,
        as: "assignedGuardUser",
        attributes: ["id", "name"]
      },
      {
        model: User,
        as: "reporter",
        attributes: ["id", "name"]
      },
      {
        model: Static,
        as: "shift",
        attributes: ["id", "type"]
      }
    ]
  });
  console.log(incident,"fetched");

  if (!incident) {
    return next(
      new ErrorHandler("Incident not found", StatusCodes.NOT_FOUND)
    );
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Incident details fetched successfully",
    data: incident,
  });
});




