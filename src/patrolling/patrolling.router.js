import express from "express";
import { auth, isAdmin, isGaurd, isUser } from "../../middlewares/auth.js";
import { createPatrolSite,createPatrolSubSite, getAllPatrolSites, getPatrolSiteById,getSubSitesBySiteId } from "./patrolling.controller.js";

const route = express.Router();

route.post("/createPatrolSite", auth, isAdmin, createPatrolSite);
route.post("/createPatrolSubSite", auth, isAdmin, createPatrolSubSite);
route.get("/getAllPatrolSites", auth, isAdmin, getAllPatrolSites);
route.get("/getPatrolSiteById/:siteId", auth, isAdmin, getPatrolSiteById);
route.get("/getSubSitesBySiteId/:siteId", auth, isAdmin, getSubSitesBySiteId);


    


export default route;