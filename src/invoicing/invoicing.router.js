import express from "express";
import { generateInvoice, getAllInvoice } from "./invoicing.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

router.post("/generateInvoice",auth,isAdmin,  generateInvoice);

router.get("/getAllInvoice", auth, isAdmin, getAllInvoice)

export default router;
