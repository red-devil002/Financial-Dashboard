import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { Modal, Button, Field } from './ui';
import { isoDate } from '../lib/format';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { transactionsApi, categoryRulesApi } from '../api/endpoints';

// Manually add a transaction to a specific card (for charges the PDF import
// missed, or that you want to log before the statement arrives). The new
// transaction is pre-linked to the card so it shows in the card's balance,
// charts and list immediately.
export default function AddCardTransactionModal({ open, onClose, card }) {
  const { categories, triggerRefresh } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        date: isoDate(),
        description: '',
        amount: '',
        category: 'Other',
        kind: 'charge', // 'charge' (purchase) or 'payment' (credit)
      });
    }
  }, [open, card]);

  if (!open || !form) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const amount = parseFloat(form.amount);
    if (!form.date) return toast('Pick a date', 'error');
    if (isNaN(amount) || amount <= 0) return toast('Enter an amount greater than 0', 'error');

    // A charge increases what you owe (negative); a payment/credit reduces it (positive).
    const isPayment = form.kind === 'payment';
    const signed = isPayment ? Math.abs(amount) : -Math.abs(amount);

    setSaving(true);
    try {
      await transactionsApi.create({
        date: form.date,
        description: form.description || (isPayment ? 'Payment' : 'Card charge'),
        amount: signed,
        category: isPayment ? 'Credit card payment' : form.category,
        type: isPayment ? 'income' : 'expense',
        account: 'Credit card',
        source: '',
        card_id: card.id,
      });
      if (!isPayment && form.description && form.category && form.category !== 'Other') {
        try { await categoryRulesApi.learn(form.description, form.category); } catch {}
      }
      toast('Transaction added', 'success');
      triggerRefresh();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add transaction — ${card?.name || 'Card'}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Amount (AUD)"><input type="number" step="0.01" min="0" className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></Field>
        <Field label="Description" full><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Woolworths Clayton" /></Field>
        <Field label="This is a">
          <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            <option value="charge">Charge (purchase)</option>
            <option value="payment">Payment / credit</option>
          </select>
        </Field>
        <Field label="Category">
          <input
            className="input"
            list="add-card-cats"
            value={form.kind === 'payment' ? 'Credit card payment' : form.category}
            disabled={form.kind === 'payment'}
            onChange={(e) => set('category', e.target.value)}
          />
          <datalist id="add-card-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
      <p className="text-xs text-ink3 mt-2">
        {form.kind === 'payment'
          ? 'A payment reduces the balance owed on this card.'
          : 'A charge adds to the balance owed and counts toward your spending.'}
      </p>
      <Button variant="primary" onClick={save} disabled={saving} className="w-full mt-4 justify-center">
        <Check size={16} /> {saving ? 'Adding…' : 'Add transaction'}
      </Button>
    </Modal>
  );
}