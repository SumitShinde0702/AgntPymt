#!/usr/bin/env bash
# Run on the VM (from the repo root) to rebuild and restart AgntPymt.
#
# Prerequisites on the VM:
#   - Docker installed
#   - Repo cloned (e.g. /opt/agntpymt)
#   - .env present in the repo root (never commit this)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env — copy your production env onto the VM first."
  exit 1
fi

# Load public build-time vars from .env (Clerk publishable key is safe in the image)
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> Building image…"
docker build -t agntpymt:latest \
  --build-arg "VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-}" \
  --build-arg "VITE_APP_NAME=${VITE_APP_NAME:-AgntPymt}" \
  .

echo "==> Restarting container…"
docker stop agntpymt 2>/dev/null || true
docker rm agntpymt 2>/dev/null || true

docker run -d \
  --name agntpymt \
  --restart unless-stopped \
  -p "${PORT:-8080}:8080" \
  --env-file .env \
  -e PORT=8080 \
  -e NODE_ENV=production \
  agntpymt:latest

echo "==> Deployed. Logs: docker logs -f agntpymt"
