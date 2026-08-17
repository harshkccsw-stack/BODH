# Author-set scale range, and a SHORT_ANSWER question type

**STATUS (2026-08-13): BUILT AND VERIFIED.** `V17` applied to the shared
staging database: `scale_from` / `scale_to` (with the 1—5 backfill), the enum
widened to `SHORT_ANSWER` + `PARAGRAPH`, and the answer key rebuilt around
`COALESCE(option_id, 0)` as well.

`./mvnw -B clean test` green at **90** (3 new in `ShortAnswerTest`, 2 new in
`QuestionTypeTest`), both frontends typecheck and build, live smoke run
against a second instance on 8081 with every `__smoke__` row deleted after.

Verified live, beyond the unit tests:
- `0—10` generates 11 points scoring 0…10, `-3—3` generates 7 scoring -3…3;
- the inverted, half-set and million-point ranges are each refused by name;
- a short answer submits its text, exports as `Busy, but good.`, and scores
  **14** on a two-question assessment — 7 from the scale point picked plus the
  flat 7 for having answered the short answer, which is decision #4 working;
- a duplicate text answer is refused by MySQL with
  `Duplicate entry '42-16-33-0-0'` — both nulls collapsed to 0, which is the
  whole reason the key was rebuilt.

Two requests, one small and one that opens a door the model has been holding
shut:

| | ask | shape of the work |
| --- | --- | --- |
| **A — scale range** | the author picks 0—10, 1—7, x—y instead of a fixed 1—5 | one migration, a constant becomes a column, three UI touches |
| **B — short answer** | a new free-text question type | the **first type with no options**, which is what makes it more than a new enum value |

Next migration number is **V17**.

---

## Part A — the author sets the range

### A1. Where 1—5 lives today

`QuestionController` holds `SCALE_FROM = 1`, `SCALE_TO = 5` and generates the
points from them: option text "1".."5", each carrying a derived
`OptionMqtScore` equal to its own number. Nothing else in the system knows the
range — the portal maps over whatever options arrive, and `MqtScoringService`
sums whatever scores they carry.

So the change is genuinely small. The only real decision is where the range
lives.

### A2. Store the range, don't derive it — reversing an earlier call

When the range was fixed I argued *against* `scale_min`/`scale_max` columns:
"the options ARE the scale, and a range stored twice is a second source of
truth that drifts". That reasoning was correct **for a constant** — storing 1
and 5 on every row would have stored the same two numbers a million times.

It does not survive the range becoming author input. Once the author types
0 and 10, that pair is *data they entered*, and the options are the artifact
generated from it. Deriving it back means parsing option text — which works
only because the backend guarantees the text is numeric, and quietly breaks
the editor the day anything writes a scale point that is not a number.

**Recommendation: two nullable int columns, `scale_from` / `scale_to`.** They
are input; the options stay derived from them, one direction only, so the two
cannot drift.

### A3. Migration — `V17`

```sql
ALTER TABLE `question`
  ADD COLUMN `scale_from` int DEFAULT NULL AFTER `question_type`,
  ADD COLUMN `scale_to`   int DEFAULT NULL AFTER `scale_from`;

UPDATE `question`
   SET `scale_from` = 1, `scale_to` = 5
 WHERE `question_type` = 'LINEAR_SCALE';
```

- **Nullable, then backfilled** — the V11 pattern. NOT NULL is impossible
  here: the columns are meaningless on an MCQ, and MySQL cannot make a column
  conditionally required. The backfill is what matters, and the code still
  reads a NULL pair as 1—5 so a row written around the API can never render an
  empty scale.
- Existing scale questions keep their 1—5 exactly, with their generated
  options and derived scores untouched — the range is being *recorded*, not
  changed.
- Same `information_schema` + `PREPARE` guard as V3/V11/V14, and the same
  snake_case naming rule (`@Column(name = "scaleFrom")` → `scale_from`).

### A4. Backend

- `Question` gains `scaleFrom` / `scaleTo` (`Integer`, nullable).
- `QuestionController`: `SCALE_FROM`/`SCALE_TO` stop being the range and
  become the *bounds on* the range. `desiredOptions` generates
  `scaleFrom … scaleTo` for a LINEAR_SCALE, from the request.
- `applyFields` clears both on every other type — same rule the scale labels
  already follow.
- `validateType` gains, for LINEAR_SCALE:
  - both present or both absent (absent = 1—5, so old payloads still work);
  - `scaleFrom < scaleTo`;
  - at least 2 points;
  - a **safety ceiling** — see below. No design limit.
- Freeze: changing the range changes the option list, so `optionsChanged`
  already returns a 409 once anyone has answered. No new freeze rule.
- DTOs: `QuestionRequest` / `QuestionResponse` / `PortalQuestion` each gain the
  two fields. The portal now needs them for real: a slider renders from the
  range, not from the option list.

**DECIDED: negative ranges are allowed.** `-3 … +3` (semantic differential,
bipolar agreement) costs nothing — `OptionMqtScore.score` is a signed int and
`MqtScoringService` sums signed ints, so a bipolar scale scores correctly with
no engine change.

**DECIDED: no maximum on the number of points.** One caveat that is worth a
guard rather than an argument: the points are stored as real `Option` rows, so
the range decides how many rows a question writes — 0—100 is 101 options plus
101 `OptionMqtScore` rows per mapped MQT. That is fine. `1 – 1000000`, typed
by accident, is a million-row insert inside one transaction, and there is
nothing to undo it with.

So: **no limit on the scale, but a ceiling on the typo** — refuse a range
wider than 1000 points with a plain message. It is 100× past any real
instrument and 1000× short of the accident.

### A5. What it does to scoring

`MqtScoringService` needs **no change** — the points still carry
`OptionMqtScore = their own number`. Two consequences worth stating out loud
before you pick ranges:

- On a 0—10 scale the point **0 contributes nothing**, which is arithmetically
  right but means "answered at the bottom of the scale" and "unscored" are the
  same number in a total. If that matters for an instrument, start the range
  at 1.
- On a negative range the contribution is negative, which is the point of a
  bipolar scale — but it means an MQT total can go down, and anything that
  assumes totals are monotonic (a progress bar, a percentage) has to cope.

### A6. Frontend

- **Form** (`question-form-modal.tsx`, shared by the modal and the inline
  questionnaire editor): `From [ 1 ▾ ] to [ 5 ▾ ]` above the labels, exactly
  Google's control. The label rows retitle themselves (`Label for 0`,
  `Label for 10`) and the live preview renders the real number of points.
  `QuestionForm` gains `scaleFrom` / `scaleTo` as strings (so the inputs can be
  emptied), validated in `validateQuestionForm` with the same messages the
  backend uses.
- **`scalePoints()`** stops being a constant list and takes the range; every
  caller (preview, the "n options" summary in the questionnaire editor) already
  goes through it.
- **Bank list badge** currently hardcodes `1–5` from the exported constants —
  it becomes the question's own range, read off its options.
- **XLSX import**: optional, cheap — `scaleFrom` / `scaleTo` columns alongside
  the `type` column the sheet does not have yet. Out of scope unless you want
  it.

### A7. The portal renders a SLIDER, not a row of buttons

**DECIDED:** a linear scale is delivered as a draggable track with the numbers
under it — not as option cards numbered 1, 2, 3. That is also what makes "no
maximum" workable: a 0—100 scale is unusable as 101 buttons and perfectly
natural as a slider.

```
        Strongly disagree                    Strongly agree
        ├───────●───────────────────────────────────────┤
        0   1   2   3   4   5   6   7   8   9  10
                    (ticks thin out as the range grows)
```

Built on a native `<input type="range">` with `min = scaleFrom`,
`max = scaleTo`, `step = 1`: keyboard arrows, screen readers and touch
dragging all come free, and none of them would if it were a custom div.
The end labels sit above the two ends, the numbers under the ticks, and the
tick labels thin out (every 1 / 5 / 10) as the range widens so they never
collide.

**The trap, and it is a data-quality one:** a slider has no natural
*unanswered* state. Give the thumb a starting position and an untouched
question looks answered — and every respondent who skips it silently records
whatever the default was, usually the midpoint. In a psychometric instrument
that is the worst kind of bug, because the data looks complete.

So the slider ships **unset**: no thumb rendered, the track flat and the
"Next" gate closed until the respondent actually interacts. It becomes a real
value on first click, drag or arrow key. That is how the runner's existing
`answered` gate stays honest — a scale is still a cap-1 question with either
zero or one option selected, exactly as today.

Submit is unchanged: the slider's value maps to the generated option whose
number it is, and the payload still carries an `optionId`. Nothing on the
answer path learns about sliders.

The dashboard preview mirrors the same widget (read-only, unset), so
authoring shows what the respondent meets.

---

## Part B — SHORT_ANSWER

### B1. The one structural fact

Every question type so far is *a set of options the respondent picks from*.
Short answer is not, and that single difference is where all the work is:

- `AssessmentAnswer.answerText` already exists and is documented as the
  FREE_TEXT payload; `option` is already nullable. **Storage needs nothing.**
- `AssessmentReportService` already writes
  `option != null ? optionText : answerText` into the export cell. **The sheet
  needs nothing.**
- Everything that *validates* an answer assumes an option, and that is what
  changes.

### B2. Endpoints — none

To answer the question directly: **no new endpoint, no new controller, no new
table.** A short-answer question is created, read, updated and deleted through
the same `/api/questions/*` CRUD, delivered by the same
`/api/portal/assessments/getById/{mappingId}`, and submitted through the same
`/api/portal/assessments/submit/{mappingId}`. The work is one enum value, one
nullable payload field, and the validation branches below.

### B3. Migration — `V17` (same file as Part A)

```sql
ALTER TABLE `question`
  MODIFY COLUMN `question_type`
    enum('MCQ','LINEAR_SCALE','LIKERT_GRID','SHORT_ANSWER','PARAGRAPH')
    NOT NULL DEFAULT 'MCQ';
```

- Widening a MySQL enum is a **table rebuild**, which is exactly why V14
  pre-listed `LIKERT_GRID` before anything wrote it. Same trick again:
  `PARAGRAPH` (Google's "Paragraph" / long answer) goes in now so the next
  text type costs no DDL at all. Nothing will write it until it is built.
- **DECIDED: no length limit**, so no `answer_max_length` column. `answerText`
  is already `TEXT` (65 535 bytes), which is the only ceiling — and it is a
  storage fact, not a policy. Worth knowing it is there: a paste of a whole
  document would be truncated by MySQL rather than rejected, so the submit
  validator should refuse anything over that length outright rather than
  silently storing half of it. A column can be added later if a per-question
  limit is ever wanted.

### B4. The unique-key trap, second edition

V15 widened the answer key to
`(respondent, assessment, question, COALESCE(question_row_id,0), option_id)`
because MySQL treats NULLs as never equal. **`option_id` is null on a short
answer**, so the key stops constraining text answers in exactly the way
`question_row_id` would have: two identical text answers for one question
would both insert.

Fix is the same shape — `COALESCE(option_id, 0)` as a second functional key
part, added before the old key is dropped:

```sql
ALTER TABLE `assessment_answer`
  ADD UNIQUE KEY `uqAaRespondentAssessmentQuestionRowOptionV2` (
    `respondent_user_id`,`assessment_id`,`question_id`,
    ((COALESCE(`question_row_id`,0))),((COALESCE(`option_id`,0))));
ALTER TABLE `assessment_answer`
  DROP INDEX `uqAaRespondentAssessmentQuestionRowOption`;
```

That makes the key "one answer row per (respondent, assessment, question,
row, option)" true for *every* type — and for a short answer it collapses to
one row per question, which is the rule we want anyway. (It does mean a
respondent cannot hold two text answers for one question. That is correct: a
short answer IS one answer.)

### B5. Authoring

`QuestionFormFields` gets a third body, the smallest of the three:

```
SHORT ANSWER
  Question → MQT scores   [ MQT ▾ ] [ 3 ]      ← kept, and answer-independent
  (no options, no rows, no selection rule, no length limit)
  Respondents will see:  [ their answer…                    ]
```

Validation (`validateType`, mirrored in the form):

- no options, no rows, no `selectionRule` — all rejected rather than ignored,
  so nothing can store a shape no screen honours;
- question-level MQT scores are **allowed** (see B6); option-level ones cannot
  exist, because there are no options.

`desiredOptions` returns an empty list for SHORT_ANSWER, which is already how
that helper is built to work — the type decides what the options are, in one
place.

### B6. Scoring — question-level mapping is KEPT

**DECIDED: a short answer keeps its Question → MQT scores.** I flagged the
consequence and it is your call, so it is written down here rather than
argued again: `MqtScoringService` adds the question-level score **once per
question answered**, and a short answer has no options to add anything else.
So the contribution is a flat number earned for *answering at all* — the same
whatever the respondent typed.

That is coherent (it is exactly what the question-level score already means on
an MCQ) and it needs **no engine change**: `MqtScoringService` sums whatever
score rows exist, and a short answer simply has only the flat one.

Two practical notes that follow from it:

- an unanswered question contributes nothing and an answered one contributes
  the full amount, so on a mandatory questionnaire every respondent scores the
  same on it — it shifts totals rather than discriminating between people;
- leave the score at 0 (or map no MQT at all) for questions that are there to
  collect text rather than to measure, which is most of them.

The form therefore shows the Question → MQT editor exactly as it does for
every other type, with a line explaining that the score is for answering, not
for what was written. Content-based scoring of free text (a rubric, keywords,
an NLP pass) stays a separate feature.

### B7. Delivery and submit

**`PortalQuestion`** carries empty `options` and `rows` for this type.
`minSelections`/`maxSelections` still arrive as 1/1 from `SelectionBounds` —
harmless, but the runner must not read them for this type, and neither must
the validator (see below).

**`PortalSubmitRequest.AnswerEntry`** gains a nullable `answerText`:

```java
public record AnswerEntry(Long questionId, Long optionId, Long questionRowId, String answerText) {}
```

Nullable, so every existing client keeps sending what it always sent.
`PortalAssessmentService.submit` grows a second collection beside the
per-slot option map:

- SHORT_ANSWER: `answerText` required and non-blank after trim, `optionId` and
  `questionRowId` must both be null, one entry per question (a second entry
  for the same question is a 400, not a silent overwrite), and anything past
  what `TEXT` can hold is **rejected rather than truncated**, so nobody's
  answer is silently cut in half;
- every other type: `answerText` must be null, exactly as `questionRowId` must
  be null off a grid.

The **"every placed question answered"** check has to consider both maps, or a
questionnaire of nothing but short answers would submit empty. The bounds
check (`SelectionBounds.allows`) must **skip** SHORT_ANSWER — with zero
options its floor of 1 would reject every possible answer.

Pass 2 writes one `AssessmentAnswer` with `answerText` set and `option` null.

**Portal UI**: a textarea (single-line input for SHORT_ANSWER, sized for
`answerMaxLength`, with a live character counter when a limit is set). The
runner's answer state is `Record<string, number[]>` today; text needs a
parallel `Record<string, string>` keyed the same way, merged by the payload
builder in `take.tsx`. Three gates change:

- `answered` = trimmed text is non-empty;
- the index-panel tick uses the same predicate;
- **auto-next never fires** on a text question — there is no "settled" signal
  while someone is typing, and sliding the page away mid-sentence is the worst
  possible behaviour.

### B8. What needs nothing

Export sheet (the `answerText` fallback is already there), reset/re-take,
the tally query (`count(distinct question)`), the delete/freeze guards
(`existsByQuestionQuestionId`), option shuffle (already MCQ-only), and
`MqtScoringService`.

### B9. Not the same as a demographic field

Worth stating because it is the obvious near-miss: `DemographicField` already
collects free text, but that is **profile data about the respondent**, asked
once before the assessment and stored per (respondent, assessment). A
SHORT_ANSWER question is **an item in the instrument**, placed in a section,
tagged in the export next to the other questions, and answered inside the take
flow. If what you actually want is "their employee code" or "their team", the
demographic form is still the right place.

---

## Files this touches

**Backend** — `QuestionType` (+2 values), `Question` (+3 columns),
`QuestionController` (range generation, two validation branches),
`QuestionRequest`/`QuestionResponse`/`PortalAssessmentDetailResponse`,
`PortalSubmitRequest`, `PortalAssessmentService.submit`, `AssessmentAnswer`
(unique-constraint declaration only), `V17`.

**Dashboard** — `questionApis.ts`, `question-form-modal.tsx` (range control +
short-answer body), `create-questionnaire.tsx` (summary line),
`questionnaire-preview-view.tsx`, `questions.tsx` (badges).

**Portal** — `lib/api.ts`, `take.tsx` (text answer state + payload),
`question-runner.tsx` (**slider** for LINEAR_SCALE, text input for
SHORT_ANSWER, gates, no auto-next on either).

**Tests** — extend `QuestionTypeTest` for the range (validation, generation,
negative ranges, the width guard, round-trip, 1—5 backfill meaning) and add
`ShortAnswerTest` for the authoring rules, the submit branches, the export
cell and the flat question-level score.

---

## Decisions — settled, and as built

1. **Negative ranges: allowed.** Signed ints all the way through; no engine
   change.
2. **No maximum on the number of points**, and the portal renders a **slider**
   with the numbers under the track (A7) rather than one button per point. A
   1000-point width guard exists only to catch a typo, not to limit design.
3. **No length limit on a short answer.** `TEXT` is the only ceiling, and
   anything past it is refused rather than truncated.
4. **Short answers keep their question-level MQT scores** (B6) — a flat score
   for answering, unchanged engine.
5. **`PARAGRAPH` goes in the enum now** (nothing writes it) so the long-answer
   type later costs no table rebuild. Say if you would rather leave it out.

**A7's unset slider is the one to keep an eye on in manual testing.** It is
the difference between "skipped" and "silently recorded the midpoint", and a
wrong default would be invisible in the data afterwards. As built: a native
`<input type="range">` whose thumb is hidden until the respondent interacts,
Next stays closed while it is unset, and the first arrow key lands on the low
end rather than nudging a value nobody chose.
