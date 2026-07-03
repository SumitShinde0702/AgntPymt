#!/usr/bin/env bash
# Run on a GCE VM (Ubuntu 22.04+) to host Hermes gateway.
# Mount persistent disk at /var/hermes before running.
#
# Env (set in /etc/agntpymt/hermes.env):
#   GCS_PROFILE_BUCKET   — same bucket as Cloud Run
#   GCS_PROFILE_PREFIX   — default: hermes
#   HERMES_API_KEY       — must match Cloud Run HERMES_API_KEY
#   AGNTPYMT_PUBLIC_URL  — Cloud Run URL (for MCP in synced config.yaml)
#   OPENAI_API_KEY       — optional

set -euo pipefail

HERMES_HOME="${HERMES_HOME:-/var/hermes}"
GCS_BUCKET="${GCS_PROFILE_BUCKET:?Set GCS_PROFILE_BUCKET}"
GCS_PREFIX="${GCS_PROFILE_PREFIX:-hermes}"

echo "==> Installing Hermes…"
sudo apt-get update -qq
sudo apt-get install -y python3 python3-pip python3-venv gsutil cron

sudo mkdir -p "$HERMES_HOME" /etc/agntpymt
sudo chown -R "$USER:$USER" "$HERMES_HOME"

python3 -m venv "$HOME/.venv/hermes"
# shellcheck disable=SC1091
source "$HOME/.venv/hermes/bin/activate"
pip install -q --upgrade pip hermes-agent

echo "==> Syncing profiles from GCS…"
gsutil -m rsync -r -d "gs://${GCS_BUCKET}/${GCS_PREFIX}/" "${HERMES_HOME}/"

cat >"$HOME/sync-hermes-profiles.sh" <<'SYNC'
#!/usr/bin/env bash
set -euo pipefail
source /etc/agntpymt/hermes.env 2>/dev/null || true
HERMES_HOME="${HERMES_HOME:-/var/hermes}"
GCS_BUCKET="${GCS_PROFILE_BUCKET:?}"
GCS_PREFIX="${GCS_PROFILE_PREFIX:-hermes}"
gsutil -m rsync -r "gs://${GCS_BUCKET}/${GCS_PREFIX}/" "${HERMES_HOME}/"
SYNC
chmod +x "$HOME/sync-hermes-profiles.sh"

# Poll GCS every 2 minutes (AgntPymt writes profiles on provision)
(crontab -l 2>/dev/null | grep -v sync-hermes-profiles; echo "*/2 * * * * $HOME/sync-hermes-profiles.sh >> /var/log/hermes-sync.log 2>&1") | crontab -

echo "==> Hermes .env…"
if [[ ! -f "$HERMES_HOME/.env" ]]; then
  cat >"$HERMES_HOME/.env" <<ENV
API_SERVER_ENABLED=true
API_SERVER_KEY=${HERMES_API_KEY:-change-me}
ENV
fi

echo "==> systemd unit (sudo tee)…"
sudo tee /etc/systemd/system/hermes-gateway.service >/dev/null <<UNIT
[Unit]
Description=Hermes gateway
After=network.target

[Service]
Type=simple
User=$USER
Environment=HERMES_HOME=$HERMES_HOME
EnvironmentFile=-/etc/agntpymt/hermes.env
WorkingDirectory=$HOME
ExecStartPre=$HOME/sync-hermes-profiles.sh
ExecStart=$HOME/.venv/hermes/bin/python -m hermes_cli.main gateway run --replace
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable hermes-gateway
sudo systemctl restart hermes-gateway

echo "Hermes gateway running on :8642 (bind via firewall / internal LB)"
echo "Point Cloud Run HERMES_API_URL to this VM's internal IP: http://10.x.x.x:8642"
