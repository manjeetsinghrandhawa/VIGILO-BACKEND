import sequelize from "./config/database.js"; 
import app from './app.js';
import "./src/cron/statusUpdates.js";


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
