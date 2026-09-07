# Per-assessment rule authoring — the "Report setup" flow

> **Status: BUILT 2026-09-07** — see §9 for what shipped and what it found.
> Written as a proposal, discussed, then implemented in the same session.
> Extends [report-engine-build-plan.md](report-engine-build-plan.md) — it does
> not supersede it. Everything here sits inside **P2**, which is already built:
> the rules library, the computation draft and the prompt assembler all exist
> and shipped in `V27`. This document adds the *authoring surface* over them and
> the *testing strategy* that works before P3/P4 land.
>
> Origin: a psychometrician's scoring workbook (Items_Master / Scoring_Logic /
> Sample_Calculator) supplied 2026-09-07. Its Scoring_Logic tab is a six-step
> pipeline, each step consuming the previous step's output. That workbook is
> both the requirements document for this screen and the test fixture for §5.

## 0. Decisions taken

| Question | Decision |
|---|---|
| Wizard or page? | **A resumable per-assessment setup page**, not a one-shot wizard. A scoring spec is a living document — the workbook itself says the Step 4 bands get replaced with percentile norms after 150–200 pilot responses. You must be able to land on step 4 directly. |
| Step chaining | **A machine-checked DAG.** `[rule:slug]` becomes a first-class expression term; the parser emits dependency edges; cycles, forward references and dangling slugs are rejected at save. |
| Validity items | **(a) Give each validity item its own MQT under a `Validity` MQ.** Zero code. See §3.1. |
| Reverse scoring | **Not a report rule.** Authored upstream. A `Question.reverseScored` flag is coming later; until then, reversed option scores. See §3.2. |
| Norm / lookup tables | **No table is built.** Norms are supplied by the psychometrician and no canonical norm table exists; the two forms they actually take are already expressible. See §7. |

## 1. The reframe

The workbook describes a per-assessment pipeline of rules. That is exactly
`report_computation`: one assessment x one template, pinning the exact rule
*versions* it uses, plus respondent scope and a guidance prompt. `V27` already
models it.

So this screen creates **no new concepts**. It is a guided front door that:

1. writes `report_rule` rows tagged with which step they belong to, and
2. keeps exactly one `report_computation` draft per (assessment, template).

[report-computations.tsx](../bodhassess-app/src/pages/Reports/report-computations.tsx)
stays as the power-user view over the same row — the place you inspect the
assembled meta-prompt. [report-rules.tsx](../bodhassess-app/src/pages/Reports/report-rules.tsx)
stays as the global library browser. Neither is replaced.

**Entry point:** an action on each row of
[assessment-library.tsx](../bodhassess-app/src/pages/assessments/assessment-library.tsx),
beside the pencil and the bin, routing to
`/assessment-library/assessments/:id/report-setup`. Label it **"Report setup"**,
not "Add rule" — the page is re-entered far more often than it is created, and
"add rule" describes one button on one of its six steps.

## 2. The six steps, mapped

| Workbook step | Where it lives | Status |
|---|---|---|
| **0. Data capture** | Already the platform. `AssessmentAnswer` per attempt; "all 15 answered" is the COMPLETED filter the dataset already applies. | Free. Render as a **read-only inputs panel** — never ask anyone to author it. |
| **0.2 completion time** | **Missing.** `RespondentAssessmentMapping` has no `startedAt`/`completedAt`; the date a respondent sat an assessment is not in the database. (Already cost us `core:assessmentDate` in P1.) | Blocks step 1.3 outright. Migration, §6. |
| **1. Validity checks** | Rules producing a flag, some of them gating. Needs *numeric* raw responses. | Unblocked by §3.1. Straight-lining and the speed check are STATEMENT rules. |
| **2. Reverse scoring** | Question bank, not here. | §3.2. |
| **3. Score computation** | Today's EXPRESSION rules over `mqt:` / `mq:` keys, live-validated against `ReportColumnCatalog`. | **Works today, unchanged.** Reuse the existing rule editor verbatim. |
| **4. Interpretation bands** | EXPRESSION rules using `NORMBAND()` returning a TERM. | **Not blocked.** Literal cutoffs and cohort-derived percentile norms both work with today's grammar — see §7. |
| **5. Profile interpretation** | Cross-factor conditions producing prose. The DSL has `IF()` with string branches but **no string concatenation at all**, so these are mostly STATEMENT rules realised by generated Python. | Authorable now; the prose arrives with P4. |
| **Edge cases E1-E3** | E1 retake window = an operational guard on `resetAssessment`. E2 tie handling = a note on the band rules. **E3 norm update needs nothing — it is exactly why rule versions and version pinning exist.** | Capture as STATEMENT rules / notes. |

### Step status, shown in the rail

Each step shows one of: `not started` / `n rules` / `n rules, m issues`.
"Issues" means a lint finding, a broken DAG edge, or a rule whose referenced
columns no longer resolve against this assessment. A step is never *blocked* by
the one before it — you can write band rules before the factor rules exist; the
DAG simply reports the dangling reference until you do.

## 3. Two upstream decisions this screen depends on

### 3.1 Validity items get their own MQTs

`ans:` columns are **strings** — `DataStudioDatasetService` line 312 joins the
selected option *labels*. There is no numeric raw-response column anywhere, and
the sandbox only ever sees declared dataset columns. So `IF V3 <= 3 THEN
INVALID` is not writable today in a formula **or** in generated Python.

**Decision: give each validity item its own MQT, hung under a dedicated
`Validity` MQ.** Three things fall out for free:

- The item's 1-5 value appears as a numeric `mqt:<id>` column.
- `In_Composite = N` becomes structural rather than a rule: a validity MQT under
  a separate MQ is arithmetically absent from every real composite. Nobody can
  forget to exclude it.
- `mqt:` ids are **global and stable**; `ans:` tags are the placement's
  author-typed `questionTag` (falling back to `Q_<questionId>`) and therefore
  differ between questionnaires. Keying validity logic on MQT ids is the only
  version that is portable across assessments at all (§4).

Rejected alternative: adding a numeric `ansv:` namespace to
`DataStudioDatasetService`. Conceptually cleaner, but it changes a service Data
Studio shares and needs a defined answer for grid and multi-select questions,
where "the numeric value" is not one number.

### 3.2 Reverse scoring stays upstream

If reverse scoring happened in the report layer, `mqt:` would mean one thing in
Data Studio and another in a report — two sources of truth for a score, diverging
silently. `MqtScoringService` sums `OptionMqtScore`, so a reverse item is
authored with reversed option scores and every consumer agrees forever, with no
code.

Agreed direction: a `Question.reverseScored` flag applied inside
`MqtScoringService`, added later. Until then, reversed option scores. Either
way, **the report layer never applies `6 - raw`** — a rule that does is a bug,
and the Step 2 panel should say so rather than offering an editor.

## 4. Reuse across assessments

**Rules are portable. Computations are not.** The asymmetry is already in the
schema and is the whole reason the two tables are separate.

A rule is portable to assessment B **exactly when
`referenced_keys` is a subset of `columnKeys(B)`** — computable live, today.
Why the keys travel:

| Prefix | Portable? | Why |
|---|---|---|
| `mqt:` `mq:` `mqtt:` | **yes** | The MQ/MQT taxonomy is global, not per-questionnaire. |
| `demo:` | **yes** | Global `DemographicField` registry. |
| `core:` | **yes** | Always present. |
| `ans:` | **no** | The key is the *placement's* `questionTag`. The same bank question placed in two questionnaires can carry different tags. |

A computation, by contrast, is bound to one assessment and one template's full
tag list. Reuse there is §4.4 cloning — an explicit human action that re-runs
generation and re-approves. Unchanged.

### No new table

`report_rule.assessment_id` already means what it needs to: NULL = library,
non-NULL = home assessment. Portability is **computed at pick time**, exactly
like the column catalog is read live, and for the same stated reason — a cached
or certified list is one whose staleness is silent. The build plan's "do not
build a 'this rule runs on 7 assessments' screen" stands.

### Three verdicts in the picker

| Verdict | Shown as |
|---|---|
| **Portable** | every referenced key resolves here |
| **Blocked** | *"`mqt:14` Internal Drive is not scored by this assessment"* — named, not a generic failure |
| **Shape mismatch (warn)** | every key resolves, but a referenced MQT is scored by a **different number of placed questions** than where the rule was validated |

The third is the one worth building. `report_rule_version.validated_assessment_id`
already records where a rule was checked, and
`ScoringPlan.questionScores`/`optionScores` intersected with `placedQuestionIds`
gives the contributing item count per MQT. If Internal Drive was 4 items
(range 4-20) where the rule was written and is 8 items here (range 8-40), then
`IF AD_composite >= 48 THEN 'High Drive'` **resolves cleanly and is silently
wrong**. Nothing else catches that until the P5 distribution strip. It costs one
comparison against data we already load.

### Which steps actually share

- **Step 1 validity** — shares well, *if* the validity items are shared bank
  questions mapped to the same validity MQTs.
- **Step 3 factor scores** — shares well; the shape check is what makes it safe.
- **Step 4 bands** — **least portable.** Cuts are instrument-specific. Default
  new band rules to assessment-scoped; sharing one is opt-in and always warns.
- **Step 5 profile rules** — share well, because they are prose stated in
  relative terms rather than raw cuts.

### Two mechanics

- **Adoption pulls the transitive DAG closure.** Slugs are globally unique, so
  adopting `academic-drive-composite` unambiguously drags in the three factor
  rules it references. Adopting a rule and silently leaving its dependencies
  unselected is the `namedButNotSelected` failure `RuleReferenceLint` already
  exists to catch — better to make it impossible.
- **"Copy to this assessment"** forks a rule (new slug, `assessment_id` set) for
  when you want the same logic with different numbers. Editing the shared rule
  instead writes version N+1, which is safe for anything already approved
  (computations pin versions) but changes what the next adopter gets. The fork
  needs to be as prominent as the edit.

## 5. Testing it with no AI

P3 (sandbox) is not built and P4 (codegen) is blocked on choosing a provider. So
this screen will, for now, produce a validated draft that cannot yet become a
PDF. That is the plan's own ordering, but it means the authoring layer needs its
own proof. It has one, because **an evaluator already exists**.

`ExpressionEvaluator` (287 L, `service/datastudio/expression/`) runs the exact
grammar the rules are written in — `IF AND OR NOT MIN MAX ABS SQRT LOG ROUND
NORMBAND COUNTIF AVERAGEIF AVERAGE SUM COUNT PERCENTILE PERCENTRANK ZSCORE RANK`
— and its constructor takes **the whole population**, so population functions
work too. The build plan calls the EXPRESSION branch "defined but unused"; for
*testing*, it is a free reference implementation.

Four layers, all over **one shared fixture**.

### Layer 1 — the workbook, seeded as a known-answer fixture

**Live test data exists** (confirmed 2026-09-07), which covers the cases that
need volume: population functions, percentile norms, the distribution strip, and
anything where n matters. Use it for those.

It does **not** replace the workbook fixture, because live data has no expected
answers. The supplied workbook is the only thing we have with **hand-worked
golden values** — Internal Drive 16, Sustained Tenacity 15, Adaptive Execution
13, composite 44, band `Moderate Drive`, validity `OK` / `NONE` / `OK` — over 15
items, 3 factors, 3 validity items and 3 reverse-scored items. That is what turns
"the rule ran" into "the rule was right", and it answers half the corpus intake
by itself.

So: seed the workbook instrument as a small assessment with a handful of
respondents, **one of them being the Sample_Calculator column**. Two fixtures,
two jobs — live data for scale, the workbook for correctness.

Seed it as a **dev-profile script, never a Flyway migration** — migrations are
schema, and a data migration would run against staging and production too.
`__smoke__`-style prefixing on anything disposable, per the house rule.

### Layer 2 — the "Dry run" panel

On the setup page: pick a respondent, or the whole cohort. Evaluate every
EXPRESSION rule through `ExpressionEvaluator` over
`DataStudioDatasetService.dataset()`, **in DAG order**, and show the step-by-step
values.

That is the Sample_Calculator tab, inside the product, with no AI and no sandbox.
And because the evaluator sees the population, a **mini distribution strip** —
per-rule min / max / mean / null count / band histogram — is buildable now too.
That strip is what catches a band cut written backwards, which no single sample
report ever shows.

STATEMENT rules render greyed, as *"needs generation"*, with their text.

**One caveat, and it must be on the screen: this is not the delivery path.**
Production runs generated Python in the sandbox. The dry run is a development aid
and an acceptance oracle. `APPROVED` must remain unreachable through it — the
failure mode is somebody shipping the evaluator as the real thing and two
implementations of every rule drifting apart.

Its real payoff arrives later: **it is the golden-value oracle for P4's
regression suite.** Generated Python must reproduce, for the same rules and the
same fixture, what the evaluator produced.

### Layers 3 and 4

| Layer | Phase | Test |
|---|---|---|
| **3. Hand-written Python** | P3 | Write `compute_report_values` for the workbook instrument by hand; run it in the sandbox; diff against layer 2's numbers. Exercises the timeout, memory cap, import allowlist and the cohort contract while the inputs are fully controlled. |
| **4. Generated Python** | P4 | Same fixture, same diff. The only new variable is the model. |

Same fixture at every layer means each new layer is tested by diffing against a
known-good answer, and the **first divergence localises the bug** — which is the
whole reason P3 precedes P4.

### What none of this tests

Prose quality, and whether a rule the psychometrician wrote is the rule they
meant. The first needs a human reading PDFs (P5). The second is what the
Sample_Calculator's worked column is for: if our dry run says 44 and the
workbook says 44, the rules were transcribed correctly.

## 6. Schema deltas

Next free number is **V28** — `V27` is the highest present. Numbers are assigned
in ship order, never reserved.

| | Change | Why |
|---|---|---|
| **V28** | `report_rule.stage` varchar(24), `report_rule.step_order` int | Which of the six steps a rule belongs to. A property of the rule, not of the version — moving a rule between steps is not a logic change and must not mint a version. |
| **V28** | `report_rule_version.referenced_rule_slugs_json` text | The DAG edges, derived from the parser at save time — same treatment `referenced_keys_json` already gets, never typed by hand. |
| **V29** | `RespondentAssessmentMapping.started_at`, `completed_at` — datetime(6) NULL | Step 0.2 and 1.3. `inputs_hash` needs it in P6 anyway. **Nullable with no backfill**: old attempts genuinely do not have this, and inventing a timestamp would be worse than a null. |
| ~~later~~ | ~~`report_reference_table`~~ | **Dropped for now** — §7. Nothing is built until an external norm table actually exists.

Beyond the migrations, in `service/`:

- `[rule:slug]` as an expression term, with cycle / forward-reference / dangling
  detection at save, and topological ordering in `ReportPromptAssembler` (which
  currently emits by `sortOrder`).
- A portability verdict on `ReportRuleService`, per §4.
- A dry-run endpoint on `/api/report-computations`, per §5.

## 7. Norms — three tiers, and only the third needs a table

Confirmed 2026-09-07: **norms are supplied by the psychometrician and no
canonical norm table exists.** That is not a blocker, because the two forms
norms actually take today are both already expressible. Distinguishing the three
tiers is what stops us building a table for a shape nobody has yet.

### Tier 1 — literal cutoffs. Works today.

`NORMBAND(value, cut1, label1, cut2, label2, …, finalLabel)` is exactly the
Step 4 structure, and `ExpressionEvaluator` already implements it.

**Read the boundary rule carefully**, because this is precisely the workbook's
edge case E2 (*"cutoffs are inclusive as written"*) and the place a
transcription slip is invisible. `NORMBAND` tests **strictly less than**
(`if (v < cut) return label`), so the workbook's

    <= 33 -> Developing Drive,  34..47 -> Moderate Drive,  >= 48 -> High Drive

is written with the cuts at **34 and 48**, not 33 and 47:

    NORMBAND(ad_composite, 34, 'Developing Drive', 48, 'Moderate Drive', 'High Drive')

Writing 33 puts every respondent scoring exactly 33 in the wrong band and
nothing complains. This belongs in the Step 4 panel as helper text beside the
editor, not in a doc nobody reads while typing.

### Tier 2 — cohort-derived norms. Also works today.

The workbook's E3 — *"when pilot norms n>=150 are ready, bands are replaced by
percentile cutoffs (P75 / P25)"* — is a **population** rule, and the grammar
already has `PERCENTILE`, `PERCENTRANK`, `ZSCORE` and `RANK`, aggregating over
the cohort. No table, no new function.

Two machineries that already exist are exactly for this: `is_population` on the
rule version, and the `min_cohort_size` guard that emits null and prints a
"norm group too small" block rather than a fabricated number. With one completed
respondent `sd == 0` and every z-score returns exactly 0 — indistinguishable
from perfectly average. That guard is why tier 2 is safe to offer.

### Tier 3 — an externally supplied norm table. Not built.

A published instrument's manual, or cutoffs per age/gender group. **This is the
only case needing storage, and no such table exists yet**, so nothing is built
for it. When one arrives, the shape is already implied by the rest of the design
and should not be invented earlier than that:

- `report_reference_table` + `report_reference_table_version` — the same
  immutable-version pattern as rules, because a computation must pin the norms
  it used or an approved report stops being explicable the day norms are updated.
- Slug-referenced, assessment-scoped or global on the same NULL convention.
- Ingested by **pasting or uploading the sheet the psychometrician sends** and
  parsing it in the browser — the pattern the questions page already uses
  (`dynamic import('xlsx')`, review before submit). They hand over a spreadsheet;
  meet them where they are.
- Passed to the generated function as `reference_data`, **never hardcoded into
  it** (spec §5).
- A `LOOKUP()` addition to the grammar **only then**. Adding a function to the
  shared Data Studio grammar for a hypothetical table shape is how you earn a
  correcting migration.

### What to do now instead: version the cutoffs

E3's real requirement is *"build cutoffs as config values, not hardcoded"*, and
the rules library already satisfies it. Keep the `NORMBAND` call in **one named
band rule per factor** rather than repeating literals across several rules.
Then updating norms after the pilot is a new rule **version**, computations pin
the version they used, and last September's approved report still means what it
said. That is the whole point of the versioning and it costs nothing extra.

**One thing to add to the Step 4 panel:** since norms arrive as a message or a
sheet from a person, record **where the cutoffs came from and what n they were
derived from** in `report_rule_version.notes`, which already exists. Prompt for
it on band rules specifically. It is the difference between a norm you can
defend in a year and a number nobody can explain.

## 8. Open

1. **Nothing.** Norms are settled in §7; the live database is confirmed populated.
2. Unchanged from the build plan: LLM provider, sandbox hosting, who may approve,
   retention, default `min_cohort_size`.

## 9. STATUS — built and verified 2026-09-07

**209 backend tests green** (200 before, so 9 new), `npm run typecheck` and
`npm run build` both clean. `V28` written; it is additive columns only.

| Shipped | Where |
|---|---|
| `V28` — `report_rule.stage` + `step_order`, `report_rule_version.referenced_rule_slugs_json` | `db/migration/` |
| Five stages on the rule, filed per step | `model/report/ReportRule.java` |
| **The rule DAG** — `[rule:slug]`, cycle refusal, transitive closure | `ReportRuleService` |
| **`ReportShapeProbe`** — questions and max score per trait, keyed by column key | `service/report/` |
| **Portability verdicts** — PORTABLE / BLOCKED / SHAPE_MISMATCH | `ReportRuleService.portabilityFor` |
| **`ReportDryRunService`** — the rules evaluated over real respondents, no AI | `service/report/` |
| `/api/report-rules/stages`, `/portability/getByAssessment/{id}`, `/dry-run` | `ReportRuleController` |
| The setup page — six steps, adoption list, dry run, editor with a `[rule:]` rail | `pages/assessments/report-setup.tsx` |
| Route + a row action on the assessment library | `routes/index.tsx`, `assessment-library.tsx` |

### `[rule:slug]` needed no grammar change

The expression lexer already reads anything bracketed as a reference — that is
why columns are written `[mqt:14]`, since `-` is subtraction and `:` separates
the family prefix. So `[rule:internal-drive]` parsed on day one and simply
resolved to nothing.

The whole mechanism is therefore **adding `rule:<slug>` keys to the available
set** at validation time, and injecting each computed value into the row map
under that key at evaluation time. Data Studio is untouched. A slug naming no
ACTIVE rule is refused by exactly the same code path that refuses an invented
MQT.

### Four things found while building

1. **`NORMBAND` is classified SERVER in the Data Studio grammar, and it is
   row-local.** Its evaluator reads cut points and the current row; nothing
   else. Data Studio uses CLIENT/SERVER as a hint about *where* a column can be
   computed and prefers to band on the server, which is harmless there. Reusing
   that list here would have marked **every band rule** `is_population` — and
   `is_population` is not a hint in this engine, it arms the minimum-cohort
   guard. Every band in the product would have stopped printing below the
   cohort threshold. The report layer now names the genuinely cohort-relative
   functions itself; a test pins both directions.
2. **`is_population` has to propagate along the DAG.** A band reading a
   z-score is itself cohort-relative, and only the transitive check sees that.
   Missed, it would let a z-score-derived band print for a cohort of one — where
   `sd` is 0, every z-score is exactly 0, and the output is indistinguishable
   from perfectly average.
3. **Portability must be asked of the whole chain.** A band rule referencing
   nothing but `[rule:composite]` names no columns of its own, so a check that
   stopped at direct references would call it portable everywhere — including
   onto an assessment that cannot compute the composite underneath it. The
   verdict walks the closure, and the adoption list shows what a rule drags
   along with it.
4. **`ExpressionEvaluator` caches aggregates under `Call.id`, which is assigned
   per PARSE.** Every expression's ids therefore start at zero. Sharing one
   evaluator across two separately parsed rules makes the second rule's
   `ZSCORE` return the first rule's — a wrong number, not an error. The dry run
   builds a fresh evaluator per rule.

### The test is the workbook, with its own worked answer

`ReportDryRunTest` builds the **Internal Drive** factor of the Academic Drive
workbook item for item, with its Infrequency validity item, and answers it with
the raw responses from the Sample_Calculator tab — whose hand-computed total is
**16**. That number is asserted. A test that checks the code against itself
proves the code ran and nothing else.

It also pins, over a three-respondent cohort: dependency ordering (factor before
band), `[rule:slug]` resolving per row, the validity item scoring 2 while the
factor still reads 12 (a separate MQ keeps it out of the composite), one
respondent in each band, and the `is_population` behaviour from finding 1.

`ReportDryRunTest` additionally builds **two assessments over the same trait**,
two items against four, and asserts the SHAPE_MISMATCH warning names the trait
and quotes both ranges — the case that resolves cleanly and means something
different.

### Deliberately not built

- **`V29` (attempt timestamps).** Additive to `report_*` tables is one blast
  radius; a column on `RespondentAssessmentMapping`, which the portal writes on
  every submission, is another. It is a separate migration and a separate
  decision to run it. Until then the workbook's step 0.2 and 1.3 have no data.
- **An "adopt" button.** The adoption list computes and shows verdicts and
  dependencies; the act of copying a rule onto this assessment is not wired yet.
  What it should do is settled (§4) — fork on "copy", pull the closure — but it
  writes rules, and it was worth landing the verdicts people will act on first.
- **Anything that approves.** The dry run says so on the screen. `APPROVED`
  remains unreachable, as P5 requires.

### Note on the migration

`V28` was written straight into `db/migration/`, which on this setup applies it
within seconds via the IDE. It targets the local container (`DB_PORT` defaults
to 3310 on this branch) and is additive columns plus one index, each guarded by
an `information_schema` check so a re-run is a no-op. I could not verify it
applied — the docker socket is not readable from this shell — so **confirm
`report_rule.stage` and `report_rule_version.referenced_rule_slugs_json` exist
before the next boot**, since `ddl-auto: validate` will refuse to start without
them.
