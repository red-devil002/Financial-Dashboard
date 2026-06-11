const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { deleteImage } = require('../lib/imageStore');

/**
 * Selective data reset.
 *
 * POST /api/admin/reset
 * Body: { scopes: ['transactions', 'receipts', 'imports', 'cards', 'goals',
 *                   'categories', 'rules', 'tax'] }
 *
 * Only the requested scopes are cleared. Order matters because of foreign keys:
 * receipts and the imports/category data reference transactions, so children are
 * removed before parents. Cloudinary images for deleted receipts are cleaned up.
 */
const VALID = ['transactions', 'receipts', 'imports', 'cards', 'goals', 'categories', 'rules', 'tax'];

router.post('/reset', async (req, res) => {
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((s) => VALID.includes(s)) : [];
  if (scopes.length === 0) {
    return res.status(400).json({ error: 'Pick at least one type of data to clear.' });
  }
  const has = (s) => scopes.includes(s);
  const client = await pool.connect();
  const cleared = {};
  try {
    // Collect receipt images to delete from cloud storage AFTER the DB commit.
    let receiptImages = [];
    if (has('receipts')) {
      const imgs = await client.query(`SELECT image_path FROM receipts WHERE image_path IS NOT NULL`);
      receiptImages = imgs.rows.map((r) => r.image_path);
    }

    await client.query('BEGIN');

    // Children / linking tables first.
    if (has('receipts')) {
      cleared.receipts = (await client.query('DELETE FROM receipts')).rowCount;
    } else if (has('transactions')) {
      // If we're deleting transactions but keeping receipts, detach the link so
      // we don't violate the FK and so receipts simply drop off the dashboard.
      await client.query('UPDATE receipts SET transaction_id = NULL WHERE transaction_id IS NOT NULL');
    }

    if (has('imports')) {
      cleared.imports = (await client.query('DELETE FROM imports')).rowCount;
    }

    if (has('transactions')) {
      cleared.transactions = (await client.query('DELETE FROM transactions')).rowCount;
    }

    if (has('cards')) {
      cleared.cards = (await client.query('DELETE FROM cards')).rowCount;
    }

    if (has('goals')) {
      cleared.goals = (await client.query('DELETE FROM goals')).rowCount;
    }

    if (has('rules')) {
      cleared.rules = (await client.query('DELETE FROM category_rules')).rowCount;
    }

    if (has('categories')) {
      cleared.categories = (await client.query('DELETE FROM categories')).rowCount;
    }

    if (has('tax')) {
      // Reset tax settings to defaults rather than leaving the table empty.
      await client.query('DELETE FROM tax_settings');
      await client.query('INSERT INTO tax_settings (abn_tax_rate, gst_rate) VALUES (28.00, 10.00)');
      cleared.tax = 'reset to defaults';
    }

    await client.query('COMMIT');

    // Best-effort cloud image cleanup (outside the transaction).
    if (receiptImages.length) {
      await Promise.allSettled(receiptImages.map((p) => deleteImage(p)));
    }

    res.json({ ok: true, cleared });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;