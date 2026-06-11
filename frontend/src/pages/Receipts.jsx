import { useState, useEffect, useRef } from 'react';
import { Camera, Upload, Check, Trash2, Eye, AlertTriangle, X, FileText, Pencil } from 'lucide-react';
import Layout from '../components/Layout';
import { Card, CardTitle, Button, Field, Spinner, EmptyState, Modal } from '../components/ui';
import { receiptsApi, categoryRulesApi } from '../api/endpoints';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { fmt, ACCOUNTS, isoDate } from '../lib/format';

const PROGRESS_STEPS = [
  'Uploading image…',
  'Converting photo…',
  'Reading the text…',
  'Almost done…',
];

export default function Receipts() {
  const { categories, refreshKey, triggerRefresh } = useApp();
  const toast = useToast();
  const fileRef = useRef();
  const camRef = useRef();
  const [scan, setScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [form, setForm] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [editing, setEditing] = useState(null); // receipt being edited
  const [pendingId, setPendingId] = useState(null); // checkbox in-flight

  useEffect(() => {
    receiptsApi.list().then(setReceipts).catch(() => setReceipts([]));
  }, [refreshKey]);

  // Advance the staged progress label while a scan is running.
  useEffect(() => {
    if (!busy) { setProgress(0); return; }
    const timers = [
      setTimeout(() => setProgress(1), 1500),
      setTimeout(() => setProgress(2), 5000),
      setTimeout(() => setProgress(3), 20000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [busy]);

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

  // Save the scanned receipt (image + fields). Does NOT create a transaction.
  async function saveReceipt() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount)) return toast('Enter an amount', 'error');
    try {
      await receiptsApi.save({ image_file: scan.image_file, ...form, amount });
      if (form.merchant && form.category && form.category !== 'Other') {
        try { await categoryRulesApi.learn(form.merchant, form.category); } catch {}
      }
      toast('Receipt saved', 'success');
      setScan(null); setForm(null);
      triggerRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  // Checkbox: add to / remove from the dashboard (creates / deletes a transaction).
  async function toggleDashboard(r) {
    setPendingId(r.id);
    try {
      if (r.on_dashboard) {
        await receiptsApi.removeFromDashboard(r.id);
        toast('Removed from dashboard');
      } else {
        await receiptsApi.addToDashboard(r.id);
        toast('Added to dashboard', 'success');
      }
      triggerRefresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPendingId(null);
    }
  }

  async function saveEdit() {
    const amount = parseFloat(editing.amount);
    if (isNaN(amount)) return toast('Enter an amount', 'error');
    try {
      await receiptsApi.update(editing.id, {
        merchant: editing.merchant, amount,
        date: editing.date, category: editing.category,
        account: editing.account, type: editing.type,
      });
      toast('Receipt updated', 'success');
      setEditing(null);
      triggerRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this receipt? If it was added to the dashboard, that transaction is removed too.')) return;
    try { await receiptsApi.remove(id); toast('Receipt deleted'); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  const unreadable = scan && (scan.amount == null || scan.date == null);
  const editSet = (k, v) => setEditing((s) => ({ ...s, [k]: v }));

  return (
    <Layout title="Receipts" subtitle="Snap a receipt — amount, date & merchant read automatically">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <CardTitle className="!mb-0">Scan a receipt</CardTitle>
          <div className="flex flex-col xs:flex-row gap-2">
            <Button onClick={() => camRef.current?.click()} className="justify-center"><Camera size={16} /> Take photo</Button>
            <Button variant="primary" onClick={() => fileRef.current?.click()} className="justify-center"><Upload size={16} /> Upload image</Button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif,.pdf,application/pdf" className="hidden" onChange={handleFile} />
        <input ref={camRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden" onChange={handleFile} />
        <p className="text-sm text-ink2">
          Upload or photograph a receipt. It's saved with its image so you can view it anytime. Tick a saved receipt to add it to your dashboard and transactions.
        </p>

        {busy && (
          <div className="mt-4 flex items-center gap-3 bg-surface2 rounded-lg px-4 py-3">
            <Spinner />
            <div>
              <div className="text-sm font-medium">{PROGRESS_STEPS[progress]}</div>
              <div className="text-xs text-ink3">Photos can take up to a minute — hang tight.</div>
            </div>
          </div>
        )}

        {scan && form && (
          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            {scan.image_file ? (
              <button className="sm:w-52 shrink-0" onClick={() => setLightbox(api.receiptImage(scan.image_file))}>
                <img src={api.receiptImage(scan.image_file)} alt="Receipt" className="w-full rounded-lg border border-line" />
                <span className="text-xs text-ink3 block text-center mt-1">tap to enlarge</span>
              </button>
            ) : (
              <div className="sm:w-52 shrink-0 flex flex-col items-center justify-center rounded-lg border border-line bg-surface2 py-8 text-ink3">
                <FileText size={32} />
                <span className="text-xs mt-2">PDF receipt</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
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
              <Button variant="primary" onClick={saveReceipt} className="w-full mt-3 justify-center"><Check size={16} /> Save receipt</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>Saved receipts</CardTitle>
        {receipts.length === 0 ? (
          <EmptyState title="No receipts saved yet" hint="Scan one above to get started." />
        ) : (
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {receipts.map((r) => (
              <div key={r.id} className="border border-line rounded-lg overflow-hidden flex flex-col">
                {r.image_path ? (
                  <button className="block w-full h-32 bg-surface2" onClick={() => setLightbox(api.receiptImage(r.image_path))}>
                    <img src={api.receiptImage(r.image_path)} alt={r.merchant || 'Receipt'} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ) : (
                  <div className="w-full h-32 bg-surface2 flex flex-col items-center justify-center text-ink3">
                    <FileText size={24} />
                    <span className="text-[11px] mt-1">PDF</span>
                  </div>
                )}
                <div className="p-2.5 flex flex-col flex-1">
                  <div className="font-medium text-sm truncate" title={r.merchant}>{r.merchant || 'Receipt'}</div>
                  <div className="flex justify-between items-center mt-1 gap-2">
                    <span className="text-xs text-ink3">{(r.receipt_date || '').slice(0, 10) || '—'}</span>
                    <span className="font-semibold text-sm tabular-nums">{r.amount != null ? fmt(r.amount) : ''}</span>
                  </div>
                  <span className="text-[11px] text-ink3 truncate mt-1">{r.category || ''}</span>

                  {/* Add-to-dashboard checkbox */}
                  <label className="flex items-center gap-2 mt-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brand cursor-pointer"
                      checked={!!r.on_dashboard}
                      disabled={pendingId === r.id}
                      onChange={() => toggleDashboard(r)}
                    />
                    <span className="text-xs text-ink2">
                      {pendingId === r.id ? 'Saving…' : 'On dashboard'}
                    </span>
                  </label>

                  <div className="flex justify-end items-center gap-1 mt-2 pt-2 border-t border-line">
                    <button onClick={() => setEditing({
                      id: r.id, merchant: r.merchant || '', amount: r.amount ?? '',
                      date: (r.receipt_date || '').slice(0, 10) || isoDate(),
                      category: r.category || 'Other', account: r.account || 'Personal everyday',
                      type: r.type || 'expense',
                    })} className="p-1.5 text-ink3 hover:text-brand" title="Edit"><Pencil size={14} /></button>
                    <button onClick={() => remove(r.id)} className="p-1.5 text-ink3 hover:text-negative" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Edit modal */}
      {editing && (
        <Modal open title="Edit receipt" onClose={() => setEditing(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Merchant" full><input className="input" value={editing.merchant} onChange={(e) => editSet('merchant', e.target.value)} /></Field>
            <Field label="Amount (AUD)"><input type="number" step="0.01" className="input" value={editing.amount} onChange={(e) => editSet('amount', e.target.value)} /></Field>
            <Field label="Date"><input type="date" className="input" value={editing.date} onChange={(e) => editSet('date', e.target.value)} /></Field>
            <Field label="Category"><select className="input" value={editing.category} onChange={(e) => editSet('category', e.target.value)}>{['Other', ...categories.filter((c) => c !== 'Other')].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Account"><select className="input" value={editing.account} onChange={(e) => editSet('account', e.target.value)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Type" full><select className="input" value={editing.type} onChange={(e) => editSet('type', e.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
            <Button onClick={() => setEditing(null)} className="justify-center">Cancel</Button>
            <Button variant="primary" onClick={saveEdit} className="justify-center"><Check size={16} /> Save changes</Button>
          </div>
        </Modal>
      )}

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