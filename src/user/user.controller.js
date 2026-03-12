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
import sendEmail from "../../utils/sendEmail.js";
import { generateGuardCreatedTemplate } from "../templete/generateGuardCreatedTemplate.js";

// Register User
// Register User
export const registerUser = catchAsyncError(async (req, res, next) => {
  const { name, email, password, address, mobile,countryCode, avatar } = req.body;

  if (!name || !email || !password || !address) {
    return next(
      new ErrorHandler(
        "Name, email, password, and address are required fields.",
        StatusCodes.BAD_REQUEST
      )
    );
  }

  let user = await userModel.findOne({ where: { email } });

// If user exists but with different role
if (user && user.role !== "user") {
  return next(
    new ErrorHandler(
      "This email is already registered with another role.",
      StatusCodes.CONFLICT
    )
  );
}

// If verified guard already exists
if (user && user.isVerified) {
  return next(
    new ErrorHandler(
      "User already registered. Please login.",
      StatusCodes.CONFLICT
    )
  );
}

  const hashedPassword = await bcrypt.hash(password, 10);

  // ✅ CASE 2: User exists but not verified → Update details
  if (user && !user.isVerified) {
    user.name = name;
    user.password = hashedPassword;
    user.address = address;
    user.mobile = mobile || null;
    user.avatar = avatar || null;
    user.countryCode = countryCode || null;

    await user.save();
  }

  // ✅ CASE 3: New user
  if (!user) {
    user = await userModel.create({
      name,
      email,
      password: hashedPassword,
      role: "user",
      mobile,
      avatar,
      countryCode,
      address,
      isVerified: false,
    });
  }

  // 🔁 Always delete old OTP (important)
  await userVerifyModel.destroy({
    where: { email, type: "register" }
  });

  const expireIn = Date.now() + 5 * 60 * 1000;

  await userVerifyModel.create({
    email,
    otp: 1111, // ⚠ Replace with random in production
    expireIn,
    type: "register",
  });

  return res.status(StatusCodes.OK).json({
    success: true,
    message: `OTP sent successfully to ${email}`,
    otp: 1111,
  });
});



export const registerGaurd = catchAsyncError(async (req, res, next) => {
  const { name, email, password, address, mobile, countryCode, avatar } = req.body;

  if (!name || !email || !password || !address) {
    return next(
      new ErrorHandler(
        "Name, email, password, and address are required fields.",
        StatusCodes.BAD_REQUEST
      )
    );
  }

  let user = await userModel.findOne({ where: { email } });

// If user exists but with different role
if (user && user.role !== "guard") {
  return next(
    new ErrorHandler(
      "This email is already registered with another role.",
      StatusCodes.CONFLICT
    )
  );
}

// If verified guard already exists
if (user && user.isVerified) {
  return next(
    new ErrorHandler(
      "User already registered. Please login.",
      StatusCodes.CONFLICT
    )
  );
}


  const hashedPassword = await bcrypt.hash(password, 10);

  // ✅ CASE 2: User exists but NOT verified → Update details
  if (user && !user.isVerified) {
    user.name = name;
    user.password = hashedPassword;
    user.address = address;
    user.mobile = mobile || null;
    user.avatar = avatar || null;
    user.countryCode = countryCode || null;

    await user.save();
  }

  // ✅ CASE 3: New User
  if (!user) {
    user = await userModel.create({
      name,
      email,
      password: hashedPassword,
      role: "guard",
      mobile,
      countryCode,
      avatar,
      address,
      isVerified: false,
    });
  }

  // 🔁 Always recreate OTP entry (delete old one first)
  await userVerifyModel.destroy({
    where: { email, type: "register" }
  });

  const expireIn = Date.now() + 5 * 60 * 1000;

  await userVerifyModel.create({
    email,
    otp: 1111,
    expireIn,
    type: "register",
  });

  return res.status(StatusCodes.OK).json({
    success: true,
    message: `OTP sent successfully to ${email}`,
    otp: 1111,
  });
});

const generateRandomPassword = (length = 10) => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};





export const createGuardByAdmin = catchAsyncError(async (req, res, next) => {
  const { name, email, mobile } = req.body;

  // 🔒 Validation
  if (!name || !email || !mobile) {
    return next(
      new ErrorHandler(
        "Name, email, and mobile are required.",
        StatusCodes.BAD_REQUEST
      )
    );
  }

  // 🔍 Check existing user
  const existingUser = await userModel.findOne({ where: { email } });
  if (existingUser) {
    return next(
      new ErrorHandler(
        "A user with this email already exists!",
        StatusCodes.CONFLICT
      )
    );
  }

  // 🔐 Auto-generate password
  const plainPassword = generateRandomPassword(10);
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  // 🏠 Default address
  const address = "Add your address";

  // 👮 Create Guard
  const newGuard = await userModel.create({
    name,
    email,
    mobile,
    password: hashedPassword,
    address,
    role: "guard",
    isVerified: true,
  });

  // 📧 Email template data
  const emailTemplate = generateGuardCreatedTemplate({
    name,
    email,
    mobile,
    password: plainPassword,
    address,
    appLink: "https://play.google.com/store/apps/details?id=com.vigilo.app", // update if needed
  });

  // 📤 Send Email
  await sendEmail(name, email, emailTemplate);

  return res.status(StatusCodes.CREATED).json({
    success: true,
    message: "Guard created successfully and credentials sent via email.",
    guardId: newGuard.id,
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
  if (!verifiedUser) {
  return next(
    new ErrorHandler("User not found", StatusCodes.NOT_FOUND)
  );
}
  await verifiedUser.update({ isVerified: true });
  await checkUser.destroy(); // 🔥 cleanup OTP record


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
    return next(
      new ErrorHandler("Email is required", StatusCodes.BAD_REQUEST)
    );
  }

  const expireIn = Date.now() + 5 * 60 * 1000;
  const otp = 1111; // ✅ static OTP

  const checkUser = await userVerifyModel.findOne({
    where: { email, type: "register" }
  });

  if (checkUser) {
    await checkUser.update({ otp, expireIn });
  } else {
    await userVerifyModel.create({
      email,
      otp,
      expireIn,
      type: "register"
    });
  }

  // await verifyEmail("User", email, otp);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "OTP sent successfully",
    otp // ✅ included in response
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
      avatar:user.avatar
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
    return next(
      new ErrorHandler("Email is required", StatusCodes.BAD_REQUEST)
    );
  }

  const user = await userModel.findOne({ where: { email } });
  if (!user) {
    return next(
      new ErrorHandler("User not found", StatusCodes.NOT_FOUND)
    );
  }

  const otp = 1111; // ✅ static OTP
  const expireIn = Date.now() + 5 * 60 * 1000;

  const checkOtp = await userVerifyModel.findOne({
    where: { email, type: "forgotPassword" }
  });

  if (checkOtp) {
    await checkOtp.update({
      otp,
      expireIn,
      isUsed: false
    });
  } else {
    await userVerifyModel.create({
      email,
      otp,
      expireIn,
      type: "forgotPassword"
    });
  }

  // await verifyEmail(user.name, email, otp);

  res.status(StatusCodes.OK).json({
    success: true,
    message: `OTP sent to ${email} for password reset`,
    otp // ✅ included in response
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
    return next(
      new ErrorHandler("User not found", StatusCodes.NOT_FOUND)
    );
  }

  const otp = 1111; // ✅ static OTP
  const expireIn = Date.now() + 5 * 60 * 1000;

  const checkOtp = await userVerifyModel.findOne({
    where: { email, type: "forgotPassword" }
  });

  if (checkOtp) {
    await checkOtp.update({
      otp,
      expireIn,
      isUsed: false
    });
  } else {
    await userVerifyModel.create({
      email,
      otp,
      expireIn,
      type: "forgotPassword"
    });
  }

  // await verifyEmail(user.name, email, otp);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "OTP resent successfully",
    otp // ✅ added in response
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
  const { name, address, mobile, avatar, countryCode } = req.body;

  const user = await userModel.findByPk(req.userId);
  if (!user) {
    return next(new ErrorHandler("User not found", StatusCodes.NOT_FOUND));
  }

  if (name) user.name = name;
  if (address) user.address = address;
  if (mobile) user.mobile = mobile;
  if (avatar) user.avatar = avatar;
  if (countryCode) user.countryCode = countryCode;
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

  await user.destroy({ force: true });


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

  /** 1️⃣ Find Guard */
  const guard = await userModel.findOne({
    where: { id, role: "guard" },
    attributes: ["id", "name", "email", "mobile", "address", "createdAt"],
  });

  if (!guard) {
    return next(new ErrorHandler("Guard not found", StatusCodes.NOT_FOUND));
  }

  /** 2️⃣ Fetch last activities (timesheets) */
  const statics = await Static.findAll({
    include: [
      {
        model: userModel,
        as: "guards",
        where: { id: guard.id },
        attributes: ["id", "name"],
        through: {
          attributes: [
            "status",
            "clockInTime",
            "clockOutTime",
            "totalHours",
            "overtimeStartTime",
            "overtimeEndTime",
            "overtimeHours",
            "createdAt",
          ],
        },
        required: true,
      },
      {
        model: Order,
        as: "order",
        attributes: ["id", "serviceType", "locationName", "locationAddress", "status"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 10, // 🔥 last 10 activities
  });

  /** 3️⃣ Format Timesheet */
  const timesheetHistory = statics.map((shift) => {
    const t = shift.guards[0].StaticGuards;

    return {
      shiftId: shift.id,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      shiftStatus: shift.status,

      order: shift.order
        ? {
            serviceType: shift.order.serviceType,
            locationName: shift.order.locationName,
            locationAddress: shift.order.locationAddress,
          }
        : null,

      assignmentStatus: t.status,

      timesheet: {
        clockInTime: t.clockInTime,
        clockOutTime: t.clockOutTime,
        totalHours: t.totalHours ?? 0,
        overtime: {
          startTime: t.overtimeStartTime,
          endTime: t.overtimeEndTime,
          hours: t.overtimeHours ?? 0,
        },
      },
    };
  });

  /** 4️⃣ Response */
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Guard details fetched successfully",
    data: {
      guard: guard.toJSON(),
      activity: timesheetHistory, // 🔥 last activities
    },
  });
});


// Fetch all clients details 
export const getAllClients = catchAsyncError(async (req, res, next) => {
  let { page = 1, limit = 10, search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const { count, rows: users } = await userModel.findAndCountAll({
    where: {
      role: "user",
      ...(search && {
        [Op.or]: [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { mobile: { [Op.iLike]: `%${search}%` } },
          { address: { [Op.iLike]: `%${search}%` } },
        ],
      }),
    },
    attributes: ["id", "name", "email", "mobile", "address", "avatar"],
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  if (!users || users.length === 0) {
    return next(new ErrorHandler("No clients found", StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Clients fetched successfully",
    data: users,
    pagination: {
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
      limit,
    },
  });
});


// Get single client details by ID
export const getClientById = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;

  const client = await userModel.findOne({
    where: { 
      id,
      role: "user" 
    },
    attributes: [
      "id", 
      "name", 
      "email", 
      "mobile", 
      "countryCode",
      "address", 
      "avatar",
      "isVerified",
      "createdAt",
      "updatedAt"
    ],
  });

  if (!client) {
    return next(new ErrorHandler("Client not found", StatusCodes.NOT_FOUND));
  }

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Client details fetched successfully",
    data: client,
  });
});

// Edit/Update client details
export const editClient = catchAsyncError(async (req, res, next) => {
  const { id } = req.params;
  const { name, email, mobile, countryCode, address, avatar } = req.body;

  // Find the client
  const client = await userModel.findOne({
    where: { 
      id,
      role: "user" 
    },
  });

  if (!client) {
    return next(new ErrorHandler("Client not found", StatusCodes.NOT_FOUND));
  }

  // Check if email is being changed and if it's already taken
  if (email && email !== client.email) {
    const emailExists = await userModel.findOne({
      where: { email },
    });
    
    if (emailExists) {
      return next(new ErrorHandler("Email already in use", StatusCodes.BAD_REQUEST));
    }
  }

  // Update client details
  const updateData = {};
  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (mobile) updateData.mobile = mobile;
  if (countryCode !== undefined) updateData.countryCode = countryCode;
  if (address) updateData.address = address;
  if (avatar !== undefined) updateData.avatar = avatar;

  await client.update(updateData);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Client updated successfully",
    data: client,
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

// Edit / Update guard details
export const editGuard = async (req, res, next) => {
  const { id } = req.params;
  const { 
    name,
    email,
    mobile,
    countryCode,
    address,
    avatar,
    employeeId,
    joinedDate,
    status
  } = req.body;

  /** 1️⃣ Find guard */
  const guard = await userModel.findOne({
    where: {
      id,
      role: "guard",
    },
  });

  if (!guard) {
    return next(
      new ErrorHandler("Guard not found", StatusCodes.NOT_FOUND)
    );
  }

  /** 2️⃣ Email uniqueness check */
  if (email && email !== guard.email) {
    const emailExists = await userModel.findOne({
      where: { email },
    });

    if (emailExists) {
      return next(
        new ErrorHandler("Email already in use", StatusCodes.BAD_REQUEST)
      );
    }
  }

  /** 3️⃣ Prepare update payload */
  const updateData = {};

  if (name) updateData.name = name;
  if (email) updateData.email = email;
  if (mobile) updateData.mobile = mobile;
  if (countryCode !== undefined) updateData.countryCode = countryCode;
  if (address !== undefined) updateData.address = address;
  if (avatar !== undefined) updateData.avatar = avatar;

  // Optional guard-specific fields
  if (employeeId !== undefined) updateData.employeeId = employeeId;
  if (joinedDate !== undefined) updateData.joinedDate = joinedDate;
  if (status !== undefined) updateData.status = status;

  /** 4️⃣ Update */
  await guard.update(updateData);

  res.status(StatusCodes.OK).json({
    success: true,
    message: "Guard updated successfully",
    data: guard,
  });
};

export const updateGuardNotificationPreference = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "enabled must be a boolean value",
      });
    }

    await userModel.update(
      { notificationsEnabled: enabled },
      { where: { id: userId } }
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: enabled
        ? "Notifications enabled successfully"
        : "Notifications disabled successfully",
      data: {
        notificationsEnabled: enabled,
      },
    });
  } catch (error) {
    console.error("Update notification preference error:", error);
    return next(
      new ErrorHandler(
        "Failed to update notification preference",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getGuardNotificationPreference = async (req, res, next) => {
  try {
    const userId = req.userId;

    const user = await userModel.findByPk(userId, {
      attributes: ["notificationsEnabled"],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        notificationsEnabled: user?.notificationsEnabled ?? true,
      },
    });
  } catch (error) {
    console.error("Get notification preference error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch notification preference",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { oldPassword, newPassword, confirmPassword } = req.body;

    // 🔍 Validate inputs
    if (!oldPassword || !newPassword || !confirmPassword) {
      return next(
        new ErrorHandler(
          "Old password, new password and confirm password are required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    if (newPassword !== confirmPassword) {
      return next(
        new ErrorHandler(
          "New password and confirm password do not match",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    if (oldPassword === newPassword) {
      return next(
        new ErrorHandler(
          "New password must be different from old password",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 🔎 Fetch user
    const user = await userModel.findByPk(userId);

    if (!user) {
      return next(
        new ErrorHandler("User not found", StatusCodes.NOT_FOUND)
      );
    }

    // 🔐 Check old password
    const isPasswordMatched = await bcrypt.compare(
      oldPassword,
      user.password
    );

    if (!isPasswordMatched) {
      return next(
        new ErrorHandler(
          "Old password is incorrect",
          StatusCodes.UNAUTHORIZED
        )
      );
    }

    // 🔐 Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 💾 Update password
    user.password = hashedPassword;
    await user.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return next(
      new ErrorHandler(
        "Failed to change password",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};



