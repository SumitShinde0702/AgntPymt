import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, CheckCircle, Clock, Copy, ExternalLink, Plus, Wallet } from "lucide-react";
import { CapabilitiesPanel } from "../components/agents/CapabilitiesPanel";
import { NegotiationRulesEditor } from "../components/agents/NegotiationRulesEditor";
import { NewAgentModal } from "../components/agents/NewAgentModal";
import { SoulEditor } from "../components/agents/SoulEditor";
import {
  api,
  type AgentPolicy,
  type AgentWalletRow,
  type HermesProfileStatus,
  type Transaction,
  type WalletsOverview,
} from "../lib/api";
import { addressExplorerUrl, txExplorerUrl } from "../lib/explorer";

const colorMap: Record<string, string> = {
  violet: "bg-slate-100 text-accent-navy",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
};

type Tab = "overview" | "identity" | "capabilities";

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function AgentTransactions({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-xs text-slate-400">No transactions yet</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
      {transactions.map((t) => {
        const completed = t.status === "completed" || t.status === "simulated";
        return (
          <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
            {completed ? (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{t.vendorName}</div>
              <div className="text-xs text-slate-500">{t.description}</div>
              <div className="mt-0.5 text-xs text-slate-400">{timeAgo(t.createdAt)}</div>
              {t.txHash && (
                <a
                  href={txExplorerUrl(t.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-accent-cyan hover:underline"
                >
                  {t.txHash.slice(0, 14)}…{t.txHash.slice(-8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-slate-900">−{t.amountUsd.toFixed(2)} USDC</div>
              <div className="flex items-center justify-end gap-1">
                <span
                  className={`text-xs font-medium capitalize ${
                    completed ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {t.status === "simulated" ? "simulated" : t.status}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AgentCard({
  agent,
  transactions,
  policy,
  onPolicySaved,
}: {
  agent: AgentWalletRow;
  transactions: Transaction[];
  policy?: AgentPolicy;
  onPolicySaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [hermes, setHermes] = useState<HermesProfileStatus | null>(null);
  const [hermesLoading, setHermesLoading] = useState(false);

  const loadHermes = useCallback(() => {
    setHermesLoading(true);
    void api<HermesProfileStatus>(`/api/agents/${agent.id}/hermes`)
      .then(setHermes)
      .finally(() => setHermesLoading(false));
  }, [agent.id]);

  useEffect(() => {
    if (tab === "identity" || tab === "capabilities") {
      loadHermes();
    }
  }, [tab, loadHermes]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "identity", label: "Identity" },
    { id: "capabilities", label: "Capabilities" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colorMap[agent.iconColor] ?? colorMap.violet}`}
        >
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{agent.name}</h3>
          <p className="text-sm capitalize text-slate-500">{agent.category}</p>
          {hermes?.profileName && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{hermes.profileName}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-slate-100">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium ${
              tab === t.id
                ? "border-b-2 border-accent-cyan text-accent-navy"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">USDC (on-chain)</div>
              <div className="text-lg font-bold text-slate-900">{agent.onChain.usdc.toFixed(2)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">ETH (gas)</div>
              <div className="text-lg font-bold text-slate-900">{agent.onChain.eth.toFixed(4)}</div>
            </div>
          </div>

          {agent.walletAddress ? (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-500">Operational wallet</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="min-w-0 flex-1 break-all font-mono text-xs text-slate-700">
                  {agent.walletAddress}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(agent.walletAddress!)}
                  className="shrink-0 text-slate-400 hover:text-accent-cyan"
                  title="Copy address"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={addressExplorerUrl(agent.walletAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-slate-400 hover:text-accent-cyan"
                  title="View on BaseScan"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-accent-cyan">Wallet provisioning…</p>
          )}

          {policy && (
            <NegotiationRulesEditor agentId={agent.id} policy={policy} onSaved={onPolicySaved} />
          )}

          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Transactions ({transactions.length})
            </h4>
            <AgentTransactions transactions={transactions} />
          </div>
        </div>
      )}

      {tab === "identity" && (
        <div className="mt-4">
          {hermesLoading && !hermes ? (
            <p className="text-sm text-slate-500">Loading profile…</p>
          ) : hermes ? (
            <SoulEditor agentId={agent.id} initialSoul={hermes.soul} onSaved={loadHermes} />
          ) : (
            <p className="text-sm text-slate-500">Could not load Hermes profile</p>
          )}
        </div>
      )}

      {tab === "capabilities" && (
        <div className="mt-4">
          {hermesLoading && !hermes ? (
            <p className="text-sm text-slate-500">Loading capabilities…</p>
          ) : hermes ? (
            <CapabilitiesPanel
              agentId={agent.id}
              capabilities={hermes.capabilities}
              onChanged={loadHermes}
            />
          ) : (
            <p className="text-sm text-slate-500">Could not load capabilities</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentsPage() {
  const [wallets, setWallets] = useState<WalletsOverview | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [policies, setPolicies] = useState<AgentPolicy[]>([]);
  const [showNewAgent, setShowNewAgent] = useState(false);

  const load = useCallback(() => {
    void Promise.all([
      api<WalletsOverview>("/api/wallets"),
      api<Transaction[]>("/api/transactions"),
      api<AgentPolicy[]>("/api/policies"),
    ]).then(([w, tx, p]) => {
      setWallets(w);
      setTransactions(tx);
      setPolicies(p);
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const txByAgent = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = map.get(tx.agentId) ?? [];
      list.push(tx);
      map.set(tx.agentId, list);
    }
    return map;
  }, [transactions]);

  const policyByAgent = useMemo(() => {
    const map = new Map<string, AgentPolicy>();
    for (const p of policies) map.set(p.agentId, p);
    return map;
  }, [policies]);

  if (!wallets) {
    return <div className="text-slate-500">Loading agents…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-slate-500">
            Each agent has a Hermes profile (SOUL, skills, MCP), wallet on {wallets.network}, and payment policy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowNewAgent(true)}
            className="btn-primary"
          >
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

      <div className="grid gap-4 lg:grid-cols-2">
        {wallets.agents.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            transactions={txByAgent.get(a.id) ?? []}
            policy={policyByAgent.get(a.id)}
            onPolicySaved={load}
          />
        ))}
      </div>
    </div>
  );
}
