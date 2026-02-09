import GuardProfile from "./guardProfile.model.js";
import { StatusCodes } from "http-status-codes";
import ErrorHandler from "../../utils/errorHandler.js";
import GuardBankDetails from "./guardBankDetails.model.js";
import GuardTaxDeclaration from "./taxDeclaration.model.js";
import GuardSuperNomination from "./superNomination.model.js";
import License from "./license.model.js";

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

export const getTaxDeclaration = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const taxDeclaration = await GuardTaxDeclaration.findOne({
      where: { userId },
    });

    if (!taxDeclaration) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Tax declaration not found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: taxDeclaration,
    });
  } catch (error) {
    console.error("Get tax declaration error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch tax declaration",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const saveSuperNomination = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [superNomination, created] =
      await GuardSuperNomination.findOrCreate({
        where: { userId },
        defaults: {
          userId,
          isVerified: true, // ✅ Continue clicked
        },
      });

    if (!created) {
      await superNomination.update({
        isVerified: true,
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Super nomination acknowledged successfully",
    });
  } catch (error) {
    console.error("Save super nomination error:", error);
    return next(
      new ErrorHandler(
        "Failed to save super nomination",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getSuperNominationContent = async (req, res, next) => {
  try {
    const htmlContent = `
      <h2>Solid Cad Security</h2>
      <h3>Superannuation Nomination</h3>

      <p>
        Superannuation is an important part of your employment benefits.
        By proceeding, you acknowledge that your employer will make
        superannuation contributions on your behalf.
      </p>

      <p>
        If you do not nominate a specific super fund, contributions may
        be paid into the company’s default superannuation fund in
        accordance with Australian law.
      </p>

      <p>
        You confirm that the information you have provided during your
        onboarding process is accurate and complete to the best of
        your knowledge.
      </p>

      <p>
        By clicking <strong>Continue</strong>, you acknowledge and accept
        the superannuation arrangements applicable to your employment.
      </p>
    `;

    res.status(StatusCodes.OK).json({
      success: true,
      html: htmlContent,
    });
  } catch (error) {
    console.error("Get super nomination content error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch super nomination content",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const getGuardOnboardingStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch all records in parallel
    const [
      profile,
      bankDetails,
      taxDeclaration,
      superNomination,
    ] = await Promise.all([
      GuardProfile.findOne({
        where: { userId },
        attributes: ["profileCompleted"],
      }),
      GuardBankDetails.findOne({
        where: { userId },
        attributes: ["isVerified"],
      }),
      GuardTaxDeclaration.findOne({
        where: { userId },
        attributes: ["isVerified"],
      }),
      GuardSuperNomination.findOne({
        where: { userId },
        attributes: ["isVerified"],
      }),
    ]);

    const response = {
      profileCompleted: !!profile?.profileCompleted,
      bankDetailsVerified: !!bankDetails?.isVerified,
      taxDeclarationVerified: !!taxDeclaration?.isVerified,
      superNominationVerified: !!superNomination?.isVerified,
    };

    // Optional: overall completion flag (VERY useful for UI)
    const allCompleted =
      response.profileCompleted &&
      response.bankDetailsVerified &&
      response.taxDeclarationVerified &&
      response.superNominationVerified;

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        ...response,
        allCompleted,
      },
    });
  } catch (error) {
    console.error("Get guard onboarding status error:", error);
    return next(
      new ErrorHandler(
        "Failed to fetch guard onboarding status",
        StatusCodes.INTERNAL_SERVER_ERROR
      )
    );
  }
};

export const createLicense = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    const {
      licenseName,
      expiryDate,
      renewalDate,
      images,
    } = req.body;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    if (!licenseName || !expiryDate || !renewalDate) {
      return next(
        new ErrorHandler(
          "License name, expiry date and renewal date are required",
          StatusCodes.BAD_REQUEST
        )
      );
    }

    // 🔎 Prevent duplicate license name per user
    const existingLicense = await License.findOne({
      where: {
        userId,
        licenseName,
      },
    });

    if (existingLicense) {
      return next(
        new ErrorHandler(
          "License with this name already exists",
          StatusCodes.CONFLICT
        )
      );
    }

    const license = await License.create({
      userId,
      licenseName,
      expiryDate: new Date(expiryDate),
      renewalDate: new Date(renewalDate),
      images,
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "License added successfully",
      data: license,
    });
  } catch (error) {
    console.error("Create License Error:", error);
    return next(error);
  }
};

export const getMyLicenses = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    const licenses = await License.findAll({
      where: { userId },
      attributes: [
        "id",
        "licenseName",
        "expiryDate",
        "renewalDate",
        "createdAt",
      ],
      order: [["expiryDate", "ASC"]],
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Licenses fetched successfully",
      data: licenses,
    });
  } catch (error) {
    console.error("Get My Licenses Error:", error);
    return next(error);
  }
};

export const getLicenseById = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { licenseId } = req.params;

    if (!userId) {
      return next(
        new ErrorHandler("Unauthorized access", StatusCodes.UNAUTHORIZED)
      );
    }

    if (!licenseId) {
      return next(
        new ErrorHandler("License ID is required", StatusCodes.BAD_REQUEST)
      );
    }

    const license = await License.findOne({
      where: {
        id: licenseId,
        userId, // 🔐 ensure guard can access only own license
      },
    });

    if (!license) {
      return next(
        new ErrorHandler("License not found", StatusCodes.NOT_FOUND)
      );
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "License details fetched successfully",
      data: license,
    });
  } catch (error) {
    console.error("Get License By ID Error:", error);
    return next(error);
  }
};









