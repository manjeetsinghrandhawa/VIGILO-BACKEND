import Notification from "../src/notifications/notifications.model.js";
import User from "../src/user/user.model.js";

/**
 * Create notification for guard + admin
 */
export const notifyGuardAndAdmin = async ({
  guardId,
  shiftId,
  status,
  guardMessage,
  adminMessage,
  type = "SHIFT_STATUS",
}) => {
  // 1️⃣ Find all admins
  const admins = await User.findAll({
    where: { role: "admin" },
    attributes: ["id"],
  });

  const notifications = [];

  // 🔔 Guard notification
  notifications.push({
    userId: guardId,
    role: "guard",
    title: "Shift Status Update",
    message: guardMessage,
    type,
    data: {
      shiftId,
      status,
    },
  });

  // 🔔 Admin notifications
  admins.forEach((admin) => {
    notifications.push({
      userId: admin.id,
      role: "admin",
      title: "Guard Shift Update",
      message: adminMessage,
      type,
      data: {
        shiftId,
        guardId,
        status,
      },
    });
  });

  await Notification.bulkCreate(notifications);
};
