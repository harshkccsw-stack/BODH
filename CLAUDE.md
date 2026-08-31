# BodhAssess — working instructions (carried over from the 2026-07-20/21 session)

Two active codebases, built in parallel (user edits files mid-task — ALWAYS
re-read a file before editing; expect it to have changed):

- **spring-social/** — the NEW backend. Spring Boot 4.1, Java 25, Maven,
  project `bodhpsychometric`, port 8080. MySQL dev DB: **127.0.0.1:3307**, db
  `bodhpsychometric`, user/pass `bodh`/`bodh` (mysql client available).
  As of 2026-08-07 that port is an SSH TUNNEL to a **shared staging** MySQL,
  not a local instance — so a migration applied by starting the app lands on
  a database other people are using, and DDL in MySQL cannot be rolled back.
  Confirm before writing to it. Smoke data (`__smoke__` prefix) must be
  deleted afterwards. `DB_PORT` in application.yml is what selects this — and
  as of 2026-08-24 it is back to the **3306 default**, a local
  `bodhpsychometric-mysql` container (`docker exec … mysql -ubodh -pbodh`; no
  mysql client on the host PATH). ASK which one is live before running a
  migration — the answer decides whether a mistake is yours alone or
  everyone's.
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
  options locked, selection rule locked, delete blocked. MQT scores do NOT
  lock — the question flow owns `QuestionMqtScore`/`OptionMqtScore` and
  rebuilds them on every update.
- Multi-select (2026-08-12, `V11`): `Question.selectionRule` MIN/MAX/EQUALS +
  `selectionCount`, both NULL = single choice (so every pre-existing row and
  every old upload sheet still means one option — no backfill). `SelectionBounds`
  is the ONLY place the pair becomes a floor/cap; the portal is sent the
  resolved `minSelections`/`maxSelections` so it cannot disagree with the
  submit validator. The floor is never 0 — every placed question stays
  mandatory, so MAX 3 means 1—3. Count is validated against the SANITIZED
  option list on every write. Submit takes one `AnswerEntry` per selected
  option and dedupes repeats in a Set — a repeated pair would breach
  `uqAaRespondentAssessmentQuestionOption` and 500 at commit. Scoring rule
  (no engine yet): a question contributes the SUM of every selected option's
  MQT scores; only EQUALS keeps that count constant across respondents.
  Full write-up: `docs/multi-select-questions-plan.md`.
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
- Portal credential (2026-08-07): dob is the password; the identifier is the
  email OR `RespondentUser.employeeId` — an optional employer code, unique
  PER ORGANIZATION (`V5`, `uqRespondentUserOrgEmployeeId`). It lives on the
  profile, not `User`, because only that row carries organizationId. Validated
  ALPHANUMERIC, which is load-bearing: no '@' means PortalAuthService can
  split one login field on '@' with no chance of namespace collision. Because
  the code is not globally unique the lookup can return several rows — the
  submitted dob narrows it, and a >1 match is a generic 401 (email still
  works for those people). MySQL NULLs are never equal, so the unique key
  enforces nothing for unaffiliated respondents; the real guard is the
  `existsBy`-style pre-check in RespondentController.
- Content typing: `ContentType` TEXT/IMAGE/VIDEO/URL on Question stems AND
  Options. IMAGE/VIDEO are DISABLED in the UI until object storage exists
  (no video in MySQL, no base64 images) — URL is the workaround. EXCEPTION
  (2026-08-03): the Organization logo is stored as an inline base64 data URL
  in `Organization.logoBase64` (`logo_base64 LONGTEXT`, nullable; added by
  `V2__add_organization_logo.sql`). Deliberate deviation from the URL-only
  rule for this one small image — set/cleared through the create/edit org
  form. Request field `@Size(max=3_000_000)` (~2 MB image) is the backstop;
  the real guard is client-side (type + 2 MB) in organizations.tsx. EXTENDED
  (2026-08-24): a SECOND base64 logo, `Organization.coBrandLogoBase64`
  (`co_brand_logo_base64 LONGTEXT`, nullable, `V21`), same encoding, same cap,
  same client-side guard. Two columns and not one because the two are seen in
  different places at different sizes — `logoBase64` brands the registration
  form, `coBrandLogoBase64` co-brands the portal header for the whole take
  flow — and an org rarely has one image that suits both. Independent: set,
  cleared and uploaded separately, both optional. Still do NOT generalize any
  of this to question/option media — those stay URL-only.
- Portal co-branding (2026-08-24): the take-flow logo is delivered on
  `PortalAuthResponse` (`/portal/login` + `/portal/me`) as
  `organizationCoBrandLogoBase64`, NOT with the take payload. It belongs to the
  RESPONDENT's organization, not to the assessment (one assessment can sit in
  many orgs' catalogs), so it is fetched once per session instead of re-shipped
  on every attempt load and resume. Read live off the org row and deliberately
  kept clear of `PortalQuestionnaireContent`, which is Redis-cached and SHARED
  between every respondent taking that questionnaire. `BrandHeader` is the
  single render point — every take-flow screen goes through it (StepShell for
  the gates, QuestionRunner directly, plus the assessments list). The
  completion screen is the one exception: centred card, no header, so it draws
  its own centred logo. Null org or null logo → the portal's own Brain mark,
  exactly as before. The login page CANNOT show it — pre-auth, the org is
  unknown until someone signs in.
- Respondent identity minimum (2026-08-24): name, email, dob, **phone and
  gender** are required at ALL FOUR creation points — portal
  `/register/{token}`, the dashboard respondent form, the wizard's inline "New"
  rows, and the bulk XLSX sheet. `Gender` gained `PREFER_NOT_TO_SAY` (`V22`,
  APPENDED to the MySQL enum's value list — inserting mid-list renumbers every
  stored row) because a required question with no way to decline is not a
  question. NULL ≠ PREFER_NOT_TO_SAY: null means the question predates the rule
  and was never asked, and there is deliberately NO backfill. Phone was ONE
  free-text field here checked by a loose pattern duplicated in four places —
  SUPERSEDED on 2026-08-31, see the next bullet. Two consequences worth
  knowing, and both still true: `RespondentRequest` feeds
  UPDATE as well as create, so editing a respondent who predates the rule means
  filling both fields in; and a sheet MISSING the phone/gender columns is
  rejected before upload, by column name, rather than producing one "required"
  issue per line. `parseGender` folds spaces/hyphens to underscores so "Prefer
  not to say" typed into a cell resolves. Public forms FILL a blank profile
  field but NEVER overwrite one already on file
  (`PortalRegistrationService.claimIdentity`, gender and phone alike) — an
  admin's value beats a re-used registration link's.
- Respondent phone + birth date (2026-08-31): both tightened at the SAME FOUR
  creation points as the 2026-08-24 minimum, and both rules now live in exactly
  ONE place each (`dto/validation/`) instead of being hand-copied — the sheet
  path, which cannot use bean validation, compiles or calls the same constants.
  Change one, change its twin in the OTHER frontend with it — three files are
  duplicated verbatim between `bodhassess-app/src` and `bodhassess-portal/src`
  (`lib/phone.ts`, `components/phone-input.tsx`, `components/dob-input.tsx`).
  Separate packages, no shared module: the duplication is deliberate, and
  `lib/phone.ts` and `components/dob-input.tsx` are byte-identical in both. The
  two `phone-input.tsx` differ ONLY in how the box sizes itself — the portal
  uses `h-11`, the dashboard mirrors its own `INPUT_CLASS` padding — so each
  control matches the fields around it. Anything else that drifts is a bug.
  * **Phone is TWO values following E.164**: `RespondentUser.phoneCountryCode`
    (`phone_country_code VARCHAR(8)` NULL, `V24`) holds the dial code WITH the
    '+', and `phone` holds the national number, digits only. `PhoneRules` owns
    `^\+[1-9][0-9]{0,2}$` and `^[0-9]{4,14}$`; the 15-digit TOTAL is the one
    rule neither field can check alone, so it is a class-level `@E164Phone` on
    both request records (they `implements PhoneFields`). A class-level
    constraint raises a GLOBAL error — `ApiExceptionHandler` reads field errors
    FIRST and falls back to the global one, which is what keeps the message
    readable; delete that fallback and every cross-field rule silently becomes
    "Some of the details are invalid".
  * The loose pattern it replaced was correct for its time: a form filled in
    from every country cannot check a length. Picking the country is what
    removed that reasoning — do not "simplify" back to one field.
  * NO BACKFILL, and none is possible: old rows hold free text with no stated
    country, and inferring one from the digits invents data. `displayPhone()`
    on the entity joins the pair for READING (reports/exports) and falls back
    to the raw column, so old rows print unchanged. `splitStoredPhone` in
    phone.ts parses a legacy value back for the EDIT form and deliberately
    returns a BLANK country when it cannot tell — that leaves the select
    unpicked and blocks submit, which is the point. The column therefore cannot
    be made NOT NULL without a backfill decision first.
  * **dob is bounded to 1900-01-01 .. today** by `@BirthDate` — no minimum age
    (who may sit an assessment is the organization's rule, not a validator's);
    the bound only excludes dates nobody can have been born on. It matters
    because dob is the portal PASSWORD: a future date is a credential the
    person can never reproduce. Deliberately NOT applied to
    `PortalLoginRequest` — login must keep accepting whatever is already
    stored, or accounts predating the rule lock themselves out. Same reason
    `ddmmyyyyToIso` was left alone and `isBirthDateInRange` added beside it.
  * The dob field is `DobInput` (both frontends, `components/dob-input.tsx`):
    typed OR picked from the native calendar via `showPicker()`, with
    `min`/`max` on the hidden date input. That is a convenience — typing
    bypasses it — so the form and the server still validate.
  * The XLSX sheet gained a REQUIRED `phoneCountryCode` column, so sheets
    written before this date no longer upload until the column is added. Same
    trade as 2026-08-24: rejected by column name before upload, not as one
    issue per line. The sheet's `dialCode()` is lenient (`+91`, `0091`, `91`)
    because a spreadsheet eats a leading '+'.
- Organization: profile-level M:1 (PractitionerUser/RespondentUser each carry
  a nullable organizationId; one org per member). Carries TWO optional inline
  base64 logos (see the ContentType exception above).

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

1. Backend: `cd spring-social && ./mvnw -B test` (105 tests green as of
   2026-08-31). Tightening a DTO's validation breaks the fixtures that post
   that shape — fix the payloads, do not relax the rule.
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
