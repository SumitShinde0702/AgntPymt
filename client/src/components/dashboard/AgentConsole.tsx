import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, Play, Plus } from "lucide-react";
import { api, subscribeRunEvents, type Agent, type RunEvent } from "../../lib/api";
import { RunChatFeed, RUN_IDLE_TIMEOUT_MS } from "./RunChatFeed";

const EXAMPLES = [
  "Buy premium sector research data",
  "Book cheapest SFO→JFK flight next Tuesday",
  "Order 50 ergonomic mouse pads for the office",
  "Pay the AWS invoice for this month",
];

const SESSION_KEY = "agntpymt:activeRun";

type StoredRun = {
  runId: string;
  agentId: string;
  prompt: string;
  events: RunEvent[];
};

function mergeEvent(prev: RunEvent[], event: RunEvent): RunEvent[] {
  const streamId = event.payload?.streamId;
  if (typeof streamId === "string" && event.step === "hermes_message") {
    const idx = prev.findIndex((e) => e.payload?.streamId === streamId);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = event;
      return next;
    }
  }
  if (prev.some((e) => e.createdAt === event.createdAt && e.step === event.step)) return prev;
  return [...prev, event];
}

type Props = {
  agents: Agent[];
  onRunComplete?: () => void;
  onNewAgent?: () => void;
};

export function AgentConsole({ agents, onRunComplete, onNewAgent }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const hasAgents = agents.length > 0;
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    if (agents.length && !agentId) setAgentId(agents[0].id);
  }, [agents, agentId]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  useEffect(() => {
    if (!runId || events.length === 0) return;
    const stored: StoredRun = { runId, agentId, prompt, events };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
  }, [runId, agentId, prompt, events]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function clearRunTimeout() {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function armTimeout(ms: number, onTimeout: () => void) {
    clearRunTimeout();
    timeoutRef.current = window.setTimeout(onTimeout, ms);
  }

  function handleRunEvent(
    event: RunEvent,
    ctx: {
      received: { value: boolean };
      finish: () => void;
    }
  ) {
    ctx.received.value = true;
    setEvents((prev) => mergeEvent(prev, event));

    if (
      event.step === "run_completed" ||
      event.step === "payment_pending" ||
      event.step === "run_failed" ||
      event.step === "payment_failed" ||
      event.step === "hermes_approval_denied"
    ) {
      ctx.finish();
      return;
    }

    // Reset idle timer on every event so long Hermes + negotiation runs don't die at 90s.
    if (event.step === "hermes_approval") {
      armTimeout(600_000, () => {
        setRunError("Waiting for approval timed out — approve or deny in the chat.");
        ctx.finish();
      });
      return;
    }

    armTimeout(RUN_IDLE_TIMEOUT_MS, () => {
      setRunError("Run timed out — no new events for 5 minutes. Check Hermes / server logs.");
      ctx.finish();
    });
  }

  async function connectToRun(
    id: string,
    opts: { received?: { value: boolean }; onFinish?: () => void; awaitingApproval?: boolean } = {}
  ) {
    const received = opts.received ?? { value: false };
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearRunTimeout();
      abortRef.current?.abort();
      setRunning(false);
      onRunComplete?.();
      opts.onFinish?.();
    };

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const defaultMs = opts.awaitingApproval ? 600_000 : RUN_IDLE_TIMEOUT_MS;
    armTimeout(defaultMs, () => {
      if (done) return;
      setRunError(
        opts.awaitingApproval
          ? "Waiting for approval timed out — approve or deny in the chat."
          : "Run timed out — no new events for 5 minutes. Check Hermes / server logs."
      );
      finish();
    });

    try {
      await subscribeRunEvents(
        id,
        (event) => handleRunEvent(event, { received, finish }),
        abort.signal
      );

      if (!received.value && !done) {
        setRunError("Run ended without events — check server logs and wallet funding.");
      }
      finish();
    } catch (err) {
      if (done || abort.signal.aborted) return;
      clearRunTimeout();
      setRunning(false);
      const message = err instanceof Error ? err.message : "Failed to connect to run";
      setRunError(
        received.value
          ? message
          : message.includes("invalid response")
            ? message
            : `Lost connection to run stream — ${message}`
      );
    }
  }

  async function restoreRun(targetRunId: string) {
    try {
      const history = await api<{
        runId: string;
        status: string;
        agentId: string;
        prompt: string;
        events: RunEvent[];
      }>(`/api/agent/run/${targetRunId}/history`);

      setRunId(history.runId);
      setAgentId(history.agentId);
      setPrompt(history.prompt);
      setEvents(history.events);
      setRunError(null);

      const active = history.status === "running" || history.status === "awaiting_approval";
      if (active) {
        setRunning(true);
        const awaitingApproval =
          history.status === "awaiting_approval" &&
          history.events.some((e) => e.step === "hermes_approval");
        void connectToRun(history.runId, { awaitingApproval });
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  useEffect(() => {
    if (restoredRef.current || !hasAgents) return;
    restoredRef.current = true;

    const urlRun = searchParams.get("run");
    if (urlRun) {
      void restoreRun(urlRun);
      searchParams.delete("run");
      setSearchParams(searchParams, { replace: true });
      return;
    }

    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as StoredRun;
      if (stored.runId) void restoreRun(stored.runId);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, [hasAgents, searchParams, setSearchParams]);

  async function handleRun() {
    if (!agentId || !prompt.trim()) return;

    setRunning(true);
    setEvents([]);
    setRunError(null);
    setRunId(null);
    sessionStorage.removeItem(SESSION_KEY);

    const received = { value: false };
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearRunTimeout();
      abortRef.current?.abort();
      setRunning(false);
      onRunComplete?.();
    };

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    armTimeout(RUN_IDLE_TIMEOUT_MS, () => {
      if (done) return;
      setRunError("Run timed out — no new events for 5 minutes. Check Hermes / server logs.");
      finish();
    });

    try {
      const { runId: newRunId } = await api<{ runId: string }>("/api/agent/run", {
        method: "POST",
        body: JSON.stringify({ agentId, prompt }),
        signal: abort.signal,
      });

      setRunId(newRunId);

      await subscribeRunEvents(
        newRunId,
        (event) => handleRunEvent(event, { received, finish }),
        abort.signal
      );

      if (!received.value && !done) {
        setRunError("Run ended without events — check server logs and wallet funding.");
      }
      finish();
    } catch (err) {
      if (done || abort.signal.aborted) return;
      clearRunTimeout();
      setRunning(false);
      const message = err instanceof Error ? err.message : "Failed to start run";
      setRunError(
        received.value
          ? message
          : message.includes("invalid response")
            ? message
            : `Lost connection to run stream — ${message}`
      );
    }
  }

  async function handleHermesApproval(approvalId: string, choice: "approve" | "deny") {
    const path =
      choice === "approve"
        ? `/api/approvals/${approvalId}/approve`
        : `/api/approvals/${approvalId}/deny`;
    await api(path, { method: "POST" });
    onRunComplete?.();
  }

  const agent = agents.find((a) => a.id === agentId);

  return (
    <div id="agent-console" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900">Agent Console</h2>
        <p className="text-sm text-slate-500">
          AI-powered negotiation chat.{" "}
          <Link to="/agents" className="link-primary">
            Set rules per agent
          </Link>{" "}
          · fund USDC + ETH on Wallets first.
        </p>
      </div>

      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
        {!hasAgents ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
            <div className="icon-well-round mb-3 h-12 w-12">
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
                className="btn-primary mt-4"
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
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-accent-cyan hover:bg-slate-50 hover:text-accent-navy disabled:opacity-50"
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
              className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-accent-cyan focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
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
                className="btn-primary disabled:opacity-50"
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
            <span className="h-2 w-2 rounded-full bg-accent-cyan" />
            Your agent
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-accent-navy" />
            Vendor
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            System
          </span>
        </span>
        {running && <span className="animate-pulse text-accent-cyan">Live</span>}
      </div>

      {runError && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">{runError}</div>
      )}

      <div ref={feedRef} className="h-80 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-3">
        <RunChatFeed
          events={events}
          agentName={agent?.name}
          live={running}
          onHermesApproval={handleHermesApproval}
        />
      </div>
    </div>
  );
}
