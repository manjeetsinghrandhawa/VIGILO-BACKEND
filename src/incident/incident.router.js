import express from "express";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";
import { createIncident, editIncident, getAllIncidents, getIncidentById, getAllIncidentsForAdmin, getIncidentByIdForAdmin, deleteIncident } from "./incident.controller.js";

const router = express.Router();

router.post("/addIncident", auth,isGaurd, createIncident);
router.get("/getAllIncidents/:shiftId", auth,isGaurd, getAllIncidents);
router.put("/editIncident/:id", auth,isGaurd, editIncident);
router.delete("/deleteIncident/:id", auth,isGaurd, deleteIncident);
router.get("/getIncidentById/:id", auth,isGaurd, getIncidentById);
router.get("/getAllIncidentsForAdmin", auth,isAdmin, getAllIncidentsForAdmin);
router.get("/getIncidentByIdForAdmin/:id", auth,isAdmin, getIncidentByIdForAdmin);


export default router;
