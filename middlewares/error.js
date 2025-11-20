import multer from "multer";
import ErrorHandler from "../utils/errorHandler.js";

export default (err, req, res, next) => {
  err.message = err.message || "Internal Server Error";

  // Multer upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      err = new ErrorHandler("File size is too large", 400);
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      err = new ErrorHandler("File limit reached", 400);
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      err = new ErrorHandler("File must be an image", 400);
    }
  }

  // Mongoose cast error
  if (err.name === "CastError") {
    const msg = `Resource not found. Invalid: ${err.path}`;
    err = new ErrorHandler(msg, 400);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    let errors = Object.values(err.errors).map((el) =>
      JSON.stringify({
        [el.path]: { required: el.kind, provided: el.valueType },
      })
    );

    const msg = `Validation Failed. ${errors.join(" ")}`;
    err = new ErrorHandler(msg, 400);
  }

  // Duplicate key error (MongoDB)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    let message;
    switch (field) {
      case "name":
        message = "Category with this name already exists.";
        break;
      case "email":
        message = "User with this email already exists.";
        break;
      default:
        message = `Duplicate Key Error ${field}.`;
    }
    err = new ErrorHandler(message, 400);
  }

  // JWT invalid
  if (err.name === "JsonWebTokenError") {
    err = new ErrorHandler("Json Web Token is invalid, try again", 400);
  }

  // JWT expired
  if (err.name === "TokenExpiredError") {
    err = new ErrorHandler("Json Web Token is expired, try again", 400);
  }

  // Sequelize validation error
  if (err.name === "SequelizeValidationError") {
    const message = err.errors[0]?.message || "Validation error";
    err = new ErrorHandler(message, 400);
  }

  // Final error response
  res.status(err.statusCode || 500).json({
    success: false,
    error: {
      message: err.message,
    },
  });
};
