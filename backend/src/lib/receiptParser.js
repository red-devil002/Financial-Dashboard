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

const path = require('path');
const { createWorker } = require('tesseract.js');

// ---- OCR engine (swappable) -------------------------------------------------
// To move to a cloud OCR provider later, replace the inside of this function
// with an API call that returns the recognized text as a string.
async function ocrImage(imagePath) {
  const worker = await createWorker('eng', 1, {
    langPath: path.join(__dirname, '..', '..', 'lang-data'),
    gzip: true,
    cacheMethod: 'none',
  });
  try {
    const { data } = await worker.recognize(imagePath);
    return data.text || '';
  } finally {
    await worker.terminate();
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

async function parseReceipt(imagePath) {
  const text = await ocrImage(imagePath);
  return {
    raw_text: text,
    amount: extractAmount(text),
    date: extractDate(text),
    merchant: extractMerchant(text),
  };
}

module.exports = { parseReceipt, ocrImage, extractAmount, extractDate, extractMerchant };