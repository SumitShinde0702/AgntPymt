import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api, type HermesCapabilities, type HermesMcpServer, type HermesSkill } from "../../lib/api";

type Props = {
  agentId: string;
  capabilities: HermesCapabilities;
  onChanged: () => void;
};

function parseSkillBody(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  return match ? match[1].trim() : content;
}

export function CapabilitiesPanel({ agentId, capabilities, onChanged }: Props) {
  const [skills, setSkills] = useState(capabilities.skills);
  const [mcpServers, setMcpServers] = useState(capabilities.mcpServers);
  const [editingSkill, setEditingSkill] = useState<HermesSkill | null>(null);
  const [newSkill, setNewSkill] = useState(false);
  const [mcpForm, setMcpForm] = useState(false);
  const [mcpDraft, setMcpDraft] = useState<Partial<HermesMcpServer>>({ name: "", command: "npx", args: [] });
  const [skillDraft, setSkillDraft] = useState({ name: "", description: "", body: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSkills(capabilities.skills);
    setMcpServers(capabilities.mcpServers);
  }, [capabilities]);

  const reload = useCallback(() => {
    onChanged();
  }, [onChanged]);

  async function saveSkill() {
    setBusy(true);
    try {
      if (editingSkill) {
        await api(`/api/agents/${agentId}/hermes/skills/${editingSkill.id}`, {
          method: "PUT",
          body: JSON.stringify(skillDraft),
        });
      } else {
        await api(`/api/agents/${agentId}/hermes/skills`, {
          method: "POST",
          body: JSON.stringify(skillDraft),
        });
      }
      setEditingSkill(null);
      setNewSkill(false);
      setSkillDraft({ name: "", description: "", body: "" });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function removeSkill(skillId: string) {
    setBusy(true);
    try {
      await api(`/api/agents/${agentId}/hermes/skills/${skillId}`, { method: "DELETE" });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveMcp() {
    if (!mcpDraft.name?.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ mcpServers: HermesMcpServer[] }>(`/api/agents/${agentId}/hermes/mcp`, {
        method: "POST",
        body: JSON.stringify({
          name: mcpDraft.name,
          command: mcpDraft.command,
          args: mcpDraft.args ?? [],
          url: mcpDraft.url,
          env: mcpDraft.env,
          enabled: mcpDraft.enabled ?? true,
        }),
      });
      setMcpServers(res.mcpServers);
      setMcpForm(false);
      setMcpDraft({ name: "", command: "npx", args: [] });
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function removeMcp(name: string) {
    setBusy(true);
    try {
      const res = await api<{ mcpServers: HermesMcpServer[] }>(
        `/api/agents/${agentId}/hermes/mcp/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      );
      setMcpServers(res.mcpServers);
      reload();
    } finally {
      setBusy(false);
    }
  }

  function startEditSkill(skill: HermesSkill) {
    setEditingSkill(skill);
    setNewSkill(false);
    setSkillDraft({
      name: skill.name,
      description: skill.description,
      body: parseSkillBody(skill.content),
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Skills</h4>
          <button
            type="button"
            onClick={() => {
              setNewSkill(true);
              setEditingSkill(null);
              setSkillDraft({ name: "", description: "", body: "" });
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add skill
          </button>
        </div>
        {skills.length === 0 ? (
          <p className="text-xs text-slate-400">No skills yet</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {skills.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 px-3 py-2.5">
                <button type="button" onClick={() => startEditSkill(s)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-medium text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">{s.description || s.id}</div>
                </button>
                <button
                  type="button"
                  onClick={() => void removeSkill(s.id)}
                  disabled={busy}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(newSkill || editingSkill) && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <input
            value={skillDraft.name}
            onChange={(e) => setSkillDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Skill name"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            value={skillDraft.description}
            onChange={(e) => setSkillDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Description"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <textarea
            value={skillDraft.body}
            onChange={(e) => setSkillDraft((d) => ({ ...d, body: e.target.value }))}
            placeholder="Skill instructions (markdown)"
            rows={6}
            className="w-full rounded border border-slate-200 px-2 py-1.5 font-mono text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveSkill()}
              disabled={busy || !skillDraft.name.trim()}
              className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setNewSkill(false);
                setEditingSkill(null);
              }}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">MCP servers</h4>
          <button
            type="button"
            onClick={() => setMcpForm(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />
            Add MCP
          </button>
        </div>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {mcpServers.map((m) => (
            <li key={m.name} className="flex items-start justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{m.name}</span>
                  {m.protected && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                      protected
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {m.url ?? `${m.command} ${(m.args ?? []).join(" ")}`}
                </div>
              </div>
              {!m.protected && (
                <button
                  type="button"
                  onClick={() => void removeMcp(m.name)}
                  disabled={busy}
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {mcpForm && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <input
            value={mcpDraft.name ?? ""}
            onChange={(e) => setMcpDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Server name"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            value={mcpDraft.command ?? ""}
            onChange={(e) => setMcpDraft((d) => ({ ...d, command: e.target.value }))}
            placeholder="command (stdio)"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            value={(mcpDraft.args ?? []).join(" ")}
            onChange={(e) =>
              setMcpDraft((d) => ({ ...d, args: e.target.value.split(" ").filter(Boolean) }))
            }
            placeholder="args (space-separated)"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            value={mcpDraft.url ?? ""}
            onChange={(e) => setMcpDraft((d) => ({ ...d, url: e.target.value || undefined }))}
            placeholder="url (HTTP MCP, optional)"
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void saveMcp()}
              disabled={busy || !mcpDraft.name?.trim()}
              className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Save
            </button>
            <button type="button" onClick={() => setMcpForm(false)} className="rounded border px-3 py-1.5 text-xs">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
