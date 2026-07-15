import os from "node:os";
import path from "node:path";

function expandHome(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Legacy path used before Windows-native Hermes home was implemented. */
export function legacyHermesHomeDir(): string {
  return path.join(os.homedir(), ".hermes");
}

/** Match Hermes: %LOCALAPPDATA%\\hermes on Windows, ~/.hermes elsewhere. */
export function getHermesHomeDir(): string {
  const explicit = process.env.HERMES_HOME?.trim();
  if (explicit) return expandHome(explicit);
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    if (local) return path.join(local, "hermes");
    return path.join(os.homedir(), "AppData", "Local", "hermes");
  }
  return path.join(os.homedir(), ".hermes");
}

export function getProfilesDir(): string {
  const explicit = process.env.HERMES_PROFILES_DIR?.trim();
  if (explicit) return expandHome(explicit);
  return path.join(getHermesHomeDir(), "profiles");
}

export function profileNameForAgent(orgId: string, agentId: string): string {
  // Hermes requires [a-z0-9][a-z0-9_-]* — Clerk org IDs are mixed-case.
  const raw = `${orgId}__${agentId}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const cleaned = raw.replace(/^-+/, "").replace(/-+/g, "-");
  return cleaned || "agent";
}

export function profileDirForAgent(agent: {
  orgId: string;
  id: string;
  hermesProfileName?: string | null;
}): string {
  const name = agent.hermesProfileName ?? profileNameForAgent(agent.orgId, agent.id);
  return path.join(getProfilesDir(), name);
}

/** Object-store key prefix for a profile (under hermes home layout). */
export function profileStoragePrefix(profileName: string): string {
  return `profiles/${profileName}`;
}
