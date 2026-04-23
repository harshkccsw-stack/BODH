#!/usr/bin/env bash
# One-time droplet setup. Run as root on a fresh Ubuntu 22.04+ droplet:
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/master/bodhassess-api/scripts/bootstrap-droplet.sh | sudo bash
# or upload and: sudo bash bootstrap-droplet.sh

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/bodhassess}"

if [ "$(id -u)" -ne 0 ]; then
  echo "must run as root" >&2; exit 1
fi

echo "==> System update"
apt-get update -y
apt-get install -y ca-certificates curl gnupg ufw jq

echo "==> Installing Docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Creating deploy user"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

echo "==> Preparing app directory"
mkdir -p "$APP_DIR" "$APP_DIR/migrations"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo "==> Firewall (22, 80, 443 only)"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Done. Next steps:"
echo "    1. add your CI public key to /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "    2. upload docker-compose.prod.yml, Caddyfile, migrations/ and .env to $APP_DIR"
echo "    3. cd $APP_DIR && docker login registry.digitalocean.com (or rely on CI doing it)"
