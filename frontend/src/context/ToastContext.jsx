import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 2800 ? null : t)), 2900);
  }, []);

  const Icon = toast?.type === 'success' ? CheckCircle2 : toast?.type === 'error' ? AlertTriangle : Info;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          className={clsx(
            'fixed bottom-5 right-5 z-[200] flex items-center gap-2 px-4 py-3 rounded-lg text-sm text-white shadow-hover animate-fade-in max-w-[90vw]',
            toast.type === 'success' && 'bg-positive',
            toast.type === 'error' && 'bg-negative',
            toast.type === 'info' && 'bg-ink'
          )}
          role="status"
        >
          <Icon size={16} /> {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.show;
}
