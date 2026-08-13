# Question types — MCQ, Linear scale, Likert grid

**STATUS: PROPOSAL v2 — nothing built.** Rewritten 2026-08-13 after your
clarification. v1 of this doc guessed at the scoring model and guessed wrong;
what you described is simpler, and this version follows it.

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

### 2.3 Scoring — the one open decision

You said: *no option-level mapping, only question-level*. So the question-level
mapping supplies **which MQT**, and the picked point supplies **how much**.
The number in the existing question-level Score editor then has to mean
something new. Three readings:

| | question-level number means | picking "4" contributes |
| --- | --- | --- |
| **(a) weight — recommended** | multiplier, default `1` | `4 × weight` |
| (b) ignored | nothing; the field is hidden for this type | `4` |
| (c) as today | flat, answer-independent score | `score`, regardless of pick — makes a scale pointless |

**(a)** is (b) plus a knob, and it costs one relabel: for `LINEAR_SCALE` the
Score editor's number input is titled **Weight** and defaults to `1`.

**How it is stored (recommended):** the backend **derives and persists**
`OptionMqtScore` for every generated point — point *n* on MQT *m* scores
`n × weight(m)` — from the question-level mapping, ignoring any option scores
in the payload. Then:

- there is **no new scoring semantic** for the (still unwritten) scoring engine
  to learn — a linear scale sums selected-option scores exactly like every
  other question, which is the rule multi-select already locked in;
- reports and any future score query work with no special case;
- it is rebuilt on every question update, which is already how both score
  levels are owned ("MQT scores do NOT lock").

The alternative — persist nothing and let the future engine compute
`value × weight` — keeps the table smaller and defers the decision, at the
cost of a special case in every consumer. I recommend deriving.

### 2.4 Schema — `V14`

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
- Wrap it in the `information_schema` probe + `PREPARE` guard V3 and V11 use —
  MySQL commits DDL implicitly, so a re-run must not die on errno 1060.
- **No `scale_min` / `scale_max` columns.** The generated options *are* the
  range, in `sortOrder`; storing it twice is a second source of truth that
  drifts the first time anyone edits an option. The editor reads the range back
  from the first and last option text.
- Port 3307 is the shared staging tunnel — confirm before booting against it.

### 2.5 Backend

- `enums/QuestionType.java`; three fields on `Question`; the same three on
  `QuestionRequest` / `QuestionResponse` / `PortalQuestion`.
- `QuestionController`: for `LINEAR_SCALE`, **generate** the options from
  `scaleFrom`/`scaleTo` rather than trusting the payload's list, reject a
  `selectionRule`, require `2 ≤ points ≤ 11` (Google's 0/1 → 2…10), require
  TEXT content type, trim labels to 100.
- Freeze: `questionType` joins `selectionChanged`/`optionsChanged` — once an
  answer exists the type is locked, and changing the range is already blocked
  because it changes the option list.

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

Stacks to a vertical radio list under ~480px so a 10-point scale stays usable
on a phone.

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

**Columns are `Option` rows.** That is the whole trick, and it is why you get
option-level mapping for free: "Always → Conscientiousness: 5" is an ordinary
`OptionMqtScore`, authored with the ScoreEditor that already exists.

**Rows are a new `QuestionRow` table** and carry text and order only — no
scoring of their own.

Scoring is then, with **zero new machinery**: a respondent picks one column per
row, each pick is an `AssessmentAnswer` carrying that column's scores, and the
question contributes their sum — the exact rule multi-select already defines
("a question contributes the SUM of every selected option's MQT scores").

> **The one thing to accept consciously:** because the columns are shared, every
> row of one grid feeds the **same** MQTs. A grid is one construct measured by
> N items — the normal case. Two constructs, or a reverse-worded item that needs
> flipped column scores, means **two grids**. Per-row MQT overrides would be a
> later feature (and a genuinely more complex one — see §6).

### 3.2 Radio grid vs checkbox grid — already solved

`selectionRule` / `selectionCount` keep their exact meaning but **apply per
row**, which gives both Google grid types from the control that already exists:

| rule | grid type |
| --- | --- |
| `NULL` | multiple-choice grid — one pick per row (radio) — the default |
| `MAX n` / `MIN n` / `EQUALS n` | checkbox grid — n per row |

`SelectionBounds` is reused untouched. The floor is still never 0: **every row
is mandatory**, which is Google's "Require a response in each row" permanently
on, and consistent with every placed question being mandatory here.

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

### 3.5 Export — must ship in the same change

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
Create Questionnaire step 2 (your screenshots), so the type dropdown and all
three bodies are built **once**.

`QuestionForm` gains:

```ts
questionType: 'MCQ' | 'LINEAR_SCALE' | 'LIKERT_GRID';
scaleFrom: string; scaleTo: string;          // LINEAR_SCALE
lowLabel: string;  highLabel: string;
rows: RowForm[];                             // LIKERT_GRID  { rowText }
```

and the three functions beside it branch on the type:

- `formFrom` — reads them back off `QuestionResponse`;
- `validateQuestionForm` — scale range 2…11 / at least 2 rows and 2 columns,
  mirroring the backend messages so problems show inline instead of as a 400;
- `questionPayloadFrom` — for `LINEAR_SCALE` sends the range and labels and
  **no** option list (the backend generates it); for `LIKERT_GRID` sends rows
  plus columns-as-options with their scores.

Bodies:

```
LINEAR SCALE
  From [ 1 ▾ ]  to [ 5 ▾ ]
  Label for 1  [ Smart ]
  Label for 5  [ Fool  ]
  (no option list, no per-option scores — question-level scores only)

LIKERT GRID
  Rows                          Columns
  1  Plan my week ahead  ↕ ✕    1  Never    ↕ ✕   [Map MQT ▸ scores]
  2  Change plans …      ↕ ✕    2  Rarely   ↕ ✕   [Map MQT ▸ scores]
  + Add row                     + Add column
  Answers per row  [ One (radio) ▾ ]     ← the existing selectionRule control
```

Also touched: the draft summary line in `create-questionnaire.tsx`
(`0 options · new` → shows the type), `questionnaire-preview-view.tsx` (the
read-only twins of both bodies), and `question-bulk-upload.tsx` (§5).

---

## 5. Bulk XLSX upload

- **Linear scale: supported.** Four optional columns — `type`, `scaleFrom`,
  `scaleTo`, `lowLabel`, `highLabel`. No option columns; the question-level
  `scores` column already exists. A sheet with no `type` column is MCQ, so
  every existing sheet keeps working.
- **Grid: not in v1.** Rows × columns × scores does not fit a flat row and
  needs its own tab-per-question design. The importer should **reject** a
  `type=LIKERT_GRID` row with a clear message rather than half-import it.

---

## 6. Deliberately out of scope

- Per-row MQT overrides / reverse-scored rows inside one grid (use two grids).
- Optional questions and optional rows — the floor is never 0 today.
- "N/A" columns, per-row column overrides, images in grid cells.
- `FREE_TEXT` / `RANKING`: `AssessmentAnswer` reserves `answerText` and
  `rankOrder` for them, and the type dropdown is where they will plug in.

---

## 7. Sequencing

| | scope | risk |
| --- | --- | --- |
| **Phase 1 — dropdown + linear scale** | V14, 3 entity fields, option generation + score derivation, `QuestionFormFields` type switch and scale body, portal renderer, preview, XLSX columns | **low** — nothing on the answer path moves |
| **Phase 2 — Likert grid** | V15 (new table + answer column + **unique-key swap**), `QuestionRow`, submit validator, export sheet + its DTO, grid body, portal table | **medium** — the unique key and the export DTO are the two careful bits |

Verification per phase, per the standing loop: `./mvnw -B test`, then
`npm run typecheck && npm run build` in **both** frontends, then a live
`__smoke__` curl run proving the error paths (scale with a selection rule, grid
answer with no rowId, row from another question, per-row bounds breach),
deleted afterwards.

---

## 8. Decisions I need from you

1. **Linear-scale scoring** — §2.3: question-level number = **weight** (default
   1, contribution = `point × weight`), and the backend derives/persists the
   per-point `OptionMqtScore`? Or hide the number entirely (contribution = the
   point)?
2. **Scale range** — allow starting at 0 (Google allows 0 or 1) and up to 10?
3. **Grid: same MQTs for every row** is inherent to column-level mapping
   (§3.1) — confirm that's acceptable and reverse-worded items go in a second
   grid.
4. **Checkbox grid** (n picks per row) — expose the control, or lock every grid
   to one pick per row for now?
5. **Ship phase 1 alone first**, or hold both and release together?
6. **Staging DDL** — V14/V15 land on the shared 3307 database the moment the app
   boots. Confirm the window, or should the migrations wait?
