import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Play, Plus } from "lucide-react";
import { api, subscribeRunEvents, type Agent, type RunEvent } from "../../lib/api";
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
  onNewAgent?: () => void;
};

export function AgentConsole({ agents, onRunComplete, onNewAgent }: Props) {
  const hasAgents = agents.length > 0;
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (agents.length && !agentId) setAgentId(agents[0].id);
  }, [agents, agentId]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function handleRun() {
    if (!agentId || !prompt.trim()) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setRunning(true);
    setEvents([]);
    setRunError(null);

    let received = false;
    let done = false;
    let timeout: number;

    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      abort.abort();
      setRunning(false);
      onRunComplete?.();
    };

    timeout = window.setTimeout(() => {
      if (done) return;
      setRunError("Run timed out — check server logs and SIMULATE_PAYMENTS setting.");
      finish();
    }, 90_000);

    try {
      const { runId } = await api<{ runId: string }>("/api/agent/run", {
        method: "POST",
        body: JSON.stringify({ agentId, prompt }),
        signal: abort.signal,
      });

      await subscribeRunEvents(
        runId,
        (event) => {
          received = true;
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
            finish();
          }
        },
        abort.signal
      );

      if (!received && !done) {
        setRunError("Run ended without events — check server logs and wallet funding.");
      }
      finish();
    } catch (err) {
      if (done || abort.signal.aborted) return;
      window.clearTimeout(timeout);
      setRunning(false);
      const message = err instanceof Error ? err.message : "Failed to start run";
      setRunError(
        received
          ? message
          : message.includes("invalid response")
            ? message
            : `Lost connection to run stream — ${message}`
      );
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
        {!hasAgents ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Bot className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-900">No agents yet</p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Create an agent first, then come back here to run purchases and watch the negotiation chat.
            </p>
            {onNewAgent && (
              <button
                type="button"
                onClick={onNewAgent}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                Create your first agent
              </button>
            )}
          </div>
        ) : (
          <>
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
                className="min-w-[10rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
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
                disabled={running || !prompt.trim() || !agentId}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {running ? "Negotiating…" : "Run"}
              </button>
            </div>
          </>
        )}
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

      {runError && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">{runError}</div>
      )}

      <div ref={feedRef} className="h-80 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-3">
        <RunChatFeed events={events} agentName={agent?.name} />
      </div>
    </div>
  );
}
