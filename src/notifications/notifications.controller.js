import Notification from "./notifications.model.js";

export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // 🔹 Pagination
    let { page = 1, limit = 10 } = req.query;
    const { filter = "all" } = req.body;

    page = parseInt(page);
    limit = parseInt(limit);

    if (page < 1) page = 1;
    if (limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    /**
     * 🔥 FILTER LOGIC
     */
    let whereClause = { userId };

    if (filter === "unread") {
      whereClause.isRead = false;
    }

    if (filter === "newRequests") {
      whereClause.type = "newRequest"; 
      // 👆 change this if your field/value differs
    }

    /**
     * 📊 TOTAL COUNTS (FOR UI TABS)
     */
    const [allCount, unreadCount, newRequestsCount] = await Promise.all([
      Notification.count({
        where: { userId },
      }),
      Notification.count({
        where: { userId, isRead: false },
      }),
      Notification.count({
        where: { userId, type: "newRequest" },
      }),
    ]);

    /**
     * 📥 FETCH NOTIFICATIONS
     */
    const { rows: notifications, count } =
      await Notification.findAndCountAll({
        where: whereClause,
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

    return res.status(200).json({
      success: true,
      filter,
      counts: {
        all: allCount,
        unread: unreadCount,
        newRequests: newRequestsCount,
      },
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
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
