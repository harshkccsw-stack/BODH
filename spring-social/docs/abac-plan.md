# ABAC (Attribute-Based Access Control) — implementation plan

Status: PROPOSAL (2026-10-09). Nothing here is implemented. Written after a full
read of the current auth code in spring-social, bodhassess-app and
bodhassess-portal. Companion to the summary delivered in chat; this file holds
the full detail, including the endpoint→permission table.

---

## 1. What exists today (baseline)

### Authentication
- Single JWT kind (HS256, jjwt 0.12.6), minted by `JwtService.issueToken(User)`
  with claims `sub` (userId), `email`, `superAdmin`, 12 h expiry. **No audience
  or token-type claim — portal and dashboard tokens are indistinguishable.**
- Dashboard login `POST /api/auth/login` (email + dob; **dob is the password**),
  gate = superadmin OR role group OR practitioner profile
  (`DashboardAuthService.hasDashboardAccess`).
- Portal login `POST /api/portal/login` (email-or-employeeId + dob), gate =
  respondent profile. Same token issuer.
- `security/ActorFilter.java` (order HIGHEST_PRECEDENCE+10) parses the bearer
  into `RequestActor(userId, email, superAdmin)`, stores it in request
  attribute `bodh.requestActor`, read back via `ActorFilter.current()`.
  **It rejects only when `app.security.require-auth=true`, and the default is
  `${REQUIRE_AUTH:false}`. REQUIRE_AUTH is not set in deploy config** — so in
  practice nearly every endpoint answers anonymous callers.
- No Spring Security dependency. No `@PreAuthorize`. No rate limiting.

### Authorization
- `Role.urlPaths` / `RoleGroup` are **frontend navigation only** — the backend
  never compares a request against them (Role's own Javadoc says so).
- Real server-side checks, all of them:
  - `ActivityLogController.requireSuperAdmin()` — superadmin or
    `User.hasFullAccess()` (live DB read).
  - `DataStudioAccess` — ADMIN(superadmin) > OWNER > EDITOR/VIEWER (shares);
    invisible = 404, read-only write = 403.
  - `ReportAccess` — "is authenticated" only; `requireAuthor`/`requireRenderer`
    are placeholders awaiting roles.
  - Portal ownership — `PortalAssessmentService.requireOwnAttempt`
    (mapping.respondent == caller, assessment ACTIVE). **Exception: the
    heartbeat endpoint checks the token but not ownership.**
  - `SyncKeyGuard` — `X-Sync-Key` constant-time compare for
    `/api/sync/memorymesh/**`.
- **No tenant scoping anywhere.** Every `organizationId` seen by a controller
  is a caller-supplied filter (reports hub, exports, Data Studio dataset,
  report rules). Any authenticated caller — including a respondent's portal
  token — can read every org's data.

### Known holes (independent of ABAC, fix first)
1. With require-auth off: `/api/user-access/assign-superadmin/{id}`,
   `/api/roles`, `/api/role-groups`, `/api/practitioners/*` (including a
   second, divergent assign-superadmin pair and `update` which can rewrite
   login credentials), `/api/respondents/*`, `/api/organizations/*`,
   `/api/reports/*` (incl. XLSX export and destructive resetAssessment) are
   **anonymous-accessible**.
2. Portal tokens pass ActorFilter/ReportAccess/DataStudioAccess for dashboard
   APIs (`hasDashboardAccess` runs only at login/me).
3. `superAdmin` is trusted **from the token claim** for up to 12 h
   (ActivityLogController fast path, DataStudioAccess); disabled accounts keep
   working until expiry (ActorFilter never touches the DB).
4. ActorFilter's 401s are written outside ActivityLogFilter (+20 vs +10), so
   rejected requests are likely never audited.
5. Frontend: `/Reports/...` routes vs `/reports/*` grants are case-sensitive
   in `canAccess`; the header mega menu is not permission-filtered; no page
   hides or disables buttons per user (e.g. the Crown assign-superadmin button
   in practitioners.tsx is visible to anyone who can open the page).

### Data model facts that shape the ABAC attributes
- `User`: accountStatus, superAdmin, roleGroup (one, nullable),
  `hasFullAccess()`. **No org on User.**
- `PractitionerUser`: organizationId (nullable = independent),
  practitionerStatus (ACTIVE/INACTIVE/SUSPENDED), vertical.
- `RespondentUser`: organizationId (nullable = unaffiliated), employeeId
  (unique per org), isConsented.
- Org columns exist on: organization, organization_assessment_mapping,
  practitioner_user, respondent_user, registration_token, report_template
  (nullable, "NULL = every org"), report_computation (nullable).
- **No org column on:** User, assessment, questionnaire, question, section,
  respondent_assessment_mapping, assessment_answer, demographic_response,
  report_rule*, report_narrative, ds_* tables. Assessment↔org is M:N via
  `OrganizationAssessmentMapping`; an attempt's org derives from
  `respondent.organization`.
- Owner/creator columns: `DsWorkbook.ownerUserId`, `createdByUserId` on
  ReportTemplate/ReportComputation/ReportRule(+Version);
  `ReportComputation.approvedByUserId`.
- Status attributes: Assessment ACTIVE/INACTIVE; attempt
  NOT_STARTED/ONGOING/COMPLETED; computation
  DRAFT/READY_FOR_GENERATION/GENERATED/APPROVED/ARCHIVED; template
  DRAFT/PUBLISHED/ARCHIVED; rule ACTIVE/ARCHIVED.
- Tests: 71 classes, `@SpringBootTest` + MockMvc on H2 (Flyway off), most
  dashboard calls sent **with no token** (require-auth off in test yml);
  token-needing tests log in through the real endpoints
  (`superadmin@test.local` seeded by `SuperAdminSeeder`). Property overrides
  via `@SpringBootTest(properties=...)` (see `RequireAuthTest`).
- Migrations: V1–V49 (+V26_1). **Next is V50.**

---

## 2. The ABAC model

### Subject attributes (all derivable from existing data)
| Attribute | Source | Notes |
|---|---|---|
| `principalType` | new JWT `typ` claim | DASHBOARD / PORTAL / SYNC / ANONYMOUS |
| `userId`, `email` | token → DB | |
| `accountStatus` | User (live) | must be checked per request, not per login |
| `superAdmin` | User (live) | stop trusting the token claim for decisions |
| `permissions` | roleGroup → roles → role_permission (new) | flat keys, see catalog |
| `permissionScope` | role_permission.scope (new) | OWN_ORG / ALL_ORGS per permission |
| `organizationId` | PractitionerUser.organizationId (fallback RespondentUser's) | null = independent/unaffiliated |
| `isPractitioner`, `practitionerStatus`, `vertical` | PractitionerUser | vertical reserved, not used in v1 policies |
| `isRespondent` | RespondentUser | |

### Resource attributes
| Attribute | Where it lives |
|---|---|
| `type` | implied by endpoint/entity |
| `organizationId` | direct column where present; **derived** for assessments (OrganizationAssessmentMapping) and attempts/answers (respondent.organization) |
| `ownerUserId` / `createdByUserId` | DsWorkbook, Report* entities |
| `status` | Assessment, attempt, computation, template, rule |
| `shares` | DsWorkbookShare (EDITOR/VIEWER) |
| `sensitivity` | implicit tiers: respondent PII + answers + report PDFs > library content > config |

### Action attributes
`read`, `list`, `create`, `update`, `delete`, `assign` (allotments, org
mappings, access admin), `approve`, `generate`, `export`, `reset`
(destructive), `share`, `publish`, `sync`.

### Environment attributes — deliberately minimal in v1
IP and requestId are already captured by ActivityLogFilter for audit; they do
NOT enter decisions. No MFA exists, no device identity, no time windows.
Adding time/IP conditions later is a pure PDP change (policies are code).

### Example policies in plain English (our actual modules)
1. **Default deny:** every `/api/**` handler not explicitly marked public,
   portal, or sync requires a DASHBOARD principal with a named permission —
   enforced by a startup completeness check, so an unannotated endpoint fails
   boot, not open.
2. A PORTAL principal may call only `/api/portal/**`, and only on attempts
   whose `mapping.respondent` is the caller (closes today's hole where a
   respondent token reads the Data Studio dataset).
3. Only a superadmin may grant or revoke superadmin; the last superadmin can
   never be revoked; nobody can revoke themselves. (Server-side now; today
   this endpoint is unauthenticated.)
4. A user with `respondents.read` scoped OWN_ORG sees only respondents whose
   `respondent_user.organization_id` equals their own org; ALL_ORGS sees all.
   (NULL-org respondents: visible only to ALL_ORGS — to confirm.)
5. `reports.reset` (resetAssessment) is allowed only when the attempt's
   respondent belongs to the caller's org (or caller is ALL_ORGS) — a delete
   of answers never crosses the tenant line.
6. A report computation may be approved only by a holder of `reports.approve`
   while its status is READY_FOR_GENERATION; optionally the approver must not
   be `createdByUserId` (the "separate approver" ReportAccess already hints
   at — open question).
7. A report template with `organizationId = X` is readable/usable only by
   users scoped to X or ALL_ORGS; NULL organizationId = every org (matches
   the existing column comment).
8. A workbook is editable by its owner or an EDITOR share, readable by a
   VIEWER, invisible (404) otherwise; superadmin sees all. (Existing
   `DataStudioAccess`, restated — it becomes a policy inside the same engine.)
9. Question-bank / questionnaire / taxonomy / demographics / games content is
   a **global shared library**: reads need `library.read`, writes
   `library.write` — no org scoping (assumption to confirm).
10. Exports (Reports Hub XLSX, Data Studio `dataset/{assessmentId}`) require
    `reports.export` and the server **overwrites** any caller-supplied
    `organizationId` with the caller's scope — the parameter stops being
    trusted.

---

## 3. Design options and recommendation

### Engine
| Option | Verdict | Why |
|---|---|---|
| **Custom in-process PDP** (grow the existing `*Access` pattern) | **RECOMMENDED** | Zero new dependencies; policies are plain Java — unit-testable, reviewed in git, debuggable; follows the DataStudioAccess/ReportAccess seams the code already has; H2/MockMvc suite runs it unchanged; decision logging rides the existing ActivityRecorder queue. |
| Spring Security + `@PreAuthorize` + custom PermissionEvaluator | Viable, not now | Industry standard, but imports a framework this codebase deliberately avoided; changes 401 body shape, CSRF/CORS defaults, filter order; large test churn for little gain since we'd write the same custom evaluator anyway. Can be adopted later by moving the PDP behind an AuthorizationManager. |
| jCasbin | No | ABAC as matcher expression strings in config — our rules (status transitions, derived org, share levels) get unreadable; weak typing; another dep. |
| OPA (sidecar) | No | Second process on a single-droplet, jar-push deploy (`deploy/client/push.sh api` recreates one container); Rego learning curve; syncing org/share data into OPA is a project of its own. |
| Cerbos | No | Same sidecar objection as OPA. |
| Oso (library) | No | The embedded library is deprecated (vendor moved to hosted Oso Cloud). |
| CASL | Frontend only — and even there a flat `can(permissionKey)` helper suffices; our frontend checks are key lookups, not condition trees. |

### Policy storage
- **Policy logic: code.** Versioned, testable, atomically deployed with the
  endpoints it protects.
- **Attribute assignments: database.** `role_permission` rows (what admins
  edit), user→roleGroup (exists), org membership (exists).
- **Mode flags: config** (`app.access.mode`), same style as
  `app.security.require-auth`.

### Enforcement points (four layers, defense in depth)
1. `ActorFilter` — authentication + principal type (401).
2. New `AccessInterceptor` — coarse endpoint check: `@RequiresPermission` on
   the handler method vs the subject's permission set (403; shadow mode logs
   instead).
3. Domain guards — fine-grained resource checks (`access.require(actor,
   Action.APPROVE, computation)`) where status/owner/derived-org matters;
   `ReportAccess`/`DataStudioAccess` become callers of the same PolicyEngine.
4. Repository scoping — org-scoped list queries so rows a user can't see are
   never fetched (not filtered after the fact).
Frontend hiding is UX, never security.

### RBAC compatibility
Role groups and roles stay exactly as they are. Roles gain permission rows
beside their urlPaths (which remain, for navigation). A seed migration maps
each existing role's urlPaths to permission bundles
(`/admin/respondents` → respondents.*, `/reports/*` → reports.* +
reporting.*, `/question-bank/*` → library.*, exact `/*` → every permission
with ALL_ORGS scope). Superadmin stays a User flag and short-circuits the PDP
exactly as `hasFullAccess()` does today.

---

## 4. Permission catalog (v1)

Scope column: which scope values are meaningful for the key (ALL_ORGS always
allowed; OWN_ORG = restricted to the caller's organization).

| Key | Covers | Scopes |
|---|---|---|
| `access.manage` | roles, role-groups, user-access, superadmin toggles | — (effectively superadmin/full-access) |
| `audit.read` | activity log | — (superadmin/full-access, as today) |
| `practitioners.read` / `.write` / `.delete` | /api/practitioners | OWN_ORG, ALL_ORGS |
| `respondents.read` / `.write` / `.delete` | /api/respondents incl. bulk | OWN_ORG, ALL_ORGS |
| `organizations.read` / `.write` / `.delete` | /api/organizations CRUD | OWN_ORG (own row only), ALL_ORGS |
| `organizations.map` | member assign/unassign, assessment catalog mapping | OWN_ORG, ALL_ORGS |
| `tokens.read` / `.write` | /api/registration-tokens (getByToken stays public) | OWN_ORG, ALL_ORGS |
| `library.read` / `.write` / `.delete` | questionnaire, questions (+AI sheets), sections, demographic-fields, qualities, quality-types, games | global (no org) |
| `assessments.read` / `.write` / `.delete` | /api/assessments | OWN_ORG (via OrganizationAssessmentMapping), ALL_ORGS |
| `allotments.read` / `.write` | /api/respondent-assessments | OWN_ORG, ALL_ORGS |
| `reports.read` | Reports Hub reads, live tracking, pending submissions | OWN_ORG, ALL_ORGS |
| `reports.export` | hub XLSX exports, DS dataset endpoint | OWN_ORG, ALL_ORGS |
| `reports.reset` | resetAssessment, requeueSubmission (destructive) | OWN_ORG, ALL_ORGS |
| `reporting.setup.read` / `.write` | templates, rules, computations, item bindings authoring | OWN_ORG (template/computation org), ALL_ORGS |
| `reports.approve` | computation approve | ALL_ORGS recommended |
| `reports.generate` | generate + final PDFs | OWN_ORG, ALL_ORGS |
| `datastudio.use` | create workbooks; per-object access stays owner/share | — |

Granularity is a dial: this is ~17 modules × read/write. If you prefer
coarser (one key per sidebar section, mirroring urlPaths 1:1) or finer
(per-endpoint), the engine doesn't change — only the seed mapping and the
admin UI matrix. **Open question #9.**

## 5. Endpoint → permission map

Public (unchanged): `/api/auth/login`, `/api/portal/login`,
`/api/portal/register/**`, `/api/registration-tokens/getByToken/**`,
`/actuator/health/**`, `/actuator/info`, OPTIONS.
Portal (`@PortalEndpoint`, PORTAL principal + ownership): everything else
under `/api/portal/**` — and the heartbeat gains the ownership check.
Sync (`@SyncEndpoint`, X-Sync-Key as today): `/api/sync/memorymesh/**`.

| Controller | Endpoints | Permission |
|---|---|---|
| RoleController, RoleGroupController, UserAccessController | all | `access.manage` |
| PractitionerController | getAll/getById | `practitioners.read` |
| | create/update | `practitioners.write` (credential edits: see risks) |
| | delete | `practitioners.delete` |
| | assign/revoke-superadmin | `access.manage` — recommend deleting this duplicate pair in favor of UserAccessController's |
| RespondentController | getAll/getById/delete-check | `respondents.read` |
| | create/update/bulk-validate/bulk-create | `respondents.write` |
| | delete | `respondents.delete` |
| OrganizationController | getAll/getById/getUnassigned/getAssessments | `organizations.read` |
| | create/update | `organizations.write` |
| | delete | `organizations.delete` |
| | assign/unassign (members), assign-/unassign-assessments | `organizations.map` |
| RegistrationTokenController | getByOrganization | `tokens.read` |
| | generate/rotate/setStatus/delete | `tokens.write` |
| AssessmentController | templates/getAll/getById | `assessments.read` |
| | create/update | `assessments.write` |
| | delete | `assessments.delete` |
| RespondentAssessmentController | getAll/getByAssessmentId/getByRespondentId | `allotments.read` |
| | assign/delete | `allotments.write` |
| QuestionnaireController, QuestionController (+`/ai`), DemographicFieldController, MeasuredQuality(Type)Controller, GameController | getAll/getById/find-existing/available | `library.read` |
| | create/update/bulk/import/map-sheet/refine-sheet/resolve-paths/sections/questions PUTs | `library.write` |
| | delete/bulk-delete | `library.delete` |
| AssessmentReportController | getOrganizations/getAssessments/getRespondents/getRespondentDetail/liveTracking/pendingSubmissions | `reports.read` |
| | export/** | `reports.export` |
| | resetAssessment/requeueSubmission | `reports.reset` |
| ReportTemplateController | getAll/getById/coreFields/preview | `reporting.setup.read` |
| | create/update/bindTag/rename/publish/newVersion/delete | `reporting.setup.write` |
| ReportRuleController | reads (getAll/getById/columns/stages/portability/canRunOn/ai available) | `reporting.setup.read` |
| | writes (create/update/archive/fork/delete/import/translate/validate/dry-run/evaluate-draft) | `reporting.setup.write` |
| ReportComputationController | reads (getAll/getById/getByAssessment/recipients/check/preview) | `reporting.setup.read` |
| | create/update/forTemplate/repin/answerTag/rename/clone/archive/reopen/clearNarratives/markReady/delete | `reporting.setup.write` |
| | approve | `reports.approve` (+ status rule in domain guard) |
| | generate, report/{id}/{attemptId}.pdf | `reports.generate` |
| ReportItemBindingController | getByAssessment | `reporting.setup.read`; import/preview | `reporting.setup.write` |
| DataStudio* controllers | create workbook | `datastudio.use`; everything else keeps DataStudioAccess levels (recast as PDP policies, incl. making `hasFullAccess` count as ADMIN — today only the token's superAdmin does) |
| DataStudioQueryController | dataset/{assessmentId} | `reports.export` + forced org scope (today: any signed-in token, incl. portal) |
| ActivityLogController | getAll | `audit.read` |
| QuestionSheetController refuse() | replaced by the standard interceptor check | |

Fine-grained (domain-guard) rules on top of the table: computation approve
status + (optional) author≠approver; template org visibility; workbook
owner/share; attempt-org derivation for reset/export/respondent detail;
last-superadmin and self-revocation rules in user-access.

---

## 6. Architecture (PDP / PEP / PIP / PAP)

```
request → ActorFilter (authN: token → RequestActor{userId, principalType})
        → AccessInterceptor (PEP #1: @RequiresPermission on handler)
             → AuthContextResolver (PIP: User + profiles + permissions, memoized per request)
             → PolicyEngine (PDP: pure functions, returns Decision{allow, reason, policyId})
             → Decision → enforce (403) | shadow (log + proceed) | off
        → controller → domain guards (PEP #2: resource-attribute checks, same PDP)
        → repositories (PEP #3: org-scoped queries from OrgScope)
ActivityLogFilter ← decision fields stamped on the request attribute → audit row
PAP = Roles & Permissions page (edits role_permission rows) + code review for policy logic
```

New package `security/abac/` (names indicative):
- `PermissionKey` (enum or string constants + registry)
- `RequiresPermission` / `PublicEndpoint` / `PortalEndpoint` / `SyncEndpoint`
  annotations
- `AccessInterceptor` (WebMvcConfigurer-registered)
- `AuthContext` + `AuthContextResolver` (PIP; request-attribute memoized;
  optional 30–60 s Caffeine cache keyed by userId — start without it)
- `PolicyEngine` + per-module policy classes (pure, constructor-injected data)
- `OrgScope` (resolves ALL / org-id / NONE for a subject+permission)
- `AccessDecision` + `AccessMode` (OFF / SHADOW / ENFORCE from
  `app.access.mode`)
- `MappingCompletenessCheck` (startup bean: every `/api/**` handler carries
  exactly one of the four annotations, else the app refuses to start —
  default-deny by construction)

### JWT change
Add `typ: dash|portal` claim in `JwtService` (issue paths differ already).
Legacy tokens (no `typ`): accepted as DASHBOARD during shadow phase, rejected
for dashboard APIs once enforcement flips (12 h expiry bounds the tail).
`RequestActor` gains `principalType`. Decisions stop reading `superAdmin`
from the token — the AuthContext's live DB value is authoritative (this also
makes `accountStatus=false` bite immediately, and fixes the 12 h stale-claim
window).

### Schema changes (Flyway, next free = V50; all additive; guards at top per house rules)
- **V50** `role_permission(role_id BIGINT NOT NULL FK→role, permission_key
  VARCHAR(64) NOT NULL, scope VARCHAR(16) NOT NULL DEFAULT 'ALL_ORGS',
  PRIMARY KEY (role_id, permission_key))` + seed INSERTs derived from
  `role_url_path` (path-prefix → bundle mapping table in the migration
  comment; exact `/*` → full set).
- **V51** `activity_log` gains nullable `permission_key VARCHAR(64)`,
  `decision VARCHAR(16)` (ALLOW / DENY / SHADOW_DENY), `decision_reason
  VARCHAR(160)`. (Audit of decisions rides the existing per-request row; no
  second log table. Also fix the filter-order gap so ActorFilter 401s get a
  row.)
- No tenant columns in v1: org scoping derives through
  `respondent_user.organization_id` and `organization_assessment_mapping`
  (both already indexed via FKs). If Phase 3 answers say assessments need a
  home org, that's a later migration + backfill decision — not assumed here.
- H2/tests: entities updated in lockstep (tests build schema from entities;
  Flyway off in tests — existing convention).

### Query-level filtering strategy (list endpoints)
- `OrgScope` object passed into repository calls; two patterns:
  - scoped JPQL variants (`findAllForOrg(orgId)`) beside existing finders, or
  - JPA Specifications where filters already compose (reports hub).
- Derivations: respondents → own column; assessments →
  `join OrganizationAssessmentMapping`; attempts/answers/exports →
  `respondent.organization`; registration tokens → own column (XOR mapping);
  templates/computations → own nullable column (NULL = visible to all).
- Deliberately NOT Hibernate `@Filter`/session filters: implicit global state,
  harder to test, surprising with the existing `open-in-view: false` +
  no-service-layer style. Explicit scoped queries match the codebase.
- Convention: out-of-scope **single** resource = 404 (DataStudioAccess
  precedent — don't leak existence); missing **permission** = 403; anonymous
  = 401. Frontend already logs out on 401 only, so the distinction is
  load-bearing.

### Caching and performance
- AuthContext: 1–2 indexed queries per request (User+roleGroup fetch join;
  profiles). Memoized per request. Measure before adding the Caffeine layer;
  if added: 30–60 s TTL, keyed by userId, invalidated best-effort on
  user-access writes. Short TTL = the stale-attribute ceiling.
- Permission seeds are tiny tables; `role_permission` loads with the role
  group in one join.
- Decision logging is async via the existing ActivityRecorder queue — no new
  write path.
- No per-row policy calls in lists: scoping happens in the query, the PDP runs
  once per request plus once per touched resource.

---

## 7. Frontend plan (bodhassess-app)

- `AuthUserResponse`/`LoginResponse` gain `permissions: string[]` (urlPaths
  stay during transition). `toAuthUser` / `PractitionerMe` carry them;
  `usePractitionerAuth()` exposes `can(key: string)`.
- Route guard: keep path-based `canAccess` for compatibility; add a
  route→permission map so new grants work by permission; **fix the
  `/Reports` vs `/reports` case bug** (normalize both sides to lowercase in
  `pathMatchesPattern`); filter the mega menu with the same logic as the
  sidebar or remove its dead links; re-check `dashboardAccess` on `/auth/me`
  restore.
- Per-action gating (hide or disable + tooltip), first wave:
  - practitioners.tsx Crown button → `can('access.manage')`
  - delete buttons on respondents/organizations/assessments/library pages →
    `can('<module>.delete')`
  - Reports Hub reset + requeue → `can('reports.reset')`; exports →
    `can('reports.export')`
  - Setup approve → `can('reports.approve')`; generate →
    `can('reports.generate')`
  - role/role-group/assign pages already superadmin-only paths; also gate
    their mutating buttons on `can('access.manage')`
- Central 403 handling in `apiClient.ts`: toast "You don't have permission to
  do that" (401 behavior unchanged). Pages keep their inline error boxes.
- Admin UI (PAP): extend `pages/admin/permissions.tsx` — beside the page-path
  picker, a permission matrix (module rows × read/write/delete/special
  columns, checkboxes) + per-permission scope select (Own organization / All
  organizations). Role payload gains `permissions:[{key, scope}]`. Role
  Groups page shows the merged permission preview like it shows merged paths.
  No policy-language editor — policies are code; the UI edits assignments.
- Tests: vitest units for `can()`, route→permission mapping, and the fixed
  `pathMatchesPattern` (pure, no jsdom needed — matches existing 5 pure-logic
  test files).

---

## 8. Testing strategy

1. **PDP unit tests** (plain JUnit, no Spring): table-driven matrix —
   persona × action × resource attributes → expected decision. Personas:
   anonymous, portal respondent, SYNC, limited role (one module), own-org
   practitioner, no-org practitioner, full-access (`/*`), superadmin.
2. **Permission matrix integration test** (`@SpringBootTest` + MockMvc,
   `app.access.mode=enforce` + `require-auth=true` via properties — the
   RequireAuthTest pattern): for each module, one representative endpoint ×
   every persona, asserting 401/403/404/2xx. Personas created through the
   real APIs (role with permissions → group → assign → login), like
   RespondentDeleteAndAccessTest does today.
3. **Completeness test**: boots the context and asserts every `/api/**`
   handler is annotated (same logic as the startup check, as a test).
4. **Shadow-mode test**: mode=shadow → denied-would-be request succeeds AND
   the activity row says SHADOW_DENY with the permission key.
5. **Tenant-leak tests**: org-A practitioner lists respondents/exports/report
   hub → only org-A rows; caller-supplied `organizationId=B` is overridden;
   out-of-scope getById → 404.
6. **Token-type tests**: portal token on a dashboard API → 403 (after flip);
   legacy no-typ token behavior per phase.
7. **Regression**: test yml keeps `app.access.mode=off` until Phase 6, so the
   existing 503 tests stay green throughout; Phase 6 flips the test default
   to enforce and fixes fixtures mechanically (shared logged-in-superadmin
   helper — ~22 classes already log in; the rest gain a header).

---

## 9. Phased rollout, risks, estimates — see the chat summary

The phase checklist, security-risk register, effort estimates, assumptions and
open questions were delivered in the chat message alongside this file; fold
the user's answers back into this doc before implementation starts.
