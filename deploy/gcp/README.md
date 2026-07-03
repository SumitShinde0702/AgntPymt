# GCP deploy

## Architecture

- **Cloud Run** — AgntPymt API + static UI (`asia-southeast1` Singapore)
- **Cloud SQL PostgreSQL** — agents, runs, approvals, wallets, audit
- **GCS bucket** — Hermes profiles (`hermes/profiles/…`, `hermes/config.yaml`)
- **GCE VM** — Hermes gateway (syncs profiles from GCS)
- **Secret Manager** — `DATABASE_URL`, API keys, Clerk secret

## Quick start

```bash
export PROJECT_ID=your-gcp-project
export REGION=asia-southeast1

# 1. Bootstrap (Cloud SQL + GCS + secrets)
bash deploy/gcp/bootstrap.sh

# 2. Note SQL connection name from bootstrap output, e.g.:
#    my-project:asia-southeast1:agntpymt-db

# 3. Deploy Cloud Run (pass SQL instance + Clerk key)
gcloud builds submit --config deploy/gcp/cloudbuild.yaml \
  --substitutions=_VITE_CLERK_PUBLISHABLE_KEY=pk_test_...,_SQL_INSTANCE=my-project:asia-southeast1:agntpymt-db

# 4. Set AGNTPYMT_PUBLIC_URL to the Cloud Run service URL

# 5. Hermes VM — deploy/gcp/hermes-vm-startup.sh
```

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

Cloud Run uses the Unix socket via Secret Manager `DATABASE_URL`:

```
postgresql://agntpymt:PASSWORD@/agntpymt?host=/cloudsql/PROJECT:asia-southeast1:agntpymt-db
```

Local dev from your machine (optional): [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy)

## Profile storage (GCS)

Set `GCS_PROFILE_BUCKET` on Cloud Run. Layout:

```
gs://{bucket}/hermes/
  config.yaml
  profiles/{orgId}__{agentId}/SOUL.md
```
