# Shuffle options — plan (BUILT 2026-08-14, as written below)

> Status: implemented exactly as planned. `sortOrder` is renumbered to the
> delivered position (§2), the flag is not frozen by responses (§1), MCQ only,
> and the XLSX gained a `shuffle` column (§6). `V16__add_question_shuffle_options.sql`
> is applied on staging. Open questions in §7 (pinned options, `shuffleRows`,
> assessment-level override) are still open and were NOT built.


**Goal.** A per-question toggle, sitting to the left of the *Add option*
button in the question form, that randomises the order the options are
presented in. Two respondents taking the same assessment see the same
question with its options in a different order. Off = today's behaviour
(authored order), which is what every existing question means.

Nothing here is implemented. This is the shape to agree on first.

---

## 1. What the toggle actually means

Shuffling is **presentation only**. An answer is stored as an `optionId`
(`AssessmentAnswer`), never as a position, so scoring, reports, the scoring
key export and the response sheets are all untouched — they keep reading the
author's `sortOrder`. Nothing about the data model of an answer changes.

That single fact drives most of the decisions below.

### Which question types it applies to — MCQ only

- **MCQ** — shuffle. This is the feature.
- **LINEAR_SCALE** — never. The options are the generated points 1—5; a
  scale with the points out of order is broken, not randomised.
- **LIKERT_GRID** — never (for the columns). The columns are an ordinal
  rating scale (Strongly disagree → Strongly agree) shared by every row.

  Shuffling a grid's **rows** (the statements) is a real and separate feature
  — order effects across items are what you actually want to defeat in a
  Likert battery. That is a `shuffleRows` flag and I would keep it out of
  this change. Called out here so we don't paint over it.

So: the flag is only meaningful on MCQ. Same treatment the type-specific
fields already get — `selectionRule` is refused on a scale, the two scale
labels are cleared on an MCQ. Consistent handling: **400 if a payload sets
`shuffleOptions` on a LINEAR_SCALE or LIKERT_GRID**, and the form never sends
it for those types (it clears the flag in the type-switch handler, the same
way it clears `selectionRule`/`selectionCount` today).

### It is NOT frozen by responses

`QuestionController.updateQuestion` freezes the option set, the row set and
the selection rule once `assessmentAnswerRepository.existsByQuestionQuestionId`
is true — changing any of those would invalidate answers already collected.
Shuffling invalidates nothing: the option ids, their scores and the count
rules are identical either way.

**Decision: `shuffleOptions` is editable at any time, answers or not.** The
only consequence of flipping it mid-collection is that respondents before the
flip saw a fixed order and respondents after saw a shuffled one — which is
exactly what the author asked for, and is not a data problem. Say the word if
you'd rather it froze; it is one line either way.

---

## 2. Where the shuffling happens — server-side, deterministically seeded

This is the one decision worth arguing about.

### Recommended: shuffle in `PortalAssessmentDetailResponse.from(...)`, seeded by (attempt, question)

```java
// order the respondent sees; stable for this attempt, different per attempt
List<PortalOption> options = ...authored order...;
if (question.isShuffleOptions() && question.getQuestionType() == QuestionType.MCQ) {
    List<PortalOption> shuffled = new ArrayList<>(options);
    Collections.shuffle(shuffled,
            new Random(31L * mapping.getRespondentAssessmentMappingId() + question.getQuestionId()));
    options = renumber(shuffled);   // see "sortOrder" below
}
```

Why this and not the obvious alternatives:

| | stable across a page refresh | differs per respondent | differs per re-attempt | new storage |
|---|---|---|---|---|
| **seeded server-side (recommended)** | yes | yes | yes | none |
| client-side `Math.random()` in the runner | **no** | yes | yes | none |
| persisted order rows per attempt | yes | yes | yes | new table + migration |

The refresh column is the killer for the client-side version. The portal
holds the answer state in memory (there is no `localStorage` in
`pages/take/`), so a mid-assessment reload already sends the respondent back
through the gate; if the order also changed under them the experience is
visibly random, and any half-answered UI state maps onto a different list. A
seed derived from `respondentAssessmentMappingId` + `questionId` gives a
permanent, reproducible order per attempt with zero persistence — and because
the option set is frozen once anyone has answered, the exact order any
respondent saw can be recomputed later from those two ids if it is ever
questioned in an audit.

Server-side also means the portal needs **no code change at all**: it already
renders `q.options` in delivered order (`question-runner.tsx`) and never sorts
by `sortOrder`.

The seed is per **attempt**, not per respondent, so a granted re-attempt gets
a fresh order. That seems right; the alternative (seed on respondent id) would
show someone their second attempt in the same order as their first.

### `PortalOption.sortOrder`

`PortalOption` carries the author's `sortOrder`. If the list is shuffled but
that field still says 0,1,2,3, then the list order and the field disagree and
any future client that sorts by it silently undoes the shuffle.

**Recommendation: renumber `sortOrder` to the delivered position** (0..n-1 in
shuffled order) — same principle as already sending resolved
`minSelections`/`maxSelections` instead of the raw rule, so the portal and the
server cannot disagree. The authored order is never needed on the respondent's
screen. Documented in the DTO comment. (Alternative — leave it authored and
document "list order is delivery order" — is fine but leaves the trap.)

Optionally add `boolean shuffled` to `PortalQuestion` so the runner *could*
label it; I would not, respondents shouldn't be told.

---

## 3. Endpoints

**No new endpoints.** Three existing contracts gain one nullable boolean.

| Endpoint | Change |
|---|---|
| `POST /api/questions/create` | `QuestionRequest.shuffleOptions` (Boolean, optional — null/absent = false, so every existing caller is unchanged) |
| `POST /api/questions/bulk-create` | same field; validated in pass 1 alongside `validateType`/`validateSelection` |
| `PUT /api/questions/update/{id}` | same field; **not** part of the `hasAnswers` freeze checks |
| `GET /api/questions/getAll`, `/getById/{id}`, `/getByQuestionnaireId/{id}` | `QuestionResponse.shuffleOptions` (never null) |
| `GET` portal attempt detail (`PortalAssessmentDetailResponse`) | options arrive **already in delivery order**; no new field (see above) |

---

## 4. Schema

One column, one migration — `V16__add_question_shuffle_options.sql` (bump the
number if the other agent claims V16 first).

```sql
-- Physical name is snake_case: @Column(name = "shuffleOptions") is LOGICAL,
-- the naming strategy makes it `shuffle_options`. Same trap as V3.
-- Guarded ADD COLUMN (information_schema check → prepared statement), because
-- MySQL cannot roll back DDL — the V3 pattern verbatim.
ALTER TABLE `question` ADD COLUMN `shuffle_options` BIT(1) NOT NULL DEFAULT 0 AFTER `risk_flag`;
```

`DEFAULT 0` and NOT NULL: every existing question keeps its authored order,
no backfill needed, no nullable-then-tighten dance.

Entity:

```java
/** MCQ only: deliver the options in a random order, seeded per attempt. */
@Column(name = "shuffleOptions", nullable = false)
private boolean shuffleOptions;
```

> ⚠️ Writing that file into `db/migration/` applies it to the **shared staging**
> database within seconds (IDE auto-apply). I won't create it until you say build.

---

## 5. Files to touch

**spring-social**
- `model/question/Question.java` — field + getter/setter
- `resources/db/migration/V16__add_question_shuffle_options.sql`
- `dto/QuestionRequest.java`, `dto/QuestionResponse.java` (+ `from()`)
- `controller/question/QuestionController.java` — `applyFields`, `validateType`
  (refuse on non-MCQ), `toResponse`; deliberately *absent* from the
  `hasAnswers` freeze checks
- `dto/PortalAssessmentDetailResponse.java` — the seeded shuffle in `from()`
- `src/test/...` — a test that the same (mapping, question) yields the same
  order twice, two mappings differ, and a non-MCQ payload with the flag 400s

**bodhassess-app**
- `pages/question-bank/questionApis.ts` — `shuffleOptions` on `QuestionPayload`
  and `QuestionResponse`
- `pages/question-bank/question-form-modal.tsx` — `QuestionForm.shuffleOptions`,
  `formFrom`, `questionPayloadFrom` (force `false` for scale/grid), clear it in
  the type-switch handler, and the **toggle itself in the Options header row,
  left of the *Add option* button** — hidden (not just disabled) when `isGrid`
  or the type is `LINEAR_SCALE`, since it has no meaning there
- `pages/question-bank/questions.tsx` — a small "Shuffled" badge in the list,
  beside the existing selection-rule badge (optional but cheap)
- `pages/question-bank/question-bulk-upload.tsx` — the new column, see below
- `pages/questionnaires/questionnaire-preview-view.tsx` — a one-line note on
  shuffled questions that the preview shows the authored order (otherwise the
  preview looks like the toggle did nothing)
- `pages/question-bank/create-questionnaire.tsx` — nothing: it reuses
  `question-form-modal`, so the toggle appears in the questionnaire-authoring
  flow for free. Worth a check that its per-question summary line doesn't need
  the badge too.

**bodhassess-portal** — no change.

---

## 6. XLSX bulk upload

Yes, it needs a column, or every bulk-uploaded question is stuck non-shuffled.

- **New column: `shuffle`**, placed right after `risk` in the template's column
  order (they are the same kind of cell).
- Parsed exactly like `risk` is today — truthy on `1/true/yes/y`
  (case-insensitive), blank = `false`. Header matching already lowercases and
  strips separators, so `Shuffle`, `shuffle_options` etc. all land.
- **Old sheets import unchanged**: no column → blank → `false` → authored
  order, which is what those sheets have always meant.
- No new validation. The sheet writes MCQs only (`questionType: 'MCQ'` is
  hard-coded there), so the type conflict from §1 cannot arise, and shuffling a
  1-option row is a harmless no-op rather than an error.
- Template rows: set `shuffle: 'yes'` on the third demo row (the multi-select
  one) so the file demonstrates the column, `'no'` on the others.
- Review wizard: show a "Shuffled" chip on rows that have it, next to the
  existing selection-rule chip, so it is visible before submitting.

---

## 7. Open questions for you

1. **Freeze after responses?** Recommended: no (§1). Flag if you want it
   frozen like the option set.
2. **Pinned options** — should a "None of the above" / "Other" stay last? That
   needs a per-option `pinned` flag; not in this change unless you want it.
3. **`shuffleRows` for Likert grids** — same idea for the statements. Separate
   change, worth doing later.
4. **Assessment-level override** — a "shuffle everything" switch on the
   Assessment config, on top of the per-question flag? Not proposed; the
   per-question toggle is what you asked for.
