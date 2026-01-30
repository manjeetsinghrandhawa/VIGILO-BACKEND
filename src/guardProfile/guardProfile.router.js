import express from "express";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";
import { saveGuardProfile,saveGuardBankDetails } from "./guardProfile.controller.js";


const router = express.Router();

router.post("/saveGuardProfile", auth, isGaurd, saveGuardProfile);

router.post("/saveGuardBankDetails", auth, isGaurd, saveGuardBankDetails);

export default router;