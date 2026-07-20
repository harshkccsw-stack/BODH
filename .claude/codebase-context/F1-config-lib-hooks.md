I'll start by exploring the repo structure and reading the scoped files in batches.
Now let me read the repo-root config files and the deep lib files in parallel.
Now the env files and remaining root config files.
Now the core lib files. Let me read the smaller ones and start api.ts.
Now the critical file — api.ts (49KB). Let me read it fully, plus the referenced router-helpers.
api.ts fully read. Now the hooks, styles, and the referenced router-helpers. Let me inventory those dirs first.
Let me read all hooks, styles, and the key config files (types, general, bodhassess, layout-1) plus router-helpers.
Now the key config files and styles.
Now the remaining styles files and layout-1 config.
Now layout-1 config (used by the app) plus a check of which configs are actually imported.
bodhassess.config is the live menu. Let me confirm which layout renders it and inventory the remaining layout-N configs quickly.
All layout-N configs are stock template (zero bodh content). Layout1 + bodhassess.config is the live menu. Now the public/ inventory.
Let me quickly resolve the `media/copy` anomaly and confirm the media dir list.
I have complete context. Here is the structured file-by-file catalog.

---

# bodhassess-app — Reader Report (root files, lib/, hooks/, styles/, config/, public/)

## 1. REPO-ROOT FILES

**package.json** — name `bodhassess-app`, v0.1.0, private, ESM (`"type":"module"`). Scripts: `dev`=vite; `build`=`tsc -b && vite build`; `build:production`=`... vite build --mode production`; `preview`; `typecheck`=`tsc -b --noEmit`; `lint`=eslint; `format`=prettier. NOT Next.js despite README/env naming — pure Vite+React 19. Key deps: react 19.2, react-router 7.11 (react-router, NOT react-router-dom), @tanstack/react-query 5.85 (+devtools), @tanstack/react-table, react-hook-form 7.68 + zod 4 + @hookform/resolvers, @dnd-kit/*, @glideapps/glide-data-grid 6 (Data Studio grid), @headless-tree, apexcharts/react-apexcharts + recharts (two chart libs), leaflet/react-leaflet, xlsx 0.18 (bulk upload parsing), fflate, marked 18, motion 12, radix-ui, lucide-react + @remixicon/react, sonner (toasts), next-themes, i18next/react-i18next. Dev: tailwindcss 4.1 (@tailwindcss/vite + @tailwindcss/postcss), typescript 5.9, vite 7.1, eslint 9. `overrides`: minimatch ^10.2.1, ajv >=8.18.0. NOTE: prettier config references `@ianvs/prettier-plugin-sort-imports` but package.json lists `prettier-plugin-organize-imports` — mismatch.

**vite.config.ts** — `defineConfig(({mode}) => ...)`. `loadEnv(mode, __dirname, '')` (empty prefix = loads ALL vars incl NEXT_PUBLIC_, but only used here). `base: env.VITE_BASE_PATH ?? '/'`. Plugins: react(), tailwindcss(). Alias `@` → repo root (`__dirname`). Dev+preview server `port:3000, host:true`. Build: `outDir:'dist'`, `sourcemap: mode!=='production'`, `chunkSizeWarningLimit:2000`.

**tsconfig.json** — solution file, refs tsconfig.app.json + tsconfig.node.json.
**tsconfig.app.json** — target ES2022, moduleResolution bundler, jsx react-jsx, strict true, `noUnusedLocals/Parameters:false`, `noFallthroughCasesInSwitch:true`, types `["vite/client","node"]`, `baseUrl:"."`, paths `@/* → ./*`. include: `src,app,components,config,hooks,lib` (note: `app` dir listed but doesn't exist).
**tsconfig.node.json** — for vite.config.ts only, lib ES2023, types `["node"]`.

**eslint.config.mjs** — flat config: js.recommended + tseslint.recommended + prettier. Ignores dist/node_modules/.next. react-hooks rules-of-hooks=error, exhaustive-deps=warn. Disables `@typescript-eslint/no-explicit-any` and `no-unused-vars` (both `off`).

**postcss.config.cjs** — single plugin `@tailwindcss/postcss`.
**components.json** — shadcn/ui schema; style default, rsc true, tsx true, tailwind css=`styles/globals.css`, baseColor zinc, cssVariables true; aliases components=@/components, utils=@/lib/utils, ui=@/components/ui, lib=@/lib, hooks=@/hooks; iconLibrary lucide.
**index.html** — `<title>BodhAssess — Psychometric Assessment Platform</title>`, Inter font from Google Fonts, favicon.ico, mount `#root`, entry `/src/main.tsx`.
**env.d.ts** — declares `process.env` as `Record<string,string|undefined>` (shim).
**documentation.html** — 2 lines; stock template redirect to `docs.keenthemes.com/metronic-nextjs`. Not real docs.
**README.md** — stock Metronic 9 / ReUI Next.js template readme (mentions Prisma, Next.js 15, PostgreSQL — none actually used here). Not bodh-specific.

**Dockerfile** — 2-stage. Stage1 node:20-alpine, `npm ci`, `npm run build`. Build ARGs w/ defaults: `VITE_API_URL=http://localhost:4000/api/v1` (LEGACY v1/port 4000), `VITE_BASE_PATH=/`, `VITE_APP_NAME=BodhAssess`, `VITE_AUTH_STORAGE_KEY=bodhassess.auth.token`, `VITE_PRACTITIONER_AUTH_STORAGE_KEY=bodhassess.practitioner.token`. Stage2 nginx:1.27-alpine, copies dist → /usr/share/nginx/html + docker/nginx.conf, `EXPOSE 3000`.
**.dockerignore** — node_modules, dist, .vite, .idea, .vscode, .git, *.log, *.md, .env.local, .run-logs.
**docker/nginx.conf** — listen 3000; SPA fallback `try_files $uri $uri/ /index.html`; hash-asset caching 30d immutable; index.html no-cache; gzip on. No API proxy (frontend calls API by absolute URL).
**run.sh** — bash helper; installs deps if missing; modes dev|build|preview|typecheck|lint. Dev on :3000.
**.prettierrc** — printWidth 80, singleQuote, trailingComma all, semi; importOrder plugin config listing `@/config`,`@/lib`,`@/hooks`,`@/services`,`@/components`,`@/app`,`@/styles` groups; plugins tailwindcss + `@ianvs/prettier-plugin-sort-imports`.
**.prettierignore** — node_modules, .next, dist, public, build, prisma.
**.nvmrc** — `v24.7.0`.  **.npmrc** — `legacy-peer-deps=true`.

### ENV FILES (critical — see ENV MATRIX below)
- **.env** — uses `NEXT_PUBLIC_*` (DEAD — app reads only VITE_*): NEXT_PUBLIC_API_URL=`https://localhost:8081/api/v2`, NEXT_PUBLIC_APP_NAME=BodhAssess, NEXT_PUBLIC_AUTH_STORAGE_KEY=bodhassess.auth.token. Only live var: `VITE_BASE_PATH=/dashboard`.
- **.env.example** — CONTAINS UNRESOLVED GIT MERGE CONFLICT (`<<<<<<< HEAD` / `=======` / `>>>>>>> 0d049bbc...`): HEAD side has `VITE_API_URL=https://api.bodh.biz/api/v1` + VITE_APP_NAME/VITE_AUTH_STORAGE_KEY; other side has NEXT_PUBLIC_* equivalents. Also VITE_BASE_PATH=/dashboard, VITE_PORTAL_URL=https://portal.bodh.biz.
- **.env.local** (dev, gitignored via dockerignore) — all VITE_* (LIVE): `VITE_API_URL=http://localhost:8081/api/v2` (NEW v2 backend), VITE_APP_NAME=BodhAssess, VITE_AUTH_STORAGE_KEY=bodhassess.auth.token, `VITE_BASE_PATH=/`, `VITE_PORTAL_URL=http://localhost:3002`.
- **.env.production** — VITE_* (LIVE): `VITE_API_URL=https://api.bodh.biz/api/v1` (LEGACY v1!), VITE_BASE_PATH=/, VITE_APP_NAME=BodhAssess, VITE_AUTH_STORAGE_KEY=bodhassess.auth.token, VITE_PORTAL_URL=https://portal.bodh.biz.
- **.env.staging** — uses `NEXT_PUBLIC_*` only (ALL DEAD): NEXT_PUBLIC_API_URL=`https://api.bodh.biz` (no /api path), NEXT_PUBLIC_APP_NAME, NEXT_PUBLIC_AUTH_STORAGE_KEY; commented NEXT_PUBLIC_BASE_PATH=/bodh. No VITE_* at all → staging build would fall back to all config.ts defaults.

## 2. lib/ (core — deep)

**lib/config.ts** — central env reader. `read(key, fallback)` pulls `import.meta.env[key]`, returns fallback if empty. Exports `config` object (as const) + type `AppConfig`:
- `apiBase` = VITE_API_URL, default `http://localhost:4000/api/v1` (legacy).
- `appName` = VITE_APP_NAME, default `BodhAssess`.
- `authStorageKey` = VITE_AUTH_STORAGE_KEY, default `bodhassess.auth.token` (respondent/portal).
- `practitionerAuthStorageKey` = VITE_PRACTITIONER_AUTH_STORAGE_KEY, default `bodhassess.practitioner.token` (dashboard — super admin + practitioner unified).
- `adminAuthStorageKey` = VITE_ADMIN_AUTH_STORAGE_KEY, default `bodhassess.admin.token` (declared but never set in any env; largely unused now that auth is unified).
- `basePath` = VITE_BASE_PATH, default `''`.
- `portalUrl` = VITE_PORTAL_URL, default `http://localhost:3002` (standalone respondent portal `bodhassess-portal`; prod https://portal.bodh.biz).

**lib/api.ts** (1292 lines) — THE single typed fetch client. `export const API_BASE = config.apiBase`.
- `getActiveToken()`: window-guarded; returns `localStorage[practitionerAuthStorageKey] || localStorage[authStorageKey] || null` (dashboard token wins over respondent token).
- `jsonFetch<T>(path, init?)`: builds headers `{'Content-Type':'application/json', ...init.headers}`; if no `Authorization` header supplied, auto-attaches `Bearer <getActiveToken()>`. Calls `fetch(\`${API_BASE}${path}\`, {...init, headers})`. On `!res.ok` reads body text and throws `Error("[API <status>] <path>: <text>")`. 204 → null; non-JSON content-type → null; else `res.json()`. No retries, no react-query here (raw fetch; react-query used at page layer, out of scope).
- Health: `getHealth()` → GET `/health` (HealthStatus{status,service,version,database,time}).
- Interfaces + endpoint groups (all relative to API_BASE):
  - **respondentsApi**: list `/respondents`, get/update(PUT)/delete `/respondents/:id`, create POST `/respondents`, `bulk` POST `/respondents/bulk` (body `{respondents:rows}` → BulkRespondentResult), `login` POST `/respondents/login` ({identifier,dob}→LoginResponse{token,respondent}), `me` GET `/respondents/me` (explicit Bearer), `logout` POST `/respondents/logout`.
  - **entityRegistrationsApi**: list/get/create/update(PATCH)/delete `/entity-registrations[/:id]`.
  - **authApi** (UNIFIED dashboard identity): `login` POST `/auth/login` ({email,dob}→AuthLoginResponse{token,user:AuthUser}), `me` GET `/auth/me` (Bearer), `logout` POST `/auth/logout`. AuthUser carries `isSuperAdmin, roles[], url_paths[]` (RBAC drives sidebar/route gating; super admin `url_paths:['/*']`).
  - **practitionersApi**: CRUD `/practitioners[/:id]` (auth now via authApi, these are management-only).
  - **rolesApi**: CRUD `/roles[/:id]` (Role{url_paths[]}).
  - **groupsApi**: CRUD `/groups[/:id]` (Group has parentId, memberIds[], assignedInstruments[]).
  - **qualitiesApi**: CRUD `/qualities[/:id]` (MQ/MQT tree — measured qualities). Helper `readMqtScores()` handles new `{name,score}` and legacy `number` shapes.
  - **demographicFieldsApi**: list `/demographic-fields[?active=true]`, upsert POST, delete `/:id`.
  - **itemDisplayApi**: list `/item-display`, upsertOverride POST `/item-display/override`, markDeleted POST `/item-display/:id/delete`, clear DELETE `/item-display/:id`.
  - **questionnairesApi** (frontend-shape PublishedQuestionnaire): list `/questionnaires[?vertical=]`, listSummaries `/questionnaires/summaries`, get `/questionnaires/:id`, getByName `/questionnaires/by-name?name=`, upsert POST, delete.
  - `getQuestionnairesCatalog()` → GET `/questionnaires-catalog[?vertical=]` (tolerates array or `{data}`).
  - **assessmentsApi** (per-respondent SESSIONS, aliased `portalSessionsApi`): list `/assessments[?respondentId=]`, listSummaries `/assessments/summaries`, listGroups `/assessments/groups`, listByAssessment `/assessments/by-assessment?assessmentId=`, get/update(PUT)/delete `/assessments/:id`, create POST, bulk POST `/assessments/bulk` ({assessments}), reset POST `/assessments/:id/reset`, heartbeat POST `/assessments/:id/heartbeat` ({currentIndex,totalQuestions}).
  - **liveTrackingApi**: `/admin/live-tracking/assessments`, `/admin/live-tracking/assessments/sessions?instrument=&groupId=`.
  - **verticalsApi**: list/create `/verticals`, delete `/verticals/:id`.
  - **assessmentRecordsApi** (first-class Assessment on `/assessment-records`): list, listByQuestionnaire `/assessment-records/by-questionnaire/:qid`, listByEntity `/assessment-records/by-entity/:eid`, get/create/update(PUT)/delete, updateStatus PATCH `/:id/status` ({status: ACTIVE|CLOSED|PAUSED|TEST}), audit GET `/:id/audit`.
  - **assessmentAllotmentsApi**: aggregate GET `/assessment-records/:id/allotments`; entities POST/PATCH/DELETE `/:id/allotments/entities[/:eid]` (cap); groups `/:id/allotments/groups[/:gid]`; respondents `/:id/allotments/respondents[/:rid]`.
  - **assessmentTokensApi** (admin): issue POST `/assessment-tokens`, listForAssessment `/assessment-tokens/by-assessment/:id`, revoke DELETE `/assessment-tokens/:token`.
  - **publicTokensApi** (anonymous, /register page): resolve GET `/public/tokens/:token`, consume POST `/public/tokens/:token/consume`, register POST `/public/tokens/:token/register`, registrationCheck POST `/public/tokens/registration-check`, loginExisting POST `/public/tokens/:token/login`; `qrUrl(token, base)` returns absolute string `\`${API_BASE}/public/tokens/:token/qr?base=<enc>\`` (used as img src, not fetched).
  - **publicEntityApi** (anonymous member self-reg): resolve GET `/public/entities/:id`, registerMember POST `/public/entities/:id/register` (throws [API 409] if exists).
  - **auditApi**: recent `/audit`, byTarget `/audit/:type/:id`.
  - **questionnaireRecordsApi** (git-style version parents): list/get/create/update/delete `/questionnaire-records[/:id]`, setCurrentVersion PATCH `/:id/current-version`, audit `/:id/audit`.
  - **questionnaireVersionsApi**: list `/questionnaire-records/:pid/versions[?committedOnly=true]`, get version, createDraft POST `/versions/drafts`, editDraft PATCH, commit POST `/:vid/commit` ({bump:MAJOR|MINOR}), discardDraft DELETE.
  - **datasetsApi** (Data Grid): sessions GET `/datasets/sessions[?entityId=&questionnaireId=]`, patchSessionCells PATCH `/datasets/sessions/cells`.
  - **dataStudioApi** (workbooks/sheets/dashboards/widgets): `/workbooks[/:id]`, `/workbooks/:id/shares[/:userId]`, `/workbooks/:id/sheets`, `/sheets/:id[/data]`, `/sheets/:id/validate-expr`, `/sheets/:id/columns[/:colKey]`, `/workbooks/:id/dashboards`, `/dashboards/:id`, `/dashboards/:id/widgets`, `/widgets/:id`.
  - **analyticsApi**: query POST `/analytics/query` → DatasetResponse.
- Token handling note: dashboard login stores via setDashboardToken → practitionerAuthStorageKey; portal stores under authStorageKey. All errors bubble as thrown Errors (callers/react-query handle).

**lib/data-store.ts** — thin wrapper over api.ts (comment: "no localStorage fallback"). Re-exports types under UI names (StoredRespondent, StoredPractitioner, Group, MQ, MQT, Vertical, Role). Defines legacy interfaces `StoredSession`, `StoredQuestionnaire`, `GeneratedReport`. `BUILT_IN_VERTICALS` const: v-clinical(CLINICAL), v-industrial(INDUSTRIAL), v-counselling(COUNSELLING), v-experiments(EXPERIMENTS). CRUD wrappers (getRespondents/createRespondent/... ) each try/catch→console.error, return `[]`/`null`/`false` on error. `getVerticals()` merges BUILT_IN + custom (dedup by code). `getAllMembersRecursive(groupId, groups)` walks group tree. `countByVertical()`. STUBS returning empty (not yet migrated off localStorage): `getSessions()`→[], `getQuestionnaires()`→[], `sessionsToReports()`→[], `getSessionById()`→null, `STORAGE_KEYS={}`. `downloadJson(filename,data)` blob-download helper.

**lib/practitioner-auth.tsx** (`'use client'`) — dashboard auth React context. Imports router-helpers from `@/src/lib/router-helpers` and authApi + utils. `PractitionerAuthProvider`: on mount resolves `getDashboardToken()` → `authApi.me(token)` → sets `{status:'authenticated', me: authUserToPractitionerMe(user)}`; on failure clears token + unauthenticated. Redirect effect: unauth on private route → `router.replace('/login')`; authenticated on /login → replace `/dashboard`; public paths untouched. `logout()` clears token, calls authApi.logout best-effort, redirects login. `login(token,user)` sets token+state (soft nav from /login page). Context value adds `canAccess(pathname)` = authenticated ? canAccess(p, me.url_paths) : isPublicPath(p). Hook `usePractitionerAuth()`.

**lib/practitioner-auth-utils.ts** — pure helpers (no JSX for Fast Refresh). `TOKEN_KEY = config.practitionerAuthStorageKey`. `LOGIN_PATH='/login'`. `PUBLIC_PREFIXES = ['/login','/portal','/register','/select-vertical','/entity']`. `isPublicPath()`. `pathMatchesPattern()` supports `/*`|`*` (all), `/prefix/*`, exact. `canAccess(pathname, urlPaths)`. Token getters/setters (window-guarded) on TOKEN_KEY. `authUserToPractitionerMe(user)` maps AuthUser→PractitionerMe (super admin → name 'Administrator', roles ['SUPER_ADMIN'], url_paths ['/*']).

**lib/instrument-overrides.ts** — client-side localStorage override store for instrument library edits. KEY=`bodhassess.instrumentOverrides`. `loadOverrides()`, `saveOverride(key,patch)`, `applyOverride(inst, overrides)` (keyed by shortName||name), `applyOverrideById(inst, overrides)`. Interface QuestionnaireOverride (name/shortName/category/duration/items/tier/languages/normStatus/description/ageRange/norms/vertical).

**lib/helpers.ts** — utilities. `throttle`, `debounce`, `uid()` (Date.now+random, non-crypto), `getInitials`, `toAbsoluteUrl(pathname)` (prepends config.basePath if set/≠'/'), `timeAgo`, `formatDate`/`formatDateTime` (en-GB locale), `formatDDMMYYYY`, `ddmmyyyyToIso` (DD/MM/YYYY→ISO yyyy-MM-dd, validates calendar), `isoToDdmmyyyy`, `autoFormatDdmmyyyy` (input mask), `formatDDMMYYYYTime`. DOB wire format is ISO yyyy-MM-dd.

**lib/dom.ts** — `getHeight(element)` (bounding rect + margins).
**lib/utils.ts** — `cn(...inputs)` = twMerge(clsx(...)) (shadcn standard).

**lib/data-studio/formula.ts** — client-side formula evaluator mirroring backend `ExpressionService.java` grammar EXACTLY. CLIENT_FUNCS whitelist: IF,AND,OR,NOT,MIN,MAX,ROUND,ABS,SQRT,LOG. Full lexer (numbers, strings, `[bracketed column keys]`, idents allowing `:`, two-char + single-char operators) + recursive-descent Evaluator (or/and/not/comparison/additive/multiplicative/unary/primary/call). SERVER-classified functions parse but throw "computed on the server". `evaluateFormula(expr, lookup)` returns null on any error (blank cell, never crashes grid). Only row-local math client-side; population/cohort math is SERVER (Phase 2).

**src/lib/router-helpers.tsx** (outside lib/, imported by practitioner-auth as `@/src/lib/router-helpers`) — thin react-router 7 wrappers giving a Next.js-like API. `Link` (default+named, translates `href` incl `{pathname,query}` → react-router `to`). `usePathname()`, `useSearchParams()` (returns URLSearchParams), `useParams<T>()`, `useRouter()` (push/replace/back/forward/refresh=window.reload/prefetch-noop), `redirect(to)` (window.location.replace + throw), `notFound()`.

## 3. hooks/ (8)
- **use-body-class.ts** `useBodyClass(className)` — adds/removes space-split classes on document.body.
- **use-copy-to-clipboard.ts** `useCopyToClipboard({timeout=2000,onCopy})` → {isCopied, copyToClipboard}.
- **use-menu.ts** `useMenu(pathname)` → isActive/hasActiveChild/isItemActive/getCurrentItem/getBreadcrumb/getChildren; recursive menu-tree matching over `MenuItem` from @/config/types. Drives active-state/breadcrumbs for the sidebar.
- **use-mobile.tsx** `useIsMobile()` — MOBILE_BREAKPOINT=1024 (mobile if <1024).
- **use-mounted.ts** `useMounted()`.
- **use-scroll-position.ts** `useScrollPosition({targetRef})`.
- **use-slider-input.ts** `useSliderInput({minValue,maxValue,initialValue})` — dual-thumb slider + input sync.
- **use-viewport.ts** `useViewport()` → [innerHeight, innerWidth].
All stock template hooks, no bodh specifics.

## 4. styles/ (8) — Tailwind v4 CSS-first
- **globals.css** — entry. `@import 'tailwindcss'` + tw-animate-css. Dark variant `&:is(.dark *)`. CSS-variable theme: light `:root` + `.dark`. **Brand color = indigo** (`--primary: indigo-500` light / `indigo-400` dark; accent indigo) — this is the bodh customization vs stock zinc/neutral. chart-1..5 = blue/green/yellow/red/purple. `--radius:0.5rem`. Custom scrollbar (5px), smooth scroll, `container`/`container-fluid` utilities (max-w breakpoint-xl). Imports config.metronic.css, demos/demo1.css, components/scrollable.css.
- **config.metronic.css** — imports the 5 component css (image-input, apexcharts, leaflet, rating, scrollable — image-input imported twice) + demo1. Custom font sizes `--text-2sm`, `--text-2xs`. Redefines dark/light variants.
- **demos/demo1.css** — the ACTIVE layout theme (Layout1 = "demo1"). Vars: `--sidebar-width:280px`, `--sidebar-width-collapse:80px`, `--header-height:70px` (60 on mobile). Sidebar fixed/collapse behavior; collapsed sidebar hides titles/badges, shows small-logo, NO hover-expand (bodh tweak comment: "so it never overlaps navbar"). 
- **components/scrollable.css** — `kt-scrollable*` utilities.
- **components/apexcharts.css** — apexcharts theming to CSS vars.
- **components/image-input.css** — `kt-image-input*` avatar-upload widget.
- **components/leaflet.css** — leaflet map popup theming.
- **components/rating.css** — `kt-rating*` star rating.
All are stock Metronic except the indigo brand palette and the collapse-no-hover comment.

## 5. config/ (33) — menu configs
- **types.ts** — `MenuItem` interface (title, desc, img, icon:LucideIcon, path, rootPath, childrenIndex, heading, children:MenuConfig, disabled, collapse, collapseTitle, expandTitle, badge, separator) + `MenuConfig = MenuItem[]`.
- **general.config.ts** — `generalSettings` stock Keenthemes links (purchaseLink envato, devsLink, faqLink, aboutLink keenthemes; docsLink/licenseLink empty). Imported 10× (footers/toolbars).
- **bodhassess.config.tsx** — THE LIVE bodh menu (imported by layout-1's sidebar-menu, breadcrumb, mega-menu, mega-menu-mobile, toolbar). Exports `MENU_SIDEBAR`, `MENU_MEGA`, `MENU_MEGA_MOBILE`. Route constants (the real app route map):
  - `/dashboard`
  - Assessments: `/assessments`, `/assessments/create`, `/assessments/batch`
  - Questionnaire Library: `/questionnaires`, `/questionnaires/demographics`
  - Question Bank: `/question-bank`, `/question-bank/qualities`, `/question-bank/create`, `/question-bank/calibration`, `/question-bank/norms`
  - Reports: `/reports`, `/reports/responses`
  - Entity: `/admin/entity-registrations`
  - Platform: `/analytics` (BodhLens), `/data-studio`, `/survey` (BodhSurvey); White-Label `/white-label/tenants`,`/white-label/branding`,`/white-label/api`
  - Administration: `/admin/live-tracking`, `/admin/data-grid`; Users `/admin/practitioners`,`/admin/respondents`,`/admin/groups`; Roles `/admin/permissions`,`/admin/roles`; DPDP Compliance `/compliance/consent`,`/compliance/erasure`,`/compliance/audit`,`/compliance/portal`; Settings `/settings/tenant`,`/settings/tiers`,`/settings/integrations`
  - MENU_MEGA also lists vertical routes: `/clinical/clients`, `/industrial/cohorts`, `/counselling/students`, `/experiments/builder`. (`MENU_MEGA_MOBILE = MENU_MEGA`.)
- **layout-1.config.tsx** — STOCK Metronic sidebar/mega menu (Profiles/Account/Network/Store/Auth demo links, mostly `path:'#'`, keenthemes doc URLs). NOT imported anywhere — superseded by bodhassess.config. Read fully; contains zero bodh content.
- **layout-2 … layout-34.config.tsx** (30 files) — all STOCK template menus, ZERO bodh-specific content (verified via grep, bodh-hits=0 each). Exports vary by layout family: sidebar variants export MENU_SIDEBAR / MENU_SIDEBAR_MAIN / MENU_SIDEBAR_RESOURCES / MENU_SIDEBAR_WORKSPACES / MENU_SIDEBAR_COMPACT / MENU_ROOT / MENU_HELP / MENU_TOOLBAR; header/mega families export MENU_HEADER / MENU_NAVBAR / MENU_MEGA / MENU_MEGA_MOBILE; layout-15 exports NavItem/NavConfig/MAIN_NAV. These belong to the ~34 unused Metronic demo layouts shipped in components/layouts/; only Layout1 is wired into the app.

## 6. public/
- Top level: `favicon.ico`, `media/`, `respondents-template.csv`.
- **respondents-template.csv** (bulk-upload template): header `name,email,dob,consent`; 3 sample rows (Arjun Patel/1995-03-14/Granted; Priya Sharma/1998-07-22/Pending; Rahul Verma/1992-11-05/Granted). DOB ISO yyyy-MM-dd, consent enum Granted|Pending|Withdrawn.
- **media/** subdirs (image assets, not read): app(35), avatars(40), banners(2), brand-logos(147), file-types(33), flags(261), illustrations(56), images(104), products(35), store(16), ui(2). ANOMALY: stray duplicate dir `media/flags copy` (261 files — literal "flags copy" with a space; leftover duplicate). All stock Metronic media.

---

## (a) API ACCESS LAYER SYNTHESIS
- Single client: `lib/api.ts`, raw `fetch`, no axios, no react-query inside (react-query is a page-layer concern). All requests: `fetch(\`${API_BASE}${path}\`, {method, headers, body})` via `jsonFetch<T>`.
- **Base URL resolution**: `API_BASE = config.apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1'`. Vite inlines VITE_* at build. The `/api/vN` prefix is baked into VITE_API_URL — endpoint strings in api.ts are all relative (e.g. `/respondents`). So switching v1↔v2 is purely a VITE_API_URL change; no code change. Currently: dev(.env.local)=`http://localhost:8081/api/v2` (NEW), prod(.env.production)=`https://api.bodh.biz/api/v1` (LEGACY), fallback/Docker default=`http://localhost:4000/api/v1`.
- **Auth header**: `Authorization: Bearer <token>` auto-attached by jsonFetch unless caller passes its own. Token = `localStorage['bodhassess.practitioner.token'] (dashboard/superadmin+practitioner, unified /auth) || localStorage['bodhassess.auth.token'] (respondent/portal)`. Explicit-token endpoints (respondentsApi.me/logout, authApi.me/logout) pass Bearer directly.
- **Interceptors**: none. Error handling: non-2xx → throw `Error("[API <status>] <path>: <body>")`; 204/non-JSON → null. Callers (data-store wrappers) swallow to []/null/false; page-level react-query surfaces errors.
- **Endpoint string constants (all relative to API_BASE)**: `/health`; `/respondents`, `/respondents/:id`, `/respondents/bulk`, `/respondents/login`, `/respondents/me`, `/respondents/logout`; `/entity-registrations[/:id]`; `/auth/login`, `/auth/me`, `/auth/logout`; `/practitioners[/:id]`; `/roles[/:id]`; `/groups[/:id]`; `/qualities[/:id]`; `/demographic-fields[/:id]`; `/item-display`, `/item-display/override`, `/item-display/:id/delete`, `/item-display/:id`; `/questionnaires[/:id]`, `/questionnaires/summaries`, `/questionnaires/by-name`; `/questionnaires-catalog`; `/assessments[/:id]`, `/assessments/summaries`, `/assessments/groups`, `/assessments/by-assessment`, `/assessments/bulk`, `/assessments/:id/reset`, `/assessments/:id/heartbeat`; `/admin/live-tracking/assessments`, `/admin/live-tracking/assessments/sessions`; `/verticals[/:id]`; `/assessment-records[/:id]`, `/assessment-records/by-questionnaire/:id`, `/assessment-records/by-entity/:id`, `/assessment-records/:id/status`, `/assessment-records/:id/audit`, `/assessment-records/:id/allotments[/entities|groups|respondents[/:id]]`; `/assessment-tokens`, `/assessment-tokens/by-assessment/:id`, `/assessment-tokens/:token`; `/public/tokens/:token[/consume|/register|/login|/qr]`, `/public/tokens/registration-check`; `/public/entities/:id[/register]`; `/audit`, `/audit/:type/:id`; `/questionnaire-records[/:id]`, `/questionnaire-records/:id/current-version`, `/questionnaire-records/:id/audit`, `/questionnaire-records/:pid/versions[/:vid][/drafts|/commit]`; `/datasets/sessions`, `/datasets/sessions/cells`; `/workbooks[/:id][/shares|/sheets|/dashboards]`, `/sheets/:id[/data|/validate-expr|/columns]`, `/dashboards/:id[/widgets]`, `/widgets/:id`; `/analytics/query`.

## (b) ENV MATRIX (var → value per file; app reads ONLY VITE_*)
| var | .env | .env.example (HEAD/other) | .env.local (dev) | .env.production | .env.staging | config.ts default |
|---|---|---|---|---|---|---|
| VITE_API_URL | — | `https://api.bodh.biz/api/v1` / — | `http://localhost:8081/api/v2` | `https://api.bodh.biz/api/v1` | — | `http://localhost:4000/api/v1` |
| VITE_APP_NAME | — | BodhAssess / — | BodhAssess | BodhAssess | — | BodhAssess |
| VITE_AUTH_STORAGE_KEY | — | bodhassess.auth.token / — | bodhassess.auth.token | bodhassess.auth.token | — | bodhassess.auth.token |
| VITE_BASE_PATH | `/dashboard` | `/dashboard` | `/` | `/` | — | `''` |
| VITE_PORTAL_URL | — | `https://portal.bodh.biz` | `http://localhost:3002` | `https://portal.bodh.biz` | — | `http://localhost:3002` |
| VITE_PRACTITIONER_AUTH_STORAGE_KEY | — | — | — | — | — | bodhassess.practitioner.token (only set in Dockerfile ARG) |
| VITE_ADMIN_AUTH_STORAGE_KEY | — | — | — | — | — | bodhassess.admin.token (never set anywhere) |
| NEXT_PUBLIC_API_URL (DEAD) | `https://localhost:8081/api/v2` | — / `https://api.bodh.biz/api/v1` | — | — | `https://api.bodh.biz` (no /api) | n/a |
| NEXT_PUBLIC_APP_NAME / _AUTH_STORAGE_KEY (DEAD) | BodhAssess / bodhassess.auth.token | — / set | — | — | set | n/a |
| NEXT_PUBLIC_BASE_PATH (DEAD, commented) | — | — | — | — | `/bodh` (commented) | n/a |

## (c) ODD / BROKEN / MISMATCHED
1. **`.env.example` has an unresolved Git merge conflict** (`<<<<<<< HEAD … ======= … >>>>>>> 0d049bbc…`) — the file is literally broken; sourcing it would fail.
2. **`.env` and `.env.staging` use `NEXT_PUBLIC_*` prefixes that the app never reads** — Vite only exposes `VITE_*` to `import.meta.env`. So `.env`'s `NEXT_PUBLIC_API_URL=https://localhost:8081/api/v2` is dead; the only live var in `.env` is `VITE_BASE_PATH=/dashboard`. Staging has ZERO VITE_* vars → a staging build silently falls back to config.ts defaults (api `localhost:4000/api/v1`, portal `localhost:3002`) — almost certainly wrong for staging.
3. **v1/v2 split is inconsistent**: dev points at the NEW v2 backend (`:8081/api/v2`), but prod still targets LEGACY v1 (`api.bodh.biz/api/v1`), and the fallback/Docker default is v1 on `:4000`. Prod deploy will NOT hit the new v2 API unless VITE_API_URL is overridden at build. (Matches task premise: v2/8081 exists but frontend prod still on v1/4000.)
4. **`.env` sets `NEXT_PUBLIC_API_URL=https://localhost:8081`** — `https` on localhost:8081 is likely wrong (dev v2 is `http` per .env.local). Dead anyway.
5. **Template heritage leaks**: README, documentation.html, general.config.ts, all layout-2..34 configs + layout-1.config.tsx are stock Metronic/Next.js — README claims Next.js 15/Prisma/PostgreSQL none of which are used (it's Vite SPA + Spring Boot backend). `env.d.ts` shims `process.env` (Next-ism).
6. **Dockerfile bakes v1/port-4000 defaults** and defines `VITE_PRACTITIONER_AUTH_STORAGE_KEY` (used) — but does NOT set VITE_PORTAL_URL, so a Docker build without `--build-arg VITE_API_URL/VITE_PORTAL_URL` ships the localhost:4000 + localhost:3002 defaults.
7. **`config.adminAuthStorageKey`** is defined/read but never set by any env and effectively unused (auth unified under practitioner/`/auth`); mild dead config.
8. **Stray `public/media/flags copy/`** directory (261 duplicated flag images) — accidental copy left in the tree.
9. **package.json/prettier mismatch**: `.prettierrc` requires `@ianvs/prettier-plugin-sort-imports` but package.json installs `prettier-plugin-organize-imports` — `npm run format` would error on missing plugin.
10. **layout-1 vs bodhassess.config**: the app's live layout is `Layout1` (src/components/app-shell.tsx + private-route.tsx) but it consumes `config/bodhassess.config.tsx`, NOT `config/layout-1.config.tsx` (which is dead stock). Easy to edit the wrong file.
