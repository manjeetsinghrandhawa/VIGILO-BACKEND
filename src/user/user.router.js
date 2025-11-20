import express from "express";
import { registerUser, verifyRegisterEmail, resendOtp, userLogin, registerAdmin, forgotPassword, verifyForgotPasswordOtp, resendForgotPasswordOtp, setNewPassword, registerGaurd, getProfile, editProfile, deleteProfile, getAllGuards, getGuardById } from "./user.controller.js";
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

route.get("/getAllGuards",auth,isAdmin, getAllGuards );
route.get("/getGuardById/:id",auth,isAdmin, getGuardById );



export default route;