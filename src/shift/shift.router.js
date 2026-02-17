import express from "express";
import { auth, isAdmin, isGaurd, isUser } from "../../middlewares/auth.js";
import { assignShift, getAllShifts, respondToShift, getMyShiftDetails } from "./shift.controller.js";

const route = express.Router();

route.post("/assignShift/:orderId",auth, isAdmin,assignShift);
route.get("/getAllShifts",auth, isAdmin,getAllShifts);
route.post("/respondToShift/:staticId",auth, isGaurd,respondToShift);
route.get("/getMyShiftDetails/:id",auth, isGaurd,getMyShiftDetails);


export default route;