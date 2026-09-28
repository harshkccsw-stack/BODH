# "Other — type your own" option on an MCQ (free-text OPTION, not a free-text question)

**STATUS (2026-09-28, later the same day): BUILT AND VERIFIED.** `V36`
applied to the local database (the running server on 8080 accepted a
`FREE_TEXT` option, which it could not have without the widened enum).
`./mvnw -B clean test` green at **454** (2 new in `FreeTextOptionTest`, 1 new
in `MemoryMeshAttemptSyncTest`), both frontends typecheck and build, the sheet
tests pass (47), live smoke of the three authoring refusals against 8080 with
the `__smoke__` row deleted after.

Decisions as taken (§11): **1** = A (`ContentType.FREE_TEXT`); **2** yes;
**3** Enter = Next; **4** taken later the same day — the export sheet and
Data Studio print `Label: what they typed` via `AssessmentAnswer.displayText()`;
**5** the 64 KB server cap reused, single-line input, no UI cap; **6** the
sheet marks the row by option NUMBER (`otherOption = 3`), not by a label
column; **7** local DB.

One unrelated fix on the way: `question-form-modal.tsx`'s `createNode`
declared three `let`s inside its `try` and read them in the `catch`, which
does not compile — hoisted above the `try`. It was already broken at HEAD.

The proposal as written follows.

## 0. What is being asked, and what already exists

Asked: a fifth kind of option beside TEXT / URL (IMAGE / VIDEO parked). An
MCQ has four ordinary options and a fifth one — when the respondent picks it,
a box appears and they type their own answer.

What already exists and must NOT be confused with it: **`SHORT_ANSWER` is a
question TYPE** (built 2026-08-13, `V17`, `docs/scale-range-and-short-answer-plan.md`).
The WHOLE question is a text box, it has no options, and the answer row is
`optionId = NULL, answerText = "…"`.

The new thing is Google Forms' "Other…" row: an **option** that is picked
like any other AND carries typed text. The answer row for it is
`optionId = <the Other option>, answerText = "…"` — both set, which today is
exactly the combination the validator refuses. So this is one new option
kind, one relaxed rule, and a handful of screens that have to learn the
option exists. No new table, no new column on the answer.

## 1. Model — where the flag lives

Two candidate axes:

| | put it on | pro | con |
| --- | --- | --- | --- |
| **A (recommended)** | `ContentType` gains a value, on OPTIONS only | it IS the dropdown the author already uses per option (Text / URL / Image / Video); freeze comparison, portal DTO, cache, MemoryMesh flattening all carry `contentType` already, so the value travels for free | `ContentType` is shared with the question STEM, where it is meaningless — must be refused there |
| B | new boolean `Option.acceptsText` | pure axis | a new column on `question_option`, a new field on four DTOs, a new term in `optionsChanged`, a new column in the sheet — for the same behaviour |

**Recommend A**, value name **`FREE_TEXT`** (UI label "Short answer"). Nine
characters, so it fits the entity's `length = 10` and the H2 test schema —
`SHORT_ANSWER` would not, and reusing that word would also blur it with the
question type.

Rules (`QuestionController.validateType` + option sanitizer):
- **MCQ only.** LINEAR_SCALE options are generated; a LIKERT_GRID's columns
  are one shared scale and "Other" per row makes no sense. Refused by name.
- **At most one per question.** Two "Other" rows is not a design anyone
  wants, and one is what every downstream screen assumes.
- **Refused on the stem** (`Question.contentType`), so nothing can store a
  question "made of" a text box.
- Its `optionText` is the LABEL on the button ("Other", "Something else —
  please say what"); required, like any option's text. `mediaUrl` refused.
- It keeps its own `OptionMqtScore` row(s) like any option — usually 0, but
  the author may score "Other" if the instrument says so. See §5.
- Position: authored anywhere; the portal delivers it LAST when
  `shuffleOptions` is on (shuffle the ordinary options, append the free-text
  one — `PortalAssessmentDetailResponse` line ~251). Google keeps "Other"
  last for the same reason: it is not one of the alternatives, it is the
  escape hatch after them.
- **Freeze is already right.** `optionsChanged` compares `contentType`, so
  switching an option to or from `FREE_TEXT` on an answered question is the
  existing 409 — and it must be, because that option's stored answers have
  no text.

## 2. Migration — `V36`

`question_option.content_type` is `enum('IMAGE','TEXT','URL','VIDEO')` (V1).
One `MODIFY COLUMN` widening it to add `FREE_TEXT`, behind the usual
`information_schema` + `PREPARE` guard. Table rebuild of `question_option`
only — small table, seconds.

- Do NOT widen `question.content_type`. Hibernate's validate compares the
  type name (`enum`), never the member list, so the stem column can stay
  narrower and the API refusal is the guard. If a `FREE_TEXT` stem ever
  slipped past validation MySQL would reject the insert — which is the
  right outcome.
- `assessment_answer` needs nothing: the V17 key
  `COALESCE(question_row_id,0), COALESCE(option_id,0)` already reads "one
  row per (respondent, assessment, question, row, option)", and an Other
  answer is one such row with text on it.
- **Before writing the file:** confirm which database `DB_PORT` points at
  and that the IDE is not going to auto-apply it to shared staging the
  moment it is saved (see memory: Flyway files auto-apply via the IDE).

## 3. Submit validation (`PortalAssessmentService.validate`)

Today: `answerText` on any non-`SHORT_ANSWER` question → 400. New rule set,
per entry:

| entry | rule |
| --- | --- |
| option is `FREE_TEXT`, selected | `answerText` REQUIRED, trimmed, non-blank, same `MAX_ANSWER_TEXT_BYTES` cap as a short answer |
| option is `FREE_TEXT`, text blank | 400 `"<label> needs the 'Other' answer written in"` — named the navigator's way, like every other message there |
| option is ordinary, `answerText` present | 400, unchanged ("answered by picking an option, not by typing") |
| `SHORT_ANSWER` question | unchanged |

- The `chosen` map keys on `(slot, optionId)`; carry the text beside it
  (`Map<AnswerSlot, Map<Long, String>>` or a parallel map keyed on
  `slot+optionId`) so the normalized entries come out as
  `(questionId, optionId, rowId, text-or-null)`. `AssessmentSubmissionWriter`
  already sets both fields when present — no change there.
- The selection floor/cap counts the Other option like any other: single
  choice → picking Other IS the one pick; `MAX 3` → A, C and Other is three.
  Nothing in `SelectionBounds` changes.
- `saveProgress` stores entries raw (only `questionId` is checked), so a
  partial snapshot with `optionId + answerText` round-trips with no change.
- `MemoryMeshAttemptSyncService` already ACCEPTS `option + text` (it only
  refuses "chose nothing and typed nothing"). Apply the same two rules
  there — text required on a `FREE_TEXT` option, refused on any other — or
  MemoryMesh can store a text on option B that nothing displays.

## 4. Portal — the part the question is really about

### 4.1 State
`answers: Record<slot, number[]>` stays as is. Free text for an Other option
is keyed by **slot + optionId**, not by slot: `optionTexts[`${slot}|${optionId}`]`
(or a third map). The existing `textAnswers` stays for `SHORT_ANSWER`; mixing
the two shapes into one map is what the earlier plan deliberately avoided.

- `buildEntries` (take.tsx): for every selected optionId, attach
  `answerText` if `optionTexts` has a non-blank one for that pair. Text for
  an option that is NOT selected is simply not sent — so a respondent who
  typed, changed their mind to option A, then changed back to Other, still
  has what they typed. Nothing to validate client-side beyond "selected ⇒
  non-blank".
- **Resume backfill (take.tsx `splitSaved`) has a trap.** It currently does
  `if (answerText) → textAnswers else if (optionId) → answers`. An Other
  answer has BOTH, and that branch order would drop the SELECTION and file
  the text under the wrong map. Must become: `optionId` present → `answers`
  (and, if `answerText`, → `optionTexts`); `optionId` null → `textAnswers`.

### 4.2 Rendering
The option button renders exactly as now. When it is selected and its
`contentType === 'FREE_TEXT'`, a single-line `<input>` slides in directly
under it, auto-focused, placeholder "Please specify…". Deselecting hides it
(text kept in state, see above). Grid rows never get one (rule §1).

`Media` / `mediaTypeFor` in `components/media.tsx` switch on `contentType`;
`FREE_TEXT` renders nothing there. `PortalContentType` union in
`lib/api.ts` gains the value.

### 4.3 "Answered" — `slotSatisfied`
Today a slot is satisfied when `min ≤ picked ≤ max`. Add: **AND every
selected `FREE_TEXT` option has non-blank text.** This one predicate feeds
Next's `disabled`, the navigator's green tick, `answeredCount` (heartbeat),
`pending` (Submit visibility), the partial-save trigger and
`firstUnansweredIndex` on resume — so it is the ONE place to change, plus
its mirror `questionSatisfied` in take.tsx. Miss it and the navigator shows
green, Next opens, and the server returns the 400 from §3.

### 4.4 Auto-next — the crux
`selectOption` computes `settled = every slot has picked === min === max` and,
with `autoNext` on, moves the page 350 ms later. Tapping "Other" on a
single-choice question makes `settled` TRUE at once — and the page would
slide away before the box even took focus. That is the SHORT_ANSWER
comment's exact failure ("no moment says done while someone is typing"),
arriving through the option path.

Rule: **a tap that selects a `FREE_TEXT` option never auto-advances**, so
`settled` must also require "no selected option is FREE_TEXT". Then:

| situation | what happens |
| --- | --- |
| single choice, taps option B | auto-advance as today |
| single choice, taps Other | box appears, focus in it; they type; **Next** takes them on |
| `EQUALS 3`, last tick is Other | no advance; type, Next |
| `EQUALS 3`, Other was ticked earlier, last tick is B | still no advance — Other is selected and needs its text checked; Next is gated by §4.3 |
| Other selected, then switched to B (single) | that tap re-qualifies: B is ordinary, `settled` true → auto-advance as usual |

Two optional conveniences, either is a one-liner — decide:
- **Enter in the box acts as Next** when the slot is satisfied. An explicit
  keypress, not a timer, so nothing slides away under a half-typed word. I
  would add this; it is what a single-line field invites.
- Advance on BLUR of the box. I would NOT: on a phone, blur fires when the
  keyboard is dismissed, which is not "done".

### 4.5 Inactivity popup and attention timer
The runner's root `<div>` listens for `onPointerDown` and `onKeyDown`, and
`noteActivity` re-arms the 2-minute countdown on either — keydown bubbles
up from the input, so **every keystroke in the Other box already counts as
activity**, exactly as it does in the SHORT_ANSWER textarea today. No
change needed. Belt-and-braces worth one attribute: add `onInput` beside
`onKeyDown` on that root, because some mobile keyboards and IME
compositions deliver text with a single `keydown` of key "Unidentified" or
none at all for autocomplete — `input` fires per change regardless.

The attention budget runs ONLY while the popup is up, and the popup blocks
the page, so typing cannot interact with it. Unchanged.

Heartbeat: `answeredCount` flows from §4.3. Unchanged.

### 4.6 Partial save
Sectionless papers save every 5 newly answered questions; the count comes
from §4.3, so a question whose Other box is still empty does not tick it —
which is right, and means a snapshot never carries a selected-Other with
no text unless the section-change trigger fires mid-typing. That is fine:
the snapshot stores whatever is there, and resume re-opens the box.

## 5. Scoring, Data Studio, export, reports

- **`MqtScoringService` — no change.** `option != null` → that option's
  `OptionMqtScore` map is added, plus the once-per-question score. The
  TYPED TEXT is never scored; the OPTION is, exactly like any other. Worth
  one sentence in the score editor: "the score is for choosing Other, not
  for what they write".
- **Cells** — `DataStudioDatasetService.rows` (line ~256) and
  `AssessmentReportService` export (line ~313) both do
  `option != null ? optionText : answerText`, which would print "Other" and
  lose the text. Decide the cell shape:
  1. `"Other: what they typed"` — **recommended**: the label keeps the cell
     countable/comparable (`== "Other…"` no longer matches exactly, but
     Data Studio `==` on text is lexical, so an author wanting the choice
     can still test `startsWith`… which does not exist — see next line);
  2. the typed text alone — reads best, but "Other" disappears from
     frequency counts entirely;
  3. two cells — a second Data Studio column per free-text option
     (`Q7 — Other text`). Cleanest for analysis, most work.
  I would ship (1) now and note (3) as the Data Studio follow-up; the
  expression engine has `==`/`!=` only, no `CONTAINS`, so a rule that
  branches on "picked Other" needs either (3) or a `STARTSWITH`.
- **Scoring key** (`ScoringKeyEntry`, export) lists the option by label —
  fine as is.
- **Report engine** — score columns come from option scores; nothing reads
  `answerText`. Item catalogs list option labels. No change. A NARRATIVE
  tag quoting free text is out of scope.

## 6. Dashboard authoring

- `question-form-modal.tsx`: `CONTENT_TYPES` gains `{ value: 'FREE_TEXT',
  label: 'Short answer' }`. The per-option `<select>` (line ~1180) already
  iterates it; the media-URL row must NOT appear for it; the text
  placeholder becomes "Label shown on the button, e.g. Other". Client
  validation: MCQ only, at most one, label required. The MQT score editor
  for that option stays.
- `questionApis.ts` `QuestionContentType` union gains the value; the stem's
  content-type toggle row (line ~772) must EXCLUDE it (it maps over the
  same list today).
- The inline editor in `create-questionnaire.tsx` and the questionnaire
  preview share the form/model — the preview should draw the box under the
  selected option so the author sees what the respondent will.
- `questions.tsx` list: a small "Other" badge beside the option count, like
  the existing type badges.

## 7. XLSX sheet (`question-sheet-rules.ts`, template, tests)

Options are `option1..optionN` (+ `optionNDescription`, `optionNScores`),
all `contentType: 'TEXT'`. Rather than a per-option type column, add ONE
optional column **`otherOption`** = the label of the free-text option
(blank = none), with `otherOptionScores` beside it in the same score-cell
syntax. Mirrors "at most one", costs one column, and the review wizard just
shows it as the last option with a badge. `selectCount` validation must
count it. `ai-sheet-import` produces the same payload shape, so it inherits
the rule if the parser is shared.

## 8. MemoryMesh

- **Out (`/api/sync/memorymesh/assessments/{id}`)** flattens
  `PortalQuestionnaireContent`, whose options carry `contentType` — so the
  value REACHES MemoryMesh unasked. Their importer copies options by
  position; unless it learns the value it will render "Other" as a plain
  option with no box, and a sync back would then carry no text — which our
  door would refuse (§3) as "needs the Other answer written in". Tell that
  team the enum grew; nothing on our side to do beyond that.
- **In (`/attempts`)** already resolves `optionPosition` + `answerText`; add
  the §3 rule.

## 9. Tests (all H2, no Flyway)

Backend, in the style of `ShortAnswerTest` / `QuestionTypeTest`:
- authoring: refused on the stem, on LINEAR_SCALE, on LIKERT_GRID, and as a
  second free-text option; accepted on an MCQ with a score; switching to/
  from it on an answered question is 409.
- submit: selected Other with text → one row with both fields; selected
  Other blank → 400 with the label; text on an ordinary option → 400
  (existing); `MAX 2` with A + Other → accepted; snapshot with both fields
  round-trips.
- scoring: Other's option score counts, the text does not; export /
  Data Studio cell prints `Label: text`.
- MemoryMesh attempt: same two refusals.

Frontend: typecheck + build, then a live smoke through the portal with
`autoNext` ON: tap Other → page must NOT move; type → Next opens; Enter
advances (if adopted); resume from a partial save re-opens the box with the
text; navigator stays amber until text is typed.

## 10. Files

| layer | file | change |
| --- | --- | --- |
| backend | `model/question/enums/ContentType.java` | `FREE_TEXT` + javadoc ("options only") |
| | `db/migration/V36__add_free_text_option.sql` | widen `question_option.content_type` |
| | `controller/question/QuestionController.java` | validateType rules; stem refusal; mediaUrl refusal |
| | `dto/PortalAssessmentDetailResponse.java` | shuffle keeps FREE_TEXT last |
| | `service/PortalAssessmentService.java` | §3 rules, text carried per (slot, option) |
| | `service/MemoryMeshAttemptSyncService.java` | §3 rules |
| | `service/datastudio/DataStudioDatasetService.java`, `service/AssessmentReportService.java` | cell = `label: text` |
| portal | `lib/api.ts` | union value |
| | `components/media.tsx` | no-op case |
| | `pages/take/take.tsx` | `optionTexts` state, `buildEntries`, `splitSaved` fix, `questionSatisfied` |
| | `pages/take/question-runner.tsx` | inline input, `slotSatisfied`, `settled` guard, Enter=Next, `onInput` |
| dashboard | `question-bank/questionApis.ts`, `question-form-modal.tsx`, `questions.tsx`, `questionnaires/questionnaire-preview-view.tsx` | §6 |
| | `question-bank/question-sheet-rules.ts` + template + `__tests__` | §7 |
| docs | `CLAUDE.md` | one bullet under Domain decisions |

## 11. Decisions to take before building

1. Axis: `ContentType.FREE_TEXT` (A) or a boolean (B). — I say A.
2. MCQ only, at most one, delivered last under shuffle. — yes / no.
3. Auto-next never fires on the Other tap; **Enter = Next** in the box. — adopt Enter?
4. Cell shape in Data Studio / export: `Label: text` now, own column later.
5. Length: reuse the 64 KB byte cap, single-line input, no new column. (A
   UI `maxLength` of ~500 is cheap if you want one; the server cap stays.)
6. Sheet column `otherOption` / `otherOptionScores`.
7. Which DB `V36` lands on — answer before the file is written.
