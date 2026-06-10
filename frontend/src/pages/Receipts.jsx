import { useState, useEffect, useRef } from 'react';
import { Camera, Upload, Check, Trash2, Eye, AlertTriangle, X } from 'lucide-react';
import Layout from '../components/Layout';
import { Card, CardTitle, Button, Field, Spinner, EmptyState } from '../components/ui';
import { receiptsApi, categoryRulesApi } from '../api/endpoints';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { fmt, ACCOUNTS, isoDate } from '../lib/format';

export default function Receipts() {
  const { categories, refreshKey, triggerRefresh } = useApp();
  const toast = useToast();
  const fileRef = useRef();
  const camRef = useRef();
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    receiptsApi.list().then(setReceipts).catch(() => setReceipts([]));
  }, [refreshKey]);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setScan(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await receiptsApi.scan(fd);
      setScan(data);
      setForm({
        merchant: data.merchant || '', amount: data.amount ?? '',
        date: data.date || isoDate(), category: 'Other',
        account: 'Personal everyday', type: 'expense',
      });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function confirm() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount)) return toast('Enter an amount', 'error');
    try {
      await receiptsApi.confirm({ image_file: scan.image_file, ...form, amount, source: '' });
      if (form.merchant && form.category && form.category !== 'Other') {
        try { await categoryRulesApi.learn(form.merchant, form.category); } catch {}
      }
      toast('Receipt saved', 'success');
      setScan(null); setForm(null);
      triggerRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(id) {
    if (!confirm('Delete this receipt? The transaction it created will stay.')) return;
    try { await receiptsApi.remove(id); toast('Receipt deleted'); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  const unreadable = scan && (scan.amount == null || scan.date == null);

  return (
    <Layout title="Receipts" subtitle="Snap a receipt — amount, date & merchant read automatically">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <CardTitle className="!mb-0">Scan a receipt</CardTitle>
          <div className="flex gap-2">
            <Button onClick={() => camRef.current?.click()}><Camera size={16} /> Take photo</Button>
            <Button variant="primary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Upload image</Button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        <p className="text-sm text-ink2">
          Upload or photograph a receipt. You review and confirm before it's saved, and the image is kept so you can view it anytime.
        </p>

        {busy && <Spinner label="Reading receipt… this can take a few seconds." />}

        {scan && form && (
          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <button className="sm:w-52 shrink-0" onClick={() => setLightbox(api.receiptImage(scan.image_file))}>
              <img src={api.receiptImage(scan.image_file)} alt="Receipt" className="w-full rounded-lg border border-line" />
              <span className="text-xs text-ink3 block text-center mt-1">tap to enlarge</span>
            </button>
            <div className="flex-1">
              <div className="bg-brand-bg text-brand-text text-sm rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
                <Eye size={16} /> Review what was read, fix anything, then save.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Merchant" full><input className="input" value={form.merchant} onChange={(e) => set('merchant', e.target.value)} /></Field>
                <Field label="Amount (AUD)"><input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></Field>
                <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
                <Field label="Category"><select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>{['Other', ...categories.filter((c) => c !== 'Other')].map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Account"><select className="input" value={form.account} onChange={(e) => set('account', e.target.value)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
                <Field label="Type" full><select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
              </div>
              {unreadable && (
                <p className="text-xs text-warn-text mt-2 flex items-center gap-1.5"><AlertTriangle size={13} /> Some fields weren't read clearly — please fill them in.</p>
              )}
              <Button variant="primary" onClick={confirm} className="w-full mt-3"><Check size={16} /> Save transaction + receipt</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>Saved receipts</CardTitle>
        {receipts.length === 0 ? (
          <EmptyState title="No receipts saved yet" hint="Scan one above to get started." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {receipts.map((r) => (
              <div key={r.id} className="border border-line rounded-lg overflow-hidden">
                <button className="block w-full h-28 bg-surface2" onClick={() => setLightbox(api.receiptImage(r.image_path))}>
                  <img src={api.receiptImage(r.image_path)} alt={r.merchant || 'Receipt'} className="w-full h-full object-cover" loading="lazy" />
                </button>
                <div className="p-2.5">
                  <div className="font-medium text-sm truncate" title={r.merchant}>{r.merchant || 'Receipt'}</div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-ink3">{(r.receipt_date || '').slice(0, 10) || '—'}</span>
                    <span className="font-semibold text-sm tabular-nums">{r.amount != null ? fmt(r.amount) : ''}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[11px] text-ink3 truncate">{r.category || ''}</span>
                    <button onClick={() => remove(r.id)} className="p-1 text-ink3 hover:text-negative"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {lightbox && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="btn self-end mb-2"><X size={16} /> Close</button>
            <img src={lightbox} alt="Receipt" className="max-w-full max-h-[80vh] rounded-lg shadow-hover" />
          </div>
        </div>
      )}
    </Layout>
  );
}
