import express from "express";
import { auth, isAdmin, isGaurd, isUser } from "../../middlewares/auth.js";
import { createPatrolSite,createPatrolSubSite } from "./patrolling.controller.js";

const route = express.Router();

route.post("/createPatrolSite", auth, isAdmin, createPatrolSite);
route.post("/createPatrolSubSite", auth, isAdmin, createPatrolSubSite);

    


export default route;