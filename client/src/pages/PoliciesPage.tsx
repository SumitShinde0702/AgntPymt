import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Info, Shield } from "lucide-react";
import { api, type AgentPolicy, type PolicyRow } from "../lib/api";
import { PageSkeleton } from "../components/ui/Skeleton";

const colorMap: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  orange: "bg-orange-100 text-orange-700",
};

type Draft = {
  autoApproveLimitUsd: string;
  dailyAggregateCapUsd: string;
};

function toDraft(row: PolicyRow): Draft {
  return {
    autoApproveLimitUsd: String(row.policy.autoApproveLimitUsd),
    dailyAggregateCapUsd:
      row.policy.dailyAggregateCapUsd != null ? String(row.policy.dailyAggregateCapUsd) : "",
  };
}

function parsePositiveOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isDirty(row: PolicyRow, draft: Draft): boolean {
  const auto = Number(draft.autoApproveLimitUsd);
  const daily = parsePositiveOrNull(draft.dailyAggregateCapUsd);
  if (!Number.isFinite(auto) || auto < 0) return true;
  return (
    auto !== row.policy.autoApproveLimitUsd || daily !== row.policy.dailyAggregateCapUsd
  );
}

export function PoliciesPage() {
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void api<PolicyRow[]>("/api/policies")
      .then((data) => {
        setRows(data);
        setDrafts(Object.fromEntries(data.map((r) => [r.agentId, toDraft(r)])));
        setError(null);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load policies")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateDraft(agentId: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], ...patch },
    }));
    setSavedId(null);
  }

  async function saveRow(row: PolicyRow) {
    const draft = drafts[row.agentId];
    if (!draft) return;
    const autoApproveLimitUsd = Number(draft.autoApproveLimitUsd);
    if (!Number.isFinite(autoApproveLimitUsd) || autoApproveLimitUsd < 0) {
      setError("Auto-approve limit must be a number ≥ 0");
      return;
    }

    setSavingId(row.agentId);
    setError(null);
    try {
      const updated = await api<AgentPolicy>(`/api/agents/${row.agentId}/policy`, {
        method: "PATCH",
        body: JSON.stringify({
          autoApproveLimitUsd,
          dailyAggregateCapUsd: parsePositiveOrNull(draft.dailyAggregateCapUsd),
        }),
      });
      setRows((prev) =>
        prev.map((r) => (r.agentId === row.agentId ? { ...r, policy: updated } : r))
      );
      setDrafts((prev) => ({
        ...prev,
        [row.agentId]: {
          autoApproveLimitUsd: String(updated.autoApproveLimitUsd),
          dailyAggregateCapUsd:
            updated.dailyAggregateCapUsd != null ? String(updated.dailyAggregateCapUsd) : "",
        },
      }));
      setSavedId(row.agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSavingId(null);
    }
  }

  if (loading && rows.length === 0) {
    return error ? (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    ) : (
      <PageSkeleton cards={2} />
    );
  }

  const orgCeiling = rows[0]?.orgCeilingUsd ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Risk &amp; compliance
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Agent policies</h1>
          <p className="mt-1 max-w-2xl text-slate-500">
            Per-agent spending mandates. Org-wide circuit breakers and ceilings live in{" "}
            <Link to="/settings" className="link-primary">
              Settings
            </Link>
            .
          </p>
        </div>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Org controls
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex gap-3">
          <div className="mt-0.5 rounded-lg bg-slate-100 p-2 text-slate-500">
            <Info className="h-4 w-4" />
          </div>
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-800">How limits stack</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>
                <span className="font-medium text-slate-800">Kill switch</span> — pauses every agent
                (Settings).
              </li>
              <li>
                <span className="font-medium text-slate-800">Org exposure ceiling</span>
                {orgCeiling != null ? (
                  <>
                    {" "}
                    ({`$${orgCeiling}`} USDC) — hard deny above this amount.
                  </>
                ) : (
                  <> — hard deny above the org max (not set).</>
                )}
              </li>
              <li>
                <span className="font-medium text-slate-800">Auto-approve</span> /{" "}
                <span className="font-medium text-slate-800">daily cap</span> — overage escalates to
                Approvals.
              </li>
            </ol>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
          <Shield className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Spending mandates</h2>
          <span className="text-xs text-slate-400">{rows.length} agents</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            No agents yet. Create an agent to attach spending policies.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-medium">Agent</th>
                  <th className="px-5 py-3 font-medium">Auto-approve</th>
                  <th className="px-5 py-3 font-medium">Daily cap (24h)</th>
                  <th className="px-5 py-3 font-medium">Spend / 24h</th>
                  <th className="px-5 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const draft = drafts[row.agentId] ?? toDraft(row);
                  const dirty = isDirty(row, draft);
                  const dailyCap = parsePositiveOrNull(draft.dailyAggregateCapUsd);
                  const nearCap =
                    dailyCap != null && row.dailySpendUsd / dailyCap >= 0.8;
                  const atCeiling =
                    orgCeiling != null &&
                    Number.isFinite(Number(draft.autoApproveLimitUsd)) &&
                    Number(draft.autoApproveLimitUsd) >= orgCeiling;

                  return (
                    <tr key={row.agentId} className="border-t border-slate-100 hover:bg-slate-50/40">
                      <td className="px-5 py-4">
                        <Link
                          to={`/agents/${row.agentId}`}
                          className="flex items-center gap-3"
                        >
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg ${colorMap[row.iconColor] ?? colorMap.violet}`}
                          >
                            <span className="text-xs font-bold">{row.agentName[0]}</span>
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{row.agentName}</div>
                            <div className="text-xs capitalize text-slate-500">{row.category}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">$</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={draft.autoApproveLimitUsd}
                              onChange={(e) =>
                                updateDraft(row.agentId, { autoApproveLimitUsd: e.target.value })
                              }
                              className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#00a8e8] focus:outline-none focus:ring-1 focus:ring-[#00a8e8]/40"
                            />
                          </div>
                          {atCeiling && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              at org ceiling
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">$</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={draft.dailyAggregateCapUsd}
                            onChange={(e) =>
                              updateDraft(row.agentId, { dailyAggregateCapUsd: e.target.value })
                            }
                            placeholder="none"
                            className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-[#00a8e8] focus:outline-none focus:ring-1 focus:ring-[#00a8e8]/40"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">Blank = no daily cap</p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`font-medium tabular-nums ${
                            nearCap ? "text-amber-700" : "text-slate-800"
                          }`}
                        >
                          ${row.dailySpendUsd.toFixed(4)}
                        </span>
                        {dailyCap != null && (
                          <span className="text-slate-400"> / ${dailyCap}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {savedId === row.agentId && !dirty && (
                            <span className="text-xs text-emerald-600">Saved</span>
                          )}
                          <button
                            type="button"
                            disabled={!dirty || savingId === row.agentId}
                            onClick={() => void saveRow(row)}
                            className="btn-primary-sm disabled:opacity-40"
                          >
                            {savingId === row.agentId ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
