# BodhAssess — Postgres Schema

Full inventory of tables, columns, and relationships. This is what's in the
database after applying every migration in `bodhassess-api/migrations/` in
order.

Re-apply migrations (they're all idempotent):

```bash
for f in bodhassess-api/migrations/*.sql; do
  docker exec -i bodh-postgres psql -U bodh -d bodhassess < "$f"
done
```

---

## 1. Core / legacy tables (migration 001)

The first-draft schema from `001_init.sql`. Some tables (instruments, items,
sessions, responses) have been partially superseded by the newer
`published_questionnaires` + `portal_sessions` tables but remain in place.

| Table | Role | Used by current UI? |
|---|---|---|
| `tenants` | Multi-tenant stub | No (handlers are global) |
| `users` | Auth base | No (auth pending) |
| `practitioners` | Superseded by 005 schema | Yes (recreated in 005) |
| `respondents` | Superseded by 005 schema | Yes (recreated in 005) |
| `instruments` | Legacy instrument table (enum verticals / formats) | Read-only on some pages; canonical source is now `published_questionnaires` |
| `items` | Legacy item table | Read-only; canonical is `published_questionnaires.questions` JSONB |
| `sessions` | Legacy session table (rich IRT fields) | No; canonical is `portal_sessions` |
| `responses` | Per-item responses (IRT) | No |
| `reports` | Legacy report table | No; derived from `portal_sessions` today |
| `consent_records` | DPDP consent records | Not yet wired |
| `erasure_requests` | DPDP right-to-erase | Not yet wired |
| `audit_log` | Admin audit trail | Not yet wired |
| `norm_tables` | Instrument norms | Not yet wired |
| `proctoring_events` | Proctoring events | Not yet wired |
| `surveys` | BodhSurvey stub | Not yet wired |

---

## 2. Media + weights (migration 002)

Extended `instruments` and `items` with media + MQ-weighted scoring columns.
Still used by the legacy handlers but not the primary write path.

- `items.media_url`, `items.media_type`, `items.sub_domains` (JSONB)
- `instruments.scoring_config` (JSONB), `instruments.uses_weighted_scoring` (boolean)

---

## 3. Measured Qualities (migration 003)

### `measured_qualities`
```
id           VARCHAR(64)   PRIMARY KEY
name         VARCHAR(255)  NOT NULL UNIQUE
description  TEXT
mqts         JSONB         NOT NULL DEFAULT '[]'
created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```

`mqts` shape:
```json
[{ "id": "mqt-xxx", "name": "Extraversion" }, ...]
```

Indexes: `LOWER(name)`.
Trigger: `set_updated_at()` on update.

---

## 4. Verticals (migration 004)

### `verticals`
User-created verticals only (built-ins are implicit on the frontend).

```
id           VARCHAR(64)   PRIMARY KEY
code         VARCHAR(64)   NOT NULL UNIQUE   -- e.g. SPORTS_PSYCH
name         VARCHAR(255)  NOT NULL          -- e.g. "Sports Psychology"
description  TEXT
created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```

---

## 5. Simplified users + groups (migration 005)

### `respondents`
```
id               VARCHAR(64)   PRIMARY KEY      -- e.g. R-001
name             VARCHAR(255)  NOT NULL
email            VARCHAR(255)  NOT NULL UNIQUE
dob              VARCHAR(16)                     -- YYYY-MM-DD; doubles as portal password
consent          VARCHAR(32)   NOT NULL DEFAULT 'Pending'
sessions_count   INT           NOT NULL DEFAULT 0
last_assessment  VARCHAR(255)
created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```
Index: `LOWER(email)`.

### `practitioners`
```
id          VARCHAR(64)   PRIMARY KEY           -- e.g. P-001
name        VARCHAR(255)  NOT NULL
email       VARCHAR(255)  NOT NULL UNIQUE
role        VARCHAR(128)  NOT NULL DEFAULT 'Practitioner'
verticals   JSONB         NOT NULL DEFAULT '[]'  -- e.g. ["Clinical", "Counselling"]
status      VARCHAR(32)   NOT NULL DEFAULT 'Active'
last_login  VARCHAR(32)
created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```

### `respondent_groups`
Self-referencing tree of respondent groups.
```
id                    VARCHAR(64)   PRIMARY KEY             -- grp-xxxxxx
name                  VARCHAR(255)  NOT NULL
description           TEXT
parent_id             VARCHAR(64)   REFERENCES respondent_groups(id) ON DELETE CASCADE
member_ids            JSONB         NOT NULL DEFAULT '[]'    -- array of respondents.id
assigned_instruments  JSONB         NOT NULL DEFAULT '[]'    -- audit log of what's been assigned
created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```
Index: `parent_id`.

---

## 6. Portal sessions (migration 006)

Simplified session table matching the frontend shape. One row per
(respondent, instrument) delivery.

### `portal_sessions`
```
id                   VARCHAR(64)   PRIMARY KEY             -- SESS-XXXXXX
respondent_id        VARCHAR(64)   NOT NULL
respondent_name      VARCHAR(255)  NOT NULL
respondent_email     VARCHAR(255)
instrument           VARCHAR(255)  NOT NULL                 -- short name
instrument_full_name VARCHAR(255)                           -- full name as shown in UI
vertical             VARCHAR(64)                            -- Clinical / Industrial / …
language             VARCHAR(64)   NOT NULL DEFAULT 'English'
status               VARCHAR(32)   NOT NULL DEFAULT 'Active'  -- Active | Completed | Pending Review
score                VARCHAR(255)                            -- human-readable summary
answers              JSONB                                   -- { questionId: optionIndex }
mqt_scores           JSONB                                   -- { mqtName: total }
group_id             VARCHAR(64)                             -- optional: if created via Groups bulk-assign
group_name           VARCHAR(255)
consent_id           VARCHAR(64)                             -- free text + consent PDF URL
proctoring           BOOLEAN       NOT NULL DEFAULT FALSE
invitation_sent      BOOLEAN       NOT NULL DEFAULT FALSE
created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
completed_at         TIMESTAMPTZ
```
Indexes: `respondent_id`, `status`, `LOWER(vertical)`.

---

## 7. Published questionnaires (migration 007)

Full user-authored questionnaire, stored as JSONB for fidelity.

### `published_questionnaires`
```
id           VARCHAR(64)   PRIMARY KEY             -- qn-xxxxxx
name         VARCHAR(255)  NOT NULL UNIQUE
short_name   VARCHAR(64)
vertical     VARCHAR(64)
category     VARCHAR(255)
description  TEXT
duration     INT                                    -- minutes
tier         VARCHAR(16)                            -- T1..T5
languages    JSONB         NOT NULL DEFAULT '[]'    -- ["en", "hi"]
mqs          JSONB         NOT NULL DEFAULT '[]'
questions    JSONB         NOT NULL DEFAULT '[]'
is_demo      BOOLEAN       NOT NULL DEFAULT FALSE
created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```
Indexes: `LOWER(name)`, `LOWER(vertical)`.

`mqs` shape:
```json
[{ "id": "m", "name": "Depression", "mqts": [{ "id": "t", "name": "Severity" }] }]
```

`questions` shape:
```json
[{
  "id": "q1",
  "stem": "Little interest in things",
  "format": "LIKERT",
  "media_url": "",
  "media_type": "none",
  "clinical_risk_flag": false,
  "risk_flag_rule": "",
  "options": [
    { "text": "Not at all", "scores": [{ "mqt_id": "t", "score": 0 }] }
  ]
}]
```

---

## 8. Item display state (migration 008)

Per-item overrides + soft-deletes for the Item Explorer.

### `item_display_state`
```
item_id     VARCHAR(128)  PRIMARY KEY
override    JSONB                                   -- { stem, format, status, options, riskFlag, subDomain }
deleted     BOOLEAN       NOT NULL DEFAULT FALSE
updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
```
Partial index: `WHERE deleted = TRUE`.

---

## 9. Portal auth sessions (migration 009)

Server-side respondent session tokens.

### `portal_auth_sessions`
```
token          UUID          PRIMARY KEY DEFAULT uuid_generate_v4()
respondent_id  VARCHAR(64)   NOT NULL REFERENCES respondents(id) ON DELETE CASCADE
created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
expires_at     TIMESTAMPTZ   NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
```
Index: `respondent_id`. No trigger needed; tokens are immutable once issued.

---

## 10. Shared utilities

### `set_updated_at()` trigger function
Used across many tables to bump `updated_at` on every UPDATE.
```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Extensions
- `uuid-ossp` for `uuid_generate_v4()` (used by `portal_auth_sessions.token` and others).

---

## 11. Entity relationships

```
respondents ─────┬───< portal_sessions
                 │
                 └───< portal_auth_sessions
                 │
                 └─ referenced by respondent_groups.member_ids (JSONB, not FK)

respondent_groups ─── self-referencing parent_id (ON DELETE CASCADE)

published_questionnaires ─ referenced by portal_sessions.instrument_full_name
                           (string match, no FK)

measured_qualities ─ referenced by published_questionnaires.mqs (JSONB, not FK)

verticals ─ referenced by published_questionnaires.vertical (string match)
```

Most cross-table references are by JSONB/string rather than SQL FK. This keeps
the schema flexible but means cleanup is the application's responsibility —
e.g. deleting a respondent does NOT automatically clear their `portal_sessions`
(that's intentional, so completed-sessions history survives).

---

## 12. Manual inspection helpers

```bash
# List tables
docker exec bodh-postgres psql -U bodh -d bodhassess -c "\dt"

# Inspect a schema
docker exec bodh-postgres psql -U bodh -d bodhassess -c "\d portal_sessions"

# Count rows by table
docker exec bodh-postgres psql -U bodh -d bodhassess -c "
  SELECT 'respondents' AS table, COUNT(*) FROM respondents
  UNION ALL SELECT 'practitioners', COUNT(*) FROM practitioners
  UNION ALL SELECT 'respondent_groups', COUNT(*) FROM respondent_groups
  UNION ALL SELECT 'portal_sessions', COUNT(*) FROM portal_sessions
  UNION ALL SELECT 'published_questionnaires', COUNT(*) FROM published_questionnaires
  UNION ALL SELECT 'measured_qualities', COUNT(*) FROM measured_qualities
  UNION ALL SELECT 'verticals', COUNT(*) FROM verticals
  UNION ALL SELECT 'item_display_state', COUNT(*) FROM item_display_state
  UNION ALL SELECT 'portal_auth_sessions', COUNT(*) FROM portal_auth_sessions;"
```
