import { Routes, Route } from 'react-router-dom';
import Overview from './pages/Overview';
import Transactions from './pages/Transactions';
import Business from './pages/Business';
import Cards from './pages/Cards';
import Receipts from './pages/Receipts';
import Tax from './pages/Tax';
import Goals from './pages/Goals';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/transactions" element={<Transactions />} />
      <Route path="/business" element={<Business />} />
      <Route path="/cards" element={<Cards />} />
      <Route path="/receipts" element={<Receipts />} />
      <Route path="/tax" element={<Tax />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
