#!/usr/bin/env bash
# Install + run Hermes gateway on the same VM as AgntPymt (no GCS required).
# Usage (on the VM):
#   bash deploy/vm/setup-hermes.sh
#
# Requires: Python 3.11+, pip, and AgntPymt already deployed with Docker.
# Hermes listens on 127.0.0.1:8642; the app container reaches it via host.docker.internal
# or by setting HERMES_API_URL to the host gateway IP.

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
HERMES_API_KEY="${HERMES_API_KEY:-change-me-local-dev}"
# App is on Docker network; from Hermes on the host, hit published MCP via localhost
# if you publish 8080, or use the container name from a sidecar. Default: host loopback
# through Caddy/app — MCP is on the app at /mcp.
AGNTPYMT_API_URL="${AGNTPYMT_API_URL:-http://127.0.0.1:8080}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"

echo "==> Hermes home: $HERMES_HOME"
mkdir -p "$HERMES_HOME"

echo "==> Python venv…"
python3 -m venv "$HOME/.venv/hermes"
# shellcheck disable=SC1091
source "$HOME/.venv/hermes/bin/activate"
pip install -q --upgrade pip hermes-agent

echo "==> Writing $HERMES_HOME/.env…"
{
  echo "API_SERVER_ENABLED=true"
  echo "API_SERVER_HOST=0.0.0.0"
  echo "API_SERVER_PORT=8642"
  echo "API_SERVER_KEY=${HERMES_API_KEY}"
  echo "GATEWAY_ALLOW_ALL_USERS=true"
  echo "AGNTPYMT_API_URL=${AGNTPYMT_API_URL}"
  if [[ -n "$OPENAI_API_KEY" ]]; then
    echo "OPENAI_API_KEY=${OPENAI_API_KEY}"
  fi
  if [[ -n "$DEEPSEEK_API_KEY" ]]; then
    echo "DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}"
  fi
} >"$HERMES_HOME/.env"

if [[ -z "$OPENAI_API_KEY" && -z "$DEEPSEEK_API_KEY" ]]; then
  echo "WARNING: No OPENAI_API_KEY or DEEPSEEK_API_KEY set."
  echo "  Export one before re-running, or edit $HERMES_HOME/.env and restart hermes."
fi

echo "==> systemd unit…"
sudo tee /etc/systemd/system/hermes-gateway.service >/dev/null <<UNIT
[Unit]
Description=Hermes Agent gateway (AgntPymt)
After=network.target docker.service

[Service]
Type=simple
User=$USER
Environment=HERMES_HOME=$HERMES_HOME
WorkingDirectory=$HOME
ExecStart=$HOME/.venv/hermes/bin/python -m hermes_cli.main gateway run --replace
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable hermes-gateway
sudo systemctl restart hermes-gateway

sleep 2
curl -sf "http://127.0.0.1:8642/health" && echo "" || echo "Health check failed — see: journalctl -u hermes-gateway -n 50"

echo ""
echo "Done. Point AgntPymt .env at Hermes:"
echo "  HERMES_API_URL=http://172.17.0.1:8642   # Docker bridge to host (Linux)"
echo "  # or host.docker.internal if supported"
echo "  HERMES_API_KEY=${HERMES_API_KEY}"
echo "Then: cd ~/AgntPymt && bash deploy/vm/deploy.sh"
