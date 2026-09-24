import { v2 as cloudinary } from "cloudinary";
import { config } from "#core/config.js";

/**
 * Product photo storage — same lazy, no-throw shape as mailer.js/sms.js/ai.js:
 * configured once from CLOUDINARY_* env vars, stays off and says so once when
 * absent (products just fall back to a category icon), never crashes a
 * request. Images always arrive as an in-memory Buffer (multer's memory
 * storage, see products.routes.js) — small product photos, no need to touch
 * disk.
 */
let configured = false;
let warned = false;

function ready() {
  if (configured) return true;
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    if (!warned) {
      warned = true;
      console.warn(
        "✦ Product photo upload is OFF — no CLOUDINARY_* configured.\n" +
          "  Get free credentials at cloudinary.com/console to turn it on."
      );
    }
    return false;
  }
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
  configured = true;
  return true;
}

export const imageUploadEnabled = () => ready();

/**
 * Uploads one image buffer, scoped under a per-business folder. Never
 * throws — callers check `.ok`. Returns the CDN url plus the public_id
 * (kept on the Product so a later replace/removal can clean the old asset up).
 */
export async function uploadImage(buffer, folder) {
  if (!ready()) return { ok: false, reason: "not_configured" };
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: "image", transformation: [{ width: 1000, height: 1000, crop: "limit" }] },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(buffer);
    });
    return { ok: true, url: result.secure_url, publicId: result.public_id };
  } catch (err) {
    console.error("✦ image upload failed:", err.message);
    return { ok: false, reason: err.message };
  }
}

/** Best-effort cleanup of a replaced/removed photo — never throws. */
export async function deleteImage(publicId) {
  if (!publicId || !ready()) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("✦ image delete failed:", err.message);
  }
}
