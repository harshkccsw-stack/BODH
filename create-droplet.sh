#!/usr/bin/env bash
# create-droplet.sh — provision a DigitalOcean droplet for bodhassess-api.
#
# Run from your Mac (not on the droplet). Requires `doctl` already authenticated
# (`doctl auth init` if not). Creates an Ubuntu 24.04 droplet with both your
# SSH keys attached, waits for it to come up, and prints the IP.
#
# Override defaults via env vars:
#   NAME       droplet name              (default bodhassess-api)
#   REGION     region slug               (default blr1)
#   SIZE       size slug                 (default s-1vcpu-2gb — $12/mo)
#   IMAGE      image slug                (default ubuntu-24-04-x64)
#   SSH_KEYS   comma-separated key IDs   (default 55853519,55848557 — both your keys)

set -euo pipefail

NAME="${NAME:-bodhassess-api}"
REGION="${REGION:-blr1}"
SIZE="${SIZE:-s-1vcpu-2gb}"
IMAGE="${IMAGE:-ubuntu-24-04-x64}"
SSH_KEYS="${SSH_KEYS:-55853519,55848557}"

if [ -t 1 ]; then
  CYAN='\033[36m'; GRN='\033[32m'; YEL='\033[33m'; N='\033[0m'
else
  CYAN=''; GRN=''; YEL=''; N=''
fi
info() { printf "${CYAN}==>${N} %s\n" "$*"; }
ok()   { printf "${GRN}✓${N} %s\n" "$*"; }
warn() { printf "${YEL}!${N} %s\n" "$*"; }

command -v doctl >/dev/null || { echo "doctl not installed"; exit 1; }
doctl account get >/dev/null 2>&1 || { echo "doctl not authenticated — run: doctl auth init"; exit 1; }

info "Creating droplet '$NAME' ($SIZE in $REGION, $IMAGE)"
doctl compute droplet create "$NAME" \
  --region "$REGION" \
  --size "$SIZE" \
  --image "$IMAGE" \
  --ssh-keys "$SSH_KEYS" \
  --enable-monitoring \
  --wait \
  --format ID,Name,PublicIPv4,Status,Region

IP=$(doctl compute droplet list --format Name,PublicIPv4 --no-header \
     | awk -v n="$NAME" '$1==n {print $2; exit}')
[ -n "$IP" ] || { echo "could not find droplet IP"; exit 1; }

ok "Droplet ready at $IP"
echo
info "Waiting for SSH to accept connections"
for i in $(seq 1 30); do
  if ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 \
         -o BatchMode=yes "root@$IP" 'true' 2>/dev/null; then
    ok "SSH up"
    break
  fi
  sleep 4
  [ "$i" = 30 ] && warn "SSH not responding yet — may need another minute"
done

echo
echo "Next steps:"
echo "  scp -r bodhassess-api host-do.sh root@$IP:/root/"
echo "  ssh root@$IP"
echo "  ./host-do.sh                                   # no domain, reach by IP"
echo "  # or, with a domain whose A record points to $IP:"
echo "  # DOMAIN=api.example.com EMAIL=you@example.com ./host-do.sh"
