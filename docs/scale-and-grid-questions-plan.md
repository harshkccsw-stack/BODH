# Question types — MCQ, Linear scale, Likert grid

**STATUS (2026-08-13): BOTH PARTS BUILT AND VERIFIED.**
- **Part 1 — type dropdown + LINEAR_SCALE.** `V14` on staging at 14:57 IST.
- **Part 2 — LIKERT_GRID.** `V15` on staging at 16:0x IST: two new tables and
  the unique-key swap, applied with the old key dropped only after the new
  one existed.
- `./mvnw -B clean test` green at **79** (5 in `QuestionTypeTest`, 4 in
  `LikertGridTest`), both frontends typecheck and build, live smoke run
  against a second instance on 8081 with every `__smoke__` row deleted after.

Use `clean` when the IDE has the project open: its Eclipse compiler writes
into the same `target/classes`, and a stale broken class there made a plain
`mvnw compile` pass while the tests loaded "Unresolved compilation problems".

Decisions you locked on the way: linear scale is fixed **1—5**; its
question-level mapping carries **no number** (the point picked IS the score);
grid rows each name their **own** MQT; grid columns keep the ScoreEditor they
already have; one pick per row for now.

The ask: a **question type dropdown** on the question form, like Google Forms.
Picking a type reshapes the body of the form. Everything above the body —
stem type, question text, risk flag, **Question → MQT scores** — is identical
in every type.

| type | body of the form | MQT mapping levels |
| --- | --- | --- |
| **MCQ** (today) | option list, each with its own scores | question **+ option** |
| **Linear scale** | `from [1] to [5]` + a label for each end | **question only** |
| **Likert grid** | Rows list + Columns list | question **+ option (= column)** |

---

## 1. The dropdown

New column on `Question`, one enum, extensible for the "etc" (`FREE_TEXT`,
`RANKING`, `DROPDOWN`, `DATE` … when they come):

```java
enum QuestionType { MCQ, LINEAR_SCALE, LIKERT_GRID }
```

`MCQ` is the default and is exactly what every existing question already is,
so there is no backfill and no behaviour change for anything already stored.

The dropdown sits at the top of the form body, under the risk flag, above the
Question → MQT editor:

```
Question type   [ Multiple choice (MCQ)  ▾ ]
                  Multiple choice (MCQ)
                  Linear scale
                  Likert scale (grid)
```

Switching type keeps stem/text/risk/question-scores and swaps only the body.
Switching **away** from a type discards that type's body (a confirm prompt when
the discarded body has content), because the bodies are not convertible —
except MCQ ↔ Linear scale, where the scale points simply become editable
options and vice versa.

---

## 2. Linear scale

### 2.1 What it is in the model

A linear scale is a single-choice question whose options **are** the scale
points. `Question` + `Option` already express that perfectly. So:

- the backend **generates** the options from the range — "1", "2", … "5" in
  `sortOrder` — and the author never sees an option editor;
- `selectionRule` stays `NULL` (one pick — "pick 2 points on a scale" is
  meaningless), so `SelectionBounds` says (1, 1) and the submit validator, the
  portal gates and the export cell all work **untouched**;
- the answer is an ordinary `AssessmentAnswer` row pointing at the picked
  point. Nothing on the answer path changes.

Two labels are the only genuinely new data — Google's label under the first
and last point ("Smart" / "Fool" in your screenshot).

### 2.2 Why generate options instead of storing a number

The alternative is no options at all, storing the picked number in the
`AssessmentAnswer.answerText` field that is already reserved. It looks tidier
and it is worse: it needs a new submit payload shape, its own range
validation, its own freeze rule and its own export branch, to store something
the existing option FK stores for free — and it throws away the ability to
turn a scale into an MCQ later. **Generate the options.**

The generated rows are invisible in the UI but real in the database, which is
also what makes the scale render, export and freeze like everything else.

### 2.3 Scoring — as built

You said: *no option-level mapping, only question-level — if an MQT is
mentioned on the question, the selected answer is its score.* So the
question-level mapping supplies **which MQT** and the picked point supplies
**how much**, with no multiplier anywhere:

- the Score editor renders **without its number input** for a linear scale
  (`ScoreEditor hideScore`), so there is nothing to type that could contradict
  the point;
- the stored `QuestionMqtScore` row is written with **score 0** — a
  nomination, never a flat contribution — normalised on write, so a payload
  that carries a number (an older client, a hand-rolled curl) cannot make the
  row read as a flat score;
- the backend **derives and persists** `OptionMqtScore` for every generated
  point: point *n* on MQT *m* scores *n*. Then:

- there is **no new scoring semantic** for the (still unwritten) scoring engine
  to learn — a linear scale sums selected-option scores exactly like every
  other question, which is the rule multi-select already locked in;
- reports and any future score query work with no special case;
- it is rebuilt on every question update, which is already how both score
  levels are owned ("MQT scores do NOT lock").

The alternative — persist nothing and let a future engine read the point's own
text as its value — keeps the table smaller at the cost of a special case in
every consumer. Deriving won.

Worked example, as verified on staging: a scale mapped to one MQT with the
payload carrying `score: 99` comes back as
`question → [(MQT, 0)]`, `points → [("1",[1]), ("2",[2]), … ("5",[5])]`.

### 2.4 Schema — `V14` (applied)

```sql
ALTER TABLE `question`
  ADD COLUMN `question_type`     enum('MCQ','LINEAR_SCALE','LIKERT_GRID')
                                 NOT NULL DEFAULT 'MCQ' AFTER `content_type`,
  ADD COLUMN `scale_low_label`   varchar(100) DEFAULT NULL,
  ADD COLUMN `scale_high_label`  varchar(100) DEFAULT NULL;
```

- `NOT NULL DEFAULT 'MCQ'` fills every existing row in the same statement — no
  separate backfill, no tri-state.
- Physical names are snake_case: the entity writes
  `@Column(name = "questionType")` and Hibernate's `CamelCaseToUnderscores`
  strategy produces `question_type`. Get it wrong and `ddl-auto: validate`
  refuses to boot.
- Wrapped in the `information_schema` probe + `PREPARE` guard V3 and V11 use —
  MySQL commits DDL implicitly, so a re-run must not die on errno 1060.
- `LIKERT_GRID` is already in the enum although nothing writes it yet:
  widening a MySQL enum later is a table rebuild, and an unused value is free.
- **No `scale_min` / `scale_max` columns.** The generated options *are* the
  range, in `sortOrder`; storing it twice is a second source of truth that
  drifts the first time anyone edits an option. The editor reads the range back
  from the first and last option text.
- Port 3307 is the shared staging tunnel — confirm before booting against it.

### 2.5 Backend

- `enums/QuestionType.java`; three fields on `Question`; the same three on
  `QuestionRequest` / `QuestionResponse` / `PortalQuestion`.
- `QuestionController.desiredOptions(request)` — **the** place the type decides
  what the options are, so validation, the freeze comparison, the rebuild and
  the score write can never disagree. MCQ returns the sanitized payload;
  `LINEAR_SCALE` returns the generated points, ignoring whatever options the
  caller sent. `SCALE_FROM`/`SCALE_TO` are the fixed 1—5.
- `validateType` rejects a `selectionRule` (or a stray count) on a scale;
  `firstProblem` chains it with `validateSelection` so `/create`,
  `/bulk-create` and `/update` cannot drift apart on what they check.
- `applyFields` clears both labels on every non-scale type, so switching away
  cannot leave captions behind that no screen would show again.
- Freeze: a type change with answers present is a 409 of its own, checked
  BEFORE the option freeze — switching MCQ → LINEAR_SCALE also replaces the
  options, and "its options are locked" would be a confusing way to say so.

### 2.6 Portal

`question-runner.tsx` branches on `questionType` for the **options block
only**. Every gate (`answered`, `atCap`, auto-next, the index panel) keeps
reading `minSelections`/`maxSelections` and needs no change, because a scale is
a cap-1 question:

```
   Smart                                              Fool
     ○        ○        ○        ○        ○
     1        2        3        4        5
```

The row scrolls horizontally on a narrow phone rather than wrapping, so the
five points always stay in scale order. If a wider scale ever lands, stacking
to a vertical list below ~480px is the change.

---

## 3. Likert grid

### 3.1 Shape

```
Question  questionType = LIKERT_GRID   stem = "How often do you…"
  ├── QuestionRow  1  "Plan my week ahead"        ← rows: the items (NEW table)
  ├── QuestionRow  2  "Change plans at short notice"
  └── Option       1..5  "Never" … "Always"        ← columns: ordinary Options,
                                                     each with its own MQT scores
```

**Columns are `Option` rows**, keeping the per-MQT ScoreEditor they already
have: "Always → Conscientiousness: 5" is an ordinary `OptionMqtScore`.

**Rows are a new `QuestionRow` table** — text and order — plus a **new
`QuestionRowMqt` nomination table** (`questionRowId`, `measuredQualityTypeId`,
unique pair, no payload) saying which MQTs that item measures.

Scoring, then: a pick on row *R* of column *C* credits **only R's MQTs**, each
with the score C carries for that MQT. Two rows measuring different constructs
therefore need every column scored under **both** MQTs — a 5-column grid
spanning 3 MQTs is 15 numbers, not 5. That is the cost you chose over a single
plain number per column, and it buys a column that can be worth different
amounts to different constructs, plus reverse-worded items inside one grid.

This is the one place a grid needs a scoring rule of its own: the sum is over
`(row, column)` pairs filtered by the row's nomination, not over the selected
options alone. `AssessmentAnswer` records the row, so the filter is available
to any future engine.

### 3.2 One pick per row (for now)

`selectionRule` / `selectionCount` keep their exact meaning but **apply per
row**, so the same control gives both Google grid types when it is exposed:

| rule | grid type |
| --- | --- |
| `NULL` | multiple-choice grid — one pick per row (radio) — **the only one v1 exposes** |
| `MAX n` / `MIN n` / `EQUALS n` | checkbox grid — n per row — control hidden for now |

The backend still validates per row through `SelectionBounds` (a grid is
floor 1 / cap 1 per row), so exposing the control later is a UI change, not a
rewrite. The floor is never 0: **every row is mandatory**, which is Google's
"Require a response in each row" permanently on, and consistent with every
placed question being mandatory here.

### 3.3 Schema — `V15`

```sql
CREATE TABLE `question_row` (
  `question_row_id` bigint NOT NULL AUTO_INCREMENT,
  `question_id`     bigint NOT NULL,
  `row_text`        text,
  `sort_order`      int NOT NULL,
  PRIMARY KEY (`question_row_id`),
  KEY `idxQrQuestion` (`question_id`),
  CONSTRAINT `fkQrQuestion` FOREIGN KEY (`question_id`)
      REFERENCES `question` (`question_id`)
);

-- Which MQTs this item measures. No score column: the number comes from the
-- column the respondent picks. Nothing cascades from the MQT side, so
-- deleting a node with nominations attached fails at the FK rather than
-- silently unscoring a grid — the QuestionMqtScore / OptionMqtScore rule.
CREATE TABLE `question_row_mqt` (
  `question_row_mqt_id`     bigint NOT NULL AUTO_INCREMENT,
  `question_row_id`         bigint NOT NULL,
  `measured_quality_type_id` bigint NOT NULL,
  PRIMARY KEY (`question_row_mqt_id`),
  UNIQUE KEY `uqQrmRowMqt` (`question_row_id`,`measured_quality_type_id`),
  KEY `idxQrmMqt` (`measured_quality_type_id`),
  CONSTRAINT `fkQrmRow` FOREIGN KEY (`question_row_id`)
      REFERENCES `question_row` (`question_row_id`),
  CONSTRAINT `fkQrmMqt` FOREIGN KEY (`measured_quality_type_id`)
      REFERENCES `measured_quality_type` (`measured_quality_type_id`)
);

ALTER TABLE `assessment_answer`
  ADD COLUMN `question_row_id` bigint DEFAULT NULL,
  ADD CONSTRAINT `fkAaQuestionRow` FOREIGN KEY (`question_row_id`)
      REFERENCES `question_row` (`question_row_id`);
```

`QuestionRow` is true composition — `cascade = ALL, orphanRemoval = true` from
`Question`, `@OrderBy("sortOrder ASC")`, same as `Option`.

**The unique key is the trap.** Today it is
`(respondentUserId, assessmentId, questionId, optionId)` — one row per selected
option. A grid legitimately repeats `(question, option)` once per row ("Never"
picked on rows 1 and 2), so the key must widen. But **MySQL treats NULLs as
never equal**, so naively appending a nullable `question_row_id` silently stops
the key constraining every *non-grid* answer — and that key is what currently
turns a duplicated submit into a clean 400 instead of a 500 at commit.

Two ways out, in order of preference:

1. **Functional key part** (MySQL 8.0.13+; check `SELECT VERSION()` on staging
   first):
   ```sql
   ALTER TABLE `assessment_answer`
     ADD UNIQUE KEY `uqAaRespondentAssessmentQuestionRowOption`
       (`respondent_user_id`,`assessment_id`,`question_id`,
        ((COALESCE(`question_row_id`,0))),`option_id`);
   ALTER TABLE `assessment_answer`
     DROP INDEX `uqAaRespondentAssessmentQuestionOption`;
   ```
   Strict for grid and non-grid alike. Hibernate `validate` inspects tables,
   columns and types — not index expressions — so it does not trip on this, and
   the H2 test schema is built from the entities and never sees it.
2. On an older server: accept the weaker key and lean on the service-side `Set`
   dedupe that `submit` already does, documented in the entity.

**Add the new key BEFORE dropping the old one** — the old unique key is the
leftmost-prefix index `fkAaRespondent` depends on, and dropping it first is
errno 1553 (the V5 rule).

Because the new key cannot be expressed in JPA, the `@UniqueConstraint` on
`AssessmentAnswer` is replaced by a comment pointing at V15.

### 3.4 Submit path

`PortalSubmitRequest.AnswerEntry` gains a nullable `questionRowId`:

```java
public record AnswerEntry(Long questionId, Long optionId, Long questionRowId) {}
```

Nullable keeps every existing client and payload valid. Pass-1 validation grows:

- MCQ / linear scale + a non-null `questionRowId` → 400;
- grid + a null `questionRowId` → 400;
- the row must belong to the question on the same entry — the sibling of the
  existing "option must belong to the question" rule the schema cannot express;
- the dedupe/bounds map is keyed by `(questionId, questionRowId)` instead of
  `questionId`, so `SelectionBounds.allows` runs **per row**, unchanged;
- "all questions answered" becomes "all questions, and every row of every
  grid" — the missing-list message names rows, not just question ids.

Pass 2 writes one `AssessmentAnswer` per selected cell with `questionRow` set.
Delete-all-then-insert and the flush ordering stay exactly as they are.

### 3.5 Export — shipped in the same change

`buildSheet` keys answers by `questionId` alone, so a grid would collapse 20
rows into one `"Never; Often; Always…"` cell. One column per **row**:

- tag `<placement tag>_R<n>` by row `sortOrder` — `Section_A_Q_3_R1` — derived
  at export time, not stored (rows belong to the question, the tag belongs to
  the placement, and the tag is already regenerated wholesale);
- `ExportSheetResponse.QuestionColumn` gains `questionRowId` + `rowText` so the
  header reads `Q_3_R1 — Plan my week ahead`. **This changes a DTO the export
  page consumes**, so the report frontend ships with it;
- `answersByRespondent` becomes `respondentId → (questionId, rowId) → cells`;
- `findForExport` needs `left join fetch a.questionRow` and the row's
  `sortOrder` in the `order by`, or grid cells come back interleaved.

`tallyAnswersByAssessment` counts **distinct questions**, so a grid counts as
one against a placement count of one — no change.

### 3.6 Portal

`question-runner.tsx` renders a table: sticky first column, horizontally
scrollable, collapsing to one card per row under ~640px. The answer state goes
from `Record<questionId, optionId[]>` to a row-aware key — smallest change is
`Record<questionId, Record<rowKey, optionId[]>>` with `rowKey = 0` for non-grid
— and with it:

- `answered` = **every** row within its bounds;
- the index-panel tick and `answeredCount` use that same predicate;
- the cap warning is per row;
- auto-next fires only when every row is settled (under `MIN`/`MAX` there is no
  settle signal, same as today).

### 3.7 Freeze

Once any answer exists: rows cannot be added, removed, reordered or re-worded,
and `questionType` cannot change — alongside the option and selection-rule
locks that already exist. `existsByQuestionQuestionId` still blocks the delete;
`fkAaQuestionRow` blocks a row delete at the FK as a backstop.

---

## 4. Frontend — one component covers both screens

The lucky part: [`QuestionFormFields`](../bodhassess-app/src/pages/question-bank/question-form-modal.tsx)
is shared by the Question Bank modal **and** the inline editor in
Create Questionnaire step 2 (your screenshots), so the type dropdown and every
body is built **once** and both screens get it.

`QuestionForm` gained (scale fields built; `rows` is phase 2):

```ts
questionType: 'MCQ' | 'LINEAR_SCALE' | 'LIKERT_GRID';
scaleLowLabel: string;  scaleHighLabel: string;   // LINEAR_SCALE
rows: RowForm[];                                  // LIKERT_GRID — not built
```

and the functions beside it branch on the type:

- `formFrom` — reads them back off `QuestionResponse` (`?? 'MCQ'`, so a
  response from a backend without the field still means MCQ);
- `validateQuestionForm` — a scale skips the option rules entirely and checks
  only its two labels;
- `questionPayloadFrom` — a scale sends the labels, **no** option list (the
  backend generates the points) and a null rule, clearing them here as well as
  in the type switch so a form that got there another way still saves;
- `effectiveOptions` / `scalePoints` — the generated points, for everything
  that has to SHOW a scale before it is saved (the preview, the "n options"
  summary on the questionnaire editor).

Bodies:

```
LINEAR SCALE
  Question → MQT mapping  [ MQT ▾ ]        ← no number: the point IS the score
  Scale labels
    1  [ Smart ]
    5  [ Fool  ]
  Respondents will see:   ○ ○ ○ ○ ○  (live preview)
  (no option list, no per-option scores)

LIKERT GRID
  Rows (each names its own MQTs)      Columns (each scored per MQT)
  1  Plan my week ahead  [MQT ▾] ✕    1  Never   ↕ ✕  [Map MQT ▸ score]
  2  I enjoy parties     [MQT ▾] ✕    2  Rarely  ↕ ✕  [Map MQT ▸ score]
  + Add row                           + Add column

  One pick per row. A column has to be scored under every MQT any row names —
  the editor should say which pairs are still missing, the way the current
  ScoreEditor says "n of m MQTs mapped".
```

Also touched: the draft summary line in `create-questionnaire.tsx` (now reads
`Section_A_Q_1 · Linear scale · 5 options`, counted from `effectiveOptions` so
a scale never reads "0 options"), `questionnaire-preview-view.tsx` (the
read-only twin, which the saved-questionnaire preview page gets for free
because it passes `QuestionResponse` straight through), and
`question-bulk-upload.tsx` (§5).

---

## 5. Bulk XLSX upload

**Not extended — the importer writes MCQs only, deliberately.** Every payload
it builds now says `questionType: 'MCQ'` explicitly, which is what every sheet
ever written already meant, so nothing existing changed. A scale has no option
columns to fill and a grid has no flat-row shape at all; both are authored in
the form. If a `type` column is wanted later: `type`, `lowLabel`, `highLabel`
for the scale (the range is fixed), and a hard reject for `LIKERT_GRID` rather
than a half-import.

---

## 6. Deliberately out of scope

- Author-chosen scale ranges (fixed 1—5; two constants and a re-save widen it).
- Checkbox grid — the rule-per-row plumbing is there, the control is not.
- Optional questions and optional rows — the floor is never 0 today.
- "N/A" columns, per-row column overrides, images in grid cells.
- `FREE_TEXT` / `RANKING`: `AssessmentAnswer` reserves `answerText` and
  `rankOrder` for them, and the type dropdown is where they will plug in.

---

## 7. Sequencing

| | scope | outcome |
| --- | --- | --- |
| **Phase 1 — dropdown + linear scale** | V14, 3 entity fields, option generation + score derivation, `QuestionFormFields` type switch and scale body, portal renderer, preview | **done** — nothing on the answer path moved |
| **Phase 2 — Likert grid** | V15 (2 new tables + answer column + unique-key swap), `QuestionRow` + `QuestionRowMqt`, submit validator, export sheet + its DTO, grid body, portal table | **done** — the unique key and the export DTO were the careful bits; both are covered by tests |

Verification per phase, per the standing loop: `./mvnw -B clean test`, then
`npm run typecheck && npm run build` in **both** frontends, then a live
`__smoke__` curl run proving the error paths, deleted afterwards. Phase 2's
error paths — grid answer with no rowId, a row from another question, a rowId
on a question with no rows, per-row bounds breach, half a grid — are covered
both in `LikertGridTest` and by the live run.

The unique key was proven on MySQL itself, not only on H2: the same column on
two rows inserts fine, a duplicate `(question, row, option)` is refused 1062,
and **so is a duplicate with a NULL row** — the guarantee the `COALESCE` key
exists to preserve, and the one a naive nullable column would have lost.

---

## 8. Decisions taken while building (say the word to change any)

1. **Rows nominate MANY MQTs, not one.** The row editor is the same
   ScoreEditor used everywhere with its score field hidden. A single-MQT
   dropdown would be simpler, but the table supports many either way and "this
   item loads on two factors" is a real instrument.
2. **Missing (column, MQT) pairs WARN, they do not block.** A half-scored grid
   is a legitimate draft and the backend does not refuse one either; the form
   counts the gaps and says so in amber.
3. **A grid REJECTS a selection rule** rather than ignoring one, so nothing
   can store a cap that no screen honours.
4. **Row TEXT freezes once answers exist; row → MQT nominations never do.**
   The text is what an answer points at; the nomination is scoring, and
   scoring has always been rebuilt on every save.
5. **Grid columns stay in the option editor**, relabelled "Columns", so column
   scoring is the ScoreEditor the author already knows.

Still open, deliberately: exposing the checkbox-grid control (n picks per
row). It is a UI change only — `SelectionBounds` already runs per row, and the
backend refuses a rule until the UI exists to honour it.
