const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM goals ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, target_amount, current_amount, account, deadline } = req.body;
    if (!name || !target_amount || !account) {
      return res.status(400).json({ error: 'name, target_amount, account are required' });
    }
    const result = await pool.query(
      `INSERT INTO goals (name, target_amount, current_amount, account, deadline)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, target_amount, current_amount || 0, account, deadline || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, target_amount, current_amount, account, deadline } = req.body;
    const result = await pool.query(
      `UPDATE goals SET name=$1, target_amount=$2, current_amount=$3, account=$4, deadline=$5
       WHERE id=$6 RETURNING *`,
      [name, target_amount, current_amount, account, deadline || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM goals WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
