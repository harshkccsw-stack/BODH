# BodhAssess — Psychometric Assessment Platform

A full-stack, multi-tenant psychometric platform covering clinical, industrial,
counselling, and experimental assessments. Frontend in **Next.js 16 + Tailwind
v4**; backend in **Go + Chi + pgx** on **PostgreSQL 16**.

This README is the entry point. For deeper reading, see:

- [BODH_SRS.md](BODH_SRS.md) — Software Requirements Specification (current)
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, tech stack, data flow
- [API.md](API.md) — REST API reference
- [DATABASE.md](DATABASE.md) — Postgres schema
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to run, develop, extend

---

## Repo layout

```
BODH/
├── bodhassess-app/       # Next.js 16 frontend (App Router)
├── bodhassess-api/       # Go 1.23 REST API
│   ├── cmd/server/       # main.go (entry point, route wiring)
│   ├── internal/
│   │   ├── config/       # env loading
│   │   ├── database/     # pgxpool init
│   │   ├── handlers/     # one file per entity (respondents, sessions, …)
│   │   └── models/       # shared types
│   ├── migrations/       # numbered .sql files, applied in order
│   ├── docker-compose.yml
│   └── .env              # local config (DB password, port, etc.)
├── index.html            # legacy marketing site (pre-Next.js)
├── assessment-engine.html
└── ER_Diagram.svg        # high-level entity diagram
```

---

## Quick start

### 1. Start Postgres + Redis + MinIO

```bash
cd bodhassess-api
docker compose up -d
```

Three containers come up: `bodh-postgres` (5432), `bodh-redis` (6379),
`bodh-minio` (9002/9003).

### 2. Apply migrations

```bash
for f in migrations/*.sql; do
  docker exec -i bodh-postgres psql -U bodh -d bodhassess < "$f"
done
```

Each migration is idempotent (`CREATE TABLE IF NOT EXISTS …`). Safe to re-run.

### 3. Boot the Go API

```bash
cd bodhassess-api
go build -o server ./cmd/server && ./server
```

API is now live on **http://localhost:8080**. Hit
`http://localhost:8080/api/v1/health` — you want `{"database": true}`.

### 4. Boot the Next.js frontend

```bash
cd bodhassess-app
npm install          # first time only
npm run dev
```

App on **http://localhost:3000**. Log in paths:

- Admin side: dashboard at `/dashboard`
- Respondent portal: `/portal/login` (use a Login ID + DOB created via
  Admin → Respondents)

---

## What's built

| Area | Status | Notes |
|---|---|---|
| Admin: Respondents | ✅ Postgres | CRUD + portal-login credentials |
| Admin: Practitioners | ✅ Postgres | CRUD + role + vertical access |
| Admin: Groups | ✅ Postgres | Tree of nested groups, bulk-assign instruments |
| Question Bank: Measured Qualities (MQ/MQT) | ✅ Postgres | Hierarchical catalog, referenced by questionnaires |
| Question Bank: Create Questionnaire | ✅ Postgres | Step-wizard: metadata → questions (with media + MQT scoring) → publish |
| Question Bank: Item Explorer | ✅ Postgres | List all items, edit (override), soft-delete |
| Sessions: list / create / edit / reset / delete | ✅ Postgres | `portal_sessions` table; supports per-group bulk create |
| Instrument Library (Clinical / Industrial / Counselling + main) | ✅ Postgres | Displays user-published + seed |
| Verticals (built-in + custom) | ✅ Postgres | Searchable + custom-create dropdown |
| Reports (main + vertical pages) | ✅ Postgres | Derived from Completed sessions; View + Download JSON |
| Portal: login, assessments list, take, complete | ✅ Postgres | Token-based auth via `/respondents/login` + `/me` |
| Consent PDF upload | ✅ Postgres | ≤ 2 MB PDFs, saved to `./uploads`, URL persisted on session |

---

## Environment

`.env` lives in `bodhassess-api/` and is loaded by `godotenv` at startup.

```
APP_ENV=development
APP_PORT=8080
DB_HOST=localhost
DB_PORT=5432
DB_USER=bodh
DB_PASSWORD=bodh_dev_2026
DB_NAME=bodhassess
DB_SSLMODE=disable
REDIS_URL=localhost:6379
JWT_SECRET=bodh-dev-secret-change-in-production
```

**Important:** `DB_PASSWORD` must match `POSTGRES_PASSWORD` in
`docker-compose.yml`. Since Postgres initialises its password on first volume
creation, changes to `docker-compose.yml` after the volume exists are ignored —
you have to `ALTER USER bodh WITH PASSWORD '…'` or recreate the volume
(`docker compose down -v`).

The frontend reads `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:8080/api/v1`).

---

## Tech stack

**Frontend**
- Next.js 16 (App Router) + React 19
- TypeScript + Tailwind CSS v4 + Metronic v9 components (Layout-1)
- Radix UI primitives (select, dialog, dropdown-menu, etc.)
- Lucide React icons

**Backend**
- Go 1.23
- go-chi/chi/v5 router + middleware
- jackc/pgx/v5 (Postgres driver + pool)
- godotenv for config
- multipart upload handler (saves to `./uploads`, serves at `/uploads/*`)

**Data / infra**
- PostgreSQL 16 (Docker)
- Redis 7 (Docker; not yet used for anything — reserved for rate limiting / queues)
- MinIO (Docker; reserved for object storage, currently everything is on local disk via `/uploads`)

See [ARCHITECTURE.md](ARCHITECTURE.md) for data flow diagrams and service
boundaries.

---

## Development workflow

1. **Pick an area.** Each frontend page is self-contained under
   `bodhassess-app/app/(app)/<feature>/page.tsx`.
2. **All data goes through the API.** The frontend never uses `localStorage` for
   canonical data — `lib/api.ts` is the single client.
3. **Migration-first for schema changes.** Add a numbered `.sql` file under
   `bodhassess-api/migrations/`; make it idempotent.
4. **One handler per entity.** See `internal/handlers/respondents.go` as the
   template (List / Get / Create / Update / Delete).
5. **Wire routes.** Register in `cmd/server/main.go` inside the existing
   `r.Route("/api/v1", …)` block.
6. **Restart + rebuild** the Go server after changes: `go build -o server ./cmd/server && ./server`.
7. **Frontend hot-reloads** via Next.js dev server.

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, naming, and testing.

---

## Ports used

| Port | Service |
|---|---|
| 3000 | Next.js frontend |
| 8080 | Go API |
| 5432 | Postgres |
| 6379 | Redis |
| 9002 | MinIO (S3 API) |
| 9003 | MinIO console |
