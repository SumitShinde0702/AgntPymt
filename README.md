# AgntPymt MVP

Enterprise governance + payments control plane for autonomous AI agents.

## Quick start

```bash
# 1. Copy env (single root .env for client + server)
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start PostgreSQL (Docker)
npm run db:up

# 4. Build db package, migrate & seed
npm run build -w db
npm run db:migrate
npm run db:seed

# 5. Start dev (client :5173 + server :3001)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment

All variables live in **one root `.env`** file. Vite reads `VITE_*` keys via `envDir: '..'` in `client/vite.config.ts`. The server loads the same file from the repo root.

## Optional: Hermes background runtime

AgntPymt provisions one **Hermes profile per agent** under `~/.hermes/profiles/{orgId}__{agentId}/` with `SOUL.md`, `config.yaml` (including the `agntpymt` MCP server), and `skills/`. Manage identity and capabilities from **Agents → Identity / Capabilities** in the UI.

### Local setup

```bash
pip install hermes-agent
hermes setup
# Enable API in ~/.hermes/.env:
#   API_SERVER_ENABLED=true
npm run dev:all   # client + server + hermes gateway (:8642)
```

On Windows, Hermes 0.17.0 can crash with `ModuleNotFoundError: cron.scheduler_provider` (package name collision). `dev:all` uses `scripts/hermes-gateway.py` to work around this automatically.

If the gateway starts but AgntPymt still shows Hermes offline, confirm `API_SERVER_ENABLED=true` in `~/.hermes/.env` and restart `npm run dev:all`.

When the Hermes gateway is online, **Run** in the Agent Console delegates to Hermes with the agent’s SOUL as `instructions` and streams lifecycle events into the chat feed. Purchases go through the `agntpymt` MCP tool (`AGENT_ID` is set per profile in `config.yaml`).

### Single-gateway limitation

One `hermes gateway` process uses **one** `HERMES_HOME` at startup. All agent profile **files** are created on disk, but skills/MCP from inactive profiles are not loaded until that profile is the gateway’s home. For local MVP:

- SOUL is passed via `instructions` on each `/v1/runs` call (works across profiles).
- The shared `agntpymt` MCP entry uses per-profile `AGENT_ID` in env when Hermes loads that profile’s `config.yaml`.

For full per-agent runtime isolation later: one gateway per org, subprocess per run with `HERMES_HOME=profile_path`, or Hermes per-run profile APIs.

See `docs/hermes-mcp.example.json` for a manual MCP reference (AgntPymt auto-writes this into each agent profile).

## GCP deploy

See [`deploy/gcp/README.md`](deploy/gcp/README.md) — Cloud Run + **Cloud SQL PostgreSQL** (Singapore `asia-southeast1`) + GCS profiles + Hermes VM.

## Demo flows

Micro-payments default to **$0.01 USDC** (`DEMO_TRANSACTION_FEE_USD` in `.env`). Re-seed after pricing changes: `npm run db:seed`.

1. **Auto-approve + negotiate** — Research Agent → "Buy premium sector research data" → seller quotes $0.02, agent counters $0.01, settles
2. **Instant micro-pay** — Procurement Agent → "Order office supplies" → $0.01, no approval needed
3. **Human approval** — Cloud Ops → "Pay AWS invoice" → negotiates to $0.08 → exceeds $0.05 auto-approve limit → approve in UI
