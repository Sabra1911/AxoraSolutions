const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { badRequest } = require('../core/errors');

const UPLOAD_ROOT = path.resolve(env.upload.dir);
const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Verifica la firma (magic bytes) para no confiar solo en el MIME declarado por el cliente. */
function matchesSignature(buf, mime) {
  if (mime === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  if (mime === 'application/pdf') return buf.slice(0, 5).toString() === '%PDF-';
  return false;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_ROOT, String(new Date().getFullYear()));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    // el nombre en disco es aleatorio: nunca se usa el nombre enviado por el usuario
    cb(null, `${crypto.randomUUID()}${ALLOWED[file.mimetype]}`);
  },
});

const uploader = multer({
  storage,
  limits: { fileSize: env.upload.maxFileBytes, files: env.upload.maxFiles },
  fileFilter(req, file, cb) {
    if (!ALLOWED[file.mimetype]) return cb(badRequest('Tipo de archivo no permitido. Use JPG, PNG, WEBP o PDF.'));
    cb(null, true);
  },
});

const uploadMany = uploader.array('archivos', env.upload.maxFiles);
const uploadSingle = uploader.single('fotografia');

function verifyFiles(files) {
  for (const f of files) {
    const fd = fs.openSync(f.path, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (!matchesSignature(buf, f.mimetype)) {
      files.forEach((x) => fs.unlink(x.path, () => {}));
      throw badRequest(`El archivo "${f.originalname}" no coincide con su tipo declarado`);
    }
  }
}

const safeName = (n) => String(n || 'archivo').replace(/[\\/\x00-\x1f"<>|?*]/g, '_').slice(0, 200);

module.exports = { uploadMany, uploadSingle, verifyFiles, matchesSignature, safeName, UPLOAD_ROOT, ALLOWED };
