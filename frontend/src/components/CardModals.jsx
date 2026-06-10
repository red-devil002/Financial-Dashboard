import { useState, useEffect, useRef } from 'react';
import { Check, Upload } from 'lucide-react';
import { Modal, Button, Field } from './ui';
import { fmt, ACCOUNTS, isoDate, CAT_COLORS } from '../lib/format';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { cardsApi, importsApi, transactionsApi } from '../api/endpoints';

export function CardFormModal({ open, onClose, card }) {
  const { triggerRefresh } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', last4: '', credit_limit: '', due_day: '', color: CAT_COLORS[3] });

  useEffect(() => {
    if (open) setForm(card
      ? { name: card.name || '', last4: card.last4 || '', credit_limit: card.credit_limit || '', due_day: card.due_day || '', color: card.color || CAT_COLORS[3] }
      : { name: '', last4: '', credit_limit: '', due_day: '', color: CAT_COLORS[3] });
  }, [open, card]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return toast('Card name required', 'error');
    const payload = {
      name: form.name.trim(), last4: form.last4 || null,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      due_day: form.due_day ? parseInt(form.due_day) : null, color: form.color,
    };
    try {
      if (card) await cardsApi.update(card.id, payload);
      else await cardsApi.create(payload);
      toast(card ? 'Card updated' : 'Card added', 'success');
      triggerRefresh();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Modal open={open} onClose={onClose} title={card ? 'Edit card' : 'Add card'}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Card name" full><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 28 Degrees Mastercard" /></Field>
        <Field label="Last 4 digits"><input className="input" maxLength={4} value={form.last4} onChange={(e) => set('last4', e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Credit limit"><input type="number" className="input" value={form.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} /></Field>
        <Field label="Repayment due day (1-31)"><input type="number" min={1} max={31} className="input" value={form.due_day} onChange={(e) => set('due_day', e.target.value)} /></Field>
        <Field label="Colour">
          <div className="flex gap-1.5 flex-wrap">
            {CAT_COLORS.slice(0, 8).map((c) => (
              <button key={c} onClick={() => set('color', c)} className="w-7 h-7 rounded-full border-2" style={{ background: c, borderColor: form.color === c ? '#1a1a18' : 'transparent' }} />
            ))}
          </div>
        </Field>
      </div>
      <Button variant="primary" onClick={save} className="w-full mt-4"><Check size={16} /> {card ? 'Save changes' : 'Add card'}</Button>
    </Modal>
  );
}

export function PayCardModal({ open, onClose, card }) {
  const { triggerRefresh } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ amount: '', date: isoDate(), account: 'Personal everyday' });
  useEffect(() => { if (open && card) setForm({ amount: card.balance > 0 ? card.balance.toFixed(2) : '', date: isoDate(), account: 'Personal everyday' }); }, [open, card]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function pay() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) return toast('Enter a positive amount', 'error');
    try {
      await cardsApi.pay(card.id, { amount, date: form.date, account: form.account });
      toast('Payment recorded', 'success');
      triggerRefresh();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!card) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Pay ${card.name}`}>
      <p className="text-sm text-ink2 mb-3">Records a payment from your chosen account (shows as an expense on your dashboard) and reduces the card balance.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Amount (AUD)"><input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Pay from" full><select className="input" value={form.account} onChange={(e) => set('account', e.target.value)}>{ACCOUNTS.filter((a) => a !== 'Credit card').map((a) => <option key={a}>{a}</option>)}</select></Field>
      </div>
      <Button variant="primary" onClick={pay} className="w-full mt-4"><Check size={16} /> Record payment</Button>
    </Modal>
  );
}

export function ImportStatementModal({ open, onClose, card }) {
  const { triggerRefresh } = useApp();
  const toast = useToast();
  const fileRef = useRef();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState('');

  const reset = () => { setRows(null); setFilename(''); if (fileRef.current) fileRef.current.value = ''; };
  const close = () => { reset(); onClose(); };

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !card) return;
    setBusy(true); setFilename(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await cardsApi.importStatement(card.id, fd);
      setRows((data.preview || []).map((r) => ({ ...r, keep: true })));
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  async function confirm() {
    const toAdd = rows.filter((r) => r.keep).map(({ keep, ...r }) => r);
    if (!toAdd.length) return toast('Nothing to import', 'error');
    try {
      await transactionsApi.bulk(toAdd);
      try { await importsApi.log({ filename, file_type: 'pdf', source: 'statement', card_id: card.id, row_count: toAdd.length }); } catch {}
      toast(`${toAdd.length} transactions imported`, 'success');
      triggerRefresh();
      close();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (!card) return null;
  return (
    <Modal open={open} onClose={close} title={`Import statement — ${card.name}`} wide={!!rows}>
      {!rows && (
        <div className="border border-dashed border-line2 rounded-card p-8 text-center cursor-pointer hover:bg-surface2" onClick={() => fileRef.current?.click()}>
          <Upload size={30} className="mx-auto mb-2 text-ink3" />
          <p className="text-sm font-medium">Upload the card's PDF statement</p>
          <p className="text-xs text-ink2 mt-1">Charges are linked to this card and recorded on the Credit card account.</p>
        </div>
      )}
      <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
      {busy && <p className="text-sm text-ink2 mt-3 text-center">Parsing statement…</p>}
      {rows && (
        <div>
          <div className="bg-brand-bg text-brand-text text-sm rounded-lg px-3 py-2 mb-3">{rows.length} transactions parsed. Review and import.</div>
          <div className="overflow-auto max-h-[50vh] border border-line rounded-lg">
            <table className="w-full text-xs min-w-[480px]">
              <thead className="sticky top-0 bg-surface"><tr className="text-left text-ink2">{['Date', 'Description', 'Amount', 'Keep'].map((h) => <th key={h} className="px-2 py-2 border-b border-line">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 max-w-[240px] truncate" title={r.description}>{r.description}</td>
                    <td className="px-2 py-1.5 font-medium text-negative whitespace-nowrap">{fmt(r.amount)}</td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={r.keep} onChange={(e) => setRows((rs) => rs.map((x, idx) => idx === i ? { ...x, keep: e.target.checked } : x))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="primary" onClick={confirm} className="w-full mt-3"><Check size={16} /> Import {rows.filter((r) => r.keep).length} transactions</Button>
        </div>
      )}
    </Modal>
  );
}
