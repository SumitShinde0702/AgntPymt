import { useCallback, useEffect, useState } from "react";
import { api, type Agent, type Approval } from "../lib/api";
import { PendingApprovals } from "../components/dashboard/PendingApprovals";

export function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  const load = useCallback(() => {
    void api<Approval[]>("/api/approvals").then(setApprovals);
    void api<Agent[]>("/api/agents").then(setAgents);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Approvals</h1>
      <PendingApprovals approvals={approvals} agents={agents} onUpdate={load} />
    </div>
  );
}
