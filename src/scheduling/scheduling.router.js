import express from "express";
import {
  createSchedule,
  editSchedule,
  getAllSchedules,
  getMyAllShifts,
  // getMySchedules,
  getMyUpcomingSchedules,
  getMyNewShiftRequests,
  deleteSchedule,
  clockIn,
  clockOut,
  getMyTodayShiftCard,
  startOvertime,
  endOvertime,
  getMyShiftsByDate,
  requestOffStaticShift,
  requestChangeStaticShift
  
} from "./scheduling.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

/* ------------------------- CREATE ------------------------- */
// Create a new scheduling entry when admin assigns a guard
router.post("/createSchedule",auth,isAdmin, createSchedule);

//Edit a schedule by ID
router.put("/editSchedule/:id",auth,isAdmin,editSchedule );

//For fetching weekly schedules with guard and site details
router.get("/getAllSchedules",auth,isAdmin, getAllSchedules);

router.post("/getMyAllShifts",auth,isGaurd, getMyAllShifts);

// router.get("/getMySchedules",auth,isGaurd, getMySchedules);

router.get("/getMyUpcomingSchedules",auth, isGaurd, getMyUpcomingSchedules);

router.get("/getMyNewShiftRequests",auth, isGaurd, getMyNewShiftRequests );

//to delete a schedule by ID
router.post("/deleteSchedule",auth,isAdmin, deleteSchedule );

//clock in a shift by guard
router.post("/clockIn",auth,isGaurd,clockIn );

//clock out a shift by guard
router.post("/clockOut",auth,isGaurd,clockOut );

router.get("/getMyTodayShiftCard",auth,isGaurd, getMyTodayShiftCard);

router.post("/startOvertime",auth,isGaurd, startOvertime );

router.post("/endOvertime",auth,isGaurd, endOvertime);

router.post("/getMyShiftsByDate",auth,isGaurd, getMyShiftsByDate);

router.post("/requestOffStaticShift",auth,isGaurd, requestOffStaticShift );

router.post("/requestChangeStaticShift",auth,isGaurd, requestChangeStaticShift );



export default router;
