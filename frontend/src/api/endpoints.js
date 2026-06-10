// Feature-grouped API calls. Each function maps to a backend endpoint so
// components never build URLs by hand.
import { api } from './client';

export const transactionsApi = {
  list: (params = {}) => api.get('/transactions?' + new URLSearchParams(params)),
  summary: (params = {}) => api.get('/transactions/summary?' + new URLSearchParams(params)),
  businessPL: (params = {}) => api.get('/transactions/business-pl?' + new URLSearchParams(params)),
  create: (tx) => api.post('/transactions', tx),
  bulk: (transactions) => api.post('/transactions/bulk', { transactions }),
  update: (id, tx) => api.put(`/transactions/${id}`, tx),
  remove: (id) => api.del(`/transactions/${id}`),
};

export const accountsApi = {
  list: () => api.get('/accounts'),
  balances: () => api.get('/accounts/balances'),
  netWorth: () => api.get('/accounts/networth'),
};

export const cardsApi = {
  list: () => api.get('/cards'),
  summary: () => api.get('/cards/summary'),
  repayments: () => api.get('/cards/repayments'),
  create: (card) => api.post('/cards', card),
  update: (id, card) => api.put(`/cards/${id}`, card),
  remove: (id) => api.del(`/cards/${id}`),
  pay: (id, body) => api.post(`/cards/${id}/pay`, body),
  importStatement: (id, formData) => api.upload(`/cards/${id}/import-statement`, formData),
};

export const goalsApi = {
  list: () => api.get('/goals'),
  create: (goal) => api.post('/goals', goal),
  update: (id, goal) => api.put(`/goals/${id}`, goal),
  remove: (id) => api.del(`/goals/${id}`),
};

export const categoriesApi = {
  list: () => api.get('/categories'),
  create: (name) => api.post('/categories', { name }),
  update: (id, name) => api.put(`/categories/${id}`, { name }),
  remove: (id) => api.del(`/categories/${id}`),
};

export const categoryRulesApi = {
  list: () => api.get('/category-rules'),
  learn: (description, category) => api.post('/category-rules/learn', { description, category }),
  match: (descriptions) => api.post('/category-rules/match', { descriptions }),
  remove: (id) => api.del(`/category-rules/${id}`),
};

export const taxApi = {
  get: () => api.get('/tax'),
  update: (rates) => api.put('/tax', rates),
  estimate: (params = {}) => api.get('/tax/estimate?' + new URLSearchParams(params)),
};

export const importsApi = {
  list: (source) => api.get('/imports' + (source ? `?source=${source}` : '')),
  log: (meta) => api.post('/imports', meta),
  remove: (id) => api.del(`/imports/${id}`),
};

export const receiptsApi = {
  list: () => api.get('/receipts'),
  scan: (formData) => api.upload('/receipts/scan', formData),
  confirm: (body) => api.post('/receipts/confirm', body),
  remove: (id) => api.del(`/receipts/${id}`),
};
