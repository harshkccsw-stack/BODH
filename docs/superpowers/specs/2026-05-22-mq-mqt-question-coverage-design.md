# MQ/MQT → Question Coverage Tagging — Design

**Date:** 2026-05-22
**Status:** Approved (design)

## Goal

Let authors tag each question with the Measured Qualities (MQs) and Measured
Quality Traits (MQTs) it *covers*, as metadata that is independent of the
existing per-option scoring. The tags are used for **filtering/search** (Item
Explorer) and a **coverage summary** in the questionnaire builder.

## Background (current state)

- An MQ (`MeasuredQuality`) holds a recursive tree of MQTs. The MQ root is never
  scored against; only MQTs (at any depth) are.
- Questions map to MQTs **only**, via per-option `scores: [{mqt_id, score}]` and
  question-level `question_scores: [{mqt_id, score}]`. Scoring in
  `portal/take.tsx` aggregates totals keyed by `mqt_id`.
- The Item Explorer is **not** backed by the `items` table. It flattens
  questions out of published questionnaires
  (`item-explorer.tsx` `loadUserItems`) and layers per-item edits through an
  override table (`ItemDisplayState`, via `itemDisplayApi`).
- `published_questionnaires.questions` is stored as an opaque `JsonNode`
  (`PublishedQuestionnaire.java`), so new fields on a question round-trip with
  no DB migration.
- The legacy `Item.subDomains` (`List<{domain, weight}>`) is a separate
  weighted-scoring concept on the `items` table and is **not** reused here.

## Decision

Add a new dedicated `coverage` field on each question in the questionnaire JSON.
Do not reuse `subDomains`. Frontend-only change; no backend migration.

## Data shape

Each question gains an optional `coverage` object inside the questionnaire
`questions` JSON:

```jsonc
coverage: {
  mqs:  string[],   // MQ ids the question measures
  mqts: string[]    // MQT ids (any depth) the question measures
}
```

- IDs only. Display names are resolved from the questionnaire's `mqs` catalog
  (the same catalog the scoring picker uses).
- Omitted or empty `coverage` means "untagged" — fully backward-compatible with
  existing questionnaires.
- `ItemOverride` (frontend type) and the `ItemDisplayState` override JSON gain
  an optional `coverage` field of the same shape, so Item Explorer edits persist
  through the existing override layer.

## Components

### 1. Questionnaire builder — `create-questionnaire.tsx`

- Add the `coverage` field to the `Question` interface.
- New per-question **Coverage** section (near the question-level scores block)
  with two independent multi-selects:
  - **MQs** — root qualities (from the catalog).
  - **MQTs** — flattened tree rows from `flattenMqtsForPicker` (breadcrumb
    paths), independent of scoring.
- Wire `coverage` through every place a `Question` is constructed or persisted:
  - `addQuestion`
  - edit-mode loader (reads `q.coverage` from the fetched questionnaire)
  - import/clone from another questionnaire (`confirmImport`)
  - bulk import (`confirmBulkImport`)
  - save payload in `handleSaveQuestions` (`questions.map(...)`)
- Bulk import: accept optional `coverage_mqs` / `coverage_mqts` columns
  (semicolon-separated names), resolved against the catalog using the same
  resolve/create flow that already handles option MQ/MQT names. Add the columns
  to the downloaded template.

### 2. Item Explorer — `item-explorer.tsx`

- Read `coverage` off each flattened question; resolve names via the parent
  questionnaire's `mqs`.
- Display coverage as badges in the row / expanded view.
- Add a **coverage filter** (by MQ and/or MQT) alongside the existing
  vertical/format/status filters; include coverage names in the search match.
- Editing coverage in the explorer writes through `itemDisplayApi.upsertOverride`
  (consistent with how `subDomain`/`stem` edits already work). Add `coverage`
  to the `ItemOverride` type and merge it in `allItems`.

### 3. Coverage summary (reporting) — questionnaire builder

- A "coverage map" panel in the builder/preview listing each MQ and MQT and how
  many questions cover it (counted from the questions' `coverage`).
- No changes to the per-respondent reports pages in this pass.

## Out of scope

- Coverage block in the clinical/industrial/counselling reports pages (deferred).
- Auto-deriving coverage from existing option scores (possible later "suggest"
  convenience button).
- Any change to the `items` table or `Item.subDomains`.
- Any change to scoring (`scores` / `question_scores`) or `portal/take.tsx`.

## Testing

- Author a questionnaire, tag questions with MQs and MQTs, save, reload in edit
  mode → coverage round-trips.
- Bulk import a sheet with `coverage_mqs`/`coverage_mqts` → tags resolved/created
  and attached.
- Item Explorer shows coverage badges, the coverage filter narrows the list, and
  search matches coverage names.
- Edit coverage in Item Explorer → persists via override and survives reload.
- Builder coverage map shows correct per-MQ/MQT question counts.
- Existing questionnaires with no `coverage` load and save unchanged.
