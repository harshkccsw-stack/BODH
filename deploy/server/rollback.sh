#!/usr/bin/env bash
# Roll an artifact back to its previous release (or to a named tag), through
# the same health gate a deploy uses — so a bad rollback target rolls forward
# again instead of leaving the API down.
#
# Usage: deploy/server/rollback.sh api [tag]        # ~30 s of 502 while the JVM restarts
#        deploy/server/rollback.sh <spa> [tag]      # instant symlink swap (MemoryMesh only)
#        deploy/server/rollback.sh --list           # what is on disk, what is live
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$DEPLOY_ROOT"
HERE="$(cd "$(dirname "$0")" && pwd)"

# ok = passed a gate at some point; failed = refused or failed a gate;
# pending = transferred, never activated. Only ok releases fill the keep quota.
status_of() { if [ -e "$1/.ok" ]; then echo ok; elif [ -e "$1/.failed" ]; then echo failed; else echo pending; fi; }
marks() { local m=""; [ "$1" = "$2" ] && m=" <- current"; [ "$1" = "$3" ] && m=" <- previous"; printf '%s' "$m"; }

list() {
  local art tag cur prev
  for art in api $SPAS; do
    cur="$(state_get "$art" current)"; prev="$(state_get "$art" previous)"
    printf '\n%s  current=%s  previous=%s\n' "$art" "${cur:-none}" "${prev:-none}"
    if [ "$art" = api ]; then
      printf '  container: %s, image label: %s\n' "$(container_state)" \
        "$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.version"}}' "$CONTAINER" 2>/dev/null || echo none)"
      printf '  probe: actuator=%s legacy=%s\n' \
        "$(probe_once actuator && echo UP || echo no)" "$(probe_once legacy && echo UP || echo no)"
      for tag in $(ls -1td "$RELEASES/api"/*/ 2>/dev/null | xargs -rn1 basename); do
        printf '  %-40s image:%-4s %s%s\n' "$tag" "$(docker image inspect "$IMAGE:$tag" >/dev/null 2>&1 && echo yes || echo no)" \
          "$(status_of "$RELEASES/api/$tag")" "$(marks "$tag" "$cur" "$prev")"
      done
    else
      printf '  %s -> %s\n' "$WEB_ROOT/$art" "$(readlink "$WEB_ROOT/$art" 2>/dev/null || echo '(not a symlink)')"
      for tag in $(ls -1td "$WEB_ROOT/releases/$art"/*/ 2>/dev/null | xargs -rn1 basename); do
        printf '  %-40s %s%s\n' "$tag" "$(status_of "$RELEASES/$art/$tag")" "$(marks "$tag" "$cur" "$prev")"
      done
    fi
  done
}

case "${1:-}" in
  --list|-l|"") list; exit 0 ;;
  -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
esac

ART="$1"; TAG="${2:-$(state_get "$ART" previous)}"
[ -n "$TAG" ] || die "no previous release recorded for $ART — name a tag: $0 $ART <tag>"
case "$ART" in
  api) exec "$HERE/deploy-api.sh" --tag "$TAG" --no-prune ;;
  *)
    case " $SPAS " in *" $ART "*) ;; *) die "unknown artifact '$ART' (api${SPAS:+ $SPAS})" ;; esac
    exec "$HERE/deploy-spa.sh" "$ART" --tag "$TAG" --dir "$WEB_ROOT/releases/$ART/$TAG" --no-prune ;;
esac
