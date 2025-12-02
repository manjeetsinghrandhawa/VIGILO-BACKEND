import { StatusCodes } from "http-status-codes";
import catchAsyncError from "../../utils/catchAsyncError.js";
import ErrorHandler from "../../utils/errorHandler.js";
import userModel from "./user.model.js";
import userVerifyModel from "./userVerify.model.js";
// import verifyEmail from "../templete/verifyEmail.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import Static from "../shift/static.model.js";
import StaticGuards from "../shift/staticGuards.model.js";
import Order from "../order/order.model.js";

// Register User
export const registerUser = catchAsyncError(async (req, res, next) => {
  const { name, email, password ,address , mobile, avatar} = req.body;
  if (!name || !email || !password || !address) {
    return next(new ErrorHandler("Name, email, password, and address are required fields.",StatusCodes.BAD_REQUEST));
  }
  const checkUser = await userVerifyModel.findOne({ where: { email, type: "register" } });
  if (checkUser) {
    const user = await userModel.findOne({ where: { email } });
    if (!user.isVerified) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.name = name;
      user.password = hashedPassword;
      user.address= address;
      if (mobile) user.mobile = mobile;
      if (avatar) user.avatar = avatar;
      await user.save();

      const otp = Math.floor(1000 + Math.random() * 9000);
      const expireIn = Date.now() + 5 * 60 * 1000;

       checkUser.otp = 1111;
      checkUser.expireIn = expireIn;
      await checkUser.save();
       // await verifyEmail(name, email, otp);

       return res.status(StatusCodes.OK).json({
        success: true,
        message: `User details updated and new OTP sent to ${email}`,
      });
      ;
    } else {
      return next(
        new ErrorHandler(
          "User is already registered, please login!",
          StatusCodes.NOT_ACCEPTABLE
        )
      );
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await userModel.create({
    name,
    email,
    password: hashedPassword,
    role: "user",
    mobile,
    avatar,
    address,
  });
  const otp = Math.floor(1000 + Math.random() * 9000);
  const expireIn = Date.now() + 5 * 60 * 1000;

  await userVerifyModel.create({ email, otp: 1111, expireIn, type: "register" });

  // Send OTP email
 // await verifyEmail(name, email, otp);

  res.status(StatusCodes.OK).json({
    message: `OTP sent successfully to ${email}`,
    success: true,
  });
});

export const registerGaurd = catchAsyncError(async (req, res, next) => {
  const { name, email, password ,address , mobile, avatar} = req.body;
  if (!name || !email || !password || !address) {
    return next(new ErrorHandler("Name, email, password, and address are required fields.",StatusCodes.BAD_REQUEST));
  }
  const checkUser = await userVerifyModel.findOne({ where: { email, type: "register" } });
  if (checkUser) {
    const user = await userModel.findOne({ where: { email } });
    if (!user.isVerified) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user.name = name;
      user.password = hashedPassword;
      user.address= address;
      if (mobile) user.mobile = mobile;
      if (avatar) user.avatar = avatar;
      await user.save();

      const otp = Math.floor(1000 + Math.random() * 9000);
      const expireIn = Date.now() + 5 * 60 * 1000;

       checkUser.otp = 1111;
      checkUser.expireIn = expireIn;
      await checkUser.save();
       // await verifyEmail(name, email, otp);

       return res.status(StatusCodes.OK).json({
        success: true,
        message: `User details updated and new OTP sent to ${email}`,
      });
      ;
    } else {
      return next(
        new ErrorHandler(
          "User is already registered, please login!",
          StatusCodes.NOT_ACCEPTABLE
        )
      );
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await userModel.create({
    name,
    email,
    password: hashedPassword,
    role: "guard",
    mobile,
    avatar,
    address,
  });
  const otp = Math.floor(1000 + Math.random() * 9000);
  const expireIn = Date.now() + 5 * 60 * 1000;

  await userVerifyModel.create({ email, otp: 1111, expireIn, type: "register" });

  // Send OTP email
 // await verifyEmail(name, email, otp);

  res.status(StatusCodes.OK).json({
    message: `OTP sent successfully to ${email}`,
    success: true,
  });
});

export const createGuardByAdmin = catchAsyncError(async (req, res, next) => {
  const { name, email, password, address, mobile, avatar } = req.body;

  // Validate required fields
  if (!name || !email || !password || !address) {
    return next(
      new ErrorHandler(
        "Name, email, password, and address are required fields.",
        StatusCodes.BAD_REQUEST
      )
    );
  }

  // Check if email already exists
  const existingUser = await userModel.findOne({ where: { email } });
  if (existingUser) {
    return next(
      new ErrorHandler(
        "A user with this email already exists!",
        StatusCodes.CONFLICT
      )
    );
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create guard directly (no OTP, no verification)
  const newGuard = await userModel.create({
    name,
    email,
    password: hashedPassword,
    address,
    mobile,
    avatar,
    role: "guard",
    isVerified: true, // Force verified since admin is adding
  });

  return res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Guard created successfully.",
    guard: newGuard,
  });
});


// Verify Email OTP
export const verifyRegisterEmail = catchAsyncError(async (req, res, next) => {
  const { email, otp } = req.body;

  const checkUser = await userVerifyModel.findOne({ where: { email, type: "register" } });
  if (!checkUser) {
    return next(
      new ErrorHandler(`OTP not found for this email: ${email}`, StatusCodes.NOT_FOUND)
    );
  }

  if (checkUser.otp !== Number(otp)) {
    return next(new ErrorHandler("Invalid OTP", StatusCodes.BAD_REQUEST));
  }

  if (Date.now() > checkUser.expireIn) {
    return next(new ErrorHandler("OTP expired", StatusCodes.BAD_REQUEST));
  }

  const verifiedUser = await userModel.findOne({ where: { email } });
  await verifiedUser.update({ isVerified: true });

  const token = jwt.sign(
    { id: verifiedUser.id, email: verifiedUser.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.status(StatusCodes.OK).json({
    message: "OTP verified successfully",
    success: true,
    token,
    user: {
      id: verifiedUser.id,
      name: verifiedUser.name,
      email: verifiedUser.email,
    },
  });
});

// Resend OTP
export const resendOtp = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorHandler("Email is required", StatusCodes.BAD_REQUEST));
  }

  const otp = Math.floor(1000 + Math.random() * 9000);
  const expireIn = Date.now() + 5 * 60 * 1000;

  const checkUser = await userVerifyModel.findOne({ where: { email, type: "register" } });
  if (checkUser) {
    await checkUser.update({ otp: 1111, expireIn });
  } else {
    await userVerifyModel.create({ email, otp: 1111, expireIn, type: "register" });
  }

  //await verifyEmail("User", email, otp);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "OTP sent successfully",
  });
});

// User Login
export const userLogin = catchAsyncError(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(
      new ErrorHandler("Email and Password are required", StatusCodes.BAD_REQUEST)
    );
  }

  const user = await userModel.findOne({ where: { email } });
  if (!user) {
    return next(new ErrorHandler("User is not registered", StatusCodes.NOT_ACCEPTABLE));
  }

  if (!user.isVerified) {
    return next(new ErrorHandler("User registered but not verified", StatusCodes.NOT_ACCEPTABLE));
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return next(new ErrorHandler("Invalid credentials", StatusCodes.UNAUTHORIZED));
  }

  // Generate JWT token
  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});


export const registerAdmin = catchAsyncError(async (req, res, next) => {
  const { name, email, password,mobile, address, } = req.body;

  const checkAdmin = await userModel.findOne({ where: { email } });
  if (checkAdmin) {
    return next(
      new ErrorHandler("Admin already exists, please login!", StatusCodes.CONFLICT)
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await userModel.create({
    name,
    email,
    password: hashedPassword,
    role: "admin",
    isVerified: true,
    mobile,
    address,
  });

  res.status(StatusCodes.CREATED).json({
    message: "Admin registered successfully!",
    success: true,
    admin: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isVerified: admin.isVerified,
    },
  });
});

export const forgotPassword = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorHandler("Email is required", StatusCodes.BAD_REQUEST));
  }

  const user = await userModel.findOne({ where: { email } });
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  const otp = Math.floor(1000 + Math.random() * 9000);
  const expireIn = Date.now() + 5 * 60 * 1000;

  const checkOtp = await userVerifyModel.findOne({ where: { email, type: "forgotPassword" } });

  if (checkOtp) {
    await checkOtp.update({ otp: 1111, expireIn, isUsed: false });
  } else {
    await userVerifyModel.create({ email, otp: 1111, expireIn, type: "forgotPassword" });
  }

  //await verifyEmail(user.name, email, otp);

  res.status(StatusCodes.OK).json({
    success: true,
    message: `OTP sent to ${email} for password reset`,
  });
});


export const verifyForgotPasswordOtp = catchAsyncError(async (req, res, next) => {
  const { email, otp } = req.body;

  const checkOtp = await userVerifyModel.findOne({ where: { email, type: "forgotPassword" } });
  if (!checkOtp) {
    return next(new ErrorHandler("OTP not found", StatusCodes.NOT_FOUND));
  }

  if (checkOtp.otp !== Number(otp)) {
    return next(new ErrorHandler("Invalid OTP", StatusCodes.BAD_REQUEST));
  }

  if (Date.now() > checkOtp.expireIn) {
    return next(new ErrorHandler("OTP expired", StatusCodes.BAD_REQUEST));
  }

  await checkOtp.update({ isUsed: true });

  res.status(StatusCodes.OK).json({
    success: true,
    message: "OTP verified successfully",
  });
});


export const resendForgotPasswordOtp = catchAsyncError(async (req, res, next) => {
  const { email } = req.body;

  const user = await userModel.findOne({ where: { email } });
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  const otp = Math.floor(1000 + Math.random() * 9000);
  const expireIn = Date.now() + 5 * 60 * 1000;

  const checkOtp = await userVerifyModel.findOne({ where: { email, type: "forgotPassword" } });

  if (checkOtp) {
    await checkOtp.update({ otp: 1111, expireIn, isUsed: false });
  } else {
    await userVerifyModel.create({ email, otp: 1111, expireIn, type: "forgotPassword" });
  }

  //await verifyEmail(user.name, email, otp);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "OTP resent successfully",
  });
});


export const setNewPassword = catchAsyncError(async (req, res, next) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return next(new ErrorHandler("Email and new password are required", StatusCodes.BAD_REQUEST));
  }

  const checkOtp = await userVerifyModel.findOne({
    where: { email, type: "forgotPassword", isUsed: true },
  });

  if (!checkOtp) {
    return next(
      new ErrorHandler("OTP not verified yet. Please verify OTP first.", StatusCodes.BAD_REQUEST)
    );
  }

  const user = await userModel.findOne({ where: { email } });
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return next(
      new ErrorHandler("New password cannot be the same as the old password", StatusCodes.BAD_REQUEST)
    );
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await user.update({ password: hashedPassword });

  await checkOtp.destroy(); 

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Password updated successfully",
  });
});


export const getProfile = catchAsyncError(async (req, res, next) => {
  const user = await userModel.findByPk(req.userId, {
    attributes: { exclude: ["password"] },
  });

  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "User profile fetched successfully",
    data: user,
  });
});

export const editProfile = catchAsyncError(async (req, res, next) => {
  const { name, address, mobile, avatar } = req.body;

  const user = await userModel.findByPk(req.userId);
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  if (name) user.name = name;
  if (address) user.address = address;
  if (mobile) user.mobile = mobile;
  if (avatar) user.avatar = avatar;
  await user.save();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Profile updated successfully",
    data: user,
  });
});

export const deleteProfile = catchAsyncError(async (req, res, next) => {
  const user = await userModel.findByPk(req.userId);
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  await user.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "User account deleted successfully",
  });
});

export const getAllGuards = catchAsyncError(async (req, res, next) => {
  let { page = 1, limit = 10, search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const { count, rows: guards } = await userModel.findAndCountAll({
    where: {
      role: "guard",
      ...(search && {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { mobile: { [Op.iLike]: `%${search}%` } },
        ],
      }),
    },
    attributes: ["id", "name", "email", "mobile", "createdAt","address"],
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });


  res.status(StatusCodes.OK).json({
    success: true,
    message : "All gaurds fetched sucessfully",
    data: guards,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
});

export const getGuardById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  // 1️⃣ Find the guard
  const guard = await userModel.findOne({
    where: { id, role: "guard" },
    attributes: ["id", "name", "email", "mobile", "address", "createdAt"],
  });

  if (!guard) {
    return next(new ErrorHandler("Guard not found", StatusCodes.NOT_FOUND));
  }

  // 2️⃣ Find the latest accepted static (exclude guards data)
  const latestStatic = await Static.findOne({
    include: [
      {
        model: userModel,
        as: "guards",
        attributes: [], // ✅ don't include any guard fields
        where: { id: guard.id },
        through: { where: { status: "accepted" }, attributes: [] }, // ✅ no StaticGuards data
        required: true,
      },
      {
        model: Order,
        attributes: ["id", "serviceType", "locationAddress", "status"],
      },
    ],
    order: [["startTime", "DESC"]],
  });

  // 3️⃣ Response
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Guard latest accepted static fetched successfully",
    data: {
      ...guard.toJSON(),
      latestStatic: latestStatic || null,
    },
  });
});

//fetch all clients details 
export const getAllClients = catchAsyncError(async (req, res, next) => {

  //  Find the Clients
  const user = await userModel.findAll({
    where: {  role: "user" },
    attributes: ["id", "name", "email", "mobile", "address"],
  });

  if (!user) {
    return next(new ErrorHandler("Client not found", StatusCodes.NOT_FOUND));
  }

  //  Response
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Client Details fetched successfully",
    data: user
  });
});

//to delete a client
export const deleteClient = catchAsyncError(async (req, res, next) => {
  const { id } = req.body;

  if (!id) {
    return next(new ErrorHandler("Client ID is required", StatusCodes.BAD_REQUEST));
  }

  // Check if the client exists
  const user = await userModel.findOne({
    where: { id, role: "user" },
  });

  if (!user) {
    return next(new ErrorHandler("Client not found", StatusCodes.NOT_FOUND));
  }

  // Delete the client
  await user.destroy();

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Client deleted successfully",
  });
});
