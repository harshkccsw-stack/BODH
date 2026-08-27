# Psychometric Report Generation Engine — Architecture

> **Status: design record. Nothing is built.** Written 2026-08-27, in the
> convention of `data-studio.md` and `mqt-scoring-export-plan.md`. The build is
> phased in §11 and starts only when the decisions below are accepted.

---

## 1. Context

Psychometricians need to define how an assessment is scored without a developer
in the loop. They write a plain-language prompt ("average questions 1, 5 and 12,
scale to 100, label above 70 as High"); an LLM turns it into a formula; a human
reviews and approves it; the approved formula then computes the same key-value
pairs for every respondent of that assessment, deterministically, until a new
version is approved. Those key-values merge into an HTML template and render to
a per-individual PDF at batch scale.

Formulae are **scoped per assessment**. Assessment A's formula is unrelated to
Assessment B's — different prompts, different output keys entirely.

### 1.1 The finding that reframes the build

The brief assumed the LLM emits **Java or Groovy** which we then execute under a
sandbox (`SecureASTCustomizer`, isolated process, CPU/memory ceilings). That was
the largest risk in the plan, and it is unnecessary.

This repo already ships a **closed whitelisted formula language**, built for
Data Studio and in production since `V20`:

| Existing asset | What it already does |
|---|---|
| `service/datastudio/expression/ExpressionService.java` (435 L) | Lexer + recursive-descent parser → AST. `parse()` throws on syntax error; `validate(expr, availableColumns)` **never throws** and returns structured `errors[]`. Unknown identifier = error, not escape hatch. 2000-char cap. |
| `service/datastudio/expression/ExpressionEvaluator.java` (287 L) | `Object eval(Node, Map<String,Object> row)` over a population, aggregates cached per `(call-node-id, scope-value)`. |
| `service/datastudio/DataStudioDatasetService.java` | `dataset(assessmentId, orgId)` → self-describing columns + one row per respondent. `columnKeys(...)` → the exact whitelist for that assessment. |
| `service/datastudio/DsSheetService.compute()` | The evaluate-an-ordered-set-of-formulas loop, already written. |
| `service/MqtScoringService.java` | `planFor(questionnaireId)` + pure `score(answers, plan)`. Its javadoc already anticipates "the PDF report". |
| `bodhassess-app/src/pages/data-studio/lib/formula.ts` | A 1:1 **client-side mirror** for as-you-type feedback. |

The function set is already the psychometric primitive set: `ZSCORE`,
`PERCENTILE`, `PERCENTRANK`, `RANK`, `NORMBAND` (norm-referenced banding),
`AVERAGE/SUM/COUNT/COUNTIF/AVERAGEIF`, plus
`IF/AND/OR/NOT/MIN/MAX/ROUND/ABS/SQRT/LOG`.
`NORMBAND(x, 40, "Low", 70, "Moderate", "High")` **is** the banding requirement,
already implemented and covered by tests.

**Decision: the LLM generates expressions in this grammar.** Consequences:

- **Item 4 of the brief — "safe execution of LLM-generated code (critical)" —
  disappears.** Nothing is compiled, no classloader is involved, there is no
  sandbox to escape. The grammar has no syntax for I/O, reflection, network,
  loops, or unbounded recursion.
- **The validator doubles as the LLM retry signal.** `validate()` returns plain
  English errors ("Unknown column: mqt:99", "IF() takes 3 arguments") — exactly
  what gets fed back for a regeneration attempt.
- **Reviewers can read what they approve.** Approving
  `ROUND(([mqt:14]+[mqt:15])/2*20, 1)` is real judgement; approving a Groovy
  class is rubber-stamping.
- Escalation path if the grammar proves too narrow: **add a whitelisted function
  in Java**, reviewed by us — not a code-execution hole.

### 1.2 Settled decisions

| Question | Decision |
|---|---|
| Formula target | Data Studio expression grammar — no code generation, no sandbox |
| PDF renderer | OpenHTMLtoPDF — in-process, pure Java, no browser in the image |
| LLM provider | OpenAI API via Spring `RestClient`, structured outputs |
| This pass | Design document only; phased build follows |

---

## 2. Domain model

Seven new tables in **`V21__add_report_engine.sql`**, and — following `V20`'s
explicit precedent — **zero alterations to existing tables**.

`ddl-auto: validate` means every column ships as *both* migration and entity
annotation, or the app refuses to boot. Physical names are snake_case;
`@Table`/`@Column` names are the logical CamelCase that Hibernate lowercases.

### 2.1 `ReportFormulaDraft` — the LLM proposal, pending review

```
report_formula_draft
  report_formula_draft_id   bigint PK
  assessment_id             bigint NOT NULL      -- FK fkRfdAssessment
  prompt                    text   NOT NULL      -- the psychometrician's words
  bindings_json             text                 -- [{key,label,expr,resultType,format,rationale}]
  assumptions_json          text                 -- model's stated assumptions + unresolved items
  raw_response              text                 -- verbatim LLM response; an audit artifact
  model                     varchar(80)          -- e.g. the exact OpenAI model id
  status                    varchar(12) NOT NULL -- PENDING | APPROVED | REJECTED | SUPERSEDED
  generation_attempts       int    NOT NULL
  human_edited              boolean NOT NULL
  superseded_by_draft_id    bigint               -- regenerate-with-feedback chain
  created_by_user_id        bigint NOT NULL      -- FK fkRfdAuthor  → User(id)
  reviewed_by_user_id       bigint               -- FK fkRfdReviewer → User(id)
  review_note               text
  created_at, reviewed_at   datetime(6)
```

**Why `bindings_json` and not rows:** a draft is an opaque *proposal*. It is
edited as a whole, nothing references it by key, and its shape belongs to the
review UI. That is exactly `V20`'s stated rule for JSON columns. Definitions get
real rows because they are executed, ordered, and referenced.

### 2.2 `ReportFormulaDefinition` — approved and versioned

```
report_formula_definition
  report_formula_definition_id bigint PK
  assessment_id                bigint NOT NULL   -- FK fkRfdefAssessment
  version                      int    NOT NULL
  source_draft_id              bigint            -- FK fkRfdefDraft
  prompt                       text   NOT NULL   -- COPIED from the draft, frozen
  model                        varchar(80)
  cohort_scope                 varchar(32) NOT NULL  -- see §4
  min_cohort_size              int    NOT NULL       -- see §4
  approved_by_user_id          bigint NOT NULL   -- FK fkRfdefApprover
  approved_at                  datetime(6) NOT NULL
  notes                        text
  UNIQUE uqRfdefAssessmentVersion (assessment_id, version)
```

**Definitions are immutable and never deleted.** "Editing" a formula means
approving a new version. That is what keeps historical reports explicable.

### 2.3 `ReportFormulaBinding` — one output key

Mirrors `DsDerivedColumn` deliberately, so the same evaluate loop works.

```
report_formula_binding
  report_formula_binding_id     bigint PK
  report_formula_definition_id  bigint NOT NULL  -- FK fkRfbDefinition (containment)
  out_key                       varchar(80)  NOT NULL   -- 'extraversion_score'
  label                         varchar(160) NOT NULL
  expr                          text NOT NULL
  result_type                   varchar(16)  NOT NULL   -- number | string
  format                        varchar(40)
  sort_order                    int NOT NULL            -- TOPOLOGICAL, see §5
  UNIQUE uqRfbDefinitionKey (report_formula_definition_id, out_key)
```

### 2.4 `ReportFormulaActive` — exactly one live version per assessment

```
report_formula_active
  assessment_id                bigint PK        -- FK fkRfaAssessment
  report_formula_definition_id bigint NOT NULL  -- FK fkRfaDefinition
  activated_by_user_id         bigint NOT NULL
  activated_at                 datetime(6) NOT NULL
```

**MySQL has no partial unique index**, so "only one ACTIVE version per
assessment" cannot be `UNIQUE(assessment_id) WHERE active`. Making
`assessment_id` the **primary key of a pointer table** enforces it exactly, with
no generated columns and no `ALTER` on `Assessment`. Deactivating is deleting
the row; switching version is an upsert.

### 2.5 `ReportTemplate`

```
report_template
  report_template_id  bigint PK
  assessment_id       bigint            -- NULL = shared library template
  name                varchar(160) NOT NULL
  html                longtext NOT NULL
  required_keys       text              -- JSON array, extracted at save (§8)
  status              varchar(12) NOT NULL   -- DRAFT | PUBLISHED
  created_at, updated_at datetime(6) NOT NULL
```

### 2.6 `ReportBatch` and `GeneratedReport`

```
report_batch
  report_batch_id      bigint PK
  assessment_id        bigint NOT NULL
  report_formula_definition_id bigint NOT NULL   -- resolved ONCE at creation
  report_template_id   bigint NOT NULL
  organization_id      bigint                    -- cohort/filter scope
  requested_by_user_id bigint NOT NULL
  status               varchar(16) NOT NULL      -- SCORING | RENDERING | DONE | FAILED
  total, succeeded, failed  int NOT NULL
  error_message        text
  created_at, finished_at   datetime(6)

generated_report
  generated_report_id  bigint PK
  report_batch_id      bigint NOT NULL           -- FK fkGrBatch (containment)
  assessment_id        bigint NOT NULL
  respondent_user_id   bigint NOT NULL
  report_formula_definition_id bigint NOT NULL   -- the exact version used
  report_template_id   bigint NOT NULL
  status               varchar(16) NOT NULL      -- PENDING | READY_TO_RENDER | READY | FAILED
  values_json          text                      -- THE SNAPSHOT (§3)
  inputs_hash          char(64)                  -- drift detection (§3)
  pdf_path             varchar(512)
  attempts             int NOT NULL
  error_message        text
  created_at, generated_at  datetime(6)
  UNIQUE uqGrBatchRespondent (report_batch_id, respondent_user_id)
```

`generated_report` rows **are** the work queue — which also gives the progress
UI for free (`COUNT(*) GROUP BY status`).

---

## 3. Reproducibility

Three facts make this genuinely hard, and two of them contradict `CLAUDE.md`:

1. **`RespondentAssessmentMapping` is one row per `(respondent, assessment)`** —
   unique key `uqRamRespondentAssessment(respondentUserId, assessmentId)`. There
   are **no re-attempt rows**; a granted re-attempt *replaces* the answer set.
   `AssessmentAnswer` and `DemographicResponse` likewise key on the pair with no
   FK to the mapping. *(`CLAUDE.md` claims "one row per ATTEMPT: unique
   respondent+assessment+attemptNumber" — that is stale and should be corrected.)*
2. **No computed score is ever persisted** anywhere. `MqtScoringService` is pure
   and re-derived on every export.
3. So re-reading answers later can silently produce different numbers — after a
   questionnaire edit, an MQT score change, or a granted re-attempt.

**Decision: snapshot the outputs, hash the inputs.**

- **`values_json`** — the exact `Map<String,Object>` that was merged into the
  template. The report is reproducible *by construction*: re-rendering yields
  the same document regardless of what has changed underneath. Tens of keys,
  well under 1 KB.
- **`inputs_hash`** — SHA-256 over a canonical serialization of
  *(the respondent's dataset row **restricted to the columns actually
  referenced**, + every binding's `expr`, + `cohort_scope`, + cohort size)*.
  `ExpressionService.validate()` already returns `referencedColumns`, so we know
  precisely which subset to hash. 64 chars.
- The **PDF itself is stored**, so the delivered artifact is immutable either way.

This buys the property the brief asked for and one it did not: we can *detect*
drift ("this report no longer matches current data") without ever silently
changing a delivered PDF. Storing the full input row per respondent was
rejected — it is the same information at many times the size.

---

## 4. The cohort problem

`ZSCORE`, `PERCENTILE`, `PERCENTRANK` and `RANK` are **population functions**.
They cannot be computed from one respondent's row. This is the sharpest
architectural constraint in the whole design and the brief did not account for it.

**Cohort scope lives on the `FormulaDefinition`, not on the request or template.**
A z-score is meaningless without its norm group, and *which norm group* is a
psychometric decision the reviewer is approving. If the request could change it,
two people could produce different "z-scores" from the same approved formula —
destroying the deterministic-reuse guarantee that is the point of the feature.

`cohort_scope` values: `ASSESSMENT_COMPLETED` (default — all COMPLETED attempts
on this assessment), `ASSESSMENT_ALL`, `ORGANIZATION_COMPLETED` (the
respondent's own organization).

**Batch shares one dataset.** `DataStudioDatasetService.dataset(assessmentId,
orgId)` is called **once per batch**; all bindings evaluate over the whole
population in one pass, exactly like `DsSheetService.compute`. Never loop
per-person calling `dataset()`.

**Single-person generation still loads the cohort.** Unavoidable and correct.
Mitigate with a short-lived cache keyed `(assessmentId, orgId, definitionId)` —
Redis is already wired via `PortalRedisStore`, with a working circuit breaker;
TTL ~60 s.

### 4.1 Two psychometric hazards that must be surfaced, not hidden

- **Small-n z-scores silently return 0.** `ExpressionEvaluator` line ~123:
  `if (Double.isNaN(v) || s.sd == 0) return s.sd == 0 ? 0d : null;`. With one
  completed respondent `sd == 0`, so **every z-score is exactly 0** —
  indistinguishable from "perfectly average". `RANK` and `PERCENTRANK` degrade
  similarly. Hence `min_cohort_size` on the definition (suggest default 30):
  below it, population-function outputs are emitted as `null` and the report
  renders a "norm group too small" block rather than a fabricated number. This
  is an integrity control, not a nicety.
- **`Stats.sd` is population sd (÷ n), not sample sd (÷ n−1).** Psychometricians
  will care. Document it; do **not** silently change it — that would move every
  existing Data Studio number.

---

## 5. Compilation — closing the forward-reference gap

`DsSheetService.compute()` orders bindings by `sort_order` and, on a parse
failure, nulls the column and continues:

```java
try { ast = expressions.parse(column.getExpr()); }
catch (RuntimeException e) { for (row : rows) row.put(colKey, null); continue; }
```

For a spreadsheet a blank cell is an acceptable answer. **For a report a null
score is a wrong report.** Worse, `DsSheetService.availableColumns()` offers all
other derived columns *regardless of order*, so a formula referencing a
later-sorted column can be **saved** and silently evaluates to null forever.

**`ReportFormulaCompiler.compile(definition, assessmentId, orgId)`:**

1. `parse()` every binding — a failure is a **hard error**, never a null-fill.
2. Build the reference graph from `validate().referencedColumns`, treating
   `calc:`-prefixed keys as internal references to sibling bindings.
3. **Topologically sort. Reject any cycle. Reject any self-reference.** Persist
   the topological order back into `sort_order`, so execution order is a stored
   fact rather than something re-derived at every run.
4. Verify every external reference is in
   `DataStudioDatasetService.columnKeys(assessmentId, orgId)`.
5. Return an ordered `List<(outKey, Node, resultType)>` — the executable plan.

**Runs twice, deliberately:**

- **At approval — blocking.** An uncompilable definition cannot be approved.
- **At generation — re-verified.** The assessment's columns can change *after*
  approval: a question unplaced, an MQT deleted, a demographic field removed.
  Re-checking makes the batch fail fast with a clear message instead of emitting
  500 reports full of blanks. This also means we do **not** need to pre-check
  MQT/question deletes against formula text — a cheaper and less invasive
  trade-off.

---

## 6. LLM generation workflow

`ReportFormulaGenerationService` — `assessmentId` + prompt → validated draft.

### 6.1 Serializing the assessment schema into budget

An assessment with many questions (× grid rows) can yield hundreds of column
keys. Do not dump them all.

1. **Always include** every `core:`, `demo:`, `mq:`, `mqt:`, `mqtt:` column.
   These are the scoring vocabulary and are bounded by the taxonomy — tens, not
   hundreds. Use `MqtRef.path` (`Cognition › Verbal › Vocabulary`, separator
   `›`) as the label, because **MQT names are deliberately not unique**.
2. **`ans:` columns** are the long tail. Send them as compact
   `key⇥label⇥type` lines with the stem truncated to ~80 chars, capped at a
   configured N (suggest 300), and **state explicitly in the prompt that the
   list was truncated** so the model reports an unresolved item rather than
   inventing a key.
3. Serialize as TSV/JSON-lines, not pretty JSON — roughly a third of the tokens.

### 6.2 System prompt must state

- The full grammar and the function list **with arities**.
- Bracket-quoting: `[mqt:14]`, because `-` is subtraction and `:` is the family
  separator.
- Unknown identifiers are errors; there is no escape hatch.
- Output keys are snake_case, unique, and referenced by later bindings as
  `[calc:<key>]`.
- **`NORMBAND` cut semantics are ascending with `v < cut`.**
  `NORMBAND(x, 40, "Low", 70, "Moderate", "High")` means *below 40 → Low, below
  70 → Moderate, else High*. "Label above 70 as High" therefore becomes
  `NORMBAND(x, 70, "Not High", "High")` — **the natural phrasing inverts.** This
  is the single most likely LLM error and **the validator will not catch it**:
  arity passes, semantics invert. Include worked examples in both directions.
- Three or four complete worked examples end-to-end.

### 6.3 Structured output schema

```json
{"bindings": [{"key":"...","label":"...","expr":"...",
               "resultType":"number|string","format":null,"rationale":"..."}],
 "assumptions": ["..."],
 "unresolved":  ["..."]}
```

`rationale` and `assumptions` exist for the **reviewer**, not the engine.
`unresolved` lets the model say *"the prompt names 'questions 1, 5, 12' but I
cannot map those to tags"* instead of inventing columns — the failure mode that
matters most.

### 6.4 Retry loop

Validate each binding with
`ExpressionService.validate(expr, availableKeys ∪ earlier calc: keys)`. On any
error, resend the failing binding plus its `errors[]` **verbatim**.
**Max 2 retries (3 calls total)**, matching `SubmissionDigestService.MAX_ATTEMPTS`.
After that the draft is still saved as `PENDING` with the errors attached — a
human fixes it by hand. **Never discard the work.**

### 6.5 Integration notes

The backend currently makes **zero outbound HTTP calls** — no
`RestClient`/`WebClient`/`RestTemplate` anywhere. All of this is greenfield:

- `app.llm.openai.{api-key,model,base-url,timeout-seconds,max-retries}`.
  Key from environment, **never** in `application.yml`.
- Connect timeout 5 s, read timeout 60 s.
- **Degrade like `PortalRedisStore`**: the LLM being unavailable must break only
  *generate a new draft*. Review, approval, and report generation never call it.
- **PII invariant:** only *column schema* (keys, labels, types) is sent —
  **never rows, never respondent data**. Make this an explicit invariant with a
  test asserting the request body contains no respondent identifiers.

---

## 7. Human review and approval

### 7.1 Preview is a server dry-run, not client evaluation

`formula.ts:179` is explicit: *"SERVER functions are valid grammar but not
evaluable client-side."* Since nearly every psychometric formula uses
`ZSCORE`/`PERCENTILE`/`NORMBAND` — all `SERVER`-classified — client evaluation
would cover almost nothing. *(Note `NORMBAND` is in `SERVER_FUNCS` even though
`normBand()` is row-local; harmless here since we evaluate server-side anyway,
but it is why the client cannot preview the common case.)*

- The client mirror still earns its place for **zero-latency as-you-type syntax
  and type feedback**, exactly as the sheet formula bar uses it.
- `POST /api/report-formulas/drafts/{id}/dry-run` → compiles, evaluates over the
  **real cohort**, returns the first ~20 respondents' computed key-values plus
  **per-key summary stats: min / max / mean / null-count / band distribution**.

### 7.2 What the reviewer sees

Three panes: **original prompt** (frozen) │ **bindings** (key, label, expr,
inferred type, referenced columns) │ **dry-run output table**, with the model's
`rationale` / `assumptions` / `unresolved` alongside.

**Null-count and band distribution are the review's teeth.** A formula yielding
40 % nulls, or placing 100 % of respondents in "High", is wrong in a way no
amount of expression-reading catches. Surface those numbers prominently — this
is what makes the mandatory review a real control rather than a checkbox.

### 7.3 Change requests — both paths are needed

1. **Regenerate with feedback** — the reviewer's note goes back to the LLM with
   the previous bindings as context, producing a **new** draft linked via
   `superseded_by_draft_id`.
2. **Manual edit** — inline expression edit, re-validated live, draft marked
   `human_edited`. Far cheaper for a one-character fix.

### 7.4 Approval and authority

`POST /api/report-formulas/drafts/{id}/approve` → compile (blocking) → insert
`report_formula_definition` (`version = max+1`) + bindings in topological order →
upsert `report_formula_active`.

- Reuse `RequestActor` + a `ReportAccess` guard modelled on `DataStudioAccess`:
  `requireActor()` **rejects anonymous regardless of `app.security.require-auth`**,
  exactly as Data Studio does, because every row here is owned by somebody.
- **The author of a draft must not approve it** unless super-admin. Separation of
  duties is the entire point of a mandatory review step.
- Audit trail: `approved_by_user_id` / `approved_at` on the definition,
  `reviewed_by_user_id` / `review_note` on the draft, `activated_by_user_id` on
  the active pointer. Definitions are never deleted.

### 7.5 API surface

Following the repo's endpoint style (`/api/<resource>/getAll | getById/{id} |
create | update/{id} | delete/{id}`), with verbs added only where the resource
genuinely has a lifecycle. DTO records in `dto/` with static `from()` builders;
**never return entities** (open-in-view is off).

```
/api/report-formulas
  GET    /drafts/getByAssessment/{assessmentId}     list drafts + status
  GET    /drafts/getById/{draftId}
  POST   /drafts/generate                           {assessmentId, prompt} → LLM → draft
  PUT    /drafts/update/{draftId}                   manual edit of bindings (re-validates)
  POST   /drafts/{draftId}/regenerate               {feedback} → new draft, supersedes
  POST   /drafts/{draftId}/dry-run                  compile + evaluate over real cohort
  POST   /drafts/{draftId}/approve                  {cohortScope, minCohortSize} → definition
  POST   /drafts/{draftId}/reject                   {reviewNote}
  POST   /validate-expr                             {assessmentId, expr} → DsExprResponse
  GET    /columns/getByAssessment/{assessmentId}    the column whitelist, for the editor

  GET    /definitions/getByAssessment/{assessmentId}   version history
  GET    /definitions/getById/{definitionId}
  GET    /active/getByAssessment/{assessmentId}
  POST   /active/set/{definitionId}                 roll back / forward to a version
  DELETE /active/clear/{assessmentId}

/api/report-templates
  GET    /getByAssessment/{assessmentId}            includes shared library templates
  GET    /getById/{id}
  POST   /create                                    validates placeholder contract
  PUT    /update/{id}                               validates placeholder contract
  DELETE /delete/{id}                               409 if a batch references it
  POST   /{id}/preview/{respondentUserId}           one PDF, no batch, no persistence

/api/report-batches
  POST   /create                {assessmentId, templateId, organizationId?} → batch
  GET    /getAll                paged, filterable by assessment
  GET    /getById/{id}          progress: counts grouped by status
  POST   /{id}/requeue-failed   re-attempt every FAILED row
  DELETE /delete/{id}           removes rows and stored PDFs

/api/generated-reports
  GET    /getByBatch/{batchId}  paged rows with status + error_message
  GET    /{id}/download         access re-checked; streams the stored PDF
  GET    /{id}/values           the values_json snapshot, for support/debugging
  POST   /{id}/regenerate       re-render from the SNAPSHOT, not from live data
```

`POST /validate-expr` deliberately mirrors Data Studio's existing
`validateExpr` contract: **HTTP 200 with `errors[]`**, never an error status —
a half-typed formula is a normal state, not a failure.

Note `/{id}/regenerate` re-renders from `values_json`, never from live answers.
Re-rendering after a template fix must not silently change the numbers.

---

## 8. Template layer and PDF

### 8.1 Binding templates to assessments

**Per assessment, with a nullable `assessment_id` for shared library templates.**
Output keys are assessment-specific by design, so a fully key-agnostic template
only works for trivial layouts. But an assessment-*agnostic structure* is
achievable and makes a good default: a template that iterates the binding list
generically (for each output key → label, value, band) is genuinely reusable.

**Contract validated at save time.** Extract placeholders from the HTML, compare
against the active definition's `out_key` set, and **refuse to save a template
referencing a key the definition does not produce** — 409 listing the missing
keys, pre-checked with `existsBy`-style queries per the repo's convention.
Store the extracted set in `required_keys` so the reverse check is cheap:
approving a new definition that drops a key must warn about every template using
it.

### 8.2 Do not use Thymeleaf for user-authored templates

Thymeleaf is the natural Boot pairing, but its expressions are **SpEL**, and this
HTML is authored by users through an admin UI. That is precisely the
code-execution hole we just avoided on the formula side — reintroducing it in the
template layer would be the same mistake wearing a different hat.

**Use a closed `${key}` substitution** over the values map, plus a small block
syntax for conditionals and iteration over bindings, HTML-escaping every
substituted value by default. Same philosophy as `ExpressionService`: a closed
whitelist beats a general engine you then have to restrict.
`model/RichTextHtml.java` is the in-repo precedent for allowlist-based HTML
sanitation and should be extended rather than reinvented.

### 8.3 The template mini-language

A closed substitution grammar, sized to what a report actually needs:

```html
${extraversion_score}                  value, HTML-escaped
${extraversion_score | 1dp}            format: 0dp 1dp 2dp pct
${extraversion_score | default:—}      fallback when the value is null

[[#if risk_flag == "High"]] … [[/if]]  equality / comparison against a literal
[[#each bindings as b]]                iterate the definition's output keys
   <tr><td>${b.label}</td><td>${b.value}</td></tr>
[[/each]]
[[#bar extraversion_score min=0 max=100]]   inline-SVG bar, server-rendered
[[#gauge extraversion_z min=-3 max=3]]      inline-SVG gauge
```

Rules: no expressions (the formula layer owns computation), no arbitrary
property access, no user-supplied loops over anything but the binding list.
Every `${…}` is HTML-escaped unless the key's `resultType` is explicitly marked
as pre-sanitised rich text, in which case it goes through `RichTextHtml`'s
existing allowlist. An unknown key is a **save-time error**, not a blank at
render time — that is the placeholder contract of §8.1.

### 8.4 OpenHTMLtoPDF constraints

CSS 2.1 only — **no flexbox, no grid, no JavaScript**. Charts must be **inline
SVG generated server-side** from the values (a small bar/gauge helper), not a JS
charting library. Templates must be authored inside that box from day one;
retrofitting a print stylesheet onto a flexbox design does not work.

---

## 9. Batch generation

Follow `SubmissionDigestService` — the pattern is already proven here: durable
rows + `@Async` immediate attempt + `@Scheduled(fixedDelay)` sweeper +
`MAX_ATTEMPTS = 3` + a **visible** failed state with manual requeue.

**Durable in MySQL, not Redis.** Redis staging suits a submission that must not
block a respondent's HTTP 200. A report batch is an admin operation;
`generated_report` rows are the queue and the progress UI at once.

### 9.1 Two phases, two failure granularities

| Phase | Work | On failure |
|---|---|---|
| **Score** | One dataset load, one compile, all bindings evaluated over the whole population. Writes `values_json` + `inputs_hash`, status `READY_TO_RENDER`. | **Fails the whole batch, atomically.** A compile error is a definition-level problem; nothing is written. |
| **Render** | Per respondent, independent. | **Fails one report.** Row → `FAILED` with `error_message`; the batch continues. |

This is the right split: the brief's "fail that individual's report only" applies
to rendering, but a broken formula must *not* quietly produce 500 blank reports.

### 9.2 Operational decisions that must be made explicitly

- **Only COMPLETED attempts.** `DataStudioDatasetService` deliberately leaves
  score columns **NULL** for non-COMPLETED attempts, so every binding would
  evaluate to null. Enforce at batch creation, not at render time.
- **PDF storage.** `uploads/` exists but is empty, and the `app-uploads` volume
  in `docker-compose.yml` is **commented out** — reports would vanish on every
  redeploy. Set `app.reports.storage-dir` (default
  `./uploads/reports/<assessmentId>/<batchId>/<respondentId>.pdf`) **and
  uncomment that volume**. Serve through a controller that re-checks access,
  never a static path. Add a retention/purge job mirroring `ActivityLogPurge`.
- **Dedicated executor.** There is no custom `TaskExecutor` bean; `@Async` runs
  on Boot's default pool. A 500-report render batch there would starve
  `SubmissionDigestService`. Add a bounded executor for rendering.

---

## 10. Things the original framing got wrong or missed

1. **`RespondentAssessmentMapping` is one row per (respondent, assessment)**, not
   per attempt — see §3. `CLAUDE.md` is stale here and should be corrected in the
   same pass.
2. **The `ScoringFormula` interface from the brief would be harmful.** A single
   opaque `Map<String,Object> score(Map<String,Object>)` per assessment hides the
   structure that everything downstream needs. The real shape is an *ordered set
   of named bindings*, which is what makes per-key template validation, per-key
   dry-run statistics, and partial reuse possible at all.
3. **`NORMBAND` inverts the natural phrasing** — §6.2. Highest-risk LLM error;
   invisible to the validator.
4. **Small-n z-scores silently return 0** — §4.1.
5. **Population sd, not sample sd** — §4.1.
6. **Score columns are NULL for non-COMPLETED attempts** — §9.2.
7. **MQT names are not unique** — resolve by id, label by `path`.
8. **Scores are `int`** throughout (`QuestionMqtScore.score`, `OptionMqtScore.score`).
   Division yields doubles; rounding is a per-binding `format` concern.
9. **No outbound HTTP exists anywhere in the backend** — timeouts, retries and
   graceful degradation are all new work, not configuration.
10. **Deleting an assessment, MQT or question orphans a definition.** Handled by
    the generation-time compile re-check (§5) rather than by pre-checking deletes
    against formula text — cheaper, and consistent with how
    `DataStudioDatasetService` 404s a missing assessment at read time.
11. **PII to a third party** — §6.5. Schema only, never rows; assert it in a test.

---

## 10a. Worked end-to-end example

**Assessment 12** — a Big Five instrument. Its dataset exposes, among others:

```
core:status      Attempt status        enum
core:completed   Completed (1/0)       number
demo:7           Age                   number
mqt:14           Big Five › Extraversion › Sociability      number
mqt:15           Big Five › Extraversion › Assertiveness    number
mqt:16           Big Five › Extraversion › Energy           number
mq:3             Big Five (MQ total)                        number
```

**The psychometrician writes:**

> "Average the three Extraversion facets, scale to 100, and flag anyone above
> the 70 mark as High, 40–70 Moderate, below 40 Low. Also show how they compare
> to everyone else."

**The LLM returns** (validated, then reviewed):

| # | key | expr | type |
|---|---|---|---|
| 1 | `extraversion_score` | `ROUND(([mqt:14] + [mqt:15] + [mqt:16]) / 3 * 20, 1)` | number |
| 2 | `extraversion_band` | `NORMBAND([calc:extraversion_score], 40, "Low", 70, "Moderate", "High")` | string |
| 3 | `extraversion_pct` | `ROUND(PERCENTRANK([calc:extraversion_score]), 0)` | number |

with `assumptions: ["'scale to 100' read as ×20 on a 0–5 facet scale"]` and
`unresolved: []`.

**Compile** resolves `[calc:extraversion_score]` as an internal reference,
topologically orders 1 → 2 → 3, and confirms `mqt:14/15/16` exist for
assessment 12.

**Dry-run over the cohort (n = 214 completed)** shows the reviewer:

```
extraversion_score   min 12.0  max 96.0  mean 58.3  nulls 0
extraversion_band    Low 18%   Moderate 54%   High 28%   nulls 0
extraversion_pct     min 0     max 100        nulls 0
```

That band distribution is the approval decision. Had it read `High 100%`, the
`NORMBAND` cuts would have been inverted (§6.2) — the error the validator cannot
see and the reviewer can.

**Approve** → `definition v1`, `cohort_scope = ASSESSMENT_COMPLETED`,
`min_cohort_size = 30`. `report_formula_active[12] → v1`.

**Batch** over 214 respondents: one dataset load, one evaluation pass writing
214 `values_json` snapshots, then 214 independent renders.

**One respondent's snapshot:**

```json
{"extraversion_score": 78.0, "extraversion_band": "High", "extraversion_pct": 84}
```

**Template** merges it: `${extraversion_score | 1dp}`, `${extraversion_band}`,
`[[#bar extraversion_score min=0 max=100]]` → PDF.

Six months later that respondent is granted a re-attempt. Their answers change;
`values_json` does **not**. Recomputing `inputs_hash` now differs from the stored
one, so the report is flagged as superseded rather than silently rewritten.

---

## 10b. Open questions for the psychometricians

Design decisions this document takes a position on, but which are theirs to
overrule:

1. **Default `min_cohort_size`.** 30 is a convention, not a law. Some
   instruments will want 100; a pilot study may want 10 and accept the caveat.
2. **Population vs sample sd.** The existing evaluator uses population sd (÷ n).
   Changing it would move every Data Studio number already on screen. If sample
   sd is wanted for reports specifically, that is a **new whitelisted function**
   (`ZSCORE_S`), not a change to `ZSCORE`.
3. **Norm groups.** `cohort_scope` currently offers this assessment or this
   organization. Real psychometric practice often wants a **fixed external norm
   table** (published means/SDs, by age and sex) rather than a live cohort.
   That is a genuinely different feature — a `norm_table` entity the grammar can
   look into — and is deliberately **out of scope here**. Worth knowing it is
   the most likely next request; the `NORMBAND` cut arguments are the seam it
   would attach to.
4. **Who may approve.** This document says the draft author cannot approve their
   own draft unless super-admin. If the team is two people, that may be
   impractical — say so now rather than after it is built.
5. **Retention.** How long do generated PDFs live? They contain individual
   psychometric results, which is the most sensitive data in the product.

---

## 11. Build phases (for the later pass)

| Phase | Scope | Verifiable when |
|---|---|---|
| **1. Model + compiler** | `V21` migration, 7 entities, repositories, `ReportFormulaCompiler` with topological ordering and cycle rejection. No LLM, no PDF. | `./mvnw -B test` green with new compiler unit tests (cycle, forward ref, unknown column). |
| **2. Manual formula CRUD + dry-run** | Draft/definition/approve endpoints, `dry-run` over the real cohort, `ReportAccess` guard, separation of duties. Formulas typed by hand. | Live curl: create draft → dry-run → approve → active pointer moves. Prove 409/403/404 paths. |
| **3. LLM generation** | `RestClient` + OpenAI structured outputs, schema serialization, validate-and-retry loop, PII test. | Draft generated from a real prompt on a real assessment compiles without human edits. |
| **4. Review UI** | Pages under `/reports/formulas`, three-pane reviewer, client `formula.ts` for live syntax feedback, dry-run table with null-counts and band distribution. | `npm run typecheck && npm run build`; reviewer flow end-to-end in the browser. |
| **5. Templates + PDF** | OpenHTMLtoPDF, closed `${key}` renderer, template CRUD with placeholder-contract validation, inline-SVG chart helper. | A single respondent's PDF renders and matches the dry-run values. |
| **6. Batch** | `report_batch`, two-phase scoring/rendering, bounded executor, sweeper + requeue, storage dir + compose volume, purge job. | 100-report batch completes; one deliberately-broken template fails exactly one report. |

Phases 1–2 are independently useful: they give versioned, approved, auditable
scoring formulas with no LLM and no PDF in the picture.

---

## 12. Verification

Per `CLAUDE.md`'s loop, every phase:

1. **Backend** — `cd spring-social && ./mvnw -B test`
   (`clean compile` or `test`; a bare `compile` can report BUILD SUCCESS over
   code that does not compile).
2. **Frontend** — `cd bodhassess-app && npm run typecheck && npm run build`.
3. **Live smoke** — curl against `localhost:8080` with `__smoke__`-prefixed data,
   deleted afterwards; prove the **error** paths (400/404/409/403), not just the
   happy path.
4. IDE diagnostics arriving mid-edit are often stale — trust `tsc` and Maven.

**Migration caution specific to this repo:** `DB_PORT 3307` is an SSH tunnel to a
**shared staging MySQL**, and per memory a `V<n>.sql` file **auto-applies via the
IDE within seconds of being written**. `V21` must not be created until the schema
is settled and the write to shared staging is confirmed.

### Targeted tests worth writing

- Compiler: cycle, forward reference, self-reference, unknown column, valid DAG.
- `NORMBAND` boundary semantics at each cut (the inversion trap).
- `min_cohort_size` gate: n=1 emits `null`, not 0.
- Reproducibility: change an answer after generation → `values_json` unchanged,
  recomputed `inputs_hash` differs.
- PII: generation request body contains no respondent identifiers.
- Separation of duties: draft author cannot approve their own draft.
