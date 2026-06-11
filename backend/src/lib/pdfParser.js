/**
 * Generic bank-statement PDF parser (format-agnostic).
 *
 * Works across banks / credit cards without per-bank rules by recognising
 * dates and money amounts wherever they appear, then grouping the text in
 * between as the description.
 *
 * Handles two common layouts:
 *   1. Single-line:  <date> <description> <amount> <balance>
 *   2. Multi-line:   <date> <description...>            (amount on a later line)
 *                    <more description>
 *                    <amount> <balance>
 *
 * Accuracy is "good enough to review" — the user confirms/edits every row in
 * the review screen before saving.
 */

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const RE_DMY_TEXT = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})\b/;
const RE_DMY_NUM = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;
const RE_YMD = /\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/;

function pad(n) { return String(n).padStart(2, '0'); }
function fullYear(y) {
  y = parseInt(y, 10);
  if (y < 100) return y >= 70 ? 1900 + y : 2000 + y;
  return y;
}

function findDate(text) {
  let m;
  m = RE_YMD.exec(text);
  if (m) return { iso: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, index: m.index, length: m[0].length };

  m = RE_DMY_TEXT.exec(text);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return { iso: `${fullYear(m[3])}-${mon}-${pad(m[1])}`, index: m.index, length: m[0].length };
  }

  m = RE_DMY_NUM.exec(text);
  if (m) {
    const d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      return { iso: `${fullYear(m[3])}-${pad(mo)}-${pad(d)}`, index: m.index, length: m[0].length };
    }
  }
  return null;
}

// Matches money with OR without comma thousands separators:
//   1,234.56  ·  3000.00  ·  -45.20  ·  $99.99  ·  (12.34)  ·  50.00 DR
const RE_MONEY = /(\(?-?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?-?)(\s*(?:DR|CR|dr|cr))?/g;

function extractAmounts(text) {
  const out = [];
  let m;
  RE_MONEY.lastIndex = 0;
  while ((m = RE_MONEY.exec(text)) !== null) {
    const raw = m[1];
    const suffix = (m[2] || '').trim().toUpperCase();
    let negative = false;
    if (raw.includes('(') && raw.includes(')')) negative = true;
    if (raw.trimStart().startsWith('-')) negative = true;
    if (raw.trimEnd().endsWith('-')) negative = true;
    if (suffix === 'DR') negative = true;
    if (suffix === 'CR') negative = false;
    const num = parseFloat(raw.replace(/[(),$\s-]/g, ''));
    if (isNaN(num)) continue;
    out.push({ value: negative ? -num : num, index: m.index, length: m[0].length });
  }
  return out;
}

const NOISE = [
  /opening balance/i, /closing balance/i, /balance b\/?f/i, /balance c\/?f/i,
  /^total/i, /subtotal/i, /statement period/i, /page \d+ of \d+/i,
  /account (number|name|type)/i, /\bbsb\b/i, /date opened/i,
  /minimum payment/i, /payment due/i, /credit limit/i, /available (credit|balance)/i,
  /interest rate/i, /transaction summary/i, /kind regards/i, /^dear /i,
  /pending transactions/i, /proceeds of cheques/i, /commbank\.com/i,
  /the .*team\.?$/i, /not responsible for any reliance/i, /while this letter/i,
  /^date\b.*\bamount\b/i, /here.?s your account/i,
];
function isNoise(line) { return NOISE.some(re => re.test(line)); }

function isAmountOnlyLine(line) {
  const amounts = extractAmounts(line);
  if (amounts.length === 0) return false;
  let stripped = line.replace(RE_MONEY, ' ').replace(/\s+/g, ' ').trim();
  RE_MONEY.lastIndex = 0;
  return stripped.length <= 2;
}

function parseStatementText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 0 && !isNoise(l));

  const txns = [];
  let pending = null;

  function finalize(amounts) {
    if (!pending) return;
    let amount, balance = null;
    if (amounts.length >= 2) {
      const sorted = [...amounts].sort((a, b) => a.index - b.index);
      amount = sorted[sorted.length - 2].value;
      balance = sorted[sorted.length - 1].value;
    } else if (amounts.length === 1) {
      amount = amounts[0].value;
    } else {
      return;
    }
    pending.description = pending.description.replace(/\s+/g, ' ').trim() || '(no description)';
    txns.push({ date: pending.date, description: pending.description, amount, balance });
    pending = null;
  }

  for (const line of lines) {
    const date = findDate(line);
    const amounts = extractAmounts(line);

    if (date) {
      pending = null;
      const descStart = date.index + date.length;
      if (amounts.length > 0) {
        const firstAmt = amounts.reduce((a, b) => (a.index < b.index ? a : b));
        let description = line.slice(descStart, firstAmt.index);
        pending = { date: date.iso, description };
        finalize(amounts);
      } else {
        let description = line.slice(descStart);
        pending = { date: date.iso, description };
      }
    } else if (pending) {
      if (isAmountOnlyLine(line)) {
        finalize(amounts);
      } else if (amounts.length === 0) {
        pending.description += ' ' + line;
      } else {
        const firstAmt = amounts.reduce((a, b) => (a.index < b.index ? a : b));
        const extra = line.slice(0, firstAmt.index).trim();
        if (extra) pending.description += ' ' + extra;
        finalize(amounts);
      }
    }
  }

  // Flush a transaction still pending when the input ends. This rescues the
  // LAST row of a statement when its amount sat on the final line and no
  // further line arrived to trigger finalize() inside the loop.
  if (pending) {
    const amounts = extractAmounts(pending.description);
    if (amounts.length > 0) {
      // The amount is embedded in the description region — split it out.
      const firstAmt = amounts.reduce((a, b) => (a.index < b.index ? a : b));
      pending.description = pending.description.slice(0, firstAmt.index);
      finalize(amounts);
    } else {
      // No amount anywhere for this row; drop the empty pending.
      pending = null;
    }
  }

  return txns;
}

function toDashboardRows(txns) {
  return txns.map(t => {
    const amt = t.amount;
    let type = amt >= 0 ? 'income' : 'expense';
    const desc = (t.description || '').toLowerCase();
    if (/\btransfer\b|\btfr\b|\bbpay\b|to xx\d|from xx\d/.test(desc)) type = 'transfer';
    return {
      date: t.date,
      description: (t.description || '').trim(),
      amount: amt,
      category: 'Other',
      type,
      account: 'Personal everyday',
      source: '',
    };
  }).filter(r => r.date && !isNaN(r.amount));
}

module.exports = { parseStatementText, toDashboardRows, findDate, extractAmounts };