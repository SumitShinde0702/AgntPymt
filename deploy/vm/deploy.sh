#!/usr/bin/env bash
# Run on the VM (from the repo root) to rebuild and restart AgntPymt.
#
# Prerequisites on the VM:
#   - Docker installed
#   - Repo cloned (e.g. ~/AgntPymt or /opt/agntpymt)
#   - .env present in the repo root (never commit this)
#
# Port policy:
#   - App listens on 8080 inside the container and joins docker network "agntpymt-net"
#   - Do NOT publish host :80/:443 here — Caddy owns those for HTTPS
#   - Caddyfile should reverse_proxy agntpymt:8080 (same docker network)
#   - Optional: AGNTPYMT_PUBLISH_PORT=8080 publishes localhost:8080 for debugging only

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

NETWORK="${AGNTPYMT_DOCKER_NETWORK:-agntpymt-net}"

if [[ ! -f .env ]]; then
  echo "Missing $ROOT/.env — copy your production env onto the VM first."
  exit 1
fi

# Load public build-time vars from .env (Clerk publishable key is safe in the image)
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> Ensuring docker network ${NETWORK}…"
docker network create "${NETWORK}" 2>/dev/null || true

echo "==> Building image…"
docker build -t agntpymt:latest \
  --build-arg "VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY:-}" \
  --build-arg "VITE_APP_NAME=${VITE_APP_NAME:-AgntPymt}" \
  .

echo "==> Restarting app container…"
docker stop agntpymt 2>/dev/null || true
docker rm agntpymt 2>/dev/null || true

RUN_ARGS=(
  --name agntpymt
  --restart unless-stopped
  --network "${NETWORK}"
  --env-file .env
  -e PORT=8080
  -e NODE_ENV=production
  # Let container reach Hermes on the VM host (:8642)
  --add-host=host.docker.internal:host-gateway
)

# Always publish localhost:8080 so Hermes on the host can call MCP at http://127.0.0.1:8080/mcp
# (not public — 127.0.0.1 only). Override with AGNTPYMT_PUBLISH_PORT= to change/disable.
PUBLISH_PORT="${AGNTPYMT_PUBLISH_PORT:-8080}"
if [[ "${PUBLISH_PORT}" != "0" && "${PUBLISH_PORT}" != "off" ]]; then
  RUN_ARGS+=(-p "127.0.0.1:${PUBLISH_PORT}:8080")
fi

docker run -d "${RUN_ARGS[@]}" agntpymt:latest

# Keep Caddy on the same network so reverse_proxy agntpymt:8080 works across redeploys
if docker ps --format '{{.Names}}' | grep -qx caddy; then
  docker network connect "${NETWORK}" caddy 2>/dev/null || true
  echo "==> Ensured caddy is on ${NETWORK} (Caddyfile should use: reverse_proxy agntpymt:8080)"
fi

echo "==> Deployed on network ${NETWORK} (no host :80/:443 binding)."
echo "    Logs: docker logs -f agntpymt"
echo "    HTTPS: via Caddy (demo.agntpymt.com) → agntpymt:8080"
echo "    Hermes: set HERMES_API_URL=http://host.docker.internal:8642 in .env (after setup-hermes.sh)"
echo "    MCP for Hermes: http://127.0.0.1:${PUBLISH_PORT:-8080}/mcp"
