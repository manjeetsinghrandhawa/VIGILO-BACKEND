import QR from "./../src/patrolling/QR.model.js";
import PatrolCheckPoint from "../src/patrolling/patrolCheckpoint.model.js";
import Static from "../src/shift/static.model.js";
import ShiftChangeRequest from "../src/order/shiftChangeRequest.model.js";
import Alarm from "../src/alarm/alarm.model.js";
import User from "../src/user/user.model.js";
import AlarmGuards from "../src/alarm/alarmGuards.model.js";
import PatrolSite from "../src/patrolling/patrolSite.model.js";
import PatrolRun from "../src/patrolling/patrolRun.model.js";
import Message from "../src/messages/message.model.js";
import Conversation from "../src/messages/conversation.model.js";
import ConversationParticipant from "../src/messages/conversationParticipant.model.js";

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

PatrolSite.hasMany(Alarm, {
  foreignKey: "siteId",
  as: "alarms",
});

Alarm.belongsTo(PatrolSite, {
  foreignKey: "siteId",
  as: "site",
});

PatrolRun.hasMany(Alarm, {
  foreignKey: "patrolRunId",
  as: "alarms",
  onDelete: "CASCADE",
});

Alarm.belongsTo(PatrolRun, {
  foreignKey: "patrolRunId",
  as: "patrolRun",
});

Conversation.hasMany(Message,{
foreignKey:"conversationId"
});

ConversationParticipant.belongsTo(User,{
foreignKey:"userId"
});

User.hasMany(Message, { foreignKey: "senderId", as: "sentMessages" });
User.hasMany(Message, { foreignKey: "receiverId", as: "receivedMessages" });