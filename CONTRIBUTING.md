# Contributing to BodhAssess

Quick-start for a new collaborator joining the project.

---

## 1. Prerequisites

- **Docker** + Docker Compose
- **Go 1.23+**
- **Node 20+** and **npm** (for Next.js)
- That's it — no database tooling needed on the host; everything runs in Docker.

---

## 2. First-time setup

```bash
# 1. Clone and enter the repo
git clone <repo-url> BODH
cd BODH

# 2. Bring up Postgres / Redis / MinIO
cd bodhassess-api
docker compose up -d

# 3. Apply all migrations in order (idempotent)
for f in migrations/*.sql; do
  docker exec -i bodh-postgres psql -U bodh -d bodhassess < "$f"
done

# 4. Build + run the Go API
go build -o server ./cmd/server
./server &

# 5. In another terminal, run the Next.js frontend
cd ../bodhassess-app
npm install
npm run dev
```

Visit http://localhost:3000 and you're in.

---

## 3. Repository layout

```
BODH/
├── bodhassess-api/              # Go backend
│   ├── cmd/server/main.go       # HTTP server entry point, route wiring
│   ├── internal/
│   │   ├── config/config.go     # loads .env
│   │   ├── database/postgres.go # pgxpool init
│   │   ├── handlers/            # one file per entity
│   │   │   ├── health.go
│   │   │   ├── respondents.go
│   │   │   ├── practitioners.go
│   │   │   ├── groups.go
│   │   │   ├── qualities.go
│   │   │   ├── verticals.go
│   │   │   ├── questionnaires.go
│   │   │   ├── portal_sessions.go
│   │   │   ├── item_display.go
│   │   │   ├── instruments.go   # legacy
│   │   │   ├── items.go         # legacy
│   │   │   ├── sessions.go      # legacy
│   │   │   └── upload.go
│   │   └── models/models.go
│   ├── migrations/              # numbered .sql files
│   ├── uploads/                 # local-disk file storage
│   ├── .env                     # DB credentials, app port
│   ├── docker-compose.yml
│   ├── go.mod / go.sum
│   └── server                   # built binary (gitignored)
│
├── bodhassess-app/              # Next.js frontend
│   ├── app/
│   │   ├── (app)/               # admin UI (wrapped by Metronic Layout-1)
│   │   │   ├── dashboard/
│   │   │   ├── admin/
│   │   │   │   ├── respondents/
│   │   │   │   ├── practitioners/
│   │   │   │   ├── groups/
│   │   │   │   └── roles/
│   │   │   ├── sessions/
│   │   │   ├── instruments/
│   │   │   ├── question-bank/
│   │   │   ├── qualities/
│   │   │   └── reports/
│   │   ├── portal/              # respondent-facing (no admin chrome)
│   │   │   ├── login/
│   │   │   ├── assessments/
│   │   │   ├── take/
│   │   │   └── complete/
│   │   ├── layout.tsx           # root layout (imports Metronic CSS)
│   │   └── page.tsx             # redirects / → /dashboard
│   ├── components/ui/           # Radix + Metronic primitives
│   ├── components/layouts/      # Layout-1 sidebar / header / mega-menu
│   ├── config/
│   │   ├── bodhassess.config.tsx   # sidebar + mega menu structure
│   │   └── types.ts
│   ├── lib/
│   │   ├── api.ts               # typed REST client — add endpoints here first
│   │   └── data-store.ts        # thin async wrappers over api.ts
│   ├── styles/                  # Tailwind + Metronic demo1.css
│   └── package.json
│
├── README.md                    # Quick start
├── BODH_SRS.md                  # SRS (this is current!)
├── ARCHITECTURE.md              # System design
├── API.md                       # REST endpoint reference
├── DATABASE.md                  # Postgres schema
└── CONTRIBUTING.md              # this file
```

---

## 4. Adding a new entity (walkthrough)

Let's say you want to add a "Cohort" entity.

### 4.1 Migration

Create `bodhassess-api/migrations/010_cohorts.sql`:

```sql
CREATE TABLE IF NOT EXISTS cohorts (
    id          VARCHAR(64)   PRIMARY KEY,
    name        VARCHAR(255)  NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS cohorts_updated_at ON cohorts;
CREATE TRIGGER cohorts_updated_at BEFORE UPDATE ON cohorts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

Apply:
```bash
docker exec -i bodh-postgres psql -U bodh -d bodhassess < migrations/010_cohorts.sql
```

### 4.2 Go handler

Copy `internal/handlers/practitioners.go` as a template. Rename types,
adjust columns. Each handler file exports a struct with `List` /
`Get` / `Create` / `Update` / `Delete` methods.

### 4.3 Register routes

In `cmd/server/main.go`, add:
```go
cohortsH := handlers.NewCohortsHandler(db)
// ...
r.Route("/cohorts", func(r chi.Router) {
    r.Get("/", cohortsH.List)
    r.Post("/", cohortsH.Create)
    r.Get("/{id}", cohortsH.Get)
    r.Put("/{id}", cohortsH.Update)
    r.Delete("/{id}", cohortsH.Delete)
})
```

### 4.4 Rebuild + restart

```bash
cd bodhassess-api
lsof -ti:8080 | xargs -r kill
go build -o server ./cmd/server && ./server &
```

### 4.5 Typed frontend client

In `bodhassess-app/lib/api.ts`:
```ts
export interface Cohort { id: string; name: string; description?: string; }
export const cohortsApi = {
  list: () => jsonFetch<Cohort[]>('/cohorts'),
  create: (c: Cohort) => jsonFetch<Cohort>('/cohorts', { method: 'POST', body: JSON.stringify(c) }),
  // ... etc
};
```

### 4.6 New page

Create `app/(app)/admin/cohorts/page.tsx`. Use
`app/(app)/admin/practitioners/page.tsx` as the template. Load on mount:

```tsx
const [cohorts, setCohorts] = useState<Cohort[]>([]);
useEffect(() => {
  cohortsApi.list().then(setCohorts).catch(() => setCohorts([]));
}, []);
```

### 4.7 Sidebar link

Edit `config/bodhassess.config.tsx` and add the route under an appropriate section.

---

## 5. Code conventions

### 5.1 TypeScript / React

- Every page that needs data is a **Client Component** (`'use client'` at top).
- **Fetch on mount** with `useEffect(() => { api.call().then(setState); }, [])`.
- No localStorage for canonical data. `sessionStorage['bodhassess.auth.token']`
  is the only allowed browser-side persistence (portal auth token only).
- **One state hook per logical slice** — don't reach for Zustand / Redux
  until two pages genuinely need to share state.
- Imports ordered: React → external libs → `@/lib/*` → `@/components/*` → local.

### 5.2 Go

- **One handler file per entity.** Each file defines a `<Name>Handler` struct
  with methods `List / Get / Create / Update / Delete`.
- **Context timeouts.** Every handler method starts with
  `ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second); defer cancel()`.
- **Idempotent migrations.** `CREATE TABLE IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`
  before `CREATE TRIGGER`.
- **ON CONFLICT DO UPDATE** for upserts — any `POST /{entity}` that takes an id
  should upsert rather than error on duplicate, so re-running the frontend
  Publish flow is safe.
- **Empty-string nullification.** When a field is optional, use
  `NULLIF($n, '')` in SQL to write NULL rather than blank strings.

### 5.3 SQL

- Use `TIMESTAMPTZ` for timestamps (never `TIMESTAMP` without TZ).
- Use `JSONB` for flexible nested data (like `mqs`, `questions`, `member_ids`).
- Prefer string primary keys (`VARCHAR(64)`) for entities the frontend
  creates (respondents, practitioners, groups, questionnaires, sessions).
  Keep `UUID` for server-issued tokens (`portal_auth_sessions.token`).

---

## 6. Running + debugging

### Kill a stuck server
```bash
lsof -ti:8080 | xargs -r kill
```

### Tail server logs
```bash
./server > /tmp/bodhassess-api.log 2>&1 &
tail -f /tmp/bodhassess-api.log
```

### Check DB health
```bash
curl -s http://localhost:8080/api/v1/health | jq
```

### Inspect a table
```bash
docker exec bodh-postgres psql -U bodh -d bodhassess -c "SELECT * FROM respondents LIMIT 10;"
```

### Reset everything (destructive — deletes all data)
```bash
cd bodhassess-api
docker compose down -v
docker compose up -d
for f in migrations/*.sql; do
  docker exec -i bodh-postgres psql -U bodh -d bodhassess < "$f"
done
```

---

## 7. Common pitfalls

1. **Password mismatch between .env and docker-compose.yml.**
   `docker-compose.yml::POSTGRES_PASSWORD` only applies on first volume
   creation. Changing it later doesn't rotate the stored password. Either
   match `.env` to the existing DB password, or `ALTER USER bodh WITH PASSWORD …`
   to rotate.

2. **Stale frontend chunks in Next.js dev.** After big refactors, do a hard
   reload (`Ctrl+Shift+R`) or delete `.next/` and restart `npm run dev`.

3. **CORS errors in browser.** Add your origin to the `AllowedOrigins` slice
   in `cmd/server/main.go` and restart the API.

4. **Enum types in legacy schema.** The `instruments` / `items` / `sessions`
   tables use Postgres enum types (vertical_type, item_format, etc.). Adding
   a new vertical like "SPORTS_PSYCH" to those tables requires `ALTER TYPE …
   ADD VALUE`. The newer `published_questionnaires` / `portal_sessions` tables
   use plain VARCHAR so this isn't an issue there.

5. **Uploads aren't backed up.** `./uploads` is on local disk and gitignored.
   Plan for MinIO / DO Spaces in production (see [ARCHITECTURE.md](ARCHITECTURE.md)).

---

## 8. Git

The project uses a `harsh` branch for active development with `master` as the
long-lived main. Keep PRs focused, one feature per branch. No PR template
today — prose commit messages are fine if they explain the "why."

---

## 9. Where to ask questions

- **What a page does / should do:** [BODH_SRS.md](BODH_SRS.md)
- **How the system is wired:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **What an API endpoint returns:** [API.md](API.md)
- **What's in a table:** [DATABASE.md](DATABASE.md)
- **How to add a feature:** this file, section 4
- **Anything else:** ping the team.
