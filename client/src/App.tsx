import { Navigate, Routes, Route } from "react-router-dom";
import { SignedIn, SignedOut } from "@clerk/clerk-react";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";
import { LandingPage } from "./pages/LandingPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AgentsPage } from "./pages/AgentsPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { SellersPage } from "./pages/SellersPage";
import { SellerDetailPage } from "./pages/SellerDetailPage";
import { WalletsPage } from "./pages/WalletsPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { LogsPage } from "./pages/LogsPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { showSellerAdmin } from "./lib/features";

const clerkEnabled = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

/** `/` → Clerk sign-in when auth is on; signed-in users go to dashboard. */
function RootEntry() {
  if (!clerkEnabled) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      <SignedIn>
        <Navigate to="/dashboard" replace />
      </SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootEntry />} />
      <Route path="/home" element={<LandingPage />} />
      {clerkEnabled && (
        <>
          <Route path="/sign-in/*" element={<SignInPage />} />
          <Route path="/sign-up/*" element={<SignUpPage />} />
        </>
      )}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:agentId" element={<AgentDetailPage />} />
          {showSellerAdmin && (
            <>
              <Route path="sellers" element={<SellersPage />} />
              <Route path="sellers/:vendorId" element={<SellerDetailPage />} />
            </>
          )}
          <Route path="wallets" element={<WalletsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="policies" element={<PlaceholderPage title="Policies" />} />
          <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
