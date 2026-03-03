import express from "express";
import { createAlarm,
    getNewAlarmsForGuard,
    getAlarmDetailsForGuard,
    respondToAlarm
 } from "./alarm.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

router.post("/createAlarm",auth,isAdmin,  createAlarm);
router.get("/getNewAlarmsForGuard", auth, isGaurd, getNewAlarmsForGuard);
router.get("/getAlarmDetailsForGuard/:alarmId", auth, isGaurd, getAlarmDetailsForGuard);
router.post("/respondToAlarm/:alarmId", auth, isGaurd, respondToAlarm);

export default router;