# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BodhAssess — a psychometric assessment platform. Monorepo with two apps:

- `bodhassess-api-spring/` — REST API. Spring Boot 2.5.5, **Java 11**, Maven, MySQL 8, Redis. Base package `com.bodhpsychometric.bodhassess`.
- `bodhassess-app/` — SPA. React 19, Vite 7, TypeScript, React Router 7, TanStack Query 5, Tailwind CSS v4, shadcn/ui.

## Don't trust git history

Branch `sameer` was merged and then **fully reverted** (`c65cd0a7 Revert "Merge branch 'sameer'"`; the `9f509c44` merge deletes the remains). Commit messages therefore advertise subsystems that do NOT exist in the working tree: an `Assessment` entity, "entity management", data-studio/analytics workbooks, unified auth (`app_users`/`AuthController`), questionnaire versioning, assessment test flags. Trust the working tree, not `git log`. Merging `origin/sameer` or anything built on it will resurrect all of that as conflicts with the current architecture.

## Commands

Top-level orchestrator:

```bash
./run.sh dev    # MySQL+Redis in Docker, Spring API + Vite dev server on host (recommended)
./run.sh api    # MySQL+Redis in Docker + Spring API only
./run.sh app    # Vite dev server only
./run.sh prod   # mysql + redis + api in Docker (see note below — no web container)
./run.sh logs   # tail prod-stack logs
./run.sh stop   # stop everything
./run.sh reset  # DESTRUCTIVE: `down -v` — drops ALL volumes (MySQL data AND app-uploads)
```

- The root `.env` (copy from `.env.example`) is read by docker compose for interpolation, but `run.sh` never sources it — the host-run API and Vite only see variables you export. Spring falls back to `application*.properties` defaults; Vite reads `bodhassess-app/.env*`, not the repo root.
- `prod` is half-retired: the `web` service in `docker-compose.yml` is commented out, and the API port publishes on `127.0.0.1:4000` only. Public TLS for `api.bodh.biz` is a separate standalone compose stack in `nginx/` that joins the API's Docker network. `deploy.production.env` is orphaned config for an external deploy script — nothing in the repo reads it.
- Ignore the nested `bodhassess-api-spring/run.sh` (its dev mode starts MySQL **without Redis**, so heartbeat features fail) and `bodhassess-app/run.sh`; use the top-level one.

Ports: web 3000, API 4000 (`/api/v1` — hardcoded in each controller's `@RequestMapping`, not a context-path), MySQL 3306, Redis **6390** on the dev host (maps to 6379 in-container). Dev logs go to `.dev-logs/api.log` and `.dev-logs/web.log`.

Backend (from `bodhassess-api-spring/`):

```bash
./mvnw spring-boot:run        # profile defaults to dev
./mvnw clean package          # build jar
```

Frontend (from `bodhassess-app/`):

```bash
npm run dev
npm run build                 # tsc -b && vite build
npm run typecheck             # tsc -b --noEmit
npm run lint                  # eslint (flat config)
```

**`npm run format` is broken:** `.prettierrc` requires `@ianvs/prettier-plugin-sort-imports`, which is not installed anywhere, so any prettier run that loads the project config fails. (The installed `prettier-plugin-organize-imports` is unreferenced by config.)

**There are no tests in either project** (no `src/test` in the API, no test runner in the app). Verify changes with `npm run typecheck` / `./mvnw clean package` and by exercising the running app.

## Database schema is hand-managed

`spring.jpa.hibernate.ddl-auto=none`. The schema lives in `bodhassess-api-spring/docker/mysql-init/01-schema.sql`, which MySQL runs **only on first container init** (empty volume). Hibernate will not create or migrate anything. The established migration pattern for existing databases is *inside that same file*: idempotent `INFORMATION_SCHEMA` count checks + `PREPARE/EXECUTE` dynamic `ALTER` blocks (see the `practitioners.phone` / `portal_sessions.started_at` blocks). Adding a column means editing the `CREATE TABLE` **and** adding such a block (or `./run.sh reset` to wipe the volume).

## Backend architecture

Standard layering under `src/main/java/com/bodhpsychometric/bodhassess/`: `controller/` → `service/` → `repository/` (Spring Data JPA) with entities in `model/` and DTOs in `payload/` (there is no `dto/` package). All endpoints are under `/api/v1`.

Non-obvious things that will bite you:

- **"Assessment" has no entity.** `AssessmentsController`/`AssessmentsService`/`AssessmentDto` operate on `PortalSession` (`portal_sessions` table) — a respondent's assigned assessment instance with `answers`, `mqt_scores`, `demographics` as JSON columns.
- **The backend never computes scores.** `mqt_scores` (and the `score` summary string) are computed client-side in the portal take page and PUT to the API, which persists them without validation.
- **No JPA associations anywhere.** Entities reference each other by plain String UUID columns (`respondentId`, `instrumentId`, …); `created_at`/`updated_at` are DB-managed (`insertable=false, updatable=false`). IDs are **client-supplied**: the frontend generates the UUID and create endpoints reject a missing `id` (the server generates UUIDs only in `ItemsService`, `SessionsService`, `UploadService`). Portal-side PKs are `VARCHAR(64)`; `CHAR(36)` applies only to the IRT-side tables.
- **No `Question` entity.** Questions live as JSON inside `PublishedQuestionnaire.questions` (and separately as `items` rows on the IRT side). `MeasuredQuality` (`measured_qualities`) likewise stores its whole recursive MQT tree in one JSON column — scoring targets MQTs at any depth, never the MQ root.
- **Two "questionnaire" concepts:** `QuestionnairesService` → `PublishedQuestionnaire` (`published_questionnaires`), vs `QuestionnairesCatalogService` → the **`instruments`** table, accessed via **native SQL through `EntityManager`** — the `QuestionnaireCatalog` entity and its repository are dead code. "Instrument" and "questionnaire/catalog" are used interchangeably.
- **Questionnaire `name` is the de-facto business key.** The create-questionnaire flow dual-writes an `instruments` row and a `published_questionnaires` row with the same name; `QuestionnairesService.create` dedupes by name (`deleteOthersByName`); catalog delete cascades across `items` + `instruments` + `published_questionnaires` by name; and the portal take page looks the questionnaire up **by name**, so renaming a published questionnaire breaks every pending assessment referencing the old name.
- **The IRT/adaptive side is inert scaffolding.** `Session` (`sessions` table — a *different* entity from `PortalSession`) carries `theta_estimate`/`trust_score`; `items` has `irt_a/b/c`; `instruments` has `is_adaptive`/`scoring_config`. No code computes theta or selects items adaptively — `SessionsService` is read-only native SQL. The `tenants` and `users` tables have no entity at all; `users` is kept solely because the sessions list query JOINs it.
- **Naming:** entity-resource services/controllers are pluralized (`AssessmentsService`, `RespondentsService`, …); the non-resource ones are singular (`AdminService`, `HeartbeatService`, `LiveTrackingService`, `UploadService`, `ItemDisplayService`, `HealthService`).
- Group "allotments" are JSON fan-out: `RespondentGroup` stores `member_ids` and `assigned_instruments` as JSON arrays; assigning an instrument creates one `PortalSession` per member via `POST /api/v1/assessments/bulk`, with denormalized `group_id`/`group_name` on each session.
- JSON columns use `hibernate-types-52`: `@Type(type = "json")` / `"json-node"` with `@Column(columnDefinition = "json")`, typed as `JsonNode` or `Map<String,Object>`.
- Live tracking is pure polling — no WebSocket/SSE anywhere. The portal POSTs `/assessments/{id}/heartbeat` every 5s; `HeartbeatService` writes Redis keys `heartbeat:<sessionId>` with short TTLs (Redis's only use); the admin live-tracking page polls the read-only `/api/v1/admin/live-tracking/*` endpoints.
- Uses the deprecated `WebSecurityConfigurerAdapter` style — match it, don't modernize piecemeal.

### Auth model

Stateless JWT (`jjwt`), three user types: **ADMIN, PRACTITIONER, RESPONDENT** (`UserPrincipal.UserType`). Nobody has a password hash:

- Admin: single env-driven account (`APP_ADMIN_USERNAME`/`APP_ADMIN_PASSWORD`), no DB row.
- Practitioners and respondents log in with **email-or-phone + date of birth** — DOB is the credential (respondent DOB is an exact `YYYY-MM-DD` string match; practitioner DOB is a `DATE` and login also requires `status='Active'`).

`TokenAuthenticationFilter` accepts the token from the `Authorization: Bearer` header **or a `?token=` query param**. Public (permitAll) paths are listed in `config/SecurityConfig.java` — `/api/v1/questionnaires/**` and `/api/v1/questionnaires-catalog/**` are fully public, and so are **`POST /api/v1/upload` and the served `/uploads/**` files** (uploads are unauthenticated by design), plus health and the three login endpoints.

## Frontend architecture

Built on the Metronic 9 (KeenThemes) template — **`bodhassess-app/README.md` is the stock template readme and is wrong for this project** (mentions Next.js/Prisma; this is a Vite SPA). Ignore it.

- **The `@` alias resolves to the app root, not `src/`.** App code lives in `src/` and is imported as `@/src/...`; the top-level `components/`, `config/`, `hooks/`, `lib/`, `styles/` dirs are template/shared code imported as `@/components`, `@/lib`, etc. Much of the template is unused (39 layout variants in `components/layouts/` — only `layout-1` is used, via `src/components/app-shell.tsx` and `private-route.tsx`).
- **Most routed pages are static mockups.** Roughly 37 of the ~60 routes never touch the API — all of `clinical/`, `counselling/`, `industrial/`, `compliance/`, `experiments/`, `white-label/`, `settings/`, plus `analytics`, `survey`, `home`, `question-bank/calibration`, `question-bank/norms`, and `admin/roles` (hardcoded demo data — the *real* roles editor is `admin/permissions.tsx`). The wired surface is: dashboard, `assessments/*`, `question-bank/create-questionnaire` + `item-explorer`, `qualities`, `reports/*`, admin respondents/groups/practitioners/permissions/live-tracking, and `portal/*`. The `/select-vertical` switcher is cosmetic query-param navigation.
- **All routes are declared centrally in `src/router.tsx`**, each page lazy-loaded. Catch-all redirects to `/dashboard`.
- **`lib/api.ts` is the single API client** — per-resource objects (`respondentsApi`, `assessmentsApi`, `questionnairesApi`, …) over a shared `jsonFetch` that throws on non-2xx. Frontend `Assessment` = backend `PortalSession`. `lib/data-store.ts` re-exports these but **swallows errors** (lists return `[]`, mutations return `null` after `console.error`), and its `getSessions`/`getQuestionnaires`/`sessionsToReports` are deliberate empty stubs — report pages consuming them render empty by design.
- **Two auth surfaces, three tokens, all in `sessionStorage`** (never localStorage): practitioner, admin, and respondent tokens under separate keys from `lib/config.ts`; the client attaches whichever exists in practitioner → admin → respondent priority, and practitioner/admin logins clear each other's token. `PractitionerAuthProvider` (`lib/practitioner-auth.tsx`) is mounted once at the router Root above every route, but is inert for `/portal/*` (a `PUBLIC_PREFIXES` entry) — portal pages read sessionStorage directly and navigate with `window.location.href`.
- **Route access control is data-driven:** roles carry `url_paths` glob patterns (e.g. `/admin/*`); `canAccess()` (in `lib/practitioner-auth-utils.ts`) gates both `PrivateRoute` and the sidebar (filtering happens in `components/layouts/layout-1/components/sidebar-menu.tsx`; `config/bodhassess.config.tsx` only defines the menu data). Admin is synthesized as a practitioner with `url_paths: ['/*']`.
- **The portal take flow (`src/pages/portal/take.tsx`) is where assessments actually happen:** session id comes from `?id=` query param; the questionnaire is fetched **by name** (`instrumentFullName` fallback `instrument`); two gates precede questions (disclaimer, then a demographics form built from the admin-managed demographic-fields catalogue filtered by the instrument's `demographicFieldKeys`); heartbeats POST every 5s; the first answered question triggers a partial save that stamps `started_at`. On submit it computes all MQT scores **in the browser** and PUTs `{status: 'Completed', score, answers, mqtScores, completedAt}` — and if that final write fails, the error is swallowed and the user still lands on `/portal/complete`.
- Pages use Next.js-style shims from `src/lib/router-helpers.tsx` (`useRouter().push`, `usePathname`, `Link` with `href`) instead of raw react-router hooks. Leftover `'use client'` directives and SSR guards are inert — don't propagate them into new code, don't bother stripping them.
- Tailwind v4: no `tailwind.config.*`; the theme is CSS variables in `styles/globals.css`.
- **Env footgun:** `lib/config.ts` reads only `VITE_*` vars, and there are **five** committed env files. `.env` has dead `NEXT_PUBLIC_*` names plus `VITE_BASE_PATH=/dashboard`, but `.env.local` (dev) and `.env.production` (prod builds, which also set `VITE_API_URL=https://api.bodh.biz/api/v1`) both override the base path back to `/`; `.env.example` has an unresolved merge conflict. Trust `lib/config.ts` and Vite's env precedence, not any one file.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
