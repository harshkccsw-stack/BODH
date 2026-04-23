# Deployment

Production runs on DigitalOcean:

- **API** → one Droplet running Docker Compose
  (Caddy + API + Postgres + Redis + MinIO), TLS via Caddy
- **Web** → DigitalOcean App Platform static site, auto-deployed on push to `master`

CI/CD lives in `.github/workflows/`.

---

## One-time setup

### A. Droplet (API)

1. **Create the droplet** — Ubuntu 22.04 LTS, any size, add your workstation SSH key.

2. **Bootstrap** — SSH in as root and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/<OWNER>/<REPO>/master/bodhassess-api/scripts/bootstrap-droplet.sh | sudo bash
   ```
   This installs Docker + docker-compose-plugin, creates a `deploy` user, opens
   ports 22/80/443, and creates `/opt/bodhassess`.

3. **Add the CI deploy key** — generate a dedicated keypair on your laptop
   (`ssh-keygen -t ed25519 -f ci_deploy -N ""`), then on the droplet:
   ```bash
   sudo -u deploy mkdir -p /home/deploy/.ssh
   sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys < ci_deploy.pub
   sudo chmod 600 /home/deploy/.ssh/authorized_keys
   ```
   The private half goes into GitHub secret `DROPLET_SSH_KEY` (below).

4. **Create the prod `.env`** at `/opt/bodhassess/.env` (owned by `deploy`):
   ```env
   DOCR_IMAGE=registry.digitalocean.com/<REGISTRY_NAME>/bodhassess-api:latest
   API_DOMAIN=api.example.com
   CORS_ORIGINS=https://app.example.com
   UPLOAD_PUBLIC_URL=https://api.example.com
   DB_USER=bodh
   DB_PASSWORD=<generate-strong>
   DB_NAME=bodhassess
   JWT_SECRET=<generate-strong>
   MINIO_ROOT_USER=bodhminio
   MINIO_ROOT_PASSWORD=<generate-strong>
   ```
   Use `openssl rand -hex 32` for each secret.

5. **Point DNS** — `A` record for `api.example.com` → droplet IPv4. Caddy
   will request a Let's Encrypt cert automatically on first request.

### B. DigitalOcean Container Registry

Create one (`doctl registry create <name>`) and note the registry name — it
goes into the `DOCR_REGISTRY` GitHub secret.

### C. App Platform (web)

1. Edit `bodhassess-app/.do/app.yaml`: replace `<GITHUB_OWNER>/<REPO>` and
   `<API_DOMAIN>` with real values.
2. Create the app once:
   ```bash
   doctl apps create --spec bodhassess-app/.do/app.yaml
   ```
3. After the first deploy, App Platform auto-rebuilds on every push to `master`
   that touches `bodhassess-app/`. No GitHub Actions workflow needed for web.
4. Point DNS — `CNAME app.example.com` → the App Platform host shown in the
   DO console (`<app>.ondigitalocean.app`).

---

## Required GitHub secrets

Settings → Secrets and variables → Actions:

| Secret | What |
|---|---|
| `DO_API_TOKEN` | DigitalOcean personal access token with `read` + `write` scope for the registry |
| `DOCR_REGISTRY` | The registry name you created (just the name, not the full URL) |
| `DROPLET_HOST` | Public IP or FQDN of the droplet |
| `DROPLET_USER` | `deploy` |
| `DROPLET_SSH_KEY` | Private key whose public half is in `deploy`'s `authorized_keys` |
| `API_DOMAIN` | e.g. `api.example.com` — used for the smoke-test health probe |

---

## What happens on each push to master

### `bodhassess-api/**` changed

`.github/workflows/deploy-api.yml` runs:
1. Build multi-stage Go Docker image with Buildx + GHA cache
2. Push `:<sha>` and `:latest` tags to DOCR
3. rsync `docker-compose.prod.yml`, `Caddyfile`, `migrate.sh`, `migrations/`
   to `/opt/bodhassess` on the droplet
4. SSH in, pin the image SHA into `.env`'s `DOCR_IMAGE`, `docker compose pull`
   + `up -d`, wait for Postgres, run `migrate.sh`
5. `curl https://<API_DOMAIN>/api/v1/health` — fail the deploy if unhealthy

### `bodhassess-app/**` changed

App Platform picks it up directly from GitHub (no workflow involved). Build
command from the spec: `npm ci && npm run build`, serves `dist/` through the
DO CDN with SPA fallback to `index.html`.

---

## Operational notes

- **Migrations**: `scripts/migrate.sh` uses a `schema_migrations` table. On a
  fresh DB it applies every file in order; on a pre-existing DB (e.g. the
  one you're promoting today with 14 already hand-applied), the first run
  baselines by inserting all current filenames as "applied" without
  re-running them.
- **Rollback API**: `ssh deploy@droplet 'sed -i "s|^DOCR_IMAGE=.*|DOCR_IMAGE=<older-sha>|" /opt/bodhassess/.env && cd /opt/bodhassess && docker compose -f docker-compose.prod.yml up -d api'`
- **Rollback web**: revert the commit on `master` — App Platform rebuilds from
  the new HEAD. Or use the App Platform console to redeploy a past build.
- **Logs**: `ssh deploy@droplet 'cd /opt/bodhassess && docker compose -f docker-compose.prod.yml logs -f api'`
- **Backups**: not configured. Add a cron job on the droplet that
  `docker compose exec -T postgres pg_dump` to a DO Space, or move to DO
  Managed Postgres when you can.
- **CORS**: prod reads `CORS_ORIGINS` from `.env`. Comma-separated list. Dev
  falls back to `http://localhost:3000, http://localhost:3001` when unset.
