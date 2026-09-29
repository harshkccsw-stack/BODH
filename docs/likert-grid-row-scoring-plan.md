# Likert grid — rows carry the MQ/MQT scores

> **Status: BUILT 2026-09-29** — `V37`, engine, editor, tests, live smoke; Phase 2
> (§7) not built. The four §11 decisions were taken as recommended, except
> that no per-row "omitted score" exists: the body parser refuses a missing
> score, so the form always sends one. Originally written after the
> discussion of a "question with rated sub-questions". The first draft of that
> discussion proposed a new `SCALE_GROUP` type whose sub-questions are bank
> items; it was dropped in favour of this, which is a change to the grid that
> already exists (`docs/scale-and-grid-questions-plan.md` §3) and already
> renders the wanted screen. §11 lists the decisions to veto.

## 0. Decisions taken in the discussion

| Question | Decision |
|---|---|
| New type or the existing grid? | **The existing `LIKERT_GRID`.** Rows are the sub-questions, columns are the scale. The screen in the portal is already right. |
| Where does the MQ/MQT mapping live? | **On the ROW, with a score**, exactly like an MCQ option's mapping: `(row, MQT, score)`. |
| What does the column the respondent picks do? | **It is the ANSWER and nothing else.** It is stored, exported per row, and available to report formulas. It does not feed the MQ/MQT score. Your call, "fine for now". |
| Custom text columns? | **Kept.** Columns may be `1..9` or `Never…Always`; the grid does not care. |
| Column scoring (today's rule)? | **Kept in the engine, optional in the editor** — see §2 and §11.2. Nothing already stored changes meaning. |

## 1. What this means, in one paragraph

A grid row's score on an MQT is earned by **answering the row**, whatever is
picked. Two respondents who complete the same grid get the same MQ/MQT numbers
from it, whichever columns they chose. The rating itself is not lost: every
row already exports as its own column (`Section_A_Q_3_R1`, `_R2`, …), the same
column is in Data Studio as `ans:<tag>_R<n>`, and the expression engine
coerces a numeric cell to a number
(`ExpressionEvaluator.coerce`), so a report formula such as
`Q_3_R1 + Q_3_R2` computes over the ratings today. The MQ/MQT column is
where the row's mapping shows; the answer column is where the rating shows.

If the rating should one day feed the MQ/MQT score, the row score becomes a
weight multiplied into the point picked. That is a one-line engine change
with **no schema change**, because the score column this plan adds is the
weight. Nothing here has to be undone for that.

## 2. The scoring rule (engine)

`MqtScoringService.score` today, for a grid answer on row *R* of column *C*:
add `OptionMqtScore(C, m)` for every *m* that *R* nominates. It becomes:

1. **Column part — unchanged.** `OptionMqtScore(C, m)` for every *m* that *R*
   names. A grid whose columns carry no scores adds nothing here.
2. **Row part — new.** `QuestionRowMqt(R, m).score` for every *m*, added
   **once per answered row**, not once per selected cell. A checkbox grid
   (per-row `MAX n`, still not exposed) must not multiply it, which is the
   same reason the question-level score is added once per answered question.

Both parts filter through the row's nominations, and the nomination is now
"has a `QuestionRowMqt` row", score 0 included. Every existing grid keeps its
numbers: their row scores are 0 (§3), and their column scores still apply.

`ScoringPlan.rowNominations` changes from `rowId → Set<mqtId>` to
`rowId → Map<mqtId, score>`; the filter is the key set. `planFor` reads the
score in the projection (`QuestionRowMqtRepository.findForQuestionnaire`
gains the third column). Still five queries, once per export.

**The question-level score on a grid** (the "Question → MQT scores" editor at
the top of every type) is untouched: flat, once per answered question.

## 3. Schema — `V37__question_row_mqt_score.sql`

```sql
-- Guarded (V11/V14/V36 pattern): MySQL commits DDL implicitly.
SET @has_score := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question_row_mqt'
      AND COLUMN_NAME  = 'score'
);
SET @ddl := IF(@has_score > 0, 'SELECT 1',
    'ALTER TABLE `question_row_mqt` ADD COLUMN `score` DOUBLE NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
```

- `DOUBLE`, not `DECIMAL`: the entity field is a plain `double` and Hibernate
  validate compares the mapped type (the V25 reasoning, verbatim).
- `DEFAULT 0` is the correct backfill for every existing row, argued rather
  than assumed: no row has ever carried a score, so 0 — "nomination only" —
  is exactly what each one has always meant. No `UPDATE` step.
- No other table changes. `assessment_answer`, the unique key, the placement
  table and both other score tables are untouched.
- **Before writing the file:** `ls`/`ss -ltnp` to confirm which database
  `DB_PORT` points at. A `V<n>.sql` written into `db/migration/` is applied
  by the IDE-run server within seconds, on whichever database that is. Use the
  Write tool — the sandbox refuses Bash writes into that directory.

## 4. Backend

| File | Change |
|---|---|
| `model/scoring/QuestionRowMqt` | `double score` (`@Column(name = "score", nullable = false)`), getter/setter. Javadoc: no longer "the odd one out". |
| `dto/QuestionRowRequest` | `List<Long> measuredQualityTypeIds` → `List<MqtScoreRequest> mqtScores`. Same shape as an option's. |
| `dto/QuestionRowResponse` | `List<MqtRefResponse> mqts` → `List<MqtScoreResponse> mqts`. `MqtRefResponse` then has no user — park it in `bodh/deleted/`. |
| `QuestionController.sanitizedRows` | dedupe + round through the existing `dedupe()` — the ONE place a score is rounded — instead of `distinct()` on ids. A row survives on text OR a mapping, as now. |
| `QuestionController.referencedMqtIds` | collect from `row.mqtScores()`. |
| `QuestionController.writeScores` | set the score on each `QuestionRowMqt`. Rebuilt on every save, as all three levels are. |
| `QuestionController.toResponse` | group by row → `MqtScoreResponse`. |
| `repository/scoring/QuestionRowMqtRepository` | projection adds `r.score`. Javadoc: "the FILTER" becomes "the filter and the row's own score". |
| `service/MqtScoringService` | §2. |
| `service/AssessmentReportService.buildScoringKey` | per row, one `ScoringKeyEntry(rowTag, stem, rowText, null, mqt, path, score)` for each row score, before the column entries. The DTO already allows a null option (the question-level entry uses it). |
| `docs/question-types-schema.md` §1–2, `scale-and-grid-questions-plan.md` | the "no score column by design" sentences, and a status line pointing here. |

Not touched: submit validation, `AssessmentSubmissionWriter`, the export
sheet's columns, Data Studio, `PortalContentService`, the portal DTOs,
MemoryMesh sync (it ships no scoring).

## 5. Dashboard form (`question-form-modal.tsx`)

- **Row editor:** the `ScoreEditor` under each row drops `hideScore`. It is
  then the MCQ option editor, number and all — "Row 1 measures: Adaptability
  · 3".
- **Columns section on a grid:** keep the label "Columns (the rating scale)";
  the per-column `ScoreEditor` moves under a collapsed "Score the columns too
  (optional)" disclosure, closed by default, open when any column already has
  a score (so an existing grid shows what it has). See §11.2 for the
  alternative.
- **`gridScoringGaps`** (the amber "n (column, MQT) pairs unscored" warning)
  goes: it asserted the column rule. The row editor's own "n of m MQTs
  mapped" is the summary now.
- **Hint text** under the rows: "Each row scores the MQTs it names when it is
  answered. The column picked is recorded as the answer." Under the columns:
  "Columns are what respondents pick. They can be numbers or words."
- `questionApis.ts`: `QuestionRowPayload.measuredQualityTypeIds` →
  `mqtScores: MqtScorePayload[]`; `QuestionRowResponse.mqts: MqtScoreView[]`;
  `MqtRef` goes with `MqtRefResponse`. `formFrom` reads the score back;
  `liveRows` keeps entries with an MQT id, score included.
- `create-questionnaire.tsx` draft summary and `questionnaire-preview-view`
  are unchanged; neither prints scores.
- The XLSX importer still writes MCQs only.

## 6. Portal

**No change in Phase 1.** The screen in the screenshot is the delivered
grid; the answer payload and the resume path are untouched.

## 7. Phase 2 (optional, later): "Number range" columns

Typing `1 … 9` as nine columns works today and is what the screenshot did.
If wanted, a grid could instead take a range: the grid reuses the four scale
fields already on `Question` (`scaleFrom/To`, the two end captions), its
columns are GENERATED as the points exactly as `LINEAR_SCALE` generates
options (`desiredOptions`), the column score editor is hidden, and the portal
prints the captions above the first and last column. Costs: `desiredOptions`
and `applyFields` branch on "grid with a range", `validateType` reuses the
range checks, the form gains a "Custom labels / Number range" switch, one
portal tweak. No schema. Deliberately not in Phase 1.

## 8. Freeze rules

Unchanged, and the new score follows the existing exception: **row text
freezes once answers exist; a row's MQTs — and now their scores — never do.**
Scoring has always been rebuilt on every save (`rowsAreLockedOnceAnswersExist-
ButTheirMqtsAreNot` already proves the nomination half).

## 9. Tests and verification

- `LikertGridTest.rowsNameTheirOwnMqtsAndColumnsCarryTheScores` → rows carry
  their scores; columns may still. Assert the response echoes the row score,
  and that a payload with `score` omitted stores 0.
- `MqtScoringExportTest.everyQuestionTypeAddsUpAndRollsUpTheTree`: add a grid
  with row scores and unscored columns; assert the MQT own score equals the
  sum of the answered rows' scores, regardless of the column picked, and that
  a grid with BOTH row and column scores adds both.
- Scoring key: a row entry with a null option text precedes the column
  entries for that row.
- Then the standing loop: `./mvnw -B clean test` (421 green today), both
  frontends `typecheck && build`, live `__smoke__` curl: create a 2-row 1–9
  grid with row scores, submit two respondents picking 1 and 9 everywhere,
  export, assert identical MQT scores and different `_R<n>` cells; delete.

## 10. Known gaps this does not close

- **A row cannot be bound to a report item code.** `ReportItemBinding` keys
  on `questionId`; an Items_Master listing grid rows as `I1…I9` does not
  match. Fix later: nullable `questionRowId` on the binding plus rows as
  matcher candidates. The row's export column exists already, so formulas can
  reference rows now.
- **Reverse-scored rows** are not modelled. The pending
  `question-scoring-flags-plan.md` (unbuilt) refuses grids; a per-row flag is
  the natural extension once row scores exist.
- **Rows are not bank items:** not reusable on their own, no IRT fields.

## 11. Decisions to veto

1. **Row score is FLAT** — earned by answering the row, the pick ignored.
   Confirmed in discussion. §1 says what that means; the weight × point
   rule stays one line away.
2. **Column scoring: keep it, collapsed** (my pick) — or **remove it from the
   grid editor**. Removing needs a data decision: existing grids' column
   scores either linger unseen until the next save silently drops them, or
   V37 also deletes `option_mqt_score` rows belonging to grid columns. That
   delete is a write to whichever database is live, so it is asked, not
   assumed.
3. **Phase 2 number-range columns:** later, unless you want it in the same
   change.
4. **Score field label:** "score", matching the MCQ option editor, not
   "weight".
