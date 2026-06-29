import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { api, type Agent, type RunEvent } from "../../lib/api";
import { RunChatFeed } from "./RunChatFeed";

const EXAMPLES = [
  "Buy premium sector research data",
  "Book cheapest SFO→JFK flight next Tuesday",
  "Order 50 ergonomic mouse pads for the office",
  "Pay the AWS invoice for this month",
];

type Props = {
  agents: Agent[];
  onRunComplete?: () => void;
};

export function AgentConsole({ agents, onRunComplete }: Props) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agents.length && !agentId) setAgentId(agents[0].id);
  }, [agents, agentId]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  async function handleRun() {
    if (!agentId || !prompt.trim()) return;
    setRunning(true);
    setEvents([]);

    try {
      const { runId } = await api<{ runId: string }>("/api/agent/run", {
        method: "POST",
        body: JSON.stringify({ agentId, prompt }),
      });

      const es = new EventSource(`/api/agent/run/${runId}/events`);
      es.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as RunEvent;
        setEvents((prev) => {
          if (prev.some((e) => e.createdAt === event.createdAt && e.step === event.step)) return prev;
          return [...prev, event];
        });
        if (
          event.step === "run_completed" ||
          event.step === "payment_pending" ||
          event.step === "run_failed" ||
          event.step === "payment_failed"
        ) {
          es.close();
          setRunning(false);
          onRunComplete?.();
        }
      };
      es.onerror = () => {
        es.close();
        setRunning(false);
        onRunComplete?.();
      };
    } catch {
      setRunning(false);
    }
  }

  const agent = agents.find((a) => a.id === agentId);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Agent Console</h2>
        <p className="text-sm text-slate-500">
          AI-powered negotiation chat.{" "}
          <Link to="/agents" className="font-medium text-brand-600 hover:underline">
            Set rules per agent
          </Link>{" "}
          · fund USDC + ETH on Wallets first.
        </p>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setPrompt(ex)}
              disabled={running}
              className="rounded-full border border-brand-200 bg-white px-3 py-1 text-xs text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          disabled={running}
          placeholder="Tell your agent what to buy…"
          className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100"
        />

        <div className="flex items-center gap-3">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            disabled={running}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void handleRun()}
            disabled={running || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {running ? "Negotiating…" : "Run"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            Your agent
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-violet-500" />
            Vendor
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            System
          </span>
        </span>
        {running && <span className="animate-pulse text-brand-600">Live</span>}
      </div>

      <div ref={feedRef} className="h-80 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-3">
        <RunChatFeed events={events} agentName={agent?.name} />
      </div>
    </div>
  );
}
