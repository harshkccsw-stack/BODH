# Deployment — DigitalOcean Droplet + DOCR

CI/CD pipeline for BodhAssess. GitHub Actions builds Docker images, pushes them to
DigitalOcean Container Registry (DOCR), then SSHes into a droplet and rolls out
the new images with Docker Compose. Caddy in front provides automatic HTTPS.

```
GitHub Actions ─▶ DOCR ─▶ Droplet (docker compose pull && up -d)
                              │
                              ├─ Caddy  :80/:443  (TLS, reverse proxy)
                              ├─ app    :3000    (Next.js)
                              ├─ api    :8080    (Go)
                              ├─ postgres
                              ├─ redis
                              └─ minio
```

## 1. One-time DigitalOcean setup

1. **Create a Container Registry** (DOCR) — any tier works; the basic tier is fine to start.
   Note the endpoint, e.g. `registry.digitalocean.com/bodh`.
2. **Create a Personal Access Token** (API → Tokens) with **read + write** scope.
   Save it — you'll paste it into GitHub secrets and onto the droplet.
3. **Create a Droplet** — Ubuntu 24.04, at least 2 GB RAM (4 GB recommended for Postgres + MinIO).
4. **Point DNS** `A` records at the droplet for:
   - `app.<your-domain>`  → the Next.js app
   - `api.<your-domain>`  → the Go API

## 2. One-time droplet bootstrap

SSH into the droplet as a sudo user (not root in production) and run:

```bash
# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
newgrp docker

# App directory
sudo mkdir -p /opt/bodhassess
sudo chown "$USER":"$USER" /opt/bodhassess
cd /opt/bodhassess

# Copy .env.prod.example from the repo and edit it:
#   - DOCR_REGISTRY   (e.g. registry.digitalocean.com/bodh)
#   - DB_*, MINIO_*, JWT_SECRET (real secrets)
#   - APP_DOMAIN, API_DOMAIN, ACME_EMAIL
nano .env.prod
chmod 600 .env.prod

# One-time registry login so `docker compose pull` works locally too.
# Password is the same DO token as the username.
docker login registry.digitalocean.com \
  -u <DIGITALOCEAN_ACCESS_TOKEN> \
  -p <DIGITALOCEAN_ACCESS_TOKEN>
```

The first CD run will copy `docker-compose.prod.yml`, `Caddyfile`, and the Postgres
init SQL into `/opt/bodhassess`. You don't need to clone the repo onto the droplet.

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

## 3. GitHub repository secrets

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret                         | Example / Notes                                      |
| ------------------------------ | ---------------------------------------------------- |
| `DIGITALOCEAN_ACCESS_TOKEN`    | The PAT from step 1.2                                |
| `DOCR_REGISTRY`                | `registry.digitalocean.com/<your-namespace>`         |
| `DROPLET_HOST`                 | Droplet IP or hostname                               |
| `DROPLET_USER`                 | SSH user (the sudo user you created, not root)       |
| `DROPLET_SSH_KEY`              | Private key whose pubkey is in the droplet's `~/.ssh/authorized_keys` |
| `DROPLET_SSH_PORT`             | *(optional, defaults to 22)*                         |
| `APP_DOMAIN`                   | `app.example.com` (used by the post-deploy smoke)    |
| `API_DOMAIN`                   | `api.example.com`                                    |
| `NEXT_PUBLIC_API_URL`          | `https://api.example.com/api/v1` — baked at build    |
| `NEXT_PUBLIC_BASE_PATH`        | *(usually empty; only set if the app is hosted under a sub-path)* |

> `NEXT_PUBLIC_*` values are frozen into the Next.js bundle at build time — changing
> them requires a new CD run, not just a restart.

Create a `production` **GitHub Environment** (Settings → Environments) if you want
a manual approval gate before deploys. The CD job already references it.

## 4. Pipeline overview

- **[.github/workflows/ci.yml](.github/workflows/ci.yml)** — runs on PRs and non-master pushes:
  - Go: `go mod verify`, `go vet`, `go build`, `go test -race`, `docker build` smoke.
  - Node: `npm ci`, `npm run lint`, `npm run build`, `docker build` smoke.
  - A Postgres 16 service container is attached to the Go job for DB-touching tests.
- **[.github/workflows/cd.yml](.github/workflows/cd.yml)** — runs on push to `master`
  (or manual dispatch):
  1. Build & push `bodhassess-api` and `bodhassess-app` to DOCR, tagged with the
     12-char commit SHA plus `:latest`. Registry-side build cache speeds up rebuilds.
  2. `scp` `docker-compose.prod.yml` + `Caddyfile` + `001_init.sql` to
     `/opt/bodhassess` on the droplet.
  3. SSH in, `docker login`, rewrite `IMAGE_TAG` in `.env.prod`, then
     `docker compose pull && up -d --remove-orphans`, and `docker image prune`.
  4. HTTPS smoke test against `https://$API_DOMAIN/api/v1/health`.

## 5. First deploy

1. Commit and push this repo to GitHub on `master`.
2. The CD workflow runs. The first time, the smoke test may fail while Caddy
   provisions TLS certificates (can take 30–90 s). If so, re-run the workflow or
   hit `https://$APP_DOMAIN` in a browser once to trigger it, then re-run.
3. Verify:
   ```bash
   curl https://<api-domain>/api/v1/health
   ```

## 6. Day-to-day

- **Deploy a specific commit:** Actions → CD → *Run workflow*, paste the 12-char SHA
  into `image_tag`.
- **Rollback:** same thing — pass the previous known-good SHA. Images stay in DOCR
  until garbage-collected.
- **View logs on the droplet:**
  ```bash
  cd /opt/bodhassess
  docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
  ```
- **DB backup:**
  ```bash
  docker exec bodh-postgres pg_dump -U $DB_USER $DB_NAME | gzip > backup-$(date +%F).sql.gz
  ```

## 7. Follow-ups (some block first deploy)

### Blocking — must fix before `npm run build` succeeds

I ran a smoke `docker build` for both images while wiring up the pipeline:

- **API image builds clean.**
- **App image fails** because the Next.js production build has pre-existing
  TypeScript errors. Fix these before the first CD run:
  1. [bodhassess-app/tsconfig.json:2](bodhassess-app/tsconfig.json#L2) was `target: "es5"` —
     already bumped to `es2017` here so `[...Set]` iterations compile.
  2. [bodhassess-app/app/(app)/question-bank/create/page.tsx:1316](bodhassess-app/app/(app)/question-bank/create/page.tsx#L1316)
     reads `v.isBuiltIn`, but that property isn't on the `Vertical` type. Either
     add it to the type or remove the reference. Expect a handful more of these
     once it's fixed — the project hasn't been typechecked in a while.

Running `cd bodhassess-app && npm run build` locally is the fastest way to flush
them all out. CI will run the same command on every PR once the pipeline lands.

### Non-blocking — wire up when convenient

1. **CORS** — [bodhassess-api/cmd/server/main.go:31-32](bodhassess-api/cmd/server/main.go#L31-L32)
   hard-codes `http://localhost:3000/3001`. Make `AllowedOrigins` read from env so
   prod accepts `https://$APP_DOMAIN`.
2. **Upload base URL** — [bodhassess-api/cmd/server/main.go:44](bodhassess-api/cmd/server/main.go#L44)
   uses `http://localhost:<port>` as the public base for uploaded files. Read from
   env (e.g. `PUBLIC_UPLOAD_BASE_URL`).
3. **Migrations past 001** — the Postgres image only auto-runs files in
   `/docker-entrypoint-initdb.d` on **first** container start. Once the volume
   exists, migrations 002+ are ignored. Add a lightweight migrator step (e.g.
   `golang-migrate` run from the API container on startup) before schema changes
   after 001 need to ship.
4. **Commit the lockfile** — `package-lock.json` is in [.gitignore](.gitignore). Remove
   it from there and commit the lockfile so CI gets deterministic `npm ci` installs.
5. **Tests** — the API has no `*_test.go` files yet; CI runs `go test` but it's a
   no-op. Add tests; the Postgres service container is already wired up.
