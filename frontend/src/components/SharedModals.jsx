import { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import clsx from 'clsx';
import { FileSpreadsheet, Check, Download } from 'lucide-react';
import { Modal, Button, Field } from './ui';
import { fmt, ACCOUNTS, isoDate } from '../lib/format';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { transactionsApi, categoryRulesApi, importsApi } from '../api/endpoints';
import { api } from '../api/client';

// ---------- Import modal (CSV / Excel / PDF) ----------
export function ImportModal({ open, onClose }) {
  const { categories, triggerRefresh } = useApp();
  const toast = useToast();
  const fileRef = useRef();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setRows(null); setMeta(null); if (fileRef.current) fileRef.current.value = ''; };
  const close = () => { reset(); onClose(); };

  async function applyRules(parsed) {
    try {
      const res = await categoryRulesApi.match(parsed.map((r) => r.description || ''));
      if (res.matches) parsed.forEach((r, i) => {
        if ((!r.category || r.category === 'Other') && res.matches[i]) r.category = res.matches[i];
      });
    } catch {}
    return parsed;
  }

  function normalize(raw) {
    return raw.map((r) => {
      const amt = parseFloat(String(r.amount ?? r.Amount ?? 0).replace(/[$,]/g, ''));
      return {
        date: r.date || r.Date || '',
        description: r.description || r.Description || r.memo || r.Memo || '',
        amount: amt,
        category: r.category || r.Category || 'Other',
        type: (r.type || r.Type || (amt >= 0 ? 'income' : 'expense')).toLowerCase(),
        account: r.account || r.Account || 'Personal everyday',
        source: (r.source || r.Source || '').toLowerCase(),
        keep: true,
      };
    }).filter((r) => r.date && !isNaN(r.amount));
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    setMeta({ filename: file.name, file_type: ext });
    setBusy(true);
    try {
      if (ext === 'csv') {
        Papa.parse(file, {
          header: true, skipEmptyLines: true,
          complete: async (res) => { setRows(await applyRules(normalize(res.data))); setBusy(false); },
        });
      } else if (ext === 'pdf') {
        const fd = new FormData();
        fd.append('file', file);
        const data = await api.upload('/transactions/import', fd);
        setRows(await applyRules((data.preview || []).map((r) => ({ ...r, keep: true }))));
        setBusy(false);
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        setRows(await applyRules(normalize(json)));
        setBusy(false);
      }
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  async function confirm() {
    const toAdd = rows.filter((r) => r.keep).map(({ keep, ...r }) => r);
    if (!toAdd.length) return toast('Nothing to import', 'error');
    try {
      await transactionsApi.bulk(toAdd);
      for (const r of toAdd) {
        if (r.description && r.category && r.category !== 'Other') {
          try { await categoryRulesApi.learn(r.description, r.category); } catch {}
        }
      }
      if (meta?.filename) {
        try { await importsApi.log({ ...meta, source: 'general', row_count: toAdd.length }); } catch {}
      }
      toast(`${toAdd.length} transactions imported!`, 'success');
      triggerRefresh();
      close();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function downloadCsv() {
    const keep = rows.filter((r) => r.keep);
    if (!keep.length) return toast('Nothing to download', 'error');
    const header = ['date', 'description', 'amount', 'category', 'type', 'account', 'source'];
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [header.join(','), ...keep.map((r) => header.map((h) => esc(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'transactions_export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const update = (i, key, val) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  return (
    <Modal open={open} onClose={close} title="Import transactions" wide={!!rows}>
      <div
        className="border border-dashed border-line2 rounded-card p-8 text-center cursor-pointer hover:bg-surface2 hover:border-brand transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <FileSpreadsheet size={32} className="mx-auto mb-2 text-ink3" />
        <p className="text-sm font-medium mb-1">Click to upload CSV, Excel, or PDF</p>
        <p className="text-xs text-ink2">
          CSV/Excel columns: date, description, amount, category, type, account, source · PDF statements auto-parsed
        </p>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden" onChange={handleFile} />

      {busy && <p className="text-sm text-ink2 mt-4 text-center">Parsing…</p>}

      {rows && (
        <div className="mt-4">
          <div className="bg-brand-bg text-brand-text text-sm rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
            <Check size={16} /> {rows.length} rows found. Review, fix categories/accounts, then import.
          </div>
          <div className="overflow-auto max-h-[50vh] border border-line rounded-lg">
            <table className="w-full text-xs min-w-[760px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-ink2 text-left">
                  {['Date', 'Description', 'Amount', 'Category', 'Type', 'Account', 'Keep'].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium border-b border-line">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.description}>{r.description}</td>
                    <td className={clsx('px-2 py-1.5 font-medium whitespace-nowrap', r.amount >= 0 ? 'text-positive' : 'text-negative')}>{fmt(r.amount)}</td>
                    <td className="px-2 py-1.5">
                      <select value={r.category} onChange={(e) => update(i, 'category', e.target.value)} className="input !py-1 !text-xs">
                        {categories.includes(r.category) ? null : <option>{r.category}</option>}
                        {categories.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.type} onChange={(e) => update(i, 'type', e.target.value)} className="input !py-1 !text-xs">
                        {['income', 'expense', 'investment', 'transfer'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.account} onChange={(e) => update(i, 'account', e.target.value)} className="input !py-1 !text-xs">
                        {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={r.keep} onChange={(e) => update(i, 'keep', e.target.checked)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={downloadCsv} className="flex-1"><Download size={16} /> Download CSV</Button>
            <Button variant="primary" onClick={confirm} className="flex-[2]"><Check size={16} /> Import {rows.filter((r) => r.keep).length} transactions</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Add cash modal ----------
export function AddCashModal({ open, onClose }) {
  const { categories, triggerRefresh } = useApp();
  const toast = useToast();
  const [form, setForm] = useState({ date: isoDate(), amount: '', description: '', category: '', type: 'income', source: 'cash' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function autofill() {
    if (!form.description.trim() || form.category.trim()) return;
    try {
      const r = await categoryRulesApi.match([form.description.trim()]);
      if (r.matches?.[0]) set('category', r.matches[0]);
    } catch {}
  }

  async function save() {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount)) return toast('Date and amount required', 'error');
    const finalAmount = form.type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    try {
      await transactionsApi.create({
        date: form.date, description: form.description.trim() || 'Cash entry',
        amount: finalAmount, category: form.category.trim() || 'Other',
        type: form.type, account: 'Cash', source: form.source,
      });
      if (form.description && form.category && form.category !== 'Other') {
        try { await categoryRulesApi.learn(form.description, form.category); } catch {}
      }
      toast('Transaction saved!', 'success');
      triggerRefresh();
      setForm({ date: isoDate(), amount: '', description: '', category: '', type: 'income', source: 'cash' });
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add cash transaction">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Amount (AUD)"><input type="number" step="0.01" className="input" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></Field>
        <Field label="Description" full><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} onBlur={autofill} placeholder="e.g. Cash painting job" /></Field>
        <Field label="Category"><input className="input" list="cats" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Side income" /><datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Type"><select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}><option value="income">Income</option><option value="expense">Expense</option></select></Field>
        <Field label="Income source" full><select className="input" value={form.source} onChange={(e) => set('source', e.target.value)}><option value="cash">Cash (no tax)</option><option value="tfn">TFN</option><option value="abn">ABN</option></select></Field>
      </div>
      <Button variant="primary" onClick={save} className="w-full mt-4"><Check size={16} /> Save transaction</Button>
    </Modal>
  );
}
