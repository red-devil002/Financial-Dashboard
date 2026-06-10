import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fmt, CAT_COLORS } from '../lib/format';

const axisStyle = { fontSize: 11, fill: '#9e9d98' };
const gridStyle = { stroke: 'rgba(0,0,0,0.05)' };

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-line rounded-lg shadow-hover px-3 py-2 text-xs">
      {label && <div className="font-medium text-ink mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-ink2">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-ink tabular-nums">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const compact = (v) => '$' + Number(v).toLocaleString('en-AU', { notation: 'compact', maximumFractionDigits: 1 });

// Grouped income/expense bar chart by month.
export function IncomeExpenseBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill="#1D9E75" radius={[3, 3, 0, 0]} maxBarSize={48} />
        <Bar dataKey="expenses" name="Expenses" fill="#E24B4A" radius={[3, 3, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Single-series bar chart (e.g. monthly charges).
export function SingleBars({ data, dataKey = 'value', name = 'Amount', color = '#D4537E' }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="label" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={56} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Multi-line chart (net worth — one line per account + bold total).
export function MultiLine({ data, lines }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
        <Tooltip content={<MoneyTooltip />} />
        <Legend iconType="line" iconSize={14} wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line
            key={l.key}
            type="monotone"
            dataKey={l.key}
            name={l.name}
            stroke={l.color}
            strokeWidth={l.bold ? 2.5 : 1.5}
            dot={{ r: l.bold ? 3 : 2 }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Donut chart with built-in legend showing share %.
export function DonutChart({ data, colors = CAT_COLORS }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={1}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<MoneyTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5 text-ink2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[i % colors.length] }} />
            {d.name} {total ? Math.round((d.value / total) * 100) : 0}%
          </span>
        ))}
      </div>
    </div>
  );
}
