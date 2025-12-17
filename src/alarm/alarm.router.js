import express from "express";
import { createAlarm } from "./alarm.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

router.post("/createAlarm",auth,isAdmin,  createAlarm);

export default router;