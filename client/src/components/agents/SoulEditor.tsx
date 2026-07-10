import { useEffect, useMemo, useState } from "react";
import { FileText, LayoutTemplate, RotateCcw, Sparkles } from "lucide-react";
import { api } from "../../lib/api";

type Props = {
  agentId: string;
  agentName?: string;
  category?: string;
  initialSoul: string;
  onSaved?: () => void;
};

type SoulSections = {
  title: string;
  role: string;
  behavior: string;
  payment: string;
  negotiation: string;
  notes: string;
};

type EditorMode = "guided" | "raw";

const DEFAULT_PAYMENT =
  "When a task requires spending money, use the `agntpymt_initiate_purchase` MCP tool.\n" +
  "Respect auto-approve limits and negotiation rules. Never bypass human approval when required.";

const QUICK_TEMPLATES: {
  id: "research" | "procurement";
  label: string;
  fill: (name: string) => Omit<SoulSections, "title">;
}[] = [
  {
    id: "research",
    label: "Research",
    fill: (name) => ({
      role: `You are **${name}**, a research buyer agent in the AgntPymt fleet.\nYou purchase sector research, market data, and intelligence reports on behalf of the organization.`,
      behavior:
        "Be precise and cost-conscious. Prefer reputable data vendors. Summarize what you bought and why it matters.",
      payment: DEFAULT_PAYMENT,
      negotiation:
        "Counter at the micro-payment target ($0.01) when quotes are above that. Stay under the auto-approve limit unless the data is critical.",
      notes: "",
    }),
  },
  {
    id: "procurement",
    label: "Procurement",
    fill: (name) => ({
      role: `You are **${name}**, a procurement agent in the AgntPymt fleet.\nYou buy supplies and services for the organization.`,
      behavior: "Be concise and practical. Prefer instant buys at list price when under policy limits.",
      payment: DEFAULT_PAYMENT,
      negotiation:
        "Prefer instant buys at list price when under $0.02. Negotiate only when the quote is clearly inflated.",
      notes: "",
    }),
  },
];

const EXAMPLE_PROMPTS = [
  "Buys premium sector research and negotiates hard on data quotes",
  "Handles office supply orders — prefer list price under $0.02",
  "Pays cloud invoices and escalates anything above auto-approve",
  "Books business travel within policy and confirms itinerary before paying",
];

function composeSoul(s: SoulSections): string {
  const parts = [`# ${s.title.trim() || "Agent"}`, ""];
  if (s.role.trim()) parts.push(s.role.trim(), "");
  if (s.behavior.trim()) parts.push("## Behavior", "", s.behavior.trim(), "");
  if (s.payment.trim()) parts.push("## Payment governance", "", s.payment.trim(), "");
  if (s.negotiation.trim()) parts.push("## Negotiation rules", "", s.negotiation.trim(), "");
  if (s.notes.trim()) parts.push("## Notes", "", s.notes.trim(), "");
  return parts.join("\n").trimEnd() + "\n";
}

function sectionAfter(md: string, heading: string): string {
  const re = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const m = md.match(re);
  return m?.[1]?.trim() ?? "";
}

function parseSoul(md: string, fallbackTitle: string): { sections: SoulSections; guidedOk: boolean } {
  const trimmed = md.trim();
  if (!trimmed) {
    return {
      sections: {
        title: fallbackTitle,
        role: "",
        behavior: "",
        payment: DEFAULT_PAYMENT,
        negotiation: "",
        notes: "",
      },
      guidedOk: true,
    };
  }

  const titleMatch = trimmed.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() || fallbackTitle;

  const hasGuidedHeadings =
    /##\s+Payment governance/i.test(trimmed) ||
    /##\s+Negotiation rules/i.test(trimmed) ||
    /##\s+Behavior/i.test(trimmed);

  if (!hasGuidedHeadings && !titleMatch) {
    return {
      sections: {
        title: fallbackTitle,
        role: trimmed,
        behavior: "",
        payment: DEFAULT_PAYMENT,
        negotiation: "",
        notes: "",
      },
      guidedOk: false,
    };
  }

  let role = "";
  if (titleMatch) {
    const afterTitle = trimmed.slice(trimmed.indexOf(titleMatch[0]) + titleMatch[0].length);
    const firstH2 = afterTitle.search(/\n##\s+/);
    role = (firstH2 >= 0 ? afterTitle.slice(0, firstH2) : afterTitle).trim();
  }

  const behavior = sectionAfter(trimmed, "Behavior");
  const payment = sectionAfter(trimmed, "Payment governance") || DEFAULT_PAYMENT;
  const negotiation = sectionAfter(trimmed, "Negotiation rules");
  const notes = sectionAfter(trimmed, "Notes");

  const known = new Set(["behavior", "payment governance", "negotiation rules", "notes"]);
  const unknown: string[] = [];
  for (const m of trimmed.matchAll(/##\s+(.+)\n([\s\S]*?)(?=\n##\s+|$)/g)) {
    const h = m[1].trim().toLowerCase();
    if (!known.has(h) && m[2].trim()) {
      unknown.push(`## ${m[1].trim()}\n\n${m[2].trim()}`);
    }
  }

  return {
    sections: {
      title,
      role,
      behavior,
      payment,
      negotiation,
      notes: [notes, ...unknown].filter(Boolean).join("\n\n"),
    },
    guidedOk: true,
  };
}

function Field({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#00a8e8] focus:outline-none focus:ring-1 focus:ring-[#00a8e8]/40"
      />
    </label>
  );
}

export function SoulEditor({ agentId, agentName, category, initialSoul, onSaved }: Props) {
  const fallbackTitle = agentName?.trim() || "Agent";
  const parsed = useMemo(() => parseSoul(initialSoul, fallbackTitle), [initialSoul, fallbackTitle]);

  const [mode, setMode] = useState<EditorMode>(parsed.guidedOk ? "guided" : "raw");
  const [sections, setSections] = useState<SoulSections>(parsed.sections);
  const [raw, setRaw] = useState(initialSoul);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  const categoryKey = (category ?? "").toLowerCase();
  const suggestedTemplate =
    QUICK_TEMPLATES.find((t) => categoryKey.includes(t.id))?.id ?? null;

  useEffect(() => {
    const next = parseSoul(initialSoul, fallbackTitle);
    setSections(next.sections);
    setRaw(initialSoul);
    setMode(next.guidedOk ? "guided" : "raw");
    setSaved(false);
    setError(null);
  }, [initialSoul, fallbackTitle]);

  const composed = useMemo(() => composeSoul(sections), [sections]);
  const current = mode === "guided" ? composed : raw;
  const dirty = current !== initialSoul;
  const chars = current.length;

  function patch(partial: Partial<SoulSections>) {
    setSections((s) => ({ ...s, ...partial }));
    setSaved(false);
    setError(null);
  }

  function switchMode(next: EditorMode) {
    if (next === mode) return;
    if (next === "raw") {
      setRaw(composeSoul(sections));
    } else {
      setSections(parseSoul(raw, fallbackTitle).sections);
    }
    setMode(next);
    setSaved(false);
  }

  function applyTemplate(id: "research" | "procurement") {
    const t = QUICK_TEMPLATES.find((x) => x.id === id)!;
    const name = sections.title || fallbackTitle;
    setSections({ title: name, ...t.fill(name) });
    setMode("guided");
    setSaved(false);
    setError(null);
  }

  async function generateFromAi() {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const suggestion = await api<{
        title: string;
        role: string;
        behavior: string;
        payment: string;
        negotiation: string;
        notes: string;
        aiEnabled: boolean;
      }>(`/api/agents/${agentId}/hermes/soul/suggest`, {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      setAiEnabled(suggestion.aiEnabled);
      setSections({
        title: suggestion.title || fallbackTitle,
        role: suggestion.role,
        behavior: suggestion.behavior,
        payment: suggestion.payment,
        negotiation: suggestion.negotiation,
        notes: suggestion.notes,
      });
      setMode("guided");
      setSaved(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate SOUL");
    } finally {
      setGenerating(false);
    }
  }

  function resetToSaved() {
    const next = parseSoul(initialSoul, fallbackTitle);
    setSections(next.sections);
    setRaw(initialSoul);
    setMode(next.guidedOk ? "guided" : "raw");
    setSaved(false);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const soul = mode === "guided" ? composeSoul(sections) : raw;
    try {
      await api(`/api/agents/${agentId}/hermes/soul`, {
        method: "PUT",
        body: JSON.stringify({ soul }),
      });
      setSaved(true);
      setRaw(soul);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save SOUL");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-600">
            Defines who this agent is. Hermes reads this on every run.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {chars.toLocaleString()} characters
            {dirty ? " · unsaved changes" : ""}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => switchMode("guided")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              mode === "guided" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Guided
          </button>
          <button
            type="button"
            onClick={() => switchMode("raw")}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              mode === "raw" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Markdown
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-accent-navy">
          <Sparkles className="h-4 w-4" />
          Describe this agent’s soul
        </div>
        <p className="mb-3 text-xs text-slate-600">
          Start from a template, or describe the role — AI fills the fields below. Edit anything before
          saving.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Templates</span>
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                t.id === suggestedTemplate
                  ? "border-[#00a8e8]/40 bg-[#00a8e8]/10 text-[#0089be]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {t.id === suggestedTemplate ? " · suggested" : ""}
            </button>
          ))}
        </div>

        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. Negotiates SaaS subscriptions and pays invoices under $0.05 automatically"
          className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
        <div className="mb-3 flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setAiPrompt(ex)}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:border-accent-cyan hover:text-accent-navy"
            >
              {ex.length > 42 ? `${ex.slice(0, 42)}…` : ex}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void generateFromAi()}
          disabled={generating || !aiPrompt.trim()}
          className="btn-primary-sm disabled:opacity-50"
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

      {mode === "guided" ? (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Display name</span>
            <input
              value={sections.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#00a8e8] focus:outline-none focus:ring-1 focus:ring-[#00a8e8]/40"
            />
          </label>
          <Field
            label="Role"
            hint="Who the agent is and what it buys."
            value={sections.role}
            onChange={(role) => patch({ role })}
            rows={4}
          />
          <Field
            label="Behavior"
            hint="Tone, priorities, and how it should act."
            value={sections.behavior}
            onChange={(behavior) => patch({ behavior })}
            rows={3}
          />
          <Field
            label="Payment governance"
            hint="How it spends and when it must ask a human."
            value={sections.payment}
            onChange={(payment) => patch({ payment })}
            rows={3}
          />
          <Field
            label="Negotiation rules"
            hint="Pricing strategy and escalation."
            value={sections.negotiation}
            onChange={(negotiation) => patch({ negotiation })}
            rows={3}
          />
          <Field
            label="Notes (optional)"
            hint="Extra instructions or freeform markdown."
            value={sections.notes}
            onChange={(notes) => patch({ notes })}
            rows={2}
          />
        </div>
      ) : (
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setSaved(false);
            setError(null);
          }}
          rows={16}
          spellCheck={false}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-relaxed text-slate-800 focus:border-[#00a8e8] focus:outline-none focus:ring-1 focus:ring-[#00a8e8]/40"
        />
      )}

      {mode === "guided" && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700">
            Preview SOUL.md
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-slate-100 px-3 py-2 font-mono text-xs leading-relaxed text-slate-600 whitespace-pre-wrap">
            {composed}
          </pre>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save SOUL"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={resetToSaved}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Discard
          </button>
        )}
        {saved && !dirty && <span className="text-sm text-emerald-600">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
