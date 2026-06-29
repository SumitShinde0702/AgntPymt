import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
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
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
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
