# Direct computation mode — delivering reports without the LLM

> **Status: BUILT, 2026-09-08.** Steps 1–6 of §9 are in, with the exception
> noted under "Not persisted" below. 210 backend tests green (`ReportDirectDeliveryTest`
> is the end-to-end one); frontend typecheck and build clean; V29 applied to the
> local DB on 3310 and the app boots under `ddl-auto: validate`.
> Amends [report-engine-build-plan.md](report-engine-build-plan.md) §3, which
> reads *"EXPRESSION mode — defined, unused. Do not build UI or an evaluator for
> it."* That instruction has been overtaken by what actually got built — see §1.
> Every fact in §1 was verified against source on 2026-09-08.

## 0. The claim

A computation whose rules are **all `EXPRESSION`** needs no AI, no generated
Python and no sandbox to produce a report. The evaluator that would run it is
already written, already runs over the real cohort, and already computes exactly
the values a report needs. What is missing is not an engine — it is **a way to
point a template tag at a rule**, and one `switch` branch.

Building that ships delivered PDFs before the LLM work starts, and takes the
sandbox off the critical path for every report that does not need prose.

---

## 1. Ground truth (verified 2026-09-08)

### The engine exists

`ReportDryRunService.run()` (lines 88–163) evaluates the pinned rules over the
whole cohort in Java, in dependency order, and **writes each result back into
the row map** under `rule:<slug>`:

```java
ExpressionService.Node root = expressions.parse(version.getExpression());
ExpressionEvaluator evaluator = new ExpressionEvaluator(population);   // one per rule
String key = ReportRuleService.RULE_PREFIX + rule.getSlug();
for (Map<String, Object> row : population) {
    row.put(key, evaluator.eval(root, row));
}
```

Two consequences that decide this whole proposal:

1. **The full per-respondent value map already exists in memory.** Only the
   *response* is sampled — `sample(population, ordered, limit)` at line 158,
   capped at 25/200. The values for every respondent are computed either way.
   So the refactor is extraction, not reimplementation.
2. **The rows are already keyed to an attempt.** `DataStudioDatasetService`
   line 287 puts `rowId = respondentAssessmentMappingId`, which is precisely the
   argument `ReportCoreResolver.resolve(RespondentAssessmentMapping)` takes.
   The join between computed values and core fields (name, dob, organization,
   report date) needs no new lookup.

### The renderer exists and the last mile is one branch

`ReportValueResolver.valueFor()` resolves two binder types and drops the rest:

```java
case ReportTagBinding.TYPE_CORE    -> coreValues.get(binding.getCoreField());
case ReportTagBinding.TYPE_LITERAL -> binding.getLiteralText();
default -> null;   // VALUE, NARRATIVE, COMPUTED, TABLE, CHART → fallback text
```

`TYPE_VALUE` is already a declared constant. `ReportRenderer.toPdf(String html)`
already produces a real PDF with fonts registered and network access denied.

### What is genuinely absent

| Checked | Found |
|---|---|
| Last migration | **V28**. Next is **V29**. |
| Computation columns on `report_tag_binding` | **None.** V26's header states it: *"No `report_computation_id` on the binding yet. P2 adds those columns."* |
| `report_computation.mode` | Does not exist. |
| LLM client / sandbox / outbound HTTP | **None**, anywhere in the backend. `ReportComputationService` javadoc: *"Nothing here calls an AI."* |
| Terminal computation state | `READY_FOR_GENERATION`. `GENERATED` and `APPROVED` are defined constants, unreachable. |

### Why the build plan's instruction no longer holds

§3 forbade an EXPRESSION evaluator because it assumed practitioners would
hand-author ad-hoc computations, which would have been a second authoring
surface competing with codegen. **That is not what shipped.** What shipped is a
rule library that *is* expressions, filed by pipeline step, with a DAG between
rules — and an evaluator for it, because authoring without feedback was
unworkable. The evaluator is already here; the question is only whether it is
allowed to reach a PDF.

---

## 2. What direct mode can and cannot fill

The mode is **not a free choice** — the rules decide it.

| Rule `definitionKind` | Direct mode |
|---|---|
| `EXPRESSION` | Runs. Numbers, and strings too — `NORMBAND()` and `IF()` with string branches return band names like `"Moderate"`. |
| `STATEMENT` | **Cannot run.** Prose has no expression form. Needs generation. |

### The distinction that actually matters: selected prose vs composed prose

"Text output" is two different things, and only one of them needs AI.

A `NORMBAND` label is a **string literal**, and a string literal has no length
limit. So this is a legal `EXPRESSION` rule, runs today, and needs nothing:

```
NORMBAND(rule:ext_score,
  34, "You tend to recharge in quiet settings and prefer depth over breadth in
      your relationships. Meetings with many voices are likely to tire you.",
  48, "You move comfortably between company and solitude, adjusting to what the
      situation asks of you.",
      "You draw energy from people and think best out loud. Long stretches of
      solo work are likely to feel flat.")
```

That is a **full interpretive paragraph, selected by score** — which is how a
great many real psychometric instruments are actually written: a bank of
pre-written statements, one per band, signed off once by the psychometrician.
It stores as `RESULT_TERM` (`mapResultType`: a formula whose parsed type is
`string` becomes `TERM`; `RESULT_TEXT` is reserved for `STATEMENT` rules).

What the DSL cannot do is **compose** — there is no concatenation and no
interpolation at all (verified in `ExpressionService.inferType`, lines 192–214;
the function list has no string function whatsoever). So a rule cannot build
*"your score of 44 places you..."* by pasting the number into the sentence.

That limit is largely dissolved at the template, which concatenates for free:

```html
<!-- direct mode: prose lives in the template, values drop in -->
<p>Your extraversion score of <b>${ext_score}</b> places you in the
   <b>${ext_band}</b> range.</p>

<!-- generated mode: one tag, the model writes the paragraph -->
<p>${ext_paragraph}</p>
```

So the real dividing line is not prose vs numbers. It is:

| Needs | Direct mode |
|---|---|
| A number | yes |
| A one-word band label | yes |
| A **pre-written paragraph chosen by score** | **yes** — this is the case worth knowing |
| A number **inside** a sentence | yes, split across two tags in the template |
| A paragraph **written fresh** per respondent, weaving several traits together in language nobody wrote in advance | **no — needs generation** |

For clinical and industrial reports the selected form is frequently what a
psychometrician wants anyway: every word was signed off by a human, and the same
sentence comes out for the same score forever. Composition is what `STATEMENT`
rules and P4 are for — cross-factor narrative that cannot be enumerated ahead of
time because the combinations are the point.

---

## 3. Design decisions

### 3.1 Mode is per computation, never per tag

A report with half its tags evaluated in Java and half written by generated
Python has **two provenances and one audit trail**. When a number is wrong,
nobody can say which engine produced it. `mode` therefore lives on
`report_computation`, and a computation is wholly one or the other.

### 3.2 Eligibility is detected, not declared

The computation already pins `ReportRuleVersion` rows, each carrying
`definition_kind`. The server can answer *"can this run without AI?"* exactly,
so the UI must not ask the user to guess:

- all pinned rules `EXPRESSION` → offer **"Run without AI"**, explain what it means
- any `STATEMENT` → say so, name the rules, and keep `GENERATED` the only option

Selecting `DIRECT` on a computation containing a `STATEMENT` rule is a **409**,
not a report with empty tags.

### 3.3 One evaluator, used twice

Direct delivery must call the **same** service the dry run calls. Two
implementations of the same grammar is how the two silently disagree, and the
whole value of the dry run as an oracle for the generated Python later rests on
there being exactly one reference implementation.

Concretely: extract the evaluation loop out of `run()` into

```java
EvaluatedCohort evaluate(Long assessmentId, Long organizationId, List<ReportRule> rules)
```

returning the full population rows plus the per-rule outcomes. `run()` becomes
*evaluate → summarise → sample*; direct delivery becomes *evaluate → resolve →
render*. Neither one owns the evaluator.

### 3.4 The binding shape is the same in both modes

A `VALUE` binding stores `(report_computation_id, output_key)`:

- **DIRECT** — `output_key` is the **slug of a rule pinned into that computation**
- **GENERATED** — `output_key` is a key the generated function declares

So a template bound today keeps working when a computation is later regenerated
by AI. No re-binding, no second migration, no fork in the resolver's contract.

### 3.5 Approval still exists, and is cheaper — not skipped

The approval gate in the build plan exists because *generated code is untrusted*.
An expression cannot import, cannot loop, cannot do IO, and was read by a human
when it was authored — so direct mode needs no sandbox, no import allowlist, no
banned `random`/`datetime.now`, no pinned interpreter digest.

It still needs an approval, for a different reason: **a formula can be correct
code and the wrong psychometrics.** A band cut written 33 instead of 34 parses,
runs, and puts every boundary respondent in the wrong band.

Gate `approve/{id}` on all of:

- `mode = DIRECT`, and every pinned rule version is `EXPRESSION`
- template `PUBLISHED`, every tag bound, no tag pointing at a rule not pinned here
- a dry run performed on the current rule versions with **zero `ERROR` outcomes**
- a human pressing the button

### 3.6 Values are snapshotted at delivery, both modes

`AssessmentReportService.resetAssessment()` hard-deletes answers on re-attempt
and archives nothing. So a delivered report's numbers must be frozen when it is
issued, **regardless of which engine produced them** — direct mode is not exempt
from `values_json`. Recompute-on-open would silently change a report that has
already been given to a person.

---

## 4. Schema — V29

Two guarded `ALTER`s and one backfill. Numbering is V29 because V28 is applied;
never reserved ahead.

```sql
-- report_computation: how this computation produces its values.
ALTER TABLE `report_computation` ADD COLUMN `mode` varchar(16) DEFAULT NULL AFTER `status`;

-- Backfill from data, not a guess: a computation is DIRECT exactly when
-- nothing pinned into it needs prose. Per CLAUDE.md — add NULL, UPDATE,
-- then tighten. A NOT NULL default here would have labelled every existing
-- row with whichever value we picked, which is a claim about rules we can
-- simply read instead.
UPDATE `report_computation` c SET `mode` = CASE WHEN NOT EXISTS (
    SELECT 1 FROM `report_computation_rule` cr
      JOIN `report_rule_version` rv
        ON rv.`report_rule_version_id` = cr.`report_rule_version_id`
     WHERE cr.`report_computation_id` = c.`report_computation_id`
       AND rv.`definition_kind` <> 'EXPRESSION'
  ) THEN 'DIRECT' ELSE 'GENERATED' END;

ALTER TABLE `report_computation` MODIFY `mode` varchar(16) NOT NULL;

-- report_tag_binding: what a VALUE/NARRATIVE tag points at.
ALTER TABLE `report_tag_binding`
  ADD COLUMN `report_computation_id` bigint     DEFAULT NULL AFTER `literal_text`,
  ADD COLUMN `output_key`            varchar(80) DEFAULT NULL AFTER `report_computation_id`;
```

Deliberately absent, each an actual decision:

- **No FK from `report_tag_binding` to `report_computation`.** A template is
  portable across assessments; a computation is bound to one. An FK would make
  deleting a computation depend on templates that merely *once* referenced it.
  Validity is checked at publish and at approve, where the pair is known.
- **No `report_computation_version` table.** Direct mode's artifact is the
  pinned `report_rule_version` rows, which are already immutable. Inventing a
  version row that holds no artifact would be a table whose shape was guessed —
  the same reason V27 declined to create it.
- **`ADD COLUMN` guarded per column** (errno 1060), following V28's prepared-
  statement pattern.

---

## 5. Backend work

| Where | Change |
|---|---|
| `ReportDryRunService` | Extract `evaluate(...)` per §3.3; `run()` becomes a caller. No behaviour change. |
| `ReportComputation` | `mode` field, `MODE_DIRECT` / `MODE_GENERATED` constants. |
| `ReportComputationService` | `eligibleForDirect(id)` — reads pinned versions' `definitionKind`. Reject `DIRECT` when any is `STATEMENT` (409). |
| `ReportTagBinding` | `reportComputationId`, `outputKey`; `bindTag` accepts `VALUE`. |
| `ReportValueResolver` | Third branch: `TYPE_VALUE` → `values.get(outputKey)`, formatted by `format`, falling back on null. **Escaping stays exactly where it is** — one place, everything. |
| `TemplateLint` | New finding: tag bound to a rule slug not pinned into the computation. |
| New `ReportDeliveryService` | evaluate → for each attempt, core values + rule values → resolve → `toPdf`. |
| New endpoints | `POST /api/report-computations/approve/{id}`, `GET /api/report-computations/preview/{id}/{attemptId}.pdf`, `POST /api/report-computations/deliver/{id}`. |

A null from a rule must **fail the report, not print a blank**. Data Studio's
`compute()` writes null into a cell and carries on, which is right for a
spreadsheet; here a missing score is a wrong report.

## 6. Frontend work

- **report-computations.tsx** — a mode strip: *"All 9 rules are formulae. This
  computation can run without AI."* / *"3 rules are statements (`profile_summary`,
  …). These need generation."* Approve button with the §3.5 checklist rendered as
  what is still missing.
- **report-templates.tsx** — the `VALUE` binder in the tag checklist: pick a
  computation, then one of its rule slugs, with the rule's expression shown so
  the author binds by meaning rather than by name.
- **report-setup.tsx** — unchanged. It already does its job.

---

## 7. What this removes from the critical path

Not needed for a direct-mode report, and each is a deployment component:

- the Python sandbox service, its image and its compose entry
- the import allowlist and the static pre-execution scan
- the determinism bans (`random`, `datetime.now`, `time`, `uuid`, `os.environ`, `id()`)
- interpreter pinning via `sandbox_image_digest`
- the LLM client, the API key, and the first outbound HTTP call the backend
  would ever make

None of it is cancelled — `STATEMENT` rules still need all of it. It stops
being a prerequisite for **any** report.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Two delivery paths disagree | They are one implementation used twice (§3.3). A copy would be the bug. |
| Direct mode becomes the excuse to never build codegen | It cannot write a sentence. Any report needing prose still blocks on P4. |
| Authors bind a tag to a rule that later changes | Bindings point at a computation, whose rule **versions** are pinned and immutable. Editing a rule creates a new version and does not touch an approved computation. |
| `SHAPE_MISMATCH` rules deliver plausible wrong numbers | Already detected by `portability`. Approval must refuse a computation with a non-`PORTABLE` verdict on its own assessment. |
| Cohort-relative rules on a tiny cohort | `is_population` rules need the `min_cohort_size` guard in direct mode too — a `ZSCORE` over 3 respondents is not a norm. |

## 9. Build order — as shipped

| # | Step | Where |
|---|---|---|
| 1 | V29 + `mode`, derived from the pinned rules | `V29__add_direct_computation_mode.sql`, `ReportComputation`, `ReportComputationService.applyRules` |
| 2 | `evaluate()` / `evaluatePinned()` extraction | `ReportDryRunService` — pure refactor, all prior tests green |
| 3 | `TYPE_VALUE` binding | `ReportTagBinding`, `ReportTemplateService.validateValueBinding`, `ReportValueResolver.computed`, `report-templates.tsx` |
| 4 | Single-attempt PDF preview | `ReportDeliveryService.preview`, `GET /preview/{id}/{attemptId}.pdf` |
| 5 | Approval gate | `ReportComputationService.approve` + `directBlockers` |
| 6 | Batch delivery + values snapshot | `ReportDeliveryService.generate`, `POST /generate/{id}` |

**Two deviations from the plan above, both deliberate:**

- **`format()` on numbers was not in the plan and had to be.** The evaluator
  works in doubles, so a sum of integer option scores arrives as `44.0`.
  Printing that on a report is wrong in a way everybody notices and nobody can
  explain. `ReportValueResolver.format` prints whole numbers whole and honours a
  `DecimalFormat` pattern where a mean or a z-score wants decimals.
- **The batch is streamed as a ZIP, not persisted.** No `generated_report`
  table and no stored PDF — that needs both a migration and the `app-uploads`
  volume `docker-compose.yml` still has commented out, and a PDF written to a
  filesystem a redeploy erases is worse than one never written. The
  `values.json` manifest (values + the pinned rule versions that produced them)
  rides inside the ZIP instead, so the audit trail exists in the operator's
  hands even though the server keeps nothing.

**Not in scope, unchanged:** `NARRATIVE`, `TABLE`, `CHART` binders; anything AI;
the sandbox; norm-table lookups.
