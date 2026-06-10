const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const multer = require('multer');
const Papa = require('papaparse');
const XLSX = require('xlsx');
const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { parseStatementText, toDashboardRows } = require('../lib/pdfParser');

const upload = multer({ dest: 'uploads/' });

router.get('/', async (req, res) => {
  try {
    const { account, type, source, from, to, search, card_id, limit = 500, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    let i = 1;

    if (account) { conditions.push(`account = $${i++}`); params.push(account); }
    if (type) { conditions.push(`type = $${i++}`); params.push(type); }
    if (source) { conditions.push(`source = $${i++}`); params.push(source); }
    if (card_id) { conditions.push(`card_id = $${i++}`); params.push(parseInt(card_id)); }
    if (from) { conditions.push(`date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`date <= $${i++}`); params.push(to); }
    if (search) {
      conditions.push(`(description ILIKE $${i} OR category ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(
      `SELECT * FROM transactions ${where} ORDER BY date DESC, id DESC LIMIT $${i} OFFSET $${i+1}`,
      params
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM transactions ${where}`,
      params.slice(0, -2)
    );
    res.json({ transactions: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    // Main dashboard excludes the Credit card account entirely — card charges
    // are not cash spending. Only the payment you make from cash (category
    // 'Credit card payment') shows here, and it lives on a cash account.
    const conditions = [`account <> 'Credit card'`];
    const params = [];
    let i = 1;
    if (from) { conditions.push(`date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`date <= $${i++}`); params.push(to); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const summary = await pool.query(`
      SELECT
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS total_income,
        SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END) AS total_expenses,
        SUM(CASE WHEN type = 'investment' THEN ABS(amount) ELSE 0 END) AS total_invested,
        SUM(CASE WHEN source = 'abn' AND type = 'income' THEN amount ELSE 0 END) AS abn_income,
        SUM(CASE WHEN source = 'tfn' AND type = 'income' THEN amount ELSE 0 END) AS tfn_income,
        SUM(CASE WHEN source = 'cash' AND type = 'income' THEN amount ELSE 0 END) AS cash_income
      FROM transactions ${where}
    `, params);

    const byMonth = await pool.query(`
      SELECT
        TO_CHAR(date, 'YYYY-MM') AS month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type = 'expense' THEN ABS(amount) ELSE 0 END) AS expenses
      FROM transactions ${where}
      GROUP BY month ORDER BY month
    `, params);

    const byCategory = await pool.query(`
      SELECT category, SUM(ABS(amount)) AS total
      FROM transactions
      ${where} AND type = 'expense'
      GROUP BY category ORDER BY total DESC
    `, params);

    const byAccount = await pool.query(`
      SELECT account, SUM(amount) AS balance
      FROM transactions ${where}
      GROUP BY account
    `, params);

    res.json({
      summary: summary.rows[0],
      by_month: byMonth.rows,
      by_category: byCategory.rows,
      by_account: byAccount.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, description, amount, category, type, account, source, notes, card_id, repayment_date } = req.body;
    if (!date || !description || amount === undefined || !type || !account) {
      return res.status(400).json({ error: 'date, description, amount, type, account are required' });
    }
    const result = await pool.query(
      `INSERT INTO transactions (date, description, amount, category, type, account, source, notes, card_id, repayment_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [date, description, amount, category || 'Other', type, account, source || '', notes || '',
       card_id || null, repayment_date || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bulk', async (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions array required' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = [];
      for (const tx of transactions) {
        const r = await client.query(
          `INSERT INTO transactions (date, description, amount, category, type, account, source, notes, card_id, repayment_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [tx.date, tx.description || tx.desc, tx.amount,
           tx.category || tx.cat || 'Other', tx.type,
           tx.account || tx.acct || 'Personal everyday',
           tx.source || tx.src || '', tx.notes || '',
           tx.card_id || null, tx.repayment_date || null]
        );
        inserted.push(r.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ inserted: inserted.length, transactions: inserted });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    let rows = [];

    if (ext === 'csv') {
      const content = fs.readFileSync(req.file.path, 'utf8');
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      rows = parsed.data;
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws);
    } else if (ext === 'pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      let pdfData;
      try {
        pdfData = await pdfParse(dataBuffer);
      } catch (pdfErr) {
        fs.unlinkSync(req.file.path);
        return res.status(422).json({
          error: 'Could not read this PDF. It may be scanned/image-based or corrupted. ' +
                 'Try exporting a CSV from your bank instead.',
        });
      }
      fs.unlinkSync(req.file.path);
      if (!pdfData.text || pdfData.text.trim().length === 0) {
        return res.status(422).json({
          error: 'No selectable text found in this PDF (it may be a scanned image). ' +
                 'Try exporting a CSV from your bank instead.',
        });
      }
      const txns = parseStatementText(pdfData.text);
      const dashboardRows = toDashboardRows(txns);
      // PDF rows are already in dashboard shape — return directly.
      return res.json({ preview: dashboardRows, count: dashboardRows.length, source: 'pdf' });
    } else {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Unsupported file type. Use CSV, Excel, or PDF.' });
    }

    fs.unlinkSync(req.file.path);

    const parsed = rows.map(r => {
      const rawAmt = parseFloat(String(r.amount || r.Amount || r.AMOUNT || 0).replace(/[$,]/g, ''));
      return {
        date: r.date || r.Date || '',
        description: r.description || r.Description || r.memo || r.Memo || '',
        amount: rawAmt,
        category: r.category || r.Category || 'Other',
        type: (r.type || r.Type || (rawAmt >= 0 ? 'income' : 'expense')).toLowerCase(),
        account: r.account || r.Account || 'Personal everyday',
        source: (r.source || r.Source || '').toLowerCase(),
        notes: r.notes || r.Notes || '',
      };
    }).filter(r => r.date && !isNaN(r.amount));

    res.json({ preview: parsed, count: parsed.length, source: ext });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch {} }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { date, description, amount, category, type, account, source, notes, card_id, repayment_date } = req.body;
    const result = await pool.query(
      `UPDATE transactions SET date=$1, description=$2, amount=$3, category=$4,
       type=$5, account=$6, source=$7, notes=$8, card_id=$9, repayment_date=$10 WHERE id=$11 RETURNING *`,
      [date, description, amount, category, type, account, source || '', notes || '',
       card_id || null, repayment_date || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM transactions WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Business profit & loss: ABN income vs business expenses, organized for tax.
router.get('/business-pl', async (req, res) => {
  try {
    const { from, to } = req.query;
    const conditions = [`(account = 'Business transaction' OR account = 'Business savings' OR source = 'abn')`];
    const params = [];
    let i = 1;
    if (from) { conditions.push(`date >= $${i++}`); params.push(from); }
    if (to) { conditions.push(`date <= $${i++}`); params.push(to); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const income = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) AS total
      FROM transactions ${where}
    `, params);

    const expensesByCat = await pool.query(`
      SELECT category, SUM(ABS(amount)) AS total
      FROM transactions ${where} AND type = 'expense'
      GROUP BY category ORDER BY total DESC
    `, params);

    const byMonth = await pool.query(`
      SELECT TO_CHAR(date,'YYYY-MM') AS month,
        SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type='expense' THEN ABS(amount) ELSE 0 END) AS expenses
      FROM transactions ${where}
      GROUP BY month ORDER BY month
    `, params);

    const totalIncome = parseFloat(income.rows[0].total) || 0;
    const totalExpenses = expensesByCat.rows.reduce((s, r) => s + parseFloat(r.total), 0);

    res.json({
      total_income: totalIncome,
      total_expenses: totalExpenses,
      net_profit: totalIncome - totalExpenses,
      expenses_by_category: expensesByCat.rows,
      by_month: byMonth.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;