const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tax_settings ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0] || { abn_tax_rate: 28, gst_rate: 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { abn_tax_rate, gst_rate } = req.body;
    if (abn_tax_rate === undefined || gst_rate === undefined) {
      return res.status(400).json({ error: 'abn_tax_rate and gst_rate are required' });
    }
    const existing = await pool.query('SELECT id FROM tax_settings LIMIT 1');
    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        'UPDATE tax_settings SET abn_tax_rate=$1, gst_rate=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
        [abn_tax_rate, gst_rate, existing.rows[0].id]
      );
    } else {
      result = await pool.query(
        'INSERT INTO tax_settings (abn_tax_rate, gst_rate) VALUES ($1,$2) RETURNING *',
        [abn_tax_rate, gst_rate]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/estimate', async (req, res) => {
  try {
    const { from, to } = req.query;
    const settings = await pool.query('SELECT * FROM tax_settings LIMIT 1');
    const rates = settings.rows[0] || { abn_tax_rate: 28, gst_rate: 10 };

    const conditions = [];
    const params = [];
    let i = 1;
    if (from) { conditions.push(`date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`date <= $${i++}`); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const income = await pool.query(`
      SELECT
        SUM(CASE WHEN source='abn' AND type='income' THEN amount ELSE 0 END) AS abn_income,
        SUM(CASE WHEN source='tfn' AND type='income' THEN amount ELSE 0 END) AS tfn_income,
        SUM(CASE WHEN source='cash' AND type='income' THEN amount ELSE 0 END) AS cash_income
      FROM transactions ${where}
    `, params);

    const row = income.rows[0];
    const abnIncome = parseFloat(row.abn_income) || 0;
    const abnTaxRate = parseFloat(rates.abn_tax_rate) / 100;
    const gstRate = parseFloat(rates.gst_rate) / 100;

    res.json({
      abn_income: abnIncome,
      tfn_income: parseFloat(row.tfn_income) || 0,
      cash_income: parseFloat(row.cash_income) || 0,
      abn_tax_rate: parseFloat(rates.abn_tax_rate),
      gst_rate: parseFloat(rates.gst_rate),
      abn_tax_reserve: Math.round(abnIncome * abnTaxRate * 100) / 100,
      gst_collected_estimate: Math.round(abnIncome * gstRate * 100) / 100,
      abn_income_excl_gst: Math.round((abnIncome - abnIncome * gstRate) * 100) / 100,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
