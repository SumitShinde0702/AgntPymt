import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api, type WalletsOverview } from "../lib/api";
import { TreasuryCard } from "../components/wallets/TreasuryCard";
import { AgentWalletsTable } from "../components/wallets/AgentWalletsTable";

const FAUCETS = [
  { name: "Circle USDC Faucet", url: "https://faucet.circle.com/", desc: "USDC on Base Sepolia" },
  { name: "Alchemy ETH Faucet", url: "https://www.alchemy.com/faucets/base-sepolia", desc: "ETH for gas" },
];

export function WalletsPage() {
  const [data, setData] = useState<WalletsOverview | null>(null);

  const load = useCallback(() => {
    void api<WalletsOverview>("/api/wallets").then(setData);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return <div className="text-slate-500">Loading wallets…</div>;
  }

  const totalUsdc = data.agents.reduce((s, a) => s + a.onChain.usdc, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Wallets</h1>
        <p className="text-slate-500">
          One treasury wallet funds many agent wallets — each agent gets its own address automatically.
        </p>
      </div>

      <TreasuryCard treasury={data.treasury} onUpdate={load} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Agent wallets</div>
          <div className="text-2xl font-bold">{data.agents.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Total USDC (agents)</div>
          <div className="text-2xl font-bold">{totalUsdc.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Network</div>
          <div className="text-lg font-semibold">{data.network}</div>
        </div>
      </div>

      <AgentWalletsTable agents={data.agents} treasuryAddress={data.treasury?.address} onFunded={load} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Fund your treasury first</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FAUCETS.map((f) => (
            <a
              key={f.name}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:bg-brand-50"
            >
              <div className="flex items-center gap-1 text-sm font-medium">
                {f.name}
                <ExternalLink className="h-3 w-3 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500">{f.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
