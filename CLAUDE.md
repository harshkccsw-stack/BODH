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
- MemoryMesh mirror (2026-09-15): `POST /api/sync/memorymesh/respondents`
  (`MemoryMeshSyncController` → `MemoryMeshSyncService`) creates a User +
  RespondentUser for a respondent MemoryMesh has just created. Server-to-server:
  on `ActorFilter`'s public list, locked by the `X-Sync-Key` header against
  `app.sync.memorymesh-key` (`MEMORYMESH_SYNC_KEY`); blank key = 403 for all.
  Same rules as `PortalRegistrationService` — fill blanks, never overwrite,
  dob mismatch is a 409 — and the same identity minimum (gender required).
  dob is ISO on this wire, deliberately, unlike the dd-MM-yyyy forms.
- `V26__baseline_questions.sql` (2026-09-15) created `baseline_question` /
  `baseline_answer` for a MemoryMesh feature that was removed the same day. The
  migration is applied and must stay; the empty tables remain until a drop
  migration is decided; the code is under `deleted/`.
- Two more doors (2026-09-15), same lock: `POST /api/sync/memorymesh/auth/verify`
  (`MemoryMeshAuthController`) checks email / employee id / phone pair + dob the
  way the portal login does and returns the PROFILE, no token — MemoryMesh's
  sign-in falls back to it and creates its own copy; and
  `GET /api/sync/memorymesh/assessments[/{id}]` (`MemoryMeshAssessmentController`)
  lists assessments and flattens one via `PortalContentService.contentOf` for
  MemoryMesh's "import from BodhAssess" — read-only.
- Attempts back (2026-09-15): `POST /api/sync/memorymesh/attempts`
  (`MemoryMeshAttemptController` → `MemoryMeshAttemptSyncService`) stores a
  completed attempt of an assessment MemoryMesh imported from here: person
  find-or-create, one allotment per (respondent, assessment), answers
  replace-all like `AssessmentSubmissionWriter`, COMPLETED + persisted — so the
  Reports pages show it. Questions arrive by our id; options and rows by
  POSITION in our sorted list (what the import copied), ids also accepted.

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
- "Other…" option (2026-09-28, `V36`, `docs/free-text-option-plan.md`):
  `ContentType.FREE_TEXT` is an OPTION kind, never a stem — the Google-Forms
  "Other" row. NOT the `SHORT_ANSWER` question type: that is a whole question
  with no options. The answer row carries `optionId` AND `answerText` together
  (the V17 key already allows it; no answer-table change). Rules, enforced in
  `QuestionController.validateFreeTextOptions` and mirrored in the form: MCQ
  only, at most ONE per question, label required, no mediaUrl; the stem is
  refused and `question.content_type` was deliberately NOT widened (Hibernate
  validate compares type names, not enum members). Delivered LAST under
  shuffle. Submit: a picked FREE_TEXT option with blank text is a 400 named by
  the navigator label; text on any other option is still refused; same 64 KB
  byte cap as a short answer. Scoring: the OPTION's MQT scores count, the text
  never does. Portal: the Other row is Google-Forms style — label and an
  ALWAYS-VISIBLE underline box on one line, the row a `<div>` whose
  marker+label is the button and whose input selects the option on focus (an
  input inside a button toggles the tick), `optionTexts` is keyed `slot|optionId`,
  "answered" requires the text (`freeTextFilled`), the tap that picks it NEVER
  auto-advances, Enter in the box = Next, and the resume backfill files an
  entry by its optionId FIRST (text-first would drop the tick). The XLSX sheet
  marks it with `otherOption` = the option NUMBER. Export sheet and Data
  Studio print the cell as `AssessmentAnswer.displayText()` — `Other: what
  they typed` — so the text is visible and the choice stays countable.
- Short-answer text slot (2026-10-06, `V40`): a SHORT_ANSWER answer row
  carries an `option_id` too, for Data Studio and the reports — same shape as
  an "Other…" answer. Each SHORT_ANSWER question owns ONE generated option,
  FREE_TEXT with NO label, made by `QuestionController.desiredOptions` on
  every save (identical each time, so an answered short answer stays
  editable) and shared by every respondent. It is HIDDEN: `Question.choiceOptions()`
  is what the dashboard, portal and MemoryMesh payloads list, so every client
  still sees "no options" and still submits text only; the two writers
  (`AssessmentSubmissionWriter`, `MemoryMeshAttemptSyncService`) attach it via
  `Question.textAnswerOption()` / `OptionRepository.findTextAnswerOptions`.
  No label means `displayText()` prints the text alone. V40 backfilled the
  slot and the answer rows, guarded against a short answer owning any other
  option. `option_id` is still NULLABLE: making it NOT NULL needs PARAGRAPH
  to get the same slot first. `rank_order` is KEPT (user's decision), reserved
  for a future RANKING type and written by nothing yet.
- Demographic CHECKLIST + write-in "Other" (2026-10-01, `V39`,
  `docs/demographic-other-and-checklist-plan.md`): CHECKLIST ticks any number
  of options, which live in `demographic_field_option` like a Dropdown's. The
  write-in is `DemographicField.otherOptionLabel` (NULL = none), NOT an option
  row, and is delivered last; picking it requires `otherText` (≤255,
  `other_text` on that one row). A plain "Other" with no box is just an option.
  **A checklist answer is ONE ROW PER TICK** in `demographic_response`; the
  unique key is (respondent, assessment, field, `option_value`), where
  `option_value` is `''` on every non-checklist row, so single-value fields
  keep their DB-enforced one answer. Never read demographic rows into a map
  by field (the last tick silently wins) — collect a list, order it with
  `DemographicField.inChoiceOrder`. Answers lock a field: its type, and any
  choice somebody picked (rename/remove → 409, Dropdowns too). Excel: one
  1/0 column per checklist choice + a `(specified)` column; Data Studio:
  `demo:<id>:opt:<choice>` and `demo:<id>:other`.
- Question upload + sections switch (2026-09-30):
  * An MCQ needs **at least ONE option** everywhere — `QuestionController.validateType`,
    the question form, the sheet parser and the AI expander (which used to skip
    one-option rows as preambles; they now import). No option = a mandatory
    question nobody can answer.
  * Score cells: `,` separates entries exactly like `|`. A comma piece with
    no `:` is the front of a NAME and is rejoined with the next piece, in the
    sheet's own spelling (`Quality, Testing & Operations:1` is one quality —
    the AI plan keys on that exact text). A decimal comma (`A: 0,5`) is never
    guessed: that one score is SKIPPED with a WARNING (`ParsedQuestions.warnings`,
    amber, non-blocking) and the question imports without it (2026-10-01; it
    used to refuse the whole sheet).
  * `bulk-create` and `/questions/import` refuse with EVERY problem:
    `{message, problems:[{index,message}]}` (`message` keeps the old one-line
    shape); both upload routes map `index` back to the sheet row.
  * Template upload: errors grouped per message (`groupRowErrors`, "Rows 2–43: …");
    unrecognised headers WARN, never block; the tab read is named and other
    tabs with a `stem` column are called out; a `stem` sheet with no `optionN`
    columns is pointed at the AI route; leading item numbers ("1.") are
    OFFERED for removal, never stripped silently; stems already in the bank
    warn via `POST /api/questions/find-existing` (`StemMatcher`, shared with the
    AI route — its normalised match ignores a leading item number).
  * A BARE score key (`Transactional:4` — a name, no `›` path) on the
    qualities step, both routes: `resolve-paths` returns every same-named TYPE
    anywhere (`candidates`, EXACT or LOOSE = case/space/-/_; no fuzzy
    matching, by decision) and, when the name is a QUALITY, how many types sit
    under it (`qualityTypeCount`). Defaults (`bareNameDefault` in
    ai-import-plan.ts): nothing found → Create; one type → use it; several
    types, or a quality that has types, or two qualities of the name → no
    default, somebody picks; a quality with no types → create under it.
    Leave unmapped is never pre-selected for a bare name. Create on a bare
    name makes quality AND same-name type (`X › X`; under the existing quality
    if the name is one) — it used to make the quality alone, and the scores
    were silently dropped. New names are de-duplicated loosely, as the
    server's `requireNameFree` compares them.
  * Sectioned upload: a blank or unknown `section` is NOT an error. A sections
    step decides — default unassigned; blanks: fill down / an existing section;
    unknown names: create / an existing section; every row blank: also "turn
    sections off". A name matching two sections stays an error. Pure rules in
    `question-sheet-rules.ts` (`classifySectionCell`, `placeRow`).
  * The sections switch is Step 2's "Organize into sections" checkbox and
    nothing else (moved from Step 1; no Add/Remove Section buttons; new
    questionnaires start flat). Ticking PUTs the flag at once — no dialog,
    questions already there wait in Unassigned; unticking asks first, because
    it deletes the sections. `PUT /api/questionnaire/update` with
    `hasSections:false` DELETES the sections, flattens placements in display
    order and re-tags them Q_1..Q_n; an omitted/null flag means UNCHANGED (it
    used to mean off). Switching either way is a 409 once any allotment on an
    assessment of that questionnaire is past NOT_STARTED.
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
- People & access (2026-10-05, `RespondentDeleteAndAccessTest`):
  * Respondent delete removes every UNTOUCHED allotment with the respondent
    (NOT_STARTED, no answers, no demographic rows — what a Reports Hub reset
    leaves) plus report narratives about them (fkRnAttempt blocks otherwise).
    A started/completed attempt still 409s, "reset it first" — a delete never
    discards answers by itself. `GET /api/respondents/delete-check/{id}` feeds
    the warning popup, same rules as the delete.
  * Dashboard login gate = superadmin OR practitioner profile OR a role group
    (`DashboardAuthService.hasDashboardAccess`). Assign Role Group lists EVERY
    identity (`findAllForAccess`) with practitioner/respondent flags, so a
    respondent can be made an admin without a practitioner profile.
  * Full access, two equivalent ways (for internal staff, so nobody shares
    the seeded superadmin login): Assign Role Group's "Super admin" option
    (`PUT /api/user-access/assign-superadmin|revoke-superadmin/{userId}`, any
    identity, clears the group, last superadmin can't be revoked), or a role
    whose paths include exactly `/*` (role editor's "Full access" checkbox).
    Both reach the four SUPERADMIN_ONLY_PATHS — `canAccess` admits `/*`, and
    the activity-log API checks `User.hasFullAccess()` live. A section
    wildcard like `/admin/*` still does NOT.
  * The bulk respondent sheet ATTACHES a profile to an existing identity with
    no respondent profile and a matching dob (was "Email already exists"),
    like the single create. Second respondent / dob mismatch stay issues.
  * Org drill-in: members show an Info button (`member-info-modal.tsx`):
    consent, assessments with Reset (the SAME `/reports/resetAssessment`),
    and Unassign with confirm.
- Organization: profile-level M:1 (PractitionerUser/RespondentUser each carry
  a nullable organizationId; one org per member). Carries TWO optional inline
  base64 logos (see the ContentType exception above).
- Report engine, Phase A (2026-09-17, `docs/report-engine-consolidation-plan.md`
  §2.6): a cohort-relative rule (`is_population`) over fewer COMPLETED
  respondents than `app.report.min-cohort-size` (30; tests 3) yields no value,
  is reported `TOO_SMALL`, and blocks approval and delivery — there is no
  z-score of 0 for a cohort of one any more. A comparison with a null operand,
  or a number against text, yields no value (`truthy` = false) instead of
  comparing as strings; text against text stays lexical. This applies to Data
  Studio sheets too. Delivery honours a `SELECTED` respondent scope for who
  RECEIVES a PDF; the cohort the rules run over is always every allotment.
  `approve` records `approvedByUserId/approvedAt/approvedCohortSize` (`V32`),
  cleared on clone, printed in `values.json`. Reads of a computation carry only
  the cheap blockers; `POST /api/report-computations/check/{id}` is the only
  place the cohort is evaluated outside approve/generate, and the list
  computes nothing per row. `DataStudioDatasetService.columns()` is the
  columns-only path every validation goes through — do not reintroduce
  `dataset()` there. Adopting a library rule is a COPY
  (`/api/report-rules/fork/{id}`: closure included, `[rule:…]` rewritten,
  slugs prefixed `a<assessmentId>-`, all or nothing).
- Report engine, Phase B backend (2026-09-17, plan §3): **a VALUE placeholder's
  rule is answered on the COMPUTATION, not the template** (`V33`:
  `report_computation_tag_guidance.rule_slug/format/fallback_text`, backfilled
  from the old binding pointers, which are then nulled and dead). A template
  declares only a tag's SHAPE (VALUE or NARRATIVE; COMPUTED is an alias of
  VALUE), so one published template serves any assessment. Endpoints:
  `getByAssessment`, `forTemplate` (find-or-create the one computation per
  assessment+template, pinning every ACTIVE formula rule of the assessment at
  latest), `repin`, `answerTag/{id}/{tag}` (VALUE needs a pinned slug; CORE and
  LITERAL are refused, they are the template's), `generate` with optional
  `{attemptIds}` (recipients chosen at generation time; the stored
  `respondentScope` is a legacy default the UI should stop offering),
  `report/{id}/{attemptId}.pdf` (final PDF, APPROVED only). `forTemplate` also
  CARRIES the placeholder answers forward when a template gains a version:
  `newVersion` writes a new template row, so a new computation copies the tag
  answers of the newest live computation on an earlier version of the same
  template NAME, keeping only tags the new version has and rule slugs the new
  computation pins. `bindTag` IGNORES
  computation+outputKey (the bridge that forwarded them is gone with the
  Computations page; the DTO fields stay so old bodies parse). Translation
  (`/ai/translate`) takes `hints{ruleId:text}` and `context[{slug,expression}]`
  (drafts count as formulae for validation and appear in the prompt), may
  re-translate a formula rule from its last statement text, and the catalog
  lists each score column's item count, max and item codes.
  `POST /api/report-rules/evaluate-draft` runs unsaved formulae over the cohort
  (a draft with a saved rule's slug stands in for it); `validate-expression`
  takes `pendingExpressionSlugs`, which relaxes ONLY the "depends on a
  plain-language rule" refusal — an unknown slug is still unknown.
- Report engine, Phase B pages (2026-09-17): **Report Setup**
  (`/reports/setup`, `/reports/setup/:assessmentId?step=rules|layout|check`,
  `pages/Reports/report-setup.tsx`) is the ONE authoring flow: assessment
  picker (any status) → Rules (`report-setup-rules.tsx`, the old
  per-assessment page as a component) → Layout (one computation per
  published template via `forTemplate`; VALUE tags pick a pinned rule,
  NARRATIVE tags take guidance, `repin` for stale pins) → Check & approve
  (`check`, preview one respondent, approve, clone/archive/delete).
  **Generate Reports** (`/reports/generate`, `generate-reports.tsx`) is the
  operator's page: approved setups only, then everyone / selected / one
  respondent, chosen at generation time. The old Computations page is parked
  in `bodh/deleted/`; `/assessment-library/assessments/:id/report-setup`
  redirects to Setup. The Templates page offers VALUE and NARRATIVE as
  SHAPES (plus fallback text) and lists no computations. **The template editor
  is shared** (`pages/Reports/template-editor.tsx`: `TemplateEditor` +
  `NewTemplateDialog`) — the Templates page is the library (find, create,
  delete) and Setup's Layout step opens the SAME editor, so a template is
  written, previewed and published without leaving the flow; publishing from
  there attaches it to the assessment. Do not grow a second editor.
  A wildcard grant on
  `/reports/*` covers both new paths; a LEAF grant on `/reports/computations`
  is now dead and needs rewriting the way `V12` rewrote the mapping rename
  (no rows exist on this branch's local DB, so no migration was written).
  Translation screen: see plan §3.7.
- Rule references read as names (2026-10-06): formulas STILL store keys
  (`[mqt:14]`) — names are display only, never written into a formula (MQT
  names are not unique; a rename would silently change a stored name).
  `formula-refs.ts` (pure, no `@/` imports) resolves a key to name + qualifier
  (`own score` / `whole branch` / `MQ total` / `answer` / `rule`; a duplicate
  MQT name gets its parent in front) and cuts a formula the way the server
  lexer does (strings are text, bare identifiers are refs).
  `formula-readout.tsx` draws the "Reads as" line under every formula (Setup
  list + editor, each AI draft, library editor) and "Mentions" under plain
  language. The plain-language box has the same picker, inserting
  `Name [key]` — both AI prompts already list every key with its label.

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

1. Backend: `cd spring-social && ./mvnw -B test` (478 tests green as of
   2026-10-05). Tightening a DTO's validation breaks the fixtures that post
   that shape — fix the payloads, do not relax the rule. If every Spring test
   errors with `BeanDefinitionOverrideException` on repositories, the IDE has
   written stale class files into `target/classes`; run `./mvnw -B clean test`.
2. Frontend: `cd bodhassess-app && npm run typecheck && npm run build`.
3. LIVE smoke with curl against localhost:8080 — the user's running server
   hot-reloads via devtools/IDE compile. Use `__smoke__`-prefixed data and
   DELETE it afterwards. Prove error paths (400/404/409), not just happy path.
4. IDE diagnostics arriving mid-edit are often STALE — trust tsc/maven.

## Deploying (droplet never builds)

The jar is built HERE and pushed: `deploy/client/push.sh api` (Maven package,
~70 MB over ssh, ~30 s restart on the droplet, health-gated on
`/actuator/health`, automatic rollback to the previous jar if it does not come
up). Rollback by hand: `ssh root@168.144.118.157
/root/bodhassess-api/deploy/server/rollback.sh api`. Every deploy recreates
the container, and `/app/uploads` is not a volume. `deploy/README.md` has the
receiver contract; `deploy/server/` must stay identical to MemoryMesh's copy.

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
