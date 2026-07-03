import { Link } from "react-router-dom";
import { api, type Agent, type Approval } from "../../lib/api";

type Props = {
  approvals: Approval[];
  agents: Agent[];
  onUpdate: () => void;
};

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function isHermesAction(a: Approval) {
  return a.kind === "hermes_action";
}

export function PendingApprovals({ approvals, agents, onUpdate }: Props) {
  const pending = approvals.filter((a) => a.status === "pending_approval");

  async function approve(id: string) {
    await api(`/api/approvals/${id}/approve`, { method: "POST" });
    onUpdate();
  }

  async function deny(id: string) {
    await api(`/api/approvals/${id}/deny`, { method: "POST" });
    onUpdate();
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        <a href="/approvals" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          View all
        </a>
      </div>
      <div className="space-y-4 p-5">
        {pending.length === 0 && <p className="text-sm text-slate-500">No pending approvals.</p>}
        {pending.slice(0, 3).map((a) => {
          const agent = agents.find((ag) => ag.id === a.agentId);
          const hermes = isHermesAction(a);
          return (
            <div
              key={a.id}
              className={`rounded-xl border p-4 ${hermes ? "border-amber-200 bg-amber-50/40" : "border-slate-200"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{agent?.name ?? "Agent"}</span>
                {hermes ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    Hermes tool
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-slate-900">
                    {a.amountUsd.toFixed(2)} USDC
                  </span>
                )}
              </div>
              <div className="mb-1 text-sm text-brand-600">{a.vendorName}</div>
              <p className="mb-2 text-sm text-slate-600">{a.reason}</p>
              <div className="mb-3 text-xs text-slate-400">{timeAgo(a.requestedAt)}</div>
              <div className="flex flex-wrap gap-2">
                {hermes && a.runId && (
                  <Link
                    to={`/dashboard?run=${a.runId}`}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
                  >
                    Open chat
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void deny(a.id)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => void approve(a.id)}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Approve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
