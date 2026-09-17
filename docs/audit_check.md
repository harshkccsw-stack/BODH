Audit the report/scoring engine in this repo for correctness bugs and for what
is still missing. Do not implement anything — report findings.

WHAT IT IS
spring-social/ is the backend (Spring Boot 4.1, Java 25). The engine turns a
psychometrician's scoring workbook into a respondent's report:

  questions + option scores  →  MqtScoringService (mqt:/mqtt:/mq: columns)
  →  ReportRule (a DAG of formulas, [rule:slug] references)
  →  ReportComputation  →  ReportRenderer / ReportDeliveryService  →  PDF

Read these first; they are current and state the reasoning, not just the shape:
  docs/report-engine-build-plan.md       (P0-P2.5 built; P3/P4 not)
  docs/report-rule-authoring-plan.md     (the six workbook steps, §9 = findings)
  docs/direct-computation-mode.md        (reports with no LLM)
  docs/item-master-binding-plan.md       (item codes → questions; §12 = newest)
  docs/Report Logic.xlsx                 (the real practitioner workbook)
Then CLAUDE.md for house conventions.

THE THREAT MODEL — rank everything by this
A crash is cheap; somebody sees it. The expensive bug here is a number that is
wrong and looks ordinary: a band cut written backwards, a reversed item that
was not reversed, a trait summed from the wrong items, a z-score over a cohort
of one. Those ship as a confident PDF about a real person's psychometric
profile. Rank findings by "can this put a wrong number in a report without
anyone noticing", not by how hard it is to trigger.

WHERE TO LOOK HARDEST (~9k lines; do not spread thin)
  service/MqtScoringService.java              the scores everything else reads
  service/datastudio/expression/              the formula language + evaluator
  service/report/ReportRuleService.java       DAG, cycles, is_population
  service/report/ReportDryRunService.java
  service/report/ReportComputationService.java
  service/report/ReportValueResolver.java, ReportRenderer.java

Specific hypotheses worth trying to disprove:
- Reverse scoring is authored upstream as reversed OptionMqtScore values and
  NOTHING verifies it matches what the sheet declares. What else in this design
  is "true by convention" with no check?
- NORMBAND cut points are exclusive at the bottom. A cut written the other way
  round is silent. Is that reachable through any path that does not lint it?
- Scores are 0 rather than null for a trait a respondent scored nothing on.
  Trace that through averages, z-scores, percentiles and the cohort minimum.
- is_population propagates along the DAG. Find a path where it does not.
- Multi-select: a question contributes the SUM of every selected option's
  scores, so only EQUALS keeps the count constant across respondents. Is any
  comparative statistic computed over questions where it does not?
- Grid questions and rowNominations in the scoring plan.
- Does the direct-computation path and the LLM path agree on every value?
- ReportNarrative is cached by prompt_fingerprint. Can it serve prose that
  describes a different score?

ALREADY KNOWN — do not spend the run rediscovering these
- P3/P4 (LLM codegen + sandbox) unbuilt; only STATEMENT rules need them.
- No attempt timestamps, so the workbook's speed check (1.3) cannot run.
- Re-attempts REPLACE answers; there are no per-attempt history rows.
- Item bindings exist but nothing lints them against the question bank yet
  (item-master-binding-plan §7) — that is the next planned slice.
- Item codes are not yet substituted into rule translation (§6).
- protocol_status = 'INVALID' is a string a rule returns, not a gate that stops
  computation or suppresses the PDF.
Tell me if any of these is worse than the docs think, but do not just re-list
them.

HOW TO WORK
- Verify against the code. The comments in this codebase assert invariants
  confidently and some of them have drifted; treat a comment as a claim to
  check, not as evidence.
- You may run: cd spring-social && ./mvnw -B test  (363 tests, all green now).
  Writing a failing test is the strongest form of a finding.
- DO NOT write a Flyway migration. Files in db/migration/ auto-apply within
  seconds via the IDE. DO NOT write to the database.
- The tests are H2; the dev DB is MySQL on 3310. Some mappings are only proven
  by a real boot, not by the suite.

DELIVERABLE
1. Bugs, ranked by the threat model above. For each: file:line, the concrete
   input that produces the wrong output, and what the output would be. Say
   plainly which ones you confirmed and which are suspicions.
2. Gaps — what a real psychometrician's workbook still cannot express, beyond
   the known list.
3. The one change you would make first, and why that one.
Be blunt about anything you could not check and why.
