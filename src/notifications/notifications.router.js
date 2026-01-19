import express from "express";
import { auth, isGaurd, isAdmin, isUser } from "../../middlewares/auth.js";
import { getMyNotifications, deleteAllNotifications,deleteNotificationById } from "./notifications.controller.js";

const router = express.Router();
// Fetch notifications for the authenticated user
router.get("/getMyNotifications", auth, getMyNotifications);

router.delete("/deleteAllNotifications", auth, deleteAllNotifications);

router.delete("/deleteNotificationById/:id", auth, deleteNotificationById)
export default router;