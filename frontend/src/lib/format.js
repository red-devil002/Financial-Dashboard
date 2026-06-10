// Formatting helpers and shared visual constants.

// Always show exact amounts with 2 decimal places — no rounding or abbreviation.
export function fmt(n) {
  if (n === undefined || n === null || isNaN(parseFloat(n))) return '$0.00';
  const num = parseFloat(n);
  const s = Math.abs(num).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (num < 0 ? '-$' : '$') + s;
}

// Percent for ratios (whole numbers read best for rates/utilization).
export function pct(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export const CAT_COLORS = [
  '#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#7F77DD', '#639922',
  '#D85A30', '#888780', '#185FA5', '#0F6E56', '#E24B4A', '#EF9F27',
];

export const ACCT_COLORS = {
  'Personal everyday': '#378ADD',
  'Personal savings': '#1D9E75',
  'Business transaction': '#7F77DD',
  'Business savings': '#5DCAA5',
  'Credit card': '#D4537E',
  Cash: '#BA7517',
};

export const ACCOUNTS = [
  'Personal everyday',
  'Personal savings',
  'Business transaction',
  'Business savings',
  'Credit card',
  'Cash',
];

export const TX_TYPES = ['income', 'expense', 'investment', 'transfer'];
export const SOURCES = [
  { value: '', label: 'None' },
  { value: 'tfn', label: 'TFN' },
  { value: 'abn', label: 'ABN' },
  { value: 'cash', label: 'Cash' },
];

// Sample data for first-run / demo.
export const SAMPLE_TRANSACTIONS = [
  { date: '2025-01-05', description: 'Salary Jan', amount: 5500, category: 'Salary', type: 'income', account: 'Personal everyday', source: 'tfn' },
  { date: '2025-01-06', description: 'ABN client invoice', amount: 2200, category: 'Side income', type: 'income', account: 'Business transaction', source: 'abn' },
  { date: '2025-01-08', description: 'Cash painting job', amount: 300, category: 'Side income', type: 'income', account: 'Cash', source: 'cash' },
  { date: '2025-01-10', description: 'Rent', amount: -1800, category: 'Rent', type: 'expense', account: 'Personal everyday', source: '' },
  { date: '2025-01-12', description: 'Woolworths', amount: -210, category: 'Groceries', type: 'expense', account: 'Personal everyday', source: '' },
  { date: '2025-01-18', description: 'VDHG ETF', amount: -600, category: 'ETF', type: 'investment', account: 'Personal everyday', source: '' },
  { date: '2025-02-05', description: 'Salary Feb', amount: 5500, category: 'Salary', type: 'income', account: 'Personal everyday', source: 'tfn' },
  { date: '2025-02-07', description: 'ABN client invoice', amount: 3100, category: 'Side income', type: 'income', account: 'Business transaction', source: 'abn' },
  { date: '2025-02-10', description: 'Rent', amount: -1800, category: 'Rent', type: 'expense', account: 'Personal everyday', source: '' },
  { date: '2025-02-12', description: 'Coles', amount: -195, category: 'Groceries', type: 'expense', account: 'Personal everyday', source: '' },
  { date: '2025-02-18', description: 'ASX 200 ETF', amount: -700, category: 'ETF', type: 'investment', account: 'Personal everyday', source: '' },
  { date: '2025-03-05', description: 'Salary Mar', amount: 5500, category: 'Salary', type: 'income', account: 'Personal everyday', source: 'tfn' },
  { date: '2025-03-07', description: 'ABN client invoice', amount: 2800, category: 'Side income', type: 'income', account: 'Business transaction', source: 'abn' },
  { date: '2025-03-09', description: 'Rent', amount: -1800, category: 'Rent', type: 'expense', account: 'Personal everyday', source: '' },
  { date: '2025-03-16', description: 'VAS ETF', amount: -800, category: 'ETF', type: 'investment', account: 'Personal everyday', source: '' },
  { date: '2025-03-20', description: 'Marketing tools', amount: -250, category: 'Marketing', type: 'expense', account: 'Business transaction', source: '' },
];
