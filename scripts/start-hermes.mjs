/**
 * Wait for AgntPymt API, then start Hermes gateway (Windows-safe — no process.exit after fetch).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.WAIT_URL ?? "http://127.0.0.1:3001/api/health";
const maxAttempts = Number(process.env.WAIT_MAX_ATTEMPTS ?? 180);

async function isAgntPymtApi() {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === "ok" && body?.daemon === "running";
  } catch {
    return false;
  }
}

async function waitForApi() {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isAgntPymtApi()) {
      console.log(`API ready at ${url.replace(/\/api\/health\/?$/, "")} (after ~${i} attempts)`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error(`Timed out waiting for ${url} after ${maxAttempts}s`);
  process.exit(1);
}

await waitForApi();

const py = process.platform === "win32" ? "python" : "python3";
const child = spawn(py, [path.join(root, "scripts", "hermes-gateway.py")], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("error", (err) => {
  console.error("Failed to start Hermes gateway:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
