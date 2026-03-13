import cron from "node-cron";
import moment from "moment-timezone";
import { Op } from "sequelize";
import Order from "../order/order.model.js";
import Static from "../shift/static.model.js";
import User from "../user/user.model.js";
import { getTimeZone } from "../../utils/timeZone.js";
import { notifyGuardAndAdmin } from "../../utils/notification.helper.js";
import { notifyAdminOnly } from "../../utils/notifyAdminOnly.helper.js";
import PatrolRun from "../patrolling/patrolRun.model.js";
import Alarm from "../alarm/alarm.model.js";
import PatrolGuards from "../patrolling/PatrolGuards.model.js";



/**
 * 🕒 Build datetime in BUSINESS TIMEZONE (NOT UTC)
 */
const buildDateTime = (date, time, tz) => {
  return moment.tz(
    `${moment(date).format("YYYY-MM-DD")} ${time}`,
    "YYYY-MM-DD HH:mm",
    tz
  );
};

let shiftCronRunning = false;
let isCronRunning = false;

const updateOrderStatuses = async () => {
   if (isCronRunning) {
    console.log("⏳ Cron already running, skipping...");
    return;
  }

  isCronRunning = true;
  try {
    const tz = getTimeZone(); // 👈 e.g. "Asia/Kolkata"
    const now = moment().tz(tz);

    const orders = await Order.findAll({
      where: {
        status: {
          [Op.in]: ["pending", "upcoming", "ongoing"],
        },
      },
      limit: 50, 
    });

    let updatedCount = 0;

    for (const order of orders) {
      const startDateTime = buildDateTime(
        order.startDate,
        order.startTime,
        tz
      );

      const endDateTime = buildDateTime(
        order.endDate || order.startDate,
        order.endTime,
        tz
      );

      let newStatus = null;

      // 🔴 pending → missed
      if (order.status === "pending" && now.isAfter(startDateTime)) {
        newStatus = "missed";
      }

      // 🟡 upcoming → ongoing
      else if (
        order.status === "upcoming" &&
        now.isSameOrAfter(startDateTime)
      ) {
        newStatus = "ongoing";
      }

      // 🟢 ongoing → completed
      else if (
        order.status === "ongoing" &&
        now.isAfter(endDateTime)
      ) {
        newStatus = "completed";
      }

      if (newStatus && newStatus !== order.status) {
        await order.update({ status: newStatus });
        updatedCount++;

        // 🔔 ADMIN NOTIFICATION (ONLY ON MISSED)
        if (newStatus === "missed") {
          await notifyAdminOnly({
            title: "Order Missed",
            type: "ORDER_MISSED",
            message: `Order at ${order.locationName} was missed. Start time was ${order.startTime}.`,
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
  finally {
    isCronRunning = false;
    console.log("✅ Order status cron finished");
  }
};

/**
 * 🔁 RUN EVERY MINUTE
 */
cron.schedule(
  "*/1 * * * *",
  async () => {
    await updateOrderStatuses();
  },
  {
    timezone: getTimeZone(),
  }
);
cron.schedule("*/1 * * * *", async () => {
   if (shiftCronRunning) {
    console.log("⏳ Shift cron already running, skipped");
    return;
  }

  shiftCronRunning = true;
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
    console.log(`✅ Shift status cron updated shifts`);

    /**
 * ===============================
 * 🚓 PATROL RUN STATUS CRON
 * ===============================
 */

const patrolRuns = await PatrolRun.findAll({
  where: {
    status: {
      [Op.in]: ["pending", "upcoming", "ongoing","delayed"],
    },
  },
});

for (const patrolRun of patrolRuns) {
  const estimatedEnd = patrolRun.estimatedCompletion
    ? moment(patrolRun.estimatedCompletion).tz(tz)
    : null;

  if (!estimatedEnd) continue;

  /**
   * 🔴 CASE 1 & 2:
   * pending/upcoming → estimatedCompletion passed
   * → mark ABSENT
   */
  if (
    ["pending", "upcoming"].includes(patrolRun.status) &&
    now.isAfter(estimatedEnd)
  ) {
    await patrolRun.update({ status: "absent" });
    await PatrolGuards.update({ status: "absent" }, { where: { patrolRunId: patrolRun.id } });

    console.log(
      `🚨 PatrolRun ${patrolRun.id} marked ABSENT (missed start)`
    );

    continue;
  }

  /**
   * 🟡 CASE 3:
   * ongoing → estimatedCompletion passed
   * → mark DELAYED
   */
  if (
    patrolRun.status === "ongoing" &&
    now.isAfter(estimatedEnd)
  ) {
    await patrolRun.update({ status: "delayed" });
    await PatrolGuards.update({ status: "delayed" }, { where: { patrolRunId: patrolRun.id } });

    console.log(
      `⏳ PatrolRun ${patrolRun.id} marked DELAYED`
    );
  continue;
  }

  /**
   * 🔴 CASE 4
   * delayed → 30 minutes after estimatedCompletion
   * → mark ABSENT
   */
  if (patrolRun.status === "delayed") {
    const delayedLimit = estimatedEnd.clone().add(30, "minutes");

    if (now.isAfter(delayedLimit)) {
      await patrolRun.update({ status: "absent" });
      await PatrolGuards.update({ status: "absent" }, { where: { patrolRunId: patrolRun.id } });

      console.log(
        `🚨 PatrolRun ${patrolRun.id} marked ABSENT (30 min after delayed)`
      );
    }
  }
}

/**
 * ===============================
 * 🚨 ALARM STATUS CRON
 * ===============================
 */

const alarms = await Alarm.findAll({
  where: {
    status: {
      [Op.in]: ["pending", "ongoing"],
    },
  },
  limit: 50,
});

for (const alarm of alarms) {

  const createdAt = moment(alarm.createdAt).tz(tz);

  const etaEnd = createdAt.clone().add(alarm.etaMinutes || 0, "minutes");

  const slaEnd = createdAt.clone().add(
    (alarm.etaMinutes || 0) + alarm.slaTimeMinutes,
    "minutes"
  );

  const graceEnd = slaEnd.clone().add(30, "minutes");

  /**
   * 🔴 CASE 1
   * pending → ETA passed
   * → CANCELLED
   */

  if (
    alarm.status === "pending" &&
    now.isAfter(etaEnd)
  ) {

    await alarm.update({ status: "cancelled" });
    await alarm.update({breach:true});

    console.log(`🚨 Alarm ${alarm.id} cancelled (ETA missed)`);

    continue;
  }

  /**
   * 🟡 CASE 2
   * ongoing → SLA passed
   * → waiting for grace
   */

  if (
    alarm.status === "ongoing" &&
    now.isAfter(slaEnd) &&
    now.isBefore(graceEnd)
  ) {

    console.log(`⏳ Alarm ${alarm.id} waiting grace period`);

    continue;
  }

  /**
   * 🔴 CASE 3
   * ongoing → SLA + grace passed
   * → ABSENT
   */

  if (
    alarm.status === "ongoing" &&
    now.isAfter(graceEnd)
  ) {

    await alarm.update({ status: "absent" });
    await alarm.update({breach:true});

    console.log(`🚨 Alarm ${alarm.id} marked ABSENT`);

    continue;
  }

}
  } catch (error) {
    console.error("ABSENT CRON ERROR:", error);
  }
  finally {
    shiftCronRunning = false;
    console.log("✅ Shift status cron finished");
  }
});



export default updateOrderStatuses;
