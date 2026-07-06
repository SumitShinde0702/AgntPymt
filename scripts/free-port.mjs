/**
 * Free a TCP port before starting dev (Windows + Unix).
 * Usage: node scripts/free-port.mjs [port]
 */
import { execSync } from "node:child_process";

const port = Number(process.argv[2] ?? process.env.PORT ?? 3001);

function freeOnWindows() {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`Freed port ${port} (stopped PID ${pid})`);
      } catch {
        // process may have already exited
      }
    }
  } catch {
    // nothing listening
  }
}

function freeOnUnix() {
  try {
    const pid = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (!pid) return;
    for (const p of pid.split(/\s+/)) {
      try {
        execSync(`kill -9 ${p}`, { stdio: "ignore" });
        console.log(`Freed port ${port} (stopped PID ${p})`);
      } catch {
        // ignore
      }
    }
  } catch {
    // nothing listening
  }
}

if (process.platform === "win32") freeOnWindows();
else freeOnUnix();
