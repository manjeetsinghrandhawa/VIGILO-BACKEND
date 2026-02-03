import sequelize from "./config/database.js"; 
import app from './app.js';
import "./src/cron/statusUpdates.js";

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


// 🔥 CALL ASSOCIATIONS AFTER ALL MODELS ARE LOADED
Object.values(sequelize.models).forEach((model) => {
  if (model.associate) {
    model.associate();
  }
});

// then sync
await sequelize.sync();


app.get("/", (req, res) => {
  res.send("Hello World from Node.js + Express + Sequelize + Postgres (Render)!");
});

app.get("/db-check", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.send(" Database connected successfully!");
  } catch (error) {
    console.error(error);
    res.status(500).send("Database connection failed!");
  }
});

const PORT = process.env.PORT || 9002;
(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connected to Render Postgres!");
    await sequelize.sync({ alter: true }); 
    console.log("All models were synchronized!");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Connection failed:", error);
  }
})();
