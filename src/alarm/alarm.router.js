import express from "express";
import { createAlarm,
    getMyAlarms,
    getAlarmDetailsForGuard,
    respondToAlarm,
    completeAlarm,
    getAllAlarms,
    deleteAlarm
 } from "./alarm.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

router.post("/createAlarm",auth,isAdmin,  createAlarm);
router.get("/getMyAlarms", auth, isGaurd, getMyAlarms);
router.get("/getAlarmDetailsForGuard/:alarmId", auth, isGaurd, getAlarmDetailsForGuard);
router.post("/respondToAlarm/:alarmId", auth, isGaurd, respondToAlarm);
router.post("/completeAlarm/:alarmId", auth, isGaurd, completeAlarm);
router.get("/getAllAlarms", auth, isAdmin, getAllAlarms);
router.delete("/deleteAlarm/:alarmId", auth, isAdmin, deleteAlarm);

export default router;