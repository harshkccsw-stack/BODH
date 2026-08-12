# Multi-option selection — how many options a respondent may pick

**BUILT** (2026-08-12), except the live smoke in §13.3, which is waiting on a
decision about the shared staging database — V11 lands there the moment the
app boots against port 3307, and MySQL DDL cannot be rolled back.
`./mvnw -B test` is green at 70 (5 new in `QuestionSelectionRuleTest`), and
both frontends typecheck and build.

Today every question is one-option-one-answer: the portal renders radios, the
submit endpoint rejects a second answer for the same question, and
`Question.java` says outright that *how* a question is attempted is
deliberately not modelled. This adds that axis, in the narrowest form that is
useful: an author says **how many** of the options a respondent must pick.

The control on the question form is a dropdown plus an integer:

```
Selection      [ Single choice        ▾ ]      ← default, no integer shown
                 Single choice
                 Max     [ 3 ]   pick up to 3
                 Min     [ 2 ]   pick at least 2
                 Equals  [ 3 ]   pick exactly 3
```

"Single choice" is not a fourth condition — it is the **absence** of a rule,
which is what every existing question and every existing upload sheet already
means. That is what keeps this change backward compatible with no backfill.

---

## 1. The whole feature in one table

Two nullable columns on `Question`, always set or cleared together:

| `selection_rule` | `selection_count` | means | floor | cap |
| --- | --- | --- | --- | --- |
| `NULL` | `NULL` | single choice (today) | 1 | 1 |
| `EQUALS` | n | exactly n | n | n |
| `MAX` | n | up to n | 1 | n |
| `MIN` | n | at least n | n | option count |

**Floor and cap are the only derived values anything downstream needs.** One
helper computes them, and it is reused by the submit validator, the portal's
Next gate, the portal's tick handler and the review card in the bulk upload.
Every rule below is stated in terms of those two numbers, so there is no
second place where "what MAX means" is decided.

`isMultiSelect()` is simply `selectionRule != null`. There is no separate
`responseType` column: it would be derivable from the rule, and a derivable
column is a second source of truth that can drift. When `FREE_TEXT` and
`RANKING` eventually arrive (`AssessmentAnswer` already reserves `answerText`
and `rankOrder` for them) they are a **different** axis — payload shape, not
cardinality — and get their own column then.

---

## 2. Storage needs no change at all

`AssessmentAnswer` is already documented as "one row per selected option", and
its unique key is `(respondentUserId, assessmentId, questionId, optionId)` —
several rows for one question have always been legal. Two things downstream
were already written for this and need nothing:

- `AssessmentAnswerRepository.findForExport` orders by `o.sortOrder` and its
  javadoc already says "multi-select and ranking questions return several rows
  for the same question";
- `AssessmentReportService.buildSheet` already joins a question's cells with
  `"; "` in option order.

The work is entirely in the **write path** and the **two UIs**.

---

## 3. Schema — `V11__add_question_selection_rule.sql`

```sql
-- Guard first (V3 pattern): MySQL commits DDL implicitly, so a plain
-- ADD COLUMN over a column a manual patch already added fails with errno
-- 1060 and cannot roll back. Both columns are added by the same statement,
-- so probing for selection_rule covers both.
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'question'
      AND COLUMN_NAME  = 'selection_rule'
);

SET @ddl := IF(@col_exists > 0, 'SELECT 1',
  'ALTER TABLE `question`
     ADD COLUMN `selection_rule`  enum(''MIN'',''MAX'',''EQUALS'') DEFAULT NULL AFTER `content_type`,
     ADD COLUMN `selection_count` int DEFAULT NULL AFTER `selection_rule`,
     ADD CONSTRAINT `ckQuestionSelection` CHECK (
          (`selection_rule` IS NULL     AND `selection_count` IS NULL)
       OR (`selection_rule` IS NOT NULL AND `selection_count` >= 1))');

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
```

Notes that will otherwise cost an hour each:

- **Physical names are snake_case.** The entity writes
  `@Column(name = "selectionRule")`, which is a *logical* name that
  Hibernate's `CamelCaseToUnderscores` strategy turns into `selection_rule` —
  same as `content_type` and `risk_flag` in V1. Get it wrong and
  `ddl-auto: validate` refuses to boot.
- **Both columns nullable, so no backfill.** Existing rows are single choice
  by being NULL, which is the meaning we want. The "add NULL → UPDATE →
  MODIFY NOT NULL" rule does not apply.
- The MySQL `enum(...)` column type mirrors how `content_type` is already
  stored; Hibernate's validator is happy with it because it already is.
- The CHECK is free insurance against a half-set pair. Hibernate's `validate`
  only inspects tables/columns/types, so it does not trip on it, and the H2
  test schema is built from the entities and never sees it.
- Port 3307 is the **shared staging tunnel** — confirm before booting against
  it, because this DDL cannot be rolled back.

---

## 4. Backend — model and DTOs

**New** `model/question/enums/SelectionRule.java`: `MIN`, `MAX`, `EQUALS`.

**`Question.java`** gains the two fields (`@Enumerated(STRING)` for the rule)
and one helper. The class comment at lines 43-46 saying attempt style is not
modelled gets replaced by what the pair means:

```java
/** Floor and cap on how many options may be picked, for one question. */
public record SelectionBounds(int floor, int cap) {
    public static SelectionBounds of(SelectionRule rule, Integer count, int optionCount) {
        if (rule == null) return new SelectionBounds(1, 1);
        return switch (rule) {
            case EQUALS -> new SelectionBounds(count, count);
            case MAX    -> new SelectionBounds(1, count);
            case MIN    -> new SelectionBounds(count, optionCount);
        };
    }
}
```

`QuestionRequest` and `QuestionResponse` each gain `SelectionRule
selectionRule` and `Integer selectionCount`; `QuestionResponse.from` passes
them through. `PortalAssessmentDetailResponse.PortalQuestion` gains the same
two — they are presentation data (what hint to show, when to enable Next), not
scoring data, so they belong in a record that deliberately excludes MQT
scores.

---

## 5. Author-time validation (`QuestionController`)

Hand-checked, not bean validation: the rules are cross-field, and
`/bulk-create` must validate **every** item in pass 1 before writing any of
them (a `return` mid-loop still commits what was already saved).

One private `String validateSelection(QuestionRequest, int optionCount)`
returning null-or-message, called from `create`, `update` and bulk pass 1:

| condition | response |
| --- | --- |
| rule set, count null (or < 1) | 400 — "Selection count is required" |
| count set, rule null | 400 — always a typo, never silently ignored |
| `count > optionCount` | 400 — "…only has 4 options" |
| `MIN`/`EQUALS` with `count == optionCount` | allowed (forces all boxes) |
| `MAX 1` / `EQUALS 1` | allowed; behaves as single choice |

`optionCount` is the length of the **sanitized** option list — blank option
rows are dropped before counting, exactly as `rebuildOptions` does, or a form
with four blank spare rows would validate against the wrong number.

The count is coupled to the option list, so this must run on **every update**,
not just create: dropping two options from a five-option `EQUALS 4` question
would otherwise strand a rule nothing can satisfy.

`applyFields` sets both fields (rule null ⇒ count forced null, so a
half-set pair can never reach the DB even if the CHECK were absent).

### Freeze rule

The option set is already frozen once answers exist
(`QuestionController` lines 179-184). The selection rule joins it: any change
to `selectionRule` or `selectionCount` on a question with answers is a **409**,
pre-checked with `existsByQuestionQuestionId`, in the same voice as the
existing message. Tightening `EQUALS 3 → 2` would strand stored answer sets
the rule declares impossible, and nothing downstream could repair them.

Strictly-loosening edits (`MAX 3 → MAX 4`) are safe in principle and could be
allowed later; starting strict is one condition instead of four.

---

## 6. Submit-time enforcement (`PortalAssessmentService.submit`)

The pass-1 loop at lines 210-237 is the only substantive backend change.
`Map<Long, Option> chosen` becomes `Map<Long, LinkedHashSet<Option>>`, and the
`"Duplicate answer for question"` throw at line 219 is deleted — repeats are
now the point.

```java
Map<Long, Set<Option>> chosen = new LinkedHashMap<>();
for (AnswerEntry entry : entries) {
    // …null check, question-in-assessment check, option-belongs-to-question
    // check: all unchanged…
    chosen.computeIfAbsent(entry.questionId(), k -> new LinkedHashSet<>()).add(option);
}
```

A `LinkedHashSet` **silently dedupes** identical `(questionId, optionId)`
pairs. This is load-bearing, not tidiness: two identical rows violate
`uqAaRespondentAssessmentQuestionOption`, and a constraint violation inside
this `@Transactional` method marks the transaction rollback-only, so it
surfaces as a 500 at commit rather than a clean 400 — the exact trap the
project conventions warn about.

Then one cardinality check per question, after the loop:

```java
SelectionBounds b = SelectionBounds.of(q.getSelectionRule(),
        q.getSelectionCount(), q.getOptions().size());
int n = chosen.get(id).size();
if (n < b.floor() || n > b.cap()) throw badRequest(/* per-rule wording */);
```

Wording follows the rule the author chose, not the derived numbers — "needs
exactly 3 selections", "accepts at most 3", "needs at least 2" — because that
is what the respondent was told on screen.

The existing "all questions must be answered" check is **untouched**: a
question with no selections never enters the map, so a floor of ≥1 for every
mode falls out of a check that already exists. Pass 2's
delete → flush → insert replace-all already writes N rows per question.

---

## 7. Portal take flow

`question-runner.tsx` holds the interesting behaviour.

- `answers: Record<number, number>` → `Record<number, number[]>`
  (`take.tsx` line 33), and the submit mapping at line 153 flat-maps to one
  entry per selected option.
- Radio dot → square check when `cap > 1`.
- A hint line above the options — "Select at least 2" — with a live counter,
  "2 of 3 selected".
- **`answered` must mean "bounds satisfied", not "≥1 ticked"**, in all three
  places it is used: the Next/Submit gate, the green square in the question
  index panel, and `answeredCount`. If it means ≥1, the navigator tells a
  respondent they have finished a question the backend is about to reject.
- **At the cap**: when `cap == 1` a tick *replaces* (radio behaviour, which is
  what single choice and `MAX 1`/`EQUALS 1` should feel like); when `cap > 1`
  the tick beyond the cap is **blocked** and the hint flashes. Silently
  dropping their earliest selection produces an answer set the respondent
  never intended and nothing downstream can detect.
- **`autoNext`** (line 122) fires only when a selection brings the count to a
  *complete* state that cannot grow — single choice, and `EQUALS n` on the
  nth tick. For `MIN` and `MAX` there is no completion signal, and
  auto-advancing would slide the page away mid-selection.

---

## 8. Dashboard question form

`QuestionFormFields` in `question-form-modal.tsx` is shared by the Questions
page **and** the questionnaire wizard (`create-questionnaire.tsx` builds every
draft through `formFrom` and submits through `questionPayloadFrom`), so the
control is written once and both flows get it.

Placement: directly above the Options block (line 366), because it changes
what the option list *means*. Dropdown plus an integer input that only appears
once a rule is chosen, with the live hint "3 of 5 options" beside it so the
`count > optionCount` error is visible before save.

Touch points: `QuestionForm` (+2 fields), `formFrom` (both branches),
`questionPayloadFrom`, and `validateQuestionForm` — which mirrors the
server-side table in §5 so the modal reports the problem inline instead of
bouncing off a 400. `questionnaire-preview-view.tsx` renders checkboxes and
the hint for ruled questions, so practitioners preview what respondents see.

---

## 9. XLSX upload — template, parser, endpoint

### 9.1 The template

Two new columns, inserted after `risk` (column order in the generated sheet is
the key order of the objects handed to `json_to_sheet`, so this is where they
go in `downloadTemplate`):

```
stem | type | mediaUrl | risk | selectRule | selectCount | section | scores
     | option1 | option1Scores | … | optionN | optionNScores
```

| column | accepts |
| --- | --- |
| `selectRule` | blank (single choice) · `min` · `max` · `equals` |
| `selectCount` | positive integer; required when `selectRule` is set |

Also accepted as synonyms, because authors will write them: `atleast` → MIN,
`atmost`/`upto` → MAX, `equal`/`exactly` → EQUALS. Matching is done after
lowercasing and stripping spaces, so "At Least" and `at_least` both land.

Two plain columns rather than a `max:3` mini-syntax in one cell: the score
columns are already the only mini-syntax in the template and are by far the
fiddliest thing for authors to get right. The header normaliser at
`question-bulk-upload.tsx:88` lowercases and strips separators, so
`selectRule`, `"Select Rule"` and `select_rule` all resolve to `selectrule`.

Three sample rows instead of today's two, so every state is demonstrated:

| stem | type | risk | selectRule | selectCount | options |
| --- | --- | --- | --- | --- | --- |
| I enjoy meeting new people. | TEXT | no | *(blank)* | *(blank)* | Agree / Neutral / Disagree |
| Which of these apply to you? | TEXT | no | max | 3 | five options |
| Pick the two that fit best. | TEXT | no | equals | 2 | four options |

The `mqts` reference sheet is unchanged.

### 9.2 The parser

The new block lives in `parseQuestionsXlsx` **after the option loop**, not
beside the `riskFlag` line where it reads more naturally — the
count-vs-options check needs `options.length`, which does not exist until the
`optionN` cells have been walked.

```ts
const SELECT_RULES: Record<string, SelectionRule> = {
  min: 'MIN', atleast: 'MIN',
  max: 'MAX', atmost: 'MAX', upto: 'MAX',
  equals: 'EQUALS', equal: 'EQUALS', exactly: 'EQUALS',
};
const ruleCell  = (row.selectrule  || '').toLowerCase().replace(/[\s_-]/g, '');
const countCell = row.selectcount || '';
```

Hard errors — hard because `/bulk-create` is all-or-nothing and half a sheet
must never import:

| case | message |
| --- | --- |
| `ruleCell` set but unknown | `Row 4: selectRule "sum" is not min/max/equals` |
| rule set, count blank | `Row 4: selectRule "max" needs a selectCount` |
| count set, rule blank | `Row 4: selectCount 3 needs a selectRule (min/max/equals)` |
| count not a positive integer | `Row 4: selectCount "two" is not a whole number above 0` |
| `count > options.length` | `Row 4: selectCount 4 but the row only has 3 options` |

`countCell` arrives as a string (the normaliser stringifies every cell), and
Excel writes integers as `3` or sometimes `3.0` — so validate with
`Number.isInteger(Number(countCell)) && Number(countCell) > 0`, not a regex.

The last check is the valuable one: it is the single most likely authoring
mistake and it is fully catchable in the browser, before anything is sent.

Backward compatible by construction: both cells blank ⇒ both fields null ⇒
single choice, so every sheet already in circulation imports unchanged and
produces zero new errors.

### 9.3 The review wizard

`QuestionPreview` gains a badge beside the risk badge — `Select at most 3 of
5`, `Select exactly 2 of 4` — built from the same floor/cap helper the portal
uses, so the review card and the take screen can never describe the rule
differently. A soft amber warning (not an error) when a ruled question has
fewer than two options: legal, almost certainly a mistake, but blocking it
would kill the whole batch over one suspicious row.

The modal's help block (the column list at lines 422-429) and the file-header
comment at lines 27-41 both enumerate the columns and both need the two new
ones. Root `sample_question_sheet.csv` too.

### 9.4 The endpoints

**No new endpoints, no URL or shape changes.** `/api/questions/create`,
`/bulk-create` and `/update/{id}` all take `QuestionRequest`, which gains the
same two optional fields; a caller that omits them gets single choice, which
is what every caller means today.

`/bulk-create`'s **pass 1** gains one line per item, beside the existing stem
and MQT checks, using the shared `validateSelection` from §5 and the
positional message style already established there:

```java
String problem = validateSelection(request, sanitized(request.options()).size());
if (problem != null) {
    return ResponseEntity.badRequest()
            .body(Map.of("message", "question " + (i + 1) + ": " + problem));
}
```

Three properties of that loop matter and are easy to break:

- **Validate against the sanitized option list.** `sanitized()` drops rows
  with neither text nor media, and it is what `rebuildOptions` writes — check
  `selectCount` against the raw list and a sheet with trailing blank option
  columns validates against a number of options that never reaches the DB.
- **Pass 1 must stay complete before pass 2 starts.** Returning a 400 from
  inside the write loop still *commits* the items already saved, because a
  normal return from a `@Transactional` method commits. That is why the
  selection check goes in the existing pass-1 loop rather than next to
  `applyFields`.
- **`/bulk-create` returns the created questions in request order**, which
  `BulkUploadModal.submit` relies on to line `sectionIds[i]` up with
  `created[i]` when the upload happens inside the questionnaire wizard. Adding
  fields to `QuestionResponse` does not disturb that, and it means the wizard
  can render the rule badge on freshly-created questions with no extra fetch.

`/update/{id}` additionally carries the §5 freeze: changing the rule or count
on a question that already has answers is a 409, pre-checked.

---

## 10. One existing bug this exposes

`AssessmentAnswerRepository.tallyAnswersByAssessment` counts **rows**
(`count(a)`) and the reports popup compares that to `totalQuestions`. The
first multi-select assessment renders progress as "7 of 5 answered". Fix:
`count(distinct a.question.questionId)`.

---

## 11. Scoring semantics (decision, not code)

There is no scoring engine yet — `QuestionMqtScore` / `OptionMqtScore` are
written and never aggregated — so nothing breaks today. But the rule must be
decided now, because it shapes the data authors are about to enter:

**A question contributes the sum of every selected option's MQT scores**, plus
its question-level score once. Consequence worth stating in `CLAUDE.md`: a
multi-select question's ceiling on an MQT is the sum of its options, not the
max, so one such question can outweigh several single-choice ones. `EQUALS n`
is the psychometrically tidy rule — every respondent contributes exactly n
option scores — while `MIN`/`MAX` produce a varying number, which any norms
built later must account for.

---

## 12. File-by-file worklist

**spring-social**

1. `model/question/enums/SelectionRule.java` — new
2. `model/question/Question.java` — 2 fields, accessors, `SelectionBounds`
3. `db/migration/V11__add_question_selection_rule.sql` — new
4. `dto/QuestionRequest.java`, `dto/QuestionResponse.java` — 2 fields each
5. `controller/question/QuestionController.java` — `validateSelection`,
   `applyFields`, freeze check; wired into create / update / bulk pass 1
6. `dto/PortalAssessmentDetailResponse.java` — `PortalQuestion` + 2 fields
7. `service/PortalAssessmentService.java` — submit pass 1 (§6)
8. `repository/assessment/AssessmentAnswerRepository.java` — `count(distinct)`
9. tests — bounds arithmetic per rule; submit under/over/at bounds; the 409
   on editing a rule that has answers

**bodhassess-app**

10. `question-bank/questionApis.ts` — payload + response types
11. `question-bank/question-form-modal.tsx` — form state, control, validation
12. `question-bank/question-bulk-upload.tsx` — parse, template, badge, docs
13. `question-bank/questions.tsx` — list badge
14. `questionnaires/questionnaire-preview-view.tsx` — checkbox render
15. `sample_question_sheet.csv`
    (`create-questionnaire.tsx` needs nothing — shared form)

**bodhassess-portal**

16. `lib/api.ts` — `PortalQuestion` + 2 fields
17. `pages/take/take.tsx` — `number[]` state, flat-mapped submit payload
18. `pages/take/question-runner.tsx` — toggle, counter, gating, autoNext

---

## 13. Verification

1. `cd spring-social && ./mvnw -B test` (5 green today, plus the new ones).
2. `cd bodhassess-app && npm run typecheck && npm run build`; same in
   `bodhassess-portal`.
3. Live curl against `:8080` with `__smoke__` data, deleted afterwards —
   error paths, not just the happy path:
   - create one question per rule + one single choice;
   - `selectCount` above the option count → 400; count without rule → 400;
   - submit below floor / above cap → 400 each; at bounds → 200 with the
     right number of `AssessmentAnswer` rows;
   - the same option submitted twice → 200, one row (the dedupe);
   - edit the rule on a question that has answers → 409;
   - `/bulk-create` with a bad rule on item 3 of 4 → 400 naming
     `question 3`, and **zero rows written** (the all-or-nothing property —
     verify with a count query, not by reading the response);
   - export the assessment → multi cells joined with `"; "` in option order;
   - reports popup shows `answered ≤ total`.
4. Upload path, in the browser:
   - a sheet with no `selectRule`/`selectCount` columns still imports, every
     question single choice, no new errors;
   - a sheet exercising all three rules imports, badges correct on the review
     cards, rules correct on the created questions;
   - each §9.2 error fires on a deliberately broken sheet and blocks the
     whole batch;
   - the same upload inside the questionnaire wizard still maps rows to
     sections — `created[i]` ↔ `sectionIds[i]` ordering intact.

---

## 14. Decisions taken here — veto any of them

1. **"Single choice" is the absence of a rule** (both columns NULL), not a
   fourth dropdown value. Zero backfill; old sheets keep working.
2. **Every question stays mandatory** — the floor is never 0, so `MAX 3`
   means 1-3, not 0-3. Making questions optional is a separate feature and
   would need the submit-time all-answered check to learn exemptions.
3. **`MIN n`'s cap is the option count** — "at least 2" puts no ceiling on
   how many they tick.
4. **No `responseType` column** — multi-ness is `selectionRule != null`.
5. **The submit wire keeps repeated `AnswerEntry(questionId, optionId)`**
   rather than becoming `optionIds: []`. No DTO break, so a portal build
   lagging a backend deploy keeps submitting valid single-choice payloads,
   and the payload stays isomorphic to the rows it becomes.
6. **Rule and count are frozen once answers exist** (§5).
7. **Blocked, not replaced, at the cap** when `cap > 1` (§7).
8. **Sum** as the multi-select scoring rule (§11).

Out of scope: `FREE_TEXT` / `RANKING` response types, per-placement overrides
(the rule lives on the bank question, so it is the same in every questionnaire
that uses it), and one-column-per-option export for multi questions.

---

## 15. What shipped, and what it differed on

Built as planned, with two additions worth knowing:

- **`PortalQuestion` carries `minSelections`/`maxSelections`** alongside the
  rule and count — the bounds already resolved server-side. The portal gates
  on those two numbers and never interprets the rule itself, so the take
  screen and the submit validator cannot drift apart. `SelectionBounds` on the
  backend and `selectionBounds()` in `questionApis.ts` are the same table in
  two languages, and both are the only place their side reads the rule.
- **`sample_question_sheet.csv` was deliberately left alone.** It is a v2-era
  file (`format`, `risk_flag`, `question_mq1`… columns) that the current
  parser cannot read at all — adding `selectRule` to it would imply the
  template shape it does not have. The live template comes from
  `downloadTemplate`, which does have both columns.

Not done: the §13.3 live curl smoke, which needs the app booted against the
shared staging MySQL on port 3307. Everything it would prove is covered by
`QuestionSelectionRuleTest` against H2 — author-time validation, bulk
all-or-nothing with a positional message, the three rules at and outside their
bounds, the duplicate-pair dedupe, the export join, the answered-questions
tally and the 409 freeze — but the MySQL enum column and the CHECK constraint
in V11 are only exercised by actually running the migration.
