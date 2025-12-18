import express from "express";
import {
  createSchedule,
  getAllSchedules,
  getMyAllShifts,
  getMySchedules,
  getMyUpcomingSchedules,
  getMyNewShiftRequests,
  deleteSchedule,
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

router.post("/getMyAllShifts",auth,isGaurd, getMyAllShifts);

router.get("/getMySchedules",auth,isGaurd, getMySchedules);

router.get("/getMyUpcomingSchedules",auth, isGaurd, getMyUpcomingSchedules);

router.get("/getMyNewShiftRequests",auth, isGaurd, getMyNewShiftRequests );

//to delete a schedule by ID
router.post("/deleteSchedule",auth,isAdmin, deleteSchedule );

//clock in a shift by guard
router.post("/clockIn",auth,isGaurd,clockIn );

//clock out a shift by guard
router.post("/clockOut",auth,isGaurd,clockOut );



export default router;
