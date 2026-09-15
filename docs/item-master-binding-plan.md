# Items_Master binding — joining the practitioner's item codes to the platform

> **Status: §1, §4 and §5 BUILT 2026-09-15. §6-§8 proposed, all decisions
> settled.** The sheet picker, the `report_item_binding` table and the resolver
> have shipped; §11 is settled, not open. What is left is the part that uses
> them: the lints (§7), substitution before the model (§6) and the
> Sample_Calculator fixture (§8).
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
| Does every item get its own MQT? | **No.** Items stay grouped under their constructs; only validity items keep the MQTs authoring-plan §3.1 gave them. Settled 2026-09-15 — §11.1. |
| Re-importing a corrected sheet? | **Updates bindings in place**, with a diff in the preview. No versioning. Settled 2026-09-15 — §11.2. |
| Assessment or questionnaire? | **Assessment**, matching `ReportRule`. Settled 2026-09-15 — §11.3. |

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

> **BUILT 2026-09-15.** [`workbookSheets.ts`](../bodhassess-app/src/pages/Reports/workbookSheets.ts)
> does the picking; the wizard now states which tab it read and what it skipped.
> `ScoringSheetParser.isItemList` refuses an item list posted straight at the
> API, because the browser picker is a convenience and the parser is the record.
> 326 backend tests green. The tab rules were transpiled and run against
> `docs/Report Logic.xlsx` in node — which is why that module has no `@/`
> imports, and why it must keep none.

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

1. ~~**§1 — two-sheet reading.**~~ **Done 2026-09-15.** The second CSV was
   *not* added to `ScoringSheetImportRequest` after all — an accepted-and-
   ignored field is dead weight until step 2 has something to do with it, and
   step 2 changes that signature anyway.
2. ~~**§4 + §5 — the table and the resolver.**~~ **Done 2026-09-15.** `V31`,
   `ReportItemBinding`, `ItemMasterParser`, `ItemStatementMatcher`,
   `ItemBindingService`, `/api/report-item-bindings`, and the review step in the
   wizard. Import still produces `STATEMENT` rules; nothing runs differently
   yet. 363 backend tests green (326 before). See §12.
3. **§7 — the lints.** Value without touching translation at all.
4. **§6 — substitution.** Last, because it is the only step that changes what
   reaches the model, and it wants the lints already catching the cases where
   the sheet and the bank disagree.
5. **§8 — the fixture.** Any time after 2.

## 11. Settled — 2026-09-15

All three answered. Nothing in this document is open; §10 can be built as
written.

### 11.1 Every item does NOT get its own MQT

**Decided: no.** Items stay grouped under the construct they measure. Only
validity items keep the dedicated MQTs authoring-plan §3.1 gave them, and that
is an existing decision this one does not reopen.

The reasoning stands as written: per-item MQTs would double the taxonomy to
serve one rule, and would make the MQT tree a mirror of the item list rather
than a model of the constructs.

**Three consequences, all of which the build must handle explicitly:**

1. **There is no numeric column for a single scored item.** A rule naming one —
   `IF I3 >= 4 THEN ...` — is **not translatable**, and §6's substitution pass
   must refuse it with a message saying so rather than reaching for the
   construct's MQT. Substituting the trait for one of its items is the exact
   shape of silent wrongness this plan exists to prevent: it parses, it runs,
   and it is a different number.
2. **Substitution only fires on an exact set match.** `I1 + I2 + I3(rev) + I4`
   becomes `[mq:7]` **only** when those four are precisely the items bound to
   that MQ. Any difference — an extra item in the bank, a missing one in the
   sheet — is a blocker naming the difference, never a best effort.
3. **Rule 1.2 (straight-lining across all fifteen raw responses) stays a
   `STATEMENT` rule.** Permanently, unless the `ansv:` numeric namespace
   authoring-plan §3.1 rejected is revisited — which still needs an answer for
   grid and multi-select questions, where "the numeric value" is not one
   number. Do not build a workaround for this one rule.

### 11.2 Re-import updates bindings in place

**Decided: in place.** A second upload of a corrected sheet overwrites the
matched columns on `(assessmentId, itemCode)`. No version table, no history.

**Why that is safe, stated precisely, because it is the part that could go
wrong:** a binding is **authoring-time metadata only**. §6 resolves item codes
at translation time, and what gets stored is a rule version holding the
resolved `[mq:7]`. The *rule version* is what a computation pins, exactly as it
does today. So a binding can change afterwards without altering the meaning of
any rule already written, and certainly not of an approved report. If that ever
stops being true — if anything starts resolving a binding at report time — this
decision has to be revisited, and that is the trigger to watch for.

**What the preview must show before it writes:** a diff, not a count.

| Case | Treatment |
|---|---|
| Item code is new | Listed as an addition. |
| Item code exists, matched question unchanged | Silent. |
| Item code exists, **matched question changes** | Listed prominently. This is the one that can move a rule's meaning, and it is usually a reworded statement rather than an intended remap. |
| Item code exists, flags change (`reverseScored`, `inComposite`) | Listed, and re-runs §7's lints — a flag flip is exactly what those checks exist for. |
| Item code is **absent from the new sheet** | **Deleted**, and named in the preview. The sheet is the authority; a binding the practitioner has removed is a stale fact, and stale facts are what this table exists to eliminate. |

A deleted code that a rule's text still names is a **blocking** lint, so the
delete cannot quietly orphan a rule.

### 11.3 Bindings key on the assessment

**Decided: `assessmentId`**, as §4 is written. Matches `ReportRule` — not an
FK, same reasoning.

The cost is accepted and worth writing down so nobody re-litigates it later:
**two assessments over the same questionnaire each need their own import.** The
counter-argument — that item codes describe the instrument, so a questionnaire
key would share them — is real but loses to the failure it would allow. A
questionnaire-level binding is shared state that one assessment's re-import can
silently change underneath another's rules, and §11.2's in-place update makes
that a live hazard rather than a theoretical one. Per-assessment bindings mean a
re-import can only affect the assessment whose sheet was re-imported.

`V31` is therefore written as specified, with `UNIQUE uqRibAssessmentItemCode
(assessmentId, itemCode)`.

---

## 12. STATUS — §4 + §5 built and verified 2026-09-15

**363 backend tests green** (326 before, so 37 new); `npm run typecheck` and
`npm run build` clean. `V31` applied to the local database on 3310 and the app
boots against it with `ddl-auto: validate`, which is the only real proof the
entity and the hand-written migration agree.

| Shipped | Where |
|---|---|
| `V31` — `report_item_binding`, unique on (assessment, item code) | `db/migration/` |
| The entity, with `MATCH_*` constants | `model/report/ReportItemBinding.java` |
| Item tab reader, by column NAME | `service/report/ItemMasterParser.java` |
| The matcher — tiered, greedy, pure | `service/report/ItemStatementMatcher.java` |
| Preview / diff / in-place import | `service/report/ItemBindingService.java` |
| `/api/report-item-bindings` — preview, import, getByAssessment | `controller/report/` |
| The review step, with a per-row question picker | `pages/assessments/report-item-binding-step.tsx` |
| The item tab reaching the API at all | `pages/Reports/workbookSheets.ts` (`itemsCsv`) |

### Four things worth knowing

1. **The notes block forced the table-end rule.** The real sheet ends with a
   blank row, then "NOTES FOR TECH TEAM" and four paragraphs — each of which has
   text in the Item_ID column and nothing in Statement. A parser that merely
   skipped rows without a statement would report four items with no statement
   and refuse the whole workbook. The table therefore ends at its first blank
   row, hard, and warns how many rows it ignored.
2. **Matching had to become tiered and greedy, not item-by-item.** Two items
   whose statements differ by a word will both clear the fuzzy floor against
   each other's questions; matched in sheet order, the first claims the second's
   question and the second takes what is left. Taking every EXACT match first,
   across all items, then NORMALISED, then FUZZY, is what puts each item on its
   own question. `ItemStatementMatcher` is pure so that rule is tested directly.
3. **Ambiguity resolves to nothing, deliberately.** Two questions with the same
   stem, or two equally close fuzzy matches, bind NEITHER. An unresolved item
   blocks the import and is one click to fix; a confidently wrong one is
   invisible for the life of the assessment.
4. **The construct/factor scoping works and is pinned by a test that builds the
   collision.** `ItemBindingImportTest` creates "Self-Efficacy" under TWO
   qualities and asserts each item resolves to the one its Factor column names.
   That is the claim the whole table rests on, so it is tested against the
   thing it claims to solve rather than against a happy path.

### Verified across the layer boundary

The browser converts the workbook and the backend parses the text, so the two
halves can drift without either side failing. They are pinned together: the
backend's `report/items-master.csv` fixture is byte-identical to what
`readWorkbook` produces from `docs/Report Logic.xlsx`, checked by running the
frontend module in node against the real file.

### Deliberately not built

- **The lints (§7).** The bindings exist and nothing yet checks them against the
  question bank. This is the next slice and the one that pays for the table:
  `reverse_scored = Y` against ascending option scores is a silently wrong
  report today.
- **Substitution (§6).** Item codes are stored but `RuleTranslationService` does
  not read them yet, so a rule saying `IF V3 <= 3` still translates no better
  than before.
- **No live curl smoke.** `/api/report-item-bindings` requires a dashboard
  sign-in and the local database has no known account. The MockMvc tests drive
  the same controllers through the same auth, including the 401.
