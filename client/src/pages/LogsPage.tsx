import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Log = {
  id: string;
  runId: string;
  agentId: string;
  step: string;
  message: string;
  actor: string | null;
  createdAt: string;
};

export function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    void api<Log[]>("/api/logs").then(setLogs);
  }, []);

  const byRun = logs.reduce<Record<string, Log[]>>((acc, log) => {
    (acc[log.runId] ??= []).push(log);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Run Logs</h1>
      <p className="mb-6 text-slate-500">Expandable audit trail for every agent run.</p>
      <div className="space-y-4">
        {Object.entries(byRun).map(([runId, runLogs]) => (
          <details key={runId} className="rounded-2xl border border-slate-200 bg-white" open>
            <summary className="cursor-pointer px-5 py-4 font-medium">
              Run {runId.slice(0, 8)}… ({runLogs.length} steps)
            </summary>
            <div className="space-y-2 border-t border-slate-100 px-5 py-4">
              {runLogs.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm">
                  <span className="w-36 shrink-0 text-xs text-slate-400">{log.step}</span>
                  <span className="w-32 shrink-0 text-xs font-medium text-accent-navy">{log.actor ?? "—"}</span>
                  <span className="text-slate-800">{log.message}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
        {logs.length === 0 && <p className="text-slate-500">No logs yet. Run a task from the Agent Console.</p>}
      </div>
    </div>
  );
}
