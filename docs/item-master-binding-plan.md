# Items_Master binding — joining the practitioner's item codes to the platform

> **Status: PROPOSAL 2026-09-15.** Written after discussion; nothing built.
> Extends [report-rule-authoring-plan.md](report-rule-authoring-plan.md), which
> shipped 2026-09-07 — it does not supersede it. Every decision in that
> document's §3.1 (validity items get their own MQTs) and §3.2 (reverse scoring
> stays upstream) is assumed and depended upon here.
>
> Origin: the same workbook, re-read. `docs/Report Logic.xlsx` has three tabs
> and the importer reads **one** of them. The other two are not decoration —
> one is the dictionary the read tab is written in, and the other is a set of
> worked answers the intake sheet says we cannot produce ourselves.

## 0. Decisions proposed

| Question | Proposal |
|---|---|
| Which sheet does the importer read? | **Both, by name.** `SheetNames[0]` is a live bug — see §1. |
| What is Items_Master? | **Not rules. A mapping manifest.** It is the only artifact that says `I1` is a question in this bank and `Internal Drive` is that MQ. |
| Where does the mapping live? | A new **`ReportItemBinding`** table, keyed `(assessmentId, itemCode)`. Per-assessment, not per-Question — §4. |
| How are items matched to questions? | **Statement text first, position never.** Proposed by the importer, confirmed by a human, stored. §5. |
| What resolves `I1` in a rule? | A **deterministic substitution pass before the model is called**, not a better prompt. §6. |
| What is the binding actually for? | **Lints.** The mapping is worth having because it makes "the bank implements what the sheet declares" checkable. §7. |
| Sample_Calculator? | Parse into a dry-run fixture. §8. |

## 1. The live bug — only the first sheet is read

[`workbookToCsv`](../bodhassess-app/src/pages/Reports/reportRulesApi.ts#L232) takes
`wb.SheetNames[0]` with no name matching. In the practitioner's actual file the
first tab is **Items_Master**, not Scoring_Logic.

Walk it through [`ScoringSheetParser`](../spring-social/src/main/java/com/bodhpsychometric/service/report/ScoringSheetParser.java):
the header row has content in columns A, B and C, so it is not a heading and not
blank — it becomes a rule named **"Item_ID Admin_Position"** whose logic is the
word `Factor`. Each of the fifteen item rows follows: `I1 | 1.0 | Internal
Drive | ...` becomes a rule named **"I1 1.0"**. No row is under a `STEP`
heading, so every one warns and is filed under Score computation. Sixteen junk
rules import cleanly, and the preview reports no blockers because the names are
unique.

**Fix regardless of everything else below.** Replace `workbookToCsv` with a
`workbookToSheets` that:

1. matches sheet names case- and separator-insensitively (`items_master`,
   `itemsmaster`, `item master`; `scoring_logic`; `sample_calculator`), then
2. falls back to structure when the names are unfamiliar — a sheet whose first
   row contains a cell matching `/item[_ ]?id/i` is the manifest; a sheet with a
   column-A-only row matching `/^STEP\b/i` is the logic, and
3. **refuses** when it cannot identify a logic sheet, instead of importing
   whatever happened to be first.

The existing `{ FS: ',', blankrows: true }` conversion is right and stays —
the structure of the logic sheet *is* its blank rows.

## 2. What the three tabs actually are

| Tab | What it is | Today |
|---|---|---|
| **Items_Master** | The dictionary. Item code → factor, construct, statement, reverse flag, composite flag, presentation order. | **Unread.** Or read as rules, per §1. |
| **Scoring_Logic** | The rules. Written entirely in Items_Master's vocabulary. | Parsed into `STATEMENT` rules. |
| **Sample_Calculator** | Fifteen raw responses and the hand-computed answers. | **Unread.** §8. |

The asymmetry is the point: Scoring_Logic is the only tab the engine consumes,
and it is the one tab that cannot be understood on its own.

## 3. Why the reference fails — worked through the real rules

The rules name three kinds of thing, and the platform can currently resolve one
of them.

| The sheet says | It means | Platform key | Resolvable today? |
|---|---|---|---|
| `V3`, `V1`, `V2` | a validity item's raw 1–5 value | `mqt:<id>` (a `Validity` MQ, per authoring-plan §3.1) | **No** — nothing maps the code `V3` to that MQT's id. |
| `I1 + I2 + I3(rev) + I4` | the items of one factor | `mq:<id>` / `mqtt:<id>` | **No** — and there is no per-item numeric column for scored items at all. |
| `ID_score`, `AD_composite` | another rule's output | `[rule:slug]` | **Yes.** Built in `V28`, and the catalog already emits `writes:` hints for it. |

So the third kind works and the first two do not, which is why the workbook
translates badly: Step 1 and Step 3 are almost entirely items.

[`catalogPrompt`](../spring-social/src/main/java/com/bodhpsychometric/service/report/RuleTranslationService.java#L289)
hands the model a column list whose labels are MQT paths and a rule list whose
names are `1.1 Infrequency (hard fail)`. The string `V3` appears in neither. The
system prompt then — correctly — forbids guessing, so the *right* behaviour
today is an empty expression and `confident: false` for most of the workbook.
The feature is working as designed and the design is missing an input.

**`ans:` is not the answer.** `questionTag` is regenerated wholesale on every
placement save and is positional (`Q_1`, `Section_A_Q_1`). Binding `I1 → Q_1`
by `Admin_Position` would survive until the first reorder and then silently
re-point every item-level rule at a different item. Authoring-plan §3.1 already
rejected `ans:` for validity logic on exactly this ground; nothing here
reopens it.

## 4. The binding table — `V31`

Next free number is **V31** (`V30` is the highest present).

```
ReportItemBinding
  reportItemBindingId   bigint PK
  assessmentId          bigint NOT NULL          -- not an FK, matching ReportRule
  itemCode              varchar(40) NOT NULL     -- 'I1', 'V3'
  adminPosition         int NULL
  factorLabel           varchar(160) NULL        -- 'Internal Drive'
  constructLabel        varchar(160) NULL        -- 'Self-Efficacy'
  statement             text NOT NULL            -- the sheet's own wording
  reverseScored         bit NOT NULL DEFAULT 0
  inComposite           bit NOT NULL DEFAULT 1
  questionId            bigint NULL              -- resolved
  questionnaireQuestionId bigint NULL            -- the placement, for the tag
  mqId                  bigint NULL              -- resolved from factorLabel
  mqtId                 bigint NULL              -- resolved from constructLabel
  matchMethod           varchar(16) NOT NULL     -- EXACT | NORMALISED | FUZZY | MANUAL | NONE
  createdAt, updatedAt
  UNIQUE uqRibAssessmentItemCode (assessmentId, itemCode)
  INDEX  idxRibQuestion (questionId)
```

**Per-assessment and not a column on `Question`.** The same bank question placed
in two questionnaires has two tags, and may be `I1` in one instrument and `I7`
in another. An item code is a property of the instrument, not of the item —
putting it on `Question` would force one global numbering that no practitioner
agreed to.

**`statement` is stored even after `questionId` resolves.** It is what lets a
re-import detect that the practitioner reworded an item, and what answers "which
question did `I1` mean?" after someone edits the stem.

Migration rules apply as always: additive, `information_schema`-guarded so a
re-run is a no-op, no FK on `assessmentId` (matching `ReportRule`).

## 5. Resolution is a review step, not magic

The importer **proposes**; a human confirms. Nothing resolves silently.

**Items → questions.** In order, stopping at the first that yields exactly one
candidate among the questionnaire's placed questions:

1. **EXACT** — stem equals the statement.
2. **NORMALISED** — equal after lowercasing, collapsing whitespace, and
   stripping punctuation. Catches the curly-apostrophe and trailing-period
   cases, which is most real drift.
3. **FUZZY** — token overlap above a threshold, **always shown with its score
   and never auto-accepted**.
4. **NONE** — a picker, defaulted to the question at `Admin_Position` but not
   pre-selected.

Statement text is the join because it is the one field both sides hold
verbatim. Position is a tiebreaker inside step 3 and never a match on its own,
for the reason in §3.

**Factor → MQ, Construct → MQT.** `factorLabel` matches an MQ by name; then
`constructLabel` matches an MQT **within that MQ's tree only**. This is the part
that dissolves the "MQT names are deliberately not unique" problem the whole
codebase works around — the sheet supplies the parent, so `Self-Efficacy` under
`Internal Drive` is unambiguous even when three MQs have a `Self-Efficacy`.

**All-or-nothing, in the house style.** Preview computes every match and every
lint before anything is written; unresolved items are listed with a count
("3 of 15 items could not be matched") and block the import of any rule that
mentions them. A partially-bound sheet is worse than none: it produces rules
that look translated and silently omit an item from a sum.

## 6. What it buys, part one — substitution before the model

The payoff is not a richer prompt. It is **not calling the model for the part
that is now deterministic**, in the same spirit as `ScoringSheetParser`'s "no
AI" note.

A pre-pass over each rule's statement text, run at translation time:

- A token matching a bound `itemCode` for a **validity** item → that item's
  `[mqt:<id>]`. `IF V3 <= 3 THEN protocol_status = 'INVALID'` arrives at the
  model with the column already in it, and can only be shaped wrong, not
  pointed wrong.
- A **sum of item codes that is exactly the set of items bound to one MQ or
  MQT** → that `[mq:<id>]` / `[mqt:<id>]`. `I1 + I2 + I3(rev) + I4` is the whole
  of Internal Drive, which `MqtScoringService` already computes — including the
  reversal, per authoring-plan §3.2. The `(rev)` annotation is then **dropped
  deliberately and noted in the proposal**, because the report layer applying
  `6 - raw` would be a bug.
- A sum that is **not** exactly one trait's items → no substitution, and a
  blocking note naming the difference. This is the case worth catching: a
  factor whose sheet definition and whose MQT membership disagree is a wrong
  score, and it is invisible in any single report.

Only after that does the text go to `RuleTranslationService`, with the catalog
additionally annotating each column with its item codes:

```
[mqt:41]   Validity › Infrequency          item V3  (validity, excluded from composites)
[mq:7]     Internal Drive                  items I1, I2, I3(reverse), I4
```

Note there is **no per-item numeric column for scored items** — only validity
items get their own MQT. That is authoring-plan §3.1's decision and this plan
keeps it; see §11.1 for the consequence.

## 7. What it buys, part two — the lints, which are the real prize

Each of these is mechanical once the join exists and impossible without it.
They belong in a new `ItemBindingLint`, pure and static like
[`RuleReferenceLint`](../spring-social/src/main/java/com/bodhpsychometric/service/report/RuleReferenceLint.java),
surfaced in the import review and re-run on the report-setup page.

| Check | Severity | Why it matters |
|---|---|---|
| `reverseScored = Y` but the question's `optionScores` ascend with option order | **BLOCKING** | The sheet declares the reversal; `MqtScoringService` implements it in `OptionMqtScore`. Nothing checks they agree. When they don't, `mqt:` is silently wrong and **every report is confidently wrong** — the exact failure class [`ReportColumnCatalog`](../spring-social/src/main/java/com/bodhpsychometric/service/report/ReportColumnCatalog.java) says this design exists to prevent. |
| `inComposite = N` but the item's MQT sits under a scoring MQ | **BLOCKING** | Authoring-plan §3.1 makes exclusion structural. This is the check that proves it was actually done. |
| Item's question has a different option count than the sheet's scale | **BLOCKING** | Sheet says 1–5; a four-option question silently changes every range in Step 3 and every cutoff in Step 4. |
| A factor's MQ contains items the sheet does not list | **BLOCKING** | A composite quietly larger than the one the practitioner wrote. |
| An item in the sheet is not placed in the questionnaire | WARNING | Also what finally gives rule 1.2's *"all 15 raw responses"* a definition. |
| A placed question has no item row | WARNING | Usually a sheet written against an older version of the questionnaire. |
| `adminPosition` ≠ the placement's `sortOrder` | WARNING | Step 0.1 cares about presentation order; a mismatch is a real difference from what the practitioner piloted. |

The reverse-scoring check is the one that justifies the whole table on its own.

## 8. Sample_Calculator as a dry-run fixture

The intake sheet ([report-engine-rule-corpus-intake.md](report-engine-rule-corpus-intake.md) §3)
says worked answers are the one thing engineering cannot produce. The
practitioner already shipped them — fifteen raw responses in column C, and a
RESULTS block computing Internal Drive, Sustained Tenacity, Adaptive Execution,
the composite, the band, and all three validity verdicts.

`ReportDryRunTest` already hand-builds the Internal Drive factor from this tab
and asserts its total of **16**. Parsing the tab turns that from one hand-copied
number into the whole sheet, re-checked on every change:

- Inputs: `Item_ID` + `Raw (1-5)` from the item block, joined to questions
  through the same bindings.
- Expected: the RESULTS block's computed values.

**Caveat, honestly:** cached formula results only exist if Excel saved the file.
A script-generated workbook has formulas and no values, and SheetJS will read
nothing. Fallback is to evaluate the four sums ourselves from the bindings —
they are only sums, and the bindings give us the reversal flags — and to treat
the band and the flags as unavailable rather than guessed.

## 9. What no binding can fix

Three things the workbook asks for that are missing data, not missing mapping.
Worth stating so they are not mistaken for scope:

1. **1.3 speed check** (`< 45 seconds`) and **0.1 completion time.**
   `RespondentAssessmentMapping` has no `startedAt` / `completedAt`, and the
   dataset exposes no duration column. Proposed as `V29` in authoring-plan §6
   and [deliberately not built](report-rule-authoring-plan.md) — a column on the
   table the portal writes on every submission is its own blast radius. Still
   true, and still a separate decision.
2. **E1 retakes** ("store both attempts, use latest valid"). There are no
   per-attempt rows; a re-attempt replaces answers. Nothing historical can be
   re-derived.
3. **1.1 "do not compute any scores."** A BAND rule returning `'INVALID'` still
   lets every other rule run and still prints a report. Protocol invalidity
   wants to be a **gate** on the computation, not a string a rule returns. That
   is a semantic gap independent of all of the above, and probably the next
   thing worth designing after this.

## 10. Build order

Each step is useful shipped alone.

1. **§1 — two-sheet reading.** Fixes a live bug. No schema, no backend change
   beyond accepting a second CSV on `ScoringSheetImportRequest` and ignoring it.
2. **§4 + §5 — the table and the resolver**, surfaced in
   [report-rule-import.tsx](../bodhassess-app/src/pages/assessments/report-rule-import.tsx)
   as a third wizard step between "pick" and "review". Import still produces
   `STATEMENT` rules; nothing runs differently yet.
3. **§7 — the lints.** Value without touching translation at all.
4. **§6 — substitution.** Last, because it is the only step that changes what
   reaches the model, and it wants the lints already catching the cases where
   the sheet and the bank disagree.
5. **§8 — the fixture.** Any time after 2.

## 11. Open

1. **Should every item get its own MQT, not just validity items?** It would
   make rule 1.2 (straight-lining across all fifteen raw responses) expressible
   and give per-item columns for free. **Recommendation: no.** It doubles the
   taxonomy for one rule, and it makes the MQT tree a mirror of the item list
   rather than a model of the constructs. Straight-lining stays a `STATEMENT`
   rule until the `ansv:` numeric namespace authoring-plan §3.1 rejected is
   worth revisiting — which needs an answer for grid and multi-select questions
   first, where "the numeric value" is not one number.
2. **Re-import semantics.** A second upload of a corrected sheet — update
   bindings in place, or version them? Bindings are not pinned by computations
   the way rule versions are, so in-place update with a diff shown in the
   preview is probably right. Not settled.
3. **Does a binding belong to the assessment or the questionnaire?** Written
   above as `assessmentId` to match `ReportRule`. The argument for
   `questionnaireId` is that item codes describe the instrument and two
   assessments over one questionnaire should share them. Worth deciding before
   `V31` is written, because it is the one thing in this plan that a later
   migration cannot cheaply undo.
