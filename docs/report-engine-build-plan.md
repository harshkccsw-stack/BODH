# Report Engine — agreed architecture and build plan

> **Status: agreed in discussion 2026-09-03. No code written.**
> Starts fresh from `report-generation-engine-spec.md` (the codegen brief).
> Supersedes [report-rules-and-templates-plan.md](report-rules-and-templates-plan.md)
> as the *build* document; that doc stays worth reading for its argument
> against codegen (§4) and its risk list, both of which informed this one.
> Every fact in §1 was re-verified against source and the live DB on 2026-09-03.

## 0. The three decisions taken

| Question | Decision |
|---|---|
| **What artifact does the AI produce?** | **Python. Committed, not deferred** — confirmed business requirement, 2026-09-03. `artifact_kind = PYTHON`, and the spec's §7 sandbox service is built as specified. The `EXPRESSION` branch of the schema stays defined but unused. |
| **PDF rendering** | **Spiked day one, throwaway** (§4.1). Devanagari font embedding inside `eclipse-temurin:25-jre` is the failure that reshapes the template design, and it must be found in hour one. |
| **Access control** | **A `ReportAccess` guard modelled on `DataStudioAccess`** — rejects anonymous regardless of the global `app.security.require-auth` switch. No platform-wide auth change. |

Everything else in the spec — template-first tag binding, versioned immutable
profiles, approve-once-then-reuse, **no AI call at render time**, determinism,
no silent regeneration, full audit of meta-prompt and raw response — is adopted
as written.

**Two consequences of committing to Python, stated up front because they change
the shape of the build:**

1. **The sandbox is a first-class deployment component**, not a conditional one.
   The stack goes from one Java container plus one MySQL to **three services**.
   It gets its own phase (P3), its own image, and it is built and tested against
   hand-written Python **before** any LLM is involved.
2. **The LLM moves onto the critical path.** In the EXPRESSION branch a
   practitioner could author a computation by hand and the feature worked with
   the model switched off. With codegen, **no computed value exists until
   generation succeeds.** P1 and P3 still work LLM-free; P4 onward does not.
   Degradation planning (§5, P4) therefore matters more than it did.

---

## 1. Ground truth (verified 2026-09-03)

### Nothing of the engine exists

| Checked | Found |
|---|---|
| Live DB | local Docker `bodhpsychometric-mysql`, host port **3309** (uncommitted `application.yml` change from 3310). **37 tables**, `flyway_schema_history` at **v24, all `success = 1`**. |
| Next migration | **V25.** `V24__add_respondent_phone_country_code.sql` is the last applied. |
| Report tables | **None.** Only `ds_*` (Data Studio) matches anything nearby. |
| `pom.xml` | 15 dependencies. **No LLM client, no PDF library, no HTTP client.** |
| Outbound HTTP | The backend has **never** made one. No `RestClient`/`WebClient`/`RestTemplate`. |
| Auth | No Spring Security. `security/ActorFilter.java` is a servlet filter; `app.security.require-auth` defaults to **`false`**. |

### `/api/reports` is taken

`controller/reports/AssessmentReportController.java` owns it with 10 endpoints
(`getOrganizations`, `getRespondents`, `export/assessment/{id}`,
`resetAssessment/{id}`, `liveTracking`, …) — the respondent-listing and XLSX
surface, unrelated to this engine. New roots must not nest under it or they
collide with its `getById`-style paths.

**Agreed roots:** `/api/report-templates`, `/api/report-computations`,
`/api/report-definitions`, `/api/report-batches`.

### Two things the spec asks for are already built

**Spec §8 `respondent_data(payload_json)` — do not build it.**
`DataStudioDatasetService.dataset(assessmentId, organizationId)` (352 L) already
emits exactly that payload, over a stable key namespace declared at lines 87–92:

```
core:   demo:   ans:   mqt:   mqtt:   mq:
```

`columnKeys(assessmentId, organizationId)` returns the valid set for a given
assessment. Copying this into a table gives two sources of truth for scores that
`MqtScoringService` (335 L) derives live. **This answers spec §12 open question
1: the respondent payload shape *is* `columnKeys()`.**

**A rule engine already exists.** `service/datastudio/expression/`:

- `ExpressionService` (435 L) — lexer, parser, and `validate()` which returns
  structured English errors (`"Unknown column: mqt:99"`, `"IF() takes 3
  arguments"`) and **never throws**. Not the artifact format any more, but its
  known-column set is reused as the validation authority in §4.3.
- `ExpressionEvaluator` (287 L) — `IF AND OR NOT MIN MAX ABS SQRT LOG ROUND
  NORMBAND COUNTIF AVERAGEIF AVERAGE SUM COUNT PERCENTILE PERCENTRANK ZSCORE
  RANK`.
- Type system is `NUMBER, STRING, BOOLEAN, UNKNOWN`.

### What the existing DSL cannot do — the gap codegen fills

Checked against the grammar as it stands today. Recorded because it defines what
the generated code must be *able* to do, and because two of these rows are the
reason the DSL was never sufficient:

| Spec §1 claim | Verdict |
|---|---|
| conditionals | **Already handled** — `IF()` |
| multi-variable logic | **Already handled** |
| lookups against norm tables | **Real gap.** No lookup function exists. |
| string / statement generation | **Real gap.** A `STRING` can only come from a literal, `NORMBAND()`, or an `IF()` with string branches. **No concatenation, no interpolation, no string functions at all** (verified in `ExpressionService` lines 193–212). |

The DSL cannot write a sentence and cannot look up a norm table. Both are core
to the reports the business needs, which is what settles the artifact question in
favour of generated code.

**`ExpressionService` is still reused** — not as the artifact format, but as the
**column-name authority**. Its known-column set is what `referenced_keys` is
validated against in §4.3, and `columnKeys()` remains the whitelist a generated
function may read.

### Facts that constrain the design, not opinions

1. **Java 25 has no in-process sandbox, so the separate process is mandatory.**
   JEP 486 permanently disabled the Security Manager in Java 24; `pom.xml` pins
   `<java.version>25</java.version>`. There is no configuration that makes
   in-process execution of generated code safe, and `Thread.stop` is gone, so a
   runaway generated function could not be killed from inside the JVM — it would
   take the portal down mid-assessment for every respondent then answering.
   **This is why the sandbox is a separate service (P3), and it is not
   negotiable at any point in the build.**
2. **A re-attempt destroys the previous one.**
   `AssessmentReportService.resetAssessment()` (line 462) hard-deletes both
   `AssessmentAnswer` and `DemographicResponse` rows and flushes. Nothing is
   archived. `RespondentAssessmentMapping` carries `uqRamRespondentAssessment`
   on **(respondent, assessment) with no `attemptNumber`**.
   *(CLAUDE.md still says "one row per ATTEMPT: unique respondent + assessment +
   attemptNumber". That is stale and should be corrected.)*
   **Consequence: `values_json` is not hygiene, it is the only surviving record
   of what a delivered report was built from.** Granting a re-attempt after
   issuing a report destroys the evidence behind it.
3. **Generated PDFs would vanish on redeploy.** `docker-compose.yml:97-98` has
   `app-uploads:/app/uploads` **commented out**. Must be uncommented before any
   batch phase ships.
4. **Do not inherit `DsSheetService.compute()`'s failure mode.** Lines 217–222
   catch a parse failure, `row.put(colKey, null)`, and continue. For a
   spreadsheet a blank cell is fine; **for a report a null score is a wrong
   report.** Report compilation fails loudly.

### Frontend today

`bodhassess-app/src/pages/Reports/` — 3 890 lines over 6 pages. `ReportsHub`,
`all-reports` and `response-sheets` are wired. **`clinical.tsx` (374 L),
`counselling.tsx` (451 L) and `industrial.tsx` (441 L) call no `/api/` endpoint
at all** — unwired prototypes. They are still the best requirements document we
have: three genuinely different report shapes over one instrument library, which
is why a report definition is keyed by **(assessment × template)**, not per
assessment.

---

## 2. Tech stack

| Layer | Choice | New? |
|---|---|---|
| Backend | existing Spring Boot 4.1 / Java 25, new package `service/report/` | no |
| Data source | `DataStudioDatasetService.dataset()` — no new respondent tables | no |
| Migrations | Flyway, **V25 onward**, one per phase (never bundled) | no |
| Access | `ReportAccess` + `RequestActor`, modelled on `DataStudioAccess` | no |
| PDF | **OpenHTMLtoPDF** — pending the §4.1 spike | **yes, first PDF dep** |
| LLM | **Claude Java SDK** (`com.anthropic:anthropic-java`), behind a provider interface per spec §10. **Key from environment, never `application.yml`.** | **yes, first outbound HTTP ever** |
| **Sandbox service** | **Committed.** Standalone Python service, container-isolated, `POST /execute` per spec §7. Its own image and compose entry. | **yes, new component** |
| Frontend | `src/pages/Reports/*`, added to the **existing Reports aside group** | no |

### The sandbox service, specified

Built in P3 against hand-written Python, before any LLM exists in the codebase.

- **Isolation:** its own container; the generated code runs in a **subprocess
  within it**, never in the request thread. No filesystem write access, **no
  network namespace**, no `subprocess`.
- **Caps:** hard wall-clock timeout (5 s for a cohort call) and a memory cap,
  both enforced by killing the subprocess, not by cooperative checks.
- **Import allowlist:** `math`, `statistics`, `json`, `re`, `decimal`,
  `itertools`, `collections`. Everything else rejected **statically before
  execution**, plus an import hook at runtime as the backstop.
- **Determinism is enforced, not hoped for** (spec §10). `random`,
  `datetime.now`, `time`, `uuid`, `os.environ` and `id()` are **banned outright**
  — every one of them makes the same profile version return different values for
  the same respondent, which is precisely what makes reuse unsafe. This is a new
  failure mode that expressions could not have; the ban is the mitigation.
- **The interpreter is pinned.** The stored code is only half the reproducibility
  story — the same source on a different Python or stdlib can differ. Record the
  **sandbox image digest** on `report_computation_version` alongside the model
  used, and pin the image in compose.
- **API:** `POST /execute {code_ref, respondents[], reference_data}` →
  `{values_by_respondent}` or `{error}`. Cohort-wide, per §4.2.

**The LLM is not optional any more.** P1 and P3 work with it switched off; from
P4 there are no computed values without it. Plan degradation accordingly —
authoring, approving, rendering and batch must never call it, so an outage
blocks *new* report definitions only, never delivery of existing ones.

---

## 3. Data model — artifact-agnostic by construction

**The schema below is unchanged by the Python decision** — `artifact_kind` was
always a column, never a fork in the model. The abstraction it rests on holds
regardless:

> **A computation is a versioned, immutable artifact that maps respondent data to
> a set of named output keys.**

- **PYTHON mode — what we are building.** One computation per
  (assessment × template); `output_keys` is every tag in the template;
  `artifact_body` is the generated function.
- **EXPRESSION mode — defined, unused.** Kept as a valid `artifact_kind` value
  because it costs nothing and it is the escape hatch if a hand-authored
  computation is ever wanted. **Do not build UI or an evaluator for it.**

The tag binding points at **(computation version, output key)** either way.

**Three consequences of PYTHON mode for how these columns behave** — worth
stating because each one is a place where the natural EXPRESSION reading is
wrong:

- **`slug` / `assessment_id NULL` no longer imply a reusable rule library.** In
  EXPRESSION mode a small named rule over global `mqt:` keys was automatically
  portable. A generated function bound to one template's full tag list is not.
  **Reuse across assessments happens through spec §4.4 cloning — an explicit
  human action that re-runs generation and re-approves — never automatically.**
  Do not build a "this rule runs on 7 assessments" screen.
- **`is_population` must be declared, not derived.** In EXPRESSION mode it was
  computed at save by looking for `ZSCORE`/`PERCENTILE`/`RANK`. Arbitrary Python
  cannot be reliably analysed for this, and the cohort-wide contract (§4.2) hands
  the function every respondent, so population logic is *always* reachable.
  **The generation envelope declares it and it defaults to `true`** — the
  conservative direction, since the only thing it gates is the
  `min_cohort_size` guard.
- **`referenced_keys_json` comes from the model's declaration, then is
  enforced** — see §4.3, which is what recovers the compile-time safety the DSL
  gave for free.

### Migration numbering — strict ship order

**Version numbers are assigned in the order phases ship, never reserved ahead.**
Flyway runs with `outOfOrder` at its default `false`, so a migration that appears
*after* a higher-numbered one has already been applied fails validation on every
subsequent boot — and it cannot be fixed by editing, because applied migrations
are checksummed.

| Migration | Phase | Tables |
|---|---|---|
| **V25** | P1 | `report_template`, `report_tag_binding` |
| **V26** | P2 | `report_computation`, `report_computation_version`, `report_definition`, `report_definition_active` |
| **V27** | P4 | `generation_audit_log` |
| **V28** | P6 | `report_batch`, `generated_report` |

### V25 + V26 — templates, tag binding, computations, definitions

```
report_template
  report_template_id  bigint PK
  name                varchar(160) NOT NULL
  description         text
  html                longtext NOT NULL
  tags_json           text                 -- extracted on save
  status              varchar(12) NOT NULL -- DRAFT | PUBLISHED | ARCHIVED
  version             int NOT NULL
  organization_id     bigint NULL
  created_by_user_id, created_at, updated_at
  UNIQUE uqRtNameVersion (name, version)

report_computation                          -- the neutral artifact holder
  report_computation_id  bigint PK
  name                   varchar(160) NOT NULL
  slug                   varchar(80)  NOT NULL   -- referenced as [computation:slug]
  description            text
  assessment_id          bigint NULL             -- NULL = global / portable
  status                 varchar(12) NOT NULL    -- DRAFT | PUBLISHED | ARCHIVED
  UNIQUE uqRcSlug (slug, assessment_id)

report_computation_version                  -- immutable, never deleted
  report_computation_version_id bigint PK
  report_computation_id   bigint NOT NULL   FK fkRcvComputation (containment)
  version                 int NOT NULL
  artifact_kind           varchar(16) NOT NULL  -- always 'PYTHON'; EXPRESSION reserved, unused
  artifact_body           longtext NOT NULL     -- the generated function source
  sandbox_image_digest    varchar(80)           -- pins the interpreter (see §2)
  output_keys_json        text NOT NULL         -- ["extraversion"] | ["k1","k2",...]
  result_types_json       text                  -- key -> NUMBER|TERM|TEXT|LIST
  referenced_keys_json    text                  -- from validate() / static analysis
  is_population           boolean NOT NULL      -- uses ZSCORE/PERCENTILE/RANK
  source_prompt           text                  -- practitioner's words, if AI-drafted
  model_provider          varchar(80)
  model_used              varchar(80)
  created_by_user_id, created_at
  UNIQUE uqRcvVersion (report_computation_id, version)

report_tag_binding
  report_tag_binding_id   bigint PK
  report_template_id      bigint NOT NULL  FK fkRtbTemplate (containment)
  tag                     varchar(80) NOT NULL
  binder_type             varchar(16) NOT NULL
  report_computation_id         bigint NULL
  report_computation_version_id bigint NULL   -- PINNED, never floats to latest
  output_key              varchar(80) NULL
  literal_text            text NULL
  core_field              varchar(40) NULL
  format                  varchar(40)
  fallback_text           text
  author_note             text                 -- the spec's per-tag Guidance Prompt
  UNIQUE uqRtbTemplateTag (report_template_id, tag)

report_definition                           -- template + assessment, compiled
  report_definition_id  bigint PK
  assessment_id         bigint NOT NULL
  report_template_id    bigint NOT NULL
  version               int NOT NULL
  status                varchar(12) NOT NULL  -- DRAFT | APPROVED | DEPRECATED
  cohort_scope          varchar(24)
  min_cohort_size       int NOT NULL
  approved_by_user_id, approved_at, created_at
  UNIQUE uqRdAssessmentTemplateVersion (assessment_id, report_template_id, version)

report_definition_active                    -- one active per (assessment, template)
  assessment_id        bigint NOT NULL
  report_template_id   bigint NOT NULL
  report_definition_id bigint NOT NULL
  PRIMARY KEY (assessment_id, report_template_id)
```

The two-column PK on `report_definition_active` is how one-active-per-pair is
enforced — **MySQL has no partial unique index.**

`binder_type` answers *"what fills this tag?"*:

| `binder_type` | Fills with | Needs |
|---|---|---|
| `VALUE` | a computation's output key, formatted | computation |
| `NARRATIVE` | prose written by the generated function — a `TEXT`-typed output key | computation |
| `TABLE` | a row per MQT under an MQ | computation group |
| `CHART` | server-rendered **inline SVG** | computation + min/max |
| `LITERAL` | fixed text — headings, boilerplate, disclaimers | nothing |
| `CORE` | respondent name, dob, org, assessment date, report date | nothing |

**`CORE` and `LITERAL` are why P1 ships something real with zero computation
built.** Without them every tag is forced through the machinery.

### Deferred to the phase that knows the shape

- **Snippet tables — dropped entirely.** `report_snippet_set` / `report_snippet`
  existed only to give the EXPRESSION branch a way to produce prose. **The
  generated function writes its own prose**, so banded snippet tables are not
  built at all. `NARRATIVE` stays a `binder_type`; it is simply filled by a
  `TEXT`-typed output key like any other.
- **V27 (P4)** — `generation_audit_log` (spec §8): meta-prompt, raw LLM response,
  the declaration envelope, validation result and retry number, **per attempt,
  successful or not**. With codegen committed this is the only record of why a
  profile says what it says, so it ships with generation, not after it.
- **V28 (P6)** — `report_batch`, `generated_report` (`values_json`,
  `inputs_hash`, the **sandbox image digest** used, and **two independent status
  columns**: `status` = machine progress `PENDING → READY_TO_RENDER → READY |
  FAILED`; `reviewStatus` = human sign-off `DRAFT | APPROVED | FINALIZED`, taken
  from `clinical.tsx`). Delivery gates on `reviewStatus`, never on `status`.

### Compiling a definition — hard errors, never null-fills

1. every tag in the template has a binding;
2. every bound computation version resolves and parses;
3. every `referenced_keys` ⊆ `columnKeys(assessmentId, orgId)` — *this*
   assessment actually scores those MQTs;
4. the computation DAG is acyclic (no cycles, self-reference, forward refs);
5. `is_population` anywhere ⇒ cohort ≥ `min_cohort_size`, else those tags emit
   `null` and the report prints a "norm group too small" block rather than a
   fabricated number;
6. only **COMPLETED** attempts are eligible — `DataStudioDatasetService` leaves
   score columns NULL for anything else, so every computation would be null.

Runs **at approval (blocking)** and **again at generation** — an assessment's
columns change when questions are unplaced, and failing a batch fast beats
emitting 500 blank reports.

---

## 4. The PDF spike, the rule corpus, and validating generated code

§4.1 is a throwaway spike and is not committed. §4.2 is an input to collect, not
a decision to make. §4.3 is design that ships in P4.

### 4.1 P0a — PDF, day one

Prove **inside `eclipse-temurin:25-jre`**, the actual runtime image:

- OpenHTMLtoPDF runs on Java 25;
- **Devanagari glyphs render as glyphs, not boxes** — respondent names are
  Indian; this is a font-embedding problem, not a library one, and it is the
  single most likely failure;
- inline SVG bar and gauge;
- a CSS 2.1 two-column layout with page breaks — **no flexbox, no grid, no JS**;
- an `Organization.logoBase64` data URL embedded in the header.

**Done when:** a PDF generated inside the runtime image opens with correct
Devanagari, a visible SVG bar, and the org logo. **If fonts fail, the template
design changes shape** — that is what this buys.

#### RESULT — ran 2026-09-03. **PASS, 9/9 checks.**

Spike built exactly like `spring-social/Dockerfile`: compiled in
`eclipse-temurin:25-jdk`, **executed in `eclipse-temurin:25-jre`** (`java.version
= 25.0.4`, `javac` absent, headless). OpenHTMLtoPDF **1.0.10** +
`openhtmltopdf-svg-support` (Batik). Two A4 pages rendered in **~2.8 s**, 27 KB.

| Proved | Result |
|---|---|
| OpenHTMLtoPDF on Java 25 in a JRE image | works |
| **Devanagari in HTML body** — conjuncts (`प्र`, `श्रेणी`), matras, Devanagari digits (`८०`), danda | **correct**, verified by text extraction *and* by eye |
| Justified Devanagari paragraph | correct |
| Inline SVG gauge + bar chart | draws |
| CSS 2.1 two-column (float), page break, `counter(page)` footer | all work |
| `Organization.logoBase64` data URL in the header | embeds |
| **SSRF: `<img src="http://169.254.169.254/...">`** | **blocked at the renderer**, no fetch attempted, no broken-image artifact |
| Font embedding | **one font in the whole PDF, subset-embedded, drawing 100 % of glyphs** |

**Fonts do NOT fail — but only because of three findings that are now P1
requirements.** Each one produced tofu or an unembedded font until fixed:

1. **The font must be embedded from the classpath.** A JRE image has **no system
   fonts at all** (`fontconfig` sees only DejaVu). Ship a Devanagari TTF as a
   resource and register it with `PdfRendererBuilder.useFont(...)`. Noto Sans
   Devanagari (647 KB) works, including as a *variable* font.
2. **Batik does not use OpenHTMLtoPDF's font registry — it resolves through
   AWT.** So SVG `<text>` ignored `useFont()` entirely and fell back to base-14
   Times-Roman, which has no Devanagari: **`सजगता` rendered as five tofu boxes
   inside the chart while the same string was perfect in the table two inches
   below.** Fix, both halves required:
   - `GraphicsEnvironment.getLocalGraphicsEnvironment().registerFont(...)` the
     same TTF at startup, and
   - put an explicit `font-family` on **every** SVG `<text>` element.

   **This is the single most dangerous finding in the spike**, because it fails
   *silently and partially* — the document looks fine everywhere except inside
   charts, which is exactly where a reviewer's eye does not go first.
3. **`@page` margin boxes do not inherit `body`'s `font-family`.** The
   `@bottom-center` page-number footer silently used unembedded Times-Roman.
   Declare `font-family` inside the margin-box rule itself.

**Consequences for P1, all cheap:**

- Add a `resources/fonts/` Devanagari TTF to `spring-social` and a
  `ReportFontRegistry` that does the `useFont()` *and* the AWT `registerFont()`.
- **Template lint at publish time:** reject an SVG `<text>` with no
  `font-family`, and a `@page` margin box with no `font-family`. Both are
  one-line regex checks that prevent a class of silent corruption.
- **Assert font embedding in a test**, not by eye: parse the output with PDFBox
  and fail if any font drawing a glyph lacks a `FontFile2`. That check is what
  caught findings 2 and 3 — visual review had already passed finding 3.
- `useUriResolver` returning `null` for every non-`data:` URI is a working SSRF
  deny and needs no HTML validation. Keep the logo as `data:`.
- The renderer is **not** PDF-only: same HTML serves the `Interactive` format.

Spike lives in the session scratchpad (`p0a-pdf-spike/`), **uncommitted and
throwaway** per plan. Output PDF + page PNGs are in its `out/`.

### 4.2 P0b — the rule corpus (a test asset, not a gate)

**No longer a spike and no longer decides anything.** `artifact_kind = PYTHON` is
settled (§0). The 8–10 real rules are still needed, but their purpose has
changed: they are **the acceptance corpus for the codegen pipeline and the
sandbox**, and they are what turns "the model produced something" into "the model
produced the right thing".

**The ask of the psychometrician team, restated:**

1. **8–10 real scoring / interpretation rules**, written as they are actually
   written today — the raw text, not a paraphrase. These become
   `report_computation.source_prompt` fixtures.
2. **Golden values: for each rule, the expected output for at least two
   respondents**, worked by hand — ideally one mid-range and one edge case.
   **This is the part that cannot be skipped.** Without expected values, every
   test can assert is *"the generated code ran without raising"*, and code that
   runs clean while putting every respondent in the top band passes that test
   perfectly. The golden values are the only thing that catches it
   automatically.

**What the corpus is used for:**

| Use | Where |
|---|---|
| Calibrating the meta-prompt — what the model needs told before it writes correct code | P4 |
| **Regression suite**: re-run every fixture whenever the meta-prompt, the model, or the sandbox image changes, and diff against golden values | P4 onward, permanently |
| Exercising the sandbox at its limits — the hardest rules are the ones that find the timeout, the memory cap and the import allowlist | P3 |
| Proving the cohort-wide contract, since population rules only make sense over a cohort | P3 |

**Span matters more than count.** Deliberately include the hard cases — a rule
needing a norm-table lookup, one producing a paragraph of prose, one whose answer
depends on other rules' outputs, and one population-relative rule. A corpus of
ten easy rules certifies nothing.

#### STATUS — 2026-09-03

**Intake sheet written and ready to send:**
[report-engine-rule-corpus-intake.md](report-engine-rule-corpus-intake.md). It is
written for psychometricians, not engineers — plain English, a fillable block per
rule, a fully worked example showing a band-boundary case, and a coverage
checklist. It also asks for the two things §7 of the spec needs alongside: any
**norm/lookup tables**, and **one sample report of each type** they consider
correct, which becomes the target the HTML template is built to match.

**Blocker found while grounding it — the dev database is EMPTY.** Verified
against the live container: schema at Flyway v24, but `assessment`,
`measured_quality`, `measured_quality_type`, `question`, `respondent_user`,
`assessment_answer`, `questionnaire` and `organization` all have **zero rows**.
Only the local container on **3309** is up; 3307 and 3310 are both closed, so
there is no staging tunnel to fall back on.

Consequences, and they are not small:

- There is **no assessment to run a rule against and no cohort** to compute a
  percentile, z-score or band histogram over. The distribution strip (§4.3) has
  nothing to plot.
- **P1 can still proceed** — templates, tag binding and rendering need a
  respondent's *fields*, which can be stubbed, and P0a already proved the
  renderer end to end with synthetic content.
- **P4's acceptance and P5's approval gate cannot be verified** without a seeded
  assessment with COMPLETED attempts, or read access to a populated environment.
  Needed before P4, not before P1 — but it has a lead time, so it is raised now.
- Worked answers (§3 of the intake) are **hand-computed and do not depend on
  this**, which is why the intake can go out immediately.

**Change to the spec's §6 contract, confirmed:** the generated function takes the
**whole cohort**, not one respondent:

```python
def compute_report_values(respondents: list[dict],
                          reference_data: dict | None = None) -> dict[str, dict]:
    """Returns {respondent_id: {template_key: value}} for every respondent given."""
```

A 500-report batch is otherwise 500 sandbox round-trips, and population functions
need the cohort in scope anyway.

### 4.3 Recovering the checks the DSL gave for free

The spec's §4.1 step-6 validation — no exceptions, all keys present, correct
types, no disallowed imports — is necessary and insufficient. It cannot catch
code that runs clean and is wrong. Three mechanisms close most of that gap, and
all three belong in P4:

1. **The model returns a declaration envelope, not bare code.** Structured
   output: `{code, output_keys[], referenced_keys[], is_population, notes}`.
2. **`referenced_keys` is verified against `columnKeys(assessmentId, orgId)`
   before anything executes** — an invented column is rejected and the error
   text goes back to the model for a retry, which is exactly the machine-checkable
   loop `ExpressionService.validate()` provided in the EXPRESSION branch.
3. **The sandbox is handed only the declared columns.** Build each respondent
   dict from `referenced_keys` alone. A function that reads an undeclared key
   raises `KeyError` **in testing, loudly**, instead of silently returning `None`
   for every respondent in production. This is the single highest-value check in
   the whole pipeline and it costs one dict comprehension.

**What none of them catch — and what does:** a band cut written backwards, or a
sign error. That is caught by the **cohort distribution strip** on the approval
screen (§5, P5): per-tag min / max / mean, **null count**, and **band histogram**
over the whole cohort, beside the sample reports. `risk_flag — High 100 %` is
instantly visible there and invisible in any single PDF. **Build the strip; it is
the last line of defence and the only one that sees the whole population.**

### 4.4 Two constraints confirmed as requirements — re-verified 2026-09-03

Raised by leadership as explicit requirements rather than engineering
preference. Both were already in the design; both are **still in place**, and
each now has something enforcing it rather than only describing it.

#### 1. Generated code runs in the sandbox only, with no database access

**Confirmed, and strengthened by the rules page rather than weakened by it.**

The mechanism is §4.3's third point — the sandbox is handed *only the declared
columns* — and the rules library is what now computes that set:

- Each `report_rule_version` stores `referenced_keys_json`, derived from the
  parser at save time, never typed by hand.
- `ReportPromptAssembler` unions those across every pinned rule version into
  `declaredKeys`, and the prompt states that the sandbox receives only those.
- The **draft screen shows the list to the author**, so "what can this code see"
  is a visible property of the computation, not a claim buried in a service.
- Every respondent dict handed to the sandbox is built from that list alone, so
  reading an undeclared key raises immediately instead of returning `None` for
  everybody.

The generated function's only inputs are `respondents` and `reference_data`. It
gets no connection, no credentials, and no network — the sandbox has no network
namespace at all (§2). **Nothing in the rules or computation work changes this**;
the only new surface is the column *catalog*, which is read server-side to build
the prompt and is never reachable from generated code.

#### 2. A mandatory human review after generation, before real respondents

**Confirmed, not simplified.** The P5 approval gate stands: pick respondents,
generate, read the PDFs, approve — with the distribution strip beside them.

Two things now enforce the ordering rather than relying on discipline:

- `ReportComputation` has **five** statuses, and `APPROVED` is not reachable from
  anything built so far. Today's ceiling is `READY_FOR_GENERATION`.
- `markReady` is deliberately **not** an approval, and says so in its own
  javadoc, its API doc and the UI. It asserts the *prompt* is complete — nothing
  about output quality, which does not exist yet.
- An `APPROVED` computation cannot be edited, reopened or deleted; the only move
  is to clone it. That is what keeps already-issued reports explicable.

**One thing to hold on to when P4 lands:** the temptation will be to let a
successful validate-and-retry mark a computation `GENERATED` *and* usable. It
must not. `GENERATED` means an artifact exists and has passed machine checks —
which, as §4.3 says plainly, cannot distinguish correct code from code that puts
every respondent in the top band.

---

## 5. Phases

| | Phase | Schema | Needs LLM? | Shippable | Status |
|---|---|---|---|---|---|
| **P0a** | PDF spike — throwaway | — | no | no | **DONE** 9/9 (§4.1) |
| **P0b** | Rule corpus + golden values, from the psychometricians (§4.2) | — | no | no | **Intake sent** |
| **P1** | Templates, tag extraction + binding, `CORE`/`LITERAL` binders, renderer, PDF | **V25** | no | **yes** | **DONE** (§5.1) |
| **P2** | Rules library + computation drafts + prompt assembly, up to "ready to send" | **V26** | no | **yes** | **DONE** (§5.2) |
| **P3** | **Sandbox execution service** — new container, built and tested against hand-written Python | — | **no** | no | next |
| **P4** | Codegen — provider behind an interface, declaration envelope, validate-and-retry, audit log. **Prompt assembly already done in P2** | **V27** | **yes** | yes | blocked: no provider chosen |
| **P5** | Approval gate — pick respondents, generate, read PDFs, **cohort distribution strip**, approve. **Mandatory (§4.4)** | — | no | **yes** | |
| **P6** | Batch + `values_json` + `inputs_hash` + `reviewStatus` | **V28** | no | yes | |
| **P7** | Cloning across assessments, interactive HTML, retention, prototype-page rework | — | no | yes | |

**P1 ships a real, useful report with zero computation built** — respondent name,
dob, org, assessment date, plus authored boilerplate — and it de-risks the entire
template/render/PDF half before any generated code exists. That is the point of
ordering it first, and it is unchanged by the Python decision.

**P3 before P4 is deliberate.** The sandbox is built and hardened against
hand-written Python — timeout, memory cap, import allowlist, the determinism
bans, the cohort contract — while its inputs are still fully controlled. Standing
up an execution sandbox and an LLM in the same phase means every failure has two
possible causes.

### 5.1 P1 — built and verified 2026-09-03

**154 backend tests green** (105 before, so 49 new), `npm run typecheck` and
`npm run build` both clean, **V25 applied to the live local DB** and accepted by
`ddl-auto: validate` on a real boot.

| Shipped | Where |
|---|---|
| `V25` — `report_template`, `report_tag_binding` | `db/migration/` |
| Entities, repositories, `ReportCoreFields` | `model/report/`, `repository/report/` |
| Tag parse + **save-time reconcile** (answers survive an HTML edit) | `TemplateTagParser`, `ReportTemplateService` |
| **`TemplateLint`** — the P0a findings as publish-blocking rules | `service/report/` |
| **`ReportFontRegistry`** — registers the face with `useFont()` *and* AWT | `service/report/` |
| `ReportRenderer` — PDF + interactive HTML, network denied | `service/report/` |
| `ReportAccess` (rejects anonymous regardless of the global flag), `ReportExceptionHandler` | `service/report/`, `controller/report/` |
| `/api/report-templates` — getAll, getById, coreFields, create, update, bindTag, publish, delete, preview.pdf, preview.html | `controller/report/` |
| Authoring page + api, routed under the existing Reports menu | `pages/Reports/report-templates.tsx` |

**A real report renders today with zero computation**: respondent name (in
Devanagari), dob, gender, organization, serial id, report date, plus authored
boilerplate — as a PDF *and* as an interactive page.

**Five things found while building, each recorded because they were not
predictable from the plan:**

1. **Flyway substitutes `${...}` in migration FILES.** A migration whose comments
   merely *document* the `${tag}` syntax fails to parse with *"No value provided
   for placeholder"* — and it fails at boot, not in tests, because tests run with
   `flyway.enabled: false`. Nothing in 24 prior migrations used a placeholder, so
   `placeholder-replacement: false` is now set in both profiles rather than every
   future report migration having to avoid writing the syntax it implements.
2. **The attempt has no timestamp.** `RespondentAssessmentMapping` carries no
   `completedAt` and no `createdAt`, so the date a respondent sat an assessment
   **is not in the database**. `core:assessmentDate` was therefore removed rather
   than filled from the assessment's availability window, which would print the
   same date for everyone. Adding the column is a change to an existing table
   plus a backfill decision — P2, where `inputs_hash` needs it anyway.
3. **`text/html` with no charset mangles Devanagari.** Caught by the interactive-
   preview test. The PDF path is immune because its bytes carry their own
   encoding; the HTML path is not. Charset is now explicit on that endpoint.
4. **`Map.copyOf` returns an UNORDERED map** — it would have silently scrambled
   the CORE dropdown that `ReportCoreFields` exists to order.
   `Collections.unmodifiableMap` over a `LinkedHashMap` instead.
5. **`npm run typecheck` was already failing on `master`** — 7 × TS1261. The
   on-disk `src/pages/reports/` had drifted to lowercase while git and every
   import say `Reports`, which Windows hides and `tsc` does not. Case-renamed the
   directory; typecheck is now clean for the first time in this branch. Verified
   pre-existing by stashing all P1 work and re-running.

**Deviation from the phase table, deliberate:** `ReportAccess` and
`ReportExceptionHandler` were listed under P2 but shipped in P1 — P1 exposes
endpoints, and endpoints need an auth gate and status-code mapping or none of
their error paths can be verified.

### 5.2 P2 — built and verified 2026-09-03

**185 backend tests green** (154 before, so 31 new), typecheck and build clean,
**V26 applied to the live local DB** and accepted by `ddl-auto: validate`.

Everything up to *"ready to send to an AI"*, and **deliberately nothing past it**
— no provider chosen, no outbound call, no `generate` endpoint (there is a test
asserting that endpoint 404s).

| Shipped | Where |
|---|---|
| `V26` — `report_rule`, `report_rule_version`, `report_computation`, `report_computation_rule`, `report_computation_tag_guidance` | `db/migration/` |
| **Rules library** — formula *or* plain-language, immutable versions, slug references | `ReportRuleService`, `/api/report-rules` |
| **Live per-assessment column catalog** | `ReportColumnCatalog` |
| **Meta-prompt assembly** — spec §5, with identity stripped | `ReportPromptAssembler` |
| **Computation drafts** — rules + template + respondents + guidance, per-tag | `ReportComputationService`, `/api/report-computations` |
| Rules page with a live MQ/MQT picker; computations page with the prompt preview | `pages/Reports/report-rules.tsx`, `report-computations.tsx` |

**The MQ/MQT picker is live and per-assessment, as required.** It calls
`columns/getByAssessment/{id}` → `DataStudioDatasetService.dataset()` → the same
column set Data Studio validates its own formulas against. The frontend clears
and refetches the list whenever the assessment changes and never holds one
across assessments. Columns are inserted by click, so nobody types an identifier
from memory.

#### The bug this phase found, which is the exact hole it was asked to close

`ExpressionService.validate()` documents and implements *"an empty
`availableColumns` means do not check column names"* (line 141:
`if (!available.isEmpty() && ...)`). That is right for a Data Studio sheet not
yet bound to an assessment. It is **exactly wrong here**, and it bites twice:

1. Validating with no assessment chosen would pass **any** column name, telling
   the author their formula was fine when nothing had been checked.
2. Worse — an assessment whose questionnaire has nothing placed yields an
   **empty** key set, so a save against it would have accepted `[mqt:99999]`.
   That is precisely the "looks valid, scores every respondent null" failure the
   requirement is about, arriving through the back door.

Closed by `ReportRuleService.strictValidate`, which re-checks every referenced
column against the supplied set and treats **empty as "nothing is valid"** rather
than "everything is". Saving an expression against a column-less assessment is
now refused with a message saying why. A test pins it.

#### Design decisions worth knowing

- **`report_rule` is not `report_computation`.** A rule is what a psychometrician
  wrote — reusable input. A computation is the job that will eventually hold
  generated Python. Merging them would have made rules un-reusable.
- **Rules version on every save.** Editing writes v+1; a computation pins the
  exact `report_rule_version_id`. Improving a rule next March therefore cannot
  change what a report approved last September meant. Deleting a rule any
  computation uses is a 409, pre-checked.
- **Per-tag guidance is per computation, not per template** — otherwise two teams
  sharing a template could not give the same tag different instructions.
- **`report_computation_version` and `report_definition` were NOT built.** The
  phase table had them in V26. A table whose shape is guessed before its first
  row gets a correcting migration, and neither can be shaped until a provider's
  output is known. Migration numbers are assigned in ship order, so they take the
  next free number when written.

### Renderer notes that belong to P1

- Closed `${key | fmt}` substitution plus `[[#if]]`, `[[#each]]`, `[[#bar]]`,
  `[[#gauge]]`. HTML-escaped by default.
- **Its own allowlist.** `RichTextHtml` is a 12-tag, zero-attribute rejector; a
  report needs `<table>`, `<div>`, `class`, `style`, `<svg>`. Sidestep it rather
  than extending it.
- **SSRF: the HTML is user-authored and rendered server-side.** OpenHTMLtoPDF
  will happily fetch `<img src="http://169.254.169.254/...">` from inside the
  network. **Deny external resource loading at the renderer**, not by validating
  the HTML.

### Operational items that silently break P6 if missed

- **Uncomment `app-uploads` in `docker-compose.yml:97-98`** or every PDF vanishes
  on redeploy.
- **A bounded `TaskExecutor` bean.** There is none; `@Async` runs on Boot's
  default pool, where a 500-report render would starve `SubmissionDigestService`
  and delay live respondent submissions.
- **Capture the actor before dispatch.** `requireActor()` returns ANONYMOUS on
  `@Async`/`@Scheduled` threads — the request context does not cross.
- **Guard `resetAssessment`.** It hard-deletes answers (§1, fact 2). It must warn
  when reports exist: *"this permanently deletes the answers; N generated reports
  keep their saved values but can never be re-derived."*

### Batch failure granularity

Two phases, deliberately different: **scoring** is one dataset load, one compile,
all computations over the whole population — a failure fails the **whole batch
atomically**, because a broken definition must not quietly emit 500 blank
reports. **Rendering** is per respondent and independent — a failure fails
exactly one row, visibly, with a requeue.

---

## 6. Open questions

### Needed from the psychometrician team (P0b — no longer blocks the start)

1. **A seeded assessment with COMPLETED attempts** — or read access to a
   populated environment. The dev DB is **empty** (§4.2 STATUS). Blocks P4/P5
   verification, not P1–P3, but it has a lead time. Whose call this is — seed
   script vs. staging access — is a decision, not a task. **This is now the
   longest pole after the corpus itself.**
2. **8–10 real rules, plus golden values for two respondents each** (§4.2).
   **Intake sheet ready to send:**
   [report-engine-rule-corpus-intake.md](report-engine-rule-corpus-intake.md).
   These no longer gate the architecture, so **P1 through P3 can begin without
   them**. They gate P4's acceptance: without golden values the regression suite
   can only assert that generated code ran, not that it was right.
2. **Norm / lookup tables — do they exist, and are they static per assessment?**
   (spec §12 q2.) Nothing in the DB holds one today. **More urgent now than it
   was:** spec §5 requires reference tables be passed *as a parameter* to the
   generated function, never hardcoded into it — so `reference_data` needs a
   defined shape and a home before P4 writes the meta-prompt. If they need a
   management UI that is its own phase; if they are static per assessment they
   are rows hanging off the definition.

### Settled 2026-09-03

3. ~~**What happens to `clinical.tsx` / `counselling.tsx` / `industrial.tsx`?**~~
   **SETTLED: leave them alone.** They are for a future update and are out of
   scope for the report engine work. They have not been touched, replaced or
   rewired, and nothing in P1 or P2 depends on them. The new screens live
   alongside them under the same Reports menu group. Revisit at P7 at the
   earliest, and only if someone asks.

### Blocking P3

4. **Where does the sandbox run in production, and who operates it?** It is a
   third service. `docker-compose.yml` and the nginx config both need an entry,
   and it must be reachable **only from the backend** — never exposed publicly,
   since its entire purpose is executing submitted code.
5. **Which LLM provider and model, and whose API key?** (spec §10.) The provider
   interface is pluggable per spec, but P4 needs one concrete default configured,
   and the key must come **from the environment, never `application.yml`**.

### Blocking P5

6. **Who may approve a definition?** (spec §12 q4.) What is approved is *"I read
   these sample reports and they are right"* — arguably the psychometrician's
   judgement alone rather than a two-person control. Proposal: keep
   `app.reports.require-separate-approver` (default `true`) so this is a restart,
   not a rewrite.

### Blocking P6

7. **Retention.** How long do generated PDFs live? They are the most sensitive
   data in the product.
8. **Default `min_cohort_size`.** 30 is a convention, not a law. Below it,
   population outputs emit `null` — because with one completed respondent
   `sd == 0` and **every z-score comes back exactly 0**, indistinguishable from
   perfectly average.

### Settled

- **Multi-informant reports: OUT OF SCOPE**, per spec §2 and confirmed against
  the schema. Every table keys on a single `respondentUserId`; nothing links
  several respondents as raters of one subject. `counselling.tsx`'s `informants`
  field is a prototype's aspiration. Supporting it needs a **subject** entity and
  a rater role on the mapping — a change to *existing* tables, and a genuinely
  new feature, not a template option.
