/**
 * Normalizes an uploaded receipt file into text the parser can use.
 *
 * Handles, in order:
 *   - PDF                       -> extract embedded text directly (no OCR needed)
 *   - HEIC / HEIF (iPhone)      -> convert to JPG, then OCR
 *   - JPG/PNG/GIF/BMP/WEBP/TIFF -> OCR as-is
 *   - anything else             -> rejected with a friendly error
 *
 * Returns { kind: 'text', text } for PDFs, or { kind: 'image', path } for
 * images (path points at an OCR-ready file). The caller runs OCR on images.
 */
const fs = require('fs');
const path = require('path');

// Inspect the first bytes to identify the real file type (don't trust extension).
function sniff(filePath) {
  let fd;
  try {
    const buf = Buffer.alloc(16);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 16, 0);
    const hex = buf.toString('hex');
    const ascii = buf.toString('latin1');

    if (ascii.startsWith('%PDF')) return 'pdf';
    if (hex.startsWith('ffd8ff')) return 'jpg';
    if (hex.startsWith('89504e47')) return 'png';
    if (ascii.startsWith('GIF8')) return 'gif';
    if (ascii.startsWith('BM')) return 'bmp';
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
    if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) return 'tiff';
    // HEIC/HEIF: ISO-BMFF box "ftyp" at bytes 4-8, brand at 8-12
    if (ascii.slice(4, 8) === 'ftyp') {
      const brand = ascii.slice(8, 12).toLowerCase();
      // Known HEIC/HEIF brands; treat the whole family as heic for conversion.
      const heicBrands = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'];
      if (heicBrands.includes(brand) || brand.startsWith('he') || brand.startsWith('mif') || brand.startsWith('msf')) {
        return 'heic';
      }
      // Some iPhone exports use 'qt  ' or other brands — if it's an ftyp box but
      // not a recognized image brand, still attempt heic conversion as a last
      // resort rather than rejecting outright.
      return 'heic';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

const OCR_READY = ['jpg', 'png', 'gif', 'bmp', 'webp', 'tiff'];

/**
 * @returns {Promise<{kind:'text', text:string} | {kind:'image', path:string}>}
 * For images, `path` may differ from the input (e.g. a converted HEIC).
 */
async function normalizeReceipt(filePath) {
  const kind = sniff(filePath);

  if (kind === 'pdf') {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(fs.readFileSync(filePath));
    return { kind: 'text', text: data.text || '' };
  }

  if (kind === 'heic') {
    try {
      const heicConvert = require('heic-convert');
      const inputBuffer = fs.readFileSync(filePath);
      const jpgBuffer = await heicConvert({ buffer: inputBuffer, format: 'JPEG', quality: 0.92 });
      const outPath = filePath + '.jpg';
      fs.writeFileSync(outPath, jpgBuffer);
      return { kind: 'image', path: outPath };
    } catch (e) {
      throw new Error('Could not convert this iPhone (HEIC) photo. Try exporting it as JPG, or change your iPhone camera setting to "Most Compatible".');
    }
  }

  if (OCR_READY.includes(kind)) {
    // Ensure a sane extension so OCR can detect the format.
    if (!path.extname(filePath)) {
      const outPath = filePath + '.' + (kind === 'jpg' ? 'jpg' : kind);
      fs.renameSync(filePath, outPath);
      return { kind: 'image', path: outPath };
    }
    return { kind: 'image', path: filePath };
  }

  throw new Error('Unsupported file. Upload a photo (JPG, PNG, HEIC) or a PDF receipt.');
}

module.exports = { normalizeReceipt, sniff };