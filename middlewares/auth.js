import jwt from "jsonwebtoken";
import userModel from "../src/user/user.model.js";
import ErrorHandler from "../utils/errorHandler.js";

export const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: { message: "Unauthorized. Please send token in 'Authorization: Bearer <token>' format" },
      });
    }

    const token = authHeader.split(" ")[1];

    const { id } = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = id;
    next();
  } catch (error) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
};

export const isAdmin = async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await userModel.findByPk(userId);

    if (!user) {
      return next(new ErrorHandler("Invalid token. User not found.", 401));
    }

    if (user.role !== "admin") {
      return next(new ErrorHandler("Restricted. Admins only.", 403));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorHandler("Unauthorized.", 401));
  }
};

export const isUser = async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await userModel.findByPk(userId);

    if (!user) {
      return next(new ErrorHandler("Invalid token. User not found.", 401));
    }

    if (user.role !== "user") {
      return next(new ErrorHandler("Restricted. Users only.", 403));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorHandler("Unauthorized.", 401));
  }
};

export const isGaurd = async (req, res, next) => {
  try {
    const userId = req.userId;
    const user = await userModel.findByPk(userId);

    if (!user) {
      return next(new ErrorHandler("Invalid token. User not found.", 401));
    }

    if (user.role !== "guard") {
      return next(new ErrorHandler("Restricted. Guards only.", 403));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ErrorHandler("Unauthorized.", 401));
  }
};
