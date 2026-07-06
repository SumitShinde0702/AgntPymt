import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, X } from "lucide-react";
import { api, type Approval, type DashboardData } from "../../lib/api";

type ToastItem = {
  id: string;
  runId?: string | null;
  toolName?: string | null;
  message: string;
};

export function ApprovalToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    const poll = () => {
      void api<DashboardData>("/api/dashboard").then((d) => {
        const pending = (d.pendingApprovals ?? []).filter(
          (a: Approval) => a.status === "pending_approval" && a.kind === "hermes_action"
        );
        if (!seededRef.current) {
          for (const a of pending) seenRef.current.add(a.id);
          seededRef.current = true;
          return;
        }
        for (const a of pending) {
          if (seenRef.current.has(a.id)) continue;
          seenRef.current.add(a.id);
          const tool = a.toolName ?? a.vendorName.replace(/^Hermes · /, "");
          setToasts((prev) => [
            ...prev,
            {
              id: a.id,
              runId: a.runId,
              toolName: a.toolName,
              message: `Hermes wants to run ${tool}`,
            },
          ]);
        }
      });
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 12_000);
    return () => clearTimeout(t);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-amber-200 bg-white p-4 shadow-lg"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Approval needed</p>
            <p className="mt-0.5 text-sm text-slate-600">{toast.message}</p>
            <Link
              to={toast.runId ? `/dashboard?run=${toast.runId}` : "/dashboard"}
              className="mt-2 inline-block text-sm link-primary"
            >
              Open chat to approve →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
