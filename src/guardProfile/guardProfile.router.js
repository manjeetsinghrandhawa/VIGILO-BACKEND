import express from "express";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";
import { saveGuardProfile,saveGuardBankDetails,getGuardProfile, getGuardBankDetails,getTermsAndConditions,getPrivacyPolicy,saveTaxDeclaration, getTaxDeclaration,saveSuperNomination, getSuperNominationContent, getGuardOnboardingStatus, createLicense } from "./guardProfile.controller.js";


const router = express.Router();

router.post("/saveGuardProfile", auth, isGaurd, saveGuardProfile);

router.post("/saveGuardBankDetails", auth, isGaurd, saveGuardBankDetails);

router.get("/getGuardProfile", auth, isGaurd, getGuardProfile);

router.get("/getGuardBankDetails", auth, isGaurd, getGuardBankDetails);

router.get("/getTermsAndConditions", getTermsAndConditions);

router.get("/getPrivacyPolicy",getPrivacyPolicy);

router.post("/saveTaxDeclaration", auth, isGaurd, saveTaxDeclaration);

router.get("/getTaxDeclaration",auth,isGaurd, getTaxDeclaration);

router.post("/saveSuperNomination", auth, isGaurd, saveSuperNomination);

router.get("/getSuperNominationContent", auth, isGaurd, getSuperNominationContent);

router.get("/getGuardOnboardingStatus", auth, isGaurd, getGuardOnboardingStatus);

router.post("/createLicense",auth,isGaurd, createLicense);
export default router;