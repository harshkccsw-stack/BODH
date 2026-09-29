# `reverseScored` and `inComposite` on Question — the two flags that change a number

> **Status: PROPOSAL, 2026-09-16. Nothing built.** Written to be argued with.
> §12 lists the four decisions I need before this is buildable.
>
> Origin: `docs/Report Logic.xlsx`, all three tabs read end to end (§1). The
> practitioner's `Items_Master` carries two per-item flags, `Reverse_Scored`
> (col F) and `In_Composite` (col G), and the request is to give `Question` the
> same two flags "like the risk flag". This document says what they mean, what
> the risk flag actually is, why these two cannot be like it, and what has to
> change for them to be true.
>
> It builds on two locked decisions in
> [report-rule-authoring-plan.md](report-rule-authoring-plan.md) §3: validity
> items get their own MQTs (§3.1), and reverse scoring stays upstream of the
> report layer (§3.2) — which already names *"a `Question.reverseScored` flag
> applied inside `MqtScoringService`, added later"* as the agreed direction.
> This is that later.

## 0. Decisions proposed

| Question | Proposal |
|---|---|
| Where do the flags live? | **On `Question`**, both. Reversal is a property of an item's wording and exclusion a property of what the item is for; neither changes between instruments. §4 |
| Are they informational, like `riskFlag`? | **No.** `riskFlag` is stored, shown, and read by nothing (§3). These two are applied by the scoring engine — the first question flags that change a number. §5 |
| Where is reversal applied? | **Inside `MqtScoringService.score()`**, once, for every consumer. Option scores stay authored as RAW (1..5). §5.1 |
| What is the pivot? | **`min + max` of that question's option scores for that MQT**, computed, never a stored 6. §5.1 |
| What does `inComposite = false` do? | The item's value still lands on its own MQT (**own** score), but is added to **no subtree total and no MQ total**. Readable, never summed. §5.2 |
| How do today's reversed items survive? | **The flag defaults to false and today's descending scores keep working.** The one thing that must be refused is the flag on a question whose scores already run backwards — that is a double reversal. §6 |
| Which question types may be reversed? | Single-choice MCQ and LINEAR_SCALE only. Multi-select, grids and free text are refused, like a selection rule on a scale. §7 |
| The raw sheet? | Own columns show every item's value including excluded ones; the `(total)` columns exclude them; the Scoring Key shows scores **as scored** and marks reversed items. §8 |
| The AI importer? | Switches to **ascending scores + the flag** — the pivot arithmetic moves out of the expander and into the engine, where every path shares it. §9 |
| `ReportItemBinding.reverseScored / inComposite`? | **Kept.** The binding records what the SHEET claims; the question records what the PLATFORM does; the unbuilt §7 lint becomes "do they agree". §10 |
| Migration? | `V35`, two columns, defaults false / true, no backfill — and the defaults are correct for every existing row, which is argued rather than assumed. §11 |

## 1. What the workbook says — all three tabs

**Items_Master** (col F, G) and its notes:

> 3. Reverse_Scored=Y items (I3, I6, I11): transform before scoring using
>    score = 6 - raw.
> 4. In_Composite=N items (V1, V2, V3) are NEVER added to any factor or
>    composite score. They only drive validity flags (see Scoring_Logic sheet).

**Scoring_Logic** uses both, and the order matters:

| Step | Rule | Which flag |
|---|---|---|
| 1.1 | `IF V3 <= 3 THEN INVALID` — reads V3's **raw** value | In_Composite = N items are read raw, never transformed |
| 1.4 | `IF V1 = 5 AND V2 = 5 THEN sd_flag = STRONG` | same |
| 2.1 | `FOR each item WHERE Reverse_Scored = 'Y': scored = 6 − raw. All other scored items: scored = raw. Validity items are never transformed or summed.` | Reverse is a transform on the VALUE |
| 3.1–3.4 | `ID_score = I1 + I2 + I3(rev) + I4` … `AD_composite = ID + ST + AE` | In_Composite = N items appear in NO sum |

**Sample_Calculator** is the executable form and settles two things the prose
leaves open:

- Column E, `Scored`: `=IF(D4="Y", 6-C4, C4)` for scored items — and the literal
  string **`n/a`** for V1, V3, V2. An excluded item has no scored value at all.
- The RESULTS sums `=E4+E5+E6+E8` skip row 7 (V1) by *omission*. Exclusion is
  not a zero added; it is an absence.

So the two flags are different **kinds** of thing, and that is the whole design:

| | What it changes | Engine treatment |
|---|---|---|
| `Reverse_Scored` | **what** a response is worth — a transform on the value | applied when an answer's contribution is read |
| `In_Composite` | **where** it counts — a filter on aggregation | applied when totals are rolled up |
| `riskFlag` | nothing | none |

## 2. What the platform holds today

- **`Question.riskFlag`** — `@Column(name = "riskFlag")`, exposed on
  `QuestionRequest` / `QuestionResponse`, set in `applyFields`, a checkbox in
  the form, a red badge in the list, a `risk` column in the template. **Read by
  nothing else.** It is metadata with a nice icon. (`riskRule` and `subDomain`
  sit beside it, unexposed.)
- **`MqtScoringService.score()`** — sums `OptionMqtScore` for selected options
  and `QuestionMqtScore` once per answered question into per-MQT **own**
  scores, then rolls up **subtree totals** and **MQ totals**. It knows nothing
  of reversal or exclusion. Every number in the system comes from it: the raw
  export (`AssessmentReportService`), Data Studio's `mqt:` / `mqtt:` / `mq:`
  columns (`DataStudioDatasetService` line 316), the report engine's dataset.
  `ReportShapeProbe` reads `OptionMqtScore` directly, but only for a factor's
  possible RANGE — unaffected by either flag (§5.3).
- **Reversal today is authored**: a reversed item is stored with option scores
  5,4,3,2,1. The AI importer writes exactly that (`CanonicalRowExpander`, the
  B4 pivot). Three such items exist in the local bank.
- **Exclusion today is structural**: validity items hang under a `Validity` MQ
  that no report composite names (§3.1). It works by omission, and the engine
  still computes a `Validity (total)` column that means nothing.
- **`ReportItemBinding`** already stores `reverseScored` and `inComposite` per
  assessment, copied from the item sheet. Read only by its own response DTO
  and the re-import diff; the §7 lints that would use them were never built.
- **The raw value of an answer is not stored.** `AssessmentAnswer` holds the
  option; the option's position is `sortOrder`. The report's only numeric view
  of an item is its `mqt:` score — which is why §3.1 gave validity items their
  own MQTs.

## 3. Why "like the risk flag" is the right UI and the wrong model

The user is right about the surface: two more checkboxes beside *Risk flag*,
two more badges, two more template columns, two more DTO fields. That parity
is cheap and §13 lists it.

But the risk flag is inert, and these two are not. A flag that changes a number
needs three things a flag that changes nothing never did:

1. **A definition of what it does, in one place** — §5.
2. **Validation that refuses the states in which it lies** — §6, §7. The risk
   flag cannot be wrong; `reverseScored` on an item whose scores already run
   backwards is wrong in a way no screen would show.
3. **A display of its effect** — the editor must show "as scored" beside
   "as authored", or the flag is a promise nobody can check. §13.

## 4. Question-level, not placement-level

`QuestionnaireQuestion` holds section and order; `Question` holds what the
item IS. A negatively keyed statement ("I take it as a sign I am just not built
for it") is negatively keyed in every questionnaire it is placed in, and a
social-desirability probe is a probe everywhere. Both flags are properties of
the item's meaning, so they go beside `riskFlag`, `selectionRule` and
`shuffleOptions` — the other things that are true of a question wherever it
appears.

(`ReportItemBinding` keeps its per-assessment copies for a different reason —
§10.)

## 5. The engine

### 5.1 `reverseScored` — a transform at read time

In `score()`, where an answer's option contributes `score(o, m)` to MQT *m*:

```
contribution = reversed(q) ? pivot(q, m) − score(o, m) : score(o, m)
pivot(q, m)  = min + max over { score(o', m) : o' ∈ options(q), o' scores m }
```

For a 1..5 scale that is `6 − raw` — the sheet's own formula, derived rather
than stored. A 0..4 scale pivots at 4; a scale authored 1..7 at 8. `pivot` is
computed once per (question, MQT) in `planFor`, alongside the existing maps.

**Why `min + max` on scores, and not "the mirror option's score".** For a
Likert item — the only real use — the two are identical. They differ only on a
non-linear MCQ (scores 0,1,2,5,10 → `10,9,8,5,0` versus `10,5,2,1,0`), where
neither is obviously right and the practitioner should not be reverse-scoring
in the first place. `min + max` is a pure function of the stored scores, needs
no option positions, and is literally what the sheet writes. Chosen for that.

**Why here and not in `OptionMqtScore`.** Authoring-plan §3.2's argument,
unchanged: the engine is the one place every consumer already agrees on. Put
the flag here and the export, Data Studio and the report engine cannot
disagree about what a reversed item is worth, because none of them computes
it. Keep it in the stored scores — today's state — and the flag is a
statement about the data that nothing enforces (§6).

**`QuestionMqtScore` (the flat, question-level score) is not reversed.** It is
"earned for answering at all", not for what was answered; there is nothing to
invert. On a LINEAR_SCALE it is stored 0 anyway.

**Needs one more projection.** `findForQuestionnaire` returns
`(optionId, mqtId, score)` with no question id, so the plan cannot group a
question's options to find their min and max. Either a fourth column on that
query or an `optionId → questionId` map; either is one line in
`OptionMqtScoreRepository`.

### 5.2 `inComposite = false` — a filter at roll-up time

Two accumulators instead of one:

```
own[m]        += contribution        (every answered question)
counted[m]    += contribution        (only questions with inComposite = true)

mqtScores[m]  = own[m]                              ← the item's value, readable
mqtTotals[m]  = Σ counted[d] for d in subtree(m)    ← excluded items absent
mqScores[mq]  = Σ counted[n] for n in mq            ← excluded items absent
```

So `mqt:Validity › Infrequency` still reads V3's value — the number rule 1.1
needs — while `Validity (total)` and every ancestor total are what the
Sample_Calculator's `n/a` means: the item is not a zero in the sum, it is not in
the sum. This also makes exclusion **a property of the item rather than of
where it hangs**: a validity item accidentally placed under a scoring MQT no
longer pollutes that MQT's total. §3.1's structure stays the recommended home
for validity items; the flag is what makes it not the only safeguard.

**One consequence to state.** An excluded item is only *readable* if its MQT is
its own. Put `inComposite = false` on an item that scores into the same MQT as
four real items and its value is mixed into that node's own score with no way
back out — the flag removes it from totals but the value is lost in the node.
That is not a rule the bank can check (it depends on placement), so it is a
**questionnaire-level warning** in the shape probe / export: *"Q7 is excluded
from totals but shares MQT X with 4 counted questions — its value cannot be
read separately."*

### 5.3 What does not change

- **`ReportShapeProbe`** reads `OptionMqtScore` for a factor's possible range.
  Reversal maps the set `{1..5}` to itself, so ranges are unchanged. Excluded
  questions still feed their own MQT's range. Nothing to do.
- **The portal** sends option ids. Nothing to do.
- **Answer freeze** rules are untouched: the flags are scoring, which the
  question flow already owns and rebuilds on every save.

## 6. The transition — how nothing already scored changes

This is the section that could go wrong, so it is spelt out.

**State on the day `V35` lands.** Every question has `reverse_scored = false`,
`in_composite = true`. The engine's new branches are never taken. Every number
is what it was yesterday. The three locally imported reversed items keep their
5,4,3,2,1 scores and keep scoring correctly — they are reversed *by data*, as
authoring-plan §3.2 allowed, and the flag being false is accurate: the engine
is not to reverse them again.

**The one state that must be refused: the flag on descending scores.** Tick
`reverseScored` on one of those three items and the engine would apply
`6 − 5 = 1` to an option already worth 1 for "Strongly Disagree" — a double
reversal, and every report on it confidently wrong. So, **at save time, on
`/create`, `/update`, `/bulk-create` and `/import` alike** (one `firstProblem`
check, in the house style):

> `reverseScored = true` requires, for every MQT the question scores, that the
> option scores be **non-decreasing in option order**. Otherwise 400: *"this
> question's scores already run backwards — untick the flag, or re-author the
> scores in ascending order and let the flag reverse them."*

**The converse is a warning, not a refusal.** `reverseScored = false` with
descending scores is legal — it is exactly today's data — but it is almost
always an item that should carry the flag. The editor shows: *"these scores run
backwards; did you mean the reverse-scored flag?"* and the export's Scoring Key
marks it *(reversed by scores)*. Nothing is changed for them automatically:
inferring the flag from the data and flipping the scores is a migration nobody
asked for, and the item-binding sheet is the record of which items are
reversed, not a heuristic.

**`inComposite` has no such trap.** Its default is true; flipping it excludes
from totals from that moment; nothing stored had to be arranged around it.

## 7. Which questions may carry the flags

`reverseScored` is refused, in `validateType`, on:

| Type / state | Why |
|---|---|
| multi-select (`selectionRule != null`) | the sum of several reversed contributions has no defined meaning — "pick up to 3" reversed is not a thing the sheet describes |
| `LIKERT_GRID` | reversal would be per row, and rows are a later design |
| `SHORT_ANSWER`, `PARAGRAPH` | nothing to reverse |
| a question with no option scores | nothing to reverse — and on a LINEAR_SCALE this check runs after the points are generated |

Allowed: single-choice **MCQ** and **LINEAR_SCALE**. The second is a genuine
unlock: the AI-sheet plan (§4.3 there) found that a scale *cannot* express
reversal because its points are generated ascending. With the flag, a reversed
scale is `from + to − value` in the engine, and the finding becomes false. A
reversed Likert item can be a `LINEAR_SCALE` for scoring purposes; the label
loss (a scale has two captions, not five) is the remaining reason to author it
as an MCQ.

`inComposite` is allowed on anything that scores.

## 8. The raw sheet — where each flag shows

Against the export plan's five sheets:

| Sheet | Change |
|---|---|
| **Raw Data** | `<path>` own columns unchanged — an excluded item's value appears on its MQT. `<path> (total)` and `<MQ> (total)` are computed from `counted` (§5.2): excluded items absent. A `Validity (total)` column whose every node is excluded is 0 for every respondent; **hide it** (a column that cannot be non-zero is noise, the same reasoning that hides leaf totals). |
| **Scoring Key** | The `score` column shows the score **as scored** — `pivot − stored` for a reversed item — with a new `note` column: `reversed`, `reversed by scores` (§6), `not in totals`. This is the sheet a practitioner audits from; it must show the number that was actually added. |
| **Questions** | Two new columns, `reverseScored` and `inComposite`, beside the tag and stem. |
| **MQ-MQT Scores**, **MQ Totals** | Follow the engine; no separate change. |

## 9. The AI importer and the template

The template gains two optional columns, read exactly like `risk`:

```
reverseScored   yes / no    blank = no
inComposite     yes / no    blank = yes
```

Old sheets are unaffected; both blank mean what every existing sheet means.

**`CanonicalRowExpander` changes what it writes.** Today it inverts the
option scores of a reversed row (the §4 pivot, and the B4 fix that kept blanks
blank). Under this design it writes the **raw** scores — ascending, exactly as
the shared scale states them — and sets `reverseScored: yes`, and it sets
`inComposite: no` from the `excludeFromComposite` column it already reads. The
pivot arithmetic leaves the expander entirely; it has one home, in the engine.

That is a behaviour change to something built and tested yesterday.
`reverseScoredItemsInvertTheirOptionScores` becomes
`reverseScoredItemsKeepRawScoresAndSetTheFlag`, and the vitest round trip gains
the two columns. The downloaded sheet then carries `reverseScored: yes` and
ascending scores, which the template path honours because `/bulk-create`
honours the flag (§6).

**The duplicate check is unaffected**, but §6's refusal now applies to a
re-import: a sheet that writes descending scores AND `reverseScored: yes` is
refused at `/import`, with the message naming which.

## 10. `ReportItemBinding` — kept, and finally useful

The binding's `reverseScored` / `inComposite` are **what the sheet claims** per
assessment. The question's flags are **what the platform does**. Item-master
plan §7 listed as its first and most important lint:

> `reverseScored = Y` but the question's option scores ascend → BLOCKING

Under this design that lint is wrong as written — ascending scores are the
*correct* state for a flagged question — and its replacement is one comparison
each:

| Lint | Severity |
|---|---|
| `binding.reverseScored ≠ question.reverseScored` | BLOCKING — the sheet and the bank disagree about whether an item is reversed |
| `binding.inComposite ≠ question.inComposite` | BLOCKING — the sheet and the bank disagree about whether an item counts |
| `binding.reverseScored = true`, `question.reverseScored = false`, scores descend | WARNING — reversed by data, not by flag; correct today, worth tidying |

Both are trivial once the flags exist, and for an instrument brought in
through the AI importer they agree by construction, because the importer sets
both from the same cells the binding was read from.

## 11. Migration — `V35`

```sql
-- V35__question_scoring_flags.sql
-- reverse_scored: the engine inverts this question's option contributions.
-- in_composite:   false = the item's value lands on its MQT but joins no total.
-- Both defaults are CORRECT for every existing row, not merely safe: nothing
-- is reversed-by-flag today (reversed items carry reversed scores, which the
-- engine must not touch again), and every item counts.
-- Guarded like V11, so a re-run is a no-op.
ALTER TABLE question
  ADD COLUMN reverse_scored BIT(1) NOT NULL DEFAULT b'0' AFTER risk_flag,
  ADD COLUMN in_composite   BIT(1) NOT NULL DEFAULT b'1' AFTER reverse_scored;
```

Physical names are snake_case (`risk_flag`, `selection_rule` set the pattern —
V11's header comment explains the logical/physical split). CLAUDE.md's
"backfill before tightening" is about columns where a default would orphan
rows; here the defaults are the truth, which is the argument for `NOT NULL`
straight away.

**The number moved, and may again.** This plan said `V32` when it was written
on 2026-09-16; `V32`, `V33` and `V34` were taken since by the report engine's
approval provenance, the tag-answer move and the practitioner phone column.
**`V35` is the next free number as of 2026-09-22** — check once more before
writing the file.

**Before this file is written: confirm which database is live.** Writing a
`V<n>.sql` lands the DDL on whatever database the IDE points at within seconds
of the file being saved, before anything is deliberately booted. Port 3310 has
been a local container AND an SSH tunnel to a remote database within the last
month, so check what is actually listening (`ss -ltnp`) rather than trusting
this document or the port number.

## 12. Open questions — the four that need you

> Three of these are really questions for the practitioner, restated in their
> own language as Q1–Q3 of
> [practitioner-questions.md](practitioner-questions.md) §1. Question 1 below
> is ours to decide, not theirs.

1. **Engine-applied (this document) or informational-plus-lint?** The
   informational version costs nothing and changes nothing: a checkbox, a
   badge, and a lint that says "flag set but scores ascend". It would leave
   reversal authored in the scores, exactly as today. I recommend
   engine-applied — the platform already agreed it (authoring §3.2), it is the
   only version where the flag *is* the truth, and it unlocks reversed scales
   (§7). But it is the bigger change, and §6's refusal is the price.
2. **The pivot: `min + max` of scores (§5.1)?** Matches `6 − raw`. The
   alternative — the mirror option's score — differs only on non-linear MCQs.
3. **`inComposite = false` excludes from the item's own MQ total too**, so a
   `Validity` MQ totals 0 and its column is hidden (§8). Agreed, or should the
   MQ total keep it and only *ancestor MQT* totals exclude it? The sheet says
   "never added to any factor or composite", which I read as both.
4. **Should the portal hide anything?** Note 1 of the sheet — *"never show
   factor names or 'validity' labels to the student"* — is a display rule, and
   the portal shows no factor names today. Nothing to do unless something
   shows the taxonomy to respondents that I have not found.

## 13. What has to change — the list

| Layer | Change |
|---|---|
| **Migration** | `V35` — §11 |
| **Entity** | `Question.reverseScored` (false), `Question.inComposite` (true), beside `riskFlag` |
| **DTOs** | `QuestionRequest` + `Boolean reverseScored`, `Boolean inComposite` (null → default); `QuestionResponse` + both |
| **`QuestionController`** | `applyFields` sets both; `firstProblem` gains §6's refusal and §7's type rules — one method, so `/create`, `/update`, `/bulk-create`, `/import` cannot drift |
| **`OptionMqtScoreRepository`** | question id on the scoring projection — §5.1 |
| **`MqtScoringService`** | `planFor`: reversed question set + per-(question, MQT) pivots + excluded question set; `score()`: the transform and the second accumulator — §5 |
| **`AssessmentReportService`** | Scoring Key "as scored" + note column; Questions legend + 2 columns; hide an all-excluded MQ total — §8 |
| **Shape probe / export** | the "excluded but shares an MQT" warning — §5.2 |
| **`ItemBindingService`** | the three lints of §10 |
| **`CanonicalRowExpander`** | raw scores + flags instead of inverted scores — §9 |
| **Template** | `reverseScored`, `inComposite` columns; `parseQuestionRows` reads them like `risk`; template help text and the sample rows |
| **Question form** | two checkboxes beside *Risk flag*, each with a one-line explanation of what it DOES; refused-type states disabled with the reason |
| **ScoreEditor** | when `reverseScored`: an "as scored" column beside the authored scores — the display that makes the flag legible |
| **Questions list, upload previews** | badges: `reversed`, `not in totals` |
| **vitest** | the round trip carries both columns; `parseQuestionRows` reads them |
| **Backend tests** | I3 authored 1..5 with the flag scores identically to I3 authored 5..1 without it; V3 excluded is absent from every total and present on its own MQT; the double-reversal refusal; the type refusals |

## 14. Build order

Each step is useful shipped alone, and after step 1 the flags are as inert as
`riskFlag` — so the order is safe in the sense that matters: nothing changes a
number until step 3, and step 2 is in place before it.

1. **Flags exist and do nothing.** `V35`, entity, DTOs, `applyFields`, the two
   checkboxes, badges, template columns. Ships like the risk flag did.
2. **Refusals.** §6's double-reversal check and §7's type rules in
   `firstProblem`. Before the engine, so no reversed-twice item can be saved
   in the window between.
3. **Engine — reversal.** §5.1, with the test that the two authorings of I3
   agree.
4. **Engine — exclusion.** §5.2, with the test that V3 is on its own MQT and in
   no total.
5. **The raw sheet.** §8.
6. **The AI importer switches.** §9. Last of the numeric changes, because it
   is the one that changes what a downloaded file contains.
7. **The binding lints.** §10.
8. **The ScoreEditor's "as scored" column.** The display; last because it
   depends on nothing and everything above is checkable without it.

## 15. Deliberately not in scope

- **Per-item raw response columns** (`ansv:`). Rule 1.2 — straight-lining
  across all fifteen raw responses — still needs one, and §3.1's rejection of
  that namespace stands. `inComposite` gives validity items a readable value;
  it gives scored items nothing new.
- **Completion time** (rule 1.3) and **retakes** (E1). Item-master plan §9.
- **Per-row reversal on `LIKERT_GRID`.** Refused for now (§7).
- **Inferring the flag from descending scores and rewriting them.** A
  migration nobody asked for, over data that is correct as it stands (§6).
