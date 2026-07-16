import { useEffect, useState } from "react";
import { AlertTriangle, Shield, ShieldOff } from "lucide-react";
import { api, type OrgSettings } from "../lib/api";
import { Spinner } from "../components/ui/Skeleton";

export function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<OrgSettings>("/api/org/settings")
      .then(setSettings)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load settings")
      );
  }, []);

  async function togglePause() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api<OrgSettings>("/api/org/settings", {
        method: "PATCH",
        body: JSON.stringify({ agentsPaused: !settings.agentsPaused }),
      });
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update kill switch");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    if (error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      );
    }
    return <Spinner label="Loading settings…" />;
  }

  const paused = settings.agentsPaused;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500">
          Organization-wide controls. Risk &amp; compliance owned — applies to every agent.
        </p>
      </div>

      <div
        className={`rounded-2xl border-2 p-6 shadow-sm ${
          paused ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-xl p-2.5 ${
                paused ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"
              }`}
            >
              {paused ? <ShieldOff className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Kill switch</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                Pause all agents immediately. While paused, every proposed payment is denied before
                execution — a circuit breaker for runaway agents or incidents.
              </p>
              {paused && (
                <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  All agents are currently paused.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void togglePause()}
            disabled={saving}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
              paused
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {saving ? "Updating…" : paused ? "Resume agents" : "Pause all agents"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
