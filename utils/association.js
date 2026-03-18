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
import MessageReceipt from "../src/messages/messageReceipt.model.js";
import MessageVisibility from "../src/messages/messageVisibility.model.js";
import UserPresence from "../src/messages/userPresence.model.js";
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

Conversation.hasMany(Message, {
  foreignKey: "conversationId",
  as: "messages",
  onDelete: "CASCADE",
});

Message.belongsTo(Conversation, {
  foreignKey: "conversationId",
  as: "conversation",
});

Conversation.hasMany(ConversationParticipant, {
  foreignKey: "conversationId",
  as: "participants",
  onDelete: "CASCADE",
});

ConversationParticipant.belongsTo(Conversation, {
  foreignKey: "conversationId",
  as: "conversation",
});

ConversationParticipant.belongsTo(User, {
  foreignKey: "userId",
  as: "User",
});

User.hasMany(ConversationParticipant, {
  foreignKey: "userId",
  as: "conversationMemberships",
});

User.hasMany(Message, { foreignKey: "senderId", as: "sentMessages" });

Message.belongsTo(User, {
  foreignKey: "senderId",
  as: "sender",
});

Message.hasMany(MessageReceipt, {
  foreignKey: "messageId",
  as: "receipts",
  onDelete: "CASCADE",
});

MessageReceipt.belongsTo(Message, {
  foreignKey: "messageId",
  as: "message",
});

User.hasMany(MessageReceipt, {
  foreignKey: "userId",
  as: "messageReceipts",
});

MessageReceipt.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

Message.hasMany(MessageVisibility, {
  foreignKey: "messageId",
  as: "visibility",
  onDelete: "CASCADE",
});

MessageVisibility.belongsTo(Message, {
  foreignKey: "messageId",
  as: "message",
});

User.hasMany(MessageVisibility, {
  foreignKey: "userId",
  as: "messageVisibility",
});

MessageVisibility.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

User.hasOne(UserPresence, {
  foreignKey: "userId",
  as: "presence",
  onDelete: "CASCADE",
});

UserPresence.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});