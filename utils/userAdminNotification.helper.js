import Notification from "../src/notifications/notifications.model.js";
import User from "../src/user/user.model.js";

/**
 * Send notification for order events (user + admin)
 */
export const notifyUserAndAdminForOrder = async ({
  userId,
  orderId,
  status,
  userMessage,
  adminMessage,
  type = "ORDER_STATUS",
}) => {
  try {
    // 1️⃣ Get all admins
    const admins = await User.findAll({
      where: { role: "admin" },
      attributes: ["id"],
    });

    const notifications = [];

    // 🔔 User notification
    notifications.push({
      userId,
      role: "user",
      title: "Order Status Update",
      message: userMessage,
      type,
      data: {
        orderId,
        status,
      },
    });

    // 🔔 Admin notifications
    admins.forEach((admin) => {
      notifications.push({
        userId: admin.id,
        role: "admin",
        title: "Order Update",
        message: adminMessage,
        type,
        data: {
          orderId,
          userId,
          status,
        },
      });
    });

    // 2️⃣ Save all notifications
    await Notification.bulkCreate(notifications);
  } catch (error) {
    console.error("ORDER NOTIFICATION ERROR:", error);
  }
};