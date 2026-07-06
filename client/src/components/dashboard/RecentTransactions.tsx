import { CheckCircle, Clock, ExternalLink } from "lucide-react";
import type { Transaction } from "../../lib/api";
import { txExplorerUrl } from "../../lib/explorer";

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold">Recent Transactions</h2>
        <a href="/transactions" className="link-primary text-sm">
          View all
        </a>
      </div>
      <div className="divide-y divide-slate-100">
        {transactions.map((t) => {
          const completed = t.status === "completed" || t.status === "simulated";
          return (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4">
              {completed ? (
                <CheckCircle className="h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <Clock className="h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{t.description}</div>
                <div className="text-xs text-slate-500">{t.vendorName} · {timeAgo(t.createdAt)}</div>
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
                <div className="text-sm font-semibold text-slate-900">− {t.amountUsd.toFixed(2)} USDC</div>
                <span
                  className={`text-xs font-medium capitalize ${
                    completed ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {t.status === "simulated" ? "simulated" : t.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
