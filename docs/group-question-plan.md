# Group Question — BUILT 2026-10-08 (V49, GroupQuestionTest; this is the plan it was built from)

> One deviation from §1/§2 as written below, made during the build: a PLACED
> group's membership is NOT locked. Locking it would have made a group
> uneditable the moment the builder placed it in its own questionnaire — the
> exact flow the feature exists for. Instead `resyncGroupPlacements`
> re-splices every placing questionnaire's member placements in the same
> transaction (kept rows keep their optional flags, new members join
> required, tags re-stamped via the shared `PlacementTags`, content
> evicted). The first ANSWER still freezes membership, as decided.

## 0. Decisions (user, 2026-10-08)

1. `GROUP` is a BANK QUESTION TYPE: picking type "Grouped" in the question
   form opens a members editor where questions are CREATED INSIDE the group,
   the way a section holds questions. Creation of each member looks exactly
   like creating a normal question (own stem, options, MQ/MQT).
2. Members may be ANY type EXCEPT `GAMES` and `LIKERT_GRID` (so: MCQ single
   and multi-select, LINEAR_SCALE, SHORT_ANSWER; PARAGRAPH stays globally
   reserved; GROUP inside GROUP refused — depth 1).
3. Members are created fresh inside the group only; the bank list shows the
   group as ONE item. (A "copy from bank" convenience may come later.)
4. The group TRAVELS TOGETHER: under ONE_PER_PAGE its members share one
   page; the header counts members individually — "Questions 4–6 of 40".
5. Portal rendering: optional group heading, then per member its stem on its
   own line and its options laid out HORIZONTALLY (control + label side by
   side), WRAPPING to further lines when they run out of width. The control
   follows the member's type: radios, checkboxes (multi-select), the scale,
   a text box (short answer).
6. Optional/required is PER MEMBER, as for any question today.
7. Group membership FREEZES once any member is answered (the options rule,
   applied to the member list).

## 1. Model: children are real Questions; placements stay per member

- **`question.parent_question_id`** — nullable self-referencing FK
  (`fkQuestionParent`, `idxQuestionParent`) + nullable
  `group_sort_order` INT. One additive migration, plus appending `GROUP` at
  the END of the `question_type` MySQL enum (append-only rule; the table
  rebuild PARAGRAPH's comment promised is paid here).
- A member is a FULL `Question` row, so options, selection bounds, V40 text
  slots, `answerFormat`, MQT scoring, `AssessmentAnswer`, freezing, risk
  flags all work with ZERO changes. The GROUP parent carries only heading
  (stem, made OPTIONAL for this type only — the `@NotBlank` moves into
  `validateType`), `description` (the existing quieter sub-text, free), and
  the member list. The parent itself has no options, no selection rule, and
  NO question-level MQT scores — scores belong to members (veto if wrong).
- **Placement mechanism — the load-bearing trick**: the group parent is
  NEVER placed. Adding "the group" to a questionnaire makes the server
  expand it into ONE ORDINARY PLACEMENT PER MEMBER, contiguous in display
  order (contiguity enforced on every placement save; a member questionId
  sent directly to the PUT is refused, only the parent id may be sent).
  Consequences, all free:
  - `questionTag` per member (Q_4, Q_5, Q_6) → export sheet, Data Studio,
    report rules, "Questions 4–6 of 40" all count members naturally.
  - `isOptional` per member = the EXISTING per-placement flag, per
    questionnaire, no new column.
  - Removing the group from a questionnaire removes all member placements;
    the uqQq unique key and the sections model are untouched.
- Grouping info reaches the portal via the member's parent pointer:
  `PortalQuestionnaireContent` members carry `groupId`, plus one
  `groups: [{id, heading, description}]` list — additive on the Redis
  cache; a stale entry predates any group, renders flat, never wrong.

## 2. Backend rules

- `validateType` for GROUP: ≥ 2 members; member types per decision 2; each
  member fully validated by the SAME per-type rules as a standalone
  question (reuse, do not fork); blank heading allowed; `gameId`,
  scale fields, selectionRule etc. refused ON THE PARENT.
- Bank reads (`getAll`, search, delete-check, find-existing/StemMatcher)
  filter `parent IS NULL`; the group's response nests members.
  Display-name fallback for a blank heading: first member's stem, else
  "Group of N".
- Freeze: once ANY member has an answer — members cannot be added, removed
  or reordered (409, the optionsChanged pattern); each member's own options
  freeze under the existing rules; heading/description stay editable
  (wording only). Group delete = delete members too (composition), blocked
  while placed or answered exactly as today.
- Submit/validation: untouched — members are ordinary questions. No
  all-or-none group rule; per-member optional governs (decision 6).
- MemoryMesh: cut 1 ships members FLAT in `MemoryMeshAssessmentDetail`
  (grouping is presentation; precedent: questionLayout and thank-you are
  not carried). Attempt sync untouched. Carry {groupId, heading} later if
  MemoryMesh wants the visual grouping.
- XLSX sheet + AI import: refuse/skip GROUP, phase 2 (nested shape does not
  fit the flat sheet).

## 3. Portal

- Paging: consecutive questions sharing a `groupId` fold into ONE page
  under ONE_PER_PAGE (reusing the whole-page machinery: `renderQuestion(qi)`
  per member, `onWholePage` rules, "Questions 4–6 of 40" header). Under
  SECTION_PER_PAGE the group renders as one bordered block at its position
  inside the section page. A group never splits.
- Group block: heading (skipped cleanly when blank) + description, then per
  member: the existing "Q{n}" chip + stem + its control row — options
  horizontal, wrapping (decision 5); SHORT_ANSWER shows its one-line box;
  LINEAR_SCALE its existing horizontal control; multi-select checkboxes.
  Gridline treatment: a bordered row per member inside the block.
- Blocking/navigation: a group page is a multi-question page → SECTION-PAGE
  RULES (Next never greys; pressed, it outlines and scrolls to the blank;
  no auto-advance). Navigator, third "Optional, left blank" state, Clear
  answer, resume, partial save: all per member, unchanged.

## 4. Dashboard

- `question-form-modal.tsx`: type "Grouped" swaps the body for heading
  (optional) + description + a members list — add / edit / reorder /
  delete, each member editing with the SAME fields as the normal form
  (member type picker restricted per decision 2). Per-member "n of m MQTs
  mapped".
- Bank list: one row, "Group · 3 questions" badge. Builder/preview: the
  group drags as one unit and previews as the portal block; per-member
  Optional toggles where placements are edited today.

## 5. Untouched

Answer table, scoring engine rule, exports/Data Studio column machinery
(member tags), reports, respondent flows, games, demographics, sections
switch, thank-you page, deploy.
