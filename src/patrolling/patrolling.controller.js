// controllers/admin/patrolSite.controller.js
import { StatusCodes } from "http-status-codes";
import PatrolSite from "./patrolSite.model.js";
import User from "../user/user.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
import PatrolSubSite from "./patrolSubSite.model.js";

export const createPatrolSite = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    const {
      name,
      address,
      latitude,
      longitude,
      clientId,
      description,
    } = req.body;

    // 🔒 Validation
    if (!name || !address || !latitude || !longitude || !clientId) {
      return next(
        new ErrorHandler(
          "All required fields must be provided",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // ✅ Validate client exists
    const client = await User.findOne({
      where: {
        id: clientId,
        role: "user",
      },
    });

    if (!client) {
      return next(
        new ErrorHandler("Client not found", StatusCodes.NOT_FOUND)
      );
    }

    const site = await PatrolSite.create({
      createdBy: userId,
      clientId,
      name,
      address,
      latitude,
      longitude,
      description,
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Patrol site created successfully",
      data: site,
    });
  } catch (error) {
    console.error("CREATE PATROL SITE ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to create patrol site",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};;

export const createPatrolSubSite = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    const {
      siteId,
      name,
      unitPrice,
      estimatedDuration,
      description,
    } = req.body;

    // 🔒 Validation
    if (!siteId || !name || !unitPrice || !estimatedDuration) {
      return next(
        new ErrorHandler(
          "All required fields must be provided",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // ✅ Check parent site exists
    const site = await PatrolSite.findByPk(siteId);

    if (!site) {
      return next(
        new ErrorHandler("Patrol site not found", StatusCodes.NOT_FOUND)
      );
    }

    const subSite = await PatrolSubSite.create({
      siteId,
      name,
      unitPrice,
      estimatedDuration,
      description,
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Sub-site created successfully",
      data: subSite,
    });
  } catch (error) {
    console.error("CREATE PATROL SUB-SITE ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to create patrol sub-site",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

