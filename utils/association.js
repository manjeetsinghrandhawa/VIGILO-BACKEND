import QR from "./../src/patrolling/QR.model.js";
import PatrolCheckPoint from "../src/patrolling/patrolCheckpoint.model.js";
import Static from "../src/shift/static.model.js";
import ShiftChangeRequest from "../src/order/shiftChangeRequest.model.js";
import Alarm from "../src/alarm/alarm.model.js";
import User from "../src/user/user.model.js";
import AlarmGuards from "../src/alarm/alarmGuards.model.js";

// QR ↔ Checkpoint
QR.belongsTo(PatrolCheckPoint, {
  foreignKey: "checkPointId",
  as: "checkPoint",
  onDelete: "CASCADE",
});

PatrolCheckPoint.hasOne(QR, {
  foreignKey: "checkPointId",
  as: "qr",
  onDelete: "CASCADE",
});

Static.hasMany(ShiftChangeRequest, {
  foreignKey: "shiftId",
  as: "shiftChangeRequests",
});

Alarm.belongsToMany(User, {
  through: AlarmGuards,
  foreignKey: "alarmId",
  as: "guards",
});

User.belongsToMany(Alarm, {
  through: AlarmGuards,
  foreignKey: "guardId",
  as: "alarms",
});

AlarmGuards.belongsTo(Alarm, {
  foreignKey: "alarmId",
  as: "alarm",
});

AlarmGuards.belongsTo(User, {
  foreignKey: "guardId",
  as: "guard",
});