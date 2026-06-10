import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import PageActions from '../components/PageActions';
import { Card, CardTitle, Metric, MetricGrid, Spinner, EmptyState } from '../components/ui';
import { IncomeExpenseBars, DonutChart, MultiLine } from '../components/Charts';
import { transactionsApi, taxApi, accountsApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { fmt, pct, ACCT_COLORS, CAT_COLORS } from '../lib/format';
import { LayoutDashboard } from 'lucide-react';

export default function Overview() {
  const { periodParams, period, refreshKey } = useApp();
  const [data, setData] = useState(null);
  const [networth, setNetworth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [summary, nw] = await Promise.all([
          transactionsApi.summary(periodParams()),
          accountsApi.netWorth(),
        ]);
        if (!alive) return;
        setData(summary);
        setNetworth(nw);
      } catch {
        if (alive) { setData(null); setNetworth(null); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [period, refreshKey]);

  const s = data?.summary;
  const income = parseFloat(s?.total_income) || 0;
  const expenses = parseFloat(s?.total_expenses) || 0;
  const invested = parseFloat(s?.total_invested) || 0;
  const net = income - expenses - invested;
  const rate = income > 0 ? Math.round((net / income) * 100) : 0;

  const cashflow = (data?.by_month || []).map((r) => ({
    month: r.month, income: parseFloat(r.income) || 0, expenses: parseFloat(r.expenses) || 0,
  }));
  const catData = (data?.by_category || []).slice(0, 8).map((r) => ({ name: r.category, value: parseFloat(r.total) || 0 }));
  const accounts = data?.by_account || [];
  const maxBal = Math.max(...accounts.map((r) => Math.abs(parseFloat(r.balance) || 0)), 1);

  // Net worth lines: one per account + bold total.
  const nwData = networth?.months?.map((m, i) => {
    const row = { month: m };
    networth.accounts.forEach((a) => { row[a] = networth.series[a][i]; });
    row.__total = networth.total[i];
    return row;
  }) || [];
  const nwLines = networth?.accounts?.map((a, i) => ({
    key: a, name: a, color: ACCT_COLORS[a] || CAT_COLORS[i % CAT_COLORS.length],
  })) || [];
  nwLines.push({ key: '__total', name: 'Total net worth', color: '#1a1a18', bold: true });

  const total = parseInt(s?.total_transactions) || (cashflow.length ? '' : 0);

  return (
    <Layout title="Overview" subtitle={loading ? 'Loading data…' : `${total !== '' ? total + ' transactions · ' : ''}your money at a glance`} actions={<PageActions />}>
      {loading ? (
        <Spinner />
      ) : !data ? (
        <Card><EmptyState icon={LayoutDashboard} title="No data yet" hint="Load sample data or import transactions to get started." /></Card>
      ) : (
        <div className="space-y-4">
          <MetricGrid className="lg:grid-cols-6">
            <Metric label="Total income" money={income} tone="positive" />
            <Metric label="Total expenses" money={expenses} tone="negative" />
            <Metric label="Invested" money={invested} tone="brand" />
            <Metric label="Net savings" money={net} tone={net >= 0 ? 'positive' : 'negative'} />
            <Metric label="Savings rate" value={`${rate}%`} tone={rate >= 20 ? 'positive' : rate >= 0 ? 'warn' : 'negative'} />
            <Metric label="ABN income" money={parseFloat(s?.abn_income) || 0} tone="violet" />
          </MetricGrid>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardTitle>Monthly cash flow</CardTitle>
              <div className="h-56">
                {cashflow.length ? <IncomeExpenseBars data={cashflow} /> : <EmptyState title="No monthly data" />}
              </div>
            </Card>
            <Card>
              <CardTitle>Spending by category</CardTitle>
              <div className="h-56">
                {catData.length ? <DonutChart data={catData} /> : <EmptyState title="No spending yet" />}
              </div>
            </Card>
          </div>

          <Card>
            <CardTitle>Account balances</CardTitle>
            {accounts.length ? (
              <div className="space-y-3">
                {accounts.map((r) => {
                  const v = parseFloat(r.balance) || 0;
                  return (
                    <div key={r.account}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{r.account}</span>
                        <span className={`font-medium tabular-nums ${v >= 0 ? 'text-positive' : 'text-negative'}`}>{fmt(v)}</span>
                      </div>
                      <div className="w-full bg-surface2 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct(Math.abs(v), maxBal)}%`, background: ACCT_COLORS[r.account] || '#888780' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <EmptyState title="No accounts yet" />}
          </Card>

          <Card>
            <CardTitle>Net worth over time</CardTitle>
            <div className="h-72">
              {nwData.length ? <MultiLine data={nwData} lines={nwLines} /> : <EmptyState title="Not enough history yet" hint="Net worth builds up as you add transactions across months." />}
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
