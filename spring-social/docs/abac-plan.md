# ABAC (Attribute-Based Access Control) — implementation plan

Status: PROPOSAL, first written 2026-10-09, **revised 2026-10-14 with the
user's decisions folded in**. Nothing here is implemented: no `security/abac`
package, no `app.access` property, no `typ` claim exist yet (verified
2026-10-14). This file is the thing we build from; §9 is the build order.

## Decisions from the user

### 2026-10-09
1. **Full multi-tenancy.** An organization sees only its own users, results,
   and content. The library (questionnaires, questions, demographic fields,
   qualities, games, report rules, etc.) is NOT global — content belongs to
   the org whose practitioner/user created it, or to orgs it is assigned to.
2. **Every practitioner gets an organization**, including solo practitioners.
3. `Vertical` stays **display-only** — no vertical-based policies in v1.
4. Phase 0 starts only on the user's explicit go-ahead.

### 2026-10-14 (finalised in discussion)
5. **Build in three stages, A → B → C** (§9): A = authentication hardening +
   permission keys + endpoint enforcement, no org logic; B = tenancy for
   PEOPLE and RESULTS (columns already exist); C = tenancy for LIBRARY
   content (new owner-org columns). Enforcement never waits on a data-model
   decision.
6. **Scope is PER ROLE, not per permission.** A role is either an
   ORGANIZATION role (sees ONLY its own org's data — not even read access to
   another org's) or a PLATFORM role (sees every org). Permissions inside the
   role say what actions are allowed. The plan's original per-permission
   scope column is dropped; it can return later by moving one column, the
   engine does not change.
7. **Permission keys = module × read/write/delete** (the §4 catalog, ~17
   modules), not per-sidebar-section and not per-endpoint.
8. **NULL owner org on library content = platform content**: readable by
   every org, writable by platform roles only.
9. **Legacy backfill: existing library rows stay NULL** (platform content).
   No house org.
10. **Solo practitioner org: the organization becomes REQUIRED on the
    practitioner form, with an inline "create new organization"** — explicit,
    never silently auto-created. Editing a legacy org-less practitioner means
    picking one (same trade as the phone/name rules).
11. **MemoryMesh-synced respondents: left as is for now** — they arrive with
    no org and are visible only to platform roles. Deferred, see §9.5.
12. **Author ≠ approver rule: OFF in v1**, written but flag-gated.
13. **Cross-org library reach = through assigned assessments only.** An org
    can READ any library content that reaches it through an assessment mapped
    to it (OrganizationAssessmentMapping), so results, exports and previews
    stay readable when one assessment is assigned to two orgs. Only the
    owning org (or a platform role) EDITS it. No separate "share with org"
    mechanism in v1.
14. **Delete the duplicate assign/revoke-superadmin pair** in
    PractitionerController (practitioner id, does NOT clear the role group) in
    favour of UserAccessController's (any user id, clears the group). The
    Crown button in practitioners.tsx moves to the user-access endpoint using
    the practitioner's user id.
15. **Shadow rollout, about one week** in production before enforce (§9.4).
16. **Live DB for the ABAC migrations is the LOCAL 3306 container**, not the
    staging tunnel.

---

## 1. What exists today (baseline, re-verified 2026-10-14)

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
  `${REQUIRE_AUTH:false}`. REQUIRE_AUTH is still not set in `deploy/`** — so
  in practice nearly every endpoint answers anonymous callers.
- No Spring Security dependency. No `@PreAuthorize`. No rate limiting.
- **Both frontends attach the bearer on every call** (dashboard: the axios
  `apiClient.ts` interceptor and the legacy `lib/api.ts` fetch helper; no
  stray `axios.create` or raw fetch anywhere). Flipping require-auth on
  breaks no page — the Phase 0 risk the 2026-10-09 plan named is gone.

### Authorization
- `Role.urlPaths` / `RoleGroup` are **frontend navigation only** — the backend
  never compares a request against them (Role's own Javadoc says so).
- Real server-side checks, all of them:
  - `ActivityLogController.requireSuperAdmin()` — superadmin or
    `User.hasFullAccess()` (live DB read).
  - `DataStudioAccess` — ADMIN(superadmin, **from the token claim**) > OWNER >
    EDITOR/VIEWER (shares); invisible = 404, read-only write = 403.
  - `ReportAccess` — "is authenticated" only; `requireAuthor`/`requireRenderer`
    are placeholders awaiting roles.
  - Portal ownership — `PortalAssessmentService.requireOwnAttempt`
    (mapping.respondent == caller, assessment ACTIVE). **Exception: the
    heartbeat endpoint checks the token but not ownership at write time**
    (the tracking read discards heartbeats whose userId is not the attempt's
    respondent, so the hole is noise, not a leak — still closed in A0).
  - `SyncKeyGuard` — `X-Sync-Key` constant-time compare for
    `/api/sync/memorymesh/**`.
- **No tenant scoping anywhere.** Every `organizationId` seen by a controller
  is a caller-supplied filter (reports hub, exports, Data Studio dataset,
  report rules). Any authenticated caller — including a respondent's portal
  token — can read every org's data.

### Known holes (independent of ABAC, all still open on 2026-10-14; fixed in A0)
1. With require-auth off: `/api/user-access/assign-superadmin/{id}`,
   `/api/roles`, `/api/role-groups`, `/api/practitioners/*` (including the
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
5. Frontend: `routes/index.tsx` registers `/Reports`, `/Reports/hub`,
   `/Reports/responses` (capital R) while grants are `/reports/*` and
   `canAccess` is case-sensitive; the header mega menu is not
   permission-filtered; no page hides or disables buttons per user (e.g. the
   Crown assign-superadmin button in practitioners.tsx is visible to anyone
   who can open the page).

### Data model facts that shape the ABAC attributes
- `User`: accountStatus, superAdmin, roleGroup (one, nullable),
  `hasFullAccess()`. **No org on User.**
- `PractitionerUser`: organizationId (nullable = independent; the create
  endpoint still accepts null — decision 10 changes that),
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
- Size: **36 `@RestController`s, 246 handler methods** under `/api` (12 of
  them portal + sync). Tests: **72 classes**, `@SpringBootTest` + MockMvc on
  H2 (Flyway off); **42 classes already log in** through the real endpoints
  (`superadmin@test.local` seeded by `SuperAdminSeeder`), the other 30 send
  no token (require-auth off in test yml). Property overrides via
  `@SpringBootTest(properties=...)` (see `RequireAuthTest`).
- Migrations: V1–V52 (+V26_1) applied. **Next free is V53.**

---

## 2. The ABAC model

### Subject attributes (all derivable from existing data)
| Attribute | Source | Notes |
|---|---|---|
| `principalType` | new JWT `typ` claim | DASHBOARD / PORTAL / SYNC / ANONYMOUS |
| `userId`, `email` | token → DB | |
| `accountStatus` | User (live) | checked per request, not per login |
| `superAdmin` | User (live) | stop trusting the token claim for decisions |
| `permissions` | roleGroup → roles → role_permission (new) | flat keys, union across the group's roles, see catalog |
| `roleScope` | Role.scope (new): ORG / PLATFORM | the group's EFFECTIVE scope is PLATFORM if ANY of its roles is PLATFORM — widening by union, same as permissions (decision 6) |
| `organizationId` | PractitionerUser.organizationId, fallback RespondentUser's | null = independent/unaffiliated; an ORG-scoped subject with null org resolves to scope NONE |
| `isPractitioner`, `practitionerStatus`, `vertical` | PractitionerUser | vertical reserved, not used in v1 policies |
| `isRespondent` | RespondentUser | |

### Resource attributes
| Attribute | Where it lives |
|---|---|
| `type` | implied by endpoint/entity |
| `organizationId` | direct column where present; **derived** for assessments (OrganizationAssessmentMapping, + owner column in Stage C) and attempts/answers (respondent.organization) |
| `reachableByOrg` | Stage C: library content reachable through an assessment mapped to the org (decision 13) |
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

### Policies in plain English (our actual modules)
1. **Default deny:** every `/api/**` handler not explicitly marked public,
   portal, or sync requires a DASHBOARD principal with a named permission —
   enforced by a startup completeness check, so an unannotated endpoint fails
   boot, not open.
2. A PORTAL principal may call only `/api/portal/**`, and only on attempts
   whose `mapping.respondent` is the caller (closes today's hole where a
   respondent token reads the Data Studio dataset).
3. Only a superadmin may grant or revoke superadmin; the last superadmin can
   never be revoked; nobody can revoke themselves. (Server-side now; today
   this endpoint is unauthenticated.) ONE endpoint pair, in
   UserAccessController (decision 14).
4. **Org scope (decision 6):** a subject whose effective scope is ORG sees
   rows whose org is their own org and nothing else — not even read access.
   PLATFORM sees all. NULL-org people rows (legacy, MemoryMesh-synced) are
   visible only to PLATFORM. An ORG subject with no org of their own sees
   nothing (empty lists, 404 singles) until an admin gives them one.
5. `reports.reset` (resetAssessment) is allowed only when the attempt's
   respondent belongs to the caller's org (or caller is PLATFORM) — a delete
   of answers never crosses the tenant line.
6. A report computation may be approved only by a holder of `reports.approve`
   while its status is READY_FOR_GENERATION. The author≠approver check is
   written behind `app.access.separate-approver` and OFF (decision 12).
7. A report template with `organizationId = X` is readable/usable only by
   subjects scoped to X or PLATFORM; NULL organizationId = every org (matches
   the existing column comment).
8. A workbook is editable by its owner or an EDITOR share, readable by a
   VIEWER, invisible (404) otherwise; superadmin / full-access sees all
   (today only the TOKEN's superAdmin does — fixed in Stage A). (Existing
   `DataStudioAccess`, restated — it becomes a policy inside the same engine.)
9. **Library content is org-owned (Stage C):** a row is visible to the org
   that owns it (owner-org column, new), to every org when the owner is NULL
   (platform content, decision 8), and to any org it REACHES through an
   assessment mapped to that org (decision 13). Reads need `library.read`
   within that visibility; writes `library.write` and only on rows the
   caller's org owns; platform content is writable by PLATFORM only.
10. Exports (Reports Hub XLSX, Data Studio `dataset/{assessmentId}`) require
    `reports.export` and the server **replaces** any caller-supplied
    `organizationId` with the caller's scope — the parameter stops being
    trusted.
11. `access.manage` and `audit.read` are PLATFORM-only: roles and role groups
    are global rows with no org, and the activity log spans every tenant. An
    ORG role carrying either key is denied those endpoints; the admin UI
    greys the two keys when the role's scope is Organization.

---

## 3. Design options and recommendation

### Engine
| Option | Verdict | Why |
|---|---|---|
| **Custom in-process PDP** (grow the existing `*Access` pattern) | **CHOSEN** | Zero new dependencies; policies are plain Java — unit-testable, reviewed in git, debuggable; follows the DataStudioAccess/ReportAccess seams the code already has; H2/MockMvc suite runs it unchanged; decision logging rides the existing ActivityRecorder queue. |
| Spring Security + `@PreAuthorize` + custom PermissionEvaluator | Viable, not now | Industry standard, but imports a framework this codebase deliberately avoided; changes 401 body shape, CSRF/CORS defaults, filter order; large test churn for little gain since we'd write the same custom evaluator anyway. Can be adopted later by moving the PDP behind an AuthorizationManager. |
| jCasbin | No | ABAC as matcher expression strings in config — our rules (status transitions, derived org, share levels) get unreadable; weak typing; another dep. |
| OPA (sidecar) | No | Second process on a single-droplet, jar-push deploy (`deploy/client/push.sh api` recreates one container); Rego learning curve; syncing org/share data into OPA is a project of its own. |
| Cerbos | No | Same sidecar objection as OPA. |
| Oso (library) | No | The embedded library is deprecated (vendor moved to hosted Oso Cloud). |
| CASL | Frontend only — and even there a flat `can(permissionKey)` helper suffices; our frontend checks are key lookups, not condition trees. |

### Policy storage
- **Policy logic: code.** Versioned, testable, atomically deployed with the
  endpoints it protects.
- **Attribute assignments: database.** `role_permission` rows + `role.scope`
  (what admins edit), user→roleGroup (exists), org membership (exists).
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
Role groups and roles stay exactly as they are. A role gains permission rows
and ONE scope flag beside its urlPaths (which remain, for navigation). A seed
migration maps each existing role's urlPaths to permission bundles (§6) and
stamps every EXISTING role `PLATFORM` — today's roles were built for internal
staff and nothing may lose visibility at the flip; the admin tightens org
roles afterwards, before Stage B enforces scope. NEW roles must state a
scope (request field required, the UI defaults to Organization). Superadmin
stays a User flag and short-circuits the PDP exactly as `hasFullAccess()`
does today.

---

## 4. Permission catalog (v1, decision 7)

Scope is on the ROLE (decision 6), so the table no longer carries a scope
column. "Platform only" marks keys an ORG role cannot use (policy 11).

| Key | Covers | Notes |
|---|---|---|
| `access.manage` | roles, role-groups, user-access, superadmin toggles | platform only |
| `audit.read` | activity log | platform only |
| `practitioners.read` / `.write` / `.delete` | /api/practitioners | |
| `respondents.read` / `.write` / `.delete` | /api/respondents incl. bulk | |
| `organizations.read` / `.write` / `.delete` | /api/organizations CRUD | ORG scope = own row only; `.delete` effectively platform |
| `organizations.map` | member assign/unassign, assessment catalog mapping | ORG scope = own org only |
| `tokens.read` / `.write` | /api/registration-tokens (getByToken stays public) | |
| `library.read` / `.write` / `.delete` | questionnaire, questions (+AI sheets), sections, demographic-fields, qualities, quality-types, games | Stage C adds owner/reach visibility |
| `assessments.read` / `.write` / `.delete` | /api/assessments | ORG scope = mapped to my org (B) + owned (C) |
| `allotments.read` / `.write` | /api/respondent-assessments | |
| `reports.read` | Reports Hub reads, live tracking, pending submissions | |
| `reports.export` | hub XLSX exports, DS dataset endpoint | |
| `reports.reset` | resetAssessment, requeueSubmission (destructive) | |
| `reporting.setup.read` / `.write` | templates, rules, computations, item bindings authoring | template/computation org column |
| `reports.approve` | computation approve | |
| `reports.generate` | generate + final PDFs | |
| `datastudio.use` | create workbooks; per-object access stays owner/share | |

Keys are a Java enum (`PermissionKey`) whose `key()` string is what
`role_permission.permission_key` stores and what the frontend's `can()`
receives; an unknown string in the DB is logged and ignored, never a boot
failure (a key removed in code must not brick login).

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
| | assign/revoke-superadmin | **DELETED** (decision 14) — UserAccessController's pair is the only door |
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
status (+ flag-gated author≠approver); template org visibility; workbook
owner/share; attempt-org derivation for reset/export/respondent detail;
last-superadmin and self-revocation rules in user-access.

---

## 6. Architecture (PDP / PEP / PIP / PAP)

```
request → ActorFilter (authN: token → RequestActor{userId, principalType})
        → AccessInterceptor (PEP #1: @RequiresPermission on handler)
             → AuthContextResolver (PIP: User + profiles + permissions + scope, memoized per request)
             → PolicyEngine (PDP: pure functions, returns Decision{allow, reason, policyId})
             → Decision → enforce (403) | shadow (log + proceed) | off
        → controller → domain guards (PEP #2: resource-attribute checks, same PDP)
        → repositories (PEP #3: org-scoped queries from OrgScope)
ActivityLogFilter ← decision fields stamped on the request attribute → audit row
PAP = Roles & Permissions page (edits role_permission rows + role.scope) + code review for policy logic
```

New package `security/abac/` (names indicative):
- `PermissionKey` (enum, see §4) and `RoleScope` (enum ORG / PLATFORM)
- `RequiresPermission` / `PublicEndpoint` / `PortalEndpoint` / `SyncEndpoint`
  annotations
- `AccessInterceptor` (WebMvcConfigurer-registered `HandlerInterceptor`)
- `AuthContext` + `AuthContextResolver` (PIP; request-attribute memoized;
  optional 30–60 s Caffeine cache keyed by userId — start without it)
- `PolicyEngine` + per-module policy classes (pure, constructor-injected data)
- `OrgScope` (resolves ALL / ORG(id) / NONE for a subject — Stage B)
- `AccessDecision` + `AccessMode` (OFF / SHADOW / ENFORCE from
  `app.access.mode`, env `ACCESS_MODE`)
- `MappingCompletenessCheck` (startup bean: every `/api/**` handler carries
  exactly one of the four annotations, else the app refuses to start —
  default-deny by construction)

### JWT change
Add `typ: dash|portal` claim in `JwtService` (issue paths differ already).
Legacy tokens (no `typ`): accepted as DASHBOARD while `app.access.mode` is
OFF or SHADOW, rejected for dashboard APIs once ENFORCE (12 h expiry bounds
the tail; worst case one re-login). `RequestActor` gains `principalType`.
Decisions stop reading `superAdmin` from the token — the AuthContext's live
DB value is authoritative (this also makes `accountStatus=false` bite
immediately, and fixes the 12 h stale-claim window).

### Schema changes (Flyway; next free = V53; all additive; guards at top per house rules)
- **V53** (Stage A) `role_permission(role_id BIGINT NOT NULL FK→role,
  permission_key VARCHAR(64) NOT NULL, PRIMARY KEY (role_id,
  permission_key))` + `role.scope VARCHAR(16) NOT NULL DEFAULT 'PLATFORM'`
  (existing rows become PLATFORM, §3) + seed INSERTs derived from
  `role_url_path`:

  | urlPath prefix (as stored today) | permission bundle |
  |---|---|
  | exact `/*` | every key |
  | `/admin/permissions`, `/admin/role-groups`, `/admin/assign-role-group` | `access.manage` |
  | `/admin/activity-log` | `audit.read` |
  | `/admin/practitioners` | `practitioners.*` |
  | `/admin/respondents` | `respondents.*` |
  | `/admin/entity-registrations` (the Organizations page) | `organizations.*`, `tokens.*` |
  | `/admin/live-tracking` | `reports.read` |
  | `/admin/groups` | `library.read`, `reports.read` (legacy page) |
  | `/question-bank/*`, `/questionnaires/*` | `library.*` |
  | `/assessment-library/*`, `/assessments/*` | `assessments.*`, `allotments.*`, `organizations.map` |
  | `/reports/hub`, `/reports/responses`, `/reports` | `reports.read`, `reports.export`, `reports.reset` |
  | `/reports/setup`, `/reports/rules`, `/reports/templates` | `reporting.setup.*`, `reports.approve` |
  | `/reports/generate` | `reports.generate` |
  | `/data-studio` | `datastudio.use` |
  | `/admin/*`, `/reports/*`, `/question-bank/*` etc. (section wildcards) | the union of that section's rows above |
  | everything else (`/clinical/*`, `/compliance/*`, `/settings/*`, `/white-label/*`, `/analytics`, `/survey`, `/dashboard`, `/admin/data-grid`) | no key — these pages call no protected API yet |

  Written as plain INSERT … SELECT per prefix so the mapping is readable in
  the migration itself; the Java enum is the source of truth for key names
  and a test asserts the migration's keys ⊆ the enum.
- **V54** (Stage A) `activity_log` gains nullable `permission_key
  VARCHAR(64)`, `decision VARCHAR(16)` (ALLOW / DENY / SHADOW_DENY),
  `decision_reason VARCHAR(160)`. (Audit of decisions rides the existing
  per-request row; no second log table. Also fix the filter-order gap so
  ActorFilter 401s get a row.)
- **Stage B: no schema change.** People and results already carry org
  columns or derive one (`respondent_user.organization_id`,
  `practitioner_user.organization_id`, `organization_assessment_mapping`,
  `registration_token`, `report_template`, `report_computation`).
- **V55+ (Stage C, decisions 1, 8, 9, 13):** nullable `organization_id`
  owner columns on `questionnaire`, `question`, `demographic_field`,
  `measured_quality`, `game`, `assessment`, `report_rule`, each its own
  migration (guard at top; no tightening). `measured_quality_type` derives
  from its MQ; `section`, `questionnaire_question`, options, scores, answers
  derive from their parent — no column. Backfill: existing rows stay NULL =
  platform content (decision 9). Columns stay nullable by design (NULL is a
  meaning, not a gap).
- H2/tests: entities updated in lockstep (tests build schema from entities;
  Flyway off in tests — existing convention).

### Query-level filtering strategy (list endpoints)
- `OrgScope` object passed into repository calls; two patterns:
  - scoped JPQL variants (`findAllForOrg(orgId)`) beside existing finders, or
  - JPA Specifications where filters already compose (reports hub).
- Derivations: respondents/practitioners → own column; assessments → mapped
  to the org via `OrganizationAssessmentMapping` (Stage B; an ORG-scoped
  CREATE auto-maps the new assessment to the caller's org or they could never
  see it again) + owner column (Stage C); library content → owner column,
  NULL, or reachable through a mapped assessment (Stage C);
  attempts/answers/exports → `respondent.organization`; registration tokens →
  own column; templates/computations → own nullable column (NULL = visible to
  all). The Assign Role Group page (`findAllForAccess`) is behind
  `access.manage`, which is PLATFORM-only — an every-identity listing leaks
  other tenants' users otherwise.
- Caller-supplied `organizationId` filters: under ORG scope the value is
  REPLACED with the caller's org, never compared — a wrong value yields the
  caller's own data, not a 403 that confirms another org's id exists.
- Deliberately NOT Hibernate `@Filter`/session filters: implicit global state,
  harder to test, surprising with the existing `open-in-view: false` +
  no-service-layer style. Explicit scoped queries match the codebase.
- Convention: out-of-scope **single** resource = 404 (DataStudioAccess
  precedent — don't leak existence); missing **permission** = 403; anonymous
  = 401. Frontend already logs out on 401 only, so the distinction is
  load-bearing.

### Caching and performance
- AuthContext: 1–2 indexed queries per request (User+roleGroup+roles+
  permissions fetch join; profiles). Memoized per request. Measure before
  adding the Caffeine layer; if added: 30–60 s TTL, keyed by userId,
  invalidated best-effort on user-access writes. Short TTL = the
  stale-attribute ceiling.
- Permission seeds are tiny tables; `role_permission` loads with the role
  group in one join.
- Decision logging is async via the existing ActivityRecorder queue — no new
  write path.
- No per-row policy calls in lists: scoping happens in the query, the PDP runs
  once per request plus once per touched resource.

---

## 7. Frontend plan (bodhassess-app)

- `AuthUserResponse`/`LoginResponse` gain `permissions: string[]` and
  `scope: 'ORG' | 'PLATFORM'` (urlPaths stay during transition).
  `toAuthUser` / `PractitionerMe` carry them; `usePractitionerAuth()`
  exposes `can(key: string)` and `isPlatform`.
- Route guard: keep path-based `canAccess` for compatibility; add a
  route→permission map so new grants work by permission; **fix the
  `/Reports` vs `/reports` case bug** (normalize both sides to lowercase in
  `pathMatchesPattern`, and lower-case the three route paths); filter the
  mega menu with the same logic as the sidebar or remove its dead links;
  re-check `dashboardAccess` on `/auth/me` restore.
- Per-action gating (hide or disable + tooltip), first wave:
  - practitioners.tsx Crown button → `can('access.manage')`, and it now
    calls `/api/user-access/assign-superadmin/{userId}` with the
    practitioner's USER id (decision 14)
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
- Admin UI (PAP): extend `pages/admin/permissions.tsx` — a scope radio
  ("This organization only" / "All organizations", default the first) above
  a permission matrix (module rows × read/write/delete/special columns,
  checkboxes; `access.manage` and `audit.read` greyed under Organization),
  beside the existing page-path picker. Role payload gains `scope` and
  `permissions: string[]`. Role Groups page shows the merged permission
  preview and the effective scope like it shows merged paths. No
  policy-language editor — policies are code; the UI edits assignments.
- Practitioner form (Stage B, decision 10): organization becomes required,
  with an inline "New organization…" that opens the existing org create
  form and selects the result.
- Tests: vitest units for `can()`, route→permission mapping, and the fixed
  `pathMatchesPattern` (pure, no jsdom needed — matches existing 5 pure-logic
  test files).

---

## 8. Testing strategy

1. **PDP unit tests** (plain JUnit, no Spring): table-driven matrix —
   persona × action × resource attributes → expected decision. Personas:
   anonymous, portal respondent, SYNC, limited ORG role (one module), ORG
   role with no org, limited PLATFORM role, full-access (`/*`), superadmin,
   disabled account.
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
5. **Tenant-leak tests** (Stage B/C): org-A practitioner lists
   respondents/exports/report hub → only org-A rows; caller-supplied
   `organizationId=B` is replaced; out-of-scope getById → 404; org-B reads a
   questionnaire reachable through a shared assessment but its update → 404.
6. **Token-type tests**: portal token on a dashboard API → 403 (after flip);
   legacy no-typ token behavior per mode.
7. **Regression**: test yml keeps `app.access.mode=off` until the end of
   Stage A, so the existing suite stays green throughout; the last Stage A
   step flips the test default to enforce and fixes fixtures mechanically
   (shared logged-in-superadmin helper — 42 classes already log in; the
   other 30 gain a header).

---

## 9. Stages, rollout, risks (decisions 5, 15, 16)

The one-line rule for ordering: **close the anonymous door first, seal the
people data second, seal the library last**, because that is the order of
damage if we stop half way.

### 9.1 Stage A — authentication + permissions, no org logic

Deliverable: every dashboard endpoint needs a dashboard token holding a
named permission; portal tokens are confined to `/api/portal/**`; superadmin
and account status are read live; every decision is audited. An ORG role
and a PLATFORM role behave identically in this stage (scope is stored, not
yet applied).

- **A0 — pre-work, each an independent fix, no ABAC code:**
  delete the PractitionerController superadmin pair and move the Crown
  button (decision 14); add `requireOwnAttempt` to the portal heartbeat;
  lower-case the three `/Reports` routes and normalise `pathMatchesPattern`;
  move ActorFilter's 401 inside ActivityLogFilter's order so rejections are
  audited; set `REQUIRE_AUTH=true` in `deploy/targets/production.env` and
  deploy (both clients already send the token — §1).
- **A1 — JWT `typ`** claim, `RequestActor.principalType`, legacy-token rule
  as in §6.
- **A2 — V53** `role_permission` + `role.scope` + seed (§6 table).
  `Role`/`RoleRequest`/`RoleResponse` gain `scope` (required on the request)
  and `permissions`; `RoleGroupResponse` gains the merged set + effective
  scope; login and `/auth/me` responses gain `permissions` + `scope`.
- **A3 — `security/abac/`**: `PermissionKey`, `RoleScope`, the four
  annotations, `AccessMode`, `AuthContext`/`AuthContextResolver` (live User +
  roleGroup + roles + permissions + profiles), `PolicyEngine` (Stage A rules:
  principal type, account status, superadmin/full-access short-circuit,
  permission membership, platform-only keys), `AccessInterceptor`,
  `MappingCompletenessCheck`.
- **A4 — annotate all 246 handlers** per §5. `ActivityLogController.
  requireSuperAdmin`, `QuestionSheetController.refuse`,
  `ReportAccess.requireActor` become annotations; `DataStudioAccess.levelOf`
  reads the live AuthContext (`hasFullAccess` counts as ADMIN).
- **A5 — V54** activity_log decision columns; `ActivityLogFilter` stamps the
  decision from the request attribute.
- **A6 — frontend**: `can()`, permissions page (scope radio + matrix), Role
  Groups preview, route→permission map, first-wave button gating, 403 toast
  (§7).
- **A7 — tests** (§8 items 1–4, 6) and the suite flip (§8 item 7).
- **A8 — rollout**: deploy with `ACCESS_MODE=shadow`; read the activity log
  for `SHADOW_DENY` rows for about a week (decision 15); fix seeds/grants
  for the expected ones; flip `ACCESS_MODE=enforce` (restart, no deploy);
  rollback = `shadow`.

### 9.2 Stage B — tenancy for people and results

Deliverable: an ORG-scoped subject sees only their org's practitioners,
respondents, organization row, registration links, allotments, attempts,
reports, exports, templates/computations; every caller-supplied
`organizationId` is replaced by the subject's.

- **B1 — `OrgScope`** resolution (ALL / ORG(id) / NONE) in the AuthContext.
- **B2 — scoped finders + guards** for: RespondentController,
  PractitionerController, OrganizationController (own row; `getUnassigned`
  → platform only, an org has no "unassigned" view of the world),
  RegistrationTokenController, RespondentAssessmentController,
  AssessmentController (mapped-to-my-org; ORG create auto-maps),
  AssessmentReportController (every read, export, reset, detail via
  `respondent.organization`), live tracking / pending submissions,
  `DataStudioQueryController.dataset`, ReportTemplate/Computation (own
  column, NULL visible), delivery recipients (an ORG subject generates only
  for attempts of its own org).
- **B3 — practitioner form**: organization required + inline create
  (decision 10); `PractitionerRequest.organizationId` `@NotNull`; a
  pre-flight query lists legacy org-less practitioners for the admin to fix
  BEFORE the flip (they would otherwise see nothing under an ORG role).
- **B4 — admin tightening**: the admin reviews every role seeded PLATFORM in
  V53 and switches the ones that belong to customer orgs to Organization.
  Until that is done, Stage B enforces nothing new for them — which is the
  safe direction.
- **B5 — tests**: §8 item 5 for people/results.
- **B6 — rollout**: no new mode flag; Stage B rules go live the moment a role
  is switched to ORG, so the admin flips roles one at a time, watching the
  log. (A `SHADOW_DENY` row is still written for scope denials when
  `ACCESS_MODE=shadow`, so an org role can be rehearsed in shadow first.)

**Interim state between B and C, stated plainly:** people and results are
sealed per org; library content (questionnaires, questions, qualities,
demographic fields, games, report rules) is still visible to every signed-in
dashboard user with `library.read`. Accepted by decision 5.

### 9.3 Stage C — tenancy for library content

Deliverable: library rows carry an owner org; an ORG subject sees own +
platform (NULL) + reachable-through-assigned-assessment rows; edits only own.

- **C1 — V55+** one migration per table (§6).
- **C2 — owner on create**: ORG subject → own org (any request value
  ignored); PLATFORM subject → NULL (platform content) unless the request
  names an `organizationId`, so platform staff can author on an org's
  behalf.
- **C3 — visibility queries**: own OR NULL OR EXISTS(assessment mapped to my
  org → questionnaire → placement → question / section / demographic field /
  quality via scores / game via option). Bank-wide reads
  (`findByParentQuestionIsNull`, `findAllStems`, `StemMatcher`/find-existing,
  `resolve-paths` candidates, Data Studio catalog) all get scoped variants —
  a stem match across orgs is a leak.
- **C4 — writes**: owner only; platform content writable by PLATFORM only;
  out-of-scope update/delete = 404.
- **C5 — report rules**: owner column; library rules (NULL) readable by all;
  `fork` copies into the caller's org (today it already copies — it gains
  the owner).
- **C6 — assessment owner column** joins the Stage B mapping rule
  (visible = owned OR mapped).
- **C7 — tests**: §8 item 5 for library, incl. the reach-through case.
- **C8 — rollout**: same as B — no flag; rules bite per ORG role; rehearsed
  in shadow first.

### 9.4 Production rollout rules
- Order of switches: `REQUIRE_AUTH=true` (A0) → `ACCESS_MODE=shadow` (A8) →
  `ACCESS_MODE=enforce` → roles switched to ORG one by one (B6, C8).
- Every switch is an env var + restart (`deploy/targets/production.env`,
  push.sh), never a code change; rollback is the previous value.
- Shadow window: about one week (decision 15), or until a full week of
  activity-log rows shows no unexpected `SHADOW_DENY`.
- Migrations V53+ are first applied to the LOCAL 3306 container (decision
  16), then ride the normal jar deploy to production.

### 9.5 Deferred (not in v1, recorded so they are not re-litigated)
- MemoryMesh-synced respondents' org home (decision 11): a configured
  default org or an org id on the sync wire. Until then they are visible
  only to PLATFORM roles.
- Per-permission scope (decision 6): the column moves from `role` to
  `role_permission` if a real mixed role appears.
- A "share this questionnaire with org X" mechanism (decision 13).
- Author ≠ approver (decision 12): flag flip only.
- Caffeine cache for AuthContext: measure first (§6).
- IP / time-window conditions: pure PDP additions (§2).
- Spring Security adoption: the PDP is shaped to slot behind an
  `AuthorizationManager` if ever wanted (§3).

### 9.6 Risk register
| Risk | Stage | Mitigation |
|---|---|---|
| A missed grant locks a whole role out at enforce | A | shadow week + completeness check + matrix test per module |
| Existing roles seeded PLATFORM are over-broad until tightened | A→B | V53 prints the role list; B4 is an explicit admin step before any ORG switch |
| Legacy org-less practitioner under an ORG role sees nothing | B | B3 pre-flight list; org required on edit |
| Interim B→C: library visible across orgs | B | stated and accepted (decision 5); C is next |
| Legacy tokens rejected at enforce | A | 12 h expiry; one re-login; announce the flip |
| Reach-through queries slow on large banks | C | EXISTS over FK-indexed joins; measure on the staging copy before enforce |
| `PractitionerController.update` can rewrite login credentials | A | behind `practitioners.write`; a later change should split credential edits from profile edits |
| Redis-cached `PortalQuestionnaireContent` is shared across orgs | — | it carries no org or person data; portal access is ownership-based, unchanged |
| Disabled account keeps a valid token | A | AuthContext reads `accountStatus` live per request |

### 9.7 Effort (working days, one developer, incl. tests and smoke)
| Stage | Estimate |
|---|---|
| A0 pre-work | 1 |
| A1–A5 backend | 3–4 |
| A6 frontend | 1–2 |
| A7 tests + suite flip | 1–2 |
| B | 3–4 |
| C | 5–7 |

Numbers are for planning, not promises; A4 (annotating 246 handlers) is the
one mechanical slog and is where the completeness check pays for itself.
