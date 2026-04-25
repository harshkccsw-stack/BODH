#!/usr/bin/env bash
# host-do.sh — provision a Digital Ocean Ubuntu droplet to host bodhassess-api.
#
# Run this ON THE DROPLET (Ubuntu 22.04 / 24.04), as root or with sudo.
#
# Quick start:
#   scp -r bodhassess-api host-do.sh root@<droplet-ip>:/root/
#   ssh root@<droplet-ip>
#   cd /root && DOMAIN=api.example.com EMAIL=you@example.com ./host-do.sh
#
# Configurable via env vars (all optional except where noted):
#   DOMAIN          domain pointing at this droplet (enables nginx + TLS)
#   EMAIL           email for Let's Encrypt (required if DOMAIN is set)
#   APP_PORT        local port the API binds to            (default 8080)
#   APP_ENV         APP_ENV value passed to the API        (default production)
#   DB_NAME         postgres database                       (default bodhassess)
#   DB_USER         postgres role                           (default bodh)
#   DB_PASSWORD     postgres password                       (default: random)
#   JWT_SECRET      JWT signing secret                      (default: random)
#   APP_USER        unix user that runs the API             (default bodh)
#   APP_DIR         install dir for the binary + uploads    (default /opt/bodh)
#   SOURCE_DIR      path to the bodhassess-api source       (default ./bodhassess-api)
#   GO_VERSION      Go toolchain version                    (default 1.23.4)
#   SKIP_TLS=1      skip certbot even if DOMAIN is set
#   SKIP_NGINX=1    skip nginx (API will be reachable on $APP_PORT directly)

set -euo pipefail

# ── colors ────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B='\033[1m'; CYAN='\033[36m'; YEL='\033[33m'; RED='\033[31m'; GRN='\033[32m'; N='\033[0m'
else
  B=''; CYAN=''; YEL=''; RED=''; GRN=''; N=''
fi
info() { printf "${CYAN}==>${N} %s\n" "$*"; }
ok()   { printf "${GRN}✓${N} %s\n" "$*"; }
warn() { printf "${YEL}!${N} %s\n" "$*"; }
die()  { printf "${RED}✗${N} %s\n" "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root (or with sudo)"
. /etc/os-release 2>/dev/null || true
[ "${ID:-}" = "ubuntu" ] || warn "this script is tuned for Ubuntu — found ID=${ID:-unknown}"

# ── config ────────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-api.bodh.biz}"
EMAIL="${EMAIL:mittalkanni@gmail.com}"
APP_PORT="${APP_PORT:-8080}"
APP_ENV="${APP_ENV:-production}"
DB_NAME="${DB_NAME:-bodhassess}"
DB_USER="${DB_USER:-bodh}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '=+/' | cut -c1-48)}"
APP_USER="${APP_USER:-bodh}"
APP_DIR="${APP_DIR:-/opt/bodh}"
SOURCE_DIR="${SOURCE_DIR:-$(pwd)/bodhassess-api}"
GO_VERSION="${GO_VERSION:-1.23.4}"
SKIP_TLS="${SKIP_TLS:-0}"
SKIP_NGINX="${SKIP_NGINX:-0}"

[ -d "$SOURCE_DIR" ] || die "SOURCE_DIR not found: $SOURCE_DIR"
[ -d "$SOURCE_DIR/cmd/server" ] || die "expected $SOURCE_DIR/cmd/server (is this the bodhassess-api source?)"
if [ -n "$DOMAIN" ] && [ "$SKIP_TLS" != "1" ] && [ -z "$EMAIL" ]; then
  die "EMAIL is required when DOMAIN is set (used for Let's Encrypt). Pass SKIP_TLS=1 to skip."
fi

echo
printf "  ${B}Domain:${N}        ${DOMAIN:-<none — API will be reachable by IP>}\n"
printf "  ${B}App port:${N}      $APP_PORT\n"
printf "  ${B}App user:${N}      $APP_USER\n"
printf "  ${B}App dir:${N}       $APP_DIR\n"
printf "  ${B}DB:${N}            $DB_NAME (user=$DB_USER)\n"
printf "  ${B}Source:${N}        $SOURCE_DIR\n"
printf "  ${B}Go:${N}            $GO_VERSION\n"
echo

# ── packages ──────────────────────────────────────────────────────────────
info "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl wget git ufw \
  postgresql postgresql-contrib \
  nginx
ok "Base packages installed"

# ── Go ────────────────────────────────────────────────────────────────────
GO_BIN=/usr/local/go/bin/go
INSTALLED_GO_VERSION=""
[ -x "$GO_BIN" ] && INSTALLED_GO_VERSION="$($GO_BIN version 2>/dev/null | awk '{print $3}' | sed 's/^go//')"
if [ "$INSTALLED_GO_VERSION" != "$GO_VERSION" ]; then
  info "Installing Go $GO_VERSION"
  ARCH="$(dpkg --print-architecture)"
  case "$ARCH" in
    amd64) GO_ARCH=amd64 ;;
    arm64) GO_ARCH=arm64 ;;
    *) die "unsupported arch: $ARCH" ;;
  esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o "$TMP/go.tgz"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf "$TMP/go.tgz"
  rm -rf "$TMP"
  ok "Go $GO_VERSION installed at /usr/local/go"
else
  ok "Go $GO_VERSION already installed"
fi

# ── app user + dirs ───────────────────────────────────────────────────────
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  info "Creating system user $APP_USER"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR/bin" "$APP_DIR/uploads"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── Postgres ──────────────────────────────────────────────────────────────
info "Configuring Postgres role + database"
systemctl enable --now postgresql
PG_USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" || true)
if [ "$PG_USER_EXISTS" != "1" ]; then
  sudo -u postgres psql -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASSWORD';"
  ok "Created role $DB_USER"
else
  sudo -u postgres psql -c "ALTER ROLE \"$DB_USER\" WITH LOGIN PASSWORD '$DB_PASSWORD';"
  ok "Updated password for existing role $DB_USER"
fi
PG_DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" || true)
if [ "$PG_DB_EXISTS" != "1" ]; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  ok "Created database $DB_NAME"
else
  ok "Database $DB_NAME already exists"
fi

# Apply migrations in order. Each file is run inside a transaction; if a file
# was already applied, re-running will likely fail — we tolerate that and move on.
info "Applying migrations from $SOURCE_DIR/migrations"
shopt -s nullglob
for mig in "$SOURCE_DIR"/migrations/*.sql; do
  name="$(basename "$mig")"
  if sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$mig" >/dev/null 2>&1; then
    ok "applied $name"
  else
    warn "skipped $name (already applied or failed — check manually if first install)"
  fi
done
shopt -u nullglob

# ── build API ─────────────────────────────────────────────────────────────
info "Building API binary"
TMP_BIN="$(mktemp)"
( cd "$SOURCE_DIR" && \
  CGO_ENABLED=0 GOFLAGS=-trimpath \
  "$GO_BIN" build -ldflags='-s -w' -o "$TMP_BIN" ./cmd/server )
install -o "$APP_USER" -g "$APP_USER" -m 0755 "$TMP_BIN" "$APP_DIR/bin/server"
rm -f "$TMP_BIN"
ok "Installed binary at $APP_DIR/bin/server"

# ── env file ──────────────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/bodh-api.env"
info "Writing $ENV_FILE"
umask 077
cat > "$ENV_FILE" <<EOF
APP_ENV=$APP_ENV
APP_PORT=$APP_PORT
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_SSLMODE=disable
JWT_SECRET=$JWT_SECRET
EOF
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
umask 022

# ── systemd service ───────────────────────────────────────────────────────
info "Installing systemd unit"
cat > /etc/systemd/system/bodh-api.service <<EOF
[Unit]
Description=BodhAssess API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$APP_DIR/bin/server
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/uploads
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable bodh-api
systemctl restart bodh-api
sleep 2
if systemctl is-active --quiet bodh-api; then
  ok "bodh-api running"
else
  systemctl --no-pager status bodh-api || true
  die "bodh-api failed to start — see 'journalctl -u bodh-api'"
fi

# ── nginx ─────────────────────────────────────────────────────────────────
if [ "$SKIP_NGINX" = "1" ]; then
  warn "Skipping nginx (SKIP_NGINX=1) — API on :$APP_PORT"
else
  SERVER_NAME="${DOMAIN:-_}"
  info "Configuring nginx for $SERVER_NAME"
  cat > /etc/nginx/sites-available/bodh-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
  ln -sf /etc/nginx/sites-available/bodh-api /etc/nginx/sites-enabled/bodh-api
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
  ok "nginx reverse-proxy live"

  # ── TLS via certbot ────────────────────────────────────────────────────
  if [ -n "$DOMAIN" ] && [ "$SKIP_TLS" != "1" ]; then
    info "Issuing Let's Encrypt cert for $DOMAIN"
    apt-get install -y --no-install-recommends certbot python3-certbot-nginx
    if certbot --nginx --non-interactive --agree-tos --redirect \
        -d "$DOMAIN" -m "$EMAIL"; then
      ok "TLS configured for https://$DOMAIN"
    else
      warn "certbot failed — check that $DOMAIN's A record points to this droplet"
    fi
  fi
fi

# ── firewall ──────────────────────────────────────────────────────────────
info "Configuring ufw"
ufw allow OpenSSH >/dev/null
if [ "$SKIP_NGINX" = "1" ]; then
  ufw allow "$APP_PORT"/tcp >/dev/null
else
  ufw allow 'Nginx Full' >/dev/null
fi
ufw --force enable >/dev/null
ok "Firewall active"

# ── summary ───────────────────────────────────────────────────────────────
echo
ok "bodhassess-api is up"
echo
if [ -n "$DOMAIN" ] && [ "$SKIP_NGINX" != "1" ]; then
  if [ "$SKIP_TLS" != "1" ]; then
    printf "  ${B}URL:${N}     https://$DOMAIN/api/v1/health\n"
  else
    printf "  ${B}URL:${N}     http://$DOMAIN/api/v1/health\n"
  fi
elif [ "$SKIP_NGINX" = "1" ]; then
  printf "  ${B}URL:${N}     http://<droplet-ip>:$APP_PORT/api/v1/health\n"
else
  printf "  ${B}URL:${N}     http://<droplet-ip>/api/v1/health\n"
fi
printf "  ${B}Env:${N}     $ENV_FILE\n"
printf "  ${B}Logs:${N}    journalctl -u bodh-api -f\n"
printf "  ${B}Restart:${N} systemctl restart bodh-api\n"
echo
printf "  ${YEL}DB credentials (save these — they are also in $ENV_FILE):${N}\n"
printf "    DB_USER=$DB_USER\n"
printf "    DB_PASSWORD=$DB_PASSWORD\n"
echo
