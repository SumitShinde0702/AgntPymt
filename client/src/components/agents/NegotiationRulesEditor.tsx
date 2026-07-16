import { useEffect, useState } from "react";
import { api, type AgentPolicy, type OrgSettings } from "../../lib/api";

type Props = {
  agentId: string;
  policy: AgentPolicy;
  onSaved?: () => void;
};

export function NegotiationRulesEditor({ agentId, policy, onSaved }: Props) {
  const [rules, setRules] = useState(policy.negotiationRules ?? "");
  const [limit, setLimit] = useState(String(policy.autoApproveLimitUsd));
  const [orgCeiling, setOrgCeiling] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void api<OrgSettings>("/api/org/settings")
      .then((s) => setOrgCeiling(s.maxExposureLimitUsd))
      .catch(() => setOrgCeiling(null));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api<AgentPolicy>(`/api/agents/${agentId}/policy`, {
        method: "PATCH",
        body: JSON.stringify({
          negotiationRules: rules.trim() || null,
          autoApproveLimitUsd: Number(limit),
        }),
      });
      setLimit(String(updated.autoApproveLimitUsd));
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const atCeiling =
    orgCeiling != null && Number.isFinite(Number(limit)) && Number(limit) >= orgCeiling;

  return (
    <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Your negotiation rules
      </h4>
      <p className="mb-2 text-xs text-slate-500">
        OpenAI uses these instructions when your agent speaks in the console chat.
      </p>
      <textarea
        value={rules}
        onChange={(e) => setRules(e.target.value)}
        rows={3}
        placeholder="e.g. Always counter at $0.01 for research data. Never exceed $0.05 without approval."
        className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="text-slate-600">Auto-approve up to</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
        />
        <span className="text-slate-500">USDC</span>
        {atCeiling && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            at org ceiling
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="btn-primary-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save rules"}
      </button>
      {saved && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
    </div>
  );
}
