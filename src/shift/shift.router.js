import express from "express";
import { auth, isAdmin, isGaurd, isUser } from "../../middlewares/auth.js";
import { assignShift, getAllShiftsForUser, getStaticShiftById, respondToShift } from "./shift.controller.js";

const route = express.Router();

route.post("/assignShift/:orderId",auth, isAdmin,assignShift);
route.get("/getAllShiftsForUser",auth, isGaurd,getAllShiftsForUser);
route.post("/respondToShift/:staticId",auth, isGaurd,respondToShift);
route.get("/getStaticShiftById/:id",auth, isGaurd,getStaticShiftById);


export default route;