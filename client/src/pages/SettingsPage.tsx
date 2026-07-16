import { useEffect, useState } from "react";
import { AlertTriangle, Shield, ShieldOff } from "lucide-react";
import { api, type OrgSettings } from "../lib/api";
import { Spinner } from "../components/ui/Skeleton";

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [ceiling, setCeiling] = useState("");
  const [savingKill, setSavingKill] = useState(false);
  const [savingCeiling, setSavingCeiling] = useState(false);
  const [savedCeiling, setSavedCeiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<OrgSettings>("/api/org/settings")
      .then((s) => {
        setSettings(s);
        setCeiling(s.maxExposureLimitUsd != null ? String(s.maxExposureLimitUsd) : "");
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load settings")
      );
  }, []);

  async function togglePause() {
    if (!settings) return;
    setSavingKill(true);
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
      setSavingKill(false);
    }
  }

  async function saveCeiling() {
    setSavingCeiling(true);
    setSavedCeiling(false);
    setError(null);
    try {
      const next = await api<OrgSettings>("/api/org/settings", {
        method: "PATCH",
        body: JSON.stringify({ maxExposureLimitUsd: toNullableNumber(ceiling) }),
      });
      setSettings(next);
      setCeiling(next.maxExposureLimitUsd != null ? String(next.maxExposureLimitUsd) : "");
      setSavedCeiling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save exposure ceiling");
    } finally {
      setSavingCeiling(false);
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
            disabled={savingKill}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
              paused
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {savingKill ? "Updating…" : paused ? "Resume agents" : "Pause all agents"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Exposure ceiling</h2>
        <p className="mt-1 text-sm text-slate-600">
          Hard org max per transaction. Payments above this are auto-rejected (not sent for approval).
          Agent auto-approve limits are also capped to this value. Leave blank for no ceiling.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <input
              type="number"
              min="0"
              step="any"
              value={ceiling}
              onChange={(e) => {
                setCeiling(e.target.value);
                setSavedCeiling(false);
              }}
              placeholder="none"
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#00a8e8] focus:outline-none focus:ring-1 focus:ring-[#00a8e8]/40"
            />
            <span className="text-slate-500">USDC / transaction</span>
          </div>
          <button
            type="button"
            onClick={() => void saveCeiling()}
            disabled={savingCeiling}
            className="btn-primary disabled:opacity-50"
          >
            {savingCeiling ? "Saving…" : "Save ceiling"}
          </button>
          {savedCeiling && <span className="text-sm text-emerald-600">Saved</span>}
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
