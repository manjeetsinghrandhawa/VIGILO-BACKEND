import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import errorMiddleware from "./middlewares/error.js";   
import userRoute from "./src/user/user.router.js";     
import uploadRoute from "./src/upload/upload.router.js";  
import orderRoute from "./src/order/order.router.js";     
import shiftRoute from "./src/shift/shift.router.js";    
import incidentRoute from "./src/incident/incident.router.js"; 
import schedulingRoute from "./src/scheduling/scheduling.router.js";
import invoicingRoute from "./src/invoicing/invoicing.router.js";
import notifications from "./src/notifications/notifications.router.js";
import guardProfileRoute from "./src/guardProfile/guardProfile.router.js";

dotenv.config({ path: "./config/.env" });

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
    credentials: true,
  })
);

app.use("/api/v1/users", userRoute);
app.use("/api/v1/upload", uploadRoute);
app.use("/api/v1/orders", orderRoute);
app.use("/api/v1/shifts", shiftRoute);
app.use("/api/v1/incidents", incidentRoute);
app.use("/api/v1/scheduling", schedulingRoute);
app.use("/api/v1/invoicing", invoicingRoute);
app.use("/api/v1/notifications", notifications);
app.use("/api/v1/guardProfile",guardProfileRoute);

app.get("/", (req, res) => res.json({ anc: "abc" }));

app.use((req, res) => {
  res.status(404).json({
    error: {
      message:
        "Not Found. Kindly Check the API path as well as request type",
    },
  });
});


app.use(errorMiddleware);

export default app;
