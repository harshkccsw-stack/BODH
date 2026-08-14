# MQ / MQT scores in the Reports raw-data export — plan

Status: **built** (2026-08-14) — `MqtScoringService`, the two export endpoints'
grown payload, and the five-sheet workbook. 81 backend tests green
(`MqtScoringExportTest` is new), frontend typecheck + build green, live
read-only calls verified against the staging MySQL. The one thing not proven
live is the arithmetic on MySQL, because no scored assessment on staging has a
COMPLETED attempt yet — that path is covered end-to-end on H2 instead, and the
sums are pure Java either way.

Reports Hub → "Export Raw Data" (header button and the per-assessment button
in the respondent popup) must ship each respondent's MQ / MQT scores next to
their answers.

## 0. The fact that shapes everything

There is **no scoring engine in spring-social**. `QuestionMqtScore`,
`OptionMqtScore` and `QuestionRowMqt` are written by `QuestionController`
(`writeScores`) and read back only by the question editor. Nothing has ever
turned an answer into a number. So this is *the scoring engine*, with the
export as its first consumer — which is why the compute does not live inside
`AssessmentReportService.buildSheet` (see §3).

The luck: `buildSheet` already loads exactly what the engine needs.
`AssessmentAnswerRepository.findForExport` fetches every answer with
`question`, `option` and `questionRow` eager, for every COMPLETED respondent
in one query. The scoring is in-memory over rows already in hand.

## 1. Scoring rules (locked)

A respondent's score on MQT *m* for one assessment is the sum of:

| source | contributes |
| --- | --- |
| every selected `Option` | `OptionMqtScore(option, m)` |
| every question the respondent **answered at all** | `QuestionMqtScore(question, m)` — **once**, not once per selected option |

Per question type:

- **MCQ** — sum of the selected options' scores, plus the question-level flat
  score once. Multi-select sums every selected option (CLAUDE.md's locked
  rule); the flat part is still added exactly once.
- **LINEAR_SCALE** — identical code path with no special case: the generated
  points carry derived `OptionMqtScore` rows (point *n* scores *n*) and the
  question-level row is stored `0` on write, so "add the flat score" is a
  no-op by construction.
- **LIKERT_GRID** — a pick on row *R* of column *C* credits **only the MQTs
  `R` nominates** (`QuestionRowMqt`), each with the score `C` carries for that
  MQT. The question-level flat score is added once if the respondent answered
  any row of the grid.

Rollups — the MQT tree is self-referencing to any depth and a score may attach
at any node, not just leaves:

- **own** = the sum above, for that node alone
- **subtree total** = own + every descendant's own
- **MQ total** = sum of the MQ's root nodes' subtree totals

All three are exported (§4).

### Consistency rules

- An answer whose question is **no longer placed** in the questionnaire is
  already skipped for its answer column; it must be skipped for scoring too,
  or a total counts a question the sheet does not show.
- An MQT referenced by the questionnaire that the respondent scored nothing on
  exports **`0`, not blank** — only COMPLETED attempts are exported, so the
  absence is a real zero.
- Which MQTs appear at all: the union of every MQT referenced by this
  questionnaire's placed questions — question-level, option-level and grid-row
  nominations — ordered by MQ name, then tree order (`sortOrder`, depth-first).

### Labels

MQT names are deliberately not unique ("Attention" can sit under several MQs),
so every label is the **full path** — `Cognition › Verbal › Vocabulary`. Ids
travel in the DTO for anything that needs to resolve exactly.

## 2. Endpoints — none new

The two existing export endpoints grow their payload:

- `GET /api/reports/export/assessment/{assessmentId}?organizationId=`
- `GET /api/reports/export/assessment/{assessmentId}/respondent/{respondentUserId}`

A separate `/scores` sibling was rejected: two round trips resolving the
COMPLETED-respondent set independently means a respondent who submits between
the calls makes the two halves of one workbook disagree. One payload, one
snapshot. If size ever bites, add `?includeScores=false` — do not split the
endpoint.

`ExportSheetResponse` gains:

```java
List<MqColumn>  mqColumns;   // (measuredQualityId, name)
List<MqtColumn> mqtColumns;  // (measuredQualityTypeId, measuredQualityId,
                             //  path, name, depth, parentId, hasChildren)
```

plus `List<ScoringKeyEntry> scoringKey` (questionTag, stem, rowText,
optionText, mqtId, mqtPath, score) — the audit trail sheet 4 renders; and on
`ExportRow`:

```java
Map<Long, Integer> mqtScores;  // mqtId → own score
Map<Long, Integer> mqtTotals;  // mqtId → subtree total
Map<Long, Integer> mqScores;   // mqId  → MQ total
```

Keyed-lookup maps, same convention `demographics` already uses — the frontend
walks the column lists and looks each key up.

## 3. Backend work

**New `MqtScoringService`** (`service/`), not a private method on
`AssessmentReportService`:

- `ScoringPlan planFor(Long questionnaireId)` — builds, once per export, the
  three score maps + the MQT forest (paths, parents, subtree membership).
- `Scores score(List<AssessmentAnswer> answersOfOneRespondent, ScoringPlan)` —
  returns own / subtree / MQ maps.

`AssessmentReportService.buildSheet` calls `planFor` once and `score` per row.
It is a separate service because the results screen, the PDF report and
BodhLens all want this same number, and burying it in a private sheet builder
guarantees someone reimplements it differently.

Which MQTs get a column: the referenced ones AND their ancestors. An ancestor
is needed for its path label and for a subtree total to mean anything; an
unrelated sibling branch would only add a column that is 0 for everyone.

**New repository queries** (5 as built — all questionnaire-scoped, joined
through `QuestionnaireQuestion`, so cost is per export, not per respondent;
the fifth is `findPlacedQuestionIds`, the membership check):

1. `QuestionMqtScoreRepository.findForQuestionnaire(questionnaireId)`
2. `OptionMqtScoreRepository.findForQuestionnaire(questionnaireId)`
3. `QuestionRowMqtRepository.findForQuestionnaire(questionnaireId)`
4. `MeasuredQualityTypeRepository` is currently **empty** — add
   `findByMeasuredQuality_MeasuredQualityIdIn(ids)`, fetching the full tree of
   every involved MQ so paths and subtree totals are built in memory (these
   trees are small).

No schema change, no migration.

## 4. Workbook (frontend)

`downloadExportSheet` in `pages/Reports/reportApis.ts` goes from 2 sheets to 4.
`ReportsHub.tsx` needs **no change** — both handlers already hand the response
straight to it.

1. **Raw Data** — today's matrix, then appended per MQT in column order:
   - `<path>` = own score (every MQT)
   - `<path> (total)` = subtree total (only MQTs that have children — for a
     leaf the two are identical and a second column would be noise)
   - `<MQ> (total)` = MQ total, one per MQ
   One respondent stays one row, so pivots and SPSS imports keep working.
2. **MQ-MQT Scores** — long format, one row per respondent × MQT:
   `Serial ID | Name | Email | Organization | MQ | MQT path | MQT | Own |
   Subtree total | MQ total`. This is the readable one, and the main sheet of
   a single-respondent export (it is what v2's "MQT Scores" sheet was).
3. **MQ Totals** — respondent × MQ, wide. Free once (2) exists.
4. **Questions** — today's tag → stem legend, now with the grid row's text.
5. **Scoring Key** — `questionTag | question | grid row | option | MQT path |
   score`, so a practitioner can audit where any number came from. A
   question-level score shows as "(any answer)"; grid rows list only what the
   row's nomination lets them earn.

Sheets 1–3 and 5 are skipped when the questionnaire scores nothing, so an
unscored export is exactly the workbook it was before.

Also fix while in there: the frontend `QuestionColumn` interface is missing
`questionRowId` / `rowText`, which the backend has sent since the grid work.

## 5. Out of scope (deliberately)

- **Max-possible / percentage / percentile columns.** Wanted eventually — a
  raw 14 means nothing without a ceiling — but the ceiling depends on
  selection bounds (a `MAX 3` multi-select's max is its top-3 option scores,
  not one) and on per-row nominations for grids. Own decision set; the DTO
  above takes it additively later.
- Norms, banding, interpretation text.
- Scoring anything that is not COMPLETED.

## 6. Verification

1. `cd spring-social && ./mvnw -B test` — **81 green**. `MqtScoringExportTest`
   drives one respondent through all three types over a two-level tree and
   asserts the sums: multi-select summing, the flat score counted ONCE,
   LINEAR_SCALE's zero flat row, the grid crediting only its row's nominated
   MQTs, the subtree rollup, an unplaced question's score dropping out of the
   totals, and an unscored questionnaire exporting empty rather than 500.
2. `cd bodhassess-app && npm run typecheck && npm run build` — green.
3. Live read-only curl against the running `localhost:8080` (staging MySQL):
   the new fields serialize, all five plan queries translate (the export of
   the Big Five demo returns 5 MQT columns and 50 scoring-key edges, reverse
   scoring and all), and an unscored assessment comes back with empty lists.

Not done: a live WRITE smoke. No scored assessment on staging has a COMPLETED
attempt, so proving the arithmetic there would mean creating a `__smoke__`
respondent and submitting an attempt on a database other people are using.
The sums are covered on H2 and are pure Java; ask if you want it run anyway.

**Caution learned here:** `./mvnw compile` can no-op on a stale target and
report BUILD SUCCESS over a genuine compile error — `clean compile` (or the
test run) is what actually tells you.
