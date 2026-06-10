const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { parseCardStatement, toCardRows } = require('../lib/cardStatementParser');

const upload = multer({ dest: 'uploads/' });

const PALETTE = ['#D4537E','#7F77DD','#378ADD','#1D9E75','#BA7517','#D85A30','#639922','#185FA5'];

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cards ORDER BY created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-card summary: charged, paid, balance, transaction count.
router.get('/summary', async (req, res) => {
  try {
    const cards = await pool.query('SELECT * FROM cards ORDER BY created_at ASC');
    const out = [];
    for (const card of cards.rows) {
      const agg = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN account='Credit card' AND type='expense' THEN ABS(amount) ELSE 0 END),0) AS charged,
          COALESCE(SUM(CASE WHEN category='Credit card payment' OR (account='Credit card' AND type='income') THEN ABS(amount) ELSE 0 END),0) AS paid,
          COUNT(*) FILTER (WHERE account='Credit card' AND type='expense') AS tx_count
        FROM transactions WHERE card_id=$1
      `, [card.id]);
      const a = agg.rows[0];
      const charged = parseFloat(a.charged) || 0;
      const paid = parseFloat(a.paid) || 0;
      out.push({
        ...card,
        charged,
        paid,
        balance: charged - paid,
        tx_count: parseInt(a.tx_count) || 0,
      });
    }
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upcoming repayments: combines per-card monthly due dates and per-transaction
// repayment dates into one chronological list.
router.get('/repayments', async (req, res) => {
  try {
    const today = new Date();
    const items = [];

    // 1. Per-transaction repayment dates (e.g. BNPL like StepPay/Afterpay).
    const txn = await pool.query(`
      SELECT t.id, t.description, t.amount, t.repayment_date, t.card_id, c.name AS card_name
      FROM transactions t
      LEFT JOIN cards c ON c.id = t.card_id
      WHERE t.repayment_date IS NOT NULL
      ORDER BY t.repayment_date ASC
    `);
    for (const r of txn.rows) {
      items.push({
        kind: 'transaction',
        label: r.description,
        card_name: r.card_name || null,
        amount: Math.abs(parseFloat(r.amount)) || 0,
        due_date: r.repayment_date,
        transaction_id: r.id,
      });
    }

    // 2. Per-card monthly statement due dates → next occurrence from today.
    const cards = await pool.query('SELECT * FROM cards WHERE due_day IS NOT NULL');
    for (const card of cards.rows) {
      const dueDay = card.due_day;
      let year = today.getFullYear();
      let month = today.getMonth(); // 0-indexed
      // If this month's due day already passed, roll to next month.
      if (today.getDate() > dueDay) month += 1;
      const nextDue = new Date(year, month, Math.min(dueDay, 28));
      const iso = `${nextDue.getFullYear()}-${String(nextDue.getMonth()+1).padStart(2,'0')}-${String(nextDue.getDate()).padStart(2,'0')}`;

      // Current outstanding balance on the card (charges minus payments).
      const agg = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN account='Credit card' AND type='expense' THEN ABS(amount) ELSE 0 END),0)
          - COALESCE(SUM(CASE WHEN category='Credit card payment' OR (account='Credit card' AND type='income') THEN ABS(amount) ELSE 0 END),0) AS balance
        FROM transactions WHERE card_id=$1
      `, [card.id]);
      const balance = parseFloat(agg.rows[0].balance) || 0;

      items.push({
        kind: 'card',
        label: `${card.name} statement`,
        card_name: card.name,
        amount: balance > 0 ? balance : 0,
        due_date: iso,
        card_id: card.id,
        due_day: dueDay,
      });
    }

    items.sort((a, b) => a.due_date.localeCompare(b.due_date));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, last4, credit_limit, due_day, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const countRes = await pool.query('SELECT COUNT(*) FROM cards');
    const idx = parseInt(countRes.rows[0].count) || 0;
    const chosenColor = color || PALETTE[idx % PALETTE.length];
    const result = await pool.query(
      `INSERT INTO cards (name, last4, credit_limit, due_day, color)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, last4 || null, credit_limit || null, due_day || null, chosenColor]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, last4, credit_limit, due_day, color } = req.body;
    const result = await pool.query(
      `UPDATE cards SET name=$1, last4=$2, credit_limit=$3, due_day=$4, color=$5
       WHERE id=$6 RETURNING *`,
      [name, last4 || null, credit_limit || null, due_day || null, color || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM cards WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parse a credit-card statement PDF for a specific card and return a preview.
router.post('/:id/import-statement', upload.single('file'), async (req, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const cardRes = await pool.query('SELECT * FROM cards WHERE id=$1', [cardId]);
    if (cardRes.rows.length === 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Card not found' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (ext !== 'pdf') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Card statement import expects a PDF.' });
    }

    let pdfData;
    try {
      pdfData = await pdfParse(fs.readFileSync(req.file.path));
    } catch (e) {
      fs.unlinkSync(req.file.path);
      return res.status(422).json({ error: 'Could not read this PDF. It may be scanned or corrupted.' });
    }
    fs.unlinkSync(req.file.path);

    if (!pdfData.text || !pdfData.text.trim()) {
      return res.status(422).json({ error: 'No selectable text found (statement may be a scanned image).' });
    }

    const txns = parseCardStatement(pdfData.text);
    const rows = toCardRows(txns, { account: 'Credit card', card_id: cardId });
    res.json({ preview: rows, count: rows.length, card: cardRes.rows[0] });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch {} }
    res.status(500).json({ error: err.message });
  }
});

// Record a payment toward a card: an expense on a cash account, category
// 'Credit card payment', linked to the card. Shows in the main dashboard and
// reduces the card's balance.
router.post('/:id/pay', async (req, res) => {
  try {
    const cardId = parseInt(req.params.id);
    const { amount, date, account } = req.body;
    const amt = Math.abs(parseFloat(amount));
    if (!amt || isNaN(amt)) return res.status(400).json({ error: 'A positive amount is required' });
    const cardRes = await pool.query('SELECT * FROM cards WHERE id=$1', [cardId]);
    if (cardRes.rows.length === 0) return res.status(404).json({ error: 'Card not found' });
    const card = cardRes.rows[0];
    const payDate = date || new Date().toISOString().slice(0, 10);
    const fromAccount = account || 'Personal everyday';
    const result = await pool.query(
      `INSERT INTO transactions (date, description, amount, category, type, account, source, card_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [payDate, `Payment to ${card.name}`, -amt, 'Credit card payment', 'expense', fromAccount, '', cardId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;