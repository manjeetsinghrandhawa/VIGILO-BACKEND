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
import { clockIn } from "../scheduling/scheduling.controller.js";



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
let patrolCronRunning = false;
let alarmCronRunning = false;

const ORDER_BATCH_SIZE = Number(process.env.ORDER_CRON_BATCH_SIZE || 50);
const SHIFT_BATCH_SIZE = Number(process.env.SHIFT_CRON_BATCH_SIZE || 50);
const PATROL_BATCH_SIZE = Number(process.env.PATROL_CRON_BATCH_SIZE || 50);
const ALARM_BATCH_SIZE = Number(process.env.ALARM_CRON_BATCH_SIZE || 50);

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
      limit: ORDER_BATCH_SIZE,
      order: [["createdAt", "DESC"]], // ✅ ADD THIS TO PRIORITIZE RECENT ORDERS
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
 * 🔁 RUN EVERY MINUTE (at second 0)
 */
cron.schedule(
  "0 * * * * *",
  async () => {
    await updateOrderStatuses();
  },
  {
    timezone: getTimeZone(),
  }
);
const updateShiftStatuses = async () => {
  if (shiftCronRunning) {
    console.log("⏳ Shift cron already running, skipped");
    return;
  }

  shiftCronRunning = true;
  try {
    const tz = getTimeZone();
    const now = moment().tz(tz);
    const graceMinutes = 0;

    const shifts = await Static.findAll({
      attributes: ["id", "status", "startTime", "endTime"],
      where: {
        status: {
          [Op.in]: ["pending", "upcoming", "ongoing", "overtime_started"],
        },
      },
      limit: SHIFT_BATCH_SIZE,
      order: [["startTime", "DESC"]], // ✅ ADD THIS TO PRIORITIZE RECENT SHIFTS
      include: [
        {
          model: User,
          as: "guards",
          attributes: ["id", "name"],
          through: {
            attributes: ["status", "clockInTime", "clockOutTime", "overtimeStartTime"],
            where: {
              status: {
                [Op.in]: ["pending", "accepted", "ongoing", "overtime_started"],
              },
            },
          },
          required: true,
        },
      ],
    });

    for (const shift of shifts) {
      const shiftStart = moment(shift.startTime).tz(tz);
      const shiftEnd = shift.endTime ? moment(shift.endTime).tz(tz) : null;

      for (const guard of shift.guards) {
        const assignment = guard.StaticGuards;

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

        if (
          shift.status === "upcoming" &&
          now.isAfter(shiftStart) &&
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

        if (
          shift.status === "ongoing" &&
          assignment.status === "ongoing" &&
          shiftEnd &&
          !assignment.clockOutTime
        ) {
          const notifyAfter = shiftEnd.clone().add(5, "minutes");
          const notifyUntil = shiftEnd.clone().add(6, "minutes");

          if (now.isSameOrAfter(notifyAfter) && now.isBefore(notifyUntil)) {
            await notifyGuardAndAdmin({
              guardId: guard.id,
              shiftId: shift.id,
              status: "clockout_reminder",
              notifyAdmin: false,
              guardMessage: `You have not clocked out of the shift (${shift.id}). Please clock out immediately.`,
            });
          }
        }

        if (
          shift.status === "ongoing" &&
          shiftEnd &&
          now.isAfter(shiftEnd) &&
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

        if (
          shift.status === "overtime_started" &&
          assignment.status === "overtime_started" &&
          assignment.overtimeStartTime
        ) {
          const overtimeStart = moment(assignment.overtimeStartTime).tz(tz);
          const overtimeLimit = overtimeStart.clone().add(3, "hours");

          if (!assignment.status === "missed_endovertime" && now.isSameOrAfter(overtimeLimit)) {
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

    console.log("✅ Shift status cron updated shifts");
  } catch (error) {
    console.error("❌ SHIFT STATUS CRON ERROR:", error);
  } finally {
    shiftCronRunning = false;
    console.log("✅ Shift status cron finished");
  }
};

const updatePatrolRunStatuses = async () => {
  if (patrolCronRunning) {
    console.log("⏳ Patrol cron already running, skipped");
    return;
  }

  patrolCronRunning = true;
  try {
    const tz = getTimeZone();
    const now = moment().tz(tz);

    const patrolRuns = await PatrolRun.findAll({
      attributes: ["id", "status", "estimatedCompletion","startDateTime"],
      where: {
        status: {
          [Op.in]: ["pending", "upcoming", "ongoing", "delayed", "absent","completed"],
        },
      },
      limit: PATROL_BATCH_SIZE,
  order: [["createdAt", "DESC"]], // ✅ ADD THIS TO PRIORITIZE RECENT PATROL RUNS
      
    });

    for (const patrolRun of patrolRuns) {
      // Keep patrol guard assignments in sync when run is already absent.
      if (patrolRun.status === "absent") {
        await PatrolGuards.update(
          { status: "absent" },
          {
            where: {
              patrolRunId: patrolRun.id,
              status: { [Op.ne]: "absent" },
            },
          }
        );
        console.log(`🚨 PatrolRun ${patrolRun.id} is ABSENT, synced guards to ABSENT`);
        continue;
      }

      const estimatedEnd = patrolRun.estimatedCompletion
    ? moment(patrolRun.estimatedCompletion).tz(tz)
    : null;

  const startTime = patrolRun.startDateTime
    ? moment(patrolRun.startDateTime).tz(tz)
    : null;

  if (!estimatedEnd || !startTime) continue;


      if (
        ["pending"].includes(patrolRun.status) &&
        now.isAfter(estimatedEnd)
      ) {
        await patrolRun.update({ status: "absent" });
        await PatrolGuards.update({ status: "absent" }, { where: { patrolRunId: patrolRun.id } });
        console.log(`🚨 PatrolRun ${patrolRun.id} marked ABSENT (missed start)`);
        continue;
      }

      /**
   * 🚀 UPCOMING → ONGOING
   */
  if (
    patrolRun.status === "upcoming" &&
    now.isSameOrAfter(startTime)
  ) {
    await patrolRun.update({ status: "ongoing" });

    await PatrolGuards.update(
      { status: "ongoing" },
      { where: { patrolRunId: patrolRun.id } }
    );

    console.log(`🚀 PatrolRun ${patrolRun.id} moved to ONGOING`);
    continue;
  }

  /**
   * ✅ ONGOING → COMPLETED
   */
  if (
    patrolRun.status === "ongoing" &&
    now.isSameOrAfter(estimatedEnd)
  ) {
    await patrolRun.update({ status: "completed" });

    await PatrolGuards.update(
      { status: "completed" },
      { where: { patrolRunId: patrolRun.id } }
    );


    console.log(`✅ PatrolRun ${patrolRun.id} marked COMPLETED`);
    continue;
  }


      // if (patrolRun.status === "ongoing" && now.isAfter(estimatedEnd)) {
      //   await patrolRun.update({ status: "delayed" });
      //   await PatrolGuards.update({ status: "delayed" }, { where: { patrolRunId: patrolRun.id } });
      //   console.log(`⏳ PatrolRun ${patrolRun.id} marked DELAYED`);
      //   continue;
      // }

      // if (patrolRun.status === "delayed") {
      //   const delayedLimit = estimatedEnd.clone().add(30, "minutes");
      //   if (now.isAfter(delayedLimit)) {
      //     await patrolRun.update({ status: "absent" });
      //     await PatrolGuards.update({ status: "absent" }, { where: { patrolRunId: patrolRun.id } });
      //     console.log(`🚨 PatrolRun ${patrolRun.id} marked ABSENT (30 min after delayed)`);
      //   }
      // }

      // if (patrolRun.status === "ongoing" ) {
      //   await patrolRun.update({ status: "ongoing" });
      //   await PatrolGuards.update({ status: "ongoing" }, { where: { patrolRunId: patrolRun.id } });
      //   await PatrolGuards.update({ clockInTime: now }, { where: { patrolRunId: patrolRun.id, clockInTime: null } });
      //   console.log(`⏳ PatrolRun ${patrolRun.id} marked ONGOING`);

      //   continue;
      // }

      // if (patrolRun.status === "completed" ) {
      //   await patrolRun.update({ status: "completed" });
      //   await PatrolGuards.update({ status: "completed" }, { where: { patrolRunId: patrolRun.id } });
      //   console.log(`⏳ PatrolRun ${patrolRun.id} marked COMPLETED`);

      //   continue;
      // }
    }

    console.log("✅ Patrol status cron finished");
  } catch (error) {
    console.error("❌ PATROL STATUS CRON ERROR:", error);
  } finally {
    patrolCronRunning = false;
  }
};

const updateAlarmStatuses = async () => {
  if (alarmCronRunning) {
    console.log("⏳ Alarm cron already running, skipped");
    return;
  }

  alarmCronRunning = true;
  try {
    const tz = getTimeZone();
    const now = moment().tz(tz);

    const alarms = await Alarm.findAll({
      attributes: ["id", "status", "createdAt", "etaMinutes", "slaTimeMinutes"],
      where: {
        status: {
          [Op.in]: ["pending", "ongoing"],
        },
      },
      limit: ALARM_BATCH_SIZE,
  order: [["createdAt", "DESC"]], // ✅ ADD THIS
    });

    for (const alarm of alarms) {
      const createdAt = moment(alarm.createdAt).tz(tz);
      const etaEnd = createdAt.clone().add(alarm.etaMinutes || 0, "minutes");
      const slaEnd = createdAt.clone().add((alarm.etaMinutes || 0) + alarm.slaTimeMinutes, "minutes");
      const graceEnd = slaEnd.clone().add(30, "minutes");

      if (alarm.status === "pending" && now.isAfter(etaEnd)) {
        await alarm.update({ status: "cancelled", breach: true });
        console.log(`🚨 Alarm ${alarm.id} cancelled (ETA missed)`);
        continue;
      }

      if (alarm.status === "ongoing" && now.isAfter(slaEnd) && now.isBefore(graceEnd)) {
        console.log(`⏳ Alarm ${alarm.id} waiting grace period`);
        continue;
      }

      if (alarm.status === "ongoing" && now.isAfter(graceEnd)) {
        await alarm.update({ status: "absent", breach: true });
        console.log(`🚨 Alarm ${alarm.id} marked ABSENT`);
        continue;
      }
    }

    console.log("✅ Alarm status cron finished");
  } catch (error) {
    console.error("❌ ALARM STATUS CRON ERROR:", error);
  } finally {
    alarmCronRunning = false;
  }
};

cron.schedule(
  "20 * * * * *",
  async () => {
    await updateShiftStatuses();
  },
  {
    timezone: getTimeZone(),
  }
);

cron.schedule(
  "35 * * * * *",
  async () => {
    await updatePatrolRunStatuses();
  },
  {
    timezone: getTimeZone(),
  }
);

cron.schedule(
  "50 * * * * *",
  async () => {
    await updateAlarmStatuses();
  },
  {
    timezone: getTimeZone(),
  }
);



export default updateOrderStatuses;
