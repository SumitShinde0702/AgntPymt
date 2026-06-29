import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { WalletsPage } from "./pages/WalletsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { LogsPage } from "./pages/LogsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AppLayout />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="payments" element={<PlaceholderPage title="Payments" />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="policies" element={<PlaceholderPage title="Policies" />} />
        <Route path="settings" element={<PlaceholderPage title="Settings" />} />
        <Route path="logs" element={<LogsPage />} />
      </Route>
    </Routes>
  );
}
