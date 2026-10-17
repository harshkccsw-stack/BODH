#!/usr/bin/env bash
# Build on THIS machine, push only the finished artifacts to the droplet, and
# let the droplet's receiver (deploy/server/*.sh) activate them. The droplet
# never runs Maven or npm again: a jar push is ~70 MB over ssh and a 30 s
# restart; an SPA push is a tarball and an instant symlink swap.
#
#   deploy/client/push.sh api                    # build the jar, push, activate
#   deploy/client/push.sh all                    # api + every SPA (SPAs only after the API gate passes)
#   deploy/client/push.sh app portal             # SPAs only
#
# SPAs hosted on DigitalOcean App Platform (APP_PLATFORM_SPAS in the target
# file) are not sent to the droplet: App Platform deploys them from the dist/
# folders committed on GitHub. For those, "push" = build in production mode,
# commit ONLY their dist/ folders, and git push APP_PLATFORM_BRANCH — after the
# API (if included) has passed its health gate. Must be run on that branch,
# up to date with origin. --dry-run builds and shows the commit, sends nothing.
#   deploy/client/push.sh api --skip-build       # reuse target/*.jar from the last build
#   deploy/client/push.sh api --jar path/to.jar  # push a jar built elsewhere
#   deploy/client/push.sh app --dist path/dist   # push a dist folder built elsewhere
#   deploy/client/push.sh api --dry-run          # build + stage, print the remote steps, send nothing
#
# Options: --target <name>   deploy/targets/<name>.env (default: production)
#          --tag <tag>       release tag (default: <utc-timestamp>-<git-sha>[-dirty])
#          --with-tests      run the Maven tests as part of the build (default skips them)
#          --no-activate     transfer only; activate later with the receiver
#          --force           ignore a deploy/ mismatch between here and the droplet
#
# Works with macOS bash 3.2, Linux bash and Git Bash on Windows (from cmd or
# PowerShell: deploy\client\push.cmd, same arguments); needs java 25 (api),
# node (SPAs), ssh, and rsync or scp. Rollback afterwards:
#   ssh <user>@<host> <remote-dir>/deploy/server/rollback.sh api
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# shellcheck source=../project.env
. deploy/project.env

usage() { sed -n '2,/^set -euo pipefail/p' "$0" | grep '^#'; }
die() { printf 'push: %s\n' "$1" >&2; exit "${2:-1}"; }
say() { printf '\n== %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but not installed"; }
sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }
# Git Bash hands Windows variables over as C:\..., which bash cannot append /bin/java to.
unix_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf '%s\n' "$1"; fi; }

TARGET=production; TAG=""; SKIP_BUILD=0; JAR=""; DIST=""; DRY=0; ACTIVATE=1; FORCE=0; WITH_TESTS=0
WANT=""
while [ $# -gt 0 ]; do
  case "$1" in
    api|all) WANT="$WANT $1"; shift ;;
    --target) TARGET="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --jar) JAR="$2"; shift 2 ;;
    --dist) DIST="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --no-activate) ACTIVATE=0; shift ;;
    --force) FORCE=1; shift ;;
    --with-tests) WITH_TESTS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "unknown option $1 (see --help)" ;;
    *) WANT="$WANT $1"; shift ;; # validated below, once the target says which SPAs exist
  esac
done
[ -n "$WANT" ] || { usage; exit 1; }

[ -f "deploy/targets/$TARGET.env" ] || die "deploy/targets/$TARGET.env not found"
# shellcheck source=../targets/production.env
. "deploy/targets/$TARGET.env"
: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${REMOTE_DIR:?}"

# SPAs come from two places: SPAS (project.env) are served by the droplet;
# APP_PLATFORM_SPAS (the target file) are served by DigitalOcean App Platform.
APP_PLATFORM_SPAS="${APP_PLATFORM_SPAS:-}"
APP_PLATFORM_BRANCH="${APP_PLATFORM_BRANCH:-main}"
ALL_SPAS="$(echo $SPAS $APP_PLATFORM_SPAS)"
is_app_platform() { case " $APP_PLATFORM_SPAS " in *" $1 "*) return 0 ;; esac; return 1; }
case " $WANT " in *" all "*) WANT="api $ALL_SPAS" ;; esac
for a in $WANT; do
  case " api $ALL_SPAS " in *" $a "*) ;; *) die "unknown artifact '$a' (api${ALL_SPAS:+ $ALL_SPAS} all)" ;; esac
done
# de-duplicate, keep order
ARTIFACTS=""
for a in $WANT; do case " $ARTIFACTS " in *" $a "*) ;; *) ARTIFACTS="$ARTIFACTS $a" ;; esac; done
ARTIFACTS="${ARTIFACTS# }"
# What travels to the droplet, and what is delivered through GitHub instead.
DROPLET_ARTIFACTS=""; AP_ARTIFACTS=""
for a in $ARTIFACTS; do
  if [ "$a" != api ] && is_app_platform "$a"; then AP_ARTIFACTS="$AP_ARTIFACTS $a"; else DROPLET_ARTIFACTS="$DROPLET_ARTIFACTS $a"; fi
done
DROPLET_ARTIFACTS="${DROPLET_ARTIFACTS# }"; AP_ARTIFACTS="${AP_ARTIFACTS# }"
[ -z "$AP_ARTIFACTS" ] || [ -z "$DIST" ] || die "--dist is not supported for App Platform SPAs ($AP_ARTIFACTS)"
SSH_OPTS="${SSH_OPTS:-}"
REMOTE="$DEPLOY_USER@$DEPLOY_HOST"
ssh_() { # shellcheck disable=SC2086
  ssh $SSH_OPTS -o BatchMode=yes "$REMOTE" "$@"; }
remote() { if [ "$DRY" = 1 ]; then printf '   [dry-run] ssh %s %s\n' "$REMOTE" "$*"; else ssh_ "$@"; fi; }

# ── Preflight ────────────────────────────────────────────────────────────────
say "preflight ($TARGET: $REMOTE:$REMOTE_DIR)"
need ssh; need git; need tar
# Where a JDK <major> lives when it is not first on PATH: an explicit JAVA_HOME,
# then macOS's java_home, then the usual install roots (macOS, Linux, Windows).
jdk_is() { [ -x "$2/bin/java" ] && "$2/bin/java" -version 2>&1 | grep -q "\"$1"; }
find_jdk() { # <major>
  local home
  if [ -n "${JAVA_HOME:-}" ]; then
    home="$(unix_path "$JAVA_HOME")"
    if jdk_is "$1" "$home"; then printf '%s\n' "$home"; return 0; fi
  fi
  if [ -x /usr/libexec/java_home ]; then
    home="$(/usr/libexec/java_home -v "$1" 2>/dev/null || true)"
    if [ -n "$home" ] && jdk_is "$1" "$home"; then printf '%s\n' "$home"; return 0; fi
  fi
  for home in \
    /Library/Java/JavaVirtualMachines/*/Contents/Home \
    /usr/lib/jvm/* \
    "$HOME/.sdkman/candidates/java"/* \
    "$HOME/.jdks"/* \
    "/c/Program Files/Eclipse Adoptium"/* \
    "/c/Program Files/Java"/* \
    "/c/Program Files/Microsoft"/* \
    "/c/Program Files/Zulu"/* \
    "/c/Program Files/Amazon Corretto"/*; do
    [ -d "$home" ] || continue
    if jdk_is "$1" "$home"; then printf '%s\n' "$home"; return 0; fi
  done
  return 1
}
case " $ARTIFACTS " in *" api "*)
  if [ -z "$JAR" ] && [ "$SKIP_BUILD" = 0 ]; then
    # The jar has to run on the runtime image's JRE (deploy/server/Dockerfile.runtime
    # is eclipse-temurin:<JAVA_VERSION>-jre), so the BUILD jdk is pinned rather than
    # inherited from whatever `java` happens to be first on PATH. A package manager
    # or an IDE raising the default JDK must not silently change what ships.
    #
    # A wrong major is not fatal on its own: the right JDK is usually installed
    # even when it is not first on PATH (macOS keeps every JDK; on Windows it sits
    # under C:\Program Files), so the common case (default moved to 26, 25 still
    # installed) self-heals instead of making the operator export JAVA_HOME by
    # hand. No java on PATH at all is fine too (a terminal opened before the JDK
    # was installed). Only a genuinely absent JDK stops the push.
    REQ_JAVA="${JAVA_VERSION:-25}"
    FOUND_JAVA="no java"
    if command -v java >/dev/null 2>&1; then FOUND_JAVA="$(java -version 2>&1 | head -1)"; fi
    case "$FOUND_JAVA" in
      *"\"$REQ_JAVA"*) ;;
      *)
        JH="$(find_jdk "$REQ_JAVA")" \
          || die "java $REQ_JAVA is required to build the jar (found $FOUND_JAVA, and no JDK $REQ_JAVA in JAVA_HOME or the usual install roots) — install it, or set JAVA_HOME to one"
        export JAVA_HOME="$JH"
        PATH="$JAVA_HOME/bin:$PATH"; export PATH
        echo "   java: shell default is $FOUND_JAVA — building with JDK $REQ_JAVA at $JAVA_HOME" ;;
    esac
    echo "   java: $(java -version 2>&1 | head -1)"
  fi ;;
esac
for a in $ARTIFACTS; do
  [ "$a" = api ] && continue
  if [ -z "$DIST" ] && [ "$SKIP_BUILD" = 0 ]; then need npm; fi
done
HAVE_RSYNC=0
if [ -n "$DROPLET_ARTIFACTS" ]; then
  ssh_ true || die "cannot ssh to $REMOTE (SSH_OPTS='$SSH_OPTS'). It runs with BatchMode, so the key
       must load without a prompt: an ssh-agent, or a key without a passphrase. On
       Windows this is Git Bash's ssh, which does not see the Windows ssh-agent service."
  if command -v rsync >/dev/null 2>&1 && ssh_ 'command -v rsync >/dev/null'; then HAVE_RSYNC=1; fi

  # The receiver on the droplet must match this checkout: artifact pushes need
  # no `git pull` there, but changes to deploy/, compose or nginx do. Hashed
  # without CRs: a Windows checkout (core.autocrlf) holds the same files with
  # CRLF endings, and the droplet's are LF. Both lists are sorted here in one
  # fixed order, because the glob's order follows the locale: Git Bash's
  # en_US.UTF-8 files Dockerfile.runtime between deploy-*.sh, while macOS and
  # the droplet put it first.
  local_sums()  { for f in deploy/project.env deploy/server/*; do printf '%s %s\n' "$(tr -d '\r' < "$f" | sha256_of - | cut -d' ' -f1)" "$(basename "$f")"; done | LC_ALL=C sort -k2; }
  remote_sums() { ssh_ "cd '$REMOTE_DIR' && for f in deploy/project.env deploy/server/*; do printf '%s %s\n' \"\$(sha256sum \"\$f\" | cut -d' ' -f1)\" \"\$(basename \"\$f\")\"; done" | LC_ALL=C sort -k2; }
  if ! diff <(local_sums) <(remote_sums) >/dev/null 2>&1; then
    if [ "$FORCE" = 1 ]; then
      echo "   warning: deploy/ on the droplet differs from this checkout (--force given)"
    else
      diff <(local_sums) <(remote_sums) || true
      die "deploy/ on the droplet differs from this checkout — git pull there first (or --force)"
    fi
  fi
fi

# App Platform SPAs ship as a commit on APP_PLATFORM_BRANCH, so this checkout
# must BE that branch and contain everything GitHub has — otherwise the push
# would either go to the wrong place or be rejected after the API is live.
if [ -n "$AP_ARTIFACTS" ]; then
  CUR_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  [ "$CUR_BRANCH" = "$APP_PLATFORM_BRANCH" ] \
    || die "App Platform SPAs ($AP_ARTIFACTS) deploy from '$APP_PLATFORM_BRANCH' — you are on '$CUR_BRANCH'. git checkout $APP_PLATFORM_BRANCH first"
  git fetch -q origin "$APP_PLATFORM_BRANCH" || die "git fetch origin $APP_PLATFORM_BRANCH failed"
  git merge-base --is-ancestor "origin/$APP_PLATFORM_BRANCH" HEAD \
    || die "your $APP_PLATFORM_BRANCH is behind origin/$APP_PLATFORM_BRANCH — git pull first"
  echo "   app platform: $AP_ARTIFACTS via git push origin $APP_PLATFORM_BRANCH"
  # Only dist/ is committed, so an uncommitted source edit goes live without
  # its source reaching GitHub. Allowed (a hotfix is a hotfix), but said aloud.
  for a in $AP_ARTIFACTS; do
    spa_dir_var="SPA_${a}_DIR"; spa_dir="${!spa_dir_var:-}"
    [ -n "$spa_dir" ] || continue
    if [ -n "$(git status --porcelain -- "$spa_dir" ":(exclude)$spa_dir/dist" ":(exclude)$spa_dir/*.tsbuildinfo" 2>/dev/null)" ]; then
      echo "   warning: $spa_dir has uncommitted changes — they go live in $a's dist/ but its source stays local until you commit it"
    fi
  done
fi

# ── Tag ──────────────────────────────────────────────────────────────────────
SHA="$(git rev-parse --short=7 HEAD 2>/dev/null || echo nogit)"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
DIRTY=false; DIRTY_SUFFIX=""
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then DIRTY=true; DIRTY_SUFFIX="-dirty"; fi
[ -n "$TAG" ] || TAG="$(date -u +%Y%m%d-%H%M%SZ)-$SHA$DIRTY_SUFFIX"
case "$TAG" in *[!A-Za-z0-9_.-]*) die "tag '$TAG' must match [A-Za-z0-9_.-]" ;; esac
echo "   tag: $TAG  artifacts: $ARTIFACTS"

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/push.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

manifest() { # <artifact> <sha256>
  printf '{"tag":"%s","artifact":"%s","project":"%s","gitSha":"%s","gitBranch":"%s","gitDirty":%s,"builtAt":"%s","builtOn":"%s","sha256":"%s","healthProbe":"actuator"}\n' \
    "$TAG" "$1" "$PROJECT" "$SHA" "$BRANCH" "$DIRTY" "$(date -u +%FT%TZ)" "$(hostname)" "$2"
}

# ── Build + stage ────────────────────────────────────────────────────────────
stage_api() {
  local jar
  if [ -n "$JAR" ]; then
    jar="$JAR"
  else
    if [ "$SKIP_BUILD" = 0 ]; then
      say "building $API_DIR (mvnw package$([ "$WITH_TESTS" = 1 ] || printf ', tests skipped'))"
      local skip="-DskipTests"; [ "$WITH_TESTS" = 1 ] && skip=""
      # shellcheck disable=SC2086
      (cd "$API_DIR" && ./mvnw -B -q $skip -Dbuild.sha="$SHA" -Dbuild.tag="$TAG" package)
    fi
    set -- "$API_DIR"/target/*.jar      # *.jar.original does not match
    [ $# -eq 1 ] && [ -f "$1" ] || die "expected exactly one jar in $API_DIR/target, found: $*"
    jar="$1"
  fi
  [ -f "$jar" ] || die "jar not found: $jar"
  mkdir -p "$STAGE/api"
  cp "$jar" "$STAGE/api/app.jar"
  (cd "$STAGE/api" && sha256_of app.jar > app.jar.sha256)
  manifest api "$(cut -d' ' -f1 "$STAGE/api/app.jar.sha256")" > "$STAGE/api/release.json"
  echo "   staged api: $(du -h "$STAGE/api/app.jar" | cut -f1) from $jar"
}

stage_spa() { # <name>
  local name="$1" dir_var="SPA_$1_DIR" bp_var="SPA_$1_BASE_PATH" dir dist bp
  dir="${!dir_var}"; bp="${!bp_var:-/}"
  if [ -n "$DIST" ]; then
    dist="$DIST"
  else
    if [ "$SKIP_BUILD" = 0 ]; then
      say "building $dir (VITE_API_URL=$PUBLIC_API_URL VITE_BASE_PATH=$bp)"
      # Real environment variables outrank any stray .env in the SPA dir.
      # MSYS2_ENV_CONV_EXCL: Git Bash rewrites every path-looking variable it
      # hands a Windows program, so VITE_BASE_PATH=/portal/ would reach Vite as
      # "C:/Program Files/Git/portal/". Ignored everywhere else.
      (cd "$dir" && npm ci --no-audit --no-fund \
        && MSYS2_ENV_CONV_EXCL=VITE_ \
           VITE_API_URL="$PUBLIC_API_URL" VITE_PORTAL_URL="${PUBLIC_PORTAL_URL:-}" VITE_BASE_PATH="$bp" npm run build)
    fi
    dist="$dir/dist"
  fi
  [ -f "$dist/index.html" ] || die "$dist/index.html not found — build failed or wrong --dist"
  mkdir -p "$STAGE/$name"
  # COPYFILE_DISABLE keeps macOS AppleDouble (._*) files out of the archive.
  (cd "$dist" && COPYFILE_DISABLE=1 tar --exclude .DS_Store -czf "$STAGE/$name/dist.tar.gz" .)
  (cd "$STAGE/$name" && sha256_of dist.tar.gz > dist.tar.gz.sha256)
  manifest "$name" "$(cut -d' ' -f1 "$STAGE/$name/dist.tar.gz.sha256")" > "$STAGE/$name/release.json"
  echo "   staged $name: $(du -h "$STAGE/$name/dist.tar.gz" | cut -f1) from $dist"
}

# App Platform SPA: build its dist/ in place, with the SPA's own .env.production
# (the URLs App Platform has always been built with). Built here, before
# anything is sent, so a broken frontend stops the run before the droplet is
# touched; committed and pushed only after the API gate (see the end).
build_app_platform_spa() { # <name>
  local name="$1" dir_var="SPA_$1_DIR" dir
  dir="${!dir_var:-}"
  [ -n "$dir" ] && [ -d "$dir" ] || die "SPA_${name}_DIR is not set to a directory in deploy/targets/$TARGET.env"
  if [ "$SKIP_BUILD" = 0 ]; then
    say "building $dir for App Platform (npm run build:production)"
    # package-lock.json is gitignored in these SPAs, so node_modules is only as
    # fresh as the last install on THIS machine (and npm ci, which needs a lock,
    # cannot set it up at all). A dependency added since then fails tsc on every
    # file that imports it; npm ls notices that, npm install brings it in.
    if ! (cd "$dir" && npm ls --depth=0 >/dev/null 2>&1); then
      say "installing $dir dependencies (node_modules is missing or behind package.json)"
      (cd "$dir" && npm install --no-audit --no-fund)
    fi
    (cd "$dir" && npm run build:production)
    # tsc -b rewrites a tracked build cache; it is not part of the release.
    git checkout -q -- "$dir"/*.tsbuildinfo 2>/dev/null || true
  fi
  [ -f "$dir/dist/index.html" ] || die "$dir/dist/index.html not found — build failed"
  echo "   built $name: $(du -sh "$dir/dist" | cut -f1) in $dir/dist"
}

for a in $ARTIFACTS; do
  if [ "$a" = api ]; then stage_api
  elif is_app_platform "$a"; then build_app_platform_spa "$a"
  else stage_spa "$a"; fi
done

# ── Transfer ─────────────────────────────────────────────────────────────────
transfer() { # <artifact>
  local dest="$REMOTE_DIR/releases/$1/$TAG"
  if [ "$DRY" = 1 ]; then printf '   [dry-run] copy %s/ -> %s:%s/\n' "$STAGE/$1" "$REMOTE" "$dest"; return 0; fi
  ssh_ "mkdir -p '$dest'"
  if [ "$HAVE_RSYNC" = 1 ]; then
    rsync -a --partial -e "ssh $SSH_OPTS -o BatchMode=yes" "$STAGE/$1/" "$REMOTE:$dest/"
  else
    # shellcheck disable=SC2086
    scp $SSH_OPTS -q -r "$STAGE/$1/." "$REMOTE:$dest/"
  fi
  echo "   sent $1 -> $REMOTE:$dest"
}
if [ -n "$DROPLET_ARTIFACTS" ]; then
  say "transferring ($([ "$HAVE_RSYNC" = 1 ] && echo rsync || echo scp))"
  for a in $DROPLET_ARTIFACTS; do transfer "$a"; done
fi

# ── App Platform delivery ────────────────────────────────────────────────────
# Commit ONLY the SPAs' dist/ folders (anything else staged or modified in the
# checkout stays out of the commit), then push the branch App Platform deploys
# from. A rejected push leaves the commit local and says how to finish.
ap_dist_paths() { local a d; for a in $AP_ARTIFACTS; do d="SPA_${a}_DIR"; printf '%s/dist ' "${!d}"; done; }
deliver_app_platform() {
  local paths; paths="$(ap_dist_paths)"
  # shellcheck disable=SC2086
  if [ "$DRY" = 1 ]; then
    printf '   [dry-run] would commit %s changed file(s) under %s\n' "$(git status --porcelain -- $paths | wc -l | tr -d ' ')" "$paths"
    printf '   [dry-run] then: git push origin HEAD:%s (App Platform deploys from there)\n' "$APP_PLATFORM_BRANCH"
    return 0
  fi
  # shellcheck disable=SC2086
  git add -A -- $paths
  # shellcheck disable=SC2086
  if git diff --cached --quiet -- $paths; then
    echo "   $AP_ARTIFACTS: dist/ unchanged since the last commit — nothing new to commit"
  else
    # shellcheck disable=SC2086
    git commit -q -m "build($(echo $AP_ARTIFACTS | tr ' ' ',')): production build for App Platform ($TAG)" -- $paths
    echo "   committed $(git rev-parse --short HEAD): dist/ of $AP_ARTIFACTS"
  fi
  if [ "$(git rev-list --count "origin/$APP_PLATFORM_BRANCH..HEAD")" = 0 ]; then
    echo "   origin/$APP_PLATFORM_BRANCH already has this — nothing to push"
    return 0
  fi
  git push origin "HEAD:$APP_PLATFORM_BRANCH" \
    || die "git push failed — the frontend commit is still local: git pull --rebase && git push origin $APP_PLATFORM_BRANCH"
  echo "   pushed to origin/$APP_PLATFORM_BRANCH — App Platform redeploys $AP_ARTIFACTS from it (usually a few minutes)"
}

# ── Activate ─────────────────────────────────────────────────────────────────
if [ "$ACTIVATE" = 0 ]; then
  say "not activating (--no-activate). Later:"
  for a in $DROPLET_ARTIFACTS; do
    if [ "$a" = api ]; then echo "   on the droplet: $REMOTE_DIR/deploy/server/deploy-api.sh --tag $TAG"
    else echo "   on the droplet: $REMOTE_DIR/deploy/server/deploy-spa.sh $a --tag $TAG"; fi
  done
  [ -z "$AP_ARTIFACTS" ] || echo "   here: git add -A $(ap_dist_paths)&& git commit -m 'build: frontends' && git push origin $APP_PLATFORM_BRANCH"
  exit 0
fi
# api first: SPAs that talk to a new API only go live if the API came up.
for a in $DROPLET_ARTIFACTS; do
  say "activating $a $TAG on $DEPLOY_HOST"
  if [ "$a" = api ]; then
    remote "'$REMOTE_DIR/deploy/server/deploy-api.sh' --tag '$TAG'" || die "api $TAG failed on the droplet (exit $?) — see output above; the receiver rolled back if it could" "$?"
  else
    remote "'$REMOTE_DIR/deploy/server/deploy-spa.sh' '$a' --tag '$TAG'" || die "$a $TAG failed on the droplet (exit $?)" "$?"
  fi
done
if [ -n "$AP_ARTIFACTS" ]; then
  say "delivering $AP_ARTIFACTS to App Platform"
  deliver_app_platform
fi
say "done: $ARTIFACTS at $TAG"
case " $DROPLET_ARTIFACTS " in *" api "*) echo "   rollback: ssh $SSH_OPTS $REMOTE $REMOTE_DIR/deploy/server/rollback.sh api" ;; esac
