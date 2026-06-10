require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE columns (OID 1082) as the raw 'YYYY-MM-DD' string instead of a
// JS Date, which would otherwise get shifted a day by UTC conversion.
types.setTypeParser(1082, v => v);

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'finance_dashboard',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });
}

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

module.exports = pool;