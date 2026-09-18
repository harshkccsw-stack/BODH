#!/usr/bin/env bash
# Receiver: activates a jar that is ALREADY on disk at releases/api/<tag>/.
# Everything after the file arrives happens here, so every producer — the
# developer machine (deploy/client/push.sh), a CI job, a manual scp — gets the
# same behaviour:
#   verify sha256 → thin runtime image → move :latest → compose up → health gate
#   → success: record current/previous, prune to KEEP_RELEASES
#   → failure: print the container log, retag the previous release, recreate,
#     exit 1 (exit 2 if the previous release is not healthy either)
# The droplet never runs Maven: the image build is one COPY of the jar onto
# the cached eclipse-temurin JRE base (seconds, one ~70 MB layer).
#
# Usage: deploy/server/deploy-api.sh --tag <tag> [--allow-legacy-probe] [--no-prune] [--timeout <s>]
#        deploy/server/deploy-api.sh --adopt-running   # first run: register what is running now
set -euo pipefail
. "$(dirname "$0")/lib.sh"
acquire_lock "$@"
cd "$DEPLOY_ROOT"

TAG=""; PROBE_OVERRIDE=""; PRUNE=1; TIMEOUT="$HEALTH_TIMEOUT"; ADOPT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="$2"; shift 2 ;;
    --allow-legacy-probe) PROBE_OVERRIDE=legacy; shift ;;
    --no-prune) PRUNE=0; shift ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --adopt-running) ADOPT=1; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

# First run on a droplet that already serves the source-built image: tag it,
# copy its jar out, and record it as current so the first push has something
# to roll back to. Idempotent — a second call is a no-op.
adopt_running() {
  local image_id tag dir
  image_id="$(docker inspect -f '{{.Image}}' "$CONTAINER" 2>/dev/null)" \
    || die "no container '$CONTAINER' to adopt — bring the stack up first"
  if [ -n "$(state_get api current)" ]; then
    log "already adopted: current=$(state_get api current)"; return 0
  fi
  tag="legacy-$(date -u +%Y%m%d)"
  dir="$RELEASES/api/$tag"
  log "adopting running $CONTAINER (${image_id:7:12}) as $tag"
  docker tag "$image_id" "$IMAGE:$tag"
  mkdir -p "$dir"
  docker cp "$CONTAINER:/app/app.jar" "$dir/app.jar"
  (cd "$dir" && sha256sum app.jar > app.jar.sha256)
  jq -n --arg tag "$tag" --arg project "$PROJECT" --arg id "$image_id" --arg at "$(date -u +%FT%TZ)" \
    '{tag:$tag, artifact:"api", project:$project, source:"adopted", healthProbe:"legacy", imageId:$id, adoptedAt:$at}' \
    > "$dir/release.json"
  mark_ok "$dir"
  state_set api current "$tag"
  log "OK adopted $tag as current"
}

activate() { # <tag>
  docker tag "$IMAGE:$1" "$IMAGE:latest"
  compose up -d --no-deps --no-build "$COMPOSE_SERVICE" 2>&1 | tee -a "$LOG_FILE"
}

prune_api() { # <current> <previous>
  local tag
  for tag in $(prune_candidates "$RELEASES/api" "$RELEASES/api" "$1" "$2"); do
    log "pruning api release $tag"
    docker rmi "$IMAGE:$tag" >/dev/null 2>&1 || true
    rm -rf "$RELEASES/api/$tag"
  done
}

if [ "$ADOPT" = 1 ]; then adopt_running; exit 0; fi
[ -n "$TAG" ] || die "--tag is required (or --adopt-running)"

DIR="$RELEASES/api/$TAG"
JAR="$DIR/app.jar"
[ -f "$JAR" ] || die "$JAR not found — push the release first"
# A release refused here is marked .failed so pruning takes it first and
# `rollback.sh --list` shows why it never went live.
refuse() { mark_failed "$DIR"; die "$1"; }
[ -f "$JAR.sha256" ] || refuse "$JAR.sha256 is missing — refusing an unverified artifact"
(cd "$DIR" && sha256sum -c --quiet app.jar.sha256 >/dev/null 2>&1) || refuse "checksum mismatch for $JAR"
[ "$(head -c 2 "$JAR")" = "PK" ] || refuse "$JAR is not a zip/jar"
docker info >/dev/null 2>&1 || die "docker daemon not reachable"
compose config -q || die "docker-compose.yml does not parse"

PREV="$(state_get api current)"
if [ -z "$PREV" ] && [ "$(container_state)" != missing ]; then
  adopt_running; PREV="$(state_get api current)"
fi
[ "$PREV" = "$TAG" ] && log "note: $TAG is already current — redeploying it"

# Pushed releases say how to probe them (release.json); one that arrived
# without a manifest is probed either way, and the mode that passes is
# written back so a rollback to it probes the same way.
MODE="$(manifest_get "$DIR" healthProbe)"; MODE="${PROBE_OVERRIDE:-${MODE:-auto}}"
GIT_SHA="$(manifest_get "$DIR" gitSha)"; GIT_SHA="${GIT_SHA:-unknown}"

log "== deploy api $TAG (previous: ${PREV:-none}, probe: $MODE)"
log "building $IMAGE:$TAG — runtime image, jar COPY only"
docker build -q -f deploy/server/Dockerfile.runtime \
  --build-arg RUN_USER="$RUN_USER" --build-arg RELEASE_TAG="$TAG" --build-arg GIT_SHA="$GIT_SHA" \
  -t "$IMAGE:$TAG" "$DIR" | tee -a "$LOG_FILE"

log "activating $TAG (old container stops, new one starts — ~30 s of 502 on /api)"
activate "$TAG"
if wait_healthy "$MODE" "$TIMEOUT"; then
  if [ "$MODE" = auto ]; then
    if probe_once actuator; then MODE=actuator; else MODE=legacy; fi
  fi
  manifest_set_probe "$DIR" "$MODE"
  mark_ok "$DIR"
  if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then state_set api previous "$PREV"; fi
  state_set api current "$TAG"
  printf '%s %s <- %s\n' "$(date -u +%FT%TZ)" "$TAG" "${PREV:-none}" >> "$RELEASES/api/history.log"
  if [ "$PRUNE" = 1 ]; then prune_api "$TAG" "$(state_get api previous)"; fi
  log "OK api $TAG (was ${PREV:-none})"
  exit 0
fi

log "FAILED health gate for $TAG — last 100 container log lines:"
docker logs --tail 100 "$CONTAINER" 2>&1 | tee -a "$LOG_FILE" || true
mark_failed "$DIR"
if [ -z "$PREV" ] || [ "$PREV" = "$TAG" ]; then
  compose stop "$COMPOSE_SERVICE" >/dev/null 2>&1 || true
  die "no previous release to roll back to — $COMPOSE_SERVICE stopped" 2
fi
PREV_MODE="$(manifest_get "$RELEASES/api/$PREV" healthProbe)"; PREV_MODE="${PREV_MODE:-auto}"
log "rolling back to $PREV (probe: $PREV_MODE)"
activate "$PREV"
if wait_healthy "$PREV_MODE" "$TIMEOUT"; then
  if [ "$PREV_MODE" = auto ]; then
    if probe_once actuator; then PREV_MODE=actuator; else PREV_MODE=legacy; fi
  fi
  manifest_set_probe "$RELEASES/api/$PREV" "$PREV_MODE"
  mark_ok "$RELEASES/api/$PREV"
  die "ROLLED BACK to $PREV (healthy); $TAG is marked .failed and current is unchanged" 1
fi
die "ROLLBACK FAILED — $PREV is not healthy either; manual intervention required" 2
