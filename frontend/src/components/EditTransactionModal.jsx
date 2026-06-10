import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { Modal, Button, Field } from './ui';
import { ACCOUNTS, TX_TYPES, SOURCES, isoDate } from '../lib/format';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { transactionsApi, categoryRulesApi } from '../api/endpoints';

// Edit an existing transaction. Optionally exposes card-link + repayment fields
// (used from the Cards detail view).
export default function EditTransactionModal({ open, onClose, tx, cards = [], showCardFields }) {
  const { categories, triggerRefresh } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (tx) {
      setForm({
        date: (tx.date || '').slice(0, 10) || isoDate(),
        description: tx.description || '',
        amount: Math.abs(parseFloat(tx.amount)) || '',
        category: tx.category || '',
        type: tx.type || 'expense',
        account: tx.account || 'Personal everyday',
        source: tx.source || '',
        card_id: tx.card_id || '',
        repayment_date: (tx.repayment_date || '').slice(0, 10) || '',
      });
    }
  }, [tx]);

  if (!form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount)) return toast('Date and amount required', 'error');
    const signed = form.type === 'expense' || form.type === 'investment' ? -Math.abs(amount) : Math.abs(amount);
    try {
      await transactionsApi.update(tx.id, {
        date: form.date, description: form.description, amount: signed,
        category: form.category, type: form.type, account: form.account,
        source: form.source, card_id: form.card_id || null,
        repayment_date: form.repayment_date || null,
      });
      if (form.description && form.category && form.category !== 'Other') {
        try { await categoryRulesApi.learn(form.description, form.category); } catch {}
      }
      toast('Transaction updated!', 'success');
      triggerRefresh();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit transaction">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Amount (AUD)"><input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Description" full><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Category"><input className="input" list="edit-cats" value={form.category} onChange={(e) => set('category', e.target.value)} /><datalist id="edit-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Type"><select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>{TX_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Account"><select className="input" value={form.account} onChange={(e) => set('account', e.target.value)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="Income source"><select className="input" value={form.source} onChange={(e) => set('source', e.target.value)}>{SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
        {showCardFields && (
          <>
            <Field label="Linked card">
              <select className="input" value={form.card_id} onChange={(e) => set('card_id', e.target.value)}>
                <option value="">None</option>
                {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Repayment date"><input type="date" className="input" value={form.repayment_date} onChange={(e) => set('repayment_date', e.target.value)} /></Field>
          </>
        )}
      </div>
      <Button variant="primary" onClick={save} className="w-full mt-4"><Check size={16} /> Save changes</Button>
    </Modal>
  );
}
