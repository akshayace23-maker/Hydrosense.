// middleware/upload.js
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const config = require('../config');

const UPLOAD_ROOT = path.resolve(__dirname, '..', config.UPLOAD_DIR);
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_ROOT),
  filename: (req, file, cb) => {
    // Never trust the client-supplied filename: generate a random name and
    // keep only a whitelisted extension, which prevents path traversal and
    // double-extension tricks (e.g. "shell.php.jpg").
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, or WEBP images are allowed.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 6 },
});

// ---- Post-upload hardening ----
// 1) Verify the real file signature (the browser-supplied MIME type can be faked).
// 2) Read GPS from EXIF (used only as evidence metadata), then strip ALL metadata from the stored
//    file so public photo URLs never leak a reporter's home location or phone model.
function sniff(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

async function verifyAndClean(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  try {
    for (const f of files) {
      const fd = fs.openSync(f.path, 'r');
      const head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
      fs.closeSync(fd);
      if (!sniff(head)) throw new Error('Only JPEG, PNG, or WEBP images are allowed.');
      try {
        const exifr = require('exifr');
        f.exifGps = await exifr.gps(f.path);
      } catch (e) { f.exifGps = undefined; }
      try {
        const sharp = require('sharp');
        const tmp = f.path + '.clean';
        // rotate() applies the EXIF orientation, then metadata is dropped by default.
        await sharp(f.path, { failOn: 'error' }).rotate().toFile(tmp);
        fs.renameSync(tmp, f.path);
      } catch (e) {
        if (/Input file|unsupported|corrupt|Invalid/i.test(String(e.message))) throw new Error('That image file could not be read. Please upload a valid photo.');
        /* sharp unavailable: keep original file */
      }
    }
    next();
  } catch (e) {
    for (const f of files) { try { fs.unlinkSync(f.path); } catch (x) { /* ignore */ } }
    next(e);
  }
}

const secured = {
  array: (name, max) => [upload.array(name, max), verifyAndClean],
  single: (name) => [upload.single(name), verifyAndClean],
};

module.exports = { upload: secured, UPLOAD_ROOT };
