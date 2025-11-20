import express from "express";
import { uploadMultipleImages, uploadSingleImage } from "./upload.controller.js";
import { auth, isAdmin } from "../../middlewares/auth.js";
import { upload } from "../../utils/s3.js";


const route = express.Router();

route.post("/multiple-images", auth,upload.array('images',5),uploadMultipleImages);
route.post("/single-image",upload.single("image"),uploadSingleImage);

export default route;