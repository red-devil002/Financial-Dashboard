import { useState, useEffect } from 'react';
import { Target, Plus, Trash2, Check } from 'lucide-react';
import Layout from '../components/Layout';
import PageActions from '../components/PageActions';
import { Card, CardTitle, Button, Field, Spinner, EmptyState, ProgressBar, Modal } from '../components/ui';
import { goalsApi } from '../api/endpoints';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { fmt, ACCOUNTS, isoDate } from '../lib/format';

export default function Goals() {
  const { refreshKey, triggerRefresh } = useApp();
  const toast = useToast();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', target_amount: '', current_amount: '', account: 'Personal savings', deadline: '' });

  useEffect(() => {
    setLoading(true);
    goalsApi.list().then(setGoals).catch(() => setGoals([])).finally(() => setLoading(false));
  }, [refreshKey]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function add() {
    const target = parseFloat(form.target_amount);
    if (!form.name.trim() || isNaN(target)) return toast('Name and target required', 'error');
    try {
      await goalsApi.create({
        name: form.name.trim(), target_amount: target,
        current_amount: parseFloat(form.current_amount) || 0,
        account: form.account, deadline: form.deadline || null,
      });
      toast('Goal added', 'success');
      setOpen(false);
      setForm({ name: '', target_amount: '', current_amount: '', account: 'Personal savings', deadline: '' });
      triggerRefresh();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function remove(id) {
    if (!confirm('Delete this goal?')) return;
    try { await goalsApi.remove(id); toast('Goal deleted'); triggerRefresh(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <Layout
      title="Goals"
      subtitle="Track your savings targets"
      actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={16} /> <span className="hidden sm:inline">New goal</span></Button>}
    >
      {loading ? <Spinner /> : goals.length === 0 ? (
        <Card><EmptyState icon={Target} title="No goals yet" hint="Create a savings goal to track your progress." /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((g) => {
            const cur = parseFloat(g.current_amount) || 0;
            const tgt = parseFloat(g.target_amount) || 1;
            const p = Math.round((cur / tgt) * 100);
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold">{g.name}</div>
                    <div className="text-xs text-ink3">{g.account}{g.deadline ? ` · by ${(g.deadline || '').slice(0, 10)}` : ''}</div>
                  </div>
                  <button onClick={() => remove(g.id)} className="p-1 text-ink3 hover:text-negative"><Trash2 size={15} /></button>
                </div>
                <ProgressBar value={p} color={p >= 100 ? '#1D9E75' : '#378ADD'} height={8} />
                <div className="flex justify-between text-sm mt-2">
                  <span className="font-medium tabular-nums">{fmt(cur)}</span>
                  <span className="text-ink3 tabular-nums">of {fmt(tgt)} · {p}%</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New savings goal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Goal name" full><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Emergency fund" /></Field>
          <Field label="Target amount"><input type="number" step="0.01" className="input" value={form.target_amount} onChange={(e) => set('target_amount', e.target.value)} /></Field>
          <Field label="Current amount"><input type="number" step="0.01" className="input" value={form.current_amount} onChange={(e) => set('current_amount', e.target.value)} placeholder="0.00" /></Field>
          <Field label="Account"><select className="input" value={form.account} onChange={(e) => set('account', e.target.value)}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Deadline (optional)"><input type="date" className="input" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
        </div>
        <Button variant="primary" onClick={add} className="w-full mt-4"><Check size={16} /> Add goal</Button>
      </Modal>
    </Layout>
  );
}
