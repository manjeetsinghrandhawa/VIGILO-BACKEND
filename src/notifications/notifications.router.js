import express from "express";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";
import { getMyNotifications } from "./notifications.controller.js";

const router = express.Router();
// Fetch notifications for the authenticated user
router.get("/getMyNotifications", auth, isGaurd, getMyNotifications);

export default router;