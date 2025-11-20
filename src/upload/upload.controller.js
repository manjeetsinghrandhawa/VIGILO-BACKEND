import { s3UploadMulti, s3Uploadv2 } from "../../utils/s3.js";
import { StatusCodes } from "http-status-codes";
import catchAsyncError from "../../utils/catchAsyncError.js";
import ErrorHandler from "../../utils/errorHandler.js";

export const uploadSingleImage = catchAsyncError(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorHandler("No image file provided", StatusCodes.BAD_REQUEST));
  }

  const result = await s3Uploadv2(req.file);

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Image uploaded successfully",
    imageUrl: result.Location,
  });
});

export const uploadMultipleImages = catchAsyncError(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new ErrorHandler("No image files provided", StatusCodes.BAD_REQUEST));
  }

  const results = await s3UploadMulti(req.files);

  const imageUrls = results.map((file) => file.Location);

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Images uploaded successfully",
    imageUrl: imageUrls, 
  });
});
