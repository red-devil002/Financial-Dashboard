/**
 * Credit-card statement parser (dedicated, multi-issuer).
 *
 * Credit-card statements differ from bank statements in three ways that broke
 * the generic parser:
 *   1. Summary pages list credit limit / minimum payment / available credit /
 *      closing balance — all look like transactions.
 *   2. Purchases (debits) are shown as POSITIVE numbers, but for a credit card
 *      they are money owed → should be stored as negative (expense).
 *   3. PDF text extraction often strips spaces ("Creditlimit", "AppleR180...").
 *
 * Strategy: scope parsing to the real transaction section (between a start
 * marker like "Your transactions" / "Date ... Description" and an end marker
 * like "Closing balance" / "Total"). Inside that window, every line with a
 * date + amount is a transaction. Debits become negative expenses; lines that
 * look like payments/refunds/credits become positive.
 *
 * Works across issuers because it keys off statement *structure*, not one bank.
 */

const RE_DATE_NUM = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;            // 11/03/2026
const RE_DATE_TEXT = /(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{2,4})/;          // 11 Mar 2026 / 11Mar2026
const RE_AMOUNT = /(-?\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})(\s*(?:DR|CR|dr|cr))?/g;

const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };

// Quick check: does a line contain at least one money amount? Used to tell a
// real transaction row apart from a footer/summary line.
function extractAmountsCard(line) {
  const out = [];
  let m; RE_AMOUNT.lastIndex = 0;
  while ((m = RE_AMOUNT.exec(line)) !== null) {
    const num = parseFloat(m[1].replace(/[$,\s]/g, ''));
    if (!isNaN(num)) out.push(num);
  }
  return out;
}

function pad(n){ return String(n).padStart(2,'0'); }
function fullYear(y){ y=parseInt(y,10); return y<100 ? (y>=70?1900+y:2000+y) : y; }

/**
 * PDF text extraction often strips spaces, gluing words: "AppleR180ChadstoneVic".
 * Re-insert spaces at sensible boundaries so descriptions are readable.
 * This is best-effort cosmetic cleanup — the user can edit in review.
 */
function reSpace(s) {
  if (!s) return s;
  // If the string already has spaces, assume it's fine.
  if (/\s/.test(s.trim())) return s.replace(/\s+/g, ' ').trim();
  return s
    .replace(/([a-z])([A-Z])/g, '$1 $2')      // camelCase: AppleR -> Apple R
    .replace(/([A-Za-z])(\d)/g, '$1 $2')       // letter→digit: R180 stays, Warehouse3446 -> Warehouse 3446
    .replace(/(\d)([A-Z])/g, '$1 $2')          // digit→Caps: 180Chadstone -> 180 Chadstone
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(text) {
  let m = RE_DATE_NUM.exec(text);
  if (m) {
    const d=parseInt(m[1],10), mo=parseInt(m[2],10);
    if (d>=1&&d<=31&&mo>=1&&mo<=12) return { iso:`${fullYear(m[3])}-${pad(mo)}-${pad(d)}`, index:m.index, length:m[0].length };
  }
  m = RE_DATE_TEXT.exec(text);
  if (m) {
    const mon = MONTHS[m[2].slice(0,3).toLowerCase()];
    if (mon) return { iso:`${fullYear(m[3])}-${mon}-${pad(m[1])}`, index:m.index, length:m[0].length };
  }
  return null;
}

// Section boundary detection (space-insensitive matching done by caller).
const START_MARKERS = [
  /yourtransactions/i,
  /transactionsthisstatement/i,
  /transactiondetails/i,
  /datecard.*description/i,
  /datedescription/i,
  /datetransactiondetails/i,
];
const END_MARKERS = [
  /closingbalance/i,
  /^total\b/i,
  /annualpercentage/i,
  /pleasereviewyourtransactions/i,
  /interestcharged/i,
  /^subtotal/i,
];

// Lines to skip even inside the section (header row, opening balance, etc.)
const SKIP_INSIDE = [
  /^datecard/i, /^datedescription/i, /^datetransaction/i,
  /openingbalance/i, /^date.*description.*debit/i,
];

const PAYMENT_HINT = /payment|refund|credit|reversal|cashback|rebate|repaid|thankyou/i;

/**
 * Parse a credit-card statement's raw PDF text.
 * Returns rows: { date, description, amount (signed), raw }.
 *   - debits (purchases) -> negative
 *   - payments/credits   -> positive
 */
function parseCardStatement(rawText) {
  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // collapsed (space-stripped) version for marker matching
  const collapsed = rawLines.map(l => l.replace(/\s+/g, ''));

  // Find the transaction window. If no markers found, fall back to whole doc.
  // A line that is itself a transaction (has a date AND an amount) must never be
  // treated as the end boundary — otherwise a real line item whose text happens
  // to match an end marker (e.g. "Interest Charged At 28.99% $98.26") would be
  // dropped along with everything after it.
  let startIdx = -1, endIdx = rawLines.length;
  for (let i = 0; i < collapsed.length; i++) {
    if (startIdx === -1 && START_MARKERS.some(re => re.test(collapsed[i]))) { startIdx = i + 1; continue; }
    if (startIdx !== -1 && END_MARKERS.some(re => re.test(collapsed[i]))) {
      const looksLikeTxn = parseDate(rawLines[i]) && extractAmountsCard(rawLines[i]).length > 0;
      if (looksLikeTxn) continue; // real transaction, not the footer — keep scanning
      endIdx = i;
      break;
    }
  }
  const useStart = startIdx === -1 ? 0 : startIdx;
  const window = rawLines.slice(useStart, endIdx);

  const txns = [];
  for (const line of window) {
    const collapsedLine = line.replace(/\s+/g, '');
    if (SKIP_INSIDE.some(re => re.test(collapsedLine))) continue;

    const date = parseDate(line);
    if (!date) continue;

    // collect amounts
    const amounts = [];
    let m; RE_AMOUNT.lastIndex = 0;
    while ((m = RE_AMOUNT.exec(line)) !== null) {
      const suffix = (m[2]||'').trim().toUpperCase();
      const num = parseFloat(m[1].replace(/[$,\s]/g,''));
      if (!isNaN(num)) amounts.push({ num, index:m.index, suffix, neg: m[1].includes('-') });
    }
    if (amounts.length === 0) continue;

    // The transaction amount is the last money figure on the line
    // (statements may show a running balance, but most card lines have one).
    const amtObj = amounts[amounts.length - 1];

    // description = text between the date and the first amount,
    // with a leading card-number token (e.g. "1778") stripped off.
    let description = line.slice(date.index + date.length, amounts[0].index).trim();
    // Strip a leading card-identifier token whether space-separated or glued:
    description = description.replace(/^\s*[xX*]{2,}\d{2,4}\s*/, ''); // "xx1778" / "**1778"
    description = description.replace(/^\s*\d{4}(?=[A-Za-z])/, '');    // glued "1778Apple..."
    description = description.replace(/^\s*\d{4}\s+/, '');             // spaced "1778 Apple..."
    description = reSpace(description) || '(no description)';

    // Sign: default debit (expense, negative). Flip to positive if it reads as a payment/credit.
    let signed;
    if (amtObj.suffix === 'CR' || PAYMENT_HINT.test(collapsedLine)) signed = Math.abs(amtObj.num);
    else if (amtObj.suffix === 'DR') signed = -Math.abs(amtObj.num);
    else signed = -Math.abs(amtObj.num); // credit-card default: charge

    txns.push({ date: date.iso, description, amount: signed, raw: line });
  }

  return txns;
}

/**
 * Shape rows for the dashboard. account/card_id are applied by the caller
 * (so every row lands on the chosen card). type derived from sign.
 */
function toCardRows(txns, { account = 'Credit card', card_id = null } = {}) {
  return txns.map(t => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    category: 'Other',
    type: t.amount >= 0 ? 'income' : 'expense',  // payment vs charge
    account,
    source: '',
    card_id,
  })).filter(r => r.date && !isNaN(r.amount));
}

module.exports = { parseCardStatement, toCardRows, parseDate };