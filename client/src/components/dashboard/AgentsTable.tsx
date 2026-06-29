import { MoreHorizontal } from "lucide-react";
import type { Agent } from "../../lib/api";

const colorMap: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
};

export function AgentsTable({ agents }: { agents: Agent[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold">My Agents</h2>
        <button type="button" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
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
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[a.iconColor] ?? colorMap.violet}`}>
                      <span className="text-xs font-bold">{a.name[0]}</span>
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{a.name}</div>
                      <div className="text-xs capitalize text-slate-500">{a.category}</div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-slate-600">
                  {a.walletAddress ? `${a.walletAddress.slice(0, 6)}…${a.walletAddress.slice(-4)}` : "—"}
                </td>
                <td className="px-5 py-4 font-medium">${a.balanceUsd.toFixed(2)} USDC</td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 capitalize">
                    {a.status}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <button type="button" className="text-slate-400 hover:text-slate-600">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
