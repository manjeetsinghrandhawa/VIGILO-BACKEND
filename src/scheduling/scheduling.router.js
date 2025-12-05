import express from "express";
import {
  createSchedule,
  getAllSchedules,
  clockIn,
  clockOut
  
} from "./scheduling.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

/* ------------------------- CREATE ------------------------- */
// Create a new scheduling entry when admin assigns a guard
router.post("/createSchedule",auth,isAdmin, createSchedule);

//For fetching weekly schedules with guard and site details
router.get("/getAllSchedules",auth,isAdmin, getAllSchedules);

//to delete a schedule by ID

//clock in a shift by guard
router.post("/clockIn",auth,isGaurd,clockIn );

//clock out a shift by guard
router.post("/clockOut",auth,isGaurd,clockOut );



export default router;
