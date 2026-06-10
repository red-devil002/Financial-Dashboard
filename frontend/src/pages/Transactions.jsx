import { useState, useEffect, useCallback } from 'react';
import { Search, Pencil, Trash2, FileText, X } from 'lucide-react';
import Layout from '../components/Layout';
import PageActions from '../components/PageActions';
import { Card, CardTitle, Button, Badge, Spinner, EmptyState } from '../components/ui';
import EditTransactionModal from '../components/EditTransactionModal';
import { transactionsApi, importsApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { fmt, ACCOUNTS, TX_TYPES, SOURCES } from '../lib/format';

const PAGE = 100;

export default function Transactions() {
  const { refreshKey, triggerRefresh } = useApp();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ search: '', account: '', type: '', source: '' });
  const [editing, setEditing] = useState(null);
  const [imports, setImports] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE, offset };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const data = await transactionsApi.list(params);
      setRows(data.transactions || []);
      setTotal(data.total || 0);
    } catch {
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, filters, refreshKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { importsApi.list('general').then(setImports).catch(() => setImports([])); }, [refreshKey]);

  const setFilter = (k, v) => { setOffset(0); setFilters((f) => ({ ...f, [k]: v })); };

  async function remove(id) {
    if (!confirm('Delete this transaction?')) return;
    try { await transactionsApi.remove(id); toast('Transaction deleted'); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function removeImport(id) {
    try { await importsApi.remove(id); toast('Removed from history'); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Layout title="Transactions" subtitle={`${total} transactions`} actions={<PageActions />}>
      <Card className="!p-0 overflow-hidden">
        {/* Filters */}
        <div className="p-3 sm:p-4 border-b border-line flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input
              className="input !pl-9"
              placeholder="Search transactions…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 sm:flex gap-2">
            <select className="input !w-auto" value={filters.account} onChange={(e) => setFilter('account', e.target.value)}>
              <option value="">All accounts</option>
              {ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
            </select>
            <select className="input !w-auto" value={filters.type} onChange={(e) => setFilter('type', e.target.value)}>
              <option value="">All types</option>
              {TX_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className="input !w-auto" value={filters.source} onChange={(e) => setFilter('source', e.target.value)}>
              <option value="">All sources</option>
              {SOURCES.filter((s) => s.value).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileText} title="No transactions found" hint="Try clearing filters, or load sample data." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ink2 text-left text-xs">
                    {['Date', 'Description', 'Account', 'Category', 'Type', 'Amount', ''].map((h, i) => (
                      <th key={i} className={`px-4 py-2.5 font-medium ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const v = parseFloat(r.amount);
                    return (
                      <tr key={r.id} className="border-t border-line hover:bg-surface2/50">
                        <td className="px-4 py-2.5 text-ink2 whitespace-nowrap">{(r.date || '').slice(0, 10)}</td>
                        <td className="px-4 py-2.5 max-w-[280px] truncate" title={r.description}>{r.description || '—'}</td>
                        <td className="px-4 py-2.5 text-ink2">{r.account}</td>
                        <td className="px-4 py-2.5 text-ink2">{r.category}</td>
                        <td className="px-4 py-2.5"><Badge tone={r.type}>{r.type}</Badge></td>
                        <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${v >= 0 ? 'text-positive' : 'text-negative'}`}>{fmt(v)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => setEditing(r)} className="p-1.5 text-ink3 hover:text-brand" aria-label="Edit"><Pencil size={15} /></button>
                          <button onClick={() => remove(r.id)} className="p-1.5 text-ink3 hover:text-negative" aria-label="Delete"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-line">
              {rows.map((r) => {
                const v = parseFloat(r.amount);
                return (
                  <div key={r.id} className="p-3.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.description || '—'}</div>
                      <div className="text-xs text-ink2 mt-0.5">{(r.date || '').slice(0, 10)} · {r.account}</div>
                      <div className="mt-1 flex items-center gap-2"><Badge tone={r.type}>{r.type}</Badge><span className="text-xs text-ink3">{r.category}</span></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-semibold tabular-nums ${v >= 0 ? 'text-positive' : 'text-negative'}`}>{fmt(v)}</div>
                      <div className="mt-1">
                        <button onClick={() => setEditing(r)} className="p-1 text-ink3"><Pencil size={15} /></button>
                        <button onClick={() => remove(r.id)} className="p-1 text-ink3"><Trash2 size={15} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="p-3 border-t border-line flex items-center justify-between text-sm">
              <span className="text-ink2">
                {total > PAGE ? `Showing ${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}` : `${total} transactions`}
              </span>
              {total > PAGE && (
                <div className="flex gap-2">
                  <Button disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹ Prev</Button>
                  <Button disabled={offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>Next ›</Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {/* Imported files */}
      <Card className="mt-4">
        <CardTitle>Imported files</CardTitle>
        {imports.length === 0 ? (
          <p className="text-sm text-ink3">No files imported yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {imports.map((im) => (
              <div key={im.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={18} className="text-ink3 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{im.filename}</div>
                    <div className="text-xs text-ink3">{im.row_count} transactions · {(im.imported_at || '').slice(0, 10)}</div>
                  </div>
                </div>
                <button onClick={() => removeImport(im.id)} className="p-1.5 text-ink3 hover:text-negative shrink-0"><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <EditTransactionModal open={!!editing} onClose={() => setEditing(null)} tx={editing} />
    </Layout>
  );
}
