import Notification from "./notifications.model.js";

export const getMyNotifications = async (req, res) => {
  try {
    // ✅ SAME PATTERN AS getProfile
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 🔹 Pagination params
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { rows: notifications, count: total } =
      await Notification.findAndCountAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

    return res.status(200).json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error("GET NOTIFICATIONS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};
