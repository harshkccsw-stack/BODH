I'll start by enumerating all the files in scope.
I'll read all files. Let me batch the reads.
Now the components. Let me read the auth-related and shell components.
Now the data-grid and data-studio components.
Now the root-level pages. Let me read them in batches.
Now the remaining pages.
Now the last set of pages: survey, qualities, entity-registration, entity-member-register, analytics.
Now the last two pages.
All in-scope files read. To resolve exact API paths behind the helper functions my pages call, let me locate the `@/lib/api` module and config.
The `@/lib/*` modules back every API call in my pages. Let me resolve the exact endpoints for the helpers my files use.
Now let me resolve the exact API paths for the helper functions my pages call. Let me grep the relevant sections of `lib/api.ts`.
Let me read the fetch wrapper and the specific helper objects my pages consume.
Let me read the remaining helper sections: questionnaires catalog, assessments summaries, public tokens, public entity, data-studio, analytics.
Let me read the AssessmentSummary interface, then public tokens, public entity, data-studio, and analytics sections.
Let me read the AssessmentToken interface and the data-studio + analytics API sections.
Dashboard also uses `getRespondents`, `getPractitioners`, `countByVertical` from `@/lib/data-store`. Let me check what those resolve to.
All files read and all API helpers resolved. Here is the complete structured catalog.

---

# READER REPORT: bodhassess-app core (main/App/router/lib/components + root pages)

**Global:** All API paths below are relative to `API_BASE` = `config.apiBase` = `import.meta.env.VITE_API_URL` **|| `http://localhost:4000/api/v1`**. So every `/x` = `…/api/v1/x` (LEGACY v1). No `/api/v2` calls exist anywhere in these files. Fetch wrapper `jsonFetch` (lib/api.ts:23) auto-attaches `Authorization: Bearer <token>` where token = `localStorage['bodhassess.practitioner.token'] || localStorage['bodhassess.auth.token']`. Errors thrown as `Error("[API <status>] <path>: <text>")`. Path alias `@` → project root (vite.config.ts:16), so `@/lib/*`→`./lib/*`, `@/src/*`→`./src/*`, `@/components`→`./components` (Metronic template dir, NOT in my scope).

---

## ENTRY / SHELL

**src/main.tsx** — Bootstraps React. Imports `./App`, `@/styles/globals.css`. `createRoot(#root).render(<StrictMode><App/></StrictMode>)`. No exports, no API, no routing.

**src/App.tsx** — default `App()`. Provider tree: `ThemeProvider`(next-themes; attribute=class, defaultTheme=light, storageKey=`bodhassess-theme`, enableSystem) → `QueryClientProvider`(new QueryClient: `refetchOnWindowFocus:false, staleTime:30_000`) → `TooltipProvider`(delayDuration=0) → `Suspense fallback=<ScreenLoader/>` → `RouterProvider router={router}` + `<Toaster/>` (sonner). **QueryClient is created but NO page in my scope uses react-query** (all use raw useState/useEffect + fetch). No API.

**src/components/app-shell.tsx** — `AppShell()`: renders `<Layout1><Outlet/></Layout1>` (Metronic layout-1 chrome). Purely presentational; auth handled by PrivateRoute. No API.

---

## ROUTER — src/router.tsx

Exports `router = createBrowserRouter(routes, { basename: VITE_BASE_PATH || '/' })`. All pages `lazy()`-loaded, each wrapped in per-route `<Suspense fallback={<ScreenLoader/>}>` via `lazyPage()`. Tree root = `<Root/>` = `<PractitionerAuthProvider><Outlet/></PractitionerAuthProvider>` (auth provider mounted ONCE above all routes, inside router so it can use useNavigate/useLocation).

**COMPLETE ROUTE TABLE** (path → component → layout/guard):

| Path | Component (lazy import) | Guard / Layout |
|---|---|---|
| `/` | HomePage (`pages/home`) | none — `<Navigate to="/dashboard" replace>` |
| `/login` | LoginPage (`pages/login`) | `<PublicRoute>` (bounce→/dashboard if authed) |
| `/select-vertical` | SelectVerticalPage (`pages/select-vertical`) | `<PublicRoute>` |
| `/entity-registration` | EntityRegistrationPage (`pages/entity-registration`) | none (public) |
| `/entity/:entityId/register` | EntityMemberRegister (`pages/entity-member-register`) | none (public) |
| `/preview/:versionId` | PreviewQuestionnaire (`pages/portal/preview`) | none (public) |
| `/register` | RegisterWithToken (`pages/register-with-token`) | none at route level; component self-gates (with `?token`→token flow, else wraps `<PublicRoute>`) |
| `/assessments/:id/take` | AssessmentTake (`pages/assessments/take-assessment`) | `<PrivateRoute>` + own minimal full-screen `div.min-h-screen` (NO AppShell) |
| **AppShell group** (all below) | — | `<PrivateRoute><AppShell/></PrivateRoute>` (Layout1 chrome) |
| `/dashboard` | Dashboard (`pages/dashboard`) | ↑ |
| `/analytics` | Analytics (`pages/analytics`) | ↑ |
| `/data-studio` | DataStudioHome (`pages/data-studio/index`) | ↑ |
| `/data-studio/wb/:wid` | DataStudioWorkbook (`pages/data-studio/workbook`) | ↑ |
| `/survey` | Survey (`pages/survey`) | ↑ |
| `/question-bank/qualities` | Qualities (`pages/qualities`) | ↑ |
| `/admin/groups` · `/admin/permissions` · `/admin/practitioners` · `/admin/respondents` · `/admin/entity-registrations` · `/admin/entity-registrations/:id` · `/admin/roles` · `/admin/live-tracking` · `/admin/data-grid` | admin/* | ↑ |
| `/assessments` · `/create` · `/edit/:id` · `/batch` · `/respondents`(literal, before param) · `/:assessmentId/respondents` · `/:id/invite` · `/:id/copy-link` | assessments/* | ↑ |
| `/clinical/{clients,mse-upload,risk-alerts,tracking}` | clinical/* | ↑ |
| `/compliance/{audit,consent,erasure,portal}` | compliance/* | ↑ |
| `/counselling/{consent,developmental,multi-informant,students}` | counselling/* | ↑ |
| `/experiments/{builder,export,paradigms}` | experiments/* | ↑ |
| `/industrial/{ai-adaptability,cohorts,competency,proctoring}` | industrial/* | ↑ |
| `/question-bank` · `/calibration` · `/create` · `/norms` | question-bank/* | ↑ |
| `/questionnaires` · `/parents`(before param) · `/:id/versions` · `/clinical` · `/counselling` · `/demographics` · `/experimental` · `/industrial` | questionnaires/* | ↑ |
| `/reports` · `/responses` · `/clinical` · `/counselling` · `/industrial` | reports/* | ↑ |
| `/settings/{integrations,tenant,tiers}` | settings/* | ↑ |
| `/white-label/{api,branding,tenants}` | white-label/* | ↑ |
| `*` | — | `<Navigate to="/dashboard" replace>` (catch-all) |

**Dead/commented:** `/portal/login`, `/portal/assessments`, `/portal/take`, `/portal/complete` all commented out (respondent portal MOVED to standalone `bodhassess-portal` app at portal.bodh.biz). Router comment explicitly warns: in-app redirects to `/portal/*` (in login.tsx, register-with-token.tsx, admin/respondents.tsx) now fall through catch-all → `/dashboard`. `PortalLogin/PortalAssessments/PortalTake/PortalComplete` consts commented. `/preview/:versionId` kept.

---

## AUTH INFRASTRUCTURE (src/components + lib)

**src/components/private-route.tsx** — `PrivateRoute({children?})`. Reads `usePractitionerAuth()` + `useLocation().pathname`. Logic: status `loading`|`unauthenticated` → `<ScreenLoader/>` (provider does the /login redirect itself). If `!auth.canAccess(pathname)` → "Access denied" card inside `<Layout1>` with a **Sign out** button (`auth.logout()`). Else render `children ?? <Outlet/>`. No direct API.

**src/components/public-route.tsx** — `PublicRoute({children?})`. If `auth.status==='authenticated'` → `<Navigate to="/dashboard" replace>`. Else `children ?? <Outlet/>`. No API.

**lib/practitioner-auth.tsx** (backs the guards) — `PractitionerAuthProvider` + `usePractitionerAuth()` hook. State machine `{status:'loading'|'authenticated'|'unauthenticated', me}`.
- On mount: `getDashboardToken()` (practitioner token). No token → unauthenticated. Else `authApi.me(token)` = **GET /auth/me** → maps AuthUser→PractitionerMe; on throw clears token → unauthenticated.
- Redirect effect: if unauthenticated and path not public → `router.replace('/login')`; if authenticated and on `/login` → replace `/dashboard`. Public prefixes skipped.
- `logout()`: clears token, sets unauthenticated, best-effort `authApi.logout(token)` = **POST /auth/logout**, replace `/login`.
- `login(token,user)`: `setDashboardToken(token)` + set authenticated (used by login page for soft-nav, no reload).
- `canAccess(p)` = authenticated ? match p against `me.url_paths` : `isPublicPath(p)`.

**lib/practitioner-auth-utils.ts** — pure helpers. `TOKEN_KEY = config.practitionerAuthStorageKey` (`bodhassess.practitioner.token`). `LOGIN_PATH='/login'`. `PUBLIC_PREFIXES = ['/login','/portal','/register','/select-vertical','/entity']`. `isPublicPath`, `pathMatchesPattern` (`/*`|`*`=all; `/x/*`=prefix; else exact), `canAccess(path, urlPaths[])`. Token get/set/clear on localStorage. `authUserToPractitionerMe`: super admin defaults `roles:['SUPER_ADMIN']`, `url_paths:['/*']` (grants everything).

**src/lib/router-helpers.tsx** — thin react-router wrappers. default+named `Link` (translates Next-style `href` string|`{pathname,query}` → `to`; ignores `replace/scroll/prefetch` extras). `usePathname()`, `useSearchParams()` (returns URLSearchParams directly), `useParams<T>()`, `useRouter()` (`{push,replace,back,forward,refresh:window.location.reload,prefetch:noop}`), `redirect(to)` (window.location.replace + throws), `notFound()`. No API.

---

## ROOT PAGES

**src/pages/home.tsx** — default `HomePage()`. Body = `<Navigate to="/dashboard" replace>`. Route `/`. No API, no state.

**src/pages/select-vertical.tsx** — default `SelectVerticalPage()`. Route `/select-vertical` (PublicRoute). Static grid of 5 vertical cards (clinical/industrial/counselling/experiments/whitelabel), each a `<Link href="/dashboard?vertical=<id>">`. No API, no state, no guards beyond route.

**src/pages/login.tsx** — default `LoginPage()`. Route `/login` (PublicRoute). Uses `usePractitionerAuth().login`, `useRouter`.
- **Form fields:** `identifier` (email or phone), `dob` (DD/MM/YYYY, auto-formatted via `autoFormatDdmmyyyy`, converted `ddmmyyyyToIso`). DOB = password.
- **Mount effect:** `getDashboardToken()` → `authApi.me(token)` (**GET /auth/me**, `Authorization: Bearer <token>`) → on success `login(token,user)` + `router.replace('/dashboard')`. Stale token silently ignored.
- **Submit:** `authApi.login(id, isoDob)` = **POST /auth/login** payload `{email:id, dob:isoDob}` (NOTE: passes phone-or-email into `email` field). Response `{token, user:{id,email,name,isSuperAdmin,entityIds,roles,url_paths}}`. Branch: `user.isSuperAdmin` → `login(res.token,res.user)` (stores practitioner token) + `router.replace('/dashboard')`. Else → `localStorage['bodhassess.auth.token']=res.token` + hard nav `window.location.href = ${config.portalUrl}/portal/assessment` (external portal, default `http://localhost:3002`).
- Errors: msg contains '401' → "Invalid email/phone or date of birth"; else "Login failed — API may be unreachable".

**src/pages/register.tsx** — default `PortalRegisterPage()`. NOT directly routed; imported by register-with-token.tsx as the no-token fallback. `AUTH_KEY = config.authStorageKey`.
- **Form fields:** accountType(individual|organization), name, email, phone, dob, orgName, orgWebsite. Client validation (email regex, phone ≥7 digits, DOB→ISO, org required if organization).
- Generates client-side `id = R-YYMMDD-XXXX` (`generateRespondentId`).
- **Submit:** `respondentsApi.create({id,name,email,phone,dob:isoDob,consent:'Granted',accountType,orgName?,orgWebsite?})` = **POST /respondents**. Then best-effort auto-login `respondentsApi.login(email,isoDob)` = **POST /respondents/login** payload `{identifier:email, dob}` → response `{token, respondent}` → `localStorage[authStorageKey]=token`.
- Success card shows email+DOB; **navigations: `window.location.href='/portal/assessments'` (autoSignedIn) or `'/portal/login'`** — both DEAD (portal routes commented → catch-all→/dashboard). Also anchor `<a href="/portal/login">` and `<a href="/portal/login">` — DEAD.
- Errors: 409/duplicate → "already exists…sign in"; else generic.

**src/pages/register-with-token.tsx** — default `RegisterEntry()` (route `/register`). Reads `?token`: with token → `<RegisterWithTokenPage/>` (no guard, reachable while signed-in); without → `<PublicRoute><PortalRegisterPage/></PublicRoute>`.
`RegisterWithTokenPage`: reads `token` from `window.location.search`.
- **Mount:** `publicTokensApi.resolve(token)` = **GET /public/tokens/:token** → `AssessmentToken` {token,assessmentId,assessmentName,entityId,entityName,groupId,groupName,respondentId,email,maxUses,usedCount,expiresAt,kind:'register'|'login',loginEmail,sessionId}. If `kind==='login' && loginEmail` prefill email.
- **Form fields:** name,email,phone,dob,companyId. `orgName = entityName||groupName`.
- **signIn** (login-kind): `authApi.login(email,isoDob)` = **POST /auth/login** `{email,dob}` → store `authStorageKey`; nav `window.location.href = /portal/take?id=<sessionId>` or `/portal/assessments` (DEAD).
- **claimExisting** (register-kind, existing acct): `publicTokensApi.loginExisting(token,{email,dob:isoDob})` = **POST /public/tokens/:token/login** → `{sessionId,respondentId,assessmentId,token}` → store authStorageKey → nav `/portal/take?id=<sessionId>` (DEAD).
- **submit** (new registration): first `publicTokensApi.registrationCheck({email?,phone?,companyId?,dob})` = **POST /public/tokens/registration-check** → `{exists}`; if exists → show "Account found". Else `publicTokensApi.register(token,{name,email,phone?,dob,companyId?})` = **POST /public/tokens/:token/register** → `{sessionId,respondentId,assessmentId,token}` (RESPONDENT token) → store authStorageKey → nav `/portal/take?id=<sessionId>` (DEAD). 409 → "Account found".
- loginHref = `/portal/login?email=…` (DEAD). Quirk: multiple portal redirects broken post-portal-split.

**src/pages/entity-registration.tsx** — default `EntityRegistrationPage()`. Route `/entity-registration` (public).
- **Form fields:** name (contact), companyName, email, phone, dob. All required; DOB→ISO.
- **Submit:** `entityRegistrationsApi.create({name,companyName?,email,phone?,dob:isoDob})` = **POST /entity-registrations** → returns `EntityRegistration` (uses `.id` as reference id, shown on success). Error "already registered" → dedicated msg. No auth/token stored, no navigation (just success card + "Register another" reset).

**src/pages/entity-member-register.tsx** — default `EntityMemberRegisterPage()`. Route `/entity/:entityId/register` (public). `useParams().entityId`.
- **Mount:** `publicEntityApi.resolve(entityId)` = **GET /public/entities/:entityId** → `PublicEntityInfo {id,name}` (titles the form).
- **Form fields:** name,email,phone,dob,companyId. DOB→ISO.
- **Submit:** `publicEntityApi.registerMember(entityId,{name,email,phone?,dob:isoDob,companyId?})` = **POST /public/entities/:entityId/register** → `EntityMemberResult`. On success nav `window.location.href = ${config.portalUrl}/portal/login?email=<email>` (external portal — CORRECT, unlike register.tsx). 409 → "Account found" with portal-login button. `portalLoginHref` uses `config.portalUrl`.

**src/pages/dashboard.tsx** — default `DashboardPage()` (wraps `<Suspense><DashboardContent/></Suspense>`). Route `/dashboard` (PrivateRoute+AppShell).
- **State:** `useSearchParams().get('vertical') || 'whitelabel'` (default all-verticals). health, respondentCount, practitionerCount, questionnaireCount, sessions[], loading. No react-query, no localStorage.
- **API calls:**
  - `getHealth()` = **GET /health** → `{status,service,version,database,time}`; consumes `service,version,database` for green "API Connected" banner.
  - Parallel `Promise.all`: `getRespondents()`=**GET /respondents** (→`.length`), `getPractitioners()`=**GET /practitioners** (→`.length`, filter `.verticals`), `getQuestionnairesCatalog()`=**GET /questionnaires-catalog** (tolerates array or `{data}`; →`.length` / `countByVertical`), `assessmentsApi.listSummaries()`=**GET /assessments/summaries** → `AssessmentSummary[]` {id,assessmentId,name,respondentName,instrument,vertical,status,score,createdAt,completedAt}. Each `.catch(()=>[])`.
  - Filters sessions by vertical (whitelabel=all). Derives KPIs (active/completed/pendingReview counts, completionRate), 14-day completions sparkline by `completedAt`, top-5 instruments.
- **Navigation:** Quick-action cards hard-nav `window.location.href` → `/assessments/create`, `/assessments/batch`, **`/platform/bodhlens`** (NOTE: no such route → catch-all→/dashboard, dead link). "View all" `<a href="/assessments">`.
- Quirk: `countByVertical` is client-only (pure). `getRespondents/getPractitioners` swallow errors returning `[]`.

**src/pages/survey.tsx** — default `SurveyPage()`. Route `/survey` (PrivateRoute+AppShell). **100% STATIC** — hardcoded `surveys[]` + `stats[]` arrays ("BodhSurvey"). NO API, no state, no props. "Create Survey" button has no handler (dead).

**src/pages/qualities.tsx** — default `QualitiesPage()`. Route `/question-bank/qualities` (PrivateRoute+AppShell). Full MQ/MQT tree CRUD. Types `MQ {id,name,description,mqts:MQT[]}`, `MQT {id,name,children?}`. Client-generated ids `mq-xxxx`/`mqt-xxxx`.
- **API (qualitiesApi):**
  - `list()` = **GET /qualities** → `MQ[]` (mapped: mqts defaulted to []).
  - `create({id,name,description,mqts:[]})` = **POST /qualities**.
  - `update(id, {...existing,name,description})` and `update(parent.id,{...parent,mqts:updatedMqts})` = **PUT /qualities/:id** (entire MQ doc; MQTs persisted as nested part of parent MQ — no separate MQT endpoint).
  - `delete(id)` = **DELETE /qualities/:id**.
- Local recursive tree ops (mapMqtTree/flattenMqts/removeMqt), sibling-uniqueness checks, search filter, modals (add MQ / combined edit MQ+MQTs / add-rename MQT / delete confirm). Every mutation → `await refresh()`. Error surfaced "is the API running?".

**src/pages/analytics.tsx** — default `AnalyticsPage()`. Route `/analytics` (PrivateRoute+AppShell). **STATIC STUB / non-functional** — "BodhLens…Powered by Claude API" badge, an `<Input>` with no state binding, "Ask BodhLens" button with **no onClick**, `results: ResultRow[] = []` (always empty → "Ask a question above"). NO API call at all (contrast: the real analytics endpoint `/analytics/query` is used only by DashboardWidgets, not this page).

---

## DATA-STUDIO / DATA-GRID COMPONENTS (in my scope; used by out-of-scope pages `data-studio/*`)

**src/components/data-grid/DataGrid.tsx** — `DataGrid({columns:DatasetColumn[], rows:DatasetRow[], height=600, onCellEdited?})` (+default). Glide-Data-Grid wrapper (`@glideapps/glide-data-grid`). Client-side sort/resize/range-select/copy. Column meta-driven (`col.type` number/datetime/string, `col.editable==='field'`, key `respondentEmail`→220w). `onCellEdited(rowId, columnKey, newValue, row._updatedAt)` — page owns PATCH persistence. No direct API.

**src/components/data-studio/useDerivedColumns.ts** — `useDerivedColumns(baseColumns, baseRows, derived:DerivedColumn[])` + `SERVER_PENDING='— (server)'`. Merges derived columns for display. Server-computed values (from GET /sheets/:id/data) are authoritative; CLIENT columns evaluated in-browser via `evaluateFormula` (from `@/lib/data-studio/formula`); SERVER columns get placeholder. No API (pure).

**src/components/data-studio/SheetView.tsx** — `SheetView({sheet, canEdit, onColumnsChanged?})` + `ColumnDialog`. 
- **API (dataStudioApi):** `getSheetData(sheet.id)` = **GET /sheets/:id/data** → `DatasetResponse {columns,rows}`; `validateExpr(sheetId,expr)` = **POST /sheets/:id/validate-expr** `{expr}` → `ValidateExprResult {ok,evalTarget,resultType,errors}` (debounced 350ms live-validate); `addColumn(sheetId,{label,expr})` = **POST /sheets/:id/columns**; `updateColumn(sheetId,colKey,{label,expr})` = **PUT /sheets/:id/columns/:colKey**; `deleteColumn(sheetId,colKey)` = **DELETE /sheets/:id/columns/:colKey**. All → DerivedColumn. Reloads data after save/delete.

**src/components/data-studio/DashboardView.tsx** — `DashboardView({dashboard,workbook,canEdit,onChanged})` + `WidgetCard` + `AddWidgetDialog`. dnd-kit reorder.
- **API (dataStudioApi):** `updateWidget(w.id,{sortOrder:i})` and `{w}` = **PUT /widgets/:id** (persist reorder/width); `deleteWidget(id)` = **DELETE /widgets/:id**; AddWidgetDialog `getSheetData(sheetId)` = **GET /sheets/:id/data** (populate dimension/measure pickers); `addWidget(dashboardId,{type,sheetId,config,w,h})` = **POST /dashboards/:dashboardId/widgets**. Widget types KPI/CHART/TABLE, aggs avg/sum/count/min/max/p50.

**src/components/data-studio/DashboardWidgets.tsx** — `WidgetBody({widget,sheet})` + Kpi/Chart/Table bodies (recharts). Config shape `WidgetConfig {title,chartType,dimension(s),measure(s)}`.
- **API:** `analyticsApi.query({sourceFilters, dimensions?, measures})` = **POST /analytics/query** → `DatasetResponse {columns,rows}`. Query built from widget.config + `sheet.sourceFilters`. KPI reads `rows[0][measureLabel]`; chart maps rows to {name,value}; table renders columns where `group==='measure'` formatted.

---

# SYNTHESIS

### (a) Route map — see full table above. Structure: `Root`(auth provider) wraps everything → `/`=redirect; `PublicRoute`{/login,/select-vertical}; bare-public {/entity-registration, /entity/:id/register, /preview/:versionId, /register(self-gating)}; `PrivateRoute`+minimal layout {/assessments/:id/take}; `PrivateRoute`+`AppShell`(Layout1) {all dashboard routes}; `*`→/dashboard. `/portal/*` routes commented out (moved to separate app).

### (b) Auth/session flow (as implemented)
- **Two tokens, two localStorage keys:** dashboard/practitioner = `bodhassess.practitioner.token` (`config.practitionerAuthStorageKey`); respondent/portal = `bodhassess.auth.token` (`config.authStorageKey`). Admin key `bodhassess.admin.token` defined but unused here. `getActiveToken()` prefers practitioner over respondent.
- **Login (/login):** POST `/auth/login {email:identifier, dob}` → `{token, user}`. If `user.isSuperAdmin` → store **practitioner** token (via provider `login()`/`setDashboardToken`) + soft-nav `/dashboard`. Else store **respondent** token + hard-redirect to external `config.portalUrl/portal/assessment`.
- **Session restore:** `PractitionerAuthProvider` on mount reads practitioner token → GET `/auth/me` (`Bearer`) → authenticated (maps `url_paths`, super admin=`['/*']`) or clears token→unauthenticated. login.tsx also self-checks `/auth/me` on mount.
- **Guards:** `PrivateRoute` renders ScreenLoader while loading/unauthenticated (provider does the actual `router.replace('/login')`), and an "Access denied" screen when `canAccess(pathname)` fails (pathname vs `url_paths` glob patterns). `PublicRoute` bounces authenticated users to `/dashboard`. Public prefixes (`/login,/portal,/register,/select-vertical,/entity`) always allowed.
- **Logout:** clear practitioner token → set unauthenticated → best-effort POST `/auth/logout` (Bearer) → replace `/login`. Triggered from PrivateRoute access-denied "Sign out".
- **Respondent/portal auth** (register, register-with-token, entity-member-register) stores only the respondent token and hands off to the external portal app; those flows never touch the dashboard session.

### (c) API-call catalog (METHOD path — page/component — payload — response fields used) — all under `/api/v1`

- GET `/auth/me` — login.tsx (mount) & practitioner-auth.tsx (provider) — hdr Bearer — `{id,email,name,isSuperAdmin,roles,url_paths}` (→ canAccess gating)
- POST `/auth/login` — login.tsx, register-with-token.tsx(signIn) — `{email,dob}` — `{token, user{isSuperAdmin,…}}`
- POST `/auth/logout` — practitioner-auth.tsx(logout) — hdr Bearer — (204/none)
- GET `/health` — dashboard.tsx — — `{service,version,database}`
- GET `/respondents` — dashboard.tsx (via getRespondents) — — `.length`
- POST `/respondents` — register.tsx — `{id,name,email,phone,dob,consent:'Granted',accountType,orgName?,orgWebsite?}` — (created respondent)
- POST `/respondents/login` — register.tsx (auto-login) — `{identifier:email, dob}` — `{token}`
- GET `/practitioners` — dashboard.tsx (via getPractitioners) — — `.length,.verticals`
- GET `/questionnaires-catalog` — dashboard.tsx — (opt `?vertical=`) — array or `{data}`, `.length`
- GET `/assessments/summaries` — dashboard.tsx — (opt `?respondentId=&limit=`) — `AssessmentSummary[]{status,vertical,instrument,completedAt,…}`
- GET `/qualities` — qualities.tsx — — `MQ[]{id,name,description,mqts}`
- POST `/qualities` — qualities.tsx — `{id,name,description,mqts:[]}` — MQ
- PUT `/qualities/:id` — qualities.tsx — full MQ doc (`{...,name,description,mqts}`) — MQ
- DELETE `/qualities/:id` — qualities.tsx — — (none)
- POST `/entity-registrations` — entity-registration.tsx — `{name,companyName?,email,phone?,dob}` — `{id}`
- GET `/public/tokens/:token` — register-with-token.tsx — — `AssessmentToken{kind,assessmentName,entityName,groupName,loginEmail,sessionId,…}`
- POST `/public/tokens/registration-check` — register-with-token.tsx — `{email?,phone?,companyId?,dob}` — `{exists}`
- POST `/public/tokens/:token/register` — register-with-token.tsx — `{name,email,phone?,dob,companyId?}` — `{sessionId,respondentId,assessmentId,token}`
- POST `/public/tokens/:token/login` — register-with-token.tsx(claimExisting) — `{email,dob}` — `{sessionId,token}`
- GET `/public/entities/:entityId` — entity-member-register.tsx — — `{id,name}`
- POST `/public/entities/:entityId/register` — entity-member-register.tsx — `{name,email,phone?,dob,companyId?}` — `EntityMemberResult`
- GET `/sheets/:id/data` — SheetView, DashboardView(AddWidget) — — `DatasetResponse{columns,rows}`
- POST `/sheets/:id/validate-expr` — SheetView(ColumnDialog) — `{expr}` — `{ok,evalTarget,resultType,errors}`
- POST `/sheets/:id/columns` — SheetView — `{label,expr}` — DerivedColumn
- PUT `/sheets/:id/columns/:colKey` — SheetView — `{label,expr}` — DerivedColumn
- DELETE `/sheets/:id/columns/:colKey` — SheetView — — (none)
- POST `/dashboards/:dashboardId/widgets` — DashboardView — `{type,sheetId,config,w,h}` — Widget
- PUT `/widgets/:id` — DashboardView — `{sortOrder}`/`{w}` — Widget
- DELETE `/widgets/:id` — DashboardView — — (none)
- POST `/analytics/query` — DashboardWidgets(WidgetBody) — `{sourceFilters,dimensions?,measures}` — `DatasetResponse{columns,rows}`

(analytics.tsx and survey.tsx make **zero** API calls — static stubs.)

### (d) Odd / broken / dead
- **Broken portal redirects:** register.tsx (`/portal/assessments`, `/portal/login` via `window.location.href` and `<a>`) and register-with-token.tsx (`/portal/take?id=…`, `/portal/assessments`, `/portal/login`) target the **removed** `/portal/*` routes → hit catch-all → `/dashboard`. Router comment flags this as unfinished decommission. entity-member-register.tsx and login.tsx correctly use `config.portalUrl` (external) instead.
- **dashboard.tsx dead link:** BodhLens quick-action → `window.location.href='/platform/bodhlens'` — no such route → catch-all→/dashboard.
- **analytics.tsx** is a non-functional placeholder (unbound input, no-op "Ask BodhLens" button, always-empty results) despite `/analytics/query` existing and working elsewhere.
- **survey.tsx** fully hardcoded mock data; "Create Survey" button no handler.
- **QueryClient** configured in App.tsx but no in-scope page uses react-query; all pages use manual useState/useEffect + fetch.
- **login.tsx** sends phone-or-email in the `email` JSON field to `/auth/login` (backend must accept either).
- **MQT persistence:** no MQT endpoint — entire MQ document PUT on every MQT add/rename/delete (read-modify-write, race-prone). Deleting an MQ warns existing assessments keep MQT-id scores but lose labels.
- **Token duality risk:** `getActiveToken` prefers practitioner token, so a respondent flow run in a browser that still holds a dashboard token would attach the wrong Bearer to shared `jsonFetch` endpoints.
- **register.tsx** generates the respondent id client-side (`R-YYMMDD-XXXX`, Math.random) — collision/duplication possible; relies on server 409.
- No `/api/v2` usage anywhere in these files — entire app still on legacy v1.
