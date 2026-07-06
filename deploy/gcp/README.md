# GCP infra (optional)

Use this for **backing services** on GCP. The AgntPymt app is deployed **manually on a VM** — see [`deploy/vm/README.md`](../vm/README.md).

## Architecture

- **GCE VM** — AgntPymt API + UI (Docker, `deploy/vm/deploy.sh`)
- **Cloud SQL PostgreSQL** — agents, runs, approvals, wallets, audit
- **GCS bucket** — Hermes profiles (`hermes/profiles/…`, `hermes/config.yaml`)
- **GCE VM (optional second)** — Hermes gateway (syncs profiles from GCS)
- **Secret Manager** — `DATABASE_URL`, API keys, Clerk secret (optional)

## Bootstrap (one-time)

```bash
export PROJECT_ID=your-gcp-project
export REGION=asia-southeast1

bash deploy/gcp/bootstrap.sh
```

Or on Windows:

```powershell
$env:PROJECT_ID = "your-gcp-project"
$env:REGION = "asia-southeast1"
.\deploy\gcp\bootstrap.ps1
```

Note the SQL connection name from the output (e.g. `my-project:asia-southeast1:agntpymt-db`).

## Deploy the app

On your app VM:

```bash
cd /opt/agntpymt
git pull
bash deploy/vm/deploy.sh
```

Set `DATABASE_URL` in `.env` to your Cloud SQL instance (see below).

## Local dev (PostgreSQL via Docker)

```bash
docker compose -f deploy/docker/docker-compose.postgres.yml up -d
# .env:
#   DATABASE_URL=postgresql://agntpymt:agntpymt@localhost:5432/agntpymt
npm run db:migrate
npm run db:seed
npm run dev
```

## Cloud SQL connection

From the app VM, use the public IP + password, or [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy):

```
postgresql://agntpymt:PASSWORD@CLOUD_SQL_IP:5432/agntpymt
```

## Profile storage (GCS)

Set `GCS_PROFILE_BUCKET` in `.env` if using GCS-backed Hermes profiles. Layout:

```
gs://{bucket}/hermes/
  config.yaml
  profiles/{orgId}__{agentId}/SOUL.md
```

Hermes VM startup: `deploy/gcp/hermes-vm-startup.sh`
