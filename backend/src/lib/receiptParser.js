/**
 * Receipt OCR + field extraction.
 *
 * Designed so the OCR engine can be swapped later (local Tesseract -> cloud API)
 * without changing callers: just replace the body of `ocrImage()`.
 *
 * Field extraction (amount / date / merchant) is heuristic and intentionally
 * forgiving — OCR output is messy, so the UI always shows a review step where
 * the user confirms or corrects the parsed values.
 */

const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

// ---- OCR engine (swappable) -------------------------------------------------
// To move to a cloud OCR provider later, replace the inside of this function
// with an API call that returns the recognized text as a string.
// Validation (format detection, HEIC conversion) happens upstream in
// receiptNormalizer.js, so anything reaching here is already an OCR-ready image.
async function ocrImage(imagePath) {
  // Fail fast (and clearly) if the language model hasn't been downloaded.
  const modelPath = path.join(__dirname, '..', '..', 'lang-data', 'eng.traineddata.gz');
  if (!fs.existsSync(modelPath)) {
    throw new Error('OCR model missing. Run "npm run ocr:setup" in the backend folder.');
  }

  // Tesseract's worker can emit an error event asynchronously (on nextTick),
  // which would otherwise crash the whole process. We race the recognize()
  // promise against a worker 'error' listener so that failure rejects this
  // promise cleanly instead of escaping.
  let worker;
  try {
    worker = await createWorker('eng', 1, {
      langPath: path.join(__dirname, '..', '..', 'lang-data'),
      gzip: true,
      cacheMethod: 'none',
    });
  } catch (e) {
    throw new Error('OCR engine failed to start');
  }

  try {
    const text = await new Promise((resolve, reject) => {
      let settled = false;
      // Catch async worker errors that would otherwise be uncaught.
      if (worker.worker && typeof worker.worker.on === 'function') {
        worker.worker.on('error', (err) => {
          if (!settled) { settled = true; reject(new Error('OCR failed to read the image')); }
        });
      }
      worker.recognize(imagePath)
        .then((res) => { if (!settled) { settled = true; resolve(res.data.text || ''); } })
        .catch(() => { if (!settled) { settled = true; reject(new Error('OCR failed to read the image')); } });
    });
    return text;
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}

// ---- Field extraction -------------------------------------------------------

// Find the most likely total amount. Prefer a line mentioning "total";
// otherwise fall back to the largest currency-looking number.
function extractAmount(text) {
  const lines = text.split(/\r?\n/);
  const moneyRe = /(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{2}))/g;

  // 1) A line containing "total" (but not "subtotal" / "total items")
  for (const line of lines) {
    if (/\btotal\b/i.test(line) && !/sub\s*total|total\s*items|item/i.test(line)) {
      const matches = line.match(moneyRe);
      if (matches && matches.length) return normalizeMoney(matches[matches.length - 1]);
    }
  }
  // 2) "amount due" / "balance" lines
  for (const line of lines) {
    if (/amount due|balance due|grand total|total due/i.test(line)) {
      const matches = line.match(moneyRe);
      if (matches && matches.length) return normalizeMoney(matches[matches.length - 1]);
    }
  }
  // 3) Fallback: the largest money figure anywhere
  let max = null;
  let m;
  moneyRe.lastIndex = 0;
  while ((m = moneyRe.exec(text)) !== null) {
    const v = normalizeMoney(m[1]);
    if (v != null && (max == null || v > max)) max = v;
  }
  return max;
}

function normalizeMoney(s) {
  if (!s) return null;
  // turn "1,234.50" or "1 234,50" into 1234.50
  let cleaned = s.replace(/\s/g, '');
  // if comma is the decimal separator (e.g. 14,50) and no dot present
  if (/^\d+,\d{2}$/.test(cleaned)) cleaned = cleaned.replace(',', '.');
  else cleaned = cleaned.replace(/,/g, '');
  const v = parseFloat(cleaned);
  return isNaN(v) ? null : Math.round(v * 100) / 100;
}

const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
function pad(n){ return String(n).padStart(2,'0'); }
function fullYear(y){ y=parseInt(y,10); return y<100 ? 2000+y : y; }

// Find a date in common receipt formats.
function extractDate(text) {
  let m;
  m = text.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);            // 2026-06-08
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);          // 08/06/2026 (day-first)
  if (m) { const d=+m[1], mo=+m[2]; if (d<=31&&mo<=12) return `${fullYear(m[3])}-${pad(mo)}-${pad(d)}`; }
  m = text.match(/\b(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{2,4})\b/);         // 8 Jun 2026
  if (m) { const mo=MONTHS[m[2].slice(0,3).toLowerCase()]; if (mo) return `${fullYear(m[3])}-${mo}-${pad(m[1])}`; }
  return null;
}

// Merchant: usually the first substantial text line near the top.
function extractMerchant(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    // skip lines that are mostly numbers/dates/addresses
    if (letters >= 3 && !/\d{2}[\/\-.]\d{2}/.test(line) && !/^\d/.test(line)) {
      return line.replace(/\s+/g, ' ').slice(0, 60);
    }
  }
  return lines[0] ? lines[0].slice(0, 60) : '';
}

async function parseReceipt(filePath) {
  const { normalizeReceipt } = require('./receiptNormalizer');

  // Turn whatever was uploaded into text: PDFs give text directly, images go
  // through OCR (HEIC is converted to JPG first). normalizeReceipt throws a
  // friendly error for unsupported files.
  const normalized = await normalizeReceipt(filePath);

  let text;
  let displayPath = null; // a browser-displayable image to store (null for PDF)
  if (normalized.kind === 'text') {
    text = normalized.text;
  } else {
    displayPath = normalized.path; // converted JPG for HEIC, else the image itself
    text = await ocrImage(displayPath);
  }

  return {
    raw_text: text,
    amount: extractAmount(text),
    date: extractDate(text),
    merchant: extractMerchant(text),
    display_path: displayPath, // the route stores this; null means no image (PDF)
  };
}

module.exports = { parseReceipt, ocrImage, extractAmount, extractDate, extractMerchant };