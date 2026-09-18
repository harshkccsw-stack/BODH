#!/usr/bin/env bash
# Shared helpers for deploy/server/*.sh. Sourced, never executed.
# Byte-identical in the MemoryMesh and BodhAssess repos: everything
# project-specific comes from deploy/project.env.

# Repo root is two levels above this file; every script cd's there so
# `docker compose` finds docker-compose.yml and releases/ is repo-relative.
DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=../project.env
. "$DEPLOY_ROOT/deploy/project.env"

RELEASES="$DEPLOY_ROOT/releases"
LOG_FILE="$RELEASES/deploy.log"

log() { mkdir -p "$RELEASES"; printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $1"; exit "${2:-1}"; }

# Serialise every deploy on the droplet. The caller re-executes itself under
# flock with its original arguments; DEPLOY_LOCKED marks the inner run. A
# deploy that is already running is waited for (up to 10 minutes) rather than
# refused, so two pushes in a row simply queue.
acquire_lock() {
  [ -n "${DEPLOY_LOCKED:-}" ] && return 0
  mkdir -p "$RELEASES"
  if ! flock -n "$LOCK_FILE" true 2>/dev/null; then
    echo "another deploy holds $LOCK_FILE — waiting for it (up to 10 min)" >&2
  fi
  DEPLOY_LOCKED=1 exec flock -w 600 "$LOCK_FILE" "$0" "$@"
}

compose() { docker compose --profile "$COMPOSE_PROFILE" "$@"; }

# Verifies <file> against <file>.sha256, the "<hash>  <name>" line both
# sha256sum and macOS `shasum -a 256` write. A missing checksum is a refusal,
# not a warning: nothing unverified is ever activated.
sha_verify() {
  local f="$1" d n
  d="$(dirname "$f")"; n="$(basename "$f")"
  [ -f "$f.sha256" ] || die "$f.sha256 is missing — refusing an unverified artifact"
  (cd "$d" && sha256sum -c --quiet "$n.sha256" >/dev/null 2>&1) || die "checksum mismatch for $f"
}

# releases/<artifact>/current and /previous hold the active and the last
# known-good tag. They only move after a health gate passes.
state_get() { local f="$RELEASES/$1/$2"; if [ -f "$f" ]; then cat "$f"; fi; }
state_set() { mkdir -p "$RELEASES/$1"; printf '%s\n' "$3" > "$RELEASES/$1/$2"; }

# One key out of a release.json (written by push.sh or by adoption).
manifest_get() { # <release-dir> <key>
  if [ -f "$1/release.json" ]; then jq -r ".$2 // empty" "$1/release.json" 2>/dev/null || true; fi
}

# "running 0" / "restarting 3" / "exited 0" / "missing" — status and restart count.
container_state() {
  docker inspect -f '{{.State.Status}} {{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo missing
}

# actuator: /actuator/health says UP (the real check — DB reachable, app wired).
# legacy:   the jar predates actuator; POST {} to login answers 400.
# auto:     a release with no manifest — either counts. Only pushed releases
#           carry an explicit mode; the receiver records whichever mode passed.
probe_once() { # actuator | legacy | auto
  case "$1" in
    actuator) curl -fsS --max-time 3 "$HEALTH_URL" 2>/dev/null | grep -q '"status":"UP"' ;;
    legacy)   [ "$(curl -s -o /dev/null --max-time 3 -w '%{http_code}' -X POST "$LEGACY_PROBE_URL" \
                    -H 'Content-Type: application/json' -d '{}' 2>/dev/null)" = 400 ] ;;
    auto)     probe_once actuator || probe_once legacy ;;
    *) die "unknown probe mode '$1'" ;;
  esac
}

# Records in <release-dir>/release.json the probe mode that actually passed,
# so a later rollback to this release probes it the same way. Creates the
# manifest for a release that arrived without one.
manifest_set_probe() { # <release-dir> <mode>
  local f="$1/release.json" tmp
  tmp="$(mktemp)"
  if [ -f "$f" ]; then jq --arg m "$2" '.healthProbe = $m' "$f" > "$tmp"; else jq -n --arg m "$2" '{healthProbe: $m}' > "$tmp"; fi
  mv "$tmp" "$f"
}

# Polls until the API answers the probe or <timeout> seconds pass. Fails FAST
# when the container dies or starts restart-looping: under
# `restart: unless-stopped` a crashing jar would otherwise sit behind a
# container that is technically "running" between restarts.
wait_healthy() { # <mode> <timeout>
  local mode="$1" timeout="$2" start state
  start=$(date +%s)
  while :; do
    state="$(container_state)"
    case "$state" in
      "running 0")
        if probe_once "$mode"; then
          log "healthy ($mode probe) after $(( $(date +%s) - start ))s"; return 0
        fi ;;
      missing|exited*|dead*|restarting*|"running "[1-9]*)
        log "container is not staying up: $state"; return 1 ;;
    esac
    if [ $(( $(date +%s) - start )) -ge "$timeout" ]; then
      log "health gate timed out after ${timeout}s ($mode probe)"; return 1
    fi
    sleep 3
  done
}

# Markers under <marker-dir>/<tag>: .ok = passed a health gate at some point
# (a known-good release), .failed = refused or failed the gate.
mark_ok()     { mkdir -p "$1"; rm -f "$1/.failed"; touch "$1/.ok"; }
mark_failed() { mkdir -p "$1"; touch "$1/.failed"; }

# Prints the tags to delete under <base-dir>. Only releases that were live at
# some point (.ok) count towards KEEP_RELEASES, newest first by when they
# LAST passed a gate (the .ok marker's mtime — a rollback refreshes it, so
# "newest" means most recently known good; a tree's own mtime is useless
# here, tar restores it from the archive). <current> and <previous> count
# but are never printed. Releases that never went live — refused, failed the
# gate, transferred and never activated — are kept only while they are the
# newest such one (for inspection) and go first otherwise, so junk can never
# push a known-good release out of the quota.
prune_candidates() { # <base-dir> <marker-dir> <current> <previous>
  local base="$1" mark="$2" cur="$3" prev="$4" dir tag kept=0 junk_kept=0 ok_list junk_list
  [ -d "$base" ] || return 0
  ok_list=$(for dir in "$base"/*/; do [ -d "$dir" ] || continue; tag="$(basename "$dir")"
              [ -e "$mark/$tag/.ok" ] && printf '%s %s\n' "$(stat -c %Y "$mark/$tag/.ok")" "$tag"; done | sort -rn)
  junk_list=$(for dir in "$base"/*/; do [ -d "$dir" ] || continue; tag="$(basename "$dir")"
              [ -e "$mark/$tag/.ok" ] || printf '%s %s\n' "$(stat -c %Y "$dir")" "$tag"; done | sort -rn)
  while read -r _ tag; do
    [ -n "$tag" ] || continue
    if [ "$tag" = "$cur" ] || [ "$tag" = "$prev" ]; then kept=$((kept + 1)); continue; fi
    if [ "$kept" -ge "$KEEP_RELEASES" ]; then echo "$tag"; else kept=$((kept + 1)); fi
  done <<< "$ok_list"
  while read -r _ tag; do
    [ -n "$tag" ] || continue
    if [ "$tag" = "$cur" ] || [ "$tag" = "$prev" ]; then continue; fi
    if [ "$junk_kept" -ge 1 ]; then echo "$tag"; else junk_kept=1; fi
  done <<< "$junk_list"
}
