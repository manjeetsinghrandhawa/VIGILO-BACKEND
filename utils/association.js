import QR from "./../src/patrolling/QR.model.js";
import PatrolCheckPoint from "../src/patrolling/patrolCheckpoint.model.js";
import Static from "../src/shift/static.model.js";
import ShiftChangeRequest from "../src/order/shiftChangeRequest.model.js";

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