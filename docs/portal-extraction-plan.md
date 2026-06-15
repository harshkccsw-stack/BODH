# Plan — Extract the respondent assessment flow into a standalone `bodhassess-portal` app

> Goal: move the respondent "assessment-giving" experience out of the all-in-one
> `bodhassess-app` and into a small, dedicated **React + TypeScript (Vite)** app —
> `bodhassess-portal` — with the leanest possible routing, pages, and components.
>
> Flow: **login → assessments (`/portal/assessment`) → terms & conditions →
> demographics → general instructions → assessment**.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Repo layout | **Monorepo sibling** — new `bodhassess-portal/` next to `bodhassess-app/` |
| Registration | **Included** — port `/register` token-link + self-signup into the portal |
| Code sharing | **Self-contained copy** — slim `api.ts`, trimmed UI primitives, no shared package |
| Serving | **Separate subdomain** — e.g. `portal.bodh.biz` (own origin → backend CORS required) |
| Backend | **Unchanged & shared** — the single `bodhassess-api-spring` serves both apps; **not** split. Only a config-only CORS allowlist addition (no code/schema work). |

---

## 1. What we're extracting (current state)

The entire respondent flow already lives in `bodhassess-app/src/pages/portal/*` and
talks to the Spring backend through a tiny slice of `lib/api.ts`. It is **not** wired
into the practitioner `PrivateRoute`/`AppShell` chrome, which makes it cleanly separable.

Current files & routes:

- `src/pages/portal/login.tsx` → `/portal/login`
- `src/pages/portal/assessments.tsx` → `/portal/assessments` (the list)
- `src/pages/portal/take.tsx` (739 lines) → `/portal/take?id=` (T&C → instructions → demographics → questions → submit)
- `src/pages/portal/complete.tsx` → `/portal/complete?id=`
- `src/pages/portal/preview.tsx` → `/preview/:versionId` (public, no-login questionnaire walkthrough — an authoring/test tool, **not** part of the respondent flow)
- `src/pages/register*.tsx` + `entity-registration.tsx` → registration entry points

### API surface the flow actually uses (the only endpoints the new app needs)

| Method | Path | Auth | Used for |
|---|---|---|---|
| POST | `/auth/login` | public | login (`{email, dob}` → `{token, user}`) |
| GET | `/respondents/me` | Bearer | current respondent profile |
| POST | `/respondents/logout` | Bearer | logout (server no-op; clears token client-side) |
| GET | `/assessments?respondentId=` | Bearer | list allotted sessions |
| GET | `/assessments/{id}` | Bearer | load a session |
| PUT | `/assessments/{id}` | Bearer | partial save (answers/demographics) + final submit |
| POST | `/assessments/{id}/heartbeat` | Bearer | live-tracking ping (every 5s) |
| GET | `/questionnaires/{id}` | public | resolve pinned version content |
| GET | `/questionnaires/by-name?name=` | public | legacy fallback resolution |
| GET | `/demographic-fields?active=true` | public | demographics catalog |
| POST | `/respondents` | public | self-signup *(registration)* |
| GET/POST | `/public/tokens/{token}` `/resolve` `/consume` `/register` `/login` | public | token-link registration *(registration)* |

**Auth model (confirmed):** a single unified JWT from `POST /auth/login` works for
**every** endpoint above. The token embeds `userType=RESPONDENT`, 7-day expiry, sent as
`Authorization: Bearer <jwt>`. There is **no** separate respondent token type. Stored
in `localStorage` under `bodhassess.auth.token` (`config.authStorageKey`).
Because the portal is on a **separate origin**, its `localStorage` is isolated — reusing
the same key is safe (no collision with the admin app).

---

## 2. Optimized architecture

### 2.1 Routing — 4 routes, no per-step routes

The biggest optimization: the take flow's gates (T&C, demographics, instructions,
questions, completion) are **internal steps of one route driven by a state machine** —
not separate pages. This collapses today's `/portal/take`, `/portal/complete` and the
implied per-gate screens into a single `/portal/assessment/:sessionId` route.

```
/                              → redirect: authed ? /portal/assessment : /portal/login
/portal/login                  → login page
/portal/register               → token-link + self-signup (registration; ?token=… deep-link)
/portal/assessment             → list of allotted assessments   ← the route you specified
/portal/assessment/:sessionId  → the take flow (T&C → demographics → instructions → questions → done)
```

- Completion is the **terminal state** of the take flow (no `/complete` route).
- A single `<RequireAuth>` guard wraps the two `/portal/assessment*` routes (replaces
  the auth-check-and-redirect boilerplate copy-pasted into every page today).
- `/preview/:versionId` is intentionally **left in the admin app** (it's an authoring
  test tool, not respondent-facing). Can be added later if desired.
- On the dedicated subdomain the `/portal` segment is technically redundant; we keep it
  to match your spec and existing admin references ("Portal URL: /portal/login").

### 2.2 File tree (lean, self-contained)

```
bodhassess-portal/
├── index.html
├── package.json                 # minimal deps (see §2.4)
├── vite.config.ts               # @ alias → src; base from VITE_BASE_PATH
├── tsconfig.json / .app.json / .node.json
├── postcss.config.cjs           # @tailwindcss/postcss
├── Dockerfile                   # multi-stage: node build → nginx serve
├── docker/nginx.conf            # SPA try_files
├── .env / .env.example / .env.production
└── src/
    ├── main.tsx                 # createRoot + RouterProvider + AuthProvider
    ├── router.tsx               # the 4 routes above
    ├── styles.css               # Tailwind v4 + design tokens (trimmed globals.css)
    ├── config.ts                # apiBase, authStorageKey, appName, basePath
    ├── lib/
    │   ├── api.ts               # SLIM client — only the endpoints in §1 + their types
    │   ├── auth.tsx             # AuthProvider + useAuth + <RequireAuth>
    │   ├── utils.ts             # cn()
    │   ├── helpers.ts           # 4 date helpers (formatDDMMYYYY, ddmmyyyyToIso, autoFormatDdmmyyyy, formatDDMMYYYYTime)
    │   └── scoring.ts           # walkMqts + scoreAssessment() — extracted pure logic
    ├── components/
    │   ├── ui/
    │   │   ├── button.tsx        # trimmed (drop asChild/Slot → no radix dep)
    │   │   └── card.tsx          # trimmed to Card/CardContent/CardHeader/CardTitle
    │   ├── brand-header.tsx      # consolidates the header repeated 4× in take.tsx
    │   ├── step-shell.tsx        # Card boilerplate + footer Cancel/Continue buttons
    │   ├── media.tsx             # consolidates Media (duplicated in take + preview)
    │   ├── error-card.tsx        # reusable error/alert card
    │   └── screen-loader.tsx     # minimal spinner (no logo/toAbsoluteUrl dependency)
    ├── hooks/
    │   ├── use-heartbeat.ts      # 5s live-tracking ping
    │   └── use-first-answer-ping.ts  # one-shot started_at stamp
    └── pages/
        ├── login.tsx
        ├── register.tsx          # token flow + self-signup
        ├── assessments.tsx       # list at /portal/assessment
        └── take/
            ├── take.tsx          # orchestrator: load + step state machine
            ├── terms-step.tsx
            ├── demographics-step.tsx
            ├── instructions-step.tsx
            ├── question-runner.tsx
            └── complete-step.tsx # terminal step (not a route)
```

### 2.3 The take flow as a state machine (core of the optimization)

After `take.tsx` loads `session` + `questionnaire`, build the ordered list of
**applicable** steps once, then advance through them with a single `step` state:

```ts
type Step = 'terms' | 'demographics' | 'instructions' | 'questions' | 'done';

// Order per your spec: T&C → demographics → instructions → questions
const steps: Step[] = [
  hasDisclaimer            ? 'terms'        : null,   // disclaimer non-empty
  needsDemographics        ? 'demographics' : null,   // session.demographics empty
  hasInstructions          ? 'instructions' : null,   // showInstructions && instructions non-empty
  'questions',
].filter(Boolean);
```

This replaces today's four sequential `if (gate) return <…>` blocks. Each step is a
small focused component; shared chrome (`BrandHeader`, `StepShell`, `Media`, `ErrorCard`)
is factored out so there is zero header/card duplication.

**Two behavior changes baked in:**
1. **Gate reorder** — demographics now comes *before* instructions (today it's the
   reverse) to match your requested flow.
2. **Resume fix** — initialize `answers` from `session.answers` on load. Today the
   "Resume Assessment" button restores the session but **not** the previously entered
   answers (state starts `{}`); the new app fixes this.

Loading sequence (unchanged logic): `me(token)` → `get(sessionId)` → ownership check
(`session.respondentId === me.id`) → reject if `Completed` → resolve questionnaire by
`questionnaireVersionId` (immutable pin) then fall back to `by-name`.

Scoring (`scoring.ts`, extracted verbatim from `take.tsx` `submit()`): depth-first
`walkMqts` builds id→name/totals maps, accumulates `question_scores` + selected
`option.scores`, emits `mqtScores` keyed by MQT id plus a `name=score, …` summary
string; submit does `PUT /assessments/{id}` with `status:'Completed'`.

### 2.4 Minimal dependency set

Runtime: `react`, `react-dom`, `react-router`, `class-variance-authority`, `clsx`,
`tailwind-merge`, `lucide-react`.
Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `@tailwindcss/vite`,
`@tailwindcss/postcss`, `@types/react`, `@types/react-dom`, `@types/node` (+ eslint/prettier optional).

**Dropped vs the main app** (not needed by the respondent flow): `@tanstack/react-query`
(pages use raw `fetch`), `next-themes` (portal is light-only), `sonner`, `radix-ui`
(only after trimming `Button`'s `asChild`/`Slot`), and the entire data-studio /
analytics / admin / charts dependency cluster.

---

## 3. Backend — shared & unchanged (one config-only exception)

The backend is **not** separated. The single `bodhassess-api-spring` service keeps
serving both the admin app and the new portal. **No Java code, controllers, DTOs, or
schema change** — the API contract in §1 is already complete and is consumed as-is.

The only change is environment configuration, forced by the separate-subdomain choice:

1. **CORS allowlist (required, config only).** Add the portal origin to
   `APP_CORS_ALLOWED_ORIGINS` (currently `https://admin.bodh.biz,http://localhost:3000,http://localhost:5173`):
   add `https://portal.bodh.biz` (prod) and `http://localhost:3001` (portal dev port).
   `allowCredentials=true` means origins must be explicit — no wildcard. This is an env
   var in `docker-compose.yml`, **not** a code change. Without it, cross-origin requests
   from the portal fail preflight at cutover.

> Deferred / optional (not part of this extraction): the existing `PUT /assessments/{id}`
> and `/heartbeat` endpoints don't verify `principal.id == session.respondentId`. That
> ownership gap predates this work and can be hardened later; it is **not** required to
> ship the portal and involves no separation of the backend.

---

## 4. Deployment

- **New `Dockerfile`** (copy `bodhassess-app/Dockerfile` pattern): multi-stage
  node:20-alpine build → nginx:1.27-alpine serve, with build ARGs
  `VITE_API_URL=https://api.bodh.biz/api/v1`, `VITE_BASE_PATH=/`,
  `VITE_APP_NAME=BodhAssess`, `VITE_AUTH_STORAGE_KEY=bodhassess.auth.token`.
- **nginx:** add a `portal.bodh.biz` server block (HTTP→HTTPS + TLS cert) proxying to
  the new container; SPA `try_files $uri /index.html`.
  *File:* `nginx/conf.d/default.conf` (today it only proxies `api.bodh.biz`).
- **docker-compose:** add a `bodhassess-portal` service (build context `./bodhassess-portal`)
  on the `bodh` network; add the portal origin to the api service's CORS env.
- **Admin app link retargeting (important coupling).** The admin app generates the
  respondent-facing links/QahR codes that registration depends on. With registration on
  the portal subdomain, these must point at `https://portal.bodh.biz`:
  - `admin/respondents.tsx` — the displayed "Portal URL" string.
  - `assessments/invite-or-copy.tsx` + `publicTokensApi.qrUrl(token, base)` — pass the
    portal origin as `base`.
  - Add `VITE_PORTAL_URL` to the admin app config and use it everywhere a `/portal/*`
    or `/register` absolute link is produced.

---

## 5. Decommission the portal from `bodhassess-app`

Once the portal app is live and verified:

- Delete routes from `src/router.tsx`: `/portal/login`, `/portal/assessments`,
  `/portal/take`, `/portal/complete` (and their lazy imports). Keep or remove
  `/preview/:versionId` per the preview decision.
- Delete `src/pages/portal/*` (and `register*`/`entity-registration` **only if**
  registration fully moves to the portal — keep admin token *issuance* in the admin app).
- Replace in-app `window.location.href = '/portal/...'` redirects: the admin login
  (`src/pages/login.tsx`) and any respondent redirect should send respondents to the
  portal origin (`VITE_PORTAL_URL`). The admin login then serves practitioners/admins only.
- Remove `/portal` from `PUBLIC_PREFIXES` in `lib/practitioner-auth-utils.ts` once no
  `/portal` route remains in the admin app.

> Tip: do the decommission **last**, after the portal app passes end-to-end, so you can
> run both in parallel during cutover and roll back by simply re-pointing DNS/links.

---

## 6. Phased execution

| Phase | Work | Output |
|---|---|---|
| 0 | Scaffold `bodhassess-portal` (vite, tsconfig, tailwind v4, postcss, deps, `styles.css` trimmed from `globals.css`) | App boots blank |
| 1 | Foundation: `config.ts`, slim `api.ts`, `utils.ts`, `helpers.ts`, `scoring.ts`, trimmed `Button`/`Card`, `screen-loader` | Compiles, typechecks |
| 2 | Auth: `auth.tsx` (`AuthProvider`/`useAuth`/`RequireAuth`) + `login.tsx` | Login works against API |
| 3 | `assessments.tsx` list at `/portal/assessment` | List renders allotted sessions |
| 4 | Take flow: `take.tsx` step machine + 5 step components + `BrandHeader`/`StepShell`/`Media`/`ErrorCard` + `use-heartbeat`/`use-first-answer-ping`; gate reorder + resume-answers fix; completion as terminal step | Full take + submit works |
| 5 | Registration: `register.tsx` (token flow + self-signup) | `?token=` deep-link lands in take flow |
| 6 | `router.tsx` (4 routes + `/` redirect) wired with `RequireAuth` | Navigation complete |
| 7 | Backend: CORS origin (required) + ownership check (recommended) | Cross-origin calls succeed |
| 8 | Deploy: Dockerfile, nginx server block, docker-compose service, admin link retargeting (`VITE_PORTAL_URL`) | `portal.bodh.biz` serves the app |
| 9 | Decommission `/portal/*` from `bodhassess-app`; update redirects/links | Single source of truth |
| 10 | Verify: `tsc -b` + `vite build`; manual e2e (login → list → T&C → demographics → instructions → questions → submit → done); registration deep-link | Green |

---

## 7. Open items / risks to track

- **CORS env must be set before cutover** — preflight from the new origin fails otherwise.
- **Token expiry (7d), no refresh** — a respondent who leaves a tab open past expiry must
  re-login. Acceptable for now; note for later.
- **`?token=` query-param auth fallback** exists server-side (leaks tokens to logs) — the
  portal should use the `Authorization` header only.
- **Registration coupling** — admin-side link/QR generation must target the portal origin
  (Phase 4 / §4). Token *issuance* and entity approval stay in the admin app.
- **Preview** (`/preview/:versionId`) deliberately excluded from the portal; revisit if
  respondents need a no-login demo.
