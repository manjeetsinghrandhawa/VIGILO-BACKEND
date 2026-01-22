import Notification from "../modules/notification/notification.model.js";
import User from "../modules/user/user.model.js";

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
