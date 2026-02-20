import express from "express";
import { auth, isAdmin, isGaurd, isUser } from "../../middlewares/auth.js";
import { createPatrolSite,
    createPatrolSubSite,
    getAllPatrolSites,
    getPatrolSiteById,
    getSubSitesBySiteId,
    createCheckpoint, 
    getCheckpoints,
    deletePatrolSite, 
    deletePatrolSubSite,
    deleteCheckpoint,
    deletePatrolRun, 
    createPatrolRun,
    getPatrolRunById,
getPatrolSiteDetails,
getPatrolSubSiteDetails,
getAllPatrolRunsForAdmin,
getPatrolRunByIdForAdmin,
scanCheckpoint,
viewCheckpointById
 } from "./patrolling.controller.js";

const route = express.Router();

route.post("/createPatrolSite", auth, isAdmin, createPatrolSite);
route.post("/createPatrolSubSite", auth, isAdmin, createPatrolSubSite);
route.get("/getAllPatrolSites", auth, isAdmin, getAllPatrolSites);
route.get("/getPatrolSiteById/:siteId", auth, isAdmin, getPatrolSiteById);
route.get("/getSubSitesBySiteId/:siteId", auth, isAdmin, getSubSitesBySiteId);
route.post("/createCheckpoint", auth, isAdmin, createCheckpoint);
route.get("/getCheckpoints", auth, isAdmin, getCheckpoints);
route.post("/createPatrolRun", auth, isAdmin, createPatrolRun);
route.delete("/deletePatrolSite/:siteId", auth, isAdmin, deletePatrolSite);
route.delete("/deletePatrolSubSite/:subSiteId", auth, isAdmin, deletePatrolSubSite);
route.delete("/deleteCheckpoint/:checkpointId", auth, isAdmin, deleteCheckpoint);
route.delete("/deletePatrolRun/:patrolId", auth, isAdmin, deletePatrolRun);
route.get("/getPatrolRunById/:patrolId", auth, isAdmin, getPatrolRunById);
route.get("/getPatrolSiteDetails/:patrolRunId/:siteId", auth, isGaurd, getPatrolSiteDetails);
route.get("/getPatrolSubSiteDetails/:patrolRunId/:subSiteId",auth, isGaurd, getPatrolSubSiteDetails);
route.get("/getAllPatrolRunsForAdmin", auth, isAdmin, getAllPatrolRunsForAdmin);
route.get("/getPatrolRunByIdForAdmin/:id", auth, isAdmin, getPatrolRunByIdForAdmin);
route.post("/scanCheckpoint", auth, isGaurd, scanCheckpoint);
route.get("/viewCheckpointById/:patrolRunId/:checkpointId", auth, isGaurd, viewCheckpointById);

export default route;