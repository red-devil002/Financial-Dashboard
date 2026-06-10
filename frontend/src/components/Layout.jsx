import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, List, Briefcase, CreditCard, Receipt,
  Calculator, Target, Settings, Menu, X, Plus, Upload, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp, PERIODS } from '../context/AppContext';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: List },
  { to: '/business', label: 'Business', icon: Briefcase },
  { to: '/cards', label: 'Cards', icon: CreditCard },
  { to: '/receipts', label: 'Receipts', icon: Receipt },
  { to: '/tax', label: 'Tax reserve', icon: Calculator },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Mobile bottom nav shows the 5 most-used destinations.
const MOBILE_NAV = NAV.filter((n) =>
  ['/', '/transactions', '/cards', '/receipts', '/settings'].includes(n.to)
);

function HealthDot() {
  const { online } = useApp();
  return (
    <div className="flex items-center gap-2 text-xs text-ink3">
      <span
        className={clsx('w-2 h-2 rounded-full', online ? 'bg-positive' : online === false ? 'bg-negative' : 'bg-ink3')}
      />
      {online ? 'Backend online' : online === false ? 'Backend offline' : 'Connecting…'}
    </div>
  );
}

export default function Layout({ children, actions, title, subtitle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { period, setPeriod } = useApp();
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-bg">
      {/* ===== Desktop sidebar ===== */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-surface border-r border-line sticky top-0 h-screen py-6">
        <div className="px-5 pb-5 border-b border-line mb-3">
          <h1 className="text-[15px] font-semibold">Finance Dashboard</h1>
          <p className="text-xs text-ink3 mt-0.5">Personal money tracker</p>
        </div>
        <nav className="flex-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 px-5 py-2.5 text-[13px] border-l-2 transition-colors',
                  isActive
                    ? 'text-brand border-brand bg-brand-bg font-medium'
                    : 'text-ink2 border-transparent hover:bg-surface2 hover:text-ink'
                )
              }
            >
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 pt-4 border-t border-line">
          <HealthDot />
        </div>
      </aside>

      {/* ===== Mobile slide-over menu ===== */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[120] bg-black/40" onClick={() => setMenuOpen(false)}>
          <div className="w-64 h-full bg-surface py-6 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pb-4 border-b border-line mb-3 flex items-center justify-between">
              <div>
                <h1 className="text-[15px] font-semibold">Finance Dashboard</h1>
                <HealthDot />
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1 text-ink3"><X size={20} /></button>
            </div>
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-2.5 px-5 py-3 text-sm',
                    isActive ? 'text-brand bg-brand-bg font-medium' : 'text-ink2'
                  )
                }
              >
                <Icon size={18} /> {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      {/* ===== Main column ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-[100] bg-bg/90 backdrop-blur border-b border-line">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="md:hidden p-1.5 -ml-1 text-ink2"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={22} />
              </button>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold truncate">{title}</h2>
                {subtitle && <p className="text-xs text-ink2 truncate">{subtitle}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="input !w-auto !py-1.5 text-xs hidden sm:block"
              >
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {actions}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 pb-24 md:pb-6 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ===== Mobile bottom nav ===== */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-[110] bg-surface border-t border-line flex safe-bottom">
        {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => {
          const active = end ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={clsx(
                'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px]',
                active ? 'text-brand' : 'text-ink3'
              )}
            >
              <Icon size={20} /> {label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export { Plus, Upload, Sparkles };
