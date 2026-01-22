import Notification from "../src/notifications/notifications.model.js";
import User from "../src/user/user.model.js";

export const notifyAdminOnly = async ({
  title,
  message,
  type,
  data = {},
}) => {
  const admin = await User.findOne({ where: { role: "admin" } });
  if (!admin) return;

  await Notification.create({
    userId: admin.id,
    role: "admin",
    title,
    message,
    type,
    data,
  });
};
