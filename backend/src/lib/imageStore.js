/**
 * Image storage for receipts.
 *
 * If Cloudinary credentials are present in the environment, images are uploaded
 * there and a permanent CDN URL is returned (survives Render restarts/redeploys).
 * Otherwise it falls back to keeping the file on local disk under
 * backend/uploads/receipts/ — handy for local development with no Cloudinary
 * account.
 *
 * Required env vars for cloud storage:
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */
const fs = require('fs');
const path = require('path');

const RECEIPTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const cloudEnabled =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

let cloudinary = null;
if (cloudEnabled) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/**
 * Persist a local temp file. Returns a string to store in receipts.image_path:
 *  - a full https Cloudinary URL when cloud storage is enabled
 *  - a bare filename when falling back to local disk
 * The original temp file is removed once handled.
 */
async function storeImage(tempPath, originalName = 'receipt.jpg') {
  if (cloudEnabled) {
    const result = await cloudinary.uploader.upload(tempPath, {
      folder: 'finance-dashboard/receipts',
      resource_type: 'image',
    });
    fs.unlink(tempPath, () => {});
    return result.secure_url; // full https URL
  }
  // Local fallback: move the temp file into the receipts dir with a unique name.
  const ext = (originalName.split('.').pop() || 'jpg').toLowerCase();
  const filename = `receipt_${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`;
  const dest = path.join(RECEIPTS_DIR, filename);
  fs.renameSync(tempPath, dest);
  return filename; // bare filename, served via /api/receipts/image/:file
}

/**
 * Delete a stored image. Accepts either a Cloudinary URL or a local filename.
 */
async function deleteImage(imagePath) {
  if (!imagePath) return;
  if (/^https?:\/\//.test(imagePath)) {
    if (cloudEnabled) {
      // Derive the public_id from the URL: .../finance-dashboard/receipts/<id>.<ext>
      try {
        const m = imagePath.match(/finance-dashboard\/receipts\/([^./]+)/);
        if (m) await cloudinary.uploader.destroy(`finance-dashboard/receipts/${m[1]}`);
      } catch {
        /* ignore cleanup errors */
      }
    }
    return;
  }
  // Local file
  const full = path.join(RECEIPTS_DIR, path.basename(imagePath));
  if (fs.existsSync(full)) {
    try { fs.unlinkSync(full); } catch {}
  }
}

module.exports = { storeImage, deleteImage, cloudEnabled, RECEIPTS_DIR };