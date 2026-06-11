import { useState, useEffect } from 'react';
import { Plus, Trash2, ArrowRight, Save, AlertTriangle } from 'lucide-react';
import Layout from '../components/Layout';
import { Card, CardTitle, Button, Field, Spinner } from '../components/ui';
import { taxApi, categoriesApi, categoryRulesApi, transactionsApi, adminApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { SAMPLE_TRANSACTIONS } from '../lib/format';

const CLEAR_OPTIONS = [
  { key: 'transactions', label: 'Transactions' },
  { key: 'receipts', label: 'Receipts (and their images)' },
  { key: 'imports', label: 'Import history' },
  { key: 'cards', label: 'Cards' },
  { key: 'goals', label: 'Goals' },
  { key: 'rules', label: 'Auto-category rules' },
  { key: 'categories', label: 'Categories' },
  { key: 'tax', label: 'Tax rates (reset to defaults)' },
];

export default function SettingsPage() {
  const { categories, loadCategories, triggerRefresh } = useApp();
  const toast = useToast();
  const [rates, setRates] = useState(null);
  const [rules, setRules] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [clearSel, setClearSel] = useState({});
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    Promise.all([taxApi.get(), categoryRulesApi.list()])
      .then(([r, rl]) => { setRates({ abn_tax_rate: r.abn_tax_rate, gst_rate: r.gst_rate }); setRules(rl); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const reloadRules = () => categoryRulesApi.list().then(setRules).catch(() => {});

  async function saveRates() {
    try {
      await taxApi.update({ abn_tax_rate: parseFloat(rates.abn_tax_rate), gst_rate: parseFloat(rates.gst_rate) });
      toast('Tax rates saved', 'success');
      triggerRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function addCat() {
    if (!newCat.trim()) return;
    try { await categoriesApi.create(newCat.trim()); setNewCat(''); loadCategories(); toast('Category added', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function delCat(name) {
    // categories list endpoint returns names via context; fetch id list to delete
    try {
      const all = await categoriesApi.list();
      const found = all.find((c) => c.name === name);
      if (found) { await categoriesApi.remove(found.id); loadCategories(); toast('Category removed'); }
    } catch (err) { toast(err.message, 'error'); }
  }

  async function delRule(id) {
    try { await categoryRulesApi.remove(id); reloadRules(); toast('Rule removed'); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function loadSample() {
    try { await transactionsApi.bulk(SAMPLE_TRANSACTIONS); toast('Sample data loaded', 'success'); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  const toggleClear = (key) => setClearSel((s) => ({ ...s, [key]: !s[key] }));

  async function clearData() {
    const scopes = Object.keys(clearSel).filter((k) => clearSel[k]);
    if (scopes.length === 0) return toast('Pick at least one type to clear', 'error');
    const labels = CLEAR_OPTIONS.filter((o) => scopes.includes(o.key)).map((o) => o.label).join(', ');
    if (!window.confirm(`Permanently delete: ${labels}?\n\nThis cannot be undone.`)) return;
    setClearing(true);
    try {
      await adminApi.reset(scopes);
      toast('Data cleared', 'success');
      setClearSel({});
      loadCategories();
      reloadRules();
      // refresh tax rates too in case they were reset
      try { const r = await taxApi.get(); setRates({ abn_tax_rate: r.abn_tax_rate, gst_rate: r.gst_rate }); } catch {}
      triggerRefresh();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setClearing(false);
    }
  }

  if (loading) return <Layout title="Settings"><Spinner /></Layout>;

  return (
    <Layout title="Settings" subtitle="Tax rates, categories & automation">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Tax rates</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ABN tax reserve (%)"><input type="number" className="input" value={rates?.abn_tax_rate ?? ''} onChange={(e) => setRates((r) => ({ ...r, abn_tax_rate: e.target.value }))} /></Field>
            <Field label="GST rate (%)"><input type="number" className="input" value={rates?.gst_rate ?? ''} onChange={(e) => setRates((r) => ({ ...r, gst_rate: e.target.value }))} /></Field>
          </div>
          <Button variant="primary" onClick={saveRates} className="mt-3"><Save size={16} /> Save rates</Button>
        </Card>

        <Card>
          <CardTitle>Manage categories</CardTitle>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 bg-surface2 rounded-full pl-3 pr-1.5 py-1 text-sm">
                {c}
                <button onClick={() => delCat(c)} className="text-ink3 hover:text-negative"><Trash2 size={13} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCat()} />
            <Button variant="primary" onClick={addCat}><Plus size={16} /> Add</Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Auto-category rules</CardTitle>
          <p className="text-xs text-ink3 mb-3">Learned from your edits and imports — when a description contains a keyword, this category is suggested automatically.</p>
          {rules.length === 0 ? (
            <p className="text-sm text-ink3">No rules learned yet. Categorize a few transactions and they'll appear here.</p>
          ) : (
            <div className="divide-y divide-line">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="font-mono text-ink2 flex-1 truncate" title={r.keyword}>"{r.keyword}"</span>
                  <ArrowRight size={14} className="text-ink3 shrink-0" />
                  <span className="flex-1 font-medium truncate">{r.category}</span>
                  <span className="text-[11px] text-ink3">×{r.hits}</span>
                  <button onClick={() => delRule(r.id)} className="p-1 text-ink3 hover:text-negative"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Data</CardTitle>
          <p className="text-sm text-ink2 mb-3">Load a set of sample transactions to explore the dashboard.</p>
          <Button onClick={loadSample}><Plus size={16} /> Load sample data</Button>
        </Card>

        <Card className="lg:col-span-2 border-negative/30">
          <CardTitle className="text-negative flex items-center gap-2"><AlertTriangle size={18} /> Clear data</CardTitle>
          <p className="text-sm text-ink2 mb-3">
            Tick what you want to permanently remove, then clear. This can't be undone, so use it carefully.
          </p>
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            {CLEAR_OPTIONS.map((o) => (
              <label key={o.key} className="flex items-center gap-2 cursor-pointer select-none text-sm bg-surface2 rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-negative cursor-pointer shrink-0"
                  checked={!!clearSel[o.key]}
                  onChange={() => toggleClear(o.key)}
                />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
          </div>
          <Button
            onClick={clearData}
            disabled={clearing || Object.values(clearSel).every((v) => !v)}
            className="!bg-negative !text-white hover:!opacity-90 justify-center"
          >
            <Trash2 size={16} /> {clearing ? 'Clearing…' : 'Clear selected data'}
          </Button>
        </Card>
      </div>
    </Layout>
  );
}