#!/usr/bin/env bash
# host-do.sh — provision a Digital Ocean Ubuntu droplet to host bodhassess-api
# as a Docker Compose stack (postgres + api + nginx + certbot).
#
# Run this ON THE DROPLET (Ubuntu 22.04 / 24.04), as root or with sudo.
#
# Quick start (from your Mac):
#   scp -r bodhassess-api deploy host-do.sh root@<droplet-ip>:/root/
#   ssh root@<droplet-ip>
#   cd /root && DOMAIN=api.bodh.biz EMAIL=you@example.com ./host-do.sh
#
# Configurable via env vars (all optional except as noted):
#   DOMAIN          domain pointing at this droplet (default api.bodh.biz)
#   EMAIL           email for Let's Encrypt        (default mittalkanni@gmail.com)
#   APP_ENV         APP_ENV value passed to API     (default production)
#   DB_NAME         postgres database               (default bodhassess)
#   DB_USER         postgres role                   (default bodh)
#   DB_PASSWORD     postgres password               (default: random, persisted in .env)
#   JWT_SECRET      JWT signing secret              (default: random, persisted in .env)
#   APP_DIR         install dir on droplet          (default /opt/bodh)
#   SOURCE_DIR      dir containing bodhassess-api/ + deploy/  (default $(pwd))
#   SKIP_TLS=1      skip certbot even if DOMAIN is set (HTTP only)
#   STAGING_TLS=1   use Let's Encrypt staging (test certs, no rate limits)

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
EMAIL="${EMAIL:-mittalkanni@gmail.com}"
APP_ENV="${APP_ENV:-production}"
DB_NAME="${DB_NAME:-bodhassess}"
DB_USER="${DB_USER:-bodh}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48 | tr -d '=+/' | cut -c1-48)}"
APP_DIR="${APP_DIR:-/opt/bodh}"
SOURCE_DIR="${SOURCE_DIR:-$(pwd)}"
SKIP_TLS="${SKIP_TLS:-0}"
STAGING_TLS="${STAGING_TLS:-0}"

[ -d "$SOURCE_DIR/bodhassess-api/cmd/server" ] || die "expected $SOURCE_DIR/bodhassess-api/cmd/server"
[ -f "$SOURCE_DIR/deploy/docker-compose.yml" ]  || die "expected $SOURCE_DIR/deploy/docker-compose.yml"
[ -d "$SOURCE_DIR/bodhassess-api/migrations" ]   || die "expected $SOURCE_DIR/bodhassess-api/migrations"
if [ -n "$DOMAIN" ] && [ "$SKIP_TLS" != "1" ] && [ -z "$EMAIL" ]; then
  die "EMAIL is required when DOMAIN is set. Pass SKIP_TLS=1 to skip TLS."
fi

echo
printf "  ${B}Domain:${N}    ${DOMAIN:-<none>}\n"
printf "  ${B}TLS:${N}       $([ "$SKIP_TLS" = "1" ] && echo "off (HTTP only)" || echo "Let's Encrypt$([ "$STAGING_TLS" = "1" ] && echo " (staging)")")\n"
printf "  ${B}App dir:${N}   $APP_DIR\n"
printf "  ${B}DB:${N}        $DB_NAME (user=$DB_USER)\n"
printf "  ${B}Source:${N}    $SOURCE_DIR\n"
echo

# ── packages: docker + plugin ─────────────────────────────────────────────
info "Installing Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl gettext-base ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker installed"
else
  apt-get install -y --no-install-recommends docker-compose-plugin || true
  ok "Docker already present"
fi

# ── stage source under $APP_DIR ───────────────────────────────────────────
info "Staging source under $APP_DIR"
mkdir -p "$APP_DIR"
# copy with --delete so re-runs pick up code changes; keep volumes intact
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude='/bodhassess-api/uploads' \
    --exclude='/bodhassess-api/server' \
    --exclude='/bodhassess-api/.run-logs' \
    "$SOURCE_DIR/bodhassess-api" "$SOURCE_DIR/deploy" "$APP_DIR/"
else
  cp -a "$SOURCE_DIR/bodhassess-api" "$APP_DIR/"
  cp -a "$SOURCE_DIR/deploy"          "$APP_DIR/"
fi
ok "Source staged"

# ── write .env ────────────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/deploy/.env"
info "Writing $ENV_FILE"
umask 077
cat > "$ENV_FILE" <<EOF
APP_ENV=$APP_ENV
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
JWT_SECRET=$JWT_SECRET
DOMAIN=$DOMAIN
EOF
chmod 600 "$ENV_FILE"
umask 022

# ── render initial nginx config (HTTP-only, with ACME location) ──────────
NGINX_CONF_DIR="$APP_DIR/deploy/nginx/conf.d"
mkdir -p "$NGINX_CONF_DIR"
info "Rendering nginx HTTP config for $DOMAIN"
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' \
  < "$APP_DIR/deploy/nginx/app.conf.http.tpl" \
  > "$NGINX_CONF_DIR/app.conf"
ok "Wrote $NGINX_CONF_DIR/app.conf"

# ── bring up the stack ────────────────────────────────────────────────────
cd "$APP_DIR/deploy"
info "Building images and starting stack"
docker compose pull --ignore-buildable 2>/dev/null || true
docker compose build api
docker compose up -d postgres api nginx
ok "Stack up"

# ── wait for API health ───────────────────────────────────────────────────
info "Waiting for API health (via nginx :80)"
HEALTHY=0
for _ in $(seq 1 40); do
  if curl -fsS -H "Host: $DOMAIN" http://127.0.0.1/api/v1/health >/dev/null 2>&1; then
    HEALTHY=1; break
  fi
  sleep 2
done
[ "$HEALTHY" = "1" ] && ok "API healthy on :80" || warn "API not yet healthy — check 'docker compose logs api'"

# ── TLS: acquire cert, then swap nginx config ─────────────────────────────
if [ -n "$DOMAIN" ] && [ "$SKIP_TLS" != "1" ]; then
  info "Acquiring Let's Encrypt cert for $DOMAIN"
  CERTBOT_FLAGS=(certonly --webroot -w /var/www/certbot
                 --non-interactive --agree-tos -m "$EMAIL"
                 -d "$DOMAIN" --keep-until-expiring)
  [ "$STAGING_TLS" = "1" ] && CERTBOT_FLAGS+=(--staging)

  if docker compose run --rm certbot "${CERTBOT_FLAGS[@]}"; then
    ok "Cert issued"
    info "Swapping nginx to HTTPS config"
    DOMAIN="$DOMAIN" envsubst '${DOMAIN}' \
      < "$APP_DIR/deploy/nginx/app.conf.https.tpl" \
      > "$NGINX_CONF_DIR/app.conf"
    docker compose exec nginx nginx -t
    docker compose exec nginx nginx -s reload
    docker compose up -d certbot     # start renewal loop
    ok "HTTPS live"
  else
    warn "certbot failed — staying on HTTP. Common causes:"
    warn "  • DNS A record for $DOMAIN doesn't point to this droplet yet"
    warn "  • Port 80 not reachable from the internet (check ufw / cloud firewall)"
    warn "Re-run this script after DNS propagates."
  fi
fi

# ── firewall ──────────────────────────────────────────────────────────────
info "Configuring ufw"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "Firewall active"

# ── summary ───────────────────────────────────────────────────────────────
echo
ok "bodhassess-api stack is up"
echo
if [ -n "$DOMAIN" ] && [ "$SKIP_TLS" != "1" ] && [ -f "/var/lib/docker/volumes/bodhassess_certbot_etc/_data/live/$DOMAIN/fullchain.pem" ]; then
  printf "  ${B}URL:${N}     https://$DOMAIN/api/v1/health\n"
elif [ -n "$DOMAIN" ]; then
  printf "  ${B}URL:${N}     http://$DOMAIN/api/v1/health\n"
else
  printf "  ${B}URL:${N}     http://<droplet-ip>/api/v1/health\n"
fi
printf "  ${B}Compose:${N} cd $APP_DIR/deploy && docker compose <cmd>\n"
printf "  ${B}Logs:${N}    docker compose logs -f api\n"
printf "  ${B}Restart:${N} docker compose restart api\n"
printf "  ${B}Env:${N}     $ENV_FILE  (chmod 600)\n"
echo
printf "  ${YEL}DB credentials (also in $ENV_FILE):${N}\n"
printf "    DB_USER=$DB_USER\n"
printf "    DB_PASSWORD=$DB_PASSWORD\n"
echo
