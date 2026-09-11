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

### Decisions settled 2026-09-01

| Question | Decision |
|---|---|
| **When does the AI run?** | **Once per assessment, at design time.** The stored rule then runs against every respondent of that assessment. **No AI call at render time.** |
| **Who reviews the rule/expression/code?** | **Nobody.** The artifact is stored unread. |
| **What is reviewed instead?** | **Rendered reports.** Generate against selected respondents, read the PDFs, approve (§5.3). |
| **What does the AI hand back?** | **Rules + snippet rows, not Java.** With human review gone, `validate()` is the only remaining check — see §4.1, which is the argument for this and the only one still standing. |
| **May raw data be sent?** | **At design time, yes** — a capped sample, identity columns stripped (§5.2). **At render time, nothing is sent.** |
| **Multi-informant reports?** | **Out of scope, explicitly.** One report = one respondent's answers (§0.1). |
| **Report sign-off?** | **Two levels.** Approve the definition after reading samples (§5.3), *and* per-report `reviewStatus` Draft/Approved/Finalized. |
| **Rule scope?** | **Global by default** — a rule runs on any assessment scoring its MQTs (§2.1, §3.1). |
| **UI home?** | **Under the existing Reports menu**, not a new top-level group. |

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

### 0.1 Three prototype report pages already say what reports must contain

`src/pages/Reports/` holds `clinical.tsx` (374 L), `counselling.tsx` (451 L) and
`industrial.tsx` (441 L). **None of them calls spring-social** — no `/api/` string
in any of the three; they go through `lib/data-store` → `lib/api`, and
`counselling.tsx` still carries one hardcoded seed array. They are prototypes.

They are also **the best requirements document we have**, because someone drew
what the business actually wants a report to say:

| Page | Its report carries |
|---|---|
| `clinical` | `diagnosticCodes[]`, `riskFlag` + `riskNote`, `status: Draft \| Approved \| Finalized`, `format: PDF \| Interactive` |
| `counselling` | `ageBand: 6-9 \| 10-13 \| 14-18`, **`informants: Self \| Parent \| Teacher`**, `score`, `severity` |
| `industrial` | `roleFitScore`, `competencies[] {name, score}` |

**What this confirms:** three genuinely different report shapes over the same
instrument library. A report definition is therefore keyed by
**(assessment × template)**, not per assessment — as §3.4 has it. Worth stating
because the settled decision was phrased "once per assessment".

**What it exposes that this design does not cover:**

1. **Multi-informant reports — DECIDED: out of scope.** `counselling` shows one
   report drawing on Self, Parent *and* Teacher. Every table in the data model
   keys on a single `respondentUserId`: `AssessmentAnswer`,
   `DemographicResponse`, `RespondentAssessmentMapping`. Nothing links several
   respondents as raters of one subject, and adding it needs a **subject** entity
   plus a rater-role on the mapping — a change to *existing* tables, which is the
   one thing both earlier docs avoided entirely.

   **One report draws on exactly one respondent's answers.** Everything in this
   document assumes it: the cohort is a set of respondents, a dataset row is one
   respondent, `values_json` is one respondent's snapshot. If multi-rater is ever
   wanted it is a genuinely new feature that reworks the dataset layer first —
   **not** a template option, and not reachable by any rule the grammar can
   express. `counselling.tsx`'s `informants` field is a prototype's aspiration and
   is not being built.
2. **Per-report approval — DECIDED: build both levels.** `status: Draft |
   Approved | Finalized` sits on an individual report in the prototypes; this
   design also approves the *definition* after reading samples (§5.3). Both ship:
   a **`reviewStatus`** on `generated_report` (`DRAFT | APPROVED | FINALIZED`)
   alongside definition approval. It is in `V27` from the start rather than
   retrofitted, and it means a batch can complete without its reports being
   considered delivered — which is the useful distinction.
3. **`format: PDF | Interactive`.** Since the template *is* HTML, serving it as a
   page costs almost nothing beyond the PDF path. Cheap, and only cheap if the
   renderer is not built PDF-only.

**What happens to the three pages** is an open question (§8). They are the
old dialect and unwired; replacing them with one builder-driven page is the
obvious move, but they encode business knowledge that should be read first.

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
  assessment_id      bigint NULL               -- DEFAULT NULL = global, portable (§2.1)
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
- **Rules are global by default** (`assessment_id` NULL). A rule is written once
  and runs on every assessment that scores its MQTs. Scoping one to a single
  assessment is available but deliberately the exception — the default is what
  makes this a library rather than a per-assessment formula list under a new name.
  Consequence to design for: **a published rule is shared**, so publishing v2
  affects every template that has not pinned v1. Version pinning on the binding
  (§3.3) is what makes global-by-default safe, not optional.
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
| **Describe** — type plain English, AI drafts it (§5, A1) | first draft | a stored expression, editable, read by nobody |

All three land on the same stored expression, and the gate on all three is §5.3 —
reading the reports, not the expression. **The AI is one input mode on this page,
not the page's foundation** — Pick and Formula work with the LLM switched off
entirely, which is what keeps the feature alive on a bad API day.

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
  locale     varchar(16) NULL           text                   text NOT NULL -- the paragraph
  organization_id bigint NULL           sort_order             int
  created/approved_by...

-- locale and organization_id ship in V25 but nothing reads them yet (§8):
-- per-client wording and translation are both predictable, snippet text is the
-- natural translation unit, and two nullable columns now beat a migration plus a
-- resolution-order argument later. NULL/NULL is the default set.
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

Snippet sets are versioned and frozen exactly like rules, and go live the same
way: as part of an approved `report_definition` whose sample reports were read
(§5.3). The prose is clinical output and gets the same treatment as the
arithmetic — which here means the same gate, not a second one.

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

## 4. What the AI hands back — and why it is still not code

**Settled: nobody reads the artifact.** The practitioner does not review an
expression, a rule table, or a Java class. They review **rendered reports** (§5.3).

That deletes one of this section's original arguments outright — *"a
psychometrician can read `ROUND((...)/3*20, 1)` and object"* is no longer a
benefit anyone is buying. It is withdrawn. The remaining reasons are untouched,
and removing the human **strengthens** the first one rather than weakening it.

### 4.1 With review gone, the validator is the only check left

This is the reason that grew when human review was dropped, and it is now the
whole argument.

`ExpressionService.validate()` returns **structured English errors** and never
throws — `"Unknown column: mqt:99"`, `"IF() takes 3 arguments"`. If the model
invents a column, mis-arities a function, or references a rule that does not
exist, the artifact **fails to save** and the error text goes straight back to
the model for a retry. Wrong output is caught by a machine, before anything
renders.

Generated Java has no equivalent. `javac` confirms it compiles. Code that
compiles and puts every respondent in the top band is indistinguishable, to the
machine, from correct code.

So the two designs differ in what happens on the model's bad day:

| | AI emits an expression | AI emits Java |
|---|---|---|
| References a column this assessment doesn't score | **Save rejected**, error fed back, retried | Compiles. Renders `null` or `0.0` for everyone. |
| Gets a band cut backwards | Renders — caught by the distribution (§5.3) | Renders — caught by the distribution (§5.3) |
| Writes a loop that never ends | **Not expressible** — grammar has no loops | Takes down the app process |
| Reaches for the filesystem or network | **Not expressible** — no syntax for it | Runs |

**When a human is reviewing, both columns are survivable. When nobody is
reviewing, only the left one is.** Dropping review is a good decision, and it is
precisely the decision that makes the machine-checkable artifact necessary rather
than merely nice.

### 4.2 Two facts about production that no review policy changes

1. **The runtime image cannot compile.** `spring-social/Dockerfile:16` is
   `FROM eclipse-temurin:25-jre`. A JRE ships no `javac`. Runtime codegen means
   shipping a full JDK to production.
2. **There is no sandbox left in Java 25.** The Security Manager was deprecated by
   JEP 411 and **permanently disabled by JEP 486 in Java 24**; `pom.xml:30` says
   `<java.version>25</java.version>`. Isolating generated code therefore needs a
   **separate OS process with container/seccomp limits** — a new deployment
   component, new ops surface. And `Thread.stop` is gone, so a runaway generated
   method cannot be killed from inside; it takes the portal down with it, mid-
   assessment, for every respondent then answering.

Reproducibility is the third: an expression is text you store. Java is source
**plus** a compiled artifact **plus** a toolchain that still runs in 2031, when
someone asks why a report said what it said.

### 4.3 The honest cost of this choice

The grammar cannot do everything, and pretending otherwise is how this decision
goes wrong later. Verified gaps and their fixes:

| Gap | Fix |
|---|---|
| Cannot write prose — type system is `NUMBER, STRING, BOOLEAN` with **no concatenation and no string functions**; a STRING can only come from a literal, `NORMBAND()`, or an `IF()` | **Snippet sets** (§3.2) — band → authored paragraph |
| *"Which facet is strongest?"* — `MAX([mqt:14],[mqt:15])` returns the **value**, verified in `reduce()`; nothing returns **which one** | **Add whitelisted functions**: `TOPKEY(n, ...)`, `ARGMAX`, `BANDOF` |
| Per-MQ tables, per-facet repetition | `TABLE` binder + `[[#each]]` in the template grammar |
| Genuinely novel logic | **Add one whitelisted Java function**, tested, shipped in a release, available to every rule forever |

Each of these is *one Java method we write and test once* — not a hole through
which the model's output is executed. The first time a real report needs
something the grammar cannot express, that is the escape hatch, and it costs a
release rather than an architecture.

---

## 5. The settled pipeline

**Once per assessment, at design time.** Then the same stored rule runs against
every respondent of that assessment, forever, with no AI in the loop.

```
DESIGN TIME  — once per assessment × template
  template tags + your prompt per tag + a sample of that assessment's rows
        │
        ▼  AI  (A1 expression, A2 band cuts + paragraphs, A3 template scaffold)
  rules + snippet sets   ── stored, unread by anyone ──┐
        │                                              │
        ▼  validate() ── errors? ── retry ×2 ── still failing? flag it, keep the work
        │
        ▼  compile: DAG, columns exist, bands contiguous, tags all bound
        │
        ▼  generate reports against SELECTED respondents  ──► you read the PDFs
        │
        ▼  Approve  ──►  report_definition vN, immutable, active

RENDER TIME — every respondent of that assessment, forever
  stored rules ──► evaluate over the cohort ──► values_json ──► template ──► PDF
  no AI call · no network · same input, same output, every time
```

### 5.1 Where the AI is used

| | Input | Output |
|---|---|---|
| **A1** | *"average the three Extraversion facets, scale to 100"* + the assessment's column schema | a rule `expr` |
| **A2** | a rule + your **text prompt** (*"describe what a high scorer is like at work"*) + a sample of that assessment's score rows | **band cuts + a paragraph per band** — a `SnippetSet` |
| **A3** | *"a two-page counselling report with a summary, a facet table and recommendations"* | a starter HTML template with `${tags}` in it |

A2 is the brief's step 5. You point at a rule, type how it should read, and the
system produces the thing that fills the tag — landing as rows rather than a
class, for the reasons in §4.

### 5.2 What may be sent, now that raw data is in play

The earlier docs' invariant was **"schema only, never rows"**. Generating good
band cuts genuinely needs to see the score distribution, so that softens — but in
one specific, bounded way:

- **Design time may send a sample of rows.** Scores, demographic values,
  aggregate stats. Capped at N rows (suggest 200), **stripped of `core:` identity
  columns** — no name, no email, no dob, no employee id. The model needs the
  *shape* of the distribution to pick cuts; it never needs to know whose it is.
- **Render time sends nothing.** There is no AI call when a report is generated.
  This is the invariant that actually matters, and the settled design keeps it
  absolutely.
- Assert both with tests: a request-body test for the identity columns, and a
  test that the whole render path makes zero outbound calls.

### 5.3 The approval gate

**Settled: generate reports against selected data, then check them by hand.** The
approve screen does exactly that — pick respondents, generate, read the PDFs,
approve or reject. Two additions that cost nothing and are worth having on the
same screen:

- **The system suggests who to select.** You still pick, but it offers the
  revealing ones: highest, lowest, most nulls, and one case either side of each
  band cut. A hand-picked few from the middle of the range all look fine even when
  a rule is badly wrong at the edges.
- **Per-tag summary next to the sample.** min / max / mean, **null count**, and
  **band histogram** over the whole cohort. This is the one check reading
  individual reports cannot perform: `risk_flag — High 100%` is visible instantly
  here and invisible in any single PDF. It is the same dry-run the earlier docs
  specified, presented as a sanity strip above the reports rather than as the
  review itself.

Approving freezes a `report_definition` version. Rules referenced by it are
**pinned by version**, so publishing a new rule version never silently changes a
report that was already approved — upgrading is an explicit action that shows
what changes.

**Nothing here blocks the practitioner.** They select, they read, they approve.
The distribution strip is information on the same screen, not a second gate.

---

### 5.4 Re-attempts, and what "regenerate" means

Verified in source 2026-09-02, and it changes how important the snapshot is.

**A re-attempt does not add an attempt — it erases the previous one.**
`AssessmentReportService.resetAssessment()` hard-deletes both sets of rows:

```java
answers.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
demographicResponses.deleteByRespondent_IdAndAssessment_AssessmentId(respondentUserId, assessmentId);
```

`RespondentAssessmentMapping` carries `uqRamRespondentAssessment` on
(respondent, assessment) with **no `attemptNumber`**, and its own javadoc says
*"there are no re-attempts"*. Nothing is archived. After a reset, the previous
sitting's answers do not exist anywhere in the database.

*(`CLAUDE.md` still describes "one row per ATTEMPT: unique respondent + assessment
+ attemptNumber". That is stale and should be corrected in the same pass — both
earlier docs flag it too.)*

**Three operations get called "regenerate", and they are not the same:**

| | Works? | How |
|---|---|---|
| **Re-render an existing report** | **Yes** | From `values_json` — same numbers on a corrected template. Never from live data, or fixing a template typo would silently move the numbers. |
| **Generate a fresh report from the new attempt** | **Yes** | New answers → same approved rules → a new `generated_report` row. Both reports coexist, so before/after is comparable. |
| **Re-derive the earlier report from its original answers** | **No** | Those answers were deleted by the reset. Nothing can rebuild them. |

**Consequence: `values_json` is not hygiene, it is the only surviving record.**
Without it, granting a re-attempt would destroy the evidence behind a report
already handed to someone — a document asserting "84th percentile" with nothing
in the system able to show where that came from. Snapshotting stops being a
reproducibility nicety and becomes the audit trail.

`inputs_hash` earns its place here too: after a reset the recomputed hash stops
matching the stored one, so an old report can be **flagged** as built on data that
no longer exists — without ever quietly rewriting a delivered document.

**Operational rule that follows: generate the report before granting a
re-attempt.** If no report was generated and the attempt is reset, that sitting
simply never happened. This needs a guard on the existing reset endpoint — see P6.

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

## 7. Phases

Nine phases. **P3 and P5 are independently shippable** — work can stop after
either and leave the product better than it found it. Everything before P7 works
with the LLM switched off, which is deliberate: the external dependency is the
last thing added, not the foundation.

**Migrations are split three ways, not bundled into one `V25`.** An applied
migration can never be edited (Flyway checksums it; a changed file fails every
later boot) and MySQL cannot roll back DDL. So each migration is written in the
phase that already knows its table's final shape — `V25` when rules are built,
not when they are imagined.

| | Phase | Schema | Shippable |
|---|---|---|---|
| **P0** | PDF spike — throwaway | — | no (uncommitted) |
| **P1** | `RuleCompiler`, pure | — | no |
| **P2** | Rules + snippets schema | **V25** | no |
| **P3** | Rules page | — | **yes** |
| **P4** | Snippet sets | — | yes |
| **P5** | Templates, render, approval gate | **V26** | **yes** |
| **P6** | Batch | **V27** | yes |
| **P7** | AI — A1 + A2 | — | yes |
| **P8** | A3, interactive HTML, retention | — | yes |

---

### P0 — PDF spike *(throwaway, do not commit)*

The whole customer-visible half of this feature rests on an unvalidated
assumption. One day, in hour one, not in week five.

**Prove, inside `eclipse-temurin:25-jre`:** OpenHTMLtoPDF runs on Java 25 ·
**Devanagari glyphs render as glyphs, not boxes** (respondent names are Indian —
this is the single most likely spike failure and it is a font-embedding problem,
not a library one) · inline SVG bar and gauge · a CSS 2.1 two-column layout with
page breaks (**no flexbox, no grid, no JavaScript**) · an `Organization.logoBase64`
data URL embedded in the header, since reports will want the same co-branding the
portal already has.

**Done when:** a PDF generated inside the runtime image opens with correct
Devanagari, a visible SVG bar and the org logo. **If fonts fail, P5 changes
shape** — that is what this phase is buying.

### P1 — `RuleCompiler`, pure

New package `service/report/`. No persistence, no HTTP, no frontend — the
compiler tells the schema what it needs, so writing DDL first gets it wrong.

Wraps the existing `ExpressionService.parse/validate`. Resolves `[rule:slug]`
references between rules, builds the DAG, **topologically sorts, and rejects
cycles, self-reference, forward references and unknown columns as hard errors**.

The one behaviour it must *not* inherit: `DsSheetService.compute()` catches a
parse failure, null-fills the column and continues. For a spreadsheet a blank
cell is acceptable; **for a report a null score is a wrong report.** Compilation
fails loudly instead.

**Done when:** `./mvnw -B test` green, with a test per rejection — cycle,
self-reference, forward reference, unknown column, and a valid DAG whose
persisted order is asserted.

### P2 — `V25`: rules + snippets schema

`report_rule`, `report_rule_version`, `report_snippet_set`, `report_snippet`
(§3.1, §3.2) + entities + repositories + `ReportAccess` (modelled on
`DataStudioAccess`; `requireActor()` rejects anonymous regardless of
`app.security.require-auth`) + **`ReportExceptionHandler`**, without which every
error path in P3 is a 500 and P3 cannot be verified.

**Two gates before the file is saved:**

- **Confirm which DB is live.** A `V<n>.sql` auto-applies via the IDE within
  seconds of being written. Verified 2026-09-01 as local `3310` at v24 — but the
  `3307` staging tunnel is still listening, so re-check, not re-assume.
- **Include `locale` and a nullable `organization_id` on `report_snippet_set`
  even though nothing reads them yet.** Per-client wording and translation are
  both predictable requests, snippet text is the natural translation unit, and
  two nullable columns cost nothing now versus a migration plus a
  resolution-order argument later.

`report_rule.assessment_id` defaults NULL — **global** (§3.1). Multi-informant is
out of scope (§0.1), so every table here keys on a single respondent, and that
assumption is safe to build on rather than something to leave room for.

**Done when:** the app boots with `ddl-auto: validate` against the migrated DB,
and `./mvnw -B test` is green. Note the suite proves nothing about the migration
itself — `src/test/resources/application.yml` sets `flyway.enabled: false` with
`ddl-auto: create-drop`, so **tests never execute a migration.** Only a live boot
does.

### P3 — Rules page  ← first shippable slice

**Backend** `/api/report-rules` — `getAll`, `getById`, `create`, `update`,
`publish` (freezes an immutable version), `columns/getByAssessment/{id}` (the
whitelist, from `DataStudioDatasetService.columnKeys`), `portability/{ruleId}`
(which assessments this rule can run on, computed live — an assessment's columns
change when questions are unplaced, so a cached answer goes stale silently),
`dry-run` (evaluate over the real cohort).

`validate-expr` returns **HTTP 200 with `errors[]`, never an error status** —
mirroring Data Studio, because a half-typed formula is a normal state.

**Frontend** `pages/Reports/rules.tsx` + `rulesApi.ts`, routed under `/reports/rules`
and added to the **existing Reports aside-menu group** (alongside Reports Hub,
All Reports, Response Sheets) — not a new top-level group. Repo page pattern: breadcrumb + primary action, stat cards,
search/filter row, divide-y list, create/edit modal, delete-confirm with inline
error. Three input modes (§3.1) — **Pick** (MQ/MQT tree + aggregation), **Formula**
(live client validation via the existing `data-studio/lib/formula.ts` mirror), and
Describe (stubbed until P7).

The **dry-run panel** is the payload: min / max / mean, **null count**, **band
histogram** over the whole cohort.

**Done when:** `npm run typecheck && npm run build`; a real rule published and
dry-run against a real assessment; live curl proving 400 / 404 / 409, not just
the happy path; `__smoke__` data deleted afterwards.

**Why this ships on its own:** it delivers the brief's step 1 whole — named,
versioned, immutable, reusable scoring rules with a cohort-wide sanity check —
with no template, no PDF, no AI, no external dependency and no recurring cost.
Strictly better than a Data Studio derived column, which is unversioned, silently
null-fills on parse failure, and permits forward references that evaluate to null
forever.

### P4 — Snippet sets

Band rows with explicit `(lower, upper]` bounds and a paragraph each. Publishing
**validates contiguity and full coverage** and names the gap when it finds one —
this is what makes bands-as-rows better than `NORMBAND` arguments, whose
inversion no validator can catch.

Preview runs against P3's dry-run so the author sees **how many real respondents
land in each paragraph** before anything is approved.

**Done when:** a set with a gap or an overlap is rejected with the range named;
preview shows live counts per band.

### P5 — `V26`: templates, tag binding, render, approval gate  ← second shippable slice

`report_template`, `report_tag_binding`, `report_definition`,
`report_definition_active` (§3.3, §3.4).

- **Tag extraction on save** → diff against existing bindings → add new tags,
  drop vanished ones. This *is* the brief's "system reads template and asks what
  fills these tags", and it is a checklist, not a form.
- **Renderer:** closed `${key | fmt}` substitution + `[[#if]]`, `[[#each]]`,
  `[[#bar]]`, `[[#gauge]]`. HTML-escaped by default. **Its own allowlist** —
  `RichTextHtml` is a 12-tag, **zero-attribute** rejector; a report needs
  `<table>`, `<div>`, `class`, `style`, `<svg>`. It must not be extended, it must
  be sidestepped.
- **SSRF, which neither earlier doc covers in its template section:** the HTML is
  user-authored and rendered **server-side**. OpenHTMLtoPDF will happily fetch
  `<img src="http://169.254.169.254/...">` from inside the network. Deny external
  resource loading at the renderer, not by validating the HTML.
- **Approval gate (§5.3):** pick respondents → generate → read the PDFs → approve.
  Suggested picks (highest, lowest, most nulls, either side of each band cut) and
  the per-tag summary strip sit on the same screen. Approving freezes a
  definition version and pins every rule version it uses.

**Done when:** a single respondent's PDF renders and its numbers match the P3
dry-run exactly; a template naming an unbound tag cannot be published; approving
moves the active pointer.

### P6 — `V27`: batch

`report_batch`, `generated_report` (`values_json`, `inputs_hash`, **and
`reviewStatus`** — `DRAFT | APPROVED | FINALIZED`, decided in §0.1). The rows
**are** the queue and the progress UI at once (`COUNT(*) GROUP BY status`).

Two independent status columns, and keeping them apart is the point:
`status` is machine progress (`PENDING → READY_TO_RENDER → READY | FAILED`);
`reviewStatus` is a human's sign-off on the delivered document. A batch finishing
does **not** mean its reports are delivered — a practitioner still marks each one
Approved or Finalized. Download and any respondent-facing delivery gate on
`reviewStatus`, never on `status`.

Two phases with deliberately different failure granularity: **scoring** is one
dataset load, one compile, all rules over the whole population — a failure fails
the whole batch atomically, because a broken definition must not quietly emit 500
blank reports. **Rendering** is per respondent and independent — a failure fails
exactly one row, visibly, with a requeue.

Three operational items, each of which silently breaks this phase if missed:

- **Uncomment `app-uploads` in `docker-compose.yml:97-98`.** It is commented out
  today and `uploads/` is empty, so **every generated PDF vanishes on redeploy.**
- **A bounded executor.** There is no custom `TaskExecutor` bean; `@Async` runs on
  Boot's default pool, where a 500-report render batch would starve
  `SubmissionDigestService` and delay respondent submissions.
- **Capture the actor before dispatch.** `requireActor()` returns ANONYMOUS on
  `@Async`/`@Scheduled` threads — the request context does not cross.

**Guard the existing reset endpoint (§5.4).** `resetAssessment` hard-deletes a
respondent's answers, so it must warn when reports exist — *"this permanently
deletes the answers; N generated reports keep their saved values but can never be
re-derived"* — and when none exists — *"no report has been generated for this
attempt yet."* A change to `AssessmentReportController`, not a new feature, but it
is the point at which report data becomes unrecoverable.

Only **COMPLETED** attempts are eligible, enforced at batch creation:
`DataStudioDatasetService` leaves score columns NULL for anything else, so every
rule would evaluate to null.

**Done when:** a 100-report batch completes; a deliberately broken template fails
exactly one report and the batch finishes; requeue clears it; PDFs survive a
container restart.

### P7 — AI: A1 (prompt → rule) and A2 (rule + prompt → snippets)

Claude Java SDK. `app.llm.*` with the key **from the environment, never
`application.yml`**. Connect 5 s, read 60 s. This is the backend's **first
outbound HTTP call ever** — timeouts, retries and degradation are new work, not
configuration.

- **Schema serialization into budget:** always send every `core:`/`demo:`/`mq:`/
  `mqt:`/`mqtt:` column (bounded by the taxonomy, tens not hundreds), labelled by
  `MqtRef.path` because **MQT names are deliberately not unique**; send `ans:` as
  compact `key⇥label⇥type` lines with stems truncated, capped, and **state in the
  prompt that the list was truncated** so the model reports an unresolved item
  instead of inventing a key.
- **Sample rows (§5.2):** capped, `core:` identity columns stripped.
- **Validate-and-retry ×2**, feeding `validate()` errors back verbatim. After
  that the draft is saved **with the errors attached** — never discard the work.
- **Degrade like `PortalRedisStore`:** the LLM being down breaks only "draft me
  something". Authoring, approving and generating never call it.

**Two tests that are the point of the phase:** the request body contains no
identity columns; and the whole render path makes **zero** outbound calls.

**Done when:** a real prompt on a real assessment yields a rule that compiles and
a snippet set that publishes, with no hand editing.

### P8 — A3, interactive HTML, retention

Template scaffolding from a description; serving the rendered template as an
interactive HTML page (nearly free — the template already *is* HTML, and the
prototypes ask for `format: PDF | Interactive`); a purge job mirroring
`ActivityLogPurge`; retiring or rewiring the three prototype pages.

---

## 8. Open questions

Ordered by the phase that forces the answer. The first three are cheap now and
expensive later, because each one shapes a migration that cannot be edited once
applied.

### Before P3

1. **Endpoint roots — confirm.** `/api/reports` is taken by
   `AssessmentReportController` (§0). Proposed: `/api/report-rules`,
   `/api/report-snippets`, `/api/report-templates`, `/api/report-definitions`,
   `/api/report-batches`. Nesting under `/api/reports` would collide with its
   existing `getById`-style paths.

### Before P5

2. **What happens to `clinical.tsx` / `counselling.tsx` / `industrial.tsx`?**
   Unwired old-dialect prototypes, but they encode real business knowledge
   (§0.1). Replace with one builder-driven page, or keep as fixed templates?
3. **Who may approve a `report_definition`?** The earlier docs enforced
   separation of duties on a *formula* review that no longer exists. What is
   approved now is *"I read these sample reports and they are right"* — a
   judgement about clinical output, arguably the psychometrician's alone rather
   than a two-person control. Keep `app.reports.require-separate-approver`
   (default `true`) so this is a restart not a rewrite, but the default is worth
   arguing about.

### Before P6

4. **Retention.** How long do generated PDFs live? They are the most sensitive
   data in the product.
5. **Default `min_cohort_size`.** 30 is a convention, not a law. Below it,
    population-function outputs emit `null` and the report prints "norm group too
    small" rather than a fabricated number — because with one completed
    respondent `sd == 0` and **every z-score comes back exactly 0**,
    indistinguishable from perfectly average.

### Settled

- **Multi-informant: OUT.** One report draws on exactly one respondent's answers
  (§0.1). Not a template option, not reachable by any rule — a future feature that
  reworks the dataset layer first.
- **Report sign-off: BOTH levels.** Definition approval after reading samples
  (§5.3), plus `reviewStatus` on `generated_report`, in `V27` from the start (P6).
- **Rule scope: GLOBAL by default** (`assessment_id` NULL). Version pinning on
  bindings is what makes that safe (§3.1).
- **UI home: under the existing Reports menu**, at `/reports/rules` etc. — not a
  new top-level group (P3).
- **Snippet `locale` + nullable `organization_id` ship in `V25` unread**, because
  two nullable columns now beat a migration and a resolution-order argument later.
- ~~Which DB is live on this branch?~~ Local `3310`, at v24 (§0). Re-confirm at
  P2; the `3307` staging tunnel is still listening.
- ~~Population vs sample sd?~~ The evaluator uses **population** sd (÷ n).
  Document it; do not change it — that would move every Data Studio number
  already on screen. If sample sd is wanted, it is a new whitelisted function
  (`ZSCORE_S`), not an edit to `ZSCORE`.

---

## Appendix A — Sandboxed scorer container, and generated Java inside it

Raised 2026-09-02: *use Kimi for codegen and run it in a separate container on
DigitalOcean.* This is the isolation option §4 pointed at, designed out properly.
**It contains two independent decisions that should not be bundled:**

| | Decision | Depends on the other? |
|---|---|---|
| **A** | Which model writes the artifact (Kimi / Claude / anything) | No |
| **B** | Whether scoring runs in a separate container | No |

B is good engineering **whether or not** the artifact is Java (§A.5). A is a
config line if the client is built provider-agnostic (§A.6).

### A.1 The container design

The isolation that matters is not "a different machine". It is: **no credentials
present, no route out, a hard memory ceiling, and a killable process.** All four
are reachable in the existing `docker-compose.yml` without a second droplet.

```
api (droplet, JRE)                         scorer (same droplet, JDK)
  loads cohort ─────► POST /score ────────►  compile (cached by source hash)
  has DB creds        {source, rows, stats}  fork child JVM, -Xmx256m, wall clock
  has Redis                                  run compute() per row
                    ◄──── {values[]} ──────  kill child, return
```

The scorer **never receives DB credentials and has no DataSource.** Even if
generated code breaks out of every other control, there is nothing to steal and
nowhere to send it. That property is worth more than any of the flags below.

### A.2 Concrete `docker-compose.yml` changes

The current file has one network, `bodhpsychometric` (bridge), and services
`mysql`, `redis`, `api`. Add a second network and one service:

```yaml
networks:
  bodhpsychometric:
    driver: bridge
  scorer-net:
    driver: bridge
    internal: true        # ← the egress jail, in one line

services:
  api:
    networks: [bodhpsychometric, scorer-net]   # api joins BOTH

  scorer:
    image: bodhpsychometric-scorer:latest
    restart: unless-stopped
    networks: [scorer-net]        # ← ONLY this. Cannot reach mysql, redis,
                                  #   or the internet — not even by raw IP.
    user: "1000:1000"             # non-root
    read_only: true               # immutable filesystem
    tmpfs: [/tmp:size=64m]        # the one writable spot, in RAM, capped
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    pids_limit: 128               # fork bombs die here
    mem_limit: 512m
    cpus: 1.0
    environment:
      JAVA_TOOL_OPTIONS: "-Xmx256m -XX:ActiveProcessorCount=1"
```

`internal: true` is the important line — a Docker network with no gateway. The
scorer is not on `bodhpsychometric` at all, so MySQL and Redis are unreachable
even if the generated code knows their addresses.

**Same droplet, second container — not a second droplet.** A separate droplet
adds private networking, a second machine to patch and pay for, and buys only
protection against a host-level kernel exploit, which is not the realistic
failure. Everything that actually goes wrong — hang, OOM, runaway allocation — is
already contained by `mem_limit` + `pids_limit` + the child-process kill.

**Do not mount the Docker socket** to spawn per-job containers. That is
root-equivalent on the host and is a far bigger hole than the one being closed.
A long-lived container that forks a killable child JVM per job gives the same
clean slate with none of that.

### A.3 The contract

Fixed interface; the model fills in one method:

```java
public interface Scorer {
    Map<String, Object> compute(Map<String, Object> row, CohortStats stats);
}
```

`row` is the prepared dataset row; `stats` holds precomputed cohort figures
(mean, sd, sorted values per column). **The generated code never queries
anything** — it cannot, and it does not need to.

`POST /score {sourceHash, source, rows[], stats}` → `{values[]}`. The scorer
ships a **JDK** and compiles on first sight of a hash, caching the result; the
`api` image stays a JRE, so the compiler's blast radius is inside the jail.

Timeouts on both sides: an HTTP read timeout on the app, a wall-clock kill on the
child inside the container. A dropped connection fails the batch — which is
correct, because scoring failure is a definition-level problem and must fail the
whole batch atomically (§P6), never emit partial reports.

### A.4 What this fixes, and the one thing it does not

**Fixes, completely:** a hang, a crash, an OOM or a fork bomb takes down a child
process instead of the portal · credential theft (nothing to steal) ·
exfiltration (no route out) · the JDK-in-production objection (§4.2) · and, as a
bonus, scoring CPU load stops competing with respondents' submissions.

**Does not fix — and this was the strongest objection in §4.1:** **wrong
numbers.** A container is a blast radius control. It does nothing about Java that
compiles cleanly and puts every respondent in the top band. With expressions,
`validate()` catches an unknown column before anything renders; with Java, the
only detector is a human reading a report — and per the settled review model
(§5.3) that human reads *a few* reports, not all of them.

So the honest scorecard: the container answers **every** safety objection and
**none** of the correctness ones.

**Also new, and permanent:** a second image to build, patch and monitor, and a
lockstep deploy — a scorer built against an old `Scorer` interface breaks every
batch, silently, until someone runs one.

### A.5 Why to build the boundary anyway

Independent of Java, the scoring phase is the one operation that loads an entire
cohort and evaluates every rule over it. Today that would run on the same JVM and
default thread pool as `SubmissionDigestService`, where a 500-report batch starves
respondent submissions (§P6 already flags this).

**Recommended sequencing: build the boundary in P6, ship expressions through it
first.** The `POST /score` contract is identical either way — rows and stats in,
values out. Then adding generated Java later is a change *inside* the jail, not
an architectural change, and it can be A/B'd against the expression path on the
same cohort with the same inputs. That is the cheapest way to find out whether
Java actually buys anything, which is still the unanswered question (§4.3).

### A.6 On Kimi specifically

- **Build the client provider-agnostic.** Kimi's API is OpenAI-compatible, so one
  `RestClient` against a configurable `base-url` + `model` covers Kimi, and a
  small adapter covers Claude. Make it `app.llm.provider` and swap by config.
  Then A/B them on real prompts and let the outputs decide, rather than deciding
  now.
- **Cost is not the deciding factor here, and it is worth being clear why.** This
  is *design-time* generation — once per assessment × template. That is dozens of
  calls a month, not millions. A model that is ten times cheaper saves a
  rounding error; a model that writes a subtly wrong band boundary ships that
  error to **every respondent of that assessment until someone notices.**
  Optimize for output quality, not token price.
- **Data residency is a real question, not a political one.** §5.2 permits sending
  *sample score rows* at design time. Identity columns are stripped, but the
  scores themselves are psychometric data about identifiable-in-principle people,
  and this product handles assessments of schoolchildren and employees. Moonshot
  is a Chinese company with both a `.cn` and an international endpoint —
  establish which endpoint, which jurisdiction, and what the retention and
  training terms are **before** the first sample row is sent. If that cannot be
  settled, the fallback is schema-only prompting (the earlier docs' original
  invariant), which costs some band-cut quality and nothing else.
- **Self-hosting is theoretically open but not practical here.** Kimi K2 is
  open-weights, which would settle residency completely, but it is a very large
  MoE model; a DO GPU droplet capable of serving it costs far more per month than
  dozens of API calls. Not worth it at this volume. Revisit only if generation
  volume grows by orders of magnitude.

### A.7 Cost

**1–2 weeks** on top of the existing plan: the scorer image, the HTTP protocol,
compile-and-cache, child-process supervision, compose wiring, and the deploy
pipeline for a second image. Plus a permanent second thing to patch.

Roughly **no extra DigitalOcean spend** if it shares the existing droplet and that
droplet has ~512 MB of headroom; one more droplet (~$12–24/mo) only if it does not.

---

## Appendix B — Generated calculation code (the chosen path)

Decided 2026-09-02, after four rounds. **The AI generates real code, once per
assessment × template, stored in the DB and re-run for every respondent with no
further AI calls.** The reasoning that settled it: report logic is not just
arithmetic and precedence — selecting *which* trait to describe, deciding *how
confidently* to word it, and combining several aspects into one judgement are
things a formula language cannot reach, and that is precisely why a model is
being used at all.

This appendix is the design. §4's objections are not re-litigated; §B.6 records
the one operational consequence that must be built rather than argued about.

### B.1 Language: Python, not Java

| | Python | Java |
|---|---|---|
| LLM output quality for data/scoring logic | **substantially better** — it is the language this kind of code is overwhelmingly written in | more verbose, more boilerplate to get wrong |
| Compile step | **none** — store the `.py`, run it | `javac`, a JDK image, a classloader per version |
| Statistics available | `statistics`, and `numpy`/`scipy` if ever wanted | hand-rolled |
| Runs in the Appendix A container | yes, `python:3.12-slim` | yes, but with the compile step inside |
| Same language as the backend | no | yes |

**Recommendation: Python.** The only argument for Java is language uniformity, and
that argument is weak here because the code does not live in the backend — it
lives in an isolated container behind an HTTP boundary (§A). Dropping the compile
step removes an entire failure class, and generation quality is the thing that
most affects whether reports come out right.

**Not shell.** Worth recording since it was raised as the safer fallback: a shell
script has full OS access by default, no types, no structure, and can invoke any
binary present. It is strictly worse than Java on every axis that matters here.

### B.2 The contract

The model fills in one function. Everything it needs is passed in; it never
queries, never opens a file, never reaches the network.

```python
def compute(r, cohort, catalog):
    """
    r       — this respondent
      r.scores    {'mqt:14': 4.2, 'mqt:15': 3.8, 'mq:3': 3.9}   trait scores
      r.demo      {'age': 34, 'gender': 'FEMALE', 'education': 'PG'}
      r.answers   {'q:101': {'option': 'B', 'text': 'Often'}}
      r.meta      {'completion': 0.95, 'answered': 57, 'total': 60,
                   'duration_sec': 1840, 'status': 'COMPLETED'}
      r.item_count('mqt:14')   → how many questions fed that score

    cohort  — everyone else who completed this assessment
      cohort.n
      cohort.mean(key) / .sd(key) / .median(key)
      cohort.percentile_of(value, key)
      cohort.zscore(value, key)

    catalog — the taxonomy and the rules page's own tables
      catalog.label('mqt:14')      → 'Big Five › Extraversion › Sociability'
      catalog.children('mq:3')     → ['mqt:14','mqt:15','mqt:16']
      catalog.snippet(set, value)  → the band paragraph the psychometrician wrote

    returns — {tag: value} matching the template's ${tags}
    """
```

`catalog.snippet()` is the important one: **generated code reuses the band tables
authored on the rules page** instead of hardcoding prose. The psychometrician
still owns the words; the code owns the decision about which words apply.

### B.3 Worked examples — the logic a formula cannot express

**1. Validity gate that overrides everything.**

```python
if r.meta['completion'] < 0.80:
    return {'report_status': 'INVALID',
            'reason': f"Only {r.meta['answered']} of {r.meta['total']} items answered.",
            'summary': catalog.snippet('invalid_notice', None)}
```

A report built on 40 % of the items is worse than no report. This is an early
return — a formula language has no concept of "stop, emit nothing else".

**2. Their three strongest traits, excluding unreliable ones, tie-broken.**

```python
facets = {k: v for k, v in r.scores.items() if k.startswith('mqt:')}

# a facet measured by fewer than 3 items is not stable enough to name
reliable = {k: v for k, v in facets.items() if r.item_count(k) >= 3}

# rank by score; break ties by how far the person is from the group average,
# because the more distinctive facet is the more informative one to report
ranked = sorted(reliable.items(),
                key=lambda kv: (-kv[1], -abs(kv[1] - cohort.mean(kv[0]))))

out = {}
for i, (key, val) in enumerate(ranked[:3], start=1):
    out[f'strength{i}_name'] = catalog.label(key).split('›')[-1].strip()
    out[f'strength{i}_score'] = round(val, 1)
    out[f'strength{i}_text']  = catalog.snippet(f'facet_{key}', val)
```

Selection, filtering, ranking and tie-breaking across a variable set of columns.
No expression grammar reaches this.

**3. Profile from a combination, not a threshold.**

```python
ext = r.scores['mq:3']; con = r.scores['mq:4']; neu = r.scores['mq:5']

if   ext > 70 and con > 70:            profile = 'DRIVER'
elif ext > 70 and neu > 60:            profile = 'VOLATILE_SOCIAL'
elif ext < 30 and con > 70:            profile = 'METHODICAL_SOLO'
elif ext < 30 and neu > 60:            profile = 'WITHDRAWN_ANXIOUS'
else:                                  profile = 'BALANCED'

# and the interaction is worth more than either trait alone
if profile == 'VOLATILE_SOCIAL' and r.demo['age'] < 25:
    profile = 'VOLATILE_SOCIAL_EARLY_CAREER'

out['profile'] = profile
out['profile_text'] = catalog.snippet('profiles', profile)
```

**4. Wording that hedges according to how confident the number is.**

This is the "multiple aspects" case, and the clearest argument for code:

```python
parts = [catalog.snippet('extraversion', ext)]

# close to average → say so, rather than over-claiming
if abs(ext - cohort.mean('mq:3')) < 0.5 * cohort.sd('mq:3'):
    parts.append("This score sits close to the group average, so the "
                 "description above should be read as a mild tendency "
                 "rather than a defining trait.")

# small norm group → the comparison is weak
if cohort.n < 30:
    parts.append(f"Comparisons are based on only {cohort.n} respondents "
                 "and should be treated as provisional.")

# young self-report → less stable
if r.demo['age'] < 12:
    parts.append("Self-reported results at this age are less stable over "
                 "time and are best reviewed alongside other information.")

# rushed → flag it
if r.meta['duration_sec'] < 0.4 * cohort.median('duration_sec'):
    parts.append("This assessment was completed considerably faster than "
                 "typical, which may affect reliability.")

out['extraversion_paragraph'] = ' '.join(parts)
```

Four independent aspects — distinctiveness, norm size, age, response time — each
adding a clause. Expressing this as bands would need one band per combination:
2⁴ = 16 rows for four flags, and 2⁸ = 256 for eight.

**5. Norm lookup by age band × gender.**

```python
band = '6-9' if r.demo['age'] < 10 else '10-13' if r.demo['age'] < 14 else '14-18'
norm = NORMS[band][r.demo['gender']]
out['ext_z'] = round((ext - norm['mean']) / norm['sd'], 2)
```

Published external norms, which the live-cohort functions cannot represent at all.

### B.4 Storage

```
report_program
  report_program_id   bigint PK
  assessment_id       bigint NOT NULL
  report_template_id  bigint NOT NULL
  version             int    NOT NULL
  language            varchar(16) NOT NULL   -- 'python'
  runtime_version     varchar(16) NOT NULL   -- '3.12' — pinned, see below
  source              longtext NOT NULL      -- the generated function
  source_hash         char(64) NOT NULL      -- SHA-256, the container's cache key
  source_prompt       text                   -- rules + prose it was generated from
  model               varchar(80)            -- which model, which version
  harness_version     varchar(16) NOT NULL
  status              varchar(12) NOT NULL   -- DRAFT | ACTIVE | SUPERSEDED
  generated_by_user_id, generated_at, approved_by_user_id, approved_at
  UNIQUE uqRpAssessmentTemplateVersion (assessment_id, report_template_id, version)
```

Immutable once approved; a change is a new version. **Pin `runtime_version` and
`harness_version`** — a report regenerated in 2031 must run on the interpreter it
was written for, or the numbers can move underneath a document already delivered.

### B.5 Execution

Behind the Appendix A boundary, so nothing about that changes:

```
api (JRE, has DB creds)          scorer (python:3.12-slim, no creds, no egress)
  load whole cohort  ──► POST /score ──►  write source to tmpfs, import once
                         {source_hash,     for each row: compute(r, cohort, catalog)
                          source,          per-row try/except → that row fails alone
                          rows[], stats}   whole-batch wall clock → kill
                     ◄── {values[]} ◄───
```

- **One process per batch**, looping rows — not one process per respondent.
- **Per-row `try/except`**: a crash on one respondent fails that report only, and
  the batch continues. Matches §P6's render-phase granularity.
- `network_mode` internal, `read_only`, `mem_limit`, `pids_limit`, non-root —
  §A.2 unchanged. Python needs no compile step, so the container ships no toolchain.

### B.6 The one thing this design must add

Generated code gets no automatic correctness signal — nothing plays the role
`validate()` played for expressions. **The approval gate therefore has to do more
work than "read a few PDFs".** Build it as:

1. **Run the generated code over the entire cohort at approval time**, not just
   the selected respondents. It is one pass and it is cheap.
2. **Summarize every returned tag**: min / max / mean, **null and error count**,
   and for text tags the **distribution of distinct values**. `profile — DRIVER
   100%` or `extraversion_paragraph — 3 distinct values across 214 people` is
   visible instantly and invisible in any five PDFs.
3. **Report per-row exceptions as a first-class number.** "17 of 214 respondents
   errored" must be on the approval screen, not in a log.
4. Then the sample PDFs, as decided in §5.3.

This is not a second gate — it is one screen, and it is what makes "we check the
report manually" hold up at 500 respondents rather than 5.

### B.7 What still holds from the rest of this document

The rules page (§3.1) and snippet sets (§3.2) **are not replaced** — they become
the *structured input* to generation. The psychometrician builds what is
naturally a table, describes the rest in prose, and the model compiles both into
one `compute()`. `catalog.snippet()` is the seam: authored words stay authored.

Unchanged and still required: cohort loading and `min_cohort_size` (§4 of the
design record), `values_json` snapshotting and `inputs_hash` drift detection
(§3 there), the two-phase batch (§P6), template tag binding (§3.3), per-report
`reviewStatus`, and the render path making **zero** outbound AI calls.
