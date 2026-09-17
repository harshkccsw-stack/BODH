# Report engine consolidation: four phases

> **Status: Phase A BUILT 2026-09-17** (see §2.6). Phases B, C and D remain
> proposals. Written to be chosen from, not followed blindly. Each phase ships
> alone and is useful alone; §6 says which can be skipped or reordered and
> what each decision costs.
>
> Origin: a read of every report-engine document in `docs/`, the practitioner
> workbook, and the full code path from `MqtScoringService` to the ZIP, plus a
> page-by-page map of the dashboard journey. The findings are summarised in §1
> so the phases can be argued against them rather than against memory.
>
> Migration numbers are written as **V32+** throughout. Numbers are assigned in
> ship order and never reserved; `V31` is the highest present today, and
> [question-scoring-flags-plan.md](question-scoring-flags-plan.md) also wants
> the next one.

## 0. The four phases at a glance

| | Phase | What it fixes | Schema | Size |
|---|---|---|---|---|
| **A** | Correctness and cost, no model change | guards the docs describe but the code lacks; the read path that evaluates the cohort; null comparisons; the missing preview | V32 additive | S–M |
| **B** | Setup as one flow; generation as its own page | the Template ↔ Computation circularity; nine screens and ten saves; two rule editors; no place to generate for one person | V33 additive + backfill | M |
| **C** | The pipeline as the unit | per-node pinning; the global slug namespace; INVALID as a string | V34, new tables, migration of existing rules | L |
| **D** | Psychometric inputs | live-cohort "norms"; no per-item data; no timestamps; nothing persisted | V35+, several additive | L |

Recommended order **A → B → C → D**. A and B pay for themselves in weeks; C
is the one that changes the schema's shape and should be argued about first;
D is the one the psychometricians will ask for and it lands cleanly on C.
§6 gives the alternatives.

---

## 1. What the phases answer

Verified against the code on 2026-09-17. Comments in this codebase assert
invariants confidently and some have drifted; every row below was checked
against the source, not the comment.

| Finding | Where | Phase |
|---|---|---|
| The minimum-cohort guard exists as one comment and nothing else; `ZSCORE` over a cohort of one returns exactly 0 and the band prints | `ReportRuleService` L618, `ExpressionEvaluator` L132 | A |
| Delivery ignores `respondentScope`; `SELECTED` is stored and every COMPLETED attempt still gets a report | `ReportDeliveryService.generate` | A |
| Approval records no approver and no time | `ReportComputation` has no such columns | A |
| Listing computations evaluates the whole cohort once per row; a GET builds the dataset twice; `columnKeys()` builds every row to return column names | `ReportComputationService.listAll` → `toResponse` → `directBlockers`; `ReportColumnCatalog` | A |
| A null operand compares as a string, so `'' <= '33'` is true; no type check on a rule edge, so a TERM feeding a numeric comparison is accepted | `ExpressionEvaluator.compare`; `ReportRuleService.buildVersion` | A (null), C (types) |
| The per-respondent preview endpoint is called by no page; the approval copy promises it | `reportComputationsApi.previewPdfUrl` unused | A |
| A VALUE binding on the template names a computation id that is checked at bind time and never read again; the template cannot be finished before the computation exists and the computation cannot be approved before the template is published | `ReportTemplateService.validateValueBinding`, `ReportValueResolver.computed`, `directBlockers` | B |
| Two rule editors write the same entity; the library one omits stage and step order; the setup one omits result type; the setup page has no menu entry | `report-rules.tsx`, `report-setup.tsx` | B |
| `organizationId` is in every request type and set by no page, so every cohort is org-unfiltered | all four report pages | B |
| The adoption panel shows verdicts and has no adopt button | `report-setup.tsx` L546–592 | B |
| Pinning is per node: A v2's edge to B is a slug, and B may be pinned at a version whose result type changed since A was validated | `ReportComputationRule`, `ReportRuleVersion.referencedRuleSlugsJson` | C |
| Rule names and slugs are unique across the installation; every workbook has a "3.1 Internal Drive"; the translation catalog already had to grow a this-assessment / other-assessments split because the model picked the wrong workbook's slug | `uqRrSlug`, `RuleTranslationService.catalogPrompt` | C |
| "INVALID: do not compute any scores" is an `IF` wrapper hand-written on every score rule; miss one and it prints | `ReportDirectDeliveryTest` L423 | C |
| Cohort-relative functions recompute over whoever is allotted at generation; a respondent's percentile changes as others finish; there is no frozen norm, no norm table, no strata | `ExpressionEvaluator.stats`, `ReportDryRunService.evaluate` | D |
| No numeric per-item column; straight-lining, item flags, prorating are unwritable; reverse scoring and composite exclusion are conventions in the option scores with no lint | `DataStudioDatasetService` ans: columns; `ReportItemBinding` flags unread | D |
| No sitting date, no duration; a retake destroys the previous answers; no issued-report record | `RespondentAssessmentMapping`; `resetAssessment`; no `generated_report` | D |

What is deliberately **not** changed by any phase: the Data Studio grammar
stays the formula language; rule versions stay immutable; the evaluator stays
one implementation used twice; column validation stays live per assessment;
the renderer stays network-denied; identity stays out of every model call.

---

## 2. Phase A: correctness and cost, no model change

> **BUILT 2026-09-17.** Everything in §2.1–§2.4 shipped as written, with the
> deviations recorded in §2.6. Backend suite green, frontend typecheck and
> build clean, `V32` applied to the local database on 3310 and the running
> app rebooted under `ddl-auto: validate`.

Everything here is a bug by the engine's own documentation, or a cost that
grows with the cohort. No entity changes meaning. One additive migration.

### A.1 Guards that were described and never built

- **Minimum cohort size.** `app.report.min-cohort-size`, default 30. At
  evaluation, a rule whose pinned version `isPopulation` runs over a cohort
  smaller than that yields **no value** for every row, and the outcome is
  reported as `TOO_SMALL` rather than `EVALUATED`. Approval treats `TOO_SMALL`
  like `ERROR`. The dry run shows it. Rules downstream of it inherit no value,
  which the existing failure propagation already does.
- **`ZSCORE` with `sd == 0`** returns no value, never 0. A NaN input with
  `sd == 0` currently returns 0; that branch goes.
- **Respondent scope is honoured.** `generate` filters recipients to
  `respondentIdsJson` when the scope is `SELECTED`. The cohort the rules run
  over stays the whole population, exactly as the dry run does; only who
  receives a PDF changes.
- **Approval provenance.** `V32`: `report_computation.approved_by_user_id`,
  `approved_at`, `approved_cohort_size`, all nullable, no backfill. Set in
  `approve`, cleared on `clone`. Printed in `values.json`.

### A.2 Null comparisons

`ExpressionEvaluator.compare` today falls back to lexical comparison when
either side is not a number. Change: when exactly one side is numeric and the
other is null or a non-numeric string, the comparison yields **no value**,
which `truthy` already treats as false. String against string stays lexical
(`[rule:flag] = 'INVALID'` must keep working). Number against number is
unchanged.

**This touches Data Studio too.** A sheet formula comparing a blank cell to a
number currently answers as if the blank were the empty string. After the
change it answers nothing. That is a correction, not a regression, but it is a
visible one and it is the first decision in §6.

### A.3 Take evaluation off the read path

- `listAll` stops computing blockers. The list shows status, mode, template
  and rule count; nothing on it needs the cohort.
- `get` computes blockers **without** the final cohort evaluation. A new
  `POST /api/report-computations/check/{id}` runs the full check and returns
  the blockers plus the dry-run summary; the page calls it after every bind
  and before approve. Approval still runs it internally.
- `DataStudioDatasetService.columns(assessmentId)`: the column list without
  building rows. `columnKeys` and `ReportColumnCatalog` use it. Validation on
  every keystroke stops loading every respondent.

### A.4 Wire what already exists

- **Per-respondent preview** on the computation page: a respondent picker
  over COMPLETED attempts and the existing `preview/{id}/{attemptId}.pdf`.
  Approval copy that promises a preview then tells the truth.
- **Adopt = copy**, as [report-rule-authoring-plan.md](report-rule-authoring-plan.md)
  §4 settled: `POST /api/report-rules/fork/{id}` with a target assessment,
  pulling the dependency closure, new slugs prefixed by the assessment. The
  panel gets its button. Or the panel is removed; §6.
- The empty-state "Create your first template" button opens the naming modal
  instead of posting an empty name.
- Remove the stale module doc in `reportComputationsApi.ts` that says there is
  no generate call.

### A.5 Tests and done-when

- A population rule over 3 respondents reports `TOO_SMALL` and blocks approval;
  over 30 it evaluates.
- `SELECTED` scope of two respondents out of ten yields a ZIP of two PDFs and a
  manifest naming ten in the cohort.
- `IF([mq:1] <= 33, 'Low', '')` on an unfinished attempt yields nothing, not
  `Low`; the Data Studio sheet test for blank cells is updated to the same.
- Listing five computations issues zero dataset loads (assert with a counting
  test double on the dataset service).
- `approve` writes approver and time; `clone` clears them.

Size: small to medium. No frontend restructuring.

### A.6 STATUS — built and verified 2026-09-17

| Shipped | Where |
|---|---|
| Minimum-cohort guard: `app.report.min-cohort-size` (default 30; tests run at 3), `TOO_SMALL` outcome, downstream rules blocked, approval and delivery refused | `ReportDryRunService`, `ReportDryRunResponse`, `application.yml` |
| `ZSCORE` with no spread yields no value | `ExpressionEvaluator` |
| Null or number-against-text comparisons yield no value; text against text stays lexical | `ExpressionEvaluator.compare` |
| Delivery honours a `SELECTED` scope; the cohort the rules run over is unchanged | `ReportDeliveryService.isRecipient` |
| `V32`: `approved_by_user_id`, `approved_at`, `approved_cohort_size`; set on approve, cleared on clone, printed in `values.json` | `db/migration/`, `ReportComputation`, `ReportComputationService.approve` |
| Reads carry only the cheap blockers; `POST /api/report-computations/check/{id}` runs the cohort; the list computes nothing per row | `ReportComputationService.check`, `ReportComputationController` |
| Columns-only dataset path; validation, portability and saves no longer load every respondent | `DataStudioDatasetService.columns`, `ReportColumnCatalog` |
| `GET /api/report-computations/recipients/{id}` and the per-respondent PDF preview, wired on the computation page | `ReportDeliveryService.recipients`, `report-computations.tsx` |
| Adopt = copy: `POST /api/report-rules/fork/{id}` copies the dependency closure with rewritten `[rule:…]` references, all or nothing; the panel has its button | `ReportRuleService.fork`, `report-setup.tsx` |
| The empty-state "Create your first template" opens the naming modal; the stale "no generate call" module doc is gone | `report-templates.tsx`, `reportComputationsApi.ts` |
| Tests: `ReportCohortGuardTest`, `ReportRuleForkTest`, `EvaluatorNullSemanticsTest`; `AcademicDriveBandsTest` now asserts the corrected comparison | `src/test/java/` |

Deviations from §2, each deliberate:

- **The check is the authority on the computation page.** Approve is disabled
  until a check has run clean since the last change; the cheap blockers are
  shown while it runs so the author is not looking at a blank. The preview
  button is gated the same way, because rendering a report with a failing rule
  would 409 anyway.
- **`AcademicDriveBandsTest.aSuppressedScoreWronglySatisfiesALessThanTest`
  was asserting the bug.** It documented that a blank score satisfies
  `<= 9` and recommended a range guard as the workaround. It now asserts the
  corrected behaviour; the range-guard test stays because it also documents
  the scale.
- **Data Studio blank-cell comparisons are corrected too** (§6 decision 1,
  taken as recommended). No sheet test depended on the old behaviour.
- **The fork prefixes slugs with `a<assessmentId>-` and names with
  `(A<assessmentId>)`.** Slugs and names are unique across the installation,
  and the prefix is what lets every workbook keep its own `internal-drive`
  until Phase C scopes slugs properly.
- **The "zero dataset loads on list" test is asserted by shape, not by a
  counting double**: the list's `directBlockers` is null, and the method that
  would have loaded the dataset is no longer called from the list path at all.

---

## 3. Phase B: one authoring flow, and generation as its own place

> **REVISED 2026-09-17** after discussion. Two pages under the Reports menu,
> not one: **Report Setup** (psychometrician, done once per assessment) and
> **Generate Reports** (operator, done repeatedly). The hover icon on the
> assessment library and the Computations page both go.
>
> **BUILT 2026-09-17, backend and pages.** §3.1 (V33, tag answers on the
> computation), §3.4 (every endpoint), §3.2 Report Setup at `/reports/setup`
> and `/reports/setup/:assessmentId?step=rules|layout|check`, §3.3 Generate
> Reports at `/reports/generate`, §3.5 menu, and §3.7 (backend and screen).
> The Computations page is parked in `bodh/deleted/`, the library's hover icon
> and old route redirect to Setup, the Templates page offers VALUE and
> NARRATIVE as shapes only (fallback text stays; the computation picker is
> gone), and the `bindTag` bridge is deleted. Not done from §3.2: the
> per-computation **organization scope** control on the Check step — the
> field exists on `forTemplate` but no screen sets it yet.
>
> **AMENDED 2026-09-17** after use: writing a template was still a forced
> switch — the Layout step could only pick from templates published
> elsewhere. The editor is now a shared component (`template-editor.tsx`)
> mounted by both the Templates page and Setup, so **New template**, *Finish
> a draft*, **Edit template** and publish all happen inside the flow, and
> publishing attaches the template to the assessment on close. Because
> `newVersion` writes a NEW template row, `forTemplate` now copies the
> placeholder answers from the newest live computation on an earlier version
> of the same template family (name-matched, tags the new version has, rule
> slugs this computation pins) — otherwise moving to v2 meant answering every
> placeholder again. The Layout step offers that move when a newer published
> version exists.

### 3.0 Why two pages and not one flow with a last step

Setting up and generating are done by different people at different times.
A setup is walked once and revisited when a norm changes; generation happens
every time a cohort finishes, for one person or for everybody, and must not
require walking the steps again. Putting Generate at the end of the setup rail
would make the operator open a psychometrician's screen to press one button.

### 3.1 The template declares shape; the computation supplies the value

Unchanged from the original Phase B, and still the prerequisite for a single
Layout step. The circularity today is in the data: a VALUE binding on the
template names a computation id, and the computation names the template.

- `ReportTagBinding` keeps CORE and LITERAL as answered-on-the-template. VALUE
  and NARRATIVE become **shapes** with `format` and `fallbackText` only.
  `COMPUTED` folds into VALUE. TABLE and CHART stay reserved.
- `report_computation_tag_guidance` becomes the **tag answer** table: `V33`
  adds `rule_slug`, `format`, `fallback_text`. A VALUE tag is answered by a
  rule slug pinned on that computation; a NARRATIVE tag by guidance.
- Backfill in the same migration from bindings with a `report_computation_id`;
  then null the two pointer columns on every binding; drop them later.
- `ReportValueResolver` reads answers from the computation. Approval requires
  an answer for every VALUE and NARRATIVE tag, and every slug pinned.
- Publishing a template needs no computation to exist, so one published
  template serves any number of assessments.

### 3.2 Report Setup: `/reports/setup` and `/reports/setup/:assessmentId`

A menu entry under Reports. Opens on an **assessment picker** that lists
every assessment **whatever its status** — an instrument is set up before it
is activated — with its questionnaire, status, and `completed / allotted`
counts so the author knows whether a dry run has anything to run on. The
library's hover icon becomes a plain link to the same URL, or goes.

The rail, top level:

| Step | Owns | Notes |
|---|---|---|
| **Assessment** | which instrument | picked; shown as the page title from then on |
| **Rules** | the existing six-step sub-rail: items, validity, reverse (info), scores, bands, profile, edge; import, translate, dry run | as today, moved under this parent |
| **Layout** | pick a published template; answer each VALUE tag with a pinned rule, each NARRATIVE tag with guidance | creates or updates the **one computation per (assessment, template)** on first save |
| **Check and approve** | the check, the distribution strip, preview one respondent, approve; clone-to-edit for an approved one | the only place approve lives |

Several templates per assessment means several computations; the Layout step
shows them as tabs. Approved ones are read-only with a "clone to edit".

The **Rules library page** keeps its editor but uses the same `RuleEditor`
component as Setup, so stage, step order and result type are present in both.
Its second job is browse and fork. The **Templates page** is HTML authoring
and CORE/LITERAL answers only; the VALUE picker that lists computations goes.

**Organization scope** is set once, on the Check step, from the assessment's
catalogued organizations, and stored on the computation. Default: chosen, not
"all" (§6 decision 3).

### 3.3 Generate Reports: `/reports/generate`

A menu entry under Reports. Three choices, top to bottom on one page:

1. **Assessment.** Every assessment that has at least one APPROVED
   computation, with the count. Others are listed greyed with "no approved
   report setup yet" and a link to Setup.
2. **Report.** The approved computations of that assessment: template name,
   version, approver, approval date, cohort size at approval.
3. **Who.**
   - **Everyone who completed** — the batch ZIP, as today.
   - **Selected respondents** — a searchable list of the cohort with status;
     tick any number; ZIP.
   - **One respondent** — pick one; the PDF opens inline and can be saved.

Below it, the last result: count, skipped, download link. A persisted history
arrives with Phase D's `generated_report`; until then the page shows only the
current session's runs and says so.

**The refinement to the original ask:** who receives a report is chosen **at
generation time**, not stored on the computation. The computation's
`respondentScope` / `respondentIdsJson` therefore stop being offered on any
screen (the columns stay; Phase A's delivery filter keeps honouring them for
rows that have one). A stored scope answers "who is this setup for", which is
never the question at generation; "who do I need today" is.

### 3.4 Backend deltas for the two pages

| Endpoint | For |
|---|---|
| `GET /api/report-computations/getByAssessment/{assessmentId}` | both pages; the Setup Layout tabs and the Generate report list |
| `POST /api/report-computations/forTemplate` `{assessmentId, reportTemplateId}` | find-or-create the one computation per pair; the Layout step's first save |
| `PUT /api/report-computations/answerTag/{id}/{tag}` | one tag answer (rule slug or guidance, format, fallback) — replaces binding VALUE through the template endpoint |
| `POST /api/report-computations/generate/{id}` with optional body `{attemptIds: [...]}` | batch, or a selection; ZIP either way; APPROVED required |
| `GET /api/report-computations/report/{id}/{attemptId}.pdf` | one respondent's final report, inline; APPROVED required (the existing `preview` stays for the Setup check step and does not require approval) |
| `GET /api/assessments/getAll` already exists | the pickers; the Setup picker must not filter on status |

`generate` with a selection evaluates the whole cohort exactly as today and
renders only the chosen attempts, so a percentile is the same number whoever
is on the list.

### 3.5 Menu after this phase

Reports → **Report Setup** · **Generate Reports** · Report Templates · Rules
Library. "Report Computations" leaves the menu; its page is retired once the
Setup and Generate pages cover every action it had (rename, clone, archive
move to the Check step; delete stays on the computation API).

### 3.6 Build order

1. Backend: `getByAssessment`, `forTemplate`, `generate` with `attemptIds`,
   the approved single-PDF endpoint. Small, testable alone.
2. `V33` and the tag-answer model (§3.1), with the backfill and the resolver
   change. The delivery test runs with no computation id on any binding.
3. Setup page: assessment picker, the Rules parent step wrapping today's
   rail, the Layout step, the Check step with preview and approve. Menu entry.
4. Generate page. Menu entry.
5. Retire the Computations page and the hover icon; Templates page loses the
   VALUE picker; Rules library uses the shared editor.

Done when the minimal happy path is **2 pages, 0 forced switches**: Setup
(import, translate, layout, check, approve) then Generate (pick, download).

Size: medium. Steps 1 and 2 are backend and ship first; 3 and 4 are the
larger half.

### 3.7 AI translation: edit, re-ask, try before accepting

> Asked 2026-09-17: "if it creates a rule, can we edit or re-evaluate its
> response?" All four additions BUILT 2026-09-17, backend and screen
> (`report-rule-translate.tsx`): editable proposals with the live validator
> and an insert menu, "Re-ask with a hint" per card (the batch's other drafts
> go as context), "Try on respondents" for the batch with each card showing its
> own summary and sample values, and per-rule Translate / Re-translate buttons
> on the Rules step. Accept writes the sheet text, the model and every hint
> into the version's notes. Before this the translate modal was one batch
> call, read-only proposals, a tick, and Accept.

What exists and is worth keeping: every proposal already passes the same
validator the save path uses; one automatic retry feeds the validator's
complaint back; the sheet text sits beside every proposal; the range lint
marks a threshold no respondent can reach; `confident: false` is a
first-class answer. The model's characteristic mistakes are known and named
in the code: a column reached for when a rule was meant, a band cut on the
wrong range, a cut written at the end of a band instead of its start.

Four additions, in the order they pay back.

**1. Proposals are editable, with the live validator.** The expression in
each card becomes the same editor the Rules step uses: debounced
validate-expression, the column and `[rule:]` insert rail, errors and range
warnings inline. Accept saves what is in the box, not what the model said.
One backend change: `validate-expression` gains `pendingExpressionSlugs`, so
a proposal that reads another proposal in the same batch validates while both
are still drafts. The service already takes the parameter; the controller
passes an empty set.

**2. Re-ask one rule, with a hint.** A "Re-translate" button on a card with
an optional line for the reviewer's own words: "the composite is
`[rule:ad-composite]`, not `[mq:7]`" or "use the band that starts at 34".
`POST /api/report-rules/ai/translate` gains `hints: {ruleId: text}` and a
`context: [{slug, expression}]` carrying the batch's current proposals, so a
single-rule re-ask still sees the vocabulary the workbook's rules depend on.
The prompt gets a section: previous attempt, why it was rejected (validator
or reviewer), and the instruction to change only what was named. The hint and
the model are written into the version's notes on accept, beside the sheet
text that is already kept there, so a formula's provenance reads: sheet said,
model proposed, reviewer said, model proposed again.

**3. Try it before accepting.** A "Try on respondents" button per proposal,
and one for the whole batch, evaluates the draft expressions over the real
cohort **without saving**, and shows the dry run's own summary: min, max,
mean, null count, band histogram, plus a handful of sample rows. This is the
answer to "re-evaluate its response": a band cut written backwards is
invisible in the formula and obvious in the histogram, and a wrong column
gives a range that does not match the sheet's stated 4–20. Backend:
`POST /api/report-rules/evaluate-draft` `{assessmentId, drafts:
[{slug, expression}]}`. `ReportDryRunService.evaluate` already takes rules
and versions as plain objects and reads only slug, expression, edges and the
population flag, so a draft is a transient rule and version built from the
parser's output; saved rules the drafts reference come in at their latest
version, drafts override by slug. When the workbook's Sample_Calculator has
been parsed (item-master plan §8), the same panel shows **expected versus
computed** for that respondent, which is the only check that says a formula
is right rather than merely runnable.

**4. Tell the model the shape.** The catalog the prompt sends lists columns
by key and label. `ReportShapeProbe` already knows each score column's item
count and maximum; the range lint uses it after the fact. Put it in the
catalog line — `[mq:7] Internal Drive (MQ total) number, 4 items, 4–20` — and
the cut-on-the-wrong-range mistake mostly stops being made instead of being
caught. Same for the item bindings once §6 of the item-master plan lands:
`[mqt:41] Validity › Infrequency — item V3`. Both are prompt text and cost
nothing at run time.

Not proposed: a second model call to "check" the first. A model grading its
own translation is not evidence; the evaluate-draft histogram and the
practitioner's worked answers are.

Where it lives: the Rules step of Setup. Each STATEMENT rule card gets
"Translate" for one rule; the batch button stays for a fresh import. A rule
that is already a formula gets "Re-translate from the sheet text", which
reads the last statement version the way the catalog already does, and
writes a new version on accept.

Backend, all small: the `pendingExpressionSlugs` pass-through, `hints` and
`context` on the translate request and prompt, `evaluate-draft`, and the
shape line in the catalog. Frontend: the card becomes an editor with three
buttons. Size: small to medium, and it can ship before the rest of Phase B
because it touches only the Rules step.

---

## 4. Phase C: the pipeline as the unit

This is the change to the rule and DAG model itself. It is the largest and
the one worth arguing about before anything is written.

### C.1 A scoring spec per assessment

```
report_scoring_spec
  report_scoring_spec_id   bigint PK
  assessment_id            bigint NULL        -- NULL = library spec, fork-only
  name, description, status ACTIVE|ARCHIVED

report_scoring_spec_version                    -- immutable
  report_scoring_spec_version_id  bigint PK
  report_scoring_spec_id          bigint FK
  version                         int
  created_by_user_id, created_at, notes
  UNIQUE (spec, version)

report_scoring_node                            -- one rule, inside one spec version
  report_scoring_node_id          bigint PK
  report_scoring_spec_version_id  bigint FK (containment)
  slug                            varchar(80)  -- UNIQUE per spec version
  name, stage, step_order
  kind                            EXPRESSION | STATEMENT | GATE
  expression, statement_text
  result_type                     NUMBER | TERM | TEXT | FLAG
  referenced_keys_json, referenced_slugs_json, is_population
  gates_json                      -- GATE only: which stages it suppresses
```

- A computation pins **one spec version** instead of N rule versions. Editing
  any node writes spec version N+1 with every node copied. Edges are slugs
  **inside the same version**, so an edge can never point at a node that has
  moved under it: per-edge pinning is a consequence of the shape, not a check.
- Slugs are unique **per spec**, so every workbook may have its
  `internal-drive`. The translation catalog's two-group split becomes
  unnecessary; only this spec's nodes are offered.
- The library is a spec with `assessment_id NULL`. Reuse is **fork into my
  spec**, which copies nodes and their closure. There is no cross-spec
  reference at all.
- **Typed edges.** Saving a node validates each `[rule:slug]` it reads against
  that node's `result_type` in the same version: a comparison or `NORMBAND`
  reading a TERM is refused with the two types named. FLAG is boolean.
- **Migration of what exists.** For each `assessment_id` that owns rules, a
  spec with version 1 built from each rule's **latest** version. For each
  APPROVED computation, an additional spec version built from its **pinned**
  versions, and the computation re-pointed at it, so every issued report stays
  explicable. Global rules become the library spec. `report_rule*` and
  `report_computation_rule` are left in place, read by nothing, and dropped in
  a later migration.

### C.2 Gates

A node of kind GATE is a validity rule whose FLAG result, when true, means the
protocol is invalid. `gates_json` names the stages it suppresses, default
every stage after VALIDITY. The evaluator, on a row where a gate fired, yields
no value for every suppressed node without evaluating it. Delivery then either
skips the respondent and lists them in the manifest with the gate's name, or
renders the template's **invalid-protocol variant** if one is set
(`report_template.invalid_html LONGTEXT NULL`, same tag rules, CORE and
LITERAL only). One declaration replaces the per-rule `IF` wrappers, and a
score cannot leak past a gate because nothing downstream ran.

### C.3 Tests and done-when

- The workbook's 1.1 rule as a GATE: the Sample_Calculator respondent with
  V3 = 2 has no factor, composite or band, and appears in the manifest as
  invalid; with V3 = 5 every value matches the worked answers.
- Two specs each with an `internal-drive` node coexist and translate without
  the catalog split.
- A node reading a TERM into `NORMBAND` is refused at save.
- An approved computation from before the migration produces byte-identical
  `values.json` after it.

Size: large. Two to three weeks of backend plus the setup page re-pointed at
nodes instead of rules. The lighter alternative is in §6.

---

## 5. Phase D: psychometric inputs

Each item here is independent of the others and can ship in any order.

### D.1 Norms as things, not functions

- `report_norm` (assessment or global, slug, name) and `report_norm_version`
  (immutable; `kind CUTS | SNAPSHOT | TABLE`; `payload_json`; `captured_at`;
  `n`; `source_note`; `strata_demo_field_id NULL`).
- Values are exposed to formulas through the **existing bracket mechanism**,
  no grammar change: `[norm:ad-pilot.mean]`, `[norm:ad-pilot.sd]`,
  `[norm:ad-pilot.p75]`. A z-score is
  `([rule:composite] - [norm:ad-pilot.mean]) / [norm:ad-pilot.sd]`. With
  strata, the key resolves per row through the respondent's demographic value.
- **SNAPSHOT** is captured from the setup page: "Capture norms for these rules
  from the current cohort" writes mean, sd, and the percentile table with the
  date and n. The minimum-n rule from Phase A applies at capture.
- **TABLE** is an uploaded sheet, parsed in the browser like the questions
  page, reviewed, then stored.
- **Cohort functions in delivery rules become opt-in.** `ZSCORE`, `PERCENTILE`,
  `PERCENTRANK`, `RANK`, `AVERAGE`, `COUNT` are refused in a spec node unless
  the node is marked `live_cohort = true`, which the page explains as "this
  value changes as more people complete". The dry run keeps them for
  exploration.
- Percentile-rank convention is stated and chosen once: recommend
  `(below + 0.5 × equal) / n`, and sample SD for snapshots.

### D.2 Items as numbers, and the two flags

- An `item:<code>` numeric namespace in the dataset, derived from
  `ReportItemBinding` plus the selected option's position for single-choice
  MCQ and LINEAR_SCALE. Multi-select and grid items expose no item column and
  the catalog says why. Straight-lining, item flags and prorating become
  ordinary expressions.
- `Question.reverseScored` and `Question.inComposite`, applied inside
  `MqtScoringService`, exactly as
  [question-scoring-flags-plan.md](question-scoring-flags-plan.md) specifies.
  That document's §12 decisions are the ones to take.
- The item-binding lints from [item-master-binding-plan.md](item-master-binding-plan.md)
  §7, rewritten per the flags plan §10: the sheet's claim against the bank's
  flag, blocking on disagreement.

### D.3 Time and history

- `respondent_assessment_mapping.started_at`, `completed_at`, nullable, no
  backfill. Written by the portal on start and submit. Exposes
  `core:completedAt` and `core:durationSeconds`, which unblocks the workbook's
  0.2 and 1.3.
- Retake history is out of scope for this plan; it is a change to the
  delivery chain, not the engine.

### D.4 Record what was issued

- `generated_report`: computation, attempt, spec version, template id,
  `values_json`, `pdf_path`, `generated_at`, `generated_by_user_id`. Written
  by `generate`. Requires the `app-uploads` volume to be uncommented first;
  until then this item waits.
- `generate` moves to a bounded executor and returns a batch id; the page
  polls. The ZIP becomes a download of stored files rather than an in-request
  build.

Size: large in total, small per item. D.1 and D.2 are the ones the
psychometricians will notice.

---

## 6. Decisions needed, and the alternatives

1. **Phase A null semantics change Data Studio's blank-cell comparisons.**
   Accept the correction, or confine the new rule to the report evaluator by
   passing a mode flag. Recommend accepting; two behaviours for one grammar is
   the failure §3.3 of the direct-mode plan warns about.
2. **Adopt panel: wire it as fork, or remove it.** Recommend fork; it is one
   endpoint and the panel already computes everything it needs.
3. **Organization scoping default in B.2.** "All organizations catalogued for
   this assessment" or "one, chosen". Recommend chosen, because the cohort is
   also the norm group until D lands.
4. **Phase C full, or C-lite.** C-lite keeps the rule tables and does two
   things: `uqRrSlug` becomes unique per `assessment_id`, and each rule version
   stores the result type of every dependency at validation time, which
   approval re-checks against the pinned versions. It closes the namespace and
   the per-edge hole for a few days' work, and it does **not** give gates,
   whole-pipeline versioning, or fork-only reuse. Recommend full C, after B,
   because B's tag answers name a slug and full C makes that slug unambiguous.
5. **Gate behaviour for an invalid protocol.** Skip and list, or render an
   invalid variant. Recommend skip-and-list first; the variant is one column
   and a template later.
6. **Order of D.** If the psychometricians need frozen norms before anything
   else, D.1 can follow A directly; it depends on nothing in B or C beyond the
   bracket-key mechanism that already exists.
7. **The percentile-rank and SD conventions in D.1.** These are the
   psychometricians' call and should be asked now, since a snapshot captured
   under one convention is not comparable to one captured under another.

## 7. What stays open after all four

- Multi-informant reports: a subject entity and rater roles on the mapping.
- Retake history: per-attempt rows, which `resetAssessment` currently
  precludes.
- TABLE and CHART binders and template iteration.
- The GENERATED mode and the Python sandbox, which only STATEMENT rules need
  and which nothing above depends on.
