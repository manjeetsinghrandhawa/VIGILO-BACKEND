import express from "express";
import { auth, isAdmin, isUser } from "../../middlewares/auth.js";
import { acceptOrder, cancelOrder, createOrder, getAdminOrderById, getAllOrders, getOrderById, getUserOrders } from "./order.controller.js";

const route = express.Router();

route.post("/createOrder",auth, isUser,createOrder);
route.get("/getUserOrders",auth, isUser,getUserOrders);
route.get("/getOrderById/:id",auth,isUser,getOrderById);

route.get("/getAllOrders",auth, isAdmin,getAllOrders);
route.get("/getAdminOrderById/:id",auth, isAdmin,getAdminOrderById);
route.post("/cancelOrder/:id",auth, isAdmin,cancelOrder);
route.post("/acceptOrder/:id",auth, isAdmin,acceptOrder);


export default route;