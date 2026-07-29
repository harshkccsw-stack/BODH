# BodhAssess — working instructions (carried over from the 2026-07-20/21 session)

Two active codebases, built in parallel (user edits files mid-task — ALWAYS
re-read a file before editing; expect it to have changed):

- **spring-social/** — the NEW backend. Spring Boot 4.1, Java 25, Maven,
  project `bodhpsychometric`, port 8080. MySQL dev DB: 127.0.0.1:3309, db
  `bodhpsychometric`, user/pass `bodh`/`bodh` (mysql client available).
  Physical tables are snake_case (default naming strategy). Tests run on H2
  (`auto_quote_keyword: true`).

  **Schema changes go through Flyway** (since 2026-07-27). `ddl-auto` is
  `validate`, so Hibernate only checks the schema and refuses to start on
  drift — it will not silently patch anything any more. Every structural
  change ships as a new `V<n>__description.sql` in
  `src/main/resources/db/migration/`, applied on startup before JPA. Rules:
  - NEVER edit an applied migration — Flyway checksums them and a changed
    file fails every later boot. Corrections go in a new `V<n>`.
  - MySQL commits DDL implicitly, so a migration cannot roll back. Put any
    "refuse to run" guard at the very top (see V2's duplicate check) so a
    bad state aborts before the first ALTER.
  - Backfill before tightening: add the column NULL, `UPDATE` it, then
    `MODIFY ... NOT NULL`. Adding a NOT NULL column straight onto a
    populated table fills it with zeros and orphans the rows.
  - Adding a unique key that an FK's index depends on? Add the new key
    BEFORE dropping the old one (errno 1553).
  - Flyway is DISABLED for tests (`src/test/resources/application.yml`) —
    the migrations are MySQL-flavoured and tests build from the entities.
  - Adopting an existing database: `baseline-on-migrate` stamps it at
    `baseline-version` without running V1. A database already ahead of that
    is stamped once with `SPRING_FLYWAY_BASELINE_VERSION=<n>`.
- **bodhassess-app/** — the dashboard frontend. Vite + React 19 + TS, port
  3000, single `src/` root, alias `@` → `./src`. Router:
  `src/routes/index.tsx` (lazyPage pattern); aside menu:
  `src/config/bodhassess.config.tsx`. Metronic `components/layout` chrome.
- **bodhassess-api-v2/** is the OLD backend — reference only. When asked for
  something "like v2", borrow the pattern, simplify to this project's style.

## Backend conventions

- Entities: PascalCase `@Table` names, camelCase columns, explicit
  `Long <entity>Id` IDENTITY ids, `public static final serialVersionUID`,
  LAZY everywhere, named constraints (`fkQmsQuestion`, `uqRamRespondentAssessmentAttempt`,
  `idxAaQuestion` — short prefixes per table). Sync helpers (addX/removeX).
- Cascade ONLY for true composition (Question→options, MQ→MQT tree).
  Independent/shared things NEVER cascade — deletes must FK-block or be
  pre-checked (bank questions, demographic fields, scoring rows, org members).
- No service layer yet: `@RestController` + class-level `@Transactional`,
  `@Autowired` fields. Endpoint style:
  `/api/<resource>/getAll | getById/{id} | create | update/{id} | delete/{id}`.
  Existing roots: `/api/questionnaire` (singular — user's choice),
  `/api/qualities`, `/api/quality-types`, `/api/questions`,
  `/api/demographic-fields`, `/api/auth` (dashboard login).
- DTO records in `dto/` with static `from()` builders. NEVER return entities
  (open-in-view is off; lazy state explodes in Jackson).
- Errors: `Map.of("message", ...)` bodies. Conflicts (dup label, in-use
  delete) are PRE-checKED with `existsBy...` repo queries — never
  catch DataIntegrityViolation inside @Transactional (rollback-only → 500 at
  commit even after returning 409).
- `@Valid` on a `List<T>` body does NOT validate elements — bulk endpoints
  validate everything in pass 1, write in pass 2 (all-or-nothing; a return
  mid-loop still COMMITS what was saved).
- No security on new endpoints yet (manual JWT in DashboardAuthController;
  no Spring Security filter). Remember when adding sensitive endpoints.

## Domain decisions (locked)

- Questions are standalone bank items; questionnaire membership is M:N via
  `QuestionnaireQuestion` placement rows (section + sortOrder live on the
  placement). Question responses (`AssessmentAnswer`) FREEZE a question:
  options locked, delete blocked. MQT scores do NOT lock — the question flow
  owns `QuestionMqtScore`/`OptionMqtScore` and rebuilds them on every update.
- Taxonomy: `MeasuredQuality` (MQ) → tree of `MeasuredQualityType` (MQT,
  self-referencing parent, any depth). MQT names deliberately NOT unique —
  resolve by id when ambiguous.
- Demographics: `DemographicField` registry (label unique, TEXT/NUMBER/DATE/
  DROPDOWN, options as ordered @ElementCollection) + `QuestionnaireDemographicField`
  mapping (per-questionnaire required + sortOrder; replace-all PUT).
- Delivery chain: `Assessment` (1 questionnaire + config, ACTIVE/INACTIVE)
  → `RespondentAssessmentMapping` (one row per ATTEMPT: unique respondent+
  assessment+attemptNumber, per-attempt status NOT_STARTED/ONGOING/COMPLETED,
  isPersisted reserved) → `AssessmentAnswer` (one row per selected option;
  option must belong to the question — service rule) and
  `DemographicResponse` (per attempt, value always TEXT).
- Content typing: `ContentType` TEXT/IMAGE/VIDEO/URL on Question stems AND
  Options. IMAGE/VIDEO are DISABLED in the UI until object storage exists
  (no video in MySQL, no base64 images) — URL is the workaround.
- Organization: profile-level M:1 (PractitionerUser/RespondentUser each carry
  a nullable organizationId; one org per member).

## Frontend conventions

- Per-page api files colocated with the page, USER'S naming kept (e.g.
  `questionApis.ts`, `qualitiesApi.ts`, `questionnairesApi.ts`,
  `demographicsApi.ts`, `assessmentApis.ts`): axios,
  `const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'`
  (NEVER process.env — crashes in browser), typed interfaces mirroring the
  backend DTOs 1:1 with "Matches X on the backend" comments.
- Page pattern (see questions.tsx / demographics.tsx as reference): breadcrumb
  header + primary action, 3 stat cards, search + filter row, divide-y list
  with badges + hover actions, create/edit modal (same form), delete-confirm
  modal with inline error box. Error text:
  `e?.response?.data?.message || e?.message || fallback`.
- ScoreEditor pattern for MQT mapping (question-level + per-option) showing
  "n of m MQTs mapped" + what's left. XLSX bulk upload on the questions page:
  parse in browser (dynamic import('xlsx')), template with `mqts` reference
  sheet, all-or-nothing, review wizard (next/next) before submit.

## Verification loop (do this EVERY change)

1. Backend: `cd spring-social && ./mvnw -B test` (currently 5 tests green).
2. Frontend: `cd bodhassess-app && npm run typecheck && npm run build`.
3. LIVE smoke with curl against localhost:8080 — the user's running server
   hot-reloads via devtools/IDE compile. Use `__smoke__`-prefixed data and
   DELETE it afterwards. Prove error paths (400/404/409), not just happy path.
4. IDE diagnostics arriving mid-edit are often STALE — trust tsc/maven.

## Working style

- Deleted/parked files go to `bodh/deleted/` (recycle bin), never plain rm.
- The user commits git themselves. Don't commit or push.
- When the user says "suggest", write the proposal (md file or message) and
  STOP — do not implement until told. When they ask to build, build and
  verify end-to-end, then report decisions made so they can veto.
- The user often has another agent working in parallel on adjacent flows
  (e.g. questionnaire authoring) — never assume file state, re-read.

## State at handoff (2026-07-21 ~15:00 IST)

Done and verified: qualities + MQT tree CRUD/UI; questionnaire catalog CRUD
(versionless — old parents/versions pages parked) + demographic-form mapping
endpoints (user-built) + vertical routes folded into one page; demographic
fields registry page; question bank page (standalone questions, M:N
placements, per-option content types, risk flag checkbox, MQT scoring UI both
levels, bulk-create endpoint fixed to all-or-nothing, XLSX upload with
template + mqts reference sheet + review wizard).

Likely next (user opened `assessments/assessmentApis.ts`): wire the
assessments frontend to spring-social — Assessment CRUD, respondent
allotment (RespondentAssessmentMapping), attempt flow. Also pending:
questionnaire authoring flow (other agent), object storage for IMAGE/VIDEO
upload, JWT security on the new endpoints, sortOrder editing for MQT trees.
