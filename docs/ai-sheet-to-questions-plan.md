# Any sheet → our sheet — AI-assisted question import

> **Status: §12 steps 1-8 BUILT (§14); the §16 review BUILT in full (§17),
> 2026-09-16.** What is left is `PER_ROW_TEXT` (§12 step 9), refused with a
> clear message rather than guessed at, and I5 (temperature), deliberately not
> done — see §17.
>
> Origin: the fixed XLSX template is a real barrier. A practitioner arrives
> holding `docs/Report Logic.xlsx` — `Items_Master`, fifteen rows, columns
> named `Factor` and `Construct` and `Statement` — and is told to retype it
> into a sheet with `stem`, `option1`, `option1Scores`. This proposes that the
> model does that retyping, and that **a human approves an ordinary
> template sheet** rather than approving anything the model wrote directly
> into the database.
>
> Neighbour, not overlap: [item-master-binding-plan.md](item-master-binding-plan.md)
> binds item codes in a workbook to questions that **already exist**. This plan
> is about the questions not existing yet. The two meet in §5 — both resolve
> `Factor`/`Construct` to MQ/MQT by name scoped to the parent, and that rule
> should stay one rule.

## 0. Decisions proposed

| Question | Proposal |
|---|---|
| What does the model produce? | **A mapping spec, not questions.** A small JSON describing how to read the sheet. Our code does the transforming. §2 |
| Does the model see every row? | **Normally no — a sample.** Header, a handful of rows, and the non-tabular text. The one exception is `PER_ROW_TEXT`, which cannot work that way and therefore asks first. §2, §9 |
| Who copies the stem text? | **Our code, from the cell.** The model never retypes an item, so it cannot silently reword one. §2 |
| What is the artifact the user approves? | **A normal `questions` template sheet** — downloadable, editable, and re-uploadable through the existing button. §6 |
| One validator or two? | **One.** `parseQuestionsXlsx` splits into `parseQuestionRows(rows)` + a file wrapper; the AI path feeds the same function. §10 |
| Duplicate stems? | **Detected in v1.** The bank is matched before import and repeats are flagged. §8 |
| How many sheet shapes? | **All four modes, and the model picks.** Column names and structure vary per practitioner; reading them is the model's job and the preview is the check. §3, §11.4 |
| What happens to the fixed template? | **Nothing. It stays, and it stays the default.** One upload button; the fork happens *after* the file is read, on whether it matches. §10.1, §10.2 |
| Likert scale → which question type? | **MCQ with labelled options, never `LINEAR_SCALE`.** A scale's point scores are generated ascending and cannot express reverse scoring. §4.3 — this one is settled by the code, not by taste. |
| Missing MQ/MQT? | The sheet declares a **path**; resolve the longest prefix that exists and **create only the missing tail** under it. Existing and missing are shown together, per node, with question counts. Ambiguity resolves to **nothing**. §5.1 |
| Create taxonomy and questions atomically? | **Yes — one endpoint, one transaction.** `POST /api/questions/import` creates MQs, MQTs and questions together or not at all. §5.4 |
| Is the draft persisted? | **No table in v1.** The download IS the save. §6.4 |
| Where does the transform run? | **Backend**, like `ItemMasterParser`. It is the logic most needing tests, and this project has no frontend test runner. §10 |

## 1. What the practitioner actually has

`Items_Master`, verbatim, is the shape to design against:

| Item_ID | Admin_Position | Factor | Construct | Statement | Reverse_Scored | In_Composite |
|---|---|---|---|---|---|---|
| I1 | 1 | Internal Drive | Self-Efficacy | If I get a totally new kind of task or role, I am sure I can learn what it needs. | N | Y |
| I3 | 3 | Internal Drive | Growth Mindset | When something does not come naturally to me, I take it as a sign I am just not built for it. | **Y** | Y |
| V3 | 9 | Validity | Infrequency | I have attended at least one class or meeting in the past year. | N | **N** |

…then a blank row, then four paragraphs headed **NOTES FOR TECH TEAM**:

> 2. Response scale for ALL items: 1=Strongly Disagree, 2=Disagree, 3=Neutral,
>    4=Agree, 5=Strongly Agree. Force a response on every item (no skips).
> 3. Reverse_Scored=Y items (I3, I6, I11): transform before scoring using
>    score = 6 - raw.
> 4. In_Composite=N items (V1, V2, V3) are NEVER added to any factor or
>    composite score.

Three things follow, and they are the whole design brief:

1. **The options are not in the sheet.** They are one sentence of prose at the
   bottom. Any importer that only reads columns produces fifteen questions with
   no answers.
2. **The scoring is not in the sheet either**, and one column silently inverts
   it. `Reverse_Scored` is a five-character cell that changes what every option
   is worth.
3. **The notes block breaks naive parsers.** Four rows with text in column A
   and nothing in `Statement`. `ItemMasterParser` already learned this the hard
   way — the table ends at its first blank row, hard.

A sheet like this is not unusual. It is what a psychometrician's instrument
looks like before anyone asks them to fit a platform.

## 2. The core move — the model maps, our code transforms

The naive version is: hand the workbook to the model, ask for our sheet back.
Do not do that. It fails in four ways at once — the token bill scales with row
count, long outputs truncate mid-row, a row can be dropped without anything
noticing, and **the model retypes every item**, which for a psychometric
instrument is a validity break rather than a typo. "Strongly Disagree" quietly
becoming "Strongly disagree" is survivable; a reworded stem is a different item.

So the model answers a question about **shape**, once, and the answer is small:

```
workbook ──► sheets as CSV (browser)  ──► sample ──► MODEL ──► mapping spec (JSON, ~40 lines)
                     │                                              │
                     └──────────── every row ──► EXPANDER (our code, deterministic) ──► canonical rows
```

What this buys, stated as properties rather than adjectives:

- **Stems are copied by us, from the cell.** The spec names a column; the
  expander reads that column. The model's output does not contain a single
  item's text, so it cannot change one. This is the property worth the whole
  design.
- **Row count is checkable.** The spec declares `dataRows: {from, to}`. We
  expand exactly that many rows. A mismatch is a blocker, not a warning.
- **Cost and latency are flat.** One small call whether the sheet has 15 items
  or 1500.
- **The output is explainable.** "I read column `Statement` as the stem and
  built five options from the note on row 20" is a sentence a practitioner can
  check. "Here are 1500 rows, good luck" is not.
- **It is the same discipline already shipped.** `RuleTranslationService` puts
  the model behind a closed whitelist and a validator, and
  item-master-binding-plan §6 chose "a deterministic substitution pass before
  the model is called, not a better prompt". This is that instinct applied one
  layer earlier.

### 2.1 The one case the spec cannot cover

Sheets where each row's options are different **and** live inside free text:

```
1. How often do you plan ahead?  a) Never  b) Sometimes  c) Always
```

No spec describes that; it needs the model to read each row. `PER_ROW_TEXT`
mode is a **second, separately-confirmed** call that does send every row,
entered only when the first pass says it is needed, and shown to the user as
"this sends all 120 of your items to OpenAI — continue?".

**In scope** (§11.4): sheets vary per practitioner and some of them will be
shaped this way. It is still built **last**, because it is the only mode whose
output is not derived from cells by our own code — the §2 guarantee that the
model cannot reword an item does not hold here, so a `PER_ROW_TEXT` preview
must show the source cell beside every extracted option, and say that it does.

## 3. The mapping spec

One JSON object. The model fills it; we validate every field before use.

```jsonc
{
  "sheet": "Items_Master",
  "headerRow": 1,
  "dataRows": { "from": 2, "to": 16 },
  "ignoredRows": [{ "from": 17, "to": 22, "why": "NOTES FOR TECH TEAM block" }],

  "columns": {                       // canonical field → source header
    "stem": "Statement",
    "externalId": "Item_ID",         // kept for the reviewer, not imported
    "order": "Admin_Position",
    "mq": "Factor",
    "mqt": "Construct",
    "reverse": "Reverse_Scored",
    "excludeFromComposite": "In_Composite"
  },

  "options": {
    "mode": "SHARED_SCALE",
    "evidence": "row 20: 'Response scale for ALL items: 1=Strongly Disagree … 5=Strongly Agree'",
    "scale": [
      { "text": "Strongly Disagree", "value": 1 },
      { "text": "Disagree",          "value": 2 },
      { "text": "Neutral",           "value": 3 },
      { "text": "Agree",             "value": 4 },
      { "text": "Strongly Agree",    "value": 5 }
    ]
  },

  "scoring": {
    "mode": "OPTION_VALUE_TO_ROW_MQT",
    "reverseWhen": { "column": "Reverse_Scored", "truthy": ["Y", "YES", "TRUE", "1"] }
  },

  "selection": { "rule": null },     // null = single choice, the existing default

  "unmapped": ["Item_ID — no platform field; shown in review only"],
  "notes": ["Items are to be presented in Admin_Position order."],
  "confident": true,
  "questions": ["Is 'Factor' your Measured Quality and 'Construct' the type beneath it?"]
}
```

**`options.mode` is the enumeration that matters.** Four values cover nearly
every real sheet:

| Mode | Source sheet looks like | Expansion |
|---|---|---|
| `COLUMNS` | `Option A \| Option B \| Option C \| Option D` | One option per named column; blank cell = no option |
| `SHARED_SCALE` | One scale for every item, stated in prose or a legend tab | The same N options on every row |
| `SCALE_COLUMN` | A column saying which scale each row uses, plus a dictionary of scales | Per-row lookup into the dictionary |
| `PER_ROW_TEXT` | Options embedded in a cell | §2.1 — second pass, opt-in |

`confident: false` is a first-class answer, exactly as it is in
`RuleTranslationService`. It does not block — it puts the review panel in a
louder state and pre-expands the questions the model wants to ask.

## 4. The expansion — deterministic, and the part that needs tests

Given the spec above and the real sheet, row `I1` becomes:

| stem | option1 | option1Scores | … | option5 | option5Scores |
|---|---|---|---|---|---|
| If I get a totally new kind of task… | Strongly Disagree | `Self-Efficacy:1` | … | Strongly Agree | `Self-Efficacy:5` |

and row `I3`, which is `Reverse_Scored = Y`:

| stem | option1 | option1Scores | … | option5 | option5Scores |
|---|---|---|---|---|---|
| When something does not come naturally… | Strongly Disagree | `Growth Mindset:5` | … | Strongly Agree | `Growth Mindset:1` |

### 4.1 Reverse scoring is `(min + max) − value`, computed, never hardcoded

The note says `6 - raw`. Six is `1 + 5`. Read it off the scale bounds in the
spec — a 0–4 scale reverses at 4, and a hardcoded 6 would silently produce
negative scores that still import cleanly.

**Reversal is applied upstream, into `OptionMqtScore`, and that is the correct
place** — report-rule-authoring-plan §3.2 already settled that reverse scoring
stays upstream, and item-master-binding-plan §7 makes "`reverse_scored = Y` but
the option scores ascend" a **blocking** lint. A sheet imported this way
produces exactly what that lint expects to find. The two features agree by
construction rather than by coincidence.

### 4.2 The option order stays the sheet's order; only the scores invert

Do not import a reversed item with its options listed 5→1. The respondent sees
the scale the practitioner wrote; the inversion is a scoring fact, not a
presentation one. `shuffle` stays `no` for scale items for the same reason — an
ordinal scale delivered out of order is broken, and the backend refuses it for
`LINEAR_SCALE` already.

### 4.3 MCQ, not `LINEAR_SCALE` — settled by the code

A 1–5 agree scale looks like it wants `questionType: LINEAR_SCALE`. It cannot
be, for two reasons found in
[QuestionController.java:625-655](../spring-social/src/main/java/com/bodhpsychometric/controller/question/QuestionController.java#L625-L655):

1. **A scale's points are generated with `score = the point's own value`,
   ascending.** There is no way to express 5,4,3,2,1. Every reverse-scored item
   in the workbook would import with the wrong sign, and nothing would say so.
2. **A scale's options are `"1"`, `"2"`, `"3"` — the labels are thrown away.**
   Only `scaleLowLabel`/`scaleHighLabel` survive, so "Neutral" and "Disagree"
   would be lost.

So: **MCQ with five labelled options.** This also means the canonical template
needs no new columns — it "writes MCQs only" today and that stays true.

### 4.4 What the expander refuses

All-or-nothing, in the house style. Any of these blocks the whole import:

- Declared row count ≠ expanded row count.
- A spec column naming a header that is not in the sheet.
- A row whose stem cell is blank inside the declared data range.
- `SHARED_SCALE` with fewer than two options.
- A scale value that is not a number, or duplicate values within one scale.
- `reverseWhen` naming a column whose values are not in the truthy/falsy sets —
  a `Reverse_Scored` column containing `R` must stop the import, not be read
  as "not reversed".

## 5. MQ / MQT — resolve, then offer to create

This is the step the user asked for by name, and the rule is already written
down in item-master-binding-plan §5: **`Factor` matches an MQ by name; then
`Construct` matches an MQT within that MQ's tree only.** The sheet supplies the
parent, which is what dissolves the "MQT names are deliberately not unique"
problem the rest of the codebase works around. Keep it one rule, ideally one
piece of code.

### 5.1 The sheet declares a PATH; we resolve as much of it as exists

`Factor` + `Construct` is not a pair, it is a **two-segment path** into a tree
that can be any depth. Since column names and structure vary per practitioner
(§11.4), the general form is what has to be built:

```
Internal Drive  ›  Self-Efficacy  ›  Task Confidence
     MQ                MQT                MQT
```

A sheet may supply one segment, two, five, or one cell holding
`Internal Drive > Self-Efficacy` with a delimiter. The spec (§3) says which
columns form the path and in what order; the resolver treats them all the same
way.

**The rule: resolve left to right, stop at the first segment that does not
match, and everything from there down is created under the last matched node.**
Longest matched prefix — nothing clever, and it is what makes the partial case
fall out rather than being special-cased.

| The sheet says | The bank holds | Result |
|---|---|---|
| `Internal Drive › Self-Efficacy` | both | **Nothing to do.** Matched, shown with ids |
| `Internal Drive › Growth Mindset` | the MQ only | **Partial.** Create `Growth Mindset` under the existing MQ #7 |
| `Sustained Tenacity › Perseverance` | neither | **Create both**, MQ then MQT beneath it |
| `Internal Drive › Self-Efficacy` | `Self-Efficacy` exists — but under **Adaptive Execution** | **Create a new one under Internal Drive**, and say the name exists elsewhere. See below |
| `Internal Drive › Self-Efficacy` | two MQTs of that name under that MQ | **Resolves to nothing.** Forced pick — §5.2 |
| `Self-Efficacy` alone, no parent column | anything | **Cannot be anchored.** An MQT needs exactly one parent; the user picks the MQ, or the question imports unmapped |

**Row four is the one that matters, and it is the reason this is a path and not
a name lookup.** MQT names are deliberately not unique across the taxonomy —
`Self-Efficacy` under `Internal Drive` and `Self-Efficacy` under `Adaptive
Execution` are different constructs that happen to share a word. Reusing the
existing node because the *name* matched would silently score fifteen items
into somebody else's factor. So the parent wins, a new node is created, and the
panel says **"a `Self-Efficacy` also exists under Adaptive Execution — not
this one"** so a reviewer who actually meant that one can say so.

#### Level is part of the path — a root is not a branch

**Decided: if the structure matches, reuse it; if the same name sits at a
different level, create a new node.** And the good news is that this needs no
special case at all — it is what the longest-prefix rule already does. Each
segment is matched only against the **children of the segment before it**, so a
`Self-Efficacy` nested under `Confidence` is simply not a candidate when the
sheet says `Internal Drive › Self-Efficacy`. Nothing to add; just a consequence
worth knowing you get.

**Why it is the right default, and this is checkable rather than a matter of
taste:** [`MqtScoringService`](../spring-social/src/main/java/com/bodhpsychometric/service/MqtScoringService.java)
computes **subtree totals — "own + every descendant"** — alongside each node's
own score and the MQ total. So depth is not cosmetic. Attach fifteen items to a
root `Self-Efficacy` when the bank's real one lives under `Confidence`, and
`Confidence`'s subtree total silently stops including them. The node would look
right in every list and every report built on it would be quietly wrong — the
failure class this whole design exists to avoid.

**But the sheet genuinely cannot say which it meant.** A practitioner with two
columns writing `Internal Drive › Self-Efficacy` against a three-level taxonomy
may be *abbreviating* — "under Internal Drive, somewhere" — not asserting a
root. That ambiguity is real and unresolvable from the file. So the rule is:
**default to the visible, reversible action** (create a node, shown in the tree
with its count, deletable afterwards) over the invisible one (attach items at a
level nobody chose), and **name every near miss** so the reviewer can overrule
in one click.

Two near misses are worth detecting, and both are cheap because the MQ's whole
tree is already loaded for the picker:

| Detected | Shown as | One-click alternative |
|---|---|---|
| The name exists **elsewhere in the same MQ's tree**, at another depth or under another parent | *"a `Self-Efficacy` also exists at Internal Drive › Confidence › Self-Efficacy — this will be a new one"* | Use that node instead |
| **The path is rooted deeper than the sheet thinks** — the FIRST segment matches no MQ, but matches an MQT somewhere | *"no Measured Quality named `Self-Efficacy`, but an MQT by that name exists at Internal Drive › Self-Efficacy — anchor the path there?"* | Re-anchor the whole path under that node |

The second is the **root-treated-as-a-branch** case, and catching it matters
more than it looks: without it, a sheet whose top column names a *construct*
rather than a *factor* silently creates a whole parallel Measured Quality — a
second `Self-Efficacy` tree beside the real one, with real items in it. Cheap
to detect, expensive to discover later.

A created node whose name already exists somewhere in that MQ's tree is a
**warning, never a blocker**. MQT names are deliberately non-unique, and the
same construct genuinely can appear at two levels of a hierarchy; the reviewer
decides.

#### What you are shown — existing and missing, in one tree

Distinct paths are collected from the expanded rows and **deduplicated**: four
questions naming `Internal Drive › Growth Mindset` create one MQT, not four.
Each node carries how many questions depend on it, because that is what tells
you whether a mistake is worth stopping for.

```
✓ Internal Drive                      existing MQ #7
  ✓ Self-Efficacy                     existing MQT #41                    5 questions
  + Growth Mindset                    CREATE under Internal Drive         4 questions
✓ Validity                            existing MQ #2
  + Social Desirability               CREATE under Validity               2 questions
  + Infrequency                       CREATE under Validity               1 question
+ Sustained Tenacity                  CREATE as a new Measured Quality
  + Perseverance                      CREATE under Sustained Tenacity     4 questions
~ Adaptive Execution                  existing MQ #9
  ~ Learning Agility                  matched as "Learning agility"       1 question

4 measured quality types and 1 measured quality will be created.
2 of the 6 paths already exist in full.
```

Three markers, and the third is the point of showing this at all:

- **`✓` matched** — exists, shown with its id so it can be checked.
- **`+` create** — missing, with the parent it will be created under. Defaulted
  on; a checkbox, so nothing is created that the reviewer did not leave ticked.
- **`~` matched loosely** — NORMALISED rather than EXACT: `Learning agility`
  in the sheet, `Learning Agility` in the bank. Almost always right, and shown
  separately **because it is the one kind of match we bent the name to make**.

Every node offers the same three ways out, and they stay UI state until approve
(§5.4) — toggling creates nothing:

| Choice | When |
|---|---|
| **Create** | Default for a clean miss |
| **Use an existing one instead** | A dropdown scoped to valid parents. Covers the rename case — sheet says `Grit`, the bank calls it `Perseverance` — and the row-four case where they did mean the other `Self-Efficacy` |
| **Leave unmapped** | Import the questions with no MQT scores. **Legal and deliberately offered** — a question with no mapping is valid today and the review panel already warns about it. Forcing somebody to invent taxonomy in order to import questions would be a trap, and they can map it later in the question form |

#### This is exactly why §5.4's payload carries `parentTypeRef`

Creating `Sustained Tenacity › Perseverance` is a new MQT whose parent is a new
MQ that has no id yet. A partial path two levels deep — `A › B › C` where only
`A` exists — is a chain of pending nodes each anchored to the one before. That
is the ref graph in §5.4, and it is not generality for its own sake: the
partial-path case is the ordinary case, and it produces those chains on any
sheet deeper than two segments.

### 5.2 Ambiguity resolves to nothing

Two MQTs named `Self-Efficacy` under the same MQ → **neither** is chosen, and
the row becomes a forced pick. This is
[`ItemStatementMatcher`](../spring-social/src/main/java/com/bodhpsychometric/service/report/ItemStatementMatcher.java)'s
rule and the reasoning transfers exactly: an unresolved row is one click to
fix, a confidently wrong one mis-scores every report for the life of the
instrument.

Matching is EXACT then NORMALISED (lowercase, collapse whitespace, strip
punctuation) — the two tiers that catch real drift. **No fuzzy tier here.**
Fuzzy is defensible when matching a statement to a question that certainly
exists; it is not defensible when the alternative is creating a correctly-named
MQT, which is free.

### 5.3 Create-in-place is genuinely new UI

Nothing in the app creates an MQ or MQT from outside the Measured Qualities
page today — `ScoreEditor` picks from `choices` and offers no way to add one.
So this is a new control, and the smallest honest version is: a checkbox per
unmatched row, a name field pre-filled from the sheet, and the parent shown as
fixed text. Creation order is MQs first, then MQTs parent-before-child, then
the expanded rows are rewritten with the real ids, then `bulk-create`.

### 5.4 One endpoint, one transaction — `POST /api/questions/import`

**Decided 2026-09-16: atomic.** Taxonomy and questions are created together or
not at all. Ten separate calls followed by a failing `bulk-create` would leave
qualities behind, and the retry would then be resolving against a taxonomy the
first attempt invented.

Lives on `QuestionController`, beside `/bulk-create`, so it calls the same
private `firstProblem(...)`, `resolveMqts(...)`, `applyFields(...)`,
`rebuildOptions(...)`, `writeScores(...)`. That is the whole reason not to put
it in a new class: the existing comment — *"One entry point so /create,
/bulk-create and /update cannot drift apart on what they check"* — has to keep
being true with a fourth caller.

#### The payload — forward references, because the ids do not exist yet

A question's score cell says `Growth Mindset` and there is no `Growth Mindset`
to point at. Resolving by name at the backend would re-open the ambiguity §5.2
exists to close, so the payload carries explicit **refs**:

```jsonc
{
  "newQualities": [
    { "ref": "q1", "name": "Sustained Tenacity", "description": null }
  ],
  "newQualityTypes": [
    { "ref": "t1", "name": "Perseverance",    "qualityRef": "q1" },   // under a NEW MQ
    { "ref": "t2", "name": "Growth Mindset",  "qualityId": 7 },       // under an EXISTING MQ
    { "ref": "t3", "name": "Deep Focus",      "parentTypeRef": "t1" } // under a NEW MQT
  ],
  "questions": [
    { "stem": "…", "options": [
        { "optionText": "Strongly Disagree",
          "mqtScores": [ { "mqtRef": "t1", "score": 1 } ] },      // pending
        { "optionText": "Agree",
          "mqtScores": [ { "measuredQualityTypeId": 41, "score": 4 } ] } // existing
    ] }
  ]
}
```

An MQT takes **exactly one** anchor from `qualityRef` / `qualityId` /
`parentTypeRef` / `parentTypeId` — the existing controller's two anchors, each
with a pending twin. A score entry takes **exactly one** of `mqtRef` /
`measuredQualityTypeId`. Both "exactly ones" are pass-A checks.

New DTOs (`QuestionImportRequest` and friends), never a widened
`MqtScoreRequest`: every existing caller of `/create`, `/update` and
`/bulk-create` must keep meaning exactly what it means, and a nullable
`mqtRef` on the shared record would be a field three endpoints have to ignore.

#### The order of operations, and the one keyword the whole thing rests on

| Phase | Does | On failure |
|---|---|---|
| **A — validate without ids** | refs unique; every referenced ref exists; the ref graph is acyclic and orderable parent-before-child; every *given* id exists; each question passes `firstProblem`; exactly-one-anchor and exactly-one-score-key | plain `ResponseEntity.badRequest()` — nothing is written yet |
| **B — create taxonomy** | MQs, then MQTs in topological order | **throw** |
| **C — resolve refs → ids, then the existing pass-2 write loop** | `resolveMqts` + `applyFields` + … | **throw** |

**Phases B and C must THROW, never return.** CLAUDE.md already records the
trap in the general case — *"a return mid-loop still COMMITS what was saved"* —
and this endpoint is exactly where it bites: a `return
ResponseEntity.badRequest()` after phase B has run commits the taxonomy and
silently reproduces the non-atomic behaviour this endpoint was built to
prevent. It would look like it worked. `ResponseStatusException(BAD_REQUEST,
msg)` rolls back and
[`ApiExceptionHandler`](../spring-social/src/main/java/com/bodhpsychometric/exception/ApiExceptionHandler.java)
already turns it into the house `{"message": …}` body, so the fix costs
nothing and the bug is invisible. **This deserves a test that asserts a failed
import left zero new MQs behind** — it is the only way anyone finds out.

#### Two traps inside phase B

1. **`sortOrder` is computed from sibling count**, and the existing controller
   sets a root MQT's parent with `node.setMeasuredQuality(mq)` — which does
   *not* add it to `mq.getTypes()`. That is fine for one create, which re-reads.
   Creating three roots under one new MQ in a single transaction that way gives
   all three `sortOrder = 0`. Use the sync helpers — `mq.addType(node)` and
   `parent.addChild(node)`, both of which keep both sides in sync — so each
   node sees the ones created before it.
2. **Duplicate names among siblings must be refused.** MQ and MQT creation have
   no uniqueness check today and MQT names are deliberately not unique
   *globally* — but two MQTs with the same name under the same parent make §5's
   parent-scoped resolution permanently ambiguous, and §5.2 says ambiguity
   resolves to nothing. So this endpoint refuses to create a name that already
   exists among its siblings (or, for an MQ, at the root), and says which one.
   A new rule, applying only here, because only here is the name chosen by a
   machine reading somebody's spreadsheet.

## 6. The review surface

One state — an array of canonical rows — with four views of it.

### 6.1 "How I read your sheet"

Shown first, before any rows. The spec in plain English, with the evidence:

> Read **Items_Master**, rows 2–16 (15 items). Ignored rows 17–22 (the
> "NOTES FOR TECH TEAM" block). Stem from **Statement**. All items share one
> 5-point scale, taken from the note on row 20. Scored into the MQT named by
> **Construct**, under the MQ named by **Factor**. **3 items are
> reverse-scored** (I3, I6, I11), so their option scores run 5→1.

Plus the model's own questions, if it asked any. This panel is where a wrong
spec gets caught, and it is cheap to read — which is the point of it being one
paragraph instead of 15 rows.

### 6.2 Side-by-side, first three rows

Source row and expanded result, together. Catches the off-by-one that reads
`Construct` where it meant `Factor` far faster than any amount of prose.

### 6.3 Edit, then download

The grid is editable — stem, option text, scores, risk, section, drop-a-row.
"Download generated sheet" writes the same rows through the same XLSX writer as
`downloadTemplate`, producing a file that re-uploaded through the **normal**
button yields an identical import. That round-trip is a property worth stating
and worth a test: it is what makes "check it in Excel and fix it there" a real
escape hatch rather than a dead end.

### 6.4 Approve

Approve runs the rows through `parseQuestionRows` — the same validator the
manual path uses, no exceptions and no bypass — then the existing review wizard
if you want it, then `bulk-create`. **No draft table in v1.** Nothing is saved
until approve, exactly as the current modal promises, and the download is how
you keep work across a closed tab.

## 7. What the model is not allowed to do

| Not allowed | Enforced by |
|---|---|
| Emit item text | The spec has no field for it; stems are read from cells |
| Name an MQT id | The spec carries names only; ids are resolved in §5 |
| Invent a column | Every spec column is checked against the sheet's real headers |
| Drop or add rows | Declared range vs. expanded count, §4.4 |
| Choose a selection rule it cannot justify | Default is single choice — what every existing sheet means |
| Invent scores | No scoring evidence → empty score cells and a reviewer note, never a guess |
| Reach the database | It cannot. Its output is a spec consumed by an expander whose output goes through the existing validator |

## 8. Checks that fall out for free

- **Duplicate stems — in v1, decided 2026-09-16.** Uploading the same sheet
  twice currently creates fifteen more bank questions.
  [`ItemStatementMatcher.matchAll`](../spring-social/src/main/java/com/bodhpsychometric/service/report/ItemStatementMatcher.java)
  is pure, static and already matches statements against existing questions —
  point it at the bank and report "3 of these 15 stems already exist".
  **A warning, not a blocker**, and per row rather than per import: a genuinely
  new instrument may legitimately reuse a standard item, so the reviewer picks.
  Each flagged row gets **skip** (leave the existing question alone, the
  default) or **create anyway**. EXACT and NORMALISED tiers only, no fuzzy —
  a near-miss stem is a different item until a human says otherwise.
- **`In_Composite = N` vs. `Factor`.** In the real sheet the three `N` rows are
  exactly the three `Factor = Validity` rows. That is not a coincidence —
  report-rule-authoring-plan §3.1 makes exclusion **structural**, by where the
  MQT sits. So `In_Composite = N` on a row whose factor is a scoring MQ is a
  warning worth raising: the sheet and the taxonomy disagree about what counts.
- **`Admin_Position` vs. import order.** Import in the sheet's order; if the
  position column is present and not 1..n, say so.
- **Scale width consistency.** Two different scale widths in one `SHARED_SCALE`
  sheet is a contradiction, not a feature.

## 9. What leaves the building, and what it costs

`OpenAiClient`'s doc draws a line: "Rule text and COLUMN NAMES. Never
respondent rows." **This feature crosses that line and the plan should say so
plainly** — it sends the practitioner's own item text to OpenAI. No respondent
data is involved at any point, which is the important half.

**Settled 2026-09-16: consent is the fork.** Nobody's sheet reaches OpenAI
unless they choose the AI route over the template at the §10.2 warning screen,
so that screen is not merely a signpost — it is where the user agrees, and it
must state in one line what gets sent before either button is pressed. Which
also means the warning screen can never be skipped, auto-advanced, or
remembered as a preference.

What it sends is a **sample**: header row, ~10 data rows, every non-tabular text
block, and the sheet names. Enough to infer a shape; not the corpus. The cap is
a real cap — a 1500-row sheet sends the same ~10 rows as a 15-row one. The one
exception is `PER_ROW_TEXT` (§2.1), which cannot work that way and must
therefore ask.

Cost: one small call per upload. At the dev model (`gpt-4.1`; production runs
`gpt-5`) this is fractions of a cent, and the same reasoning
`application.yml` already records applies — being cheap here buys nothing and
risks a silently mis-mapped column.

The UI must state what is sent, before the button, in one line. Reuse the
`/ai/available` pattern: if no key is configured the button is not shown at
all, rather than shown and failing.

## 10. Where the code goes

**Backend** — the transform, because it is the logic that most needs tests and
this project has no frontend test runner (item-master-binding-plan, §12).
Follows the precedent that shipped on 2026-09-15: browser converts sheets to
CSV, Java parses.

```
service/question/import/
  SheetSampler.java        sample → prompt (cap, redact nothing, count rows)
  SheetMappingSpec.java    the spec record + its validation
  SheetMappingService.java calls OpenAiClient, validates, ONE retry with the
                           validator's complaint — the RuleTranslationService shape
  CanonicalRowExpander.java  spec + full CSV → canonical rows.  Pure. Tested hard.
controller/question/
  QuestionImportController.java   GET /api/questions/ai/available
                                  POST /api/questions/ai/map-sheet
dto/
  SheetMappingRequest / SheetMappingResponse (spec + rows + notes + blockers)
```

**Frontend** — `bodhassess-app/src/pages/question-bank/`:

```
ai-sheet-import.tsx      the panel: spec summary, side-by-side, grid, download
questionImportApi.ts     available() / mapSheet()
question-bulk-upload.tsx  refactor: parseQuestionsXlsx = readFile + parseQuestionRows
                          — parseQuestionRows is what the AI path calls
```

Reuse `Reports/workbookSheets.ts`'s `readWorkbook` for the multi-sheet read; it
already handles the blank-rows-are-structure problem and deliberately has no
`@/` imports so it runs in node.

### 10.1 The fixed template is untouched

**The existing template path stays exactly as it is, and stays the default.**
Nothing in this plan removes it, deprecates it, or routes it through the model.
Download template → fill it in → upload → review wizard → `bulk-create` keeps
working byte for byte, and remains the only path that is documented, offline,
free, and unaffected by whether OpenAI is configured or reachable.

That is not politeness toward an old feature — it is the fallback the whole
design leans on. `OpenAiClient`'s own doc says every failure there "costs one
button on one authoring screen"; that sentence is only true while a complete
manual route exists beside it. A practitioner with no key, no network, or a
sheet the model reads wrongly is never blocked from importing questions.

Concretely, what this feature must not touch:

| Stays | Note |
|---|---|
| The **Download template** button and its `questions` + `mqts` sheets | Unchanged. §6.3's generated download deliberately reuses the same writer and ships the same `mqts` reference sheet, so both paths hand out the same file shape |
| `parseQuestionsXlsx(file, choices)` behaviour | Step 1 of §12 splits it into `parseQuestionRows` + a file wrapper. Callers in `questions.tsx` and `create-questionnaire.tsx` keep the same signature and the same results — a pure refactor, and if it changes any message it has gone wrong |
| The existing error text for a genuinely empty sheet | "No data rows found in the sheet" must still say exactly that. The AI offer appears only when the sheet has rows but **no `stem` column** — i.e. a real sheet in the wrong shape, not an empty one |
| The review wizard and all-or-nothing `bulk-create` | Both paths converge on them; neither gets a bypass |

### 10.2 One door, then a fork

**There is still exactly one "Upload XLSX" button.** The user attaches their
file as they do today; the fork happens *after* the file is read, on whether it
matches. Two entry points would mean asking someone to classify their own sheet
before they have any reason to know the answer.

```
Upload XLSX ─► read file ─► does it match our format?
                                    │
        ┌────────────── YES ────────┴──────── NO ──────────────┐
        │                                                      │
  review wizard                                        warning screen
        │                                     "not our format" + what would be sent
        ▼                                                      │
     create                                 ┌──────────────────┴──────────────────┐
  (today, untouched)                 Download template                     Map it with AI
                                       fill it in                                 │
                                            │                        spec ─► expand ─► panel
                                            │                      preview · edit · download
                                            │                            │              │
                                            └─────────── ① ──────────────┘              │
                                              back to "Upload XLSX", top                │
                                                                                        ▼
                                                                  approve ─► POST /questions/import
```

**① is the path that makes this safe.** A sheet the AI produced, downloaded and
corrected in Excel re-enters through the *same* upload button, matches, and
goes through the review wizard like any hand-written sheet. There is no second
import route to keep in step, and no way for an edited-in-Excel sheet to be
treated differently from one typed into the template.

**The trigger is the absence of a `stem` column, not a failed parse.** The two
are different and must stay different:

| What the file is | What happens |
|---|---|
| Has `stem`, parses clean | Review wizard → create. Today, unchanged |
| Has `stem`, has row errors | The existing red box — *"Fix these in the sheet and re-upload"*. **It is our format, just wrong**, and laundering it through the model would turn a fixable typo into a re-interpretation |
| Has rows, **no `stem` column** | The warning screen. This is the fork |
| No rows at all | "No data rows found in the sheet", exactly as today. An empty file is not a foreign format |

**The warning screen** is a real screen, not a toast: it is where consent to
send item text to OpenAI happens (§9, §11.1), so it states in one line what
would be sent, offers **Download template** and **Map it with AI** as equal
choices, and is never skipped or remembered as a preference.

An outbound paid call must never fire on a file pick — reading the file is
free, and the model is only reached by pressing the second button.

If no key is configured, `/ai/available` is false: the warning screen shows the
template route alone, and the rest of the modal looks and behaves precisely as
it does today.

## 11. Settled — 2026-09-16

All four answered. Nothing here is open.

### 11.1 Sending item text to OpenAI — yes, because the user chooses it

The two routes are a **choice the practitioner makes**, so the consent is
explicit rather than assumed. No per-organization switch for now; the global
`OPENAI_ENABLED` plus the fork screen is enough. The consequence is on the
screen, not in the config: see §9 and §10.2 — the warning must say what is sent,
and must not be skippable.

### 11.2 Duplicate stems — v1

As §8. A per-row warning with skip / create-anyway, not a blocker.

### 11.3 Atomicity — build the single-transaction endpoint now

As §5.4. The cost is a new endpoint and new ref-carrying DTOs; the benefit is
that a failed import cannot leave a half-built taxonomy behind. The phase B/C
**throw, never return** rule is what actually delivers it.

### 11.4 Sheet shapes — the model's job, the preview is the check

No fixed target list. Column names and structure vary practitioner to
practitioner, so **all four `options.mode` values are in scope** and the model
chooses among them; `SCALE_COLUMN` and `PER_ROW_TEXT` stop being "later, if a
real sheet demands it" and become "later in the build order" (§12).

The load-bearing consequence: **the preview is the verification step, not a
courtesy.** With no fixed expected shape, nothing else in the system knows what
the sheet was supposed to say. So §6.1 ("how I read your sheet") and §6.2 (the
first three rows side-by-side with their source) are not polish — they are the
only place a wrong reading can be caught, and they are required before the
approve button is reachable. `confident: false` widens that panel rather than
blocking.

What does NOT loosen: the §7 table. A model free to interpret any layout is
still not free to retype an item, invent a column, drop a row, or name an MQT
id.

### 11.5 Consequence worth stating — create-in-place is the genuinely new part

Everything else here recombines things that exist: a parser, a validator, a
review wizard, an OpenAI client, a name-scoped resolver. **Creating an MQ or
MQT from outside the Measured Qualities page does not exist anywhere today** —
`ScoreEditor` picks from `choices` and offers no way to add one. It is new UI,
a new endpoint contract (§5.4), and the piece with no precedent to copy, so it
is the part most worth reviewing early.

**Open follow-on, not blocking:** the same control would be useful in the
ordinary question form's `ScoreEditor` — authoring a question by hand hits the
identical wall of "the MQT I need is not in the list". Building it once for the
import and dropping it into the form afterwards is nearly free. Worth doing?

## 12. Build order

Each step is useful shipped alone.

1. **Split the validator.** `parseQuestionsXlsx` → `parseQuestionRows(rows,
   choices)` + a thin file wrapper. No behaviour change; nothing else can start
   cleanly until this exists. The existing template upload must be provably
   identical after this step — same errors, same messages, same payloads — and
   it is the one step worth re-running the manual upload by hand to confirm.
2. **Expander + spec, backend, tested against the real sheet.** With a
   hand-written spec and no model in the loop at all. At the end of this step
   `docs/Report Logic.xlsx` produces fifteen correct canonical rows, reverse
   scoring included, provable in the test suite.
3. **The model call.** `SheetMappingService` + `/ai/map-sheet` + `/ai/available`.
   The hand-written spec from step 2 becomes the expected output, which is a
   real regression test for the prompt.
4. **The fork.** §10.2 — the warning screen, the two routes, and the consent
   line. Small, and it is what makes step 5 reachable by a real user.
5. **The panel.** Spec summary, side-by-side, editable grid, download.
   Shippable here even without §5: "any sheet → our sheet, download it, upload
   it the normal way" is already most of the value, and it round-trips through
   the untouched template path.
6. **`POST /api/questions/import`** — the atomic endpoint (§5.4), backend only,
   with the rollback test. Buildable in parallel with 3–5; it does not depend
   on the model at all.
7. **MQ/MQT resolution + create-in-place UI** (§5.1–§5.3) on top of 6, then
   approve. This is the new-UI step (§11.5).
8. **Duplicate stems** (§8) — a warning row in the same review panel as 7.
9. **`SCALE_COLUMN`**, then **`PER_ROW_TEXT`** last, with its own consent line
   and source-cell-beside-every-option preview (§2.1).

## 13. Deliberately not in scope

- **Generating questions.** This maps a sheet someone wrote. It does not invent
  items, suggest options, or improve wording. A model that writes psychometric
  items is a different product and a much larger argument.
- **IMAGE/VIDEO questions.** Still URL-only until object storage exists; the AI
  path inherits that and must not become a loophole.
- **`LIKERT_GRID`, `SHORT_ANSWER`, `PARAGRAPH`.** The canonical sheet writes
  MCQs only, and this plan does not widen the template.
- **Scoring rules.** `Scoring_Logic` is the other tab and the other feature —
  report-rule-authoring-plan owns it. This plan reads item tabs.
- **Editing MQ/MQT beyond creating them.** §5.3 creates; it does not rename,
  reparent, reorder or delete. Those stay on the Measured Qualities page.
- **A draft table.** §6.4. If "leave and come back" turns out to matter, it is
  a `V32` and a small one.
- **Editing existing questions from a sheet.** Import creates. Re-importing a
  corrected sheet updating questions in place is a real request and a separate
  design, and it collides with the answer-freeze rules.
- **Replacing the fixed template.** Explicitly out of scope, now and later —
  §10.1. If the AI path ever becomes good enough that removing the template
  looks tempting, that is a separate decision needing its own argument, and the
  argument would have to answer what an unconfigured install does.


---

## 14. STATUS — built and verified 2026-09-16

**402 backend tests green** (363 before, so 39 new); `npm run typecheck` and
`npm run build` clean; the import endpoint and its error paths smoke-tested
live against localhost:8080 with `__smoke__` data, since deleted.

**No migration.** Nothing here needed a new table — the draft is in-memory
(§6.4) and the import writes through the existing taxonomy and question tables.
`V31` is still the highest.

| Shipped | Where |
|---|---|
| The validator split — `readQuestionSheet` + `parseQuestionRows` + `looksLikeOurTemplate` | `question-bulk-upload.tsx` |
| The spec the model fills in | `service/question/sheet/SheetMappingSpec.java` |
| Deterministic expansion, all modes but `PER_ROW_TEXT` | `CanonicalRowExpander.java` |
| The path rule of §5.1, pure and static | `TaxonomyPathResolver.java` |
| Prompt sampling — header, ~10 rows, every prose row | `SheetSampler.java` |
| The model call, validated by running the expander on its answer | `SheetMappingService.java` |
| `GET /questions/ai/available`, `POST /questions/ai/map-sheet` | `QuestionSheetController.java` |
| `POST /questions/import` — atomic, on `QuestionController` beside `/bulk-create` | `QuestionController.java` |
| Duplicate stems, over a projection rather than the whole bank | `SheetMappingService.duplicates` |
| The fork screen and the AI route | `question-bulk-upload.tsx`, `ai-sheet-import.tsx` |

### Five things worth knowing

1. **The reference workbook is the test input, not an invented one.**
   `CanonicalRowExpanderTest` reads `report/items-master.csv` — the fixture that
   is byte-identical to what the browser produces from `docs/Report Logic.xlsx`
   — and asserts fifteen questions, five labelled options each, and I3/I6/I11
   scored 5→1 while I2 on the same construct is scored 1→5. That pair is the
   whole feature in one assertion.
2. **The path count in §5.1's example was wrong and the test caught it.** The
   real sheet has EIGHT distinct paths, not six: Adaptive Execution alone
   carries three constructs. Worth knowing because it kills the "one factor,
   one MQT" assumption that a simpler design would have rested on.
3. **Forward references are NEGATIVE IDS, not string refs.** §5.4 proposed
   `"mqtRef": "t1"`; the build uses `measuredQualityTypeId: -11` pointing at a
   `newQualityTypes` entry with `ref: -11`. Same guarantee, and it leaves
   `QuestionRequest` and `MqtScoreRequest` untouched rather than duplicating a
   seventeen-field record. Identity ids are always positive, so the sentinel
   cannot collide — and a negative id posted to `/bulk-create` is simply an id
   that does not exist, which is already an error. Pinned by a test.
4. **The rollback is asserted directly, and live.** `QuestionImportTest` counts
   the qualities, fails an import in phase C, and counts them again. Without
   that test a `return` where a `throw` belongs would pass every other
   assertion in the file. The same was proved against the running server.
5. **A projection query would have crashed the app on boot.** The duplicate
   check selects `q.stem`, and the entity field is called `questionTexString`
   (the column is `stem`). Spring validates `@Query` at context startup, so the
   whole application failed to load — caught by the test suite, and it would
   have been caught by nothing else until a restart.

### Deliberately not built

- **`PER_ROW_TEXT` (§2.1, §12 step 9).** Options buried in free text are
  refused with a message saying so. It is the one mode whose output is not
  derived from cells by our own code, so it needs the source-cell-beside-every-
  option preview §2.1 describes before it is worth having.
- **The AI route inside a SECTIONED questionnaire.** A foreign sheet has no
  section column to match, and inventing one would place questions somewhere
  nobody chose. The fork screen says so and offers the template; the bank
  import still works, and the questions can be placed afterwards.
- **Editing scores in the panel.** Stems are editable inline; score cells are
  edited by downloading the sheet, which round-trips through the ordinary
  upload. The path resolver is the better place to change what a question
  measures, and it is right there.
- **`SCALE_COLUMN` against a real sheet.** Built and unit-tested, but no real
  workbook has exercised it yet.

### The end-to-end run — 2026-09-16, real model, real workbook

`docs/Report Logic.xlsx`, all three tabs, through `/questions/ai/map-sheet` on
`gpt-4.1`. **7.5 seconds, and the spec came back identical to the hand-written
one in `CanonicalRowExpanderTest`** — field for field:

```
sheet       Items_Master          (chosen from three tabs)
dataRows    2–16                  ignoredRows 18–22 "notes block"
columns     stem=Statement  path=[Factor, Construct]  reverse=Reverse_Scored
options     SHARED_SCALE, evidence "the note on row 20"
            Strongly Disagree=1 … Strongly Agree=5
scoring     OPTION_VALUE_TO_ROW_MQT, reverseWhen Y/N
→ 15 rows, 0 blockers, 0 warnings, confident
```

Three results worth recording:

1. **The scale was read out of prose.** Nothing in any column of that sheet says
   what the answer options are; it is one sentence in a paragraph below the
   table. A column-reading importer produces fifteen questions with no answers.
2. **Reverse scoring landed on the right items.** I3 came out
   `Growth Mindset:5,4,3,2,1` while I2 — the same construct, one row above —
   came out `1,2,3,4,5`. Exactly I3, I6 and I11, as the sheet's own note says.
3. **Duplicate detection earned itself immediately.** All fifteen stems already
   exist in the local bank from earlier work, and all fifteen were flagged EXACT.
   Re-importing this workbook would have silently created fifteen second copies.

Also verified: the model's output contained no item text, so every stem in the
result was copied from its cell by `CanonicalRowExpander`; and all eight paths
resolved MATCHED against the live taxonomy, so nothing was proposed for creation.
No rows were written — `/map-sheet` is a read. The temporary account made to
reach the endpoint was deleted afterwards.


## 15. The round trip, and the two bugs it found — 2026-09-16

§6.3 claims a downloaded sheet re-uploads through the ordinary button and
imports identically. **It did not.** The first real download failed with
seventy-odd errors, and the claim was the only thing that would ever have
caught it — worth recording, because both bugs were invisible to every test
that existed.

### 15.1 Score cells held a PATH; the template resolver read bare NAMES

The generated sheet writes `Internal Drive › Self-Efficacy:1`, because a path is
what the AI panel resolves against. `mqtKeyResolver` matched `choices[].name` —
`Self-Efficacy` — so every score cell in every row failed.

**Fixed by teaching the template resolver the path form**, not by changing what
the download writes, and that is the better direction anyway: MQT names are
deliberately not unique, so a bare name has always needed an id to fall back on
when two constructs share it. A path disambiguates without anyone looking an id
up, and the template's `mqts` tab has printed exactly that string in its `tree`
column since the day it shipped. A key containing `›` now matches on
`choices[].label`; anything else resolves exactly as before, so the manual path
is untouched.

Verified against the live taxonomy: all eight paths the generated sheet writes
are byte-identical to the labels `flattenMqts` builds from the database.

### 15.2 The model put a presentation note in the selection field

`selectRule: "Admin_Position order", selectCount: 15` — on five-option
questions. It had read *"Present items to the student in Admin_Position
order"* off the notes block and filled in the only field that sounded like it.

Two fixes, because either alone is insufficient:

- **The expander refuses an unrecognised rule** rather than writing it through.
  Refusing and not ignoring is the deliberate part: silently dropping a value
  nobody understands would also silently drop a genuine "pick at most 2". A
  blocker reaches the model's one retry with the field named, which is where
  this now gets fixed without anyone seeing it.
- **The prompt says what the field is** — how many options may be picked,
  one of min/max/equals, almost always null — and says explicitly that
  ordering, presentation and item counts belong in `notes`.

Re-run against the same workbook afterwards: `selection: {rule: null, count:
null}`, and the instruction landed in `notes` as *"Presentation order is
determined by Admin_Position numeric value."*

### 15.3 What this says about the shape of the design

Both bugs were in the seam between the two paths, and neither was reachable
from the backend tests — which is precisely why §6.3's round trip is a property
worth stating rather than an incidental convenience. The expander was right,
the resolver was right, the model was right; what was wrong was that two
correct halves disagreed about one string format, and only sending a real file
through both of them could show it.

**407 backend tests green** (402 before — five new, all on the selection field).


## 16. Review of the whole flow — 2026-09-16, after the round trip

A read of every seam, end to end, with the two §15 bugs as the lesson: both
were places where two correct halves disagreed about one string, and neither was
reachable from any test that existed. So this review is organised by SEAM, and
everything below is proposed, not built.

### 16.1 Bugs — wrong behaviour today

| # | Where | What goes wrong | Fix | Effort |
|---|---|---|---|---|
| **B1** | Fork trigger, `pickFile` | Only the FIRST tab is read. A workbook whose first tab is a cover sheet or empty gives `rawRows.length === 0`, which falls through to *"No data rows found"* — the fork is never offered even though tab 2 holds the items. | When the first tab has no rows, check whether ANY tab does; if so, fork. `readWorkbookForImport` already reads them all. | small |
| **B2** | `AiSheetImport` `useEffect([file])` | `main.tsx` wraps the app in `StrictMode`, which double-invokes effects in development. The `live` guard stops the second state update but not the second HTTP call — **two OpenAI calls per mapping in dev.** Production is unaffected. | A `useRef` "already started for this file" guard, or an `AbortController` in the cleanup. | small |
| **B3** | Wizard mode after an import that created MQTs | `handleBulkCreated` never reloads `mqtChoices`. The new types are absent from the ScoreEditor picker, and a second sheet naming them by path fails the template resolver with *"no measured quality type at …"* — the exact §15.1 error, back again. Bank mode is fine: `refresh()` reloads qualities. | `onImported` → wizard re-fetches qualities, the same way `questions.tsx` does. The import response already carries `createdQualityTypeIds`; a full re-fetch is simpler and cannot drift. | small |
| **B4** | `CanonicalRowExpander`, `COLUMNS` mode | A blank score cell becomes `path:0`. "No score" silently turns into "scored 0" — different things to `MqtScoringService` — and reverse scoring then pivots that 0 into the scale's MAX. | A `ScalePoint` with a null value writes an EMPTY score cell; and the pivot is computed from the non-null values only. Pin with a test: `[2, null, 0]` reversed must give `0, (blank), 2`. | small |
| **B5** | `SheetMappingResponse.sheet` | Returns `spec.sheet()` as the model spelt it. The backend matches the tab NORMALISED (`items_master` ≡ `Items_Master`), but the browser indexes `grids[sheet]` verbatim — a spelling difference makes the side-by-side silently show "—" for every row. | Return the matched tab's real name (`chosen.name()`), not the model's. | trivial |
| **B6** | `SheetSampler` | *"… N more rows of the same shape, ending at row {total}"* — N counts blank and notes rows, and the row named is the sheet's last row, not the data's. On the reference sheet it says the shape runs to row 22 when the data ends at 16. The model got `dataRows` right anyway, from the prose rows' own numbers — luck, not design. | Say where the LAST row with ≥2 filled cells is, and where the first blank row after the table is. Those are the two numbers `dataRows` actually needs. | small |

None of these is reachable from the backend suite; B1–B3 are frontend, B4–B6
are backend but only visible through what the model or the browser does with
the result. B4 is the one that produces a wrong SCORE, so it goes first.

### 16.2 Gaps — promised in this document, not built

| # | Promised | State | Fix |
|---|---|---|---|
| **G1** | §5.1 — one-click **re-anchor** for the root-treated-as-a-branch case | The note is shown; there is no action. The only choice offered is "use existing", which for `Self-Efficacy › Task Confidence` means picking ONE existing type for the whole path and losing `Task Confidence`. | A "re-anchor here" button on that note that rewrites the path's segments to start under the found node, then re-resolves. Needs a small backend re-resolve endpoint, or do the rewrite client-side and resolve against `choices`. |
| **G2** | §8 — `In_Composite = N` on a row whose factor is a scoring quality | Column is mapped (`excludeFromComposite`) and never read. | A WARNING per row in the expander. Cheap, and it is the check that says the sheet and the taxonomy agree about what counts. |
| **G3** | §8 — `Admin_Position` not `1..n` | Column mapped (`order`), never read. | A single warning naming the gaps. |
| **G4** | §5.1 — "use existing" dropdown **scoped to valid parents** | Lists every MQT in the system. | Sort the matched quality's own types first, then everything else under a divider. Scoping strictly would hide the row-four case (§5.1) where the right answer IS under another quality, so sort rather than filter. |
| **G5** | §8 — duplicate badge | Editing a flagged stem to new wording leaves the badge — *"exact wording already in the bank"* is then false. | Clear the flag for a row whose stem no longer equals what was flagged; or re-check on edit against the stems the response already carries. |

### 16.3 Improvements — worth doing, not wrong today

- **I1 — `PER_ROW_TEXT` under retry pressure.** The blocker *"options
  embedded in free text are not supported yet"* reaches the model's one retry,
  and a model told "that mode is not supported, try again" may pick
  `SHARED_SCALE` and invent a scale to satisfy it. The prompt forbids inventing
  SCORES but not OPTIONS. Fix: the blocker text and the prompt both say — if
  the options are inside the text, answer `PER_ROW_TEXT` with
  `confident: false`; never substitute a scale the sheet does not state.
- **I2 — no size cap on `/map-sheet`.** The whole workbook's CSV is posted (to
  our server, not OpenAI). A cap of a few MB total, refused with a message,
  before any parsing.
- **I3 — the sampler's prose heuristic is exactly one filled cell.** A legend
  written as two cells (`Scale | 1=SD … 5=SA`) below `HEAD_ROWS` is invisible
  to the model, and a legend is precisely the row that carries the options.
  Better: everything after the first fully blank row that follows the table is
  shown, bounded — position is what says it is not data, not cell count.
- **I4 — "Choose another file" stays clickable while an import is in flight.**
  Disable it on `submitting`, as the panel's own buttons already are.
- **I5 — determinism.** `completeAsJson` sends no temperature; a mapping is
  the kind of answer that should come out the same twice. **Do not do this
  blindly**: `gpt-5` (production) rejects a temperature other than 1, and the
  client is shared with rule translation. If done, it is a per-call option, and
  the model list decides whether to send it.
- **I6 — the biggest one: a frontend test runner.** Three bugs in one day
  (§10.2's ternary, both of §15) were invisible to typecheck and to 407 backend
  tests, and all three lived in code that is PURE — `parseQuestionRows`,
  `buildImportPlan`, `looksLikeOurTemplate`, `mqtKeyResolver`, `pathResolver`.
  None of them touches React. Vitest over those five functions, with the
  generated `mapped-questions.xlsx` rows as a fixture, would have caught §15.1
  outright and makes the §6.3 round-trip claim a standing test instead of a
  thing somebody has to remember to try. This is the change that pays for the
  others.

### 16.4 Confirmed sound — looked at, nothing to change

- The negative-id sentinel (§14 note 3): inert on `/bulk-create`, and every
  pending id is checked against the payload BEFORE phase B, so an unmatched one
  cannot reach a rollback.
- Sibling-name refusal inside one payload: the sync helpers keep the in-memory
  collections current, so a second new type of the same name under the same new
  parent is caught by the same check that catches an existing sibling.
- The retry: if the second answer also fails, the response carries the FIRST
  attempt's blockers, which are the ones the user can act on. Right.
- The single-sheet fallback in `runAgainstSheet`: a one-tab workbook is used
  whatever the model called it; a multi-tab one with an unknown name is a
  blocker. Right both ways.
- `rows`/`sources` stay in step through every removal, and duplicates are keyed
  on the source row, so dropping rows cannot shift a flag onto the wrong one.

### 16.5 Suggested order

1. **B4** — the only one that produces a wrong score. Test first, then fix.
2. **B3** — the §15.1 error will come back in the wizard the first time
   someone imports twice; it looks fixed and is not.
3. **B1, B5, B6, I1** together — all small, all in the "the model or the
   browser is handed something misleading" family.
4. **I6** — vitest over the five pure functions, with the round trip as a test.
   Everything above becomes cheaper to keep fixed once this exists.
5. **B2, I2, I4** — hygiene.
6. **G1–G5** — the promised-and-missing list, in the order written.


## 17. STATUS — §16 built and verified 2026-09-16

**413 backend tests green** (407 → 413), **21 vitest tests green** — the
project's first frontend tests — `npm run typecheck` and `npm run build` clean.
Every new server surface smoke-tested live; the temporary account used to reach
the guarded ones was deleted afterwards.

| # | Shipped | Where |
|---|---|---|
| B1 | The fork asks every tab before calling a workbook empty | `question-bulk-upload.tsx`, `workbookHasRows` in `questionImportApi.ts` |
| B2 | One model call per file under StrictMode — the in-flight promise is held on a ref keyed by the file | `ai-sheet-import.tsx` |
| B3 | The wizard reloads qualities after an import | `create-questionnaire.tsx` |
| B4 | A blank score leaves the option UNSCORED; the pivot is taken from valued points only; a declared scale missing a value on a scored sheet is refused | `CanonicalRowExpander.java` |
| B5 | The response names the tab as the workbook spells it, not as the model did | `SheetMappingService.Run` |
| B6 | The sampler reports the last table row and the first blank row — the two numbers `dataRows` actually needs | `SheetSampler.java` |
| I1 | The `PER_ROW_TEXT` blocker is not retried, and both it and the prompt tell the model to answer honestly rather than invent a scale | `CanonicalRowExpander.PER_ROW_TEXT_BLOCKER`, `SheetMappingService` |
| I2 | 6 M-character cap on `/map-sheet`, checked BEFORE availability so a keyless install still enforces it | `QuestionSheetController.MAX_CSV_CHARS` |
| I3 | Every row after the first blank line past the head is sampled, whatever its cell count | `SheetSampler.java` |
| I4 | "Choose another file" is disabled while the import transaction is in flight | `onBusyChange` |
| I6 | Vitest over the pure modules, with the §6.3 round trip as a standing test | `question-sheet-rules.ts`, `ai-import-plan.ts`, `__tests__/` |
| G1 | One-click **re-anchor** (root treated as a branch) and **use the one at …** (name found elsewhere); the server re-resolves the rewritten key | `TaxonomyPathResolver.Segment.suggested*`, `POST /questions/ai/resolve-paths`, `reanchoredKey`, `rewriteScoreCells` |
| G2 | A factor with items both in and out of the composite is a warning | `checkCompositeFlags` |
| G3 | A presentation-order column that is not 1..n is a warning | `checkPresentationOrder` |
| G4 | "Use existing" lists the matched quality's own types first, then everything else — sorted, never filtered | `PathRow` |
| G5 | The duplicate badge is tied to the flagged WORDING and clears when the stem is edited | `flaggedStems` |

### What the live run showed

- `/resolve-paths` on `Self-Efficacy › Task Confidence` against the real
  taxonomy came back `CREATE` with `suggestedMqtId = 1` and `suggestedPath =
  "Internal Drive › Self-Efficacy"` — the re-anchor button has what it needs.
- The cap answered **413** with the way forward named, on a server that HAS a
  key, which is the ordering I2 exists for.
- Re-running `Questionaire_test1.xlsx` through the real model: tab name
  `Items_Master` as spelt in the file (B5); `selection` null; **no warnings** —
  so G2 and G3 are silent on a consistent sheet, which is the false-positive
  check that matters; `excludedFromComposite` reads `yyyNyyyyNyyyyNy`, which is
  V1, V3 and V2 at positions 4, 9 and 14, exactly the sheet.

### Four things worth knowing

1. **The two pure modules are the real deliverable of I6.** `parseQuestionRows`,
   `mqtKeyResolver`, `looksLikeOurTemplate`, `buildImportPlan`, `pathResolver`,
   `reanchoredKey` and `rewriteScoreCells` now live in files with `import type`
   lines only. That is a rule, not an accident: one runtime import of the API
   client and the tests need a DOM. Both files say so at the top.
2. **B2 was not fixable with a `live` flag.** StrictMode discards the first
   effect's cleanup and runs the effect again; a flag only discards the second
   RESULT, and the second HTTP call — the one that costs money — still goes.
   Holding the promise on a ref and subscribing to it is what makes the second
   mount reuse the first call.
3. **The cap had to move in front of the availability check to be testable at
   all.** Behind it, a keyless test install answers 503 before the cap is ever
   reached. The reorder is also the right behaviour: a body that size is
   refused whatever the configuration.
4. **The IDE compiles into `target/` too.** A test class showed "Unresolved
   compilation problems" — an Eclipse-compiler message — because the IDE had
   built it mid-edit and Maven reused the stale class. `clean` is not optional
   on this project when the IDE is open (see the memory note that already
   says so).

### Deliberately not done

- **I5, temperature.** `gpt-5` — the production model — rejects any
  temperature but 1, and `OpenAiClient.completeAsJson` is shared with rule
  translation. Sending it per model is a model allowlist in the client, which
  is worse than the non-determinism it would remove.
- **`PER_ROW_TEXT`** stays refused. I1 makes the refusal honest; building the
  mode still wants the source-cell-beside-every-option preview of §2.1 first.
