import multer from 'multer';

// keeps the file in memory as a buffer — we push it straight to Cloudinary,
// never write it to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export default upload;
