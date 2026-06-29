import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { api, type Agent } from "../../lib/api";

const colorMap: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700 ring-violet-300",
  blue: "bg-blue-100 text-blue-700 ring-blue-300",
  green: "bg-emerald-100 text-emerald-700 ring-emerald-300",
  orange: "bg-orange-100 text-orange-700 ring-orange-300",
};

const ICON_COLORS = ["violet", "blue", "green", "orange"] as const;
const CATEGORY_PRESETS = ["research", "procurement", "travel", "cloud", "custom"] as const;

const EXAMPLE_PROMPTS = [
  "An agent that buys market research reports and sector data",
  "Handles office supply orders and vendor procurement",
  "Books flights and hotels for business travel",
  "Pays cloud infrastructure bills and negotiates AWS invoices",
];

export type AgentFormData = {
  name: string;
  category: string;
  description: string;
  iconColor: (typeof ICON_COLORS)[number];
  negotiationRules: string;
  autoApproveLimitUsd: string;
};

const emptyForm = (): AgentFormData => ({
  name: "",
  category: "custom",
  description: "",
  iconColor: "violet",
  negotiationRules: "",
  autoApproveLimitUsd: "0.05",
});

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (agent: Agent) => void;
};

export function NewAgentModal({ open, onClose, onCreated }: Props) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [form, setForm] = useState<AgentFormData>(emptyForm);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) {
      setAiPrompt("");
      setForm(emptyForm());
      setError(null);
      setAiEnabled(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function update<K extends keyof AgentFormData>(key: K, value: AgentFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function generateFromAi() {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const suggestion = await api<{
        name: string;
        category: string;
        description: string;
        iconColor: AgentFormData["iconColor"];
        negotiationRules: string;
        autoApproveLimitUsd: number;
        aiEnabled: boolean;
      }>("/api/agents/suggest", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      setAiEnabled(suggestion.aiEnabled);
      setForm({
        name: suggestion.name,
        category: suggestion.category,
        description: suggestion.description,
        iconColor: suggestion.iconColor,
        negotiationRules: suggestion.negotiationRules,
        autoApproveLimitUsd: String(suggestion.autoApproveLimitUsd),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate profile");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.category.trim()) {
      setError("Name and category are required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const agent = await api<Agent>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category.trim(),
          description: form.description.trim() || undefined,
          iconColor: form.iconColor,
          negotiationRules: form.negotiationRules.trim() || undefined,
          autoApproveLimitUsd: Number(form.autoApproveLimitUsd),
        }),
      });
      onCreated?.(agent);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">New Agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-5">
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-800">
              <Sparkles className="h-4 w-4" />
              Describe your agent
            </div>
            <p className="mb-3 text-xs text-slate-600">
              Tell us what you want this agent to do — AI will fill in the details below. You can edit
              everything before creating.
            </p>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. An agent that negotiates SaaS subscriptions and pays invoices under $0.05 automatically"
              className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <div className="mb-3 flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setAiPrompt(ex)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
                >
                  {ex.length > 42 ? `${ex.slice(0, 42)}…` : ex}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void generateFromAi()}
              disabled={generating || !aiPrompt.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? "Generating…" : "Auto-fill with AI"}
            </button>
            {aiEnabled === false && (
              <p className="mt-2 text-xs text-amber-600">
                No OpenAI key configured — using smart defaults. Set{" "}
                <code className="rounded bg-white px-1">OPENAI_API_KEY</code> for full AI suggestions.
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Research Agent"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {CATEGORY_PRESETS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => update("category", cat)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition ${
                      form.category === cat
                        ? "bg-brand-600 text-white"
                        : "border border-slate-200 text-slate-600 hover:border-brand-300"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                placeholder="research"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="What this agent does"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Icon color</label>
              <div className="flex gap-2">
                {ICON_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => update("iconColor", color)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold capitalize ring-2 ring-offset-1 transition ${
                      colorMap[color]
                    } ${form.iconColor === color ? "ring-current" : "ring-transparent"}`}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Negotiation rules</label>
              <p className="mb-2 text-xs text-slate-500">
                Instructions for how this agent negotiates purchases in the console chat.
              </p>
              <textarea
                value={form.negotiationRules}
                onChange={(e) => update("negotiationRules", e.target.value)}
                rows={3}
                placeholder="e.g. Counter at $0.01 for data. Never exceed auto-approve limit without escalation."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <label className="font-medium text-slate-700">Auto-approve up to</label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.autoApproveLimitUsd}
                onChange={(e) => update("autoApproveLimitUsd", e.target.value)}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <span className="text-slate-500">USDC</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim() || !form.category.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
