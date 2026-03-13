import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config({ path: "./config/.env" });

// Force IPv4 first (fixes DNS issues with Render)
dns.setDefaultResultOrder("ipv4first");

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  timezone: "+00:00",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  pool: {
    max: 15,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },
});

export default sequelize;