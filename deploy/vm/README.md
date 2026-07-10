# Deploy AgntPymt on a VM (manual)

Run the app on a GCE VM (or any Linux host) with Docker. **No CI** — you deploy by SSHing in and running the script.

## One-time setup on the VM

```bash
# Docker
sudo apt-get update
sudo apt-get install -y docker.io git
sudo usermod -aG docker $USER
# log out and back in so docker works without sudo

# App directory
sudo mkdir -p /opt/agntpymt
sudo chown $USER:$USER /opt/agntpymt
git clone https://github.com/SumitShinde0702/AgntPymt.git /opt/agntpymt

# Production env (stays on the VM only — never commit)
cp /opt/agntpymt/.env.example /opt/agntpymt/.env
nano /opt/agntpymt/.env   # set DATABASE_URL, Clerk, keys, etc.

# First deploy
cd /opt/agntpymt   # or ~/AgntPymt
bash deploy/vm/deploy.sh
```

`deploy.sh` puts the app on Docker network `agntpymt-net` and does **not** bind host ports 80/443 (those belong to Caddy for HTTPS). It does publish `127.0.0.1:8080` so Hermes on the host can call MCP.

### Hermes gateway (same VM)

Hermes is the agent runtime. Without it, the console falls back to local simulation.

```bash
# On the VM — use the same HERMES_API_KEY as in ~/AgntPymt/.env
export HERMES_API_KEY='your-shared-secret'
export OPENAI_API_KEY='sk-...'   # or DEEPSEEK_API_KEY
export AGNTPYMT_API_URL='http://127.0.0.1:8080'

cd ~/AgntPymt
bash deploy/vm/setup-hermes.sh
```

Then in `~/AgntPymt/.env`:

```bash
HERMES_API_URL=http://host.docker.internal:8642
HERMES_API_KEY=your-shared-secret
```

Redeploy the app so it picks up the env:

```bash
bash deploy/vm/deploy.sh
```

Check:

```bash
curl -s http://127.0.0.1:8642/health
docker exec agntpymt wget -qO- http://host.docker.internal:8642/health
```

Health in the UI should show Hermes online (not “Local mode”).

### HTTPS with Caddy (Docker, no sudo)

```bash
docker network create agntpymt-net 2>/dev/null || true

# App is started by deploy.sh on agntpymt-net (port 8080 inside network only)

cat > ~/Caddyfile <<'EOF'
demo.agntpymt.com {
  reverse_proxy agntpymt:8080
}
EOF

docker run -d \
  --name caddy \
  --restart unless-stopped \
  --network agntpymt-net \
  -p 80:80 \
  -p 443:443 \
  -v ~/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  -v caddy_config:/config \
  caddy:2
```

Open GCP firewall for `tcp:80` and `tcp:443`. Point DNS to the VM.

If the GitHub repo is **private**, add a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) on the VM so `git pull` works.

## Deploy updates

SSH into the VM, pull, and rebuild (or push to `main` for GitHub Actions):

```bash
cd ~/AgntPymt
git pull
bash deploy/vm/deploy.sh
```

Logs: `docker logs -f agntpymt`  
Site: `https://demo.agntpymt.com`

## Optional: GCP infra

Cloud SQL, GCS profiles, and Hermes VM setup: [`deploy/gcp/README.md`](../gcp/README.md). The app itself still runs on this VM via `deploy/vm/deploy.sh`.
