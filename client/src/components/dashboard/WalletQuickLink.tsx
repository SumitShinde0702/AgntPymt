import { Link } from "react-router-dom";
import { Wallet, ExternalLink } from "lucide-react";
import type { Agent } from "../../lib/api";

export function WalletQuickLink({ agents }: { agents: Agent[] }) {
  const linked = agents.filter((a) => a.walletAddress).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-brand-600" />
        <h2 className="text-lg font-semibold">Agent Wallets</h2>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        {linked} of {agents.length} agents have MetaMask linked. Connect and fund on the Wallets page.
      </p>
      <Link
        to="/wallets"
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Manage wallets
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
