# Report Engine — Rules Library + Template-Driven Tag Binding

> **Status: proposal for discussion. Nothing is built, no code written.**
> Written 2026-09-01 from the "rules page → template tags → AI fills them" brief.
> This is a **revision of the authoring model** in
> [report-engine-plan.md](report-engine-plan.md) (architecture, 2026-08-27) and
> [report-engine-execution-plan.md](report-engine-execution-plan.md) (build order,
> 2026-08-31). Those two stay the reference for the cohort problem, snapshotting,
> batch, PDF and guards — none of that changes. What changes is **how a
> practitioner authors a report**, and **where the AI sits**.
> Every code claim below was re-verified against source on 2026-09-01.

---

## 0. What already exists (verified 2026-09-01)

Checked before proposing anything, in source and against the live local DB.

**Nothing of the report engine is built.** No entity, table, endpoint or frontend
call from either existing plan exists.

| Checked | Found |
|---|---|
| Entities | 34 `@Table`s. **No** `Report*`, `Rule*`, `Template*`, `Snippet*` anything. |
| Migrations | `V24__add_respondent_phone_country_code.sql` is the last. **Next is V25.** |
| Live DB (`127.0.0.1:3310`, local, per `application.yml` working-tree change) | 37 tables, `flyway_schema_history` at **v24, all `success = 1`**. No `report_*` table. |
| `pom.xml` | **No** LLM dependency (`anthropic-java`, OpenAI) and **no** PDF dependency (OpenHTMLtoPDF, flying-saucer, iText). Both are still greenfield. |
| Outbound HTTP | Still zero `RestClient`/`WebClient`/`RestTemplate` in the backend. |
| Frontend | `src/pages/Reports/` has 6 pages / 3 890 lines — all listing, export and response-sheet screens. `reportApis.ts` has **no** formula, rule or template call. |

### The name `/api/reports` is already taken

`controller/reports/AssessmentReportController.java` owns `@RequestMapping("/api/reports")`
with 10 endpoints — `getOrganizations`, `getAssessments`, `getRespondents`,
`getRespondentDetail/{id}`, `export/assessment/{id}`,
`export/assessment/{id}/respondent/{id}`, `resetAssessment/{id}`, `liveTracking`,
`pendingSubmissions`, `requeueSubmission/{id}`. That is the **respondent-listing
and XLSX-export** surface, unrelated to this engine.

So the engine needs its own roots — `/api/report-rules`, `/api/report-snippets`,
`/api/report-templates`, `/api/report-batches` — and must not be nested under
`/api/reports`, where it would collide with `getById`-style paths.

### What *is* built and gets reused

| Asset | Reused for |
|---|---|
| `ExpressionService` (435 L) — lexer, parser, `validate()` returning structured English errors, never throwing | the rule grammar, and the AI retry signal |
| `ExpressionEvaluator` (287 L) — `IF AND OR NOT MIN MAX ABS SQRT LOG ROUND NORMBAND COUNTIF AVERAGEIF AVERAGE SUM COUNT PERCENTILE PERCENTRANK ZSCORE RANK` | rule evaluation, unchanged |
| `DataStudioDatasetService` — `dataset()`, `columnKeys()`, families `core: demo: ans: mqt: mqtt: mq:` | the column whitelist and the cohort load |
| `DsSheetService.compute()` | the evaluate-ordered-set loop (but **not** its null-fill-on-parse-error, see §3.4) |
| `MqtScoringService.planFor/score` | the scores every rule reads |
| `data-studio/lib/formula.ts` | as-you-type validation in the rules editor |
| `DataStudioAccess`, `RequestActor` | the `ReportAccess` guard |
| `SubmissionDigestService` | the durable-queue + sweeper + requeue pattern for batches |

---

## 1. What the brief asks for

1. A **separate page** where practitioners create **named rules**:
   name + MQ/MQT + MQ/MQT + scores, in some form of equation, producing
   **a term or a value**. Stored in the DB, used later.
2. An **HTML template** for the report containing `{tags}`.
3. The system **reads the template**, extracts its tags, and asks
   *"what is the value of this tag?"*
4. The practitioner answers with **a rule + a text prompt** explaining how that
   rule decides the tag's value/text.
5. **An AI reads rule + prompt and generates Java code** that produces the report.

Points 1–4 are a better authoring model than what the two existing docs describe,
and §3 below adopts them. Point 5 is the one thing this document argues against,
in §4 — and it argues against it because **the instinct behind it is correct**:
the current grammar genuinely cannot produce a paragraph of prose, and codegen is
a reasonable guess at the fix. §5 proposes the piece that actually fills that gap.

---

## 2. What the brief gets right that the existing docs get wrong

Three real improvements. Worth naming, because they are the reason this document
exists rather than a note appended to the other two.

### 2.1 Rules are first-class and reusable; "bindings" were not

The existing design buries formulas as `ReportFormulaBinding` rows *inside* a
per-assessment `ReportFormulaDefinition`. A binding has no independent identity,
no name a human uses, and cannot be reused. Every assessment re-derives
"Extraversion band" from scratch.

The brief's **named rule, stored and used later** is better, and the existing
architecture already proves it is possible without knowing it:

> "**Shared ruler, independent measurements.**  `MeasuredQuality` /
> `MeasuredQualityType` are global … the same `mqt:14` can appear in two
> assessments, meaning the same trait in both."
> — [report-engine-plan.md §2a](report-engine-plan.md)

So a rule written over `mqt:` keys **is portable across assessments** — valid for
any assessment whose placed questions score onto those MQTs. That makes a rule
*library* worth strictly more than per-assessment bindings, and it gives a genuinely
useful screen: *"this rule can run on these 7 assessments."*

### 2.2 Template-first is the right direction of authoring

Existing docs are **prompt-first**: write a prompt → LLM emits output keys → a
template may then only reference keys that already exist, enforced at save time
with a 409 ([§8.1](report-engine-plan.md)). The practitioner has to guess the
output keys before seeing the document.

The brief is **template-first**: the template is the deliverable the customer
signs off on; its tags are the *specification*; binding them is a checklist that
starts complete-and-unbound rather than empty. Same validation, inverted and far
more usable — instead of *"you named a key that does not exist"*, the screen says
*"9 of 14 tags bound, 5 to go."*

### 2.3 The brief asks for **text**, and the existing design only produces numbers

This is the important one. Verified in source today:

| | |
|---|---|
| `ExpressionService` type system | `NUMBER, STRING, BOOLEAN, UNKNOWN` |
| Where a STRING can come from | a string **literal**, `NORMBAND(...)`, or an `IF()` whose branches are strings |
| String operations available | **none** — no concatenation, no interpolation, no case, no join |

So the grammar can return `"High"`. It cannot return
*"Priya shows a marked preference for group settings, and is likely to seek out
collaborative work."* There is no expression in this grammar that writes a
sentence, and no amount of prompt engineering changes that.

**That gap is what makes codegen look necessary.** It isn't — see §5.

---

## 3. Proposed model

Four concepts. The first two are the brief's; the third is what §2.3 requires; the
fourth is what joins them to an actual respondent.

```
  Rule ──────┐
  (named,    ├──> TagBinding ──> Template ──┐
   versioned)│     (per tag)                 ├──> ReportDefinition ──> PDF
  SnippetSet ┘                    Assessment ┘      (assessment + template,
                                                     compiled, versioned, active)
```

### 3.1 `Rule` — the brief's rules page

A named, versioned, reusable computation over MQ/MQT/demographic/answer columns.

```
report_rule
  report_rule_id     bigint PK
  name               varchar(160) NOT NULL     -- 'Extraversion composite'
  slug               varchar(80)  NOT NULL     -- referenced as [rule:extraversion]
  description        text                      -- what it measures, for the library UI
  assessment_id      bigint NULL               -- NULL = portable library rule (§2.1)
  status             varchar(12) NOT NULL      -- DRAFT | PUBLISHED | ARCHIVED
  UNIQUE uqRrSlug (slug, assessment_id)

report_rule_version
  report_rule_version_id  bigint PK
  report_rule_id          bigint NOT NULL      -- FK fkRrvRule (containment)
  version                 int NOT NULL
  expr                    text NOT NULL        -- Data Studio grammar
  result_type             varchar(16) NOT NULL -- NUMBER | TERM
  format                  varchar(40)          -- 0dp | 1dp | 2dp | pct
  referenced_keys         text                 -- JSON, from validate().referencedColumns
  is_population           boolean NOT NULL     -- true if it uses ZSCORE/PERCENTILE/RANK
  source_prompt           text                 -- the practitioner's words, if AI-drafted
  model                   varchar(80)
  created_by_user_id, approved_by_user_id, approved_at, notes
  UNIQUE uqRrvRuleVersion (report_rule_id, version)
```

- **Versions are immutable and never deleted.** "Editing a rule" publishes v+1.
  That is what keeps a report issued last March explicable this September.
- **Rules may reference rules**: `[rule:extraversion]` inside another rule's expr,
  resolved by the compiler into the same topological DAG the existing plan
  already specifies ([§5](report-engine-plan.md)) — cycles and self-reference
  rejected, order **persisted** not re-derived.
- `is_population` is computed at save, not asked. It drives the `min_cohort_size`
  gate and tells the UI that this rule's value **moves as more people complete**.
- A rule's **portability** is derived, not stored: it can run on assessment A iff
  every key in `referenced_keys` is in `DataStudioDatasetService.columnKeys(A, org)`.
  Recomputed on demand — an assessment's columns change when questions are
  unplaced, so a cached answer would go stale silently.

**The rules page** = library list (name, what it reads, result type, where it can
run, version) + an editor with three input modes, all producing the same `expr`:

| Mode | For | Produces |
|---|---|---|
| **Pick** — choose MQ/MQTs from the taxonomy tree, choose an aggregation (sum / average / weighted) | the common 80 % | `ROUND(([mqt:14]+[mqt:15]+[mqt:16])/3*20, 1)` |
| **Formula** — type the expression, live-validated by the existing client mirror `data-studio/lib/formula.ts` | power users | itself |
| **Describe** — type plain English, AI drafts it (§5, A1) | first draft | a proposal to review |

All three land on the same reviewed, human-readable expression. **The AI is one
input mode on this page, not the page's foundation** — the feature works with the
LLM switched off entirely.

### 3.2 `SnippetSet` — how a rule becomes prose

The missing piece from §2.3. A rule yields a number or a term; a snippet set turns
that into the paragraph a report actually prints.

```
report_snippet_set                    report_snippet
  report_snippet_set_id  bigint PK      report_snippet_id      bigint PK
  name                   varchar(160)   report_snippet_set_id  bigint NOT NULL (containment)
  report_rule_id         bigint         band_label             varchar(80)   -- 'High'
  version                int            lower_bound            double NULL   -- inclusive, NULL = -inf
  status                 varchar(12)    upper_bound            double NULL   -- exclusive, NULL = +inf
  created/approved_by...                text                   text NOT NULL -- the paragraph
                                        sort_order             int
```

`(lower_bound, upper_bound]` cuts are stored as **rows, not as `NORMBAND`
arguments**, for three reasons that each cost real money if got wrong:

1. **`NORMBAND` inverts the natural phrasing.** The existing doc flags this as the
   single most likely AI error and notes *the validator cannot catch it* —
   arity passes, semantics invert
   ([§6.2](report-engine-plan.md)). Explicit bounds in rows are read by a human
   as a table and are impossible to invert silently.
2. Gaps and overlaps become **checkable**: publishing a snippet set validates that
   the bands are contiguous and cover the rule's full range.
3. The text belongs with the band it describes. Bands as function arguments and
   text somewhere else guarantees they drift apart.

Snippet sets are versioned and approved exactly like rules — the prose is
clinical output and gets the same treatment as the arithmetic.

### 3.3 `Template` + `TagBinding` — the brief's steps 2–4

```
report_template                        report_tag_binding
  report_template_id  bigint PK          report_tag_binding_id  bigint PK
  name                varchar(160)       report_template_id     bigint NOT NULL (containment)
  html                longtext           tag                    varchar(80) NOT NULL
  tags_json           text  -- parsed    binder_type            varchar(16) NOT NULL
  status  DRAFT|PUBLISHED                report_rule_id         bigint NULL
  created/updated_at                     report_rule_version_id bigint NULL  -- pinned, see below
                                         report_snippet_set_id  bigint NULL
                                         literal_text           text NULL
                                         format, fallback_text
                                         author_note            text  -- the brief's "text prompt"
                                         UNIQUE uqRtbTemplateTag (report_template_id, tag)
```

On save the template is parsed, `${tag}` occurrences extracted into `tags_json`,
and a binding row created for each **new** tag / removed for each vanished one.
That is literally the brief's *"system reads template and asks what would be the
values of these tags"* — it is a diff, and the UI is a checklist.

`binder_type` is the answer to *"what fills this tag?"*:

| `binder_type` | Fills the tag with | Needs |
|---|---|---|
| `VALUE` | the rule's number or term, formatted | rule |
| `NARRATIVE` | the snippet whose band contains the rule's value | rule + snippet set |
| `TABLE` | a row per MQT under an MQ: label, score, band | rule group |
| `CHART` | server-rendered **inline SVG** bar/gauge | rule + min/max |
| `LITERAL` | fixed text (headings, boilerplate, disclaimers) | nothing |
| `CORE` | respondent name, dob, org, assessment date, report date | nothing |

`CORE` exists so the obvious half of a report needs no rules at all, and `LITERAL`
so a tag can be answered *"nothing computes this, it just says this"* — without
either, every tag is forced through the formula machinery.

**Rule versions are pinned on the binding.** A template bound to
`extraversion v3` keeps rendering v3 when v4 is published; upgrading is an
explicit action showing a diff of what changes. Floating to "latest" would let a
rule edit silently alter every published template using it.

### 3.4 `ReportDefinition` — template + assessment, compiled

A template is not runnable on its own; a rule is portable but its columns are not.
The pairing is what compiles:

```
report_definition (assessment_id, report_template_id, version, status, cohort_scope,
                   min_cohort_size, approved_by, approved_at)   UNIQUE (assessment, template, version)
report_definition_active (assessment_id, report_template_id) PK → report_definition_id
```

The two-column PK on the pointer table is the same trick the existing design uses
for one-active-per-assessment — MySQL has no partial unique index
([§2.4](report-engine-plan.md)).

**Compiling a definition** checks, as hard errors, never null-fills:

1. every tag in the template has a binding;
2. every bound rule parses;
3. every rule's `referenced_keys` ⊆ `columnKeys(assessmentId, orgId)` — *this*
   assessment actually scores those MQTs;
4. the rule DAG is acyclic;
5. every `NARRATIVE` binding's snippet set covers the rule's observed range;
6. `is_population` anywhere ⇒ cohort ≥ `min_cohort_size`, else those tags emit
   `null` and the report prints a "norm group too small" block rather than a
   fabricated number.

Runs **at approval (blocking)** and **again at generation** — an assessment's
columns can change after approval, and failing the batch fast beats emitting 500
reports full of blanks. Both carried unchanged from
[§5](report-engine-plan.md).

---

## 4. Why the AI should not generate Java

The brief's step 5. Six reasons, in descending order of how hard they are to work
around. The first two are facts about this repo as it stands today.

1. **There is no sandbox left in Java 25.** The Security Manager — the mechanism
   every "run untrusted code in-process" design has ever relied on — was
   deprecated by JEP 411 and **permanently disabled by JEP 486 in Java 24**.
   `pom.xml` line 30 says `<java.version>25</java.version>`. Installing one throws.
   Sandboxing generated code therefore means a **separate OS process with
   container/seccomp isolation**: a new deployment component, new failure modes,
   new ops surface — for a feature whose point was to remove the developer.
2. **The runtime image cannot compile.** `spring-social/Dockerfile` line 16:
   `FROM eclipse-temurin:25-jre`. A JRE ships no `javac`. Runtime codegen means
   shipping a full JDK to production and giving the app the compiler API.
3. **A runaway generated method cannot be stopped.** `Thread.stop` is removed. An
   infinite loop or a runaway allocation in generated code takes down the app
   process, taking the portal and every respondent mid-assessment with it.
4. **The review step stops being a control.** The mandatory human review is what
   makes AI-authored psychometric scoring defensible at all. A psychometrician can
   read `ROUND(([mqt:14]+[mqt:15]+[mqt:16])/3*20, 1)` and say *"no, that should be
   weighted"*. Handed a Java class, they click Approve. The control survives in
   form and dies in substance — and it is the substance that would matter in front
   of a regulator or a court.
5. **There is no validator for generated Java.** The whole retry loop in the
   existing design works because `ExpressionService.validate()` returns structured
   English errors (*"Unknown column: mqt:99"*, *"IF() takes 3 arguments"*) that get
   fed straight back to the model. Java's compiler tells you it compiles. Code that
   compiles and computes the wrong band ships silently.
6. **Reproducibility gets harder, not easier.** Reports must be re-renderable years
   later. With expressions you store text. With codegen you must store generated
   source *and* a compiled artifact *and* a toolchain that can still run it.

**None of this is an argument against the AI doing the work.** It is an argument
about what the AI hands back. See §5.

### 4.1 The real gaps behind the codegen instinct, and their actual fixes

| Gap | Codegen answer | Proposed answer |
|---|---|---|
| The grammar cannot write prose (§2.3) | generate Java that builds strings | **snippet sets** (§3.2) — band → authored, reviewed, versioned, translatable paragraph |
| *"Which facet is this person's strongest?"* — `MAX([mqt:14],[mqt:15],[mqt:16])` returns the **value**, verified in `reduce()`; nothing returns **which one** | generate Java | **add whitelisted functions**, reviewed by us and covered by tests: `TOPKEY(n, ...)`, `ARGMAX`, `BANDOF` |
| Per-MQ tables, per-facet repetition | generate Java loops | `TABLE` binder + `[[#each]]` in the template grammar ([§8.3](report-engine-plan.md)) |
| Genuinely novel logic nobody anticipated | generate Java | **add a whitelisted function** — one reviewed Java method, shipped in a release, available to every rule forever |

The escape hatch is *"we write one more function"*, not *"the model writes code we
execute"*. That was already the design record's stated position
([§1.1](report-engine-plan.md)); this table is the concrete list of what would
actually need writing.

### 4.2 If Java is genuinely wanted anyway

There is a safe version, and it is worth naming so the choice is real:
**AI writes Java at design time, a developer reviews it, it is committed and
ships in a release.** No runtime compilation, no sandbox, full expressiveness,
fully auditable — it is ordinary AI-assisted development. The cost is exactly the
thing the feature set out to remove: **a developer and a deploy for every new
report type.** The trade is: reports data-driven and same-day, or code-driven and
next-release. §3 assumes the former.

---

## 5. Where the AI actually sits

Three assist points. All at **design time**, all producing **data a human
approves**, none at render time.

| | Input | Output | Reviewed as |
|---|---|---|---|
| **A1** | *"average the three Extraversion facets, scale to 100"* + that assessment's column schema | an `expr` in the existing grammar | one line of readable arithmetic |
| **A2** | a rule + the brief's **text prompt** (*"describe what a high scorer is like at work"*) + the trait's definition | **band cuts + a paragraph per band** — a draft `SnippetSet` | a table: band, range, text |
| **A3** | *"a two-page counselling report with a summary, a facet table and a recommendations section"* | a **starter HTML template** with `${tags}` already in it | the rendered template |

**A2 is the brief's step 5, landing as rows instead of a class.** The practitioner
does exactly what they described — points at a rule, types how it should read —
and gets back editable text next to the band that triggers it. Everything the
codegen route promised, minus the execution.

Carried unchanged from the existing docs, and non-negotiable:

- **Schema only leaves the building — never respondent rows.** Column keys, MQT
  paths, truncated question stems. Asserted by a test on the request body.
- **The LLM being down breaks only "draft me something".** Authoring, approving,
  and generating reports never call it — same degradation contract as
  `PortalRedisStore`.
- **Validate-and-retry, max 2 retries**, feeding `validate()` errors back verbatim;
  after that the draft is saved `PENDING` **with the errors attached**. Never
  discard the work.
- **No LLM at render time.** Per-respondent generated prose would be
  non-deterministic, unauditable, unreproducible, expensive at batch scale, and
  would ship individual psychometric results to a third party. If it is ever
  wanted, it is a separate, explicitly-consented feature — not a tag binder.

---

## 6. What this changes in the two existing docs

| Existing | Status |
|---|---|
| Expression grammar, no sandbox ([§1.1](report-engine-plan.md)) | **Kept** — reinforced by §4 |
| Compiler: topological sort, cycle rejection, hard errors, order persisted (§5) | **Kept**, now over rules not bindings |
| Cohort scope frozen on the definition; `min_cohort_size`; small-n z-score = 0 trap; population vs sample sd (§4) | **Kept verbatim** |
| `values_json` snapshot + `inputs_hash` drift detection (§3) | **Kept verbatim** |
| Batch: two phases, `generated_report` rows as the queue, bounded executor, storage dir + the commented-out compose volume (§9) | **Kept verbatim** |
| OpenHTMLtoPDF, CSS 2.1, inline SVG, S0 spike first (§8.4, S0) | **Kept** — S0 still gates everything |
| `ReportAccess` guard, separation of duties, error advice (R3) | **Kept** |
| `ReportFormulaBinding` inside a definition | **Superseded** by `Rule` + `RuleVersion` (§3.1) |
| Prompt-first authoring; template validated against existing keys (§8.1) | **Superseded** by template-first tag binding (§3.3) |
| Numbers-only output; prose only via `NORMBAND` labels | **Superseded** by `SnippetSet` (§3.2) |
| `V21__add_report_engine.sql` | **Wrong number** — V24 is taken (`add_respondent_phone_country_code`). Next is **V25**. |
| Provider "OpenAI via RestClient" (§1.2) | Already corrected to Claude Java SDK in the execution plan |

Everything in the execution plan's **R1–R15 risk list still applies** and should
be re-read before any of this is built — especially R1 (dual key-space), R2 (one
evaluator per batch, not per binding), R7 (template rendering is an SSRF hole) and
R10 (`requireActor()` returns ANONYMOUS on `@Async` threads).

---

## 7. Suggested build order

Reusing the execution plan's S-numbering where a step is unchanged.

| | Step | Ships | Why here |
|---|---|---|---|
| **S0** | PDF spike — OpenHTMLtoPDF on Java 25, Devanagari glyphs, one page | throwaway, uncommitted | Unvalidated assumption under the whole customer-visible half. One day, hour one. |
| **S1** | `RuleCompiler`, pure — parse, `[rule:]` resolution, topological sort, cycle/self-reference rejection, unknown-column rejection | plain JUnit, zero persistence | The compiler tells the schema what it needs. Writing DDL first gets it wrong. |
| **S2** | `V25` + rule/version entities + repos + `ReportAccess` + error advice | the irreversible step, isolated | **Verified 2026-09-01: safe.** The working tree points at `127.0.0.1:3310`, a local DB at v24 — not the 3307 staging tunnel (which *is* still listening, so the risk is real, just not currently armed). Re-check before writing the file: a `V<n>.sql` auto-applies via the IDE within seconds of being saved. |
| **S3** | **Rules page** — library, Pick/Formula editor, publish, portability list, cohort dry-run with min/max/mean/null-count/band distribution | **first shippable slice** | Delivers the brief's step 1 whole, with no template, no PDF, no AI. Already better than a Data Studio derived column, which is unversioned, unapproved, and silently null-fills on parse failure. |
| **S4** | Snippet sets — band rows, contiguity validation, versioning, preview against the dry-run | | Makes rules produce prose. Independent of templates. |
| **S5** | Templates + tag extraction + the binding checklist + single-respondent PDF preview | | The brief's steps 2–4, end to end. Still no batch, no storage. |
| **S6** | Batch — queue, bounded executor, storage dir, compose volume, requeue, `values_json` + `inputs_hash` | | Unchanged from the execution plan. |
| **S7** | AI **A1** (prompt → expr) + **A2** (rule + prompt → snippet draft) + PII test + retry loop | | Last, deliberately. Its prompts can only be tuned once a dry-run *and* a rendered report can be seen side by side. Nothing else depends on it. |
| **S8** | AI **A3** (template scaffolding), reviewer polish, retention/purge job | | |

**S3 is the honest MVP.** Named, versioned, approved, reusable rules with a
cohort-wide dry-run — no template, no PDF, no AI, no external dependency, no
recurring cost. If S3 is wrong, everything after it is wrong more expensively.

---

## 8. Open questions

1. **Rule scope.** Are rules global by default (portable across assessments, §2.1)
   or assessment-scoped by default with promotion to global? Global-by-default is
   the more useful library and the easier one to get wrong.
2. **Who approves?** The existing docs say the author cannot approve their own
   draft unless super-admin. With a two-person team that may be impractical —
   worth settling now, not after it is built. `app.reports.require-separate-approver`
   makes it a restart rather than a rewrite.
3. **Do snippets need per-organization overrides?** A client wanting their own
   wording for the same band is a predictable request. It is a nullable
   `organization_id` on `report_snippet_set` if decided now, and a migration and a
   resolution-order argument if decided later.
4. **Languages.** Snippet text is the natural translation unit — if multi-language
   reports are ever coming, `report_snippet` wants a `locale` column in `V25`, not
   in `V40`.
5. **Default `min_cohort_size`.** 30 is a convention, not a law.
6. **Retention.** How long do generated PDFs live? They are the most sensitive
   data in the product.
7. ~~Which DB is live on this branch?~~ **Answered** — see §0 and S2. Local 3310,
   at v24. Confirm again at S2 time; the 3307 staging tunnel is still up.
