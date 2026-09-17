# Report rules — intake sheet for the psychometrician team

> **What this is for.** We are building the report engine. It will take your
> scoring and interpretation rules and produce a respondent's report
> automatically. To build it correctly — and to be able to *prove* it stays
> correct — we need a set of your real rules, plus the answers you would work out
> by hand for a couple of people.
>
> **This is not a spec you have to write in a technical format.** Write each rule
> the way you normally write it. The engineering side handles the translation.
> The one thing we cannot do for you is §3, the worked answers.

**Target: 8–10 rules.** Fewer is fine if they are the right ones (see §4).

---

## 1. What we need for each rule

Copy the block in §5 once per rule and fill it in. Four things:

| | | Why we need it |
|---|---|---|
| **Name** | What you call it | It becomes the rule's name in the system |
| **The rule itself** | In your own words, or as a formula, or both | This is what the system is built to reproduce |
| **What it reads** | Which scores/facts it needs about the person | Tells us the rule can actually run on a given assessment |
| **Worked answers** | See §3 — the important one | The only way we can automatically prove the engine is right |

Write the rule **exactly as you would explain it to a new colleague.** Plain
English is fine and expected. If it has conditions ("if the score is above X,
say A, otherwise say B"), write the conditions out. If it produces a paragraph
of text rather than a number, write the paragraph — including the variants for
different score ranges.

---

## 2. What the system can read about a respondent

A rule can use any of these. You do not need to use these names — just tell us
which quantities you mean and we will map them.

| Kind | What it is | Example |
|---|---|---|
| **MQT score** | the score on one Measured Quality Type | "Extraversion" |
| **MQT subtree total** | that MQT plus everything under it | "Sociability, all facets" |
| **MQ total** | the whole Measured Quality | "Big Five — Extraversion total" |
| **Answer** | the response to one specific question | "Q14" |
| **Demographic** | anything on the demographic form | age band, education, role |
| **Core facts** | name, organization, whether they completed | — |

Also available, and worth knowing because it changes what a rule *can* say:

- **Cohort statistics.** A rule may compare a person to everyone else who took
  the same assessment — mean, percentile, rank, z-score. **If a rule of yours
  does this, flag it** (there is a checkbox in §5), because these rules need a
  minimum number of completed respondents before their answer means anything.
- **Norm / lookup tables.** If a rule reads off a published norm table, **send
  the table too**. Say whether it is fixed for the instrument or varies by age
  band, gender, or population.

---

## 3. Worked answers — the part we cannot do ourselves

**For each rule, give us the answer for at least two people.** Made-up people
are fine, and preferred — no real respondent data needed.

For each of the two, give:

- the input values (the scores the rule reads), and
- **the exact output you would expect** — the number, the band, or the
  paragraph, written out in full.

**Please make one of the two an awkward case**: right on a band boundary, an
extreme score, a missing answer — whatever you know tends to trip people up.

### Why this matters more than it looks

The engine will generate the code that computes your rule. We can check
automatically that the code runs, that it produces every value the report needs,
and that it does not do anything unsafe.

**What we cannot check without your worked answers is whether the number is
right.** Code that runs perfectly and puts every single respondent in the "High"
band looks identical, to a machine, to code that is correct. Your two worked
answers are what turn that into a test that fails loudly.

They also keep working forever. Every time we change the system, or the
underlying AI model changes, we re-run all your worked examples and check the
answers still match. That is how a report issued next year stays as trustworthy
as one issued next week.

---

## 4. Please make the set varied, not easy

Ten straightforward "average these three facets" rules would tell us almost
nothing. Deliberately include, if they exist in your work:

- [ ] a rule that **reads a norm or lookup table**
- [ ] a rule that **produces a paragraph of prose**, not a number or a band
- [ ] a rule whose answer **depends on another rule's answer**
- [ ] a rule that **compares the person to the cohort** (percentile, above/below average)
- [ ] a rule with **several conditions** or an unusual edge case
- [ ] a rule you consider **hard to explain** — those are the most valuable ones

The awkward rules are the point. We would much rather discover a limitation now
than after the reports are being sent out.

---

## 5. Template — copy once per rule

```
RULE <n>

Name:
    e.g. Extraversion composite

What it produces:
    [ ] a number      [ ] a band / label      [ ] a paragraph of text
    [ ] something else — describe:

The rule:
    Write it however you normally would. Formula, plain English, or both.
    Include every condition and every text variant.



What it reads:
    Which scores, answers or demographics does it need?



Does it compare the person to other respondents?
    [ ] no
    [ ] yes — percentile / rank / above-average / z-score (circle)

Does it use a norm or lookup table?
    [ ] no
    [ ] yes — table attached, and it varies by: ________________

WORKED ANSWER 1 (typical case)
    Inputs:
    Expected output (write it out in full):

WORKED ANSWER 2 (awkward case — boundary, extreme, or missing data)
    Inputs:
    Expected output (write it out in full):

Anything else we should know:
```

---

## 6. A filled-in example

```
RULE 0  (example — not one of yours)

Name:
    Extraversion composite

What it produces:
    [x] a number    [x] a band / label    [x] a paragraph of text

The rule:
    Average the three Extraversion facets (Sociability, Assertiveness,
    Enthusiasm), then rescale to 0-100 by multiplying by 20. Round to
    one decimal place.

    Band the result:
        70 and above          -> "High"
        45 up to but not 70   -> "Moderate"
        below 45              -> "Low"

    Text for the report:
        High     - "<Name> shows a marked preference for group settings and
                   is likely to seek out collaborative work. In practice this
                   tends to mean they contribute readily in open discussion
                   and may find extended solitary work draining."
        Moderate - "<Name> is comfortable in group settings but does not
                   strongly seek them out..."
        Low      - "<Name> tends to prefer working independently..."

What it reads:
    Sociability, Assertiveness and Enthusiasm (the three Extraversion facets)
    The respondent's first name, for the text

Does it compare the person to other respondents?
    [x] no

Does it use a norm or lookup table?
    [x] no

WORKED ANSWER 1 (typical case)
    Inputs:  Sociability 4.2, Assertiveness 3.8, Enthusiasm 4.0
    Expected output:
        number = 80.0
        band   = "High"
        text   = "Priya shows a marked preference for group settings and is
                  likely to seek out collaborative work. In practice this
                  tends to mean they contribute readily in open discussion
                  and may find extended solitary work draining."

WORKED ANSWER 2 (awkward case — exactly on the band boundary)
    Inputs:  Sociability 3.5, Assertiveness 3.5, Enthusiasm 3.5
    Expected output:
        number = 70.0
        band   = "High"        <- 70 is High, not Moderate. This is the
                                  kind of thing that gets implemented
                                  backwards, which is why it is here.
        text   = the High paragraph

Anything else we should know:
    Rounding happens before banding, not after. A raw 69.96 rounds to 70.0
    and is therefore High.
```

Note what the awkward case in this example does: it pins down **which side of
the boundary 70 falls on**. That single line is the difference between a test
that catches an inverted band and one that does not.

---

## 7. Two other things we need alongside

1. **Norm / lookup tables**, if any rule uses one — as a spreadsheet, with a
   note on whether it is fixed per instrument or varies by age band, gender or
   population.
2. **A sample report you consider correct**, of each type you produce
   (clinical / counselling / industrial). Marked-up or annotated is ideal. This
   becomes the target the HTML template is built to match, and it tells us which
   parts of the page are computed and which are fixed wording.

---

## 8. Note for the engineering side

Two blockers to clear in parallel with this intake — neither is the
psychometricians' to solve:

1. **The local development database is empty.** Verified 2026-09-03: schema is at
   Flyway v24 but `assessment`, `measured_quality`, `measured_quality_type`,
   `question`, `respondent_user` and `assessment_answer` all have **zero rows**,
   and no staging tunnel is listening (3307 and 3310 both closed; only the local
   container on 3309 is up). So there is currently **no assessment to run a rule
   against and no cohort to compute a percentile over**. Before P4 can test
   anything end-to-end we need either a seeded assessment with completed
   attempts, or read access to a populated environment. Worked answers (§3) do
   not depend on this — which is why the intake can start now.
2. **`reference_data` needs a shape** before the meta-prompt is written. Spec §5
   requires lookup tables be passed to the generated function as a parameter,
   never hardcoded into it. What comes back under §7.1 determines that shape.

Column-key namespace the rules will be mapped onto, for reference:
`core:name`, `core:organizationName`, `core:completed`, `demo:<fieldId>`,
`ans:<tag>`, `mqt:<mqtId>`, `mqtt:<mqtId>` (subtree total), `mq:<mqId>` —
as defined in `DataStudioDatasetService` lines 87–92.
