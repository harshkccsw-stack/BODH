# BodhAssess Architecture

System diagram, tech stack, and data-flow notes. Read alongside
[BODH_SRS.md](BODH_SRS.md) (functional) and [API.md](API.md) (protocol).

---

## 1. Topology

```
┌──────────────────────┐      ┌────────────────────────┐
│  Next.js 16 Frontend │      │  Go 1.23 REST API      │
│  localhost:3000      │──────│  localhost:8080        │
│                      │ HTTP │  /api/v1/*             │
│  - App Router        │      │                        │
│  - Tailwind v4       │      │  - chi router          │
│  - Metronic Layout-1 │      │  - pgxpool             │
│  - Radix UI          │      │  - godotenv            │
└──────────┬───────────┘      └──────────┬─────────────┘
           │                             │
           │                             │ pgx (TCP, port 5432)
           │                             │
           │                  ┌──────────▼─────────────┐
           │                  │  PostgreSQL 16         │
           │                  │  bodh-postgres         │
           │                  │  (Docker, bridge net)  │
           │                  └────────────────────────┘
           │
           │  POST /upload  (multipart)
           │
           ▼
┌──────────────────────┐
│  Disk:               │
│  ./uploads/*.pdf     │
│  ./uploads/*.jpg     │
│  served at           │
│  /uploads/*          │
└──────────────────────┘
```

Reserved but unused today: Redis (rate limiting / queues) and MinIO (object
storage — uploads currently sit on local disk).

---

## 2. Tech stack

### 2.1 Frontend

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Components disabled on interactive pages via `'use client'`) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + Metronic v9 theme (demo1.css + scrollable.css imported in root layout) |
| Components | Metronic UI components + Radix UI primitives (select, dropdown-menu, sheet, tooltip, …) |
| Icons | Lucide React |
| Data | Typed client in `lib/api.ts` — no state-management library, each page owns its own `useState` + `useEffect(fetch)` |
| Charts | Recharts / Apex (bundled — not heavily used yet) |

Routing groups:

- `app/(app)/*` — authenticated admin UI, wrapped by Metronic Layout-1 (sidebar, header, mega-menu)
- `app/portal/*` — respondent-facing pages (standalone layout, no sidebar)
- `app/select-vertical/*` — kept for backwards compatibility; the root `/` now redirects to `/dashboard` (not `/select-vertical`)

### 2.2 Backend

| Concern | Choice |
|---|---|
| Language | Go 1.23 |
| HTTP | `go-chi/chi/v5` + chi middleware (Logger, Recoverer, RequestID, RealIP, CORS) |
| DB driver | `jackc/pgx/v5/pgxpool` (pool: 5 min / 20 max) |
| Config | `joho/godotenv` loading `bodhassess-api/.env` |
| File uploads | `multipart/form-data`, 50 MB hard cap, saved as UUID-named files under `./uploads`, served via `http.FileServer` |
| Concurrency | One pool shared across handlers; each request uses a per-request `context.WithTimeout(5s)` |

### 2.3 Data plane

- **PostgreSQL 16** (Docker) — one database: `bodhassess`, one user: `bodh`.
  Schema evolves via numbered `.sql` files in `bodhassess-api/migrations/`,
  all idempotent (`CREATE TABLE IF NOT EXISTS`).
- **Redis 7** — reserved, not wired.
- **MinIO** — reserved, not wired (uploads go to local disk instead).

---

## 3. End-to-end data flow (respondent journey)

```
1. Admin creates respondent → POST /respondents
   ↓ Postgres: respondents row inserted
2. Admin creates questionnaire → POST /questionnaires (upsert)
   ↓ Postgres: published_questionnaires JSONB row with mqs + questions
3. Admin creates session (or group bulk-assign) → POST /portal-sessions[/bulk]
   ↓ Postgres: portal_sessions row, status=Active
4. Admin shares respondent ID + DOB with the respondent.
5. Respondent logs in → POST /respondents/login
   ↓ Postgres: portal_auth_sessions row inserted with UUID token
   ← API returns { token, respondent }
   → Browser stores ONLY the token in sessionStorage
6. Respondent hits /portal/assessments
   → GET /respondents/me (Bearer <token>)
   ← { id, name, email }
   → GET /portal-sessions?respondentId=<id>
   ← list of active / completed sessions
7. Respondent clicks Launch on a pending session
   → GET /portal-sessions/:id (own session guard on respondentId)
   → GET /questionnaires/by-name?name=<instrument name>
   ← full questionnaire (MQs + questions)
   UI renders Q/A flow with media, progress bar
8. Respondent submits
   → PUT /portal-sessions/:id with { status: Completed, answers, mqtScores }
   ↓ Postgres: portal_sessions row updated, completed_at set
9. Admin views /reports
   → GET /portal-sessions — completed rows surface as report entries
   Actions: View (MQT totals modal), Download JSON (full record)
```

---

## 4. Authentication model

### 4.1 Respondent portal (implemented)

- Login with Login ID + DOB → server checks `respondents.id` +
  `respondents.dob` → on match, inserts a row in `portal_auth_sessions`
  with a new UUID token + `expires_at = NOW() + INTERVAL '7 days'`.
- Client stores the token in `sessionStorage['bodhassess.auth.token']`.
- Every portal page calls `GET /respondents/me` with
  `Authorization: Bearer <token>`; server joins
  `portal_auth_sessions` → `respondents` to resolve the user.
- Logout invalidates server-side (`POST /respondents/logout` deletes the token row).
- If the token is expired or invalid, `/me` returns 401; the frontend redirects to `/portal/login`.

### 4.2 Practitioner / admin (pending)

- Currently unauthenticated — admin pages are open. Assumed-behind-VPN during
  local development.
- Planned: Keycloak SSO. `.env` already has placeholders
  (`KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`).

---

## 5. File uploads

- **Endpoint:** `POST /api/v1/upload` (multipart, field `file`).
- **Size caps:** global 50 MB; per-type cap of 2 MB for `.pdf` (enforced both
  client- and server-side on the Create Session consent flow).
- **Accepted extensions:** `.jpg .jpeg .png .gif .webp` (image), `.mp4 .webm
  .mov` (video), `.mp3 .wav .ogg` (audio), `.pdf` (document).
- **Storage:** `./uploads/<uuid>.<ext>` on local disk.
- **Serving:** `/uploads/*` via `http.FileServer`. In production this should
  move to MinIO or DigitalOcean Spaces (see Deployment below).
- **Record:** the returned URL is what the frontend embeds into
  questionnaires (media_url on options/questions) or into session records
  (consent PDF → merged into `consentId`).

---

## 6. Migration strategy

Migrations in `bodhassess-api/migrations/`:

| # | File | What it adds |
|---|---|---|
| 001 | init.sql | Core schema: tenants, users, practitioners, respondents, instruments, items, sessions, responses, reports, consent_records, erasure_requests, audit_log, norm_tables, proctoring_events, surveys |
| 002 | media_and_weights.sql | Adds media_url/media_type/sub_domains to items; scoring_config + uses_weighted_scoring to instruments |
| 003 | measured_qualities.sql | `measured_qualities` table + `set_updated_at()` trigger function |
| 004 | verticals.sql | Custom verticals |
| 005 | users_and_groups.sql | Simplified `respondents`, `practitioners`, `respondent_groups` (new shape used by the current UI) |
| 006 | portal_sessions.sql | Simpler session shape for the portal flow |
| 007 | published_questionnaires.sql | JSONB-first questionnaire storage |
| 008 | item_display_state.sql | Item Explorer override/delete flags |
| 009 | portal_auth.sql | Respondent session tokens |

Each is idempotent and safe to re-run. Run them in order with:

```bash
for f in bodhassess-api/migrations/*.sql; do
  docker exec -i bodh-postgres psql -U bodh -d bodhassess < "$f"
done
```

---

## 7. Deployment targets (planned)

### 7.1 DigitalOcean App Platform (recommended)

- Managed Postgres cluster (instead of Docker container).
- Web (Next.js) and API (Go) as separate Apps behind the App Platform load balancer.
- DO Spaces for uploads (S3-compatible); replace `./uploads` FileServer + local
  disk with AWS SDK v2 against `s3.<region>.digitaloceanspaces.com`.
- `ALLOWED_ORIGINS` env var on the Go API must include the production Next.js
  domain.

### 7.2 Single Droplet (cheaper, less managed)

- Docker Compose runs all four: Postgres, Redis, MinIO, Go API, Next.js app.
- Caddy in front for TLS termination. See the deployment guide message in
  chat history for exact Caddyfile.

---

## 8. Known gaps / next steps

1. **Admin auth.** Keycloak or a JWT-based admin login; currently open.
2. **Multi-tenancy.** `tenants` table exists but every handler is global. Need
   tenant scoping and RLS policies before going multi-org.
3. **Proctoring + adaptive scoring.** Schema fields exist; no runtime logic.
4. **Notifications.** Email / WhatsApp / SMS — `.env` has placeholders for
   Gupshup and Twilio; handlers unimplemented.
5. **BodhLens / BodhSurvey.** These sidebar entries link to scaffolded pages
   only — the analytics + survey engines themselves aren't built.
6. **Observability.** No structured logging, metrics, or tracing. The chi
   Logger middleware dumps to stdout.
7. **Tests.** Zero test coverage across both apps — entirely manual.
