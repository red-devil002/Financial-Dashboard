import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { categoriesApi } from '../api/endpoints';
import { api as rawApi } from '../api/client';

const AppContext = createContext(null);

export const PERIODS = [
  { value: '', label: 'All time' },
  { value: '2025-01-01,2025-01-31', label: 'Jan 2025' },
  { value: '2025-02-01,2025-02-28', label: 'Feb 2025' },
  { value: '2025-03-01,2025-03-31', label: 'Mar 2025' },
  { value: '2025-01-01,2025-03-31', label: 'Q1 2025' },
];

export function AppProvider({ children }) {
  const [categories, setCategories] = useState([]);
  const [period, setPeriod] = useState('');
  const [online, setOnline] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const loadCategories = useCallback(async () => {
    try {
      const cats = await categoriesApi.list();
      setCategories(cats.map((c) => c.name));
    } catch {
      /* backend offline */
    }
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      setOnline(await rawApi.health());
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    loadCategories();
    const t = setInterval(checkHealth, 20000);
    return () => clearInterval(t);
  }, [checkHealth, loadCategories, refreshKey]);

  // Convert the selected period into {from, to} query params.
  const periodParams = () => {
    if (!period) return {};
    const [from, to] = period.split(',');
    return { from, to };
  };

  return (
    <AppContext.Provider
      value={{
        categories,
        loadCategories,
        period,
        setPeriod,
        periodParams,
        online,
        refreshKey,
        triggerRefresh,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
