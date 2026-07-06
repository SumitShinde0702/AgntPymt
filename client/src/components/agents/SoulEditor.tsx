import { useState } from "react";
import { api } from "../../lib/api";

type Props = {
  agentId: string;
  initialSoul: string;
  onSaved?: () => void;
};

export function SoulEditor({ agentId, initialSoul, onSaved }: Props) {
  const [soul, setSoul] = useState(initialSoul);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api(`/api/agents/${agentId}/hermes/soul`, {
        method: "PUT",
        body: JSON.stringify({ soul }),
      });
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">SOUL.md</h4>
        <p className="mt-1 text-xs text-slate-500">
          Agent identity and instructions. Passed to Hermes on each run and stored in the profile directory.
        </p>
      </div>
      <textarea
        value={soul}
        onChange={(e) => {
          setSoul(e.target.value);
          setSaved(false);
        }}
        rows={14}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        spellCheck={false}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save SOUL"}
        </button>
        {saved && <span className="text-sm text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}
