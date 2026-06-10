const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

/**
 * Derive a stable keyword from a transaction description.
 * Banks append store numbers, locations, dates — we want the merchant stem.
 * e.g. "Woolworths 1234 Clayton Vic" -> "woolworths"
 *      "SQ *EASTBOURNE ALLEY East Melbourn AU" -> "eastbourne alley"
 */
function deriveKeyword(description) {
  if (!description) return '';
  let s = description.toLowerCase()
    .replace(/sq\s*\*/g, ' ')          // Square prefix
    .replace(/[*#]/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')        // long numbers (store/ref ids)
    .replace(/\b(aus|au|vic|nsw|qld|wa|sa|tas|act|nt)\b/g, ' ') // AU state/country tokens
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Keep the first 2 meaningful words as the merchant stem.
  const words = s.split(' ').filter(w => w.length > 1);
  return words.slice(0, 2).join(' ').trim();
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM category_rules ORDER BY hits DESC, keyword ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Learn (or reinforce) a rule from a description + chosen category.
router.post('/learn', async (req, res) => {
  try {
    const { description, category } = req.body;
    if (!category) return res.status(400).json({ error: 'category is required' });
    const keyword = deriveKeyword(description);
    if (!keyword || category === 'Other') return res.json({ learned: false }); // don't learn noise
    const result = await pool.query(`
      INSERT INTO category_rules (keyword, category, hits)
      VALUES ($1, $2, 1)
      ON CONFLICT (keyword) DO UPDATE
        SET category = EXCLUDED.category, hits = category_rules.hits + 1, updated_at = NOW()
      RETURNING *
    `, [keyword, category]);
    res.json({ learned: true, rule: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Given a list of descriptions, return the best category match for each (or null).
router.post('/match', async (req, res) => {
  try {
    const { descriptions } = req.body;
    if (!Array.isArray(descriptions)) return res.status(400).json({ error: 'descriptions array required' });
    const rules = (await pool.query('SELECT keyword, category FROM category_rules ORDER BY LENGTH(keyword) DESC')).rows;
    const out = descriptions.map(desc => {
      const d = (desc || '').toLowerCase();
      const hit = rules.find(r => d.includes(r.keyword));
      return hit ? hit.category : null;
    });
    res.json({ matches: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { keyword, category } = req.body;
    const result = await pool.query(
      'UPDATE category_rules SET keyword=$1, category=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [keyword.toLowerCase().trim(), category, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM category_rules WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true, id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;