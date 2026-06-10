import { useState, useEffect } from 'react';
import { ArrowRightLeft, Check } from 'lucide-react';
import Layout from '../components/Layout';
import PageActions from '../components/PageActions';
import { Card, CardTitle, Metric, MetricGrid, Button, Field, Spinner, EmptyState, ProgressBar } from '../components/ui';
import { IncomeExpenseBars } from '../components/Charts';
import { transactionsApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { fmt, ACCOUNTS, isoDate, CAT_COLORS } from '../lib/format';

export default function Business() {
  const { periodParams, period, refreshKey, triggerRefresh } = useApp();
  const toast = useToast();
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transfer, setTransfer] = useState({ from: 'Personal everyday', to: 'Personal savings', amount: '', date: isoDate(), description: 'Transfer' });

  useEffect(() => {
    setLoading(true);
    transactionsApi.businessPL(periodParams())
      .then(setPl)
      .catch(() => setPl(null))
      .finally(() => setLoading(false));
  }, [period, refreshKey]);

  const byMonth = (pl?.by_month || []).map((r) => ({
    month: r.month, income: parseFloat(r.income) || 0, expenses: parseFloat(r.expenses) || 0,
  }));
  const cats = pl?.expenses_by_category || [];
  const maxC = Math.max(...cats.map((c) => parseFloat(c.total)), 1);

  const set = (k, v) => setTransfer((t) => ({ ...t, [k]: v }));

  async function doTransfer() {
    const amount = parseFloat(transfer.amount);
    if (isNaN(amount) || amount <= 0) return toast('Enter a positive amount', 'error');
    if (transfer.from === transfer.to) return toast('Choose two different accounts', 'error');
    try {
      await transactionsApi.bulk([
        { date: transfer.date, description: `${transfer.description} (out)`, amount: -Math.abs(amount), category: 'Transfer', type: 'transfer', account: transfer.from, source: '' },
        { date: transfer.date, description: `${transfer.description} (in)`, amount: Math.abs(amount), category: 'Transfer', type: 'transfer', account: transfer.to, source: '' },
      ]);
      toast('Transfer recorded', 'success');
      triggerRefresh();
      setTransfer((t) => ({ ...t, amount: '' }));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Layout title="Business" subtitle="ABN income, profit & loss, transfers" actions={<PageActions />}>
      {loading ? <Spinner /> : (
        <div className="space-y-4">
          <Card>
            <CardTitle>Profit &amp; loss (tax view)</CardTitle>
            <MetricGrid className="sm:grid-cols-3 lg:grid-cols-3 mb-4">
              <Metric label="Business income" money={pl?.total_income || 0} tone="positive" />
              <Metric label="Deductible expenses" money={pl?.total_expenses || 0} tone="negative" />
              <Metric label="Net profit" money={pl?.net_profit || 0} tone={(pl?.net_profit || 0) >= 0 ? 'positive' : 'negative'} />
            </MetricGrid>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <div className="text-xs text-ink2 mb-2">Deductible expenses by category</div>
                {cats.length ? (
                  <div className="space-y-2.5">
                    {cats.map((c, i) => {
                      const v = parseFloat(c.total);
                      return (
                        <div key={c.category}>
                          <div className="flex justify-between text-sm mb-1"><span>{c.category}</span><span className="font-medium tabular-nums">{fmt(v)}</span></div>
                          <ProgressBar value={(v / maxC) * 100} color={CAT_COLORS[i % CAT_COLORS.length]} />
                        </div>
                      );
                    })}
                  </div>
                ) : <p className="text-sm text-ink3">No business expenses recorded.</p>}
              </div>
              <div className="h-52">
                {byMonth.length ? <IncomeExpenseBars data={byMonth} /> : <EmptyState title="No monthly data" />}
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Transfer between accounts</CardTitle>
            <p className="text-xs text-ink2 mb-3">Moves money between your accounts. Recorded as a transfer, so it doesn't count as income or expense.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <Field label="From"><select className="input" value={transfer.from} onChange={(e) => set('from', e.target.value)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
              <Field label="To"><select className="input" value={transfer.to} onChange={(e) => set('to', e.target.value)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
              <Field label="Amount"><input type="number" step="0.01" className="input" value={transfer.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0.00" /></Field>
              <Field label="Date"><input type="date" className="input" value={transfer.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Button variant="primary" onClick={doTransfer}><ArrowRightLeft size={16} /> Transfer</Button>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
