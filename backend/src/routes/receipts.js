const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { parseReceipt } = require('../lib/receiptParser');

// Receipts are saved under backend/uploads/receipts/ and served back via /image/:file.
const RECEIPTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECEIPTS_DIR),
  filename: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase();
    cb(null, `receipt_${Date.now()}_${Math.round(Math.random()*1e6)}.${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are accepted'));
  },
});

// Upload + OCR. Saves the image, returns parsed fields for review (no transaction yet).
router.post('/scan', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    let parsed;
    try {
      parsed = await parseReceipt(req.file.path);
    } catch (e) {
      return res.status(500).json({ error: 'OCR failed: ' + e.message, image_file: path.basename(req.file.path) });
    }
    res.json({
      image_file: path.basename(req.file.path),
      merchant: parsed.merchant || '',
      amount: parsed.amount,
      date: parsed.date,
      raw_text: parsed.raw_text,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm: create a transaction and store the receipt record linked to it.
router.post('/confirm', async (req, res) => {
  const client = await pool.connect();
  try {
    const { image_file, merchant, amount, date, category, account, type, source } = req.body;
    if (!image_file) return res.status(400).json({ error: 'image_file is required' });
    const amt = parseFloat(amount);
    if (isNaN(amt)) return res.status(400).json({ error: 'A valid amount is required' });

    await client.query('BEGIN');
    const txType = type || 'expense';
    const signed = txType === 'expense' || txType === 'investment' ? -Math.abs(amt) : Math.abs(amt);
    const tx = await client.query(
      `INSERT INTO transactions (date, description, amount, category, type, account, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [date || new Date().toISOString().slice(0,10), merchant || 'Receipt', signed,
       category || 'Other', txType, account || 'Personal everyday', source || '']
    );
    const rec = await client.query(
      `INSERT INTO receipts (image_path, merchant, amount, receipt_date, transaction_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [image_file, merchant || null, Math.abs(amt), date || null, tx.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json({ transaction: tx.rows[0], receipt: rec.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// List all stored receipts (most recent first).
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, t.account, t.category
      FROM receipts r
      LEFT JOIN transactions t ON t.id = r.transaction_id
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve a receipt image file.
router.get('/image/:file', (req, res) => {
  // prevent path traversal — only allow a bare filename
  const file = path.basename(req.params.file);
  const full = path.join(RECEIPTS_DIR, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Image not found' });
  res.sendFile(full);
});

// Delete a receipt (and its image). Leaves the transaction intact.
router.delete('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT image_path FROM receipts WHERE id=$1', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const img = path.join(RECEIPTS_DIR, path.basename(r.rows[0].image_path));
    if (fs.existsSync(img)) { try { fs.unlinkSync(img); } catch {} }
    await pool.query('DELETE FROM receipts WHERE id=$1', [req.params.id]);
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;