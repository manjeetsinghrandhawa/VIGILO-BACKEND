import cron from "node-cron";
import moment from "moment-timezone";
import { Op } from "sequelize";
import Order from "../order/order.model.js";
import { getTimeZone } from "../../utils/timeZone.js";

const updateOrderStatuses = async () => {
  const tz = getTimeZone(); 
  const now = moment().tz(tz);

  try {
    const orders = await Order.findAll({
      where: {
        status: {
          [Op.notIn]: ["completed", "cancelled", "pending"],
        },
      },
    });

    if (!orders.length) {
      console.log("No orders found for status update.");
      return;
    }

    let updatedCount = 0;

    for (const order of orders) {
      // ✅ Convert UTC → Local before comparisons
      const startDate = moment.utc(order.startDate).tz(tz).startOf("day");
      const endDate = order.endDate
        ? moment.utc(order.endDate).tz(tz).endOf("day")
        : null;

      let newStatus = order.status;

      if (now.isBefore(startDate)) {
        newStatus = "upcoming";
      } else if (!endDate || now.isBefore(endDate)) {
        newStatus = "ongoing";
      } else if (now.isSameOrAfter(endDate)) {
        newStatus = "completed";
      }

      if (newStatus !== order.status) {
        await order.update({ status: newStatus });
        updatedCount++;
      }
    }

    console.log(`Order statuses updated successfully. Updated: ${updatedCount}`);
  } catch (error) {
    console.error("Error updating order statuses:", error.message);
  }
};

// ✅ Schedule the cron job at 00:01 every day (India time)
cron.schedule(
  "1 0 * * *",
  async () => {
    const tz = getTimeZone();
    console.log(
      "Running daily order status update at:",
      new Date().toLocaleString("en-IN", { timeZone: tz })
    );
    await updateOrderStatuses();
  },
  {
    scheduled: true,
    timezone: getTimeZone(),
  }
);

export default updateOrderStatuses;
