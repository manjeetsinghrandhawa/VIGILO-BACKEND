import express from "express";
import { auth, isAdmin, isUser } from "../../middlewares/auth.js";
import { 
  acceptOrder, 
  cancelOrder, 
  createOrder, 
  editOrder,
  getAdminOrderById, 
  getAllOrders, 
  getOrderById, 
  getUserOrders,
  getUserUpcomingOrders,
  getUserOngoingOrders,
  getRequestedOrders,
  getOrderHistory,
  getMyOrdersByDate
} from "./order.controller.js";

const route = express.Router();

// ============================================
// USER ROUTES
// ============================================
route.post("/createOrder", auth, isUser, createOrder);
route.get("/getUserOrders", auth, isUser, getUserOrders);
route.get("/getOrderById/:id", auth, isUser, getOrderById);
route.get("/getUserUpcomingOrders", auth, isUser, getUserUpcomingOrders);
route.get("/getUserOngoingOrders", auth, isUser, getUserOngoingOrders);
route.get("/getRequestedOrders", auth, isUser, getRequestedOrders);
route.get("/getOrderHistory", auth, isUser, getOrderHistory);
route.post("/getMyOrdersByDate", auth, isUser, getMyOrdersByDate);
// ============================================
// ADMIN ROUTES
// ============================================
route.get("/getAllOrders", auth, isAdmin, getAllOrders);
route.get("/getAdminOrderById/:id", auth, isAdmin, getAdminOrderById);
route.put("/editOrder/:id", auth, isAdmin, editOrder);
route.post("/cancelOrder/:id", auth, isAdmin, cancelOrder);
route.post("/acceptOrder/:id", auth, isAdmin, acceptOrder);

export default route;
