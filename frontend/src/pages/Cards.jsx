import { useState, useEffect } from 'react';
import { CreditCard, Plus, Pencil, Trash2, ArrowLeft, Wallet, FileUp, CalendarClock, FileText, X } from 'lucide-react';
import Layout from '../components/Layout';
import { Card, CardTitle, Metric, MetricGrid, Button, Badge, Spinner, EmptyState, ProgressBar } from '../components/ui';
import { SingleBars, DonutChart } from '../components/Charts';
import EditTransactionModal from '../components/EditTransactionModal';
import { CardFormModal, PayCardModal, ImportStatementModal } from '../components/CardModals';
import AddCardTransactionModal from '../components/AddCardTransactionModal';
import { cardsApi, transactionsApi, importsApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { fmt, pct } from '../lib/format';

export default function Cards() {
  const { refreshKey, triggerRefresh } = useApp();
  const toast = useToast();
  const [cards, setCards] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [stmtImports, setStmtImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editCard, setEditCard] = useState(null);
  const [payCard, setPayCard] = useState(null);
  const [importCard, setImportCard] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([cardsApi.summary(), cardsApi.repayments(), importsApi.list('statement')])
      .then(([c, r, im]) => { setCards(c); setRepayments(r); setStmtImports(im); })
      .catch(() => { setCards([]); setRepayments([]); })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function removeCard(id) {
    if (!confirm('Delete this card? Its transactions stay but lose the card link.')) return;
    try { await cardsApi.remove(id); toast('Card deleted'); if (selected?.id === id) setSelected(null); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  // Aggregate metrics
  const totalOwed = cards.reduce((s, c) => s + (c.balance || 0), 0);
  const totalCharged = cards.reduce((s, c) => s + (c.charged || 0), 0);
  const totalLimit = cards.reduce((s, c) => s + (parseFloat(c.credit_limit) || 0), 0);
  const util = totalLimit ? pct(totalOwed, totalLimit) : 0;

  if (loading) return <Layout title="Cards"><Spinner /></Layout>;

  // ===== Detail view =====
  if (selected) {
    const card = cards.find((c) => c.id === selected.id) || selected;
    return (
      <Layout
        title={card.name}
        subtitle={`Repayment due day ${card.due_day || '—'}`}
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setPayCard(card)}><Wallet size={16} /> <span className="hidden sm:inline">Pay card</span></Button>
            <Button onClick={() => setImportCard(card)}><FileUp size={16} /> <span className="hidden sm:inline">Import statement</span></Button>
            <Button onClick={() => { setEditCard(card); setFormOpen(true); }}><Pencil size={16} /></Button>
          </div>
        }
      >
        <Button onClick={() => setSelected(null)} className="mb-4"><ArrowLeft size={16} /> All cards</Button>
        <CardDetail card={card} />
        <CardFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditCard(null); }} card={editCard} />
        <PayCardModal open={!!payCard} onClose={() => setPayCard(null)} card={payCard} />
        <ImportStatementModal open={!!importCard} onClose={() => setImportCard(null)} card={importCard} />
      </Layout>
    );
  }

  // ===== List view =====
  return (
    <Layout
      title="Cards"
      subtitle="Credit cards & repayments"
      actions={<Button variant="primary" onClick={() => { setEditCard(null); setFormOpen(true); }}><Plus size={16} /> <span className="hidden sm:inline">Add card</span></Button>}
    >
      {cards.length === 0 ? (
        <Card><EmptyState icon={CreditCard} title="No cards yet" hint="Add a credit card to track charges, balance and repayments." /></Card>
      ) : (
        <div className="space-y-4">
          <MetricGrid className="lg:grid-cols-5">
            <Metric label="Total owed" money={totalOwed} tone="negative" />
            <Metric label="Total charged" money={totalCharged} tone="ink" />
            <Metric label="Total paid" money={totalCharged - totalOwed} tone="positive" />
            <Metric label="Total limit" money={totalLimit} tone="brand" />
            <Metric label="Utilization" value={`${util}%`} tone={util > 70 ? 'negative' : util > 30 ? 'warn' : 'positive'} />
          </MetricGrid>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => {
              const limit = parseFloat(c.credit_limit) || 0;
              const u = limit ? pct(c.balance, limit) : 0;
              return (
                <Card key={c.id} className="cursor-pointer hover:shadow-hover transition-shadow" >
                  <div onClick={() => setSelected(c)}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: c.color || '#888' }} />
                        <div>
                          <div className="font-semibold leading-tight">{c.name}</div>
                          {c.last4 && <div className="text-xs text-ink3">•••• {c.last4}</div>}
                        </div>
                      </div>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setEditCard(c); setFormOpen(true); }} className="p-1 text-ink3 hover:text-brand"><Pencil size={14} /></button>
                        <button onClick={() => removeCard(c.id)} className="p-1 text-ink3 hover:text-negative"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <div className="text-2xl font-semibold text-negative tabular-nums">{fmt(c.balance)}</div>
                    <div className="text-xs text-ink3 mb-2">owed of {limit ? fmt(limit) : 'no limit'}</div>
                    {limit > 0 && <ProgressBar value={u} color={u > 70 ? '#E24B4A' : u > 30 ? '#BA7517' : '#1D9E75'} />}
                  </div>
                  <div className="flex gap-2 mt-3" >
                    <Button onClick={() => setPayCard(c)} className="flex-1 !py-1.5 text-xs"><Wallet size={14} /> Pay</Button>
                    <Button onClick={() => setImportCard(c)} className="flex-1 !py-1.5 text-xs"><FileUp size={14} /> Import</Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardTitle><span className="flex items-center gap-1.5"><CalendarClock size={14} /> Upcoming repayments</span></CardTitle>
            {repayments.length === 0 ? (
              <p className="text-sm text-ink3">No upcoming repayments.</p>
            ) : (
              <div className="divide-y divide-line">
                {repayments.map((r, i) => {
                  const overdue = new Date(r.due_date) < new Date(new Date().toDateString());
                  const soon = !overdue && (new Date(r.due_date) - new Date()) < 7 * 864e5;
                  return (
                    <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <div className="font-medium">{r.label}</div>
                        <div className="text-xs text-ink3">{r.card_name || ''} · {r.kind === 'card' ? 'statement' : 'instalment'}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{fmt(r.amount)}</div>
                        <div className={`text-xs ${overdue ? 'text-negative' : soon ? 'text-warn' : 'text-ink3'}`}>
                          {overdue ? 'Overdue · ' : soon ? 'Due soon · ' : ''}{(r.due_date || '').slice(0, 10)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Imported statements</CardTitle>
            {stmtImports.length === 0 ? (
              <p className="text-sm text-ink3">No statements imported yet.</p>
            ) : (
              <div className="divide-y divide-line">
                {stmtImports.map((im) => (
                  <div key={im.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText size={18} className="text-ink3 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{im.filename}</div>
                        <div className="text-xs text-ink3">{im.row_count} transactions{im.card_name ? ` · ${im.card_name}` : ''} · {(im.imported_at || '').slice(0, 10)}</div>
                      </div>
                    </div>
                    <button onClick={async () => { await importsApi.remove(im.id); triggerRefresh(); }} className="p-1.5 text-ink3 hover:text-negative shrink-0"><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <CardFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditCard(null); }} card={editCard} />
      <PayCardModal open={!!payCard} onClose={() => setPayCard(null)} card={payCard} />
      <ImportStatementModal open={!!importCard} onClose={() => setImportCard(null)} card={importCard} />
    </Layout>
  );
}

// ===== Card detail (metrics, charts, transactions) =====
function CardDetail({ card }) {
  const { refreshKey } = useApp();
  const toast = useToast();
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PER = 15;

  useEffect(() => {
    setLoading(true);
    transactionsApi.list({ card_id: card.id, limit: 1000 })
      .then((d) => setTxs(d.transactions || []))
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }, [card.id, refreshKey]);

  const limit = parseFloat(card.credit_limit) || 0;
  const u = limit ? pct(card.balance, limit) : 0;

  // Charts
  const byCat = {};
  const byMonth = {};
  txs.forEach((t) => {
    if (t.type === 'expense') {
      byCat[t.category] = (byCat[t.category] || 0) + Math.abs(parseFloat(t.amount));
      const m = (t.date || '').slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + Math.abs(parseFloat(t.amount));
    }
  });
  const catData = Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const monthData = Object.entries(byMonth).sort().map(([label, value]) => ({ label, value }));

  const filtered = txs.filter((t) => !search || (t.description || '').toLowerCase().includes(search.toLowerCase()) || (t.category || '').toLowerCase().includes(search.toLowerCase()));
  const pageRows = filtered.slice(page * PER, page * PER + PER);

  async function remove(id) {
    if (!confirm('Delete this transaction?')) return;
    try { await transactionsApi.remove(id); toast('Deleted'); setTxs((t) => t.filter((x) => x.id !== id)); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <div className="space-y-4">
      <MetricGrid className="lg:grid-cols-5">
        <Metric label="Balance owed" money={card.balance} tone="negative" />
        <Metric label="Total charged" money={card.charged} tone="ink" />
        <Metric label="Total paid" money={card.paid} tone="positive" />
        <Metric label="Credit limit" money={limit} tone="brand" />
        <Metric label="Utilization" value={`${u}%`} tone={u > 70 ? 'negative' : u > 30 ? 'warn' : 'positive'} />
      </MetricGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle>Spending by category</CardTitle>
          <div className="h-56">{catData.length ? <DonutChart data={catData} /> : <EmptyState title="No charges yet" />}</div>
        </Card>
        <Card>
          <CardTitle>Monthly charges</CardTitle>
          <div className="h-56">{monthData.length ? <SingleBars data={monthData} /> : <EmptyState title="No charges yet" />}</div>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="p-3 border-b border-line flex flex-col sm:flex-row gap-2 sm:items-center">
          <input className="input flex-1" placeholder="Search transactions…" value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
          <Button variant="primary" onClick={() => setAddOpen(true)} className="justify-center shrink-0"><Plus size={16} /> Add transaction</Button>
        </div>
        {loading ? <Spinner /> : pageRows.length === 0 ? (
          <EmptyState title="No transactions" hint="Import this card's statement, or use “Add transaction” to enter one manually." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-ink2 text-left text-xs">{['Date', 'Description', 'Category', 'Amount', ''].map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${h === 'Amount' ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
              <tbody>
                {pageRows.map((r) => {
                  const v = parseFloat(r.amount);
                  const isPay = r.category === 'Credit card payment' || r.type === 'income';
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="px-3 py-2 text-ink2 whitespace-nowrap">{(r.date || '').slice(0, 10)}</td>
                      <td className="px-3 py-2 max-w-[220px] truncate" title={r.description}>{r.description}</td>
                      <td className="px-3 py-2 text-ink2 text-xs">{r.category}</td>
                      <td className={`px-3 py-2 text-right font-medium tabular-nums ${isPay ? 'text-positive' : 'text-negative'}`}>{fmt(Math.abs(v))}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(r)} className="p-1 text-ink3 hover:text-brand"><Pencil size={14} /></button>
                        <button onClick={() => remove(r.id)} className="p-1 text-ink3 hover:text-negative"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > PER && (
              <div className="p-3 border-t border-line flex items-center justify-between text-sm">
                <span className="text-ink2">{page * PER + 1}–{Math.min((page + 1) * PER, filtered.length)} of {filtered.length}</span>
                <div className="flex gap-2">
                  <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹ Prev</Button>
                  <Button disabled={(page + 1) * PER >= filtered.length} onClick={() => setPage((p) => p + 1)}>Next ›</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <EditTransactionModal open={!!editing} onClose={() => setEditing(null)} tx={editing} cards={[card]} showCardFields />
      <AddCardTransactionModal open={addOpen} onClose={() => setAddOpen(false)} card={card} />
    </div>
  );
}