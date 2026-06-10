require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const transactionsRouter = require('./routes/transactions');
const goalsRouter = require('./routes/goals');
const categoriesRouter = require('./routes/categories');
const taxRouter = require('./routes/tax');
const accountsRouter = require('./routes/accounts');
const cardsRouter = require('./routes/cards');
const importsRouter = require('./routes/imports');
const categoryRulesRouter = require('./routes/categoryRules');
const receiptsRouter = require('./routes/receipts');
const { errorHandler, notFound } = require('./middleware/errors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. opening index.html as a file, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any localhost / 127.0.0.1 origin on any port during local dev
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow an explicitly configured production frontend URL
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/transactions', transactionsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/tax', taxRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/imports', importsRouter);
app.use('/api/category-rules', categoryRulesRouter);
app.use('/api/receipts', receiptsRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Finance dashboard backend running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;