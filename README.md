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

## Deploy to Render (free tier)

Railway works too, but **Render’s free web tier** is a good fit for investor demos (no credits needed). The app serves a **landing page at `/`** and the live demo at `/dashboard`.

### 1. Turso database (free, persistent)

Local SQLite won’t survive Render’s ephemeral disk. Use [Turso](https://turso.tech):

```bash
# Install Turso CLI, then:
turso db create agntpymt-demo
turso db show agntpymt-demo --url
turso db tokens create agntpymt-demo
```

Copy the `libsql://…` URL and auth token.

### 2. Render web service

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (uses `render.yaml`)  
   — or **New Web Service**, connect repo, set:
   - **Build:** `npm install && npm run build`
   - **Start:** `npm run start:prod`
   - **Plan:** Free
3. Set environment variables:
   - `DATABASE_URL` = your Turso libsql URL
   - `TURSO_AUTH_TOKEN` = Turso token
   - `VITE_API_URL` = leave **empty** (same-origin API)
   - `SIMULATE_PAYMENTS` = `true`
4. Deploy — first boot runs migrate + seed automatically

**Note:** Free instances spin down after ~15 min idle; first visit after that takes ~1 min to wake up. Fine for investor demos; upgrade to Starter ($7/mo) to avoid cold starts.
