import { useState } from "react";
import { api, type AgentPolicy } from "../../lib/api";

type Props = {
  agentId: string;
  policy: AgentPolicy;
  onSaved?: () => void;
};

export function NegotiationRulesEditor({ agentId, policy, onSaved }: Props) {
  const [rules, setRules] = useState(policy.negotiationRules ?? "");
  const [limit, setLimit] = useState(String(policy.autoApproveLimitUsd));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api<AgentPolicy>(`/api/agents/${agentId}/policy`, {
        method: "PATCH",
        body: JSON.stringify({
          negotiationRules: rules.trim() || null,
          autoApproveLimitUsd: Number(limit),
        }),
      });
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

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
      <div className="mb-2 flex items-center gap-2 text-sm">
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
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save rules"}
      </button>
      {saved && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
    </div>
  );
}
