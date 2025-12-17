import { StatusCodes } from "http-status-codes";
import { v4 as uuidv4 } from "uuid";
import Invoice from "./invoicing.model.js";
import InvoiceItem from "./invoiceItem.model.js";
import Alarm from "../alarm/alarm.model.js";
// import Patrol from "../models/patrol.model.js";
import ErrorHandler from "../../utils/errorHandler.js";
// import catchAsyncError from "../middlewares/catchAsyncError.js";
import userModel from "../user/user.model.js";

export const generateInvoice = async (req, res, next) => {
  try {
    const {
      clientId,
      billingMonth,
      billingYear,
      dueDate,
      alarmIds = [],
      patrolIds = [],
      customServices = [],
      notes,
      subtotal,
      items,
      tax = 0,
      totalAmount
    } = req.body;

    // Validation
    if (!clientId || !billingMonth || !billingYear || !dueDate) {
      return next(
        new ErrorHandler(
          "Required invoice fields missing",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 1️⃣ Create Invoice
    const invoice = await Invoice.create({
      invoiceNumber: `INV-${billingYear}-${billingMonth}-${Date.now()}`,
      clientId,
      billingMonth,
      billingYear,
      dueDate,
      items,
      subtotal,
      tax,
      totalAmount,
      status: "pending",
      notes
    });

    const invoiceItems = [];

    // Completed Alarms → Invoice Items
    if (alarmIds.length > 0) {
      const alarms = await Alarm.findAll({
        where: {
          id: alarmIds,
          invoiceId: null
        }
      });

      for (const alarm of alarms) {
        invoiceItems.push({
          invoiceId: invoice.id,
          itemType: "alarm",
          referenceId: alarm.id,
          description: `${alarm.siteName} - ${alarm.alarmType}`,
          quantity: 1,
          unitPrice: alarm.price,
          totalPrice: alarm.price
        });

        // mark alarm as billed
        alarm.invoiceId = invoice.id;
        await alarm.save();
      }
    }

    // 3️⃣ Completed Patrols → Invoice Items
    if (patrolIds.length > 0) {
      const patrols = await Patrol.findAll({
        where: {
          id: patrolIds,
          invoiceId: null
        }
      });

      for (const patrol of patrols) {
        invoiceItems.push({
          invoiceId: invoice.id,
          itemType: "patrol",
          referenceId: patrol.id,
          description: `${patrol.siteName} - ${patrol.guardName}`,
          quantity: patrol.durationHours,
          unitPrice: patrol.hourlyRate,
          totalPrice: patrol.totalCost
        });

        patrol.invoiceId = invoice.id;
        await patrol.save();
      }
    }

    // 4️⃣ Custom Services → Invoice Items
    for (const service of customServices) {
      invoiceItems.push({
        invoiceId: invoice.id,
        itemType: "custom",
        referenceId: null,
        description: service.description,
        quantity: service.quantity,
        unitPrice: service.unitPrice,
        totalPrice: service.totalPrice
      });
    }

     // ✅ 6️⃣ Fetch FULL invoice with items
    const fullInvoice = await Invoice.findByPk(invoice.id, {
      include: [
        {
          model: InvoiceItem,
          as: "items"
        }
      ]
    });

    // ✅ 7️⃣ Return everything
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Invoice generated successfully",
      data: fullInvoice
    });

  } catch (error) {
    console.error("Generate Invoice Error:", error);
    return next(
      new ErrorHandler(
        "Failed to generate invoice",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


export const getAllInvoice = async (req, res, next) => {
  try {
    const invoices = await Invoice.findAll({
      include: [
        {
          model: userModel,
          attributes: ["id", "name", "email"]
        },
        {
          model: InvoiceItem,
          attributes: ["itemType"]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    const formattedInvoices = invoices.map(invoice => {
      const alarmCount = invoice.InvoiceItems.filter(
        item => item.itemType === "alarm"
      ).length;

      const patrolCount = invoice.InvoiceItems.filter(
        item => item.itemType === "patrol"
      ).length;

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,

        clientName: invoice.Client?.name || "-",
        clientCode: invoice.Client?.email || "-",

        billingPeriod: `${invoice.billingMonth} ${invoice.billingYear}`,

        services: {
          alarms: alarmCount,
          patrols: patrolCount
        },

        amount: invoice.totalAmount,
        status: invoice.status,
        dueDate: invoice.dueDate,
        paidDate: invoice.paidAt || null
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      totalInvoices: formattedInvoices.length,
      data: formattedInvoices
    });

  } catch (error) {
    console.error("Fetching Invoices Error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch invoices",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};
