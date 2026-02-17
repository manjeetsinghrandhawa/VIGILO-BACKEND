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
import PatrolRun from "./patrolRun.model.js";
import { notifyGuardAndAdmin } from "../../utils/notification.helper.js";
import PatrolGuards from "./PatrolGuards.model.js";
import Order from "../order/order.model.js";
import { Op } from "sequelize";


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

    // 🔥 increment count
await PatrolSite.increment(
  { totalSubSites: 1 },
  { where: { id: siteId } }
);

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
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    const { count, rows } = await PatrolSite.findAndCountAll({
      include: [
        {
          model: PatrolSubSite,
          as: "subSites",
          attributes: ["id", "name"],
        },
        {
          model: User,
          as: "client",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset: Number(offset),
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      total: count,
      page: Number(page),
      totalPages: Math.ceil(count / limit),
      data: rows,
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
          include: [
            {
              model: PatrolCheckpoint,
              as: "checkpoints",
              attributes: ["id", "name"],
            },
          ],
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
      include: [
        {
          model: PatrolCheckpoint,
          as: "checkpoints",
          attributes: ["id", "name"],
        },
      ],
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

    if (siteId) {
  await PatrolSite.increment(
    { totalCheckpoints: 1 },
    { where: { id: siteId }, transaction }
  );
}

if (subSiteId) {
  await PatrolSubSite.increment(
    { totalCheckpoints: 1 },
    { where: { id: subSiteId }, transaction }
  );

  // Also increment site totalCheckpoints
  const sub = await PatrolSubSite.findByPk(subSiteId);
  await PatrolSite.increment(
    { totalCheckpoints: 1 },
    { where: { id: sub.siteId }, transaction }
  );
}


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

export const getCheckpoints = async (req, res, next) => {
  try {
    const { siteId, subSiteId } = req.query;

    if (!siteId && !subSiteId) {
      return next(
        new ErrorHandler(
          "siteId or subSiteId is required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    const whereCondition = {};
    if (siteId) whereCondition.siteId = siteId;
    if (subSiteId) whereCondition.subSiteId = subSiteId;

    const checkpoints = await PatrolCheckpoint.findAll({
      where: whereCondition,
      include: [
        {
          model: QR,
          as: "qr",
          attributes: ["id", "qrUrl", "latitude", "longitude", "createdAt"],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    const data = checkpoints.map((cp) => ({
      checkpointId: cp.id,
      name: cp.name,
      range: cp.verificationRange,
      latitude: cp.latitude,
      longitude: cp.longitude,
      qr: cp.qr
        ? {
            qrUrl: cp.qr.qrUrl,
            qrId: cp.qr.id,
            coordinates: {
              lat: cp.qr.latitude,
              lng: cp.qr.longitude,
            },
            range: cp.verificationRange,
            createdAt: cp.qr.createdAt,
          }
        : null,
    }));

    return res.status(StatusCodes.OK).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("GET CHECKPOINTS ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch checkpoints",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


export const createPatrolRun = async (req, res, next) => {
  try {
    const {
      patrolId,
      orderId,
      guardId,
      vehicleId,
      startDateTime,
      estimatedCompletion,
      notes,
      siteIds,
    } = req.body;

    // =============================
    // 🔒 VALIDATION
    // =============================
    if (!patrolId || !guardId || !startDateTime || !siteIds?.length) {
      return next(
        new ErrorHandler(
          "Patrol ID, Guard, start time and at least one site required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // =============================
    // 1️⃣ CHECK GUARD
    // =============================
    const guard = await User.findByPk(guardId);

    if (!guard) {
      return next(
        new ErrorHandler("Guard not found", StatusCodes.NOT_FOUND)
      );
    }

    // =============================
// 1️⃣ CHECK ORDER
// =============================
const order = await Order.findByPk(orderId);

if (!order) {
  return next(
    new ErrorHandler("Order not found", StatusCodes.NOT_FOUND)
  );
}


    // =============================
    // 2️⃣ PREVENT MULTIPLE ACTIVE/SCHEDULED PATROLS
    // =============================
    const existingPatrolShift = await PatrolGuards.findOne({
  where: {
    guardId,
    status: {
      [Op.in]: ["scheduled", "active"],
    },
  },
});


    if (existingPatrolShift) {
      return next(
        new ErrorHandler(
          "Guard already has an active or scheduled patrol run",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // =============================
    // 3️⃣ VALIDATE SITES
    // =============================
    const sites = await PatrolSite.findAll({
      where: { id: siteIds },
      include: [
        {
          model: PatrolSubSite,
          as: "subSites",
          include: [
            {
              model: PatrolCheckpoint,
              as: "checkpoints",
            },
          ],
        },
        {
          model: PatrolCheckpoint,
          as: "checkpoints",
        },
      ],
    });

    if (sites.length !== siteIds.length) {
      return next(
        new ErrorHandler("One or more sites not found", StatusCodes.BAD_REQUEST)
      );
    }

    // =============================
    // 4️⃣ CALCULATE TOTALS
    // =============================
    let totalSites = sites.length;
    let totalSubSites = 0;
    let totalCheckpoints = 0;

    sites.forEach((site) => {
      totalSubSites += site.subSites?.length || 0;
      totalCheckpoints += site.checkpoints?.length || 0;

      site.subSites?.forEach((sub) => {
        totalCheckpoints += sub.checkpoints?.length || 0;
      });
    });

    // =============================
    // 5️⃣ CREATE PATROL RUN
    // =============================
    const patrolRun = await PatrolRun.create({
      patrolId,
      orderId,
      guardId,
      vehicleId,
      startDateTime,
      estimatedCompletion,
      notes,
      siteIds,
      status: "pending",
      approvalStatus: "pending",
      totalSites,
      totalSubSites,
      totalCheckpoints,
      completedSites: 0,
      completedSubSites: 0,
      completedCheckpoints: 0,
    });

    // =============================
    // 6️⃣ CREATE SHIFT ENTRY IN PatrolGuards
    // =============================
    await PatrolGuards.create({
  patrolRunId: patrolRun.id,
  guardId,
  status: "pending",
});


    // =============================
    // 7️⃣ NOTIFICATION
    // =============================
    await notifyGuardAndAdmin({
      guardId,
      patrolRunId: patrolRun.id,
      status: "patrol_assigned",
      type: "PATROL_ASSIGNED",
      guardMessage: `You have been assigned a new patrol run (${patrolId}).`,
      adminMessage: `Patrol ${patrolId} assigned to ${guard.name}.`,
    });

    // =============================
    // ✅ RESPONSE
    // =============================
    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Patrol run created successfully",
      data: patrolRun,
    });

  } catch (error) {
    console.error("CREATE PATROL RUN ERROR:", error);
    return next(
      new ErrorHandler(
        "Internal server error",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


export const deletePatrolSite = async (req, res, next) => {
  try {
    const { siteId } = req.params;

    const site = await PatrolSite.findByPk(siteId);

    if (!site) {
      return next(
        new ErrorHandler("Patrol site not found", StatusCodes.NOT_FOUND)
      );
    }

    await site.destroy(); // soft delete

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Patrol site deleted successfully",
    });

  } catch (error) {
    console.error("DELETE PATROL SITE ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to delete patrol site",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const deletePatrolSubSite = async (req, res, next) => {
  try {
    const { subSiteId } = req.params;

    const subSite = await PatrolSubSite.findByPk(subSiteId);

    if (!subSite) {
      return next(
        new ErrorHandler("Sub-site not found", StatusCodes.NOT_FOUND)
      );
    }

    await subSite.destroy(); // soft delete

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Sub-site deleted successfully",
    });

  } catch (error) {
    console.error("DELETE PATROL SUB-SITE ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to delete sub-site",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const deleteCheckpoint = async (req, res, next) => {
  try {
    const { checkpointId } = req.params;

    const checkpoint = await PatrolCheckpoint.findByPk(checkpointId);

    if (!checkpoint) {
      return next(
        new ErrorHandler("Checkpoint not found", StatusCodes.NOT_FOUND)
      );
    }

    await checkpoint.destroy(); // soft delete

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Checkpoint deleted successfully",
    });

  } catch (error) {
    console.error("DELETE CHECKPOINT ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to delete checkpoint",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const deletePatrolRun = async (req, res) => {
  try {
    const { patrolId } = req.params;

    const patrolRun = await PatrolRun.findByPk(patrolId);

    if (!patrolRun) {
      return res.status(404).json({
        success: false,
        message: "Patrol run not found",
      });
    }

    await patrolRun.destroy(); // hard delete

    return res.status(200).json({
      success: true,
      message: "Patrol run deleted successfully",
    });

  } catch (error) {
    console.error("DELETE PATROL RUN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getAllPatrolRuns = async (req, res, next) => {
  try {
    const patrols = await PatrolRun.findAll({
      include: [
        {
          model: User,
          as: "guard",
          attributes: ["id", "name"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      total: patrols.length,
      data: patrols,
    });
  } catch (error) {
    console.error("GET ALL PATROL RUNS ERROR:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch patrol runs",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getPatrolRunById = async (req, res) => {
  try {
    const { patrolId } = req.params;

    const patrolRun = await PatrolRun.findByPk(patrolId, {
      include: [
        {
          model: User,
          as: "guard",
          attributes: ["id", "name", "email"],
        },
        // {
        //   model: Vehicle,
        //   as: "vehicle",
        // },
        {
          model: PatrolSite,
          as: "runSites",
          include: [
            {
              model: PatrolSubSite,
              as: "runSubSites",
              include: [
                {
                  model: PatrolCheckpoint,
                  as: "runCheckpoints",
                },
              ],
            },
          ],
        },
      ],
    });

    if (!patrolRun) {
      return res.status(404).json({
        success: false,
        message: "Patrol run not found",
      });
    }

    // ============================
    // 🔥 CALCULATE COUNTS
    // ============================

    let totalSites = 0;
    let completedSites = 0;

    let totalSubSites = 0;
    let completedSubSites = 0;

    let totalCheckpoints = 0;
    let completedCheckpoints = 0;

    patrolRun.runSites.forEach((site) => {
      totalSites++;

      if (site.status === "completed") completedSites++;

      site.runSubSites.forEach((sub) => {
        totalSubSites++;

        if (sub.status === "completed") completedSubSites++;

        sub.runCheckpoints.forEach((cp) => {
          totalCheckpoints++;

          if (cp.status === "completed") completedCheckpoints++;
        });
      });
    });

    const remainingCheckpoints =
      totalCheckpoints - completedCheckpoints;

    // ============================
    // 🔥 FORMAT RESPONSE
    // ============================

    const formattedSites = patrolRun.runSites.map((site) => ({
      siteId: site.id,
      siteName: site.name,
      status: site.status,
      subSites: site.runSubSites.map((sub) => ({
        subSiteId: sub.id,
        subSiteName: sub.name,
        status: sub.status,
        checkpoints: sub.runCheckpoints.map((cp) => ({
          checkpointId: cp.id,
          name: cp.name,
          status: cp.status,
          scannedAt: cp.scannedAt,
          qrCode: cp.qrCode,
        })),
      })),
    }));

    return res.status(200).json({
      success: true,
      data: {
        patrolRunId: patrolRun.id,
        patrolId: patrolRun.patrolId,
        status: patrolRun.status,
        guardAcceptanceStatus: patrolRun.guardAcceptanceStatus,

        guard: patrolRun.guard,
        vehicle: patrolRun.vehicle,

        timing: {
          startTime: patrolRun.startDateTime,
          estimatedCompletion: patrolRun.estimatedCompletion,
          actualStart: patrolRun.actualStart,
          actualCompletion: patrolRun.actualCompletion,
        },

        summary: {
          totalSites,
          completedSites,
          totalSubSites,
          completedSubSites,
          totalCheckpoints,
          completedCheckpoints,
          remainingCheckpoints,
        },

        sites: formattedSites,
      },
    });
  } catch (error) {
    console.error("GET PATROL RUN ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};




