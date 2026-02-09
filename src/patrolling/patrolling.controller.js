// controllers/admin/patrolSite.controller.js
import { StatusCodes } from "http-status-codes";
import PatrolSite from "./patrolSite.model.js";
import User from "../user/user.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
import PatrolSubSite from "./patrolSubSite.model.js";
import QRCode from "qrcode";
import sequelize from "../../config/database.js";
import PatrolCheckpoint from "./patrolCheckpoint.model.js";
import QR from "./QR.model.js";
import { s3Uploadv2 } from "../../utils/s3.js";
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

export const getAllPatrolSites = async (req, res, next) => {
  try {
    const sites = await PatrolSite.findAll({
      include: [
        {
          model: PatrolSubSite,
          as: "subSites",
        },
        {
          model: User,
          as: "client",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: sites,
    });
  } catch (error) {
    console.error("GET PATROL SITES ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch patrol sites",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getPatrolSiteById = async (req, res, next) => {
  try {
    const { siteId } = req.params;

    const site = await PatrolSite.findByPk(siteId, {
      include: [
        {
          model: PatrolSubSite,
          as: "subSites",
        },
        {
          model: User,
          as: "client",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!site) {
      return next(
        new ErrorHandler("Patrol site not found", StatusCodes.NOT_FOUND)
      );
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: site,
    });
  } catch (error) {
    console.error("GET PATROL SITE ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch patrol site",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getSubSitesBySiteId = async (req, res, next) => {
  try {
    const { siteId } = req.params;

    const site = await PatrolSite.findByPk(siteId);

    if (!site) {
      return next(
        new ErrorHandler("Patrol site not found", StatusCodes.NOT_FOUND)
      );
    }

    const subSites = await PatrolSubSite.findAll({
      where: { siteId },
      order: [["createdAt", "ASC"]],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: subSites,
    });
  } catch (error) {
    console.error("GET SUB SITES ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch sub-sites",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const createCheckpoint = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      siteId,
      subSiteId,
      name,
      latitude,
      longitude,
      verificationRange,
      priorityLevel,
      description,
    } = req.body;

    // =========================
    // 🔒 VALIDATIONS
    // =========================
    if (!name || latitude === undefined || longitude === undefined) {
      return next(
        new ErrorHandler(
          "Checkpoint name, latitude and longitude are required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    if (!siteId && !subSiteId) {
      return next(
        new ErrorHandler(
          "Either siteId or subSiteId is required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // =========================
    // 📍 CREATE CHECKPOINT
    // =========================
    const checkpoint = await PatrolCheckpoint.create(
      {
        siteId: siteId || null,
        subSiteId: subSiteId || null,
        name,
        latitude,
        longitude,
        verificationRange,
        priorityLevel,
        description,
      },
      { transaction }
    );

    // =========================
    // 🔳 GENERATE QR DATA
    // =========================
    const qrPayload = JSON.stringify({
      checkPointId: checkpoint.id,
      latitude,
      longitude,
    });

    const svgData = await QRCode.toString(qrPayload, { type: "svg" });

    const file = {
      originalname: `checkpoint-qr-${checkpoint.id}.svg`,
      buffer: Buffer.from(svgData),
      mimetype: "image/svg+xml",
    };

    // =========================
    // ☁️ UPLOAD TO S3
    // =========================
    const s3Result = await s3Uploadv2(file);

    // =========================
    // 💾 SAVE QR RECORD
    // =========================
    const qrRecord = await QR.create(
      {
        checkPointId: checkpoint.id,
        latitude,
        longitude,
        qrUrl: s3Result.Location,
      },
      { transaction }
    );

    await transaction.commit();

    // =========================
    // ✅ RESPONSE
    // =========================
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Checkpoint created successfully",
      data: {
        checkpoint,
        qr: qrRecord,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("CREATE CHECKPOINT ERROR:", error);

    return next(
      new ErrorHandler(
        "Failed to create checkpoint",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


