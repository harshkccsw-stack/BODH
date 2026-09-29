# Questions for the practitioner — what we need answered to build the rest

> **Written for the psychometrician / practitioner who authors the instruments
> and their scoring, not for engineers.** No platform terms are used below; if
> a question cannot be understood without knowing how the software works, it
> is our question to answer, not theirs (§10).
>
> Compiled 2026-09-22 from `docs/Report Logic.xlsx` (all three tabs) and every
> decision left open across
> [ai-sheet-to-questions-plan](ai-sheet-to-questions-plan.md),
> [question-scoring-flags-plan](question-scoring-flags-plan.md),
> [item-master-binding-plan](item-master-binding-plan.md) and
> [report-rule-authoring-plan](report-rule-authoring-plan.md).
>
> **Read §0 first.** Most of §3–§9 answers itself if we get the artifacts in
> §0, and an artifact is worth more than an opinion because it is what the
> instrument actually does rather than what someone remembers it doing.

## 0. The ask that beats every question below

**Two or three more real instruments, each with its scoring sheet and one
worked example.**

We have designed everything against ONE workbook. It is a good one — fifteen
items, three factors, three validity items, a worked calculator — but a single
example cannot tell us which of its features are the house style and which are
particular to it. Every "do you ever…" question in §3 and §4 exists because we
cannot tell.

A worked example matters as much as the sheet. The intake note already said it:
raw responses plus the hand-computed answers are the one thing engineering
cannot produce for itself, and it is what turns "we think we implemented your
scoring" into "we can prove we did".

If two more instruments arrive, we would expect to strike out roughly half of
§3, §4 and §9 without asking anyone anything.

---

## 1. Blocking — the build is stopped on these four

These come from the two flags in `Items_Master` (`Reverse_Scored`,
`In_Composite`). We are ready to build them; these are the decisions we cannot
make for you.

**Q1. When an item is reverse-scored, is it always a straight mirror of the
scale?**
Your note says `score = 6 − raw` for a 1–5 scale. We plan to work the 6 out
from the scale itself, so a 1–7 scale mirrors at 8 and a 0–4 scale at 4.
*Is there any instrument where a reversed item is NOT a simple mirror* — where,
say, the reversal is 5,4,3,2,1 mapped onto something other than the exact
opposite point?
→ If mirrors are universal we compute it and nobody ever types a number. If
not, reversal has to become a per-item table, which is a different feature.

**Q2. A validity item is excluded "from any factor or composite score". Is it
excluded from absolutely every total, including a "Validity" total of its own?**
Your Sample_Calculator writes `n/a` in the Scored column for V1, V2 and V3, and
the factor sums skip those rows entirely. We read that as: the item's own value
is still readable (rule 1.1 needs V3's value), but it is added to nothing.
*Is there any subtotal a validity item should legitimately appear in* — an
overall "validity score", for instance?
→ Decides whether we suppress a validity subtotal as meaningless or compute it.

**Q3. Do you ever reverse-score an item whose options are not evenly spaced?**
Everything in the reference workbook is a 1–5 Likert, where reversing is
unambiguous. On an item whose options are worth, say, 0, 1, 2, 5 and 10, there
are two defensible reversals and they disagree.
→ If this never happens, we refuse to reverse such items and the ambiguity
never arises. If it does happen, you would need to tell us which reversal.

**Q4. Should a respondent ever see a factor name, a construct name, or the word
"validity"?**
Your note 1 says never show these to the student. Today nothing in the
respondent's screen shows them — we want to confirm that is a permanent rule
rather than a property of this instrument, before we build anything that might
surface a trait name in a respondent-facing report.

---

## 2. Gaps we cannot close without a decision from you

Each of these is something the scoring sheet asks for that the platform cannot
currently do. They are not bugs; they are missing inputs or missing policy.

**Q5. What should the system actually DO with an invalid protocol?**
Rule 1.1 says *"Do not compute any scores"*. Today a rule can decide a protocol
is invalid, but every other score is still computed and a report can still be
produced. We need to know the intended behaviour, precisely:
- Refuse to produce a report at all?
- Produce one that shows only the invalidity notice and no scores?
- Compute everything but stamp the report INVALID and let a counsellor decide?
- Does the respondent get told, and in what words?
→ This is the single biggest behavioural gap. The three options are genuinely
different products and we should not guess.

**Q6. Timing — total only, or per item?**
Rule 1.3 needs total completion time, which we do not record at all today. We
can add it. *Would you also want time per item* (which makes long-string and
per-item speed checks possible later), or is a single total enough?
→ Decides how much we record on every submission, which is worth getting right
once rather than twice.

**Q7. Retakes — how much history must be kept, and for how long?**
Edge case E1 says *"store both attempts, use latest valid"*. Today a retake
REPLACES the previous answers; nothing historical survives, and this cannot be
reconstructed after the fact. Before we change it:
- How many attempts should be kept — all of them, or the last N?
- Which attempt does a report use: latest valid, first valid, or best?
- Is the 30-day wait a rule of this instrument or of your practice generally?
- Should a counsellor be able to see that an earlier attempt was invalid?
→ Everything except the last bullet changes what we store, so the answer has to
come before we start storing it.

**Q8. Partial completion on a longer instrument.**
Rule 0.2 says all fifteen items must be answered or the protocol is not scored.
Fifteen is short enough for that to be reasonable. *At what length does that
stop being your rule* — and if a 60-item instrument comes in with three items
missing, is it unscored, or prorated, or scored on what is there?
→ Decides whether we need a missing-data policy at all.

---

## 3. Scales and response formats

We have assumed a lot from one workbook. Each of these is cheap for you to
answer and expensive for us to guess wrong.

**Q9. Is a 1–5 agree/disagree scale your standard across instruments?**
If most instruments use it, the importer's job is much easier and we can make
it the default everywhere.

**Q10. Can a single instrument mix response scales** — some items 1–5 agree,
others yes/no, others a frequency scale?
We have built support for this but have never seen a sheet that uses it, so it
is untested against anything real.

**Q11. Do you ever need an option that carries no score at all** — "Not
applicable", "Prefer not to answer", "Don't know"?
Today every option is worth something, and a blank score is possible but has
never been asked for. If you use these, we also need to know what they do to
the item's factor: skip the item, count as the midpoint, or invalidate?

**Q12. Do you use forced-choice or ranking formats** — "rank these four
statements", "pick the one most like you"?
These score completely differently from a rating scale and we have nothing for
them. Knowing whether they are on the horizon changes what we build next.

**Q13. Are response options ever presented in a random order?**
The platform can shuffle them. We deliberately never shuffle a rating scale,
since the points are ordered. Is that right for your instruments?

---

## 4. How a score is built

**Q14. Is a factor score always a plain sum of its items?**
Your three factors are all `I1 + I2 + I3(rev) + I4`. *Do you ever use a mean, a
weighted sum, or different weights per item?*
→ Everything downstream currently assumes a sum.

**Q15. Can one item count towards more than one factor?**
The platform allows it. Your workbook does not use it. If you do use
cross-loading items elsewhere, reverse scoring gets a follow-up question: does
an item reverse on both factors, or could it reverse on one and not the other?

**Q16. Are the factor ranges (4–20) and composite range (12–60) something you
want the system to check?**
We can verify that a factor really can produce the range you state, and
complain if the items do not add up to it — which would catch an item silently
dropped from a factor. Useful, or noise?

**Q17. Does a composite ever exclude a factor, or weight factors unequally?**
Your composite is a plain sum of all three.

---

## 5. Norms and bands — the biggest unbuilt area

Your Step 4 is marked *provisional — replace with percentile norms after
150–200 valid pilot responses*, and E3 says to build cutoffs as configuration
rather than hardcoded values. That is now the live question.

**What already exists, so you are not asked for things we have:** the platform
can already compare a respondent against everyone who has taken the same
assessment — percentile, percentile rank, z-score, rank, and banding by those.
It refuses to do so when fewer than 30 people have completed it, because a
percentile against a cohort of four is a made-up number.

**Q18. Is "everyone who has taken this assessment" the right comparison group?**
Or do you need a fixed external norm table — a published set of cutoffs that
does not move as more people take it?
→ These are very different. The first is automatic and self-updating; the
second means we store a norm table you supply and version it.

**Q19. Do norms need to be split by group** — age band, gender, education
level, organisation, role?
If yes, which splits, and what is the minimum group size you would accept?

**Q20. Which scores go in the report** — raw totals, percentiles, T-scores,
stens, stanines, or several side by side?
We produce raw totals today and can compute percentiles and z-scores. Sten and
T would be small additions, but only if you actually report them.

**Q21. Is 30 completed responses the right floor before a norm is usable?**
We chose it; your sheet says 150–200 for this instrument. We can make it a
per-instrument setting, but we would rather know what you actually consider
defensible.

**Q22. Who signs off a change to the bands, and how often does it happen?**
If bands change quarterly and a signed-off person must approve, that is a
workflow. If they change once a year over email, it is a settings page.

**Q23. When bands change, what happens to reports already produced?**
Do old reports keep the bands they were produced under, or get re-cut?
→ Decides whether we pin the band cutoffs to each report or read them live.

---

## 6. Validity and careless responding

**Q24. Are the four checks in this workbook your standard battery?**
Infrequency, straight-lining, speed, social desirability. *Are there others you
use* — inconsistency pairs, long-string, an attention-check item ("select
Agree for this item"), an acquiescence index?
→ Some of these need machinery we do not have (item pairs, per-item timing).

**Q25. Are validity thresholds fixed, or per instrument?**
`V3 <= 3`, `V1 = 5 AND V2 = 5`, `< 45 seconds`. Are these numbers this
instrument's, or your house values?

**Q26. Who sees which flags?**
A hard fail, a strong social-desirability flag, a soft flag. Your sheet says the
strong flag gets counsellor-facing text and the soft one is an internal note.
Should the respondent, the organisation, or an administrator ever see any of
them?

---

## 7. Instrument structure and lifecycle

**Q27. Is Factor → Construct always two levels?**
Ours supports any depth. If you ever go a level deeper (facets under a
construct) we would like to know before someone needs it.

**Q28. Is a construct name reused across factors on purpose?**
For example a "Self-Efficacy" under two different factors, meaning two
different things. We have assumed yes and built everything to disambiguate by
the factor above — worth confirming, because it is the assumption the whole
import flow rests on.

**Q29. When you reword an item, is it still the same item?**
If someone has already answered it, we currently keep the original wording
frozen against their answer, and a change means a new item. Is that right, or
do you expect minor rewording (a typo, a clarification) to apply retroactively?

**Q30. Do you run item analysis** — item-total correlations, discrimination,
Cronbach's alpha, item difficulty?
There is unused space in the data for IRT parameters. If you use them, we
should know before designing anything around item quality; if not, we should
stop carrying the fields.

**Q31. How many instruments exist today, and how many are in development?**
This changes what is worth automating. Three instruments and the manual route
is fine; thirty and the importer earns its keep several times over.

---

## 8. The report itself

**Q32. Who reads a report, and is it the same report for each?**
Respondent, counsellor, teacher, employer. If they differ, they differ in
content, not just in tone — and that is a structural decision.

**Q33. How much of a report should be written by AI versus fixed text you
author?**
Today a report can mix both. Your Step 5 profile rules read like fixed text with
conditions, which is the safer kind. We would like to know where you want the
line.

**Q34. What must never appear in a respondent-facing report?**
Factor names, validity language, raw scores, comparisons to other people,
anything clinical-sounding. A short prohibition list is worth more than a style
guide.

**Q35. Is there a required disclaimer, consent wording, or a professional
standard the report must state?**
Better designed in than added at the end.

---

## 9. Your sheets, for the importer

The platform can now read an arbitrary spreadsheet of questions and convert it
to our format. It was built against one workbook.

**Q36. Do all your instruments look roughly like `Items_Master`** — one row per
item, with columns for the factor, the construct and the statement?

**Q37. Does any sheet keep the answer options inside the question text**, like
`How often? a) Never b) Sometimes c) Always`?
We deliberately refuse these today rather than guess. Knowing whether they
exist decides whether that is worth building.

**Q38. Does any sheet state its response scale in a column, rather than in a
note at the bottom?**
Both are supported; only the note form has been tested against a real file.

**Q39. Who maintains the scoring sheets, and is there a house template?**
If one person maintains all of them in a consistent shape, the importer matters
less than a template. If several people write them differently, the importer
matters more.

---

## 10. Not for them — our decisions, listed so they do not get asked

Recorded here so this list stays honest about whose call each thing is. None of
these should reach the practitioner:

- Where a flag is stored, and which layer applies it.
- Whether reversal is stored in the data or computed at scoring time.
- Migration numbering, endpoint shapes, DTO fields.
- Whether the importer uses one model call or two.
- How the taxonomy is matched by name — that is ours to get right.
- Whether bands live in configuration or a table — Q22 asks about the
  workflow, and the storage follows from the answer.

---

## 11. Suggested order for a single conversation

If there is one meeting, this is the order that gets the most value from it:

1. **§0** — ask for the instruments and the worked examples. Do this first; it
   may shorten everything after it.
2. **Q5** (what invalid means) — the largest behavioural unknown.
3. **Q1–Q4** — unblocks work that is ready to start.
4. **Q7, Q6** — they change what we store, so they must precede storing it.
5. **Q18–Q20** — norms, because it is the largest unbuilt area and the sheet
   already promises it.
6. Everything else can be answered by email, or by reading two more sheets.
