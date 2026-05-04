#!/usr/bin/env bash
# setup-droplet-deploy-key.sh — one-time setup so the droplet can pull
# from GitHub via SSH (instead of HTTPS, which needs a username prompt).
#
# Usage:
#   ./setup-droplet-deploy-key.sh
#
# After this runs, paste the printed public key into:
#   https://github.com/harshkccsw-stack/BODH/settings/keys → Add deploy key
# Then the deploy script (./deploy-api.sh) will work.

set -euo pipefail

REMOTE_HOST="root@168.144.118.157"
APP_DIR="/root/bodhassess-api"
GITHUB_REPO="git@github.com:harshkccsw-stack/BODH.git"

if [ -t 1 ]; then
  B='\033[1m'; CYAN='\033[36m'; GRN='\033[32m'; YEL='\033[33m'; N='\033[0m'
else
  B=''; CYAN=''; GRN=''; YEL=''; N=''
fi

echo
printf "${CYAN}==>${N} Setting up deploy key on %s\n" "$REMOTE_HOST"
echo

ssh -o BatchMode=yes "$REMOTE_HOST" \
  APP_DIR="$APP_DIR" GITHUB_REPO="$GITHUB_REPO" \
  bash -s <<'REMOTE'
set -euo pipefail
: "${APP_DIR:?}"; : "${GITHUB_REPO:?}"

KEY=~/.ssh/github_deploy
mkdir -p ~/.ssh && chmod 700 ~/.ssh

# 1. Generate the key (only if it doesn't exist — re-runs are safe)
if [ ! -f "$KEY" ]; then
  echo "==> Generating ed25519 deploy key at $KEY"
  ssh-keygen -t ed25519 -f "$KEY" -N "" -C "deploy@bodh-droplet" >/dev/null
else
  echo "==> Reusing existing deploy key at $KEY"
fi

# 2. SSH config so git uses this key for github.com
if ! grep -q "Host github.com" ~/.ssh/config 2>/dev/null; then
  echo "==> Adding github.com block to ~/.ssh/config"
  cat >> ~/.ssh/config <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
  chmod 600 ~/.ssh/config
else
  echo "==> ~/.ssh/config already has a github.com block (leaving it alone)"
fi

# 3. Trust github.com's host key (so the first fetch doesn't prompt)
if ! grep -q "github.com" ~/.ssh/known_hosts 2>/dev/null; then
  echo "==> Adding github.com to known_hosts"
  ssh-keyscan -t ed25519,rsa github.com >> ~/.ssh/known_hosts 2>/dev/null
fi

# 4. Switch the repo's remote from HTTPS to SSH
if [ -d "$APP_DIR/.git" ]; then
  CUR_URL=$(git -C "$APP_DIR" remote get-url origin 2>/dev/null || echo "")
  if [ "$CUR_URL" != "$GITHUB_REPO" ]; then
    echo "==> Switching $APP_DIR remote: $CUR_URL → $GITHUB_REPO"
    git -C "$APP_DIR" remote set-url origin "$GITHUB_REPO"
  else
    echo "==> $APP_DIR remote already set to $GITHUB_REPO"
  fi
fi

# 5. Print the public key for the user to paste into GitHub
echo
echo "================================================================"
echo "PUBLIC KEY — copy this whole line into GitHub:"
echo "================================================================"
cat "$KEY.pub"
echo "================================================================"
REMOTE

echo
printf "${B}Next steps:${N}\n"
printf "  1. Open ${CYAN}https://github.com/harshkccsw-stack/BODH/settings/keys${N}\n"
printf "  2. Click ${B}\"Add deploy key\"${N}\n"
printf "     • Title: ${B}bodh-droplet${N}\n"
printf "     • Key:   ${B}paste the public key shown above${N}\n"
printf "     • Allow write access: ${YEL}leave unchecked${N} (deploys only need to read)\n"
printf "  3. Click ${B}Add key${N}\n"
printf "  4. Then run: ${B}bash deploy-api.sh${N}\n"
echo
