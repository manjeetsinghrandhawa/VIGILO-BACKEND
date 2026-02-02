import express from "express";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";
import { saveGuardProfile,saveGuardBankDetails,getGuardProfile, getGuardBankDetails,getTermsAndConditions,getPrivacyPolicy } from "./guardProfile.controller.js";


const router = express.Router();

router.post("/saveGuardProfile", auth, isGaurd, saveGuardProfile);

router.post("/saveGuardBankDetails", auth, isGaurd, saveGuardBankDetails);

router.get("/getGuardProfile", auth, isGaurd, getGuardProfile);

router.get("/getGuardBankDetails", auth, isGaurd, getGuardBankDetails);

router.get("/getTermsAndConditions", getTermsAndConditions);

router.get("/getPrivacyPolicy",getPrivacyPolicy)
export default router;