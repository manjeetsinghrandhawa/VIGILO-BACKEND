import GuardProfile from "./guardProfile.model.js";
import { StatusCodes } from "http-status-codes";
import ErrorHandler from "../../utils/errorHandler.js";
import GuardBankDetails from "./guardBankDetails.model.js";

export const saveGuardProfile = async (req, res, next) => {
  try {
    const userId = req.user.id; // logged-in guard

    const {
      firstName,
      middleName,
      lastName,
      title,
      dob,
      gender,
      email,
      mobile,
      street,
      city,
      state,
      postcode,
      emergencyName,
      emergencyRelationship,
      emergencyPhone,
      emergencyEmail,
      emergencyStreet,
      emergencyCity,
      emergencyState,
      emergencyPostcode,
    } = req.body;

    // 🔒 Decide profileCompleted INSIDE API
    const profileCompleted = Boolean(
      firstName &&
      lastName &&
      title &&
      dob &&
      gender &&
      email &&
      mobile &&
      street &&
      city &&
      state &&
      postcode &&
      emergencyName &&
      emergencyRelationship &&
      emergencyPhone &&
      emergencyEmail &&
      emergencyStreet &&
      emergencyCity &&
      emergencyState &&
      emergencyPostcode
    );

    const [profile] = await GuardProfile.upsert(
      {
        userId,

        // Employee info
        firstName,
        middleName,
        lastName,
        title,
        dob,
        gender,

        // Contact
        email,
        mobile,
        street,
        city,
        state,
        postcode,

        // Emergency contact
        emergencyName,
        emergencyRelationship,
        emergencyPhone,
        emergencyEmail,
        emergencyStreet,
        emergencyCity,
        emergencyState,
        emergencyPostcode,

        // 🚫 frontend never sends this
        profileCompleted,
      },
      { returning: true }
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: profileCompleted
        ? "Employee profile completed successfully"
        : "Employee profile saved",
      profileCompleted,
      data: profile,
    });
  } catch (error) {
    console.error("Employee profile complete error:", error);
    return next(
      new ErrorHandler(
        "Failed to complete employee profile",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};



export const saveGuardBankDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      accountHolderName,
      accountNickname,
      bsb,
      bankName,
      accountNumber,
      ifscCode,
      branchName,
    } = req.body;

    // 🔍 Check completeness for verification
    const isComplete =
      !!accountHolderName &&
      !!bsb &&
      !!accountNumber;
      

    // 🔎 Check if record already exists
    let bankDetails = await GuardBankDetails.findOne({
      where: { userId },
    });

    if (bankDetails) {
      // 🔄 Update existing record
      await bankDetails.update({
        accountHolderName,
        accountNickname,
        bsb,
        bankName,
        accountNumber,
        ifscCode,
        branchName,
        isVerified: isComplete,
      });
    } else {
      // ➕ Create new record
      bankDetails = await GuardBankDetails.create({
        userId,
        accountHolderName,
        accountNickname,
        bsb,
        bankName,
        accountNumber,
        ifscCode,
        branchName,
        isVerified: isComplete,
        isPrimary: true,
      });
    }

    return res.status(200).json({
      success: true,
      message: isComplete
        ? "Bank details saved and verified successfully"
        : "Bank details saved but verification pending",
      data: bankDetails,
    });
  } catch (error) {
    console.error("Guard bank details error:", error);
    return next(
      new ErrorHandler(
        "Failed to save guard bank details",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getGuardProfile = async (req, res, next) => {
  try {
    const userId = req.user.id; // logged-in guard

    const profile = await GuardProfile.findOne({
      where: { userId },
    });

    if (!profile) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error("Get guard profile error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch employee profile",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getGuardBankDetails = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const bankDetails = await GuardBankDetails.findOne({
      where: { userId },
    });

    if (!bankDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Bank details not found",
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      data: bankDetails,
    });
  } catch (error) {
    console.error("Get guard bank details error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch bank details",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};


