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

export const getTermsAndConditions = async (req, res, next) => {
  try {
    const htmlContent = `
      <h2>Solid Cad Security</h2>
      <h3>Terms & Conditions</h3>

      <p>
        Welcome to Solid Cad Security. By accessing or using our application,
        you agree to be bound by these Terms & Conditions.
      </p>

      <p>
        All guards and administrators must comply with company policies,
        operational guidelines, and legal requirements.
      </p>

      <p>
        Any misuse of the platform, falsification of attendance, or violation
        of security protocols may result in account suspension or termination.
      </p>

      <p>
        Solid Cad Security reserves the right to modify these terms at any time
        without prior notice.
      </p>
    `;

    res.status(StatusCodes.OK).json({
      success: true,
      html: htmlContent,
    });
  } catch (error) {
    console.error("Get terms error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch terms & conditions",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getPrivacyPolicy = async (req, res, next) => {
  try {
    const htmlContent = `
      <h2>Solid Cad Security</h2>
      <h3>Privacy Policy</h3>

      <p>
        Your privacy is important to us. This policy explains how we collect,
        use, and protect your personal information.
      </p>

      <p>
        We collect data such as name, contact details, attendance logs, and
        location data strictly for operational and security purposes.
      </p>

      <p>
        Your information is stored securely and is never shared with third
        parties without legal obligation.
      </p>

      <p>
        By using our services, you consent to the practices described in this
        Privacy Policy.
      </p>
    `;

    res.status(StatusCodes.OK).json({
      success: true,
      html: htmlContent,
    });
  } catch (error) {
    console.error("Get privacy policy error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch privacy policy",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const saveTaxDeclaration = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const {
      hasTFN,
      tfnNumber,
      changedNameSinceLastTFN,
      isAustralianResident,
      claimTaxFreeThreshold,
      hasStudentLoan,
      paymentBasis,
    } = req.body;

    // 🔒 Validate all required fields
    if (
      hasTFN === undefined ||
      !tfnNumber ||
      changedNameSinceLastTFN === undefined ||
      isAustralianResident === undefined ||
      claimTaxFreeThreshold === undefined ||
      hasStudentLoan === undefined ||
      !paymentBasis
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "All tax declaration fields are required",
      });
    }

    const [taxDeclaration, created] =
      await GuardTaxDeclaration.findOrCreate({
        where: { userId },
        defaults: {
          userId,
          hasTFN,
          tfnNumber,
          changedNameSinceLastTFN,
          isAustralianResident,
          claimTaxFreeThreshold,
          hasStudentLoan,
          paymentBasis,
          isVerified: true, // 👈 verified because all fields exist
        },
      });

    if (!created) {
      await taxDeclaration.update({
        hasTFN,
        tfnNumber,
        changedNameSinceLastTFN,
        isAustralianResident,
        claimTaxFreeThreshold,
        hasStudentLoan,
        paymentBasis,
        isVerified: true,
      });
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Tax declaration saved successfully",
      data: taxDeclaration,
    });
  } catch (error) {
    console.error("Save tax declaration error:", error);
    return next(
      new ErrorHandler(
        "Failed to save tax declaration",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};



