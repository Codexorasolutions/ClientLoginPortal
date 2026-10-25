import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// uploads an in-memory file buffer (from multer) straight to Cloudinary
export const uploadBufferToCloudinary = (fileBuffer, mimetype, folder = 'codexora-portal', options = {}) => {
  const base64 = `data:${mimetype};base64,${fileBuffer.toString('base64')}`;
  return cloudinary.uploader.upload(base64, { folder, resource_type: 'auto', ...options });
};

// best effort: removing an old picture must never fail the request that replaced it
export const destroyCloudinaryImage = async (publicId) => {
  if (!publicId) return;
  try { await cloudinary.uploader.destroy(publicId, { resource_type: 'image' }); } catch (e) { console.error('[cloudinary] could not delete', publicId, e.message); }
};

export default cloudinary;
