import { Link } from "react-router-dom";
import { Bot, ChevronRight, Shield } from "lucide-react";
import type { AgentWalletRow, Erc8004AgentStatus } from "../../lib/api";

const colorMap: Record<string, string> = {
  violet: "bg-slate-100 text-accent-navy",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
};

function identityBadge(status?: Erc8004AgentStatus | null) {
  if (!status || status.lifecycle === "none") {
    return { label: "Not on-chain", className: "bg-slate-100 text-slate-600" };
  }
  if (status.lifecycle === "complete") {
    return { label: "Identity verified", className: "bg-emerald-50 text-emerald-700" };
  }
  return { label: "Setup in progress", className: "bg-amber-50 text-amber-800" };
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type Props = {
  agent: AgentWalletRow;
  identity?: Erc8004AgentStatus | null;
  txCount?: number;
};

export function AgentPassportCard({ agent, identity, txCount = 0 }: Props) {
  const badge = identityBadge(identity);

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-accent-cyan/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colorMap[agent.iconColor] ?? colorMap.violet}`}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900 group-hover:text-accent-navy">
              {agent.name}
            </h3>
            <p className="text-sm capitalize text-slate-500">{agent.category}</p>
          </div>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-accent-cyan" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">USDC</div>
          <div className="text-lg font-bold text-slate-900">{agent.onChain.usdc.toFixed(2)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Payments</div>
          <div className="text-lg font-bold text-slate-900">{txCount}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
          <Shield className="h-3 w-3" />
          {badge.label}
        </span>
        {identity?.agentId && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
            NFT #{identity.agentId}
          </span>
        )}
        {agent.walletAddress && (
          <span className="font-mono text-[10px] text-slate-400">{shortAddr(agent.walletAddress)}</span>
        )}
      </div>
    </Link>
  );
}
