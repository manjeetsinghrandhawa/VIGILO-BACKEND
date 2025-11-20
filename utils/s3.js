import S3 from "aws-sdk/clients/s3.js";
import multer from "multer";

export const s3Uploadv2 = async (file) => {
  const s3 = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_BUCKET_REGION,
  });

  const param = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `uploads/${Date.now().toString()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  return await s3.upload(param).promise();
};

export const s3UploadMulti = async (files) => {
  const s3 = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_BUCKET_REGION,
  });

  const params = files.map((file) => ({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `uploads/${Date.now().toString()}-${file.originalname || "not"}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return await Promise.all(params.map((param) => s3.upload(param).promise()));
};

const allowedMimeTypes = [
  "image/jpeg", 
  "image/jpg",  
  "image/png",
  "image/gif",
  "image/webp",
];

// Multer storage & filter
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
 if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new multer.MulterError(
        "LIMIT_UNEXPECTED_FILE",
        `Only JPG, PNG, GIF, and WebP images are allowed`
      ), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 11006600, files: 5 },
});
