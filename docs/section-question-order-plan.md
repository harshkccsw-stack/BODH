# Section-aware question order & numbering — plan

Status: **BUILT** 2026-08-14 (proposal written and approved the same day).

Decisions taken by the user, all applied: export order fixed alongside the
portal; progress bar stays global; the portal header shows the section name
with the GLOBAL count (`PR · Question 27 of 52`) while the navigator numbers
restart at 1 per section; the section instruction renders on the first
question of its section.

Shipped:

- `QuestionnaireQuestionRepository.DISPLAY_ORDER` — one order clause shared
  by all three placement queries; the derived-name method became
  `findInDisplayOrder` (callers: `QuestionController`,
  `QuestionnaireController.restampQuestionTags`).
- `PortalAssessmentDetailResponse.DISPLAY_ORDER` — the same order re-applied
  in Java on the respondent-facing path.
- `question-runner.tsx` — per-section numbering, section name in the header,
  section instruction banner.
- `create-questionnaire.tsx` — the two client-side re-sorts that would have
  braided the server's order back together now keep it.
- `SectionDisplayOrderTest` — new; pins the order through the dashboard
  list, the portal fetch and the export sheet, plus nulls-last after a
  section delete. Full suite: 85 tests green.
- Live read-only check against the running dev server: questionnaire 16
  (sectioned, 4 + 5) lists `Section_A_Q_1…A_4, Section_B_Q_1…B_5`, and
  assessment 14's export columns come back in that same order with its 2
  rows intact. Nothing was written to the shared DB.

## 1. The bug

In a sectioned questionnaire the portal delivers questions **interleaved
across sections** instead of section by section, and numbers them with a
questionnaire-global running index.

Screenshot evidence (52 questions, 4 sections): PR holds 1, 5, 9, 13, 17,
21, 25, 27…; BI holds 2, 6, 10, 14…; AI-E 3, 7, 11…; FC 4, 8, 12…. The
round-robin becomes a two-way alternation at 25 — exactly where the two
6-question sections run out. That is the signature of "sort by
position-within-section, ignoring which section".

## 2. What is actually stored

`QuestionnaireQuestion.sortOrder` is **per section, 0-based and dense** —
not questionnaire-global.

- The writer is the wizard: [`create-questionnaire.tsx:610-619`]
  `buildMappingEntries()` keeps one counter per `scope = d.sectionId`. PR#1,
  BI#1, AI-E#1 and FC#1 therefore all store `sortOrder = 0`.
- The backend stores whatever the client sends —
  `QuestionnaireController.java:416`.
- `assignQuestionTags` (`QuestionnaireController.java:431`) groups by
  section *first* and only then sorts by `sortOrder`, which is why the
  stored tags (`Section_A_Q_1`, `Section_C_Q_6`) are right even though
  delivery is wrong.
- This is a **known, documented** property, not an accident:
  `QuestionnaireQuestionTagTest.java:25-27` says in so many words —
  *"ordering (sortOrder, then id) interleaves sections — tags must NOT."*
  The tag stamper was given the workaround; nothing else was.

So: the data is fine, the tags are fine, the wizard is fine. Every **read
that sorts by `sortOrder` alone** is wrong.

Flat questionnaires are unaffected — with no sections the per-section
counter *is* the global one. That is why this only shows up now.

Note: the dev/staging DB on 3307 currently holds **2 sections and zero
sectioned placements**, so nothing here reproduces locally without building
fixture data first. The screenshots come from another environment.

## 3. Every read path, and what it does today

| Read path | Ordering used | Today | After fix |
|---|---|---|---|
| `findForPortalDelivery` (`QuestionnaireQuestionRepository.java:16`) → `PortalAssessmentService.getDetail` → portal take flow | `sortOrder, id` | **interleaved — the reported bug** | section-blocked |
| `findForExportColumns` (`:27`) → `AssessmentReportService.buildSheet:255` → raw-data XLSX / report sheet columns | `sortOrder, id` | **columns interleaved**: `Section_A_Q_1, Section_B_Q_1, Section_C_Q_1, …` | `Section_A_Q_1…A_20, Section_B_Q_1…` |
| `findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionnaireQuestionIdAsc` (`:12`) → `GET /api/questions/getByQuestionnaireId/{id}` (`QuestionController.java:112`) | `sortOrder, id` | interleaved JSON list | section-blocked |
| same method → `restampQuestionTags` (`QuestionnaireController.java:348`) | `sortOrder, id` | correct anyway — `assignQuestionTags` re-sorts within section | unchanged |
| `PortalAssessmentDetailResponse.from:150` | preserves query order | interleaved | section-blocked |
| `MqtScoringService` / scoring plan | keyed by ids, not order | correct | unchanged |

Consumers of `GET /getByQuestionnaireId` on the dashboard, all of which
re-group or re-sort client-side and are therefore *not* broken today:

- `create-questionnaire.tsx:163` (edit-load) → re-sorts by `sortOrder`
  alone at `:168`, then renders per section via `scopeDrafts` — display is
  correct, the underlying array is interleaved.
- `create-questionnaire.tsx:410` (import-from-questionnaire picker) →
  same re-sort at `:411`; the picker list is interleaved.
- `preview.tsx:39` → `questionnaire-preview-view.tsx:203-211`, which groups
  by section and sorts inside it, strays last. **This is the reference
  implementation of the behaviour we want.**
- `questions.tsx:62` (question bank filtered by questionnaire) — a flat
  list, order cosmetic.

## 4. Decision: keep `sortOrder` per-section, fix the ORDER BY

- **A (recommended)** — leave stored values alone; make every display-order
  read sort by the *section's* `sortOrder` first. No migration, no rewrite
  of live data, and it matches what the tag stamper and the preview already
  assume.
- **B — renumber `sortOrder` globally** (0…n-1 across the questionnaire).
  Needs a Flyway migration rewriting every sectioned placement on a shared
  staging DB, a change to the wizard's writer, and section reorder would
  then have to renumber every placement too (else moving Part B above Part A
  leaves its questions in the old delivery slots). Strictly more risk for
  the same outcome. **Rejected.**

## 5. Work items — backend (`spring-social`)

### 5.1 One canonical display order, three queries

```sql
order by case when qq.section is null then 1 else 0 end asc,
         s.sortOrder asc, s.sectionId asc,
         qq.sortOrder asc, qq.questionnaireQuestionId asc
```

- `findForPortalDelivery` — already has `left join fetch qq.section`; give
  it an alias (`left join fetch qq.section s`) and order by it. The alias is
  required: writing `qq.section.sortOrder` in the ORDER BY makes Hibernate
  emit a second, **inner** join, which would silently drop every
  section-less placement.
- `findForExportColumns` — add a plain `left join qq.section s` (NOT a
  fetch join; a fetch would fan rows out and the comment on that query
  explicitly avoids that).
- The derived-name method cannot express this — replace it with an explicit
  `@Query`, keeping the name or renaming to `findInDisplayOrder`. Two
  callers to update: `QuestionController.java:112`,
  `QuestionnaireController.java:348`.
- **Nulls last** is deliberate: a placement can lose its section
  (`deleteSection` detaches instead of deleting —
  `QuestionnaireController.java:322`), and both the wizard ("unassigned",
  `create-questionnaire.tsx:812`) and the preview (`stray`) show those after
  the sections.
- `s.sectionId` as the second key mirrors the existing tie-break in
  `SectionRepository.findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc`,
  so section order is identical everywhere.

### 5.2 Defence in depth (cheap, recommended)

Sort in `PortalAssessmentDetailResponse.from` as well, with the same
comparator (section sortOrder nulls-last → placement sortOrder → placement
id). Three lines, no DB needed to test it, and it means the one
respondent-facing path cannot be broken by a future caller passing an
unsorted list.

### 5.3 Comment maintenance

`QuestionnaireQuestionTagTest.java:25-27` documents the interleave as
expected behaviour. That comment becomes wrong and must be updated, or the
next person will "fix" the ordering back.

## 6. Work items — portal (`bodhassess-portal`)

All in `pages/take/question-runner.tsx`. Once §5 lands, *"answer all of
section A, then section B"* is satisfied by Next/Previous automatically —
there is no navigation logic to write. What remains is numbering.

1. **Derive per-section positions.** The section grouping already exists
   (`:211-230`, grouped by first appearance — which becomes contiguous
   after the backend fix). Extend that single pass to also produce, per
   absolute index: `{ sectionKey, posInSection, sectionSize, sectionTitle,
   sectionIndex }`.
2. **Navigator buttons** (`:301`) print `posInSection + 1` instead of
   `qi + 1`; the `title=` tooltip at `:291` likewise. React keys and
   `goTo(qi)` keep using the **absolute** index — only the label changes.
   This is the direct fix for "27" appearing where the wizard shows "7".
3. **Header counter** (`:247`), today `Question {index+1} of {total}`.
   Proposed sectioned form: `PR · Question 7 of 20`; flat questionnaires
   keep today's wording.
4. **Progress bar** (`:57`) — recommend it stays global (it measures
   progress through the assessment, and the per-section counts are already
   shown in the navigator). Open for discussion.
5. **Optional, and worth doing while we are here:** each section carries an
   `instruction` which the backend already delivers
   (`PortalSection.instruction`) and the portal **renders nowhere**. Two
   shapes:
   - inline banner above the first question of each section — small, no new
     state, no interaction with `autoNext`;
   - a between-sections interstitial ("Section 2 of 4 — BI" + instruction +
     Continue) — makes the section change explicit to the respondent, but
     adds a step to the runner's state machine and has to be suppressed on
     backwards navigation and coordinated with the auto-advance timer
     (`:196-201`).

   Recommend the banner now, interstitial only if you want the section
   change announced.

## 7. What changes for users

- **Portal:** questions arrive PR 1-20, BI 1-20, AI-E 1-6, FC 1-6, each
  numbered from 1. The navigator's grid becomes a contiguous run per
  section instead of a stripe of every 4th number.
- **Raw data XLSX / report sheets:** column ORDER changes to match the tags
  (`Section_A_Q_1 … Section_A_Q_20, Section_B_Q_1 …`). Column **headers,
  tags and cell values are unchanged**, and Data Studio keys off `colKey`
  (the tag), never position — but anyone with a saved sheet, a pivot, or a
  downstream template keyed to *column position* will see a shift. This is
  the one change worth announcing before it ships.
- **Wizard:** no visible change. Its edit-load array becomes
  section-blocked, which as a side effect makes the per-section up/down
  arrows (`moveDraft`, `:211`) walk a contiguous run instead of hopping over
  foreign sections. Optional tidy-up: change the two client-side re-sorts
  (`:168`, `:411`) to sort by section-then-order so the array matches the
  server's order rather than re-interleaving it. Not required for
  correctness — both places group by section before rendering.

## 8. What does NOT change

- No schema change, no Flyway migration, no data rewrite.
- No stored `questionTag` changes — the tags were already correct, and this
  is what guarantees existing exports still line up cell-for-cell.
- No scoring change: `MqtScoringService` and the MQ/MQT columns are keyed
  by ids.
- No submit-path change: `AssessmentAnswer` rows are keyed by
  (respondent, assessment, question, row, option) and the portal keys its
  answer map by `answerKey(questionId, rowId)` — never by position.
- Multi-select bounds, grids, shuffled options and auto-next are untouched;
  numbering is presentation only.
- Attempts in flight are safe: portal answers live in React state only
  (`take.tsx:37`, no local storage, no server-side resume), so there is no
  stored position to invalidate. A tab already open keeps the old order
  until reload.

## 9. Edge cases to keep in mind

- **Section-less placements in a sectioned questionnaire** — reachable via
  `deleteSection`. They sort last and group under "Other" in the portal,
  numbered from 1 like any other group.
- **Two sections with the same name** — the portal groups by `sectionId`,
  so they stay distinct; only the heading text repeats.
- **Empty sections** claim no tag letter (`assignQuestionTags` skips them)
  and never appear in the portal, since sections come from the placements.
  Ordering must not change that.
- **Section reorder** (`PUT /{id}/sections/order`) already re-stamps tags;
  after this change it also changes delivery order — which is the intent,
  and now the two can no longer disagree.
- **H2 vs MySQL:** tests run on H2 with Flyway disabled; `case when … is
  null` and `left join fetch … alias` are supported on both.

## 10. Tests

Backend (`./mvnw -B test`):

- New: sectioned delivery order — a questionnaire with sections A and B,
  2 + 2 questions saved with per-section `sortOrder` 0,1 / 0,1, then
  `GET /api/portal/assessments/{mappingId}` asserts
  `questions[*].stem` is A1, A2, B1, B2 (today it returns A1, B1, A2, B2).
  `PortalAssessmentControllerTest` has all the fixture scaffolding already;
  every existing case there is flat.
- New: a placement whose section was deleted sorts last.
- New: export column order for a sectioned questionnaire —
  `MqtScoringExportTest` builds sheets already, all flat.
- Update: the misleading comment in `QuestionnaireQuestionTagTest:25-27`.
  Its assertions stay green either way.

Frontend: `npm run typecheck && npm run build` in both `bodhassess-app` and
`bodhassess-portal`.

Live smoke (needs fixture data — see §2): a `__smoke__` questionnaire with
2 sections × 3 questions + assessment + allotment; verify the portal detail
JSON order and the export column order, then delete the `__smoke__` rows.

## 11. Decisions — settled

1. Progress bar in the portal: **global**.
2. Header wording: **section name + global count** — `PR · Question 27 of
   52`. The per-section number lives in the navigator, which is where it
   disagreed with the authoring screen.
3. Section instruction: **inline banner on the first question of each
   section** (no interstitial screen, so the auto-advance timer and the
   runner's state machine are untouched).
4. Export column order: **shipped with the fix**, so the sheet matches the
   tags.

Bulk upload was checked and is **not affected**: `/api/questions/bulk-create`
writes bank questions only — never a placement — and the sheet's `section`
column is matched by NAME (`question-bulk-upload.tsx:420-443`), not by
order. Uploaded rows still land at the end of their matched section, where
`buildMappingEntries` numbers them on save.
