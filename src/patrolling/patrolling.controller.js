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


export const createPatrolRun = async (req, res) => {
  const t = await sequelize.transaction();

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

    // 1️⃣ Fetch full site structure
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

    if (!sites.length) {
      return res.status(404).json({ success: false, message: "Sites not found" });
    }

    // 2️⃣ Build Snapshot Structure
    let totalSites = 0;
    let totalSubSites = 0;
    let totalCheckpoints = 0;

    const runStructure = sites.map((site) => {
      totalSites++;

      const subSites = site.subSites.map((sub) => {
        totalSubSites++;

        const checkpoints = sub.checkpoints.map((cp) => {
          totalCheckpoints++;

          return {
            id: cp.id,
            name: cp.name,
            latitude: cp.latitude,
            longitude: cp.longitude,
            verificationRange: cp.verificationRange,
            priorityLevel: cp.priorityLevel,
            description: cp.description,
            status: "pending",
            scannedAt: null,
            scannedBy: null,
          };
        });

        return {
          id: sub.id,
          name: sub.name,
          unitPrice: sub.unitPrice,
          estimatedDuration: sub.estimatedDuration,
          description: sub.description,
          status: "pending",
          checkpoints,
        };
      });

      const siteCheckpoints = site.checkpoints.map((cp) => {
        totalCheckpoints++;

        return {
          id: cp.id,
          name: cp.name,
          latitude: cp.latitude,
          longitude: cp.longitude,
          verificationRange: cp.verificationRange,
          priorityLevel: cp.priorityLevel,
          description: cp.description,
          status: "pending",
          scannedAt: null,
          scannedBy: null,
        };
      });

      return {
        id: site.id,
        name: site.name,
        address: site.address,
        latitude: site.latitude,
        longitude: site.longitude,
        description: site.description,
        status: "pending",
        subSites,
        checkpoints: siteCheckpoints,
      };
    });

    // 3️⃣ Create Patrol Run
    const patrolRun = await PatrolRun.create(
      {
        patrolId,
        orderId,
        guardId,
        siteIds,
        vehicleId,
        startDateTime,
        estimatedCompletion,
        notes,
        runStructure,
        totalSites,
        totalSubSites,
        totalCheckpoints,
      },
      { transaction: t }
    );

    await PatrolGuards.create(
  {
    patrolRunId: patrolRun.id, // foreign key
    guardId: guardId,           // guard id
    status: "pending",        // default status
  },
  { transaction: t }
);

    await t.commit();

    // 4️⃣ Fetch order & guard for response
    const order = await Order.findByPk(orderId);
    const guard = await User.findByPk(guardId);

    return res.status(201).json({
      success: true,
      type: "patrol",
      data: {
        patrol: {
          id: patrolRun.id,
          patrolId: patrolRun.patrolId,
          vehicleId,
          description: notes,
          status: patrolRun.status,
          startTime: patrolRun.startDateTime,
          endTime: patrolRun.estimatedCompletion,
          totalSites,
          totalSubSites,
          totalCheckpoints,
          completedSites: 0,
          completedSubSites: 0,
          completedCheckpoints: 0,
        },
        order,
        guard,
        sites: runStructure,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
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
      ],
    });

    if (!patrolRun) {
      return res.status(404).json({
        success: false,
        message: "Patrol run not found",
      });
    }

    const runStructure = patrolRun.runStructure || [];

    // ============================
    // 🔥 CALCULATE COUNTS FROM JSON
    // ============================

    let totalSites = 0;
    let completedSites = 0;
    let totalSubSites = 0;
    let completedSubSites = 0;
    let totalCheckpoints = 0;
    let completedCheckpoints = 0;

    runStructure.forEach((site) => {
      totalSites++;
      if (site.status === "completed") completedSites++;

      site.subSites?.forEach((sub) => {
        totalSubSites++;
        if (sub.status === "completed") completedSubSites++;

        sub.checkpoints?.forEach((cp) => {
          totalCheckpoints++;
          if (cp.status === "completed") completedCheckpoints++;
        });
      });

      // If you also have site-level checkpoints
      site.checkpoints?.forEach((cp) => {
        totalCheckpoints++;
        if (cp.status === "completed") completedCheckpoints++;
      });
    });

    return res.status(200).json({
      success: true,
      data: {
        patrolRunId: patrolRun.id,
        patrolId: patrolRun.patrolId,
        status: patrolRun.status,
        guard: patrolRun.guard,

        summary: {
          totalSites,
          completedSites,
          totalSubSites,
          completedSubSites,
          totalCheckpoints,
          completedCheckpoints,
          remainingCheckpoints:
            totalCheckpoints - completedCheckpoints,
        },

        sites: runStructure, // 🔥 DIRECTLY RETURN COPIED DATA
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

export const getPatrolSiteDetails = async (req, res, next) => {
  try {
    const { patrolRunId, siteId } = req.params;
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    // 1️⃣ Fetch patrol run
    const patrolRun = await PatrolRun.findByPk(patrolRunId);

    if (!patrolRun) {
      return next(
        new ErrorHandler("Patrol run not found", StatusCodes.NOT_FOUND)
      );
    }

    // 2️⃣ Check guard assignment
    const assignedGuard = await PatrolGuards.findOne({
      where: { patrolRunId, guardId },
    });

    if (!assignedGuard) {
      return next(
        new ErrorHandler(
          "You are not assigned to this patrol run",
          StatusCodes.FORBIDDEN
        )
      );
    }

    // 3️⃣ Extract site from JSON snapshot
    const site = patrolRun.runStructure.find(
      (s) => s.id === siteId
    );

    if (!site) {
      return next(
        new ErrorHandler("Site not found in this patrol run", StatusCodes.NOT_FOUND)
      );
    }

    // 4️⃣ Calculate summary (like Figma cards)
    let totalSubSites = site.subSites.length;
    let totalCheckpoints = 0;
    let completedCheckpoints = 0;

    // subsite checkpoints
    site.subSites.forEach((sub) => {
      totalCheckpoints += sub.checkpoints.length;

      sub.checkpoints.forEach((cp) => {
        if (cp.status === "completed") {
          completedCheckpoints++;
        }
      });
    });

    // site-level checkpoints
    totalCheckpoints += site.checkpoints.length;

    site.checkpoints.forEach((cp) => {
      if (cp.status === "completed") {
        completedCheckpoints++;
      }
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        site: {
          id: site.id,
          name: site.name,
          address: site.address,
          latitude: site.latitude,
          longitude: site.longitude,
          description: site.description,
          status: site.status,
        },

        summary: {
          totalSubSites,
          totalCheckpoints,
          completedCheckpoints,
          pendingCheckpoints:
            totalCheckpoints - completedCheckpoints,
        },

        subSites: site.subSites,
        checkpoints: site.checkpoints, // site-level checkpoints
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPatrolSubSiteDetails = async (req, res, next) => {
  try {
    const { patrolRunId, subSiteId } = req.params;
    const guardId = req.user?.id;

    if (!guardId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    // 1️⃣ Fetch patrol run
    const patrolRun = await PatrolRun.findByPk(patrolRunId);

    if (!patrolRun) {
      return next(
        new ErrorHandler("Patrol run not found", StatusCodes.NOT_FOUND)
      );
    }

    // 2️⃣ Verify guard is assigned
    const assignedGuard = await PatrolGuards.findOne({
      where: { patrolRunId, guardId },
    });

    if (!assignedGuard) {
      return next(
        new ErrorHandler(
          "You are not assigned to this patrol run",
          StatusCodes.FORBIDDEN
        )
      );
    }

    // 3️⃣ Extract subsite from JSON snapshot
    let foundSubSite = null;

    for (const site of patrolRun.runStructure) {
      const subSite = site.subSites?.find(
        (sub) => sub.id === subSiteId
      );

      if (subSite) {
        foundSubSite = {
          ...subSite,
          parentSite: {
            id: site.id,
            name: site.name,
            status: site.status,
          },
        };
        break;
      }
    }

    if (!foundSubSite) {
      return next(
        new ErrorHandler(
          "SubSite not found in this patrol run",
          StatusCodes.NOT_FOUND
        )
      );
    }

    // 4️⃣ Calculate checkpoint summary
    const totalCheckpoints = foundSubSite.checkpoints.length;

    const completedCheckpoints = foundSubSite.checkpoints.filter(
      (cp) => cp.status === "completed"
    ).length;

    const pendingCheckpoints =
      totalCheckpoints - completedCheckpoints;

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        subSite: {
          id: foundSubSite.id,
          name: foundSubSite.name,
          description: foundSubSite.description,
          latitude: foundSubSite.latitude,
          longitude: foundSubSite.longitude,
          status: foundSubSite.status,
        },

        parentSite: foundSubSite.parentSite,

        summary: {
          totalCheckpoints,
          completedCheckpoints,
          pendingCheckpoints,
        },

        checkpoints: foundSubSite.checkpoints,
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getAllPatrolRunsForAdmin = async (req, res, next) => {
  try {
    const patrolRuns = await PatrolRun.findAll({
      include: [
        {
          model: Order,
          as: "order",
          attributes: [
            "id",
            "locationName",
            "startTime",
            "startDate",
            "status",
          ],
          include: [
            {
              model: User,
              as: "user", // Client
              attributes: ["id", "name", "email"],
            },
          ],
        },
        {
          model: User,
          as: "guards", // via belongsToMany
          attributes: ["id", "name"],
          through: {
            attributes: [
              "status",
              "clockInTime",
              "clockOutTime",
              "totalHours",
            ],
          },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const formattedRuns = patrolRuns.map((run) => {
      const total = run.totalCheckpoints || 0;
      const completed = run.completedCheckpoints || 0;

      const completionPercentage =
        total === 0 ? 0 : Math.round((completed / total) * 100);

      return {
        id: run.id,
        patrolId: run.patrolId,
        status: run.status,

        vehicleId: run.vehicleId,

        // 🔹 Client Info
        clientName: run.order?.user?.name || null,
        clientEmail: run.order?.user?.email || null,

        // 🔹 Order Info
        locationName: run.order?.locationName || null,
        orderStartTime: run.order?.startTime || null,
        orderStartDate: run.order?.startDate || null,
        orderStatus: run.order?.status || null,

        // 🔹 Execution Metrics
        totalSites: run.totalSites,
        completedSites: run.completedSites,

        totalSubSites: run.totalSubSites,
        completedSubSites: run.completedSubSites,

        totalCheckpoints: run.totalCheckpoints,
        completedCheckpoints: run.completedCheckpoints,

        completionPercentage,
        hasDeviation:
          run.status === "completed" &&
          run.completedCheckpoints < run.totalCheckpoints,

        // 🔹 Guards (Multiple)
        guards: run.guards.map((guard) => ({
          id: guard.id,
          name: guard.name,
          status: guard.PatrolGuards.status,
          clockInTime: guard.PatrolGuards.clockInTime,
          clockOutTime: guard.PatrolGuards.clockOutTime,
          totalHours: guard.PatrolGuards.totalHours,
        })),

        startDateTime: run.startDateTime,
        estimatedCompletion: run.estimatedCompletion,
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      total: formattedRuns.length,
      data: formattedRuns,
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

