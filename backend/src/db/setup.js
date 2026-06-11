require('dotenv').config();
const pool = require('./pool');

async function setup() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        type VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        description VARCHAR(255) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        category VARCHAR(100),
        type VARCHAR(50) NOT NULL CHECK (type IN ('income','expense','investment','transfer')),
        account VARCHAR(100) NOT NULL,
        source VARCHAR(50) CHECK (source IN ('tfn','abn','cash','')),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account);
      CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        target_amount NUMERIC(12, 2) NOT NULL,
        current_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        account VARCHAR(100) NOT NULL,
        deadline DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tax_settings (
        id SERIAL PRIMARY KEY,
        abn_tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 28.00,
        gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        last4 VARCHAR(4),
        credit_limit NUMERIC(12, 2),
        due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
        color VARCHAR(20),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // New optional columns on transactions linking to a card and a per-transaction repayment date.
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS repayment_date DATE;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_card ON transactions(card_id);`);

    // Track uploaded files (bank/card statements, CSV/Excel imports).
    await client.query(`
      CREATE TABLE IF NOT EXISTS imports (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(300) NOT NULL,
        file_type VARCHAR(20),
        source VARCHAR(30) NOT NULL DEFAULT 'general',
        card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
        row_count INTEGER NOT NULL DEFAULT 0,
        imported_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Learned category rules: map a merchant keyword -> a category.
    await client.query(`
      CREATE TABLE IF NOT EXISTS category_rules (
        id SERIAL PRIMARY KEY,
        keyword VARCHAR(200) NOT NULL UNIQUE,
        category VARCHAR(100) NOT NULL,
        hits INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Stored receipts (image saved on disk, parsed fields, optional transaction link).
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        image_path VARCHAR(400) NOT NULL,
        merchant VARCHAR(200),
        amount NUMERIC(12, 2),
        receipt_date DATE,
        transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Receipts can now be saved on their own (image + parsed fields) and only
    // become a transaction when the user ticks "add to dashboard". Store the
    // chosen category/account/type on the receipt so we can build the
    // transaction later, and allow image_path to be empty for PDF receipts.
    await client.query(`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS category VARCHAR(100);`);
    await client.query(`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS account VARCHAR(100);`);
    await client.query(`ALTER TABLE receipts ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'expense';`);
    await client.query(`ALTER TABLE receipts ALTER COLUMN image_path DROP NOT NULL;`);

    await client.query(`
      INSERT INTO tax_settings (abn_tax_rate, gst_rate)
      SELECT 28.00, 10.00
      WHERE NOT EXISTS (SELECT 1 FROM tax_settings);
    `);

    await client.query(`
      INSERT INTO categories (name) VALUES
        ('Salary'), ('Side income'), ('Rent'), ('Groceries'),
        ('Dining'), ('Subscriptions'), ('Utilities'), ('Health'),
        ('Transport'), ('Business expenses'), ('Equipment'),
        ('Marketing'), ('ETF'), ('Transfer'), ('Credit card payment'), ('Other')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO accounts (name, type) VALUES
        ('Personal everyday', 'personal'),
        ('Personal savings', 'personal'),
        ('Business transaction', 'business'),
        ('Business savings', 'business'),
        ('Credit card', 'credit'),
        ('Cash', 'cash')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Database setup complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Setup failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch(() => process.exit(1));