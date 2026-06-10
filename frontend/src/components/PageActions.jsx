import { useState } from 'react';
import { Plus, Upload, Sparkles } from 'lucide-react';
import { Button } from './ui';
import { ImportModal, AddCashModal } from './SharedModals';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { transactionsApi } from '../api/endpoints';
import { SAMPLE_TRANSACTIONS } from '../lib/format';

// The Import / Add cash / Load sample buttons shown in the page header.
export default function PageActions() {
  const [importOpen, setImportOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const { triggerRefresh } = useApp();
  const toast = useToast();

  async function loadSample() {
    try {
      const r = await transactionsApi.bulk(SAMPLE_TRANSACTIONS);
      toast(`Sample data loaded — ${r.inserted ?? SAMPLE_TRANSACTIONS.length} transactions`, 'success');
      triggerRefresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <Button onClick={() => setImportOpen(true)} className="!px-2.5 sm:!px-3.5">
        <Upload size={16} /> <span className="hidden sm:inline">Import</span>
      </Button>
      <Button onClick={() => setCashOpen(true)} className="!px-2.5 sm:!px-3.5">
        <Plus size={16} /> <span className="hidden sm:inline">Add cash</span>
      </Button>
      <Button variant="primary" onClick={loadSample} className="!px-2.5 sm:!px-3.5">
        <Sparkles size={16} /> <span className="hidden sm:inline">Load sample</span>
      </Button>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <AddCashModal open={cashOpen} onClose={() => setCashOpen(false)} />
    </>
  );
}
