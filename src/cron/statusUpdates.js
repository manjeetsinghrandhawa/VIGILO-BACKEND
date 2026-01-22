import cron from "node-cron";
import moment from "moment-timezone";
import { Op } from "sequelize";
import Order from "../order/order.model.js";
import Static from "../shift/static.model.js";
import StaticGuards from "../shift/staticGuards.model.js";
import User from "../user/user.model.js";
import { getTimeZone } from "../../utils/timeZone.js";
import { notifyGuardAndAdmin } from "../../utils/notification.helper.js";

/**
 * 🕒 Build UTC datetime from date + time
 */
const buildDateTime = (date, time) => {
  return moment.utc(
    `${moment.utc(date).format("YYYY-MM-DD")} ${time}`,
    "YYYY-MM-DD HH:mm"
  );
};

const updateOrderStatuses = async () => {
  try {
    const now = moment.utc();

    const orders = await Order.findAll({
      where: {
        status: {
          [Op.in]: ["pending", "upcoming", "ongoing"],
        },
      },
    });

    let updatedCount = 0;

    for (const order of orders) {
      const startDateTime = buildDateTime(order.startDate, order.startTime);
      const endDateTime = buildDateTime(
        order.endDate || order.startDate,
        order.endTime
      );

      let newStatus = null;

      /**
       * 🔴 pending → missed
       */
      if (order.status === "pending" && now.isAfter(startDateTime)) {
        newStatus = "missed";
      }

      /**
       * 🟡 upcoming → ongoing
       */
      else if (
        order.status === "upcoming" &&
        now.isSameOrAfter(startDateTime)
      ) {
        newStatus = "ongoing";
      }

      /**
       * 🟢 ongoing → completed
       */
      else if (order.status === "ongoing" && now.isAfter(endDateTime)) {
        newStatus = "completed";
      }

      /**
       * ✅ APPLY STATUS CHANGE
       */
      if (newStatus && newStatus !== order.status) {
        await order.update({ status: newStatus });
        updatedCount++;

        /**
         * 🔔 ADMIN NOTIFICATION (ONLY ON TRANSITION)
         */
        if (newStatus === "missed") {
          await notifyGuardAndAdmin({
            notifyGuard: false, // admin only
            status: "order_missed",
            adminMessage: `Order at ${order.locationName} was missed. Start time was ${order.startTime}.`,
            data: {
              orderId: order.id,
              locationName: order.locationName,
              startDate: order.startDate,
              startTime: order.startTime,
            },
          });
        }
      }
    }

    console.log(`✅ Order status cron updated ${updatedCount} orders`);
  } catch (error) {
    console.error("❌ ORDER STATUS CRON ERROR:", error);
  }
};

/**
 * 🔁 RUN EVERY 1 MINUTE (THIS IS ENOUGH)
 */
cron.schedule("*/1 * * * *", async () => {
  await updateOrderStatuses();
});

cron.schedule("*/10 * * * *", async () => {
  try {
    const tz = getTimeZone();
    const now = moment().tz(tz);
    const graceMinutes = 10;

    const shifts = await Static.findAll({
      where: {
        status: {
          [Op.in]: ["pending","upcoming", "ongoing","overtime_started"],
        },
      },
      include: [
        {
          model: User,
          as: "guards",
          through: {
             where: {
              status: {
                [Op.in]: [
                  "pending",
                  "accepted",
                  "ongoing",
                  "overtime_started",
                ],
              },
            },
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

  await notifyGuardAndAdmin({
    guardId: guard.id,
    shiftId: shift.id,
    status: "missed_respond",
    guardMessage: "You missed responding to a shift assignment.",
    adminMessage: `Guard ${guard.name} missed responding to shift.`,
  });

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

  await notifyGuardAndAdmin({
    guardId: guard.id,
    shiftId: shift.id,
    status: "absent",
    guardMessage: "You were marked absent due to no clock-in.",
    adminMessage: `Guard ${guard.name} marked absent (no clock-in).`,
  });
}

/**
 * 🔔 CASE 2.5: Forgot to Clock-Out (Notify after 5 minutes)
 * - Shift ongoing
 * - No clock-out
 * - Exactly after 5 minutes window
 */
if (
  shift.status === "ongoing" &&
  assignment.status === "ongoing" &&
  shiftEnd &&
  !assignment.clockOutTime
) {
  const notifyAfter = shiftEnd.clone().add(5, "minutes");
  const notifyUntil = shiftEnd.clone().add(6, "minutes"); // 1-min window

  if (now.isSameOrAfter(notifyAfter) && now.isBefore(notifyUntil)) {
    await notifyGuardAndAdmin({
      guardId: guard.id,
      shiftId: shift.id,
      status: "clockout_reminder",
      notifyAdmin: false, // 👈 guard only
      guardMessage: `You have not clocked out of the shift (${shift.id}). Please clock out immediately.`,
    });
  }
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

  await notifyGuardAndAdmin({
    guardId: guard.id,
    shiftId: shift.id,
    status: "absent",
    guardMessage: "You were marked absent due to no clock-out.",
    adminMessage: `Guard ${guard.name} marked absent (no clock-out).`,
  });
}

        /* 🟣 CASE 4: OVERTIME → MISSED END OVERTIME (3 HOURS) */
        if (
  shift.status === "overtime_started" &&
  assignment.status === "overtime_started" &&
  assignment.overtimeStartTime
) {
  const overtimeStart = moment(assignment.overtimeStartTime).tz(tz);
  const overtimeLimit = overtimeStart.clone().add(3, "hours");

  if (now.isSameOrAfter(overtimeLimit)) {
    await assignment.update({ status: "missed_endovertime" });
    await shift.update({ status: "missed_endovertime" });

    await notifyGuardAndAdmin({
      guardId: guard.id,
      shiftId: shift.id,
      status: "missed_endovertime",
      guardMessage: "You missed ending your overtime.",
      adminMessage: `Guard ${guard.name} missed ending overtime.`,
    });
  }
}
      }
    }
  } catch (error) {
    console.error("ABSENT CRON ERROR:", error);
  }
});



export default updateOrderStatuses;
