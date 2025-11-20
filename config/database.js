import { Sequelize } from "sequelize";   
import dotenv from "dotenv";            

dotenv.config({ path: "./config/.env" });

const sequelize = new Sequelize(
  process.env.DB_NAME,  
  process.env.DB_USER,  
  process.env.DB_PASS,  
  {
    host: process.env.DB_HOST,   
    port: process.env.DB_PORT,   
    dialect: "postgres",
    dialectOptions: {
      ssl: {
        require: true,          
        rejectUnauthorized: false,
      },
    },
     logging: false, 
       timezone: "+00:00",
  }
);


export default sequelize;
