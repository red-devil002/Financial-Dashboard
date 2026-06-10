const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// List imports, optionally filtered by source ('statement' | 'general').
router.get('/', async (req, res) => {
  try {
    const { source } = req.query;
    let q = `
      SELECT i.*, c.name AS card_name
      FROM imports i
      LEFT JOIN cards c ON c.id = i.card_id
    `;
    const params = [];
    if (source) { q += ` WHERE i.source = $1`; params.push(source); }
    q += ` ORDER BY i.imported_at DESC`;
    const result = await pool.query(q, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log an import after transactions have been saved.
router.post('/', async (req, res) => {
  try {
    const { filename, file_type, source, card_id, row_count } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });
    const result = await pool.query(
      `INSERT INTO imports (filename, file_type, source, card_id, row_count)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [filename, file_type || null, source || 'general', card_id || null, row_count || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM imports WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;