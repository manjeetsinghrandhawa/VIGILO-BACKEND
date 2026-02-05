import express from "express";
import { registerUser, verifyRegisterEmail,deleteClient,createGuardByAdmin, resendOtp, userLogin, registerAdmin, forgotPassword, verifyForgotPasswordOtp, resendForgotPasswordOtp, setNewPassword, registerGaurd, getProfile, editProfile, deleteProfile, getAllGuards, getGuardById,getAllClients, editClient, getClientById,editGuard, updateGuardNotificationPreference, getGuardNotificationPreference } from "./user.controller.js";
import { auth, isAdmin } from "../../middlewares/auth.js";

const route = express.Router();

route.post("/registerUser", registerUser);
route.post("/registerGaurd", registerGaurd);
route.post("/verify-register-otp", verifyRegisterEmail);
route.post("/resend-otp", resendOtp);
route.post("/login", userLogin);
route.post("/admin-register", registerAdmin);

route.post("/forgot-password", forgotPassword);
route.post("/verify-password-otp", verifyForgotPasswordOtp);
route.post("/resend-password-otp", resendForgotPasswordOtp);
route.post("/set-newPassword", setNewPassword);

route.get("/get-profile",auth, getProfile );
route.put("/edit-profile",auth, editProfile );
route.delete("/delete-profile",auth, deleteProfile );
route.post("/updateGuardNotificationPreference", auth, updateGuardNotificationPreference);
route.get("/getGuardNotificationPreference", auth, getGuardNotificationPreference);

route.get("/getAllGuards",auth,isAdmin, getAllGuards );
route.get("/getGuardById/:id",auth,isAdmin, getGuardById );
route.get("/getAllClients",auth,isAdmin, getAllClients );
route.post("/deleteClient",auth, isAdmin,deleteClient);
route.post("/createGuardByAdmin", auth, isAdmin,createGuardByAdmin);

route.get("/getClientById/:id", auth, isAdmin, getClientById); 
route.put("/editClient/:id", auth, isAdmin, editClient); 
route.put("/editGuard", auth, isAdmin, editGuard )

export default route;