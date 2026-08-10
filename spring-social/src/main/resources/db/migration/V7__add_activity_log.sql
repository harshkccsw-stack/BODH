-- The activity trail: one row per HTTP request, written after the request has
-- been answered. Feeds the dashboard's activity view — who did what, when,
-- and whether it worked.
--
-- Scope is EVERY request, reads included (product decision, 2026-08-10). That
-- makes three things load-bearing rather than nice-to-have:
--
--   * The row is deliberately narrow. No request bodies, no response bodies.
--     At read volume the cost of this table is row count, and every column is
--     paid for on every GET.
--
--   * Retention is not optional. ActivityLogPurge deletes beyond
--     app.activity.retention-days (default 365). Without it this table grows
--     without bound and is the first thing to fill the disk.
--
--   * The indexes are the feature. The viewer always filters by time, and
--     usually by actor or status as well, so those are the three keys. Note
--     they are ordered (column, occurred_at) rather than (occurred_at,
--     column): the leading column narrows, the trailing one both sorts and
--     range-scans, which is exactly how the viewer queries.
--
-- No foreign key on actor_user_id, on purpose. An audit row must outlive the
-- account it describes — "who deleted this" is precisely the question you ask
-- after someone is gone — and an FK would either block the delete or cascade
-- the evidence away. actor_email is stored for the same reason: it is a
-- SNAPSHOT of who they were at the time, not a join to who they are now.
-- Anonymous requests leave both NULL, which is what the trail records when
-- app.security.require-auth is off.
--
-- Nothing to backfill: no request has ever been recorded, so there is no
-- history this table is missing.
--
-- Guard: CREATE TABLE IF NOT EXISTS makes a re-run a no-op. MySQL commits DDL
-- implicitly and cannot roll it back, so a second run has to be safe rather
-- than merely unlikely.
CREATE TABLE IF NOT EXISTS `activity_log` (
  `activity_log_id` bigint       NOT NULL AUTO_INCREMENT,

  -- Ties this row to the log lines of the same request, and to the reference
  -- returned in a 5xx body. See RequestIdFilter.
  `request_id`      varchar(64)  DEFAULT NULL,
  `occurred_at`     datetime(6)  NOT NULL,

  -- NULL for anonymous. Snapshot, not a join — see above.
  `actor_user_id`   bigint       DEFAULT NULL,
  `actor_email`     varchar(255) DEFAULT NULL,
  `actor_super_admin` bit(1)     NOT NULL DEFAULT b'0',

  `method`          varchar(8)   NOT NULL,
  -- The URI as called. Truncated by the writer, never trusted at full length.
  `path`            varchar(512) NOT NULL,
  -- The mapping it matched ("/api/questions/delete/{id}"), so the viewer can
  -- group by endpoint instead of by id. NULL when nothing matched — a 404, or
  -- a request the auth filter rejected before routing.
  `path_template`   varchar(255) DEFAULT NULL,
  -- Query string for reads: on a GET this is the whole intent of the call.
  `query_string`    varchar(1000) DEFAULT NULL,

  `http_status`     smallint     NOT NULL,
  `outcome`         enum('SUCCESS','CLIENT_ERROR','SERVER_ERROR') NOT NULL,
  -- Message only, never a stack trace; the stack stays in the application log.
  `error_message`   varchar(500) DEFAULT NULL,
  `duration_ms`     int          NOT NULL,

  -- 45 chars covers IPv6, including v4-mapped form.
  `ip`              varchar(45)  DEFAULT NULL,
  `user_agent`      varchar(255) DEFAULT NULL,

  PRIMARY KEY (`activity_log_id`),
  KEY `idxAlOccurredAt` (`occurred_at`),
  KEY `idxAlActor` (`actor_user_id`, `occurred_at`),
  KEY `idxAlStatus` (`http_status`, `occurred_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
