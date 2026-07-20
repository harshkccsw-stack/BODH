# BodhAssess — Full Codebase Context (A–Z read, 2026-07-20)

Produced by 14 parallel Opus readers covering every code file in `bodhassess-api-v2`
(backend, 117 files) and `bodhassess-app` (frontend, ~830 code files; 992 binary
media assets inventoried, not read). Per-area digests live beside this file
(B1–B4 backend, F1–F10 frontend). This document is the cross-cutting synthesis.

---

## 1. The two systems in one sentence each

- **bodhassess-api-v2** — a complete, coherent, tested Spring Boot 3 / Java 17
  backend on the rebuilt 37-table model (port 8081, `/api/v2`), with JWT +
  DB-read RBAC, Flyway V1 baseline + V2 legacy-data migration, 14/14 tests green.
- **bodhassess-app** — a Vite + React 19 Metronic-template admin SPA whose
  living core is much smaller than its file count: one active layout (layout-1),
  one typed API client (`lib/api.ts`, 1292 lines, ~60 endpoint families, all
  legacy `/api/v1`), ~15 genuinely wired page areas, and a long tail of static
  mocks and stock template dead code.

## 2. What is real vs mock in the frontend

**Real, API-wired:** dashboard; login/auth (`/auth/login` email+DOB → token +
`user.url_paths` RBAC); admin console (respondents + bulk CSV, practitioners,
roles/permissions, groups, entity-registrations + drill-in, live-tracking 5s
poll, data-grid with audited cell edits); questionnaire authoring (3060-line
`create-questionnaire.tsx` wizard — MQ/MQT scoring, sections, CSV import,
publish = 3 writes); questionnaire library + git-style versioning
(`questionnaire-records`/versions, draft→commit→set-current); item explorer;
demographic fields registry; assessments (AssessmentRecord create/edit/status +
3 allotment kinds with entity caps, invite tokens + QR); per-assessment session
lists + reset; reports (`/reports`, `/reports/responses` — client re-derives
per-question MQT contributions); data-studio (workbooks/sheets/derived-column
formulas/dashboards/widgets/shares); portal pages (login/assessments/take/
complete — relocated to standalone `bodhassess-portal` app; only
`/preview/:versionId` still routed here).

**Static mock / scaffold (no API):** settings/* (tenant, integrations, tiers),
white-label/* (tenants in-memory only, branding, api), experiments/*,
compliance/* (all 4), counselling/* (all 4, hardcoded demo rows), clinical/*
(all 4, empty scaffolds), industrial/* (all 4, empty scaffolds),
question-bank/norms + calibration, questionnaires/experimental,
reports/clinical + industrial (dead stubs, always empty), reports/counselling
(8 hardcoded rows), survey, analytics ("BodhLens" — unbound input, no handler),
admin/roles (static matrix; the real one is admin/permissions), batch-upload
(fake timer). IRT columns in item-explorer are hardcoded 0.

**Dead template code:** layouts 2–39 (all verified stock Metronic/ReUI, zero
app imports; layouts 2–10 depend on layout-1/shared so not deletable in
isolation), `config/layout-N.config` for N≠bodhassess, README/documentation.html,
`public/media/flags copy/` (accidental 261-file duplicate), empty
`components/ui/file-upload.tsx` (0 bytes).

## 3. THE cutover gap (frontend v1 dialect vs backend v2 dialect)

`lib/api.ts` speaks legacy v1: string ids (`R-NNN`, `P-NNN`, `grp-*`,
client-generated), the published-questionnaire JSON blob + `/questionnaires-catalog`
mirror, per-respondent sessions at `/assessments`, `mqtScores` keyed by mqt id,
`url_paths` on the auth user. The v2 API is a different shape: numeric ids,
normalized Questionnaire aggregate (sections/usages/option-usages/placement
scores), sessions+attempts at `/delivery`, results as placement rows.
**Repointing is NOT a URL swap.** `.env.local` already points dev at
`http://localhost:8081/api/v2` — and since zero v1 paths exist in v2, the dev
app is broken against it today (every call 404s; the login response shape also
differs). Prod (`.env.production`) still targets `https://api.bodh.biz/api/v1`.

Endpoint-family mapping (frontend need → v2 status):

| Frontend (v1) | v2 equivalent | Status |
|---|---|---|
| `/auth/login|me|logout` | `/auth/login|me` (no logout) | ~map, BUT v2 returns no `url_paths` on the user — frontend RBAC (sidebar filtering, `canAccess`) depends on it. Needs v2 to expose role url-paths on login/me, or frontend rework |
| `/respondents`, `/practitioners` (+bulk, R-/P- ids) | `/users` + roles | remodel (single User; no bulk endpoint in v2) |
| `/roles` (`url_paths`) | Role+RoleUrlPath exist in DB, **no REST CRUD** | gap |
| `/groups` (parentId, memberIds, assignedInstruments) | `/organizations/{id}/groups` + members | remodel (v2 groups belong to an org; no assignedInstruments) |
| `/entity-registrations` (+member_ids, assessments, active) | `/organizations` + members + status | remodel |
| `/qualities` (MQ doc with nested mqts tree, whole-doc PUT) | `/taxonomy` (mqs, traits, placements) | remodel |
| `/questionnaires` blob + `/questionnaires-catalog` + items/bulk | `/questionnaires` + sections/items/usages/scores | remodel (biggest one — the authoring wizard payload) |
| `/questionnaire-records` + versions (draft/commit) | **removed by design** (change log instead) | product decision — versioned UI must go or be reworked to change-log |
| `/assessment-records` + allotments + caps | `/assessments` + allotments | close map (v2 adds group caps; no allotment DELETE in v2 — gap) |
| `/assessments` (sessions) CRUD + reset + heartbeat | `/delivery/sessions` provision/start/answers/submit/reset/results | remodel (v2 is attempt-based; no heartbeat — live-tracking gap) |
| `/assessment-tokens` + `/public/tokens/*` + QR | **nothing** | known parked gap (invite links/QR — needed for portal flow) |
| `/demographic-fields` | entity exists; **no service/controller CRUD**; no delivery write path for SessionDemographic either | gap (both admin CRUD and portal capture) |
| `/admin/live-tracking/*` | nothing | gap |
| `/datasets/sessions` (+cell PATCH), `/workbooks...`, `/analytics/query` | nothing | gap (data-grid + data-studio) |
| `/item-display`, `/upload` (media), `/verticals`, `/audit/*`, `/health` | nothing (verticals parked; audit = per-questionnaire change-log only) | gaps |

## 4. Backend v2 — internal gaps found by the read (its own TODO list)

1. **No SessionDemographic write path** — delivery never captures demographics
   despite entity + questionnaire wiring existing.
2. **No DemographicField admin CRUD** service/controller.
3. **No Role/RoleUrlPath REST CRUD** (seeded only by BootstrapDataRunner/migration).
4. **No pagination on any list endpoint.**
5. **No status state machines** (any→any allowed except org approve); CLOSED
   assessments are still takeable (only PAUSED blocks).
6. RANKING scoring = plain sum (rank weighting TBD, rankOrder stored unused).
7. Cap check is TOCTOU (re-checked at submit, not locked).
8. Change-log gaps: bin/restore not logged.
9. No allotment delete endpoint; no respondent-cap.
10. Migration blind spots: provenance (createdBy) null on migrated rows; item
    version chains flattened; user email-merge keeps first silo's fields;
    `respondent_group_instruments` intentionally dropped; QuestionnaireSection /
    QuestionnaireDemographicField / ChangeLog receive no legacy data; several
    code paths untested by fixture (verticals/modules value lists, group
    allotments, no-family-match, `item` table fallback).
11. `GET /auth/me` requires a role url-path match — a valid-token user with no
    matching paths can't read their own profile.

## 5. Frontend defects found (independent of cutover)

- `.env.example` contains an **unresolved git merge conflict**.
- `.env` + `.env.staging` use dead `NEXT_PUBLIC_*` vars (Vite reads only
  `VITE_*`); a staging build silently falls back to localhost:4000 defaults.
- Dockerfile bakes v1/port-4000 defaults; no VITE_PORTAL_URL build-arg.
- Broken portal redirects after portal split: register.tsx,
  register-with-token.tsx, take-assessment.tsx → `/portal/*` falls through
  catch-all to `/dashboard`. dashboard quick-action `/platform/bodhlens` dead.
- `.prettierrc` requires `@ianvs/prettier-plugin-sort-imports` but package.json
  installs `prettier-plugin-organize-imports` → `npm run format` errors.
- Publish fragility: 3 sequential writes, only the blob write is fatal —
  catalog + items table can silently desync; `question_scores` renamed
  `sub_domains{domain,weight}` in the third write.
- MQ/MQT edits are whole-document PUT (read-modify-write, race-prone).
- Client-generated ids everywhere (Math.random) rely on server 409s.
- Token duality: dashboard token preferred over respondent token in shared
  fetch → wrong Bearer possible in mixed flows; portal login uses `/auth/login`
  but identity resolved via `/respondents/me` (two identity surfaces).
- layout-1 oddities: hardcoded avatar 300-2.png, "Roles & Permissions"↔
  "Permissions" menu labels point at swapped routes, stock Keenthemes footer,
  cosmetic language switcher; QueryClient configured but react-query unused;
  data-grid dnd has a leftover console.log; `sortable.tsx` duplicates all of
  `kanban.tsx`.

## 6. Key mechanics to remember

- **Frontend auth:** token in localStorage `bodhassess.practitioner.token`
  (dashboard) / `bodhassess.auth.token` (respondent); `jsonFetch` auto-Bearer;
  RBAC = glob match of pathname vs `me.url_paths`; super admin → `['/*']`.
- **Active shell:** `src/router.tsx` (route table) → PrivateRoute → AppShell →
  `Layout1`; menus from `config/bodhassess.config.tsx` (NOT layout-1.config);
  sidebar RBAC-filters menu items by url_paths.
- **v2 auth:** email+DOB → HS256 JWT {sub=userId, roles, superAdmin}; per-request
  DB authz via AntPath role url-paths; auditing createdBy/updatedBy from
  principal; bootstrap roles admin/practitioner/respondent + optional superadmin
  from BOOTSTRAP_ADMIN_* env; CORS allows localhost:3000/3001/3002/5173 (env
  `CORS_ALLOWED_ORIGINS`).
- **v2 config:** DB_URL (default localhost:3306/bodhassess_v2 — NOTE local
  MySQL lives on **3307** per docker-compose), DDL_AUTO=none, Flyway owns
  schema, LEGACY_DB placeholder (default `bodhassess`) → V2 data migration,
  skips gracefully if schema absent. PhysicalNamingStrategyStandardImpl pinned.
- **Scoring (both worlds additive):** v1 = per-question `question_scores` +
  selected `option.scores` summed per mqt_id, frozen on session at submit;
  v2 = ItemUsageTraitScore + OptionUsageTraitScore per TraitPlacement, frozen
  as SessionTraitScore rows per attempt at submit (server-side only).
