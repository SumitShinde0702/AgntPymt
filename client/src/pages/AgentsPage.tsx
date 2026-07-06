import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Wallet } from "lucide-react";
import { AgentPassportCard } from "../components/agents/AgentPassportCard";
import { NewAgentModal } from "../components/agents/NewAgentModal";
import {
  api,
  type Erc8004AgentStatus,
  type Transaction,
  type WalletsOverview,
} from "../lib/api";

export function AgentsPage() {
  const [wallets, setWallets] = useState<WalletsOverview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [identityByAgent, setIdentityByAgent] = useState<Record<string, Erc8004AgentStatus>>({});
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    void Promise.all([api<WalletsOverview>("/api/wallets"), api<Transaction[]>("/api/transactions")])
      .then(([w, tx]) => {
        setWallets(w);
        setTransactions(tx);
        void Promise.all(
          w.agents.map((a) =>
            api<Erc8004AgentStatus>(`/api/agents/${a.id}/erc8004`)
              .then((status) => [a.id, status] as const)
              .catch(() => null)
          )
        ).then((results) => {
          const map: Record<string, Erc8004AgentStatus> = {};
          for (const row of results) {
            if (row) map[row[0]] = row[1];
          }
          setIdentityByAgent(map);
        });
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load agents");
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const txCountByAgent = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of transactions) {
      map.set(tx.agentId, (map.get(tx.agentId) ?? 0) + 1);
    }
    return map;
  }, [transactions]);

  if (!wallets) {
    return (
      <div className="space-y-4">
        {loadError ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-medium">API server unreachable</p>
            <p className="mt-1 text-amber-800">
              Run <code className="rounded bg-amber-100 px-1">npm run dev</code> in the project root, then retry.
            </p>
            <button type="button" onClick={load} className="btn-primary-sm mt-3">
              Retry
            </button>
          </div>
        ) : (
          <div className="text-slate-500">Loading agents…</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-slate-500">
            {wallets.agents.length} agent{wallets.agents.length === 1 ? "" : "s"} on {wallets.network}. Click a
            passport to manage identity, SOUL, and capabilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowNewAgent(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            New Agent
          </button>
          <Link
            to="/wallets"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Wallet className="h-4 w-4" />
            Fund wallets
          </Link>
        </div>
      </div>

      <NewAgentModal open={showNewAgent} onClose={() => setShowNewAgent(false)} onCreated={load} />

      {wallets.agents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-slate-600">No agents yet.</p>
          <button type="button" onClick={() => setShowNewAgent(true)} className="btn-primary mt-4">
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {wallets.agents.map((a) => (
            <AgentPassportCard
              key={a.id}
              agent={a}
              identity={identityByAgent[a.id]}
              txCount={txCountByAgent.get(a.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
