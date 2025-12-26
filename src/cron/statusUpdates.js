import cron from "node-cron";
import moment from "moment-timezone";
import { Op } from "sequelize";
import Order from "../order/order.model.js";
import Static from "../shift/static.model.js";
import StaticGuards from "../shift/staticGuards.model.js";
import User from "../user/user.model.js";
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

cron.schedule("*/10 * * * *", async () => {
  try {
    const tz = getTimeZone();
    const now = moment().tz(tz);
    const graceMinutes = 10;

    const shifts = await Static.findAll({
      where: {
        status: {
          [Op.in]: ["upcoming", "ongoing"],
        },
      },
      include: [
        {
          model: User,
          as: "guards",
          through: {
            where: { status: "accepted" },
          },
          required: true,
        },
      ],
    });

    for (const shift of shifts) {
      const shiftStart = moment(shift.startTime).tz(tz);
      const shiftEnd = shift.endTime
        ? moment(shift.endTime).tz(tz)
        : null;

      for (const guard of shift.guards) {
        const assignment = guard.StaticGuards;

         // 🔵 MISSED RESPOND
    if (
      shift.status === "pending" &&
      assignment.status === "pending" &&
      now.isSameOrAfter(shiftStart)
    ) {
      await shift.update({ status: "missed_respond" });
      await assignment.update({ status: "missed_respond" });
      continue;
    }

        /**
         * 🟡 CASE 2: Upcoming → no clock-in after 10 mins
         */
        if (
          shift.status === "upcoming" &&
          now.isAfter(shiftStart.clone().add(graceMinutes, "minutes")) &&
          !assignment.clockInTime
        ) {
          await shift.update({ status: "absent" });
          await assignment.update({ status: "absent" });

          console.log(
            `Shift ${shift.id} marked ABSENT (no clock-in) for guard ${guard.id}`
          );
        }

        /**
         * 🔴 CASE 3: Ongoing → no clock-out after end + 10 mins
         */
        if (
          shift.status === "ongoing" &&
          shiftEnd &&
          now.isAfter(shiftEnd.clone().add(graceMinutes, "minutes")) &&
          !assignment.clockOutTime
        ) {
          await shift.update({ status: "absent" });
          await assignment.update({ status: "absent" });

          console.log(
            `Shift ${shift.id} marked ABSENT (no clock-out) for guard ${guard.id}`
          );
        }
      }
    }
  } catch (error) {
    console.error("ABSENT CRON ERROR:", error);
  }
});



export default updateOrderStatuses;
