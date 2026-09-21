# deploy/ — push a prebuilt jar, activate on the droplet

The droplet has 4 GB, no swap and no JDK. It must never run Maven. The jar is
built on the developer machine (or, later, in CI); the droplet only receives
it and activates it. BodhAssess is jar-only here: the admin and portal SPAs
live on DigitalOcean App Platform, not on this droplet.

This directory is a copy of MemoryMesh's `deploy/` with a different
`project.env` (and no `deploy-spa.sh`). Keep `deploy/server/` identical across
the two repos: `diff -r /root/memoryMesh/MemoryMesh/deploy/server deploy/server`
should print only the missing `deploy-spa.sh`.

```
deploy/project.env            per-project constants (image, container, run user, health URL)
deploy/targets/<name>.env     where push.sh sends things (non-secret, tracked)
deploy/client/push.sh         developer machine: build → tag → stage → rsync → activate
deploy/server/deploy-api.sh   droplet: jar on disk → thin image → restart → health gate → rollback
deploy/server/rollback.sh     droplet: back to the previous release, or --list
deploy/server/lib.sh          shared helpers (lock, checksum, state, probes, pruning)
deploy/server/Dockerfile.runtime  eclipse-temurin JRE + COPY app.jar, nothing else
releases/                     runtime state on the droplet (gitignored)
```

## Everyday use (developer machine)

```bash
deploy/client/push.sh api            # ./mvnw package here, ~70 MB over ssh, ~30 s restart, health-gated
deploy/client/push.sh api --dry-run  # build and stage, print the remote steps, send nothing
```

Rollback from anywhere with ssh:

```bash
ssh root@168.144.118.157 /root/bodhassess-api/deploy/server/rollback.sh api        # previous jar, through the gate
ssh root@168.144.118.157 /root/bodhassess-api/deploy/server/rollback.sh --list     # what is on disk / running
```

## The receiver contract (for CI or a manual scp)

```
/root/bodhassess-api/releases/api/<tag>/app.jar
/root/bodhassess-api/releases/api/<tag>/app.jar.sha256   "<hash>  app.jar" (sha256sum / shasum -a 256 format)
/root/bodhassess-api/releases/api/<tag>/release.json     {"tag","artifact":"api","gitSha",...,"healthProbe":"actuator"}
→  /root/bodhassess-api/deploy/server/deploy-api.sh --tag <tag>
```

`deploy-api.sh` verifies the checksum, builds `bodhpsychometric-api:<tag>`
from `Dockerfile.runtime` (one COPY, seconds), moves `:latest` to it, runs
`docker compose --profile production up -d --no-deps api`, and polls
`http://127.0.0.1:8080/actuator/health`. Exit 0 means healthy and recorded;
exit 1 means it failed and the previous release is back; exit 2 means the
previous release is not healthy either. The last 5 releases are kept, never
the current or previous one. Everything is logged to `releases/deploy.log`.

Every deploy recreates the container: `/app/uploads` is not a volume (the
`app-uploads` volume in docker-compose.yml is still commented out), so
uploads do not survive a deploy — as was already true of `--build`.

## First run on a droplet that is already serving

```bash
deploy/server/deploy-api.sh --adopt-running               # tags the running image legacy-<date>, copies its jar out
docker compose --profile production up -d --no-deps api   # once: compose lost its build: section, hash changed
```

## Fallback: build on the droplet anyway

```bash
d=$(date -u +%Y%m%d)
docker build -t bodhpsychometric-api:source-$d spring-social/          # Maven inside Docker, needs ~1 GB free
id=$(docker create bodhpsychometric-api:source-$d); mkdir -p releases/api/source-$d
docker cp "$id":/app/app.jar releases/api/source-$d/app.jar; docker rm "$id"
(cd releases/api/source-$d && sha256sum app.jar > app.jar.sha256)
deploy/server/deploy-api.sh --tag source-$d
```
