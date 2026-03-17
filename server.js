import sequelize from "./config/database.js"; 
import app from './app.js';
import "./src/cron/statusUpdates.js";
import "./utils/association.js";
import { Server } from "socket.io";
import http from "http";
import initSocket from "./src/sockets/index.js";




// Import ALL models first
import "./src/shift/static.model.js";
import "./src/user/user.model.js";
import "./src/incident/incident.model.js";
import "./src/invoicing/invoicing.model.js"
import "./src/notifications/notifications.model.js";
import "./src/guardProfile/guardProfile.model.js"
import "./src/shift/staticGuards.model.js";
import "./src/patrolling/patrolSite.model.js";
import "./src/patrolling/patrolSubSite.model.js"
import "./src/patrolling/patrolCheckpoint.model.js";
import "./src/shift/static.model.js";
import "./src/order/shiftChangeRequest.model.js";
import "./src/alarm/alarm.model.js";
import "./src/alarm/alarmGuards.model.js";

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

initSocket(io);

export { io };

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    Object.values(sequelize.models).forEach((model) => {
      if (model.associate) {
        model.associate();
      }
    });

    await sequelize.authenticate();
    console.log("Connected to Postgres");

    await sequelize.sync();
    console.log("Models synchronized");

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
})();
