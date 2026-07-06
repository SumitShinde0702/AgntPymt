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
cd /opt/agntpymt
bash deploy/vm/deploy.sh
```

Open firewall for port `8080` (or put nginx/Caddy in front on 80/443).

If the GitHub repo is **private**, add a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) on the VM so `git pull` works.

## Deploy updates

SSH into the VM, pull, and rebuild:

```bash
cd /opt/agntpymt
git pull
bash deploy/vm/deploy.sh
```

Logs: `docker logs -f agntpymt`

## Optional: GCP infra

Cloud SQL, GCS profiles, and Hermes VM setup: [`deploy/gcp/README.md`](../gcp/README.md). The app itself still runs on this VM via `deploy/vm/deploy.sh`.
