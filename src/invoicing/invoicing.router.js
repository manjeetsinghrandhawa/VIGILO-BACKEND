import express from "express";
import { generateInvoice, getAllInvoice,getInvoiceById } from "./invoicing.controller.js";
import { auth, isGaurd, isAdmin } from "../../middlewares/auth.js";

const router = express.Router();

router.post("/generateInvoice",auth,isAdmin,  generateInvoice);

router.get("/getAllInvoice", auth, isAdmin, getAllInvoice);

router.get("/getInvoiceById/:id", auth, isAdmin, getInvoiceById);

export default router;
