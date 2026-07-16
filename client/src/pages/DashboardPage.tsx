import { useCallback, useEffect, useState } from "react";
import { api, type DashboardData } from "../lib/api";
import { NewAgentModal } from "../components/agents/NewAgentModal";
import { KpiCard } from "../components/dashboard/KpiCard";
import { AgentConsole } from "../components/dashboard/AgentConsole";
import { AgentsTable } from "../components/dashboard/AgentsTable";
import { PendingApprovals } from "../components/dashboard/PendingApprovals";
import { WalletQuickLink } from "../components/dashboard/WalletQuickLink";
import { RecentTransactions } from "../components/dashboard/RecentTransactions";
import { DashboardSkeleton } from "../components/dashboard/DashboardSkeleton";

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);

  const load = useCallback(() => {
    void api<DashboardData>("/api/dashboard").then(setData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500">Overview of your agents, wallets and payment activities.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Balance (All Agents)"
          value={`$${data.kpis.totalBalanceUsd.toFixed(2)} USDC`}
          icon="wallet"
          tone="brand"
        />
        <KpiCard title="Active Agents" value={data.kpis.activeAgents} icon="bot" tone="green" />
        <KpiCard
          title="Pending Approvals"
          value={`${data.kpis.pendingApprovals} Total`}
          icon="clock"
          tone="yellow"
        />
        <KpiCard
          title="Total Spend (30 Days)"
          value={`$${data.kpis.spend30DaysUsd.toFixed(2)} USDC`}
          icon="chart"
          tone="blue"
        />
      </div>

      <AgentConsole
        agents={data.agents}
        onRunComplete={load}
        onNewAgent={() => setShowNewAgent(true)}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AgentsTable agents={data.agents} onNewAgent={() => setShowNewAgent(true)} />
        <PendingApprovals approvals={data.pendingApprovals} agents={data.agents} onUpdate={load} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <WalletQuickLink agents={data.agents} />
        <RecentTransactions transactions={data.recentTransactions} />
      </div>

      <NewAgentModal
        open={showNewAgent}
        onClose={() => setShowNewAgent(false)}
        onCreated={load}
      />
    </div>
  );
}
