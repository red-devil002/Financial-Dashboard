const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts ORDER BY type, name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/balances', async (req, res) => {
  try {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;
    if (from) { conditions.push(`date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`date <= $${i++}`); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
      SELECT account, SUM(amount) AS balance,
        SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS total_in,
        SUM(CASE WHEN type='expense' THEN ABS(amount) ELSE 0 END) AS total_out,
        COUNT(*) AS tx_count
      FROM transactions ${where}
      GROUP BY account ORDER BY account
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Net worth over time: cumulative balance per account by month, plus total.
router.get('/networth', async (req, res) => {
  try {
    // Monthly net change per account (income/transfer-in positive, expense/transfer-out negative).
    // We use the signed amount directly since transfers already carry the right sign.
    const rows = (await pool.query(`
      SELECT TO_CHAR(date, 'YYYY-MM') AS month, account, SUM(amount) AS net
      FROM transactions
      GROUP BY month, account
      ORDER BY month ASC
    `)).rows;

    const months = [...new Set(rows.map(r => r.month))].sort();
    const accounts = [...new Set(rows.map(r => r.account))];

    // Build cumulative running balance per account across months.
    const running = {};
    accounts.forEach(a => running[a] = 0);
    const series = {}; // account -> [{month, balance}]
    accounts.forEach(a => series[a] = []);
    const totalSeries = [];

    for (const m of months) {
      let monthTotal = 0;
      for (const a of accounts) {
        const cell = rows.find(r => r.month === m && r.account === a);
        running[a] += cell ? parseFloat(cell.net) : 0;
        series[a].push(Math.round(running[a] * 100) / 100);
        monthTotal += running[a];
      }
      totalSeries.push(Math.round(monthTotal * 100) / 100);
    }

    res.json({ months, accounts, series, total: totalSeries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;