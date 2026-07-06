import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import type { Agent } from "../../lib/api";

const colorMap: Record<string, string> = {
  violet: "bg-slate-100 text-accent-navy",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
};

type Props = {
  agents: Agent[];
  onNewAgent?: () => void;
};

export function AgentsTable({ agents, onNewAgent }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold">My Agents</h2>
        <button
          type="button"
          onClick={onNewAgent}
          className="btn-primary-sm"
        >
          + New Agent
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Agent</th>
              <th className="px-5 py-3 font-medium">Wallet</th>
              <th className="px-5 py-3 font-medium">Balance</th>
              <th className="px-5 py-3 font-medium">Hermes</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                  No agents yet.{" "}
                  {onNewAgent && (
                    <button
                      type="button"
                      onClick={onNewAgent}
                      className="link-primary"
                    >
                      Create one
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-5 py-4">
                    <Link to={`/agents/${a.id}`} className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[a.iconColor] ?? colorMap.violet}`}
                      >
                        <span className="text-xs font-bold">{a.name[0]}</span>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{a.name}</div>
                        <div className="text-xs capitalize text-slate-500">{a.category}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">
                    {a.walletAddress ? `${a.walletAddress.slice(0, 6)}…${a.walletAddress.slice(-4)}` : "—"}
                  </td>
                  <td className="px-5 py-4 font-medium">${a.balanceUsd.toFixed(2)} USDC</td>
                  <td className="px-5 py-4">
                    {a.hermesProvisioned ? (
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-accent-navy">
                          {a.hermesSkillCount ?? 0} skills
                        </span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                          {a.hermesMcpCount ?? 0} MCP
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium capitalize text-emerald-700">
                      {a.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button type="button" className="text-slate-400 hover:text-slate-600">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
