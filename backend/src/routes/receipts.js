const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseReceipt } = require('../lib/receiptParser');
const { storeImage, deleteImage, RECEIPTS_DIR } = require('../lib/imageStore');

// Accept any file; the normalizer decides what's readable (images incl. HEIC, PDFs).
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// Best-effort temp file cleanup.
function cleanup(...paths) {
  for (const p of paths) { if (p) { try { fs.unlinkSync(p); } catch {} } }
}

// Signed amount helper.
function signedAmount(amount, type) {
  const amt = Math.abs(parseFloat(amount));
  return type === 'expense' || type === 'investment' ? -amt : amt;
}

// --- Scan: upload + OCR, persist the image, return parsed fields for review. ---
// Does NOT save anything to the DB yet — the client reviews, then calls /save.
router.post('/scan', upload.single('file'), async (req, res) => {
  const tempPath = req.file ? req.file.path : null;
  let parsed = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      parsed = await parseReceipt(req.file.path);
    } catch (e) {
      cleanup(tempPath, parsed && parsed.display_path);
      return res.status(422).json({ error: e.message || 'Could not read that file. Try a clearer photo or a PDF.' });
    }

    let image_ref = '';
    if (parsed.display_path) {
      image_ref = await storeImage(parsed.display_path, path.basename(parsed.display_path));
    }
    if (tempPath && tempPath !== parsed.display_path) { fs.unlink(tempPath, () => {}); }

    res.json({
      image_file: image_ref,
      merchant: parsed.merchant || '',
      amount: parsed.amount,
      date: parsed.date,
      raw_text: parsed.raw_text,
    });
  } catch (err) {
    cleanup(tempPath, parsed && parsed.display_path);
    res.status(500).json({ error: err.message });
  }
});

// --- Save a receipt (image + fields) WITHOUT creating a transaction. ---
router.post('/save', async (req, res) => {
  try {
    const { image_file, merchant, amount, date, category, account, type } = req.body;
    const amt = parseFloat(amount);
    const rec = await pool.query(
      `INSERT INTO receipts (image_path, merchant, amount, receipt_date, category, account, type)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [image_file || null, merchant || null, isNaN(amt) ? null : Math.abs(amt),
       date || null, category || 'Other', account || 'Personal everyday', type || 'expense']
    );
    res.status(201).json(rec.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Edit a saved receipt's fields. If it already has a transaction, keep it in sync. ---
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { merchant, amount, date, category, account, type } = req.body;
    const amt = parseFloat(amount);
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM receipts WHERE id=$1', [req.params.id]);
    if (cur.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

    const rec = await client.query(
      `UPDATE receipts SET merchant=$1, amount=$2, receipt_date=$3, category=$4, account=$5, type=$6
       WHERE id=$7 RETURNING *`,
      [merchant || null, isNaN(amt) ? null : Math.abs(amt), date || null,
       category || 'Other', account || 'Personal everyday', type || 'expense', req.params.id]
    );

    // Keep the linked transaction in sync if one exists.
    const txId = cur.rows[0].transaction_id;
    if (txId) {
      await client.query(
        `UPDATE transactions SET date=$1, description=$2, amount=$3, category=$4, account=$5, type=$6
         WHERE id=$7`,
        [date || new Date().toISOString().slice(0, 10), merchant || 'Receipt',
         signedAmount(amt, type || 'expense'), category || 'Other',
         account || 'Personal everyday', type || 'expense', txId]
      );
    }
    await client.query('COMMIT');
    res.json(rec.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Tick the box: create a transaction from this receipt and link it. ---
router.post('/:id/transaction', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM receipts WHERE id=$1', [req.params.id]);
    if (cur.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const r = cur.rows[0];
    if (r.transaction_id) {
      // Already linked — nothing to do.
      await client.query('ROLLBACK');
      return res.json({ receipt: r, transaction_id: r.transaction_id, already: true });
    }
    const amt = parseFloat(r.amount);
    if (isNaN(amt)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Add an amount before adding to the dashboard.' }); }

    const tx = await client.query(
      `INSERT INTO transactions (date, description, amount, category, type, account, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [r.receipt_date || new Date().toISOString().slice(0, 10), r.merchant || 'Receipt',
       signedAmount(amt, r.type || 'expense'), r.category || 'Other',
       r.type || 'expense', r.account || 'Personal everyday', '']
    );
    await client.query('UPDATE receipts SET transaction_id=$1 WHERE id=$2', [tx.rows[0].id, r.id]);
    await client.query('COMMIT');
    res.status(201).json({ transaction: tx.rows[0], transaction_id: tx.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- Untick the box: delete the linked transaction, keep the receipt. ---
router.delete('/:id/transaction', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT transaction_id FROM receipts WHERE id=$1', [req.params.id]);
    if (cur.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    const txId = cur.rows[0].transaction_id;
    if (txId) {
      await client.query('UPDATE receipts SET transaction_id=NULL WHERE id=$1', [req.params.id]);
      await client.query('DELETE FROM transactions WHERE id=$1', [txId]);
    }
    await client.query('COMMIT');
    res.json({ unlinked: true, id: parseInt(req.params.id) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// --- List all saved receipts (most recent first). ---
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, (r.transaction_id IS NOT NULL) AS on_dashboard
      FROM receipts r
      ORDER BY r.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Serve a locally-stored receipt image (Cloudinary URLs bypass this). ---
router.get('/image/:file', (req, res) => {
  const file = path.basename(req.params.file);
  const full = path.join(RECEIPTS_DIR, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Image not found' });
  res.sendFile(full);
});

// --- Delete a receipt (image + its transaction, if any). ---
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query('SELECT image_path, transaction_id FROM receipts WHERE id=$1', [req.params.id]);
    if (r.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
    if (r.rows[0].transaction_id) {
      await client.query('DELETE FROM transactions WHERE id=$1', [r.rows[0].transaction_id]);
    }
    await client.query('DELETE FROM receipts WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    await deleteImage(r.rows[0].image_path);
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;