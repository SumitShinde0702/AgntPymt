# AgntPymt MVP

Enterprise governance + payments control plane for autonomous AI agents.

## Quick start

```bash
# 1. Copy env (single root .env for client + server)
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Build db package, migrate & seed
npm run build -w db
npm run db:migrate
npm run db:seed

# 4. Start dev (client :5173 + server :3001)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Environment

All variables live in **one root `.env`** file. Vite reads `VITE_*` keys via `envDir: '..'` in `client/vite.config.ts`. The server loads the same file from the repo root.

## Optional: Hermes background runtime

```bash
pip install hermes-agent
hermes setup
# Enable API in ~/.hermes/.env: API_SERVER_ENABLED=true
npm run dev:all   # client + server + hermes gateway
```

Register AgntPymt MCP in Hermes — see `docs/hermes-mcp.example.json`.

## Demo flows

Micro-payments default to **$0.01 USDC** (`DEMO_TRANSACTION_FEE_USD` in `.env`). Re-seed after pricing changes: `npm run db:seed`.

1. **Auto-approve + negotiate** — Research Agent → "Buy premium sector research data" → seller quotes $0.02, agent counters $0.01, settles
2. **Instant micro-pay** — Procurement Agent → "Order office supplies" → $0.01, no approval needed
3. **Human approval** — Cloud Ops → "Pay AWS invoice" → negotiates to $0.08 → exceeds $0.05 auto-approve limit → approve in UI
