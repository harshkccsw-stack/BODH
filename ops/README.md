# Production database backup

Nightly `mysqldump` of the production `bodhpsychometric` database, gzipped and
uploaded to the DigitalOcean Space `bodh-db-backups` (sgp1 region), keeping 10
days of history both on the droplet and in the Space.

Everything runs **on the production droplet** (`root@168.144.118.157` —
`REMOTE_HOST` in `deploy.production.env`), where the `bodhpsychometric-mysql`
container lives. Nothing here runs on a developer machine.

| File in this directory | Installed as |
| --- | --- |
| `bodh-db-backup.sh` | `/usr/local/bin/bodh-db-backup.sh` (root, 0700) |
| `bodh-backup.env.example` | `/etc/bodh-backup.env` (root, 0600) |
| `cron.d-bodh-db-backup` | `/etc/cron.d/bodh-db-backup` (root, 0644) |
| `logrotate-bodh-db-backup` | `/etc/logrotate.d/bodh-db-backup` (root, 0644) |
| — (created by hand) | `/root/.s3cfg-bodh-backup` (root, 0600) — **the only place the Spaces keys live** |

Dumps land in `/var/backups/bodhpsychometric/` and in
`s3://bodh-db-backups/bodhpsychometric/`, named
`bodhpsychometric-YYYY-MM-DD_HH-MM-SS.sql.gz`, stamped in IST.

## About the schedule

The cron line is `30 18 * * *` — **UTC**, because the droplet's clock is
`Etc/UTC`. 18:30 UTC is 00:00 IST, and India has no DST, so that never drifts.

It is deliberately *not* written as `0 0 * * *` with `CRON_TZ=Asia/Kolkata`.
Debian/Ubuntu cron does not implement `CRON_TZ` — verified on this droplet by
scheduling two probe jobs for the same instant, one via `CRON_TZ` and one in
server-local time: only the server-local one ran. A `CRON_TZ` entry fails
silently, which is the worst possible way for a backup to fail.

`BACKUP_TZ` in `/etc/bodh-backup.env` only controls the timezone of the
filename stamp, so the file is named with the IST date it belongs to.

## How it behaves

1. `flock` — a slow dump can never overlap the next night's run.
2. `mysqldump` runs *inside* the container and expands the container's own
   `$MYSQL_ROOT_PASSWORD` / `$MYSQL_DATABASE`, so the password is never written
   into a file on the host and never appears in `ps`.
3. The gzip is verified before it is trusted: size > 1 KB **and** the
   `Dump completed` trailer is present. A truncated dump aborts the run.
4. Upload, then read the object's metadata back to confirm it is really there.
5. **Only then** prune — locally by file age, remotely by the date embedded in
   the object key. So a stretch of failing backups leaves *stale* backups, never
   *no* backups.

Every step is logged to `/var/log/bodh-db-backup.log`.

## Install (on the droplet, as root)

```bash
apt-get update && apt-get install -y s3cmd

# 1. Spaces credentials — the only secret file.
cat > /root/.s3cfg-bodh-backup <<'EOF'
[default]
access_key = DO...
secret_key = ...
host_base = sgp1.digitaloceanspaces.com
host_bucket = %(bucket)s.sgp1.digitaloceanspaces.com
use_https = True
signature_v2 = False
EOF
chmod 600 /root/.s3cfg-bodh-backup

# 2. Confirm the Space exists and the keys work (create the Space in the DO
#    console first — the script deliberately will not create it).
s3cmd -c /root/.s3cfg-bodh-backup info s3://bodh-db-backups

# 3. Script, config, schedule, log rotation.
install -m 700 -o root -g root bodh-db-backup.sh        /usr/local/bin/bodh-db-backup.sh
install -m 600 -o root -g root bodh-backup.env.example  /etc/bodh-backup.env   # then edit
install -m 644 -o root -g root cron.d-bodh-db-backup    /etc/cron.d/bodh-db-backup
install -m 644 -o root -g root logrotate-bodh-db-backup /etc/logrotate.d/bodh-db-backup
install -d -m 700 -o root -g root /var/backups/bodhpsychometric

# 4. Prove it works before trusting the schedule.
/usr/local/bin/bodh-db-backup.sh
s3cmd -c /root/.s3cfg-bodh-backup ls s3://bodh-db-backups/bodhpsychometric/
```

## Restore

Never restore straight onto production. Pull the dump down, load it into a
scratch database, check it, and only then decide.

```bash
# Fetch a specific night.
s3cmd -c /root/.s3cfg-bodh-backup get \
  s3://bodh-db-backups/bodhpsychometric/bodhpsychometric-2026-08-18_00-00-01.sql.gz .

# Load into a scratch database (local dev MySQL on 127.0.0.1:3307).
mysql -h127.0.0.1 -P3307 -ubodh -pbodh -e 'CREATE DATABASE restore_check'
gunzip -c bodhpsychometric-2026-08-18_00-00-01.sql.gz \
  | mysql -h127.0.0.1 -P3307 -ubodh -pbodh restore_check
mysql -h127.0.0.1 -P3307 -ubodh -pbodh restore_check \
  -e 'SELECT COUNT(*) FROM Organization; SELECT COUNT(*) FROM Question;'
```

The dump includes `CREATE TABLE` for every table plus the `flyway_schema_history`
row set, so a restored database boots the API without re-running migrations.

## Rotating the Spaces keys

Generate a new key pair in the DO console, edit `/root/.s3cfg-bodh-backup`, run
the script once by hand, then delete the old pair. That file is the single place
the credentials appear.

## Troubleshooting

- **Nothing ran overnight** — `journalctl -u cron --since yesterday | grep bodh`.
  A `cron.d` file missing its trailing newline, not owned by root, or using
  `CRON_TZ`, is ignored silently. To prove cron still fires at all, drop a probe
  in `/etc/cron.d/` scheduled a couple of minutes out in **server-local (UTC)**
  time and watch for it.
- **`container ... is not running`** — the run aborted before touching anything;
  older backups are intact. Fix the container and run the script by hand.
- **`dump is truncated`** — usually the disk filled up. Check `df -h`; nothing
  was pruned, so history is intact.
- **Upload fails** — `s3cmd -c /root/.s3cfg-bodh-backup info s3://bodh-db-backups`
  to separate a credential problem from a network one. The local copy was kept.
