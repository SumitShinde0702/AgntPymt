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
# Hermes gateway on the host reads MCP servers from here; the app must write into the same dir.
HOST_HERMES_HOME="${HOST_HERMES_HOME:-$HOME/.hermes}"

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
  # Share Hermes home so the gateway sees the agntpymt MCP entry the app writes to config.yaml
  --user "$(id -u):$(id -g)"
  -e HOME=/tmp
  -v "${HOST_HERMES_HOME}:/hermes"
  -e HERMES_HOME=/hermes
)
mkdir -p "${HOST_HERMES_HOME}"

# Always publish localhost:8080 so Hermes on the host can call MCP at http://127.0.0.1:8080/mcp
# (not public — 127.0.0.1 only). Override with AGNTPYMT_PUBLISH_PORT= to change/disable.
PUBLISH_PORT="${AGNTPYMT_PUBLISH_PORT:-8080}"
if [[ "${PUBLISH_PORT}" != "0" && "${PUBLISH_PORT}" != "off" ]]; then
  RUN_ARGS+=(-p "127.0.0.1:${PUBLISH_PORT}:8080")
  # MCP URL written into Hermes config must be reachable from the host, not the public HTTPS URL
  RUN_ARGS+=(-e "AGNTPYMT_API_URL=${AGNTPYMT_API_URL:-http://127.0.0.1:${PUBLISH_PORT}}")
fi

docker run -d "${RUN_ARGS[@]}" agntpymt:latest

if systemctl list-unit-files hermes-gateway.service >/dev/null 2>&1; then
  echo "==> Waiting for app to sync Hermes MCP config…"
  for _ in $(seq 1 60); do
    if grep -q "agntpymt" "${HOST_HERMES_HOME}/config.yaml" 2>/dev/null \
      && docker exec agntpymt node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      break
    fi
    sleep 2
  done
  if grep -q "agntpymt" "${HOST_HERMES_HOME}/config.yaml" 2>/dev/null; then
    # Gateway only loads MCP servers at startup
    sudo -n systemctl restart hermes-gateway \
      && echo "==> Restarted hermes-gateway (agntpymt MCP loaded)" \
      || echo "WARN: could not restart hermes-gateway — run: sudo systemctl restart hermes-gateway"
  else
    echo "WARN: ${HOST_HERMES_HOME}/config.yaml has no agntpymt MCP entry — check: docker logs agntpymt"
  fi
fi

# Keep Caddy on the same network so reverse_proxy agntpymt:8080 works across redeploys
if docker ps --format '{{.Names}}' | grep -qx caddy; then
  docker network connect "${NETWORK}" caddy 2>/dev/null || true
  echo "==> Ensured caddy is on ${NETWORK} (Caddyfile should use: reverse_proxy agntpymt:8080)"
fi

echo "==> Deployed on network ${NETWORK} (no host :80/:443 binding)."
echo "    Logs: docker logs -f agntpymt"
echo "    HTTPS: via Caddy (demo.agntpymt.com) → agntpymt:8080"
echo "    Hermes: set HERMES_API_URL=http://host.docker.internal:8642 in .env (after setup-hermes.sh)"
echo "    MCP for Hermes: http://127.0.0.1:${PUBLISH_PORT:-8080}/mcp (config: ${HOST_HERMES_HOME}/config.yaml)"
