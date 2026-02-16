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
    createPatrolRun } from "./patrolling.controller.js";

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


    


export default route;