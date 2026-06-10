import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import Layout from '../components/Layout';
import PageActions from '../components/PageActions';
import { Card, CardTitle, Metric, MetricGrid, Spinner, ProgressBar } from '../components/ui';
import { taxApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { fmt } from '../lib/format';

export default function Tax() {
  const { periodParams, period, refreshKey } = useApp();
  const [est, setEst] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    taxApi.estimate(periodParams())
      .then(setEst)
      .catch(() => setEst(null))
      .finally(() => setLoading(false));
  }, [period, refreshKey]);

  const total = (est?.tfn_income || 0) + (est?.abn_income || 0) + (est?.cash_income || 0);
  const sources = [
    { label: 'TFN income', val: est?.tfn_income || 0, color: '#639922' },
    { label: 'ABN income', val: est?.abn_income || 0, color: '#7F77DD' },
    { label: 'Cash income', val: est?.cash_income || 0, color: '#BA7517' },
  ];

  return (
    <Layout title="Tax reserve" subtitle="Estimated set-aside for ABN tax & GST" actions={<PageActions />}>
      <div className="bg-warn-bg text-warn-text text-sm rounded-lg px-3.5 py-2.5 mb-4 flex items-start gap-2">
        <Info size={16} className="shrink-0 mt-0.5" />
        Estimate only. Consult a registered tax agent for your actual obligations.
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-4">
          <MetricGrid className="lg:grid-cols-5">
            <Metric label="TFN income" money={est?.tfn_income || 0} tone="positive" />
            <Metric label="ABN income" money={est?.abn_income || 0} tone="violet" />
            <Metric label="Cash income" money={est?.cash_income || 0} tone="warn" />
            <Metric label={`ABN reserve (${est?.abn_tax_rate || 0}%)`} money={est?.abn_tax_reserve || 0} tone="negative" />
            <Metric label={`GST est. (${est?.gst_rate || 0}%)`} money={est?.gst_collected_estimate || 0} tone="brand" />
          </MetricGrid>

          <Card>
            <CardTitle>Income by source</CardTitle>
            {total > 0 ? (
              <div className="space-y-3">
                {sources.map((s) => (
                  <div key={s.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{s.label}</span>
                      <span className="font-medium tabular-nums">{fmt(s.val)} <span className="text-ink3">({total ? Math.round((s.val / total) * 100) : 0}%)</span></span>
                    </div>
                    <ProgressBar value={total ? (s.val / total) * 100 : 0} color={s.color} />
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-ink3">No income recorded for this period.</p>}
          </Card>

          <Card>
            <CardTitle>GST details</CardTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between bg-surface2 rounded-lg px-3.5 py-3"><span className="text-ink2">ABN income (incl. GST)</span><span className="font-medium tabular-nums">{fmt(est?.abn_income || 0)}</span></div>
              <div className="flex justify-between bg-surface2 rounded-lg px-3.5 py-3"><span className="text-ink2">ABN income (excl. GST)</span><span className="font-medium tabular-nums">{fmt(est?.abn_income_excl_gst || 0)}</span></div>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
