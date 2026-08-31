# Psychometric Report Engine — Execution Plan

> **Status: execution plan. Nothing is built.** Written 2026-08-31, as the build
> layer over `report-engine-plan.md` — that document is the architecture and is
> still the reference for *why*; this one is *what, in what order, and how it is
> proven*. Its six phases are restructured here into S0–S9 after a sequencing
> critique, and five of its claims are corrected (see §Corrections). Every code
> claim below was re-verified against source on 2026-08-31.

## Context

Psychometricians need to define how an assessment is scored without a developer in
the loop: they write a plain-language prompt, an LLM turns it into a formula, a
human reviews and approves it, and the approved formula then computes the same
key-value pairs for every respondent of that assessment until a new version is
approved. Those key-values merge into an HTML template and render to a
per-individual PDF at batch scale. Formulae are scoped per assessment.

[docs/report-engine-plan.md](report-engine-plan.md) (777 lines, commit
`580907cf`) is the **design record** for this. It is a design document, not a build
plan — §11's six phases are one line each. This plan is the execution layer: what
gets built, in what order, in which files, and how each step is proven.

The finding that makes this buildable, carried forward from the design record: **the
LLM does not generate Java or Groovy.** The repo already ships a closed, whitelisted
expression grammar
([ExpressionService.java](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/expression/ExpressionService.java),
435 lines) built for Data Studio and in production since `V20`. The LLM emits
expressions in that grammar instead. Item 4 of the original brief — "safe execution
of LLM-generated code (critical)" — therefore **disappears entirely**: nothing is
compiled, no classloader is involved, no sandbox to escape. The grammar has no syntax
for I/O, reflection, network, loops, or recursion. Reviewers can also *read* what they
approve: `ROUND(([mqt:14]+[mqt:15])/2*20, 1)` is real judgement; approving a Groovy
class is rubber-stamping.

---

## Decisions settled this session

| Question | Decision |
|---|---|
| **LLM provider** | **Claude via the official Java SDK** (`com.anthropic:anthropic-java`), model `claude-opus-5`. Supersedes the design record's "OpenAI via Spring `RestClient`". |
| **Delivery slice** | **Phases 1–2 to executable depth**, 3–6 outlined — restructured below into S0–S9 after the sequencing critique. |
| **Template grammar** | **Full closed grammar** (§8.3): `${key \| fmt}`, `[[#if]]`, `[[#each]]`, `[[#bar]]`/`[[#gauge]]`. Not Thymeleaf — SpEL in user-authored HTML is the code-execution hole we just avoided on the formula side. |
| **Approval authority** | **Enforced separation of duties**: author cannot approve own draft; super-admins exempt. Build it as `app.reports.require-separate-approver` (default `true`) so the policy is a restart, not a rewrite. |
| **Report charts** | **Server-rendered inline SVG.** No headless browser. Reports will look print-styled, not dashboard-identical — ApexCharts is client-side JS and cannot run in OpenHTMLtoPDF. |
| **Instrument IP** | **Full schema (MQT paths + truncated question stems) may be sent** to the API. These are our own instruments. Respondent *rows* still never leave. |
| **Migration target** | **Local 3306 container only.** See the hard gate in S2 — `application.yml` still defaults to 3307. |

## Corrections to `docs/report-engine-plan.md`

Apply these to the design record in the same pass, or it will mislead:

1. **`V21` → `V24`.** V21 (co-brand logo), V22 (gender enum) and V23 (descriptions)
   shipped after the record was written.
2. **Provider is Claude, not OpenAI** (§1.2, §6.5).
3. **§8.2's "extend `RichTextHtml`" is wrong.**
   [RichTextHtml.java](../spring-social/src/main/java/com/bodhpsychometric/model/RichTextHtml.java)
   is a 12-tag, **zero-attribute** rejector (`p,br,b,strong,i,em,u,ul,ol,li,h2,h3`). A
   report template needs `<table>`, `<div>`, `style`, `class`, `<svg>`. It is unusable
   here and must not be extended — the template layer needs its own allowlist.
4. **§8 has no SSRF section, and needs one** — see R7 below. It correctly rejects
   SpEL while leaving a bigger hole open.
5. `CLAUDE.md`'s "one row per ATTEMPT: unique respondent+assessment+attemptNumber" is
   stale — `RespondentAssessmentMapping` has `uqRamRespondentAssessment` and no
   `attemptNumber`. Fix it in this pass.

---

## Sequencing

§11's six phases need restructuring in three places:

- **Phase 1 welds two unrelated things together and its verification does not hold.**
  The compiler is pure logic needing zero persistence; the schema is irreversible DDL.
  Bundled, you write the schema before the compiler tells you what it needs. **Split
  and invert: compiler first, schema second.** And `./mvnw test` cannot verify a
  migration — `src/test/resources/application.yml` sets `flyway.enabled: false` with
  `ddl-auto: create-drop`, so **the test suite never executes one.**
- **A Phase 0 is missing.** OpenHTMLtoPDF on Java 25 / `eclipse-temurin:25-jre` is an
  unvalidated assumption sitting under the entire customer-visible half of the
  feature. One day, throwaway, in hour one — not week five.
- **Phase 3 (LLM) is too early.** External dependency, API key procurement, recurring
  cost, and its prompt can only be tuned once a dry-run *and* a rendered report can be
  seen side by side. Nothing else depends on it. Move it late.

```
S0   PDF spike (throwaway, not committed)              1 day  — gates §8
S1   ReportFormulaCompiler, pure, no schema            plain JUnit
S2   V24 + 3 entities + repos + ReportAccess + advice  the irreversible step, isolated
S3   Definitions + approve + active + dry-run          ← FIRST SHIPPABLE SLICE
S3f  Thin frontend: version list + dry-run table
S4   Templates + single-respondent PDF preview         no batch, no storage yet
S5   Batch: queue, executor, storage, requeue
S6   Drafts + manual review workflow (still no LLM)
S7   LLM generation + PII test + retry loop
S8   Three-pane reviewer UI
S9   Retention / purge job
```

**Smallest slice that ships real value: S3.** Three tables, the compiler, four
endpoints, bindings typed by hand. It delivers a versioned, immutable, auditable,
per-assessment scoring formula with a mandatory compile gate and a cohort-wide dry-run
surfacing null-count and band distribution. That is strictly better than a Data Studio
derived column today — which is unversioned, unapproved, silently null-fills on parse
failure, and permits forward references that evaluate to null forever.

**Drafts are deliberately deferred to S6.** A draft is scaffolding for the LLM; the
LLM is S7.

---

## Risks that bite during implementation

Ranked. Each was verified against source this session.

### R1 — Dual key-space (silent wrong output)
Three key spaces exist and two differ only by a prefix: `out_key` is stored **bare**
(`extraversion_score`, `UNIQUE(definition, out_key)`), bindings reference each other
as `[calc:extraversion_score]`, and templates write `${extraversion_score}` bare.

Data Studio genuinely uses `calc:` —
[DsSheetService.java:347](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/DsSheetService.java#L347)
builds `"calc:" + slug` and stores it *as* the `colKey` — so we inherit the convention
rather than inventing it. The hazard is discipline, not conflict: get it backwards and
either forward references resolve to `null` or every template placeholder is blank.
**Both fail silently** — `eval` on an unknown `ColRef` returns `coerce(row.get(k))` =
`null`, no error.

*Mitigation:* one class, `ReportKeys`, owns `internal(outKey) → "calc:"+outKey` and
`external(rowKey) → strip`. Never inline the literal `"calc:"` anywhere else.

### R2 — One evaluator per binding, not per batch (silently wrong numbers)
`ExpressionEvaluator` caches aggregates by `Call.id + "|" + scopeValue`, and `Call.id`
is a per-parse counter **restarting at 0 on every `parse()`**. `DsSheetService`'s class
javadoc is explicit about this and creates a fresh evaluator per column at
[line 227](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/DsSheetService.java#L227).

The design record's §4 and §9.1 ("all bindings evaluated over the whole population in
one pass") read as *one evaluator*. Implemented that way, `AVERAGE([mqt:14])` in
binding 1 and `ZSCORE([calc:score])` in binding 3 both hold `Call.id == 0`, and binding
3 silently receives binding 1's `Stats`.

*Mitigation:* `new ExpressionEvaluator(cohortRows)` **inside** the binding loop. Test
with two bindings whose first aggregate is over different columns.

### R3 — Every error path is a 500 until a new advice exists (blocks S3's verification)
[ApiExceptionHandler](../spring-social/src/main/java/com/bodhpsychometric/exception/ApiExceptionHandler.java)
has **no** handler for `NotFoundException`, `IllegalArgumentException` or
`IllegalStateException` — its `@ExceptionHandler(Exception.class)` backstop catches
them as 500. `DataStudioExceptionHandler` handles all three but is
`@RestControllerAdvice(basePackages = "com.bodhpsychometric.controller.datastudio")`.

*Mitigation:* ship `ReportEngineExceptionHandler` in **S2, before the first endpoint**.
And put the new controllers in **`controller/reportengine`, not `controller/reports`** —
`controller/reports/AssessmentReportController` already exists at `/api/reports`, and a
`basePackages`-scoped advice there would silently change its status codes.

### R4 — The migration is untested until it hits real MySQL, irreversibly
`./mvnw test` proves entity↔H2 mapping only. V24's *first* execution is a live boot
against MySQL, where `ddl-auto: validate` turns any mismatch (`bigint` vs `int`,
`char(64)` vs `varchar(64)`) into a boot failure, and where writing the file
auto-applies within seconds.

*Mitigation — the order is non-negotiable:*
1. Entities first; `./mvnw -B clean test` green (proves mapping).
2. **Dump the DDL Hibernate actually expects** against the MySQL dialect into scratch —
   do not hand-write it:
   `./mvnw -B test -Dspring.jpa.properties.jakarta.persistence.schema-generation.scripts.action=create -Dspring.jpa.properties.jakarta.persistence.schema-generation.scripts.create-target=<scratch>/v24.sql -Dspring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect`
3. Hand-format into `V24__…sql` with `CREATE TABLE IF NOT EXISTS` guards and named FKs,
   per V20's precedent.
4. Confirm `DB_PORT=3306` is actually in effect **before the file exists on disk**.

Also watch trailing capitals (per memory, `posX` → `posx`, not `pos_x`) and verify H2
`MODE=MySQL` accepts `columnDefinition = "LONGTEXT"` — `TEXT` is the only long form
proven in-repo.

### R5 — `columnKeys()` re-scores the whole population
[DataStudioDatasetService:245](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/DataStudioDatasetService.java#L245)
calls `dataset(...)` and throws the rows away; `dataset()` runs `MqtScoringService.score()`
for every completed respondent. §5 step 4 ("verify references against `columnKeys(...)`")
inside a batch that already loaded the dataset is a **second full scoring pass**.

*Mitigation:* `compile(definition, availableKeys)` takes the key set as a parameter. The
batch derives it from the `DsDatasetResponse.columns()` it already holds; the approval
path (where cost is irrelevant) calls `columnKeys()`.

### R6 — Cohort scope needs in-memory filtering, and one scope is N cohorts
`dataset()` returns **one row per allotted attempt, including NOT_STARTED and ONGOING**.
So `ASSESSMENT_COMPLETED` requires filtering rows on `core:completed` before building
the evaluator — the design record never says this. Score columns are null on incomplete
rows so `stats()` skips them, but `core:*`, `demo:*` and `ans:*` are **not** null, so
every `AVERAGE`, `COUNT` and `PERCENTRANK` shifts if unfiltered.

Worse: `ORGANIZATION_COMPLETED` means "the respondent's own organization" — in a
multi-org batch that is N different cohorts, so §4's "one `dataset()` per batch" only
holds for the other two scopes.

*Mitigation:* load `dataset(assessmentId, null)` **once**, partition in memory by
`core:organizationId`, run the binding loop per partition. Never loop `dataset()`.

### R7 — Template rendering is an SSRF hole §8 never mentions
§8.2 correctly rejects Thymeleaf/SpEL, then leaves a bigger hole open: OpenHTMLtoPDF's
default user agent **resolves external URIs**, so `<img src="http://169.254.169.254/…">`
in admin-authored HTML becomes a server-side fetch from inside the network — as does an
XML external entity.

*Mitigation:* an `FSUriResolver`/`FSStreamFactory` permitting only `data:` and
`classpath:`, plus an XML reader with DTD and external-entity processing disabled. Test
that an external `<img>` fails the **save**, and that the renderer refuses the fetch even
if one were somehow stored.

### R8 — `NORMBAND` is in `SERVER_FUNCS`, so `evalTarget` is the wrong min-cohort gate
Confirmed at
[ExpressionService.java:51-53](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/expression/ExpressionService.java#L51-L53):
`NORMBAND` sits alongside `ZSCORE` and `PERCENTILE` despite `normBand()` being row-local.
Gating the `min_cohort_size` null-out on `validate().evalTarget() == SERVER` would null
`NORMBAND([mqt:14], 40, "Low", "High")` — a formula needing no cohort at all, and exactly
binding 2 of the record's own §10a worked example.

*Mitigation:* `ReportKeys.POPULATION_FUNCS = SERVER_FUNCS − {NORMBAND}`, gated on
`validate().functions()`, never on `evalTarget`.

### R9 — `validate(expr, Set.of())` silently disables all column checking
[ExpressionService.java:141](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/expression/ExpressionService.java#L141):
`if (!available.isEmpty() && !available.contains(key))`. An **empty** available set means
"check nothing". If the compiler ever passes an empty whitelist — e.g. `columnKeys()`
returned empty because the assessment 404'd, which it does silently via `ifPresent` —
every unknown column passes validation and evaluates to `null` forever. That is the exact
"500 blank reports" failure §5 exists to prevent, entering through the front door.

*Mitigation:* the compiler asserts a non-empty whitelist and throws before validating.

### R10 — `requireActor()` returns ANONYMOUS on `@Async`/`@Scheduled` threads
`ActorFilter.current()` reads `RequestContextHolder`. Any access check reached from the
batch worker or sweeper — including one buried in a service you reuse — throws 401 on a
thread with no request.

*Mitigation:* capture `requested_by_user_id` at batch creation and pass it explicitly.
**Never call `requireActor()` below the controller layer on the async path.**

### R11 — `@Async` on the default pool is an unbounded queue; `@Scheduled` is one thread
No custom `TaskExecutor` bean exists. `@EnableScheduling` gives a **single** scheduler
thread shared by `ActivityLogPurge` and `SubmissionDigestService.sweep()`. 500 async
render tasks would queue in front of `digestAsync`.

*Mitigation:* (a) make the batch **one** async task looping rows, not N tasks — that
alone removes the flood; (b) a bounded `reportExecutor` `ThreadPoolTaskExecutor` with
`CallerRunsPolicy`, used as `@Async("reportExecutor")`, so the default pool is untouched.

### R12 — Three similar id spaces, one ambiguous column name
`RespondentUser` has its own `@Id Long id` **plus** a separate `userId` FK to `User` —
different numbers. `dataset()` puts `respondent.getId()` into `core:respondentId`, while
`rowId` is the *allotment* id. `report_batch.requested_by_user_id` is clearly `User(id)`.

*Decision:* name it `respondent_id` referencing `RespondentUser(id)`, matching
`core:respondentId`, and put the FK in the migration so the database refuses the mistake.
Getting this wrong serves reports to the wrong person's download endpoint.

### R13 — Fonts and XHTML strictness (the reason S0 exists)
Temurin JRE images are Debian-slim without `fontconfig`; any glyph outside PDFBox's
base-14 renders as a box. With Indian respondent names that is a *when*, not an *if* —
bundle a TTF as a classpath resource and `useFont(...)` it, designed in from S0.
Separately, OpenHTMLtoPDF parses **XHTML, not HTML**: an admin's unclosed `<td>` is a
parse failure, so the template validator must run the XHTML parse **at save time**.

### R14 — The AST is walk-only from outside its package
`ExpressionService.Node` subclasses are public with public final fields, but their
**constructors are package-private**. A compiler in `service.reportengine` can walk nodes
but cannot construct or rewrite them. Fine for dependency extraction; it rules out
inlining sub-expressions or synthesising guard nodes. Plan the compiler as walk-only.

### R15 — Two conflicting service conventions in the repo
`CLAUDE.md` says "no service layer: `@RestController` + class-level `@Transactional` +
`@Autowired` fields". The `datastudio` package does the opposite: constructor-injected
`@Service`, thin controllers, DTOs with `from()`. **Follow the datastudio convention** —
it is newer and the report engine reuses its pieces. State it, or a parallel agent will
write the other one.

---

## S0 — PDF spike (throwaway, do not commit)

**Touch:** `spring-social/pom.xml` (temporary). **New (throwaway):**
`spring-social/src/test/java/com/bodhpsychometric/PdfSpikeTest.java`.

Render a hardcoded XHTML string — a table, a CSS-2.1-only `<style>` block, one inline
`<svg>` bar, one Devanagari string — to `byte[]`; assert the `%PDF-` magic and a
non-trivial length.

```bash
cd spring-social && ./mvnw -B test -Dtest=PdfSpikeTest
docker build -t bodh-pdfspike .          # the real question: the runtime image
docker run --rm bodh-pdfspike java -version
# open the output — Devanagari glyphs must not be boxes
```

**Gate:** if this fails, stop and revisit §8 before any schema is written.

---

## S1 — `ReportFormulaCompiler`, pure

**New**, all under `spring-social/src/main/java/com/bodhpsychometric/`:
- `service/reportengine/ReportFormulaCompiler.java`
- `service/reportengine/ReportKeys.java` — sole owner of the `calc:` prefix (R1) and
  `POPULATION_FUNCS` (R8)
- `dto/RfBindingSpec.java` — `record RfBindingSpec(String outKey, String label, String expr, String resultType, String format)`
- `src/test/java/com/bodhpsychometric/ReportFormulaCompilerTest.java` — **plain JUnit, no
  `@SpringBootTest`**; `new ExpressionService()` needs no context, keeping this ~0.2s

The compiler closes a gap Data Studio leaves open. `DsSheetService.compute()` nulls a
column and continues on parse failure
([lines 216-224](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/DsSheetService.java#L216-L224));
for a spreadsheet a blank cell is acceptable, **for a report a null score is a wrong
report**. Worse, `availableColumns()` offers every sibling column *regardless of sort
order*, so a formula referencing a later-sorted column saves and evaluates to null
forever.

1. `parse()` every binding — failure is a **hard error**, never a null-fill.
2. Build the reference graph from `validate().referencedColumns`, treating `calc:` keys
   as internal sibling refs.
3. **Topologically sort. Reject cycles and self-reference.** Persist the order into
   `sort_order` so execution order is a *stored fact*, not re-derived per run.
4. Verify every external reference against the supplied whitelist (R5), asserting it is
   non-empty (R9).
5. Return an ordered `List<CompiledBinding(outKey, Node, resultType)>`.

Runs **twice, deliberately**: blocking at approval, re-verified at generation — the
assessment's columns can change after approval (a question unplaced, an MQT deleted).
That re-check is also why we do **not** need to pre-check MQT/question deletes against
formula text.

**Verify:** `./mvnw -B test -Dtest=ReportFormulaCompilerTest` — valid DAG orders
correctly; cycle rejected; self-reference rejected; forward reference reordered not
nulled; unknown column is a hard error; empty whitelist throws; `POPULATION_FUNCS`
excludes `NORMBAND`.

---

## S2 — Schema (V24) + 3 entities + guards

> ### ⚠️ Hard gate before the migration file exists on disk
> `application.yml:18` still defaults `DB_PORT` to **3307** — the SSH tunnel to shared
> staging — and per memory a `V<n>.sql` **auto-applies via the IDE within seconds of
> being written**. You have confirmed the target is the **local 3306 container**.
> So, as the first action of this step and before creating the file:
> ```bash
> docker exec bodhpsychometric-mysql mysql -ubodh -pbodh -e "select @@port, @@hostname"
> # and confirm the running app's DB_PORT is 3306, not the yml default
> ```
> MySQL commits DDL implicitly and cannot roll it back.

**New:**
```
src/main/resources/db/migration/V24__add_report_engine.sql
model/reportengine/ReportFormulaDefinition.java  ReportFormulaBinding.java  ReportFormulaActive.java
repository/reportengine/{ReportFormulaDefinition,ReportFormulaBinding,ReportFormulaActive}Repository.java
model/reportengine/enums/CohortScope.java        (ASSESSMENT_COMPLETED|ASSESSMENT_ALL|ORGANIZATION_COMPLETED)
service/reportengine/ReportAccess.java
controller/reportengine/ReportEngineExceptionHandler.java          (R3 — before any endpoint)
```
**Touch:** `application.yml` — `app.reports.{min-cohort-size, require-separate-approver,
storage-dir, retention-days}` in **both** profile documents.

Follow [V20__add_data_studio.sql](../spring-social/src/main/resources/db/migration/V20__add_data_studio.sql)
exactly: long header comment, `CREATE TABLE IF NOT EXISTS` throughout so a re-run is a
no-op, named FKs, **zero alterations to existing tables**. Entity conventions per the
datastudio package (R15) and
[DsDerivedColumn.java](../spring-social/src/main/java/com/bodhpsychometric/model/datastudio/DsDerivedColumn.java) —
`ReportFormulaBinding` mirrors it field-for-field so the same evaluate loop works.

Two structural points that are load-bearing:

- **`report_formula_active` has `assessment_id` as its PRIMARY KEY.** MySQL has no
  partial unique index, so "one active version per assessment" cannot be
  `UNIQUE(...) WHERE active`. A pointer table keyed by assessment enforces it exactly,
  with no `ALTER` on `Assessment`. Deactivating is deleting the row; switching is an upsert.
- **Definitions are immutable and never deleted.** "Editing" a formula is approving a new
  version, `version = max+1`, unique `(assessment_id, version)`. That is what keeps
  historical reports explicable.

`ReportAccess` models
[DataStudioAccess](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/DataStudioAccess.java):
`requireActor()` **rejects anonymous regardless of `app.security.require-auth`**, because
every row here is owned by somebody. Reuse
[RequestActor](../spring-social/src/main/java/com/bodhpsychometric/security/RequestActor.java)
(`userId`, `email`, `superAdmin` — built from token claims, no DB round trip). Add
`requireDifferentApprover(...)`, gated by `app.reports.require-separate-approver`.

**Verify:** the R4 sequence — `./mvnw -B clean test` green → dump DDL → hand-format →
confirm 3306 → boot. Success is Flyway logging `Migrating schema to version 24` **and**
the app reaching `Started BodhpsychometricApplication` (which is `ddl-auto: validate`
passing).

---

## S3 — Definitions + approve + active + dry-run ← first shippable slice

**New:**
```
service/reportengine/ReportCohortService.java    one dataset() load, scope filter (R6), Redis cache TTL 60s
service/reportengine/ReportScoringService.java   compiled plan → value maps + summary stats
service/reportengine/ReportFormulaService.java   create / compile / approve / activate / dry-run
controller/reportengine/ReportFormulaController.java   @RequestMapping("/api/report-formulas")
dto/Rf{DefinitionRequest,BindingRequest,DefinitionResponse,BindingResponse,ActiveResponse,DryRunResponse,KeyStatsResponse}.java
src/test/java/com/bodhpsychometric/ReportFormulaDefinitionTest.java
```
Reused unchanged: `ExpressionService`, `ExpressionEvaluator`, `DataStudioDatasetService`,
`RequestActor`, `PortalRedisStore`.

### The cohort problem — the sharpest constraint, and the brief did not account for it

`ZSCORE`, `PERCENTILE`, `PERCENTRANK` and `RANK` are **population functions**; they cannot
be computed from one respondent's row.

**`cohort_scope` lives on the `FormulaDefinition`, not on the request.** A z-score is
meaningless without its norm group, and *which* norm group is the psychometric decision
the reviewer is approving. If a request could change it, two people would get different
"z-scores" from the same approved formula — destroying the deterministic reuse that is
the entire point of the feature.

- One `dataset()` load per batch, partitioned in memory (R6). Even single-person
  generation loads the full cohort — unavoidable and correct. Cache in `PortalRedisStore`
  keyed `(assessmentId, orgId, definitionId)`; it already has a working circuit breaker
  and degrades instead of throwing.
- **Enforce `min_cohort_size`** (default 30), gated on `POPULATION_FUNCS` not `evalTarget`
  (R8). This is an integrity control, not a nicety: at
  [ExpressionEvaluator.java:123](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/expression/ExpressionEvaluator.java#L123)
  — `if (Double.isNaN(v) || s.sd == 0) return s.sd == 0 ? 0d : null;` — a single-respondent
  cohort has `sd == 0`, so **every z-score comes back exactly 0**, indistinguishable from
  "perfectly average". Below the floor, emit `null` and let the template render a "norm
  group too small" block.
- Document that
  [Stats.sd:197](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/expression/ExpressionEvaluator.java#L197)
  is **population** sd (÷ n), not sample sd. Do **not** silently change it — that would
  move every Data Studio number already on screen.

### The dry-run is what makes review a real control

`POST /definitions/{id}/dry-run` compiles, evaluates over the **real cohort**, and returns
the first ~20 respondents' values **plus per-key min / max / mean / null-count / band
distribution**.

Those aggregates are the review's teeth. A formula yielding 40 % nulls, or placing 100 % of
respondents in "High", is wrong in a way no amount of expression-reading catches. Client-side
preview cannot substitute: `formula.ts:179` is explicit that SERVER functions are valid
grammar but not evaluable client-side, and `ZSCORE`/`PERCENTILE`/`NORMBAND` are all
SERVER-classified — so the client could preview almost nothing. The client mirror still
earns its place for zero-latency as-you-type **syntax** feedback.

### Endpoints (repo's verb-in-path style)

```
GET    /columns/getByAssessment/{assessmentId}      the whitelist, for editor and LLM
POST   /definitions/create                          {assessmentId, cohortScope, minCohortSize, prompt, bindings[]}
GET    /definitions/getByAssessment/{assessmentId}  version history
GET    /definitions/getById/{definitionId}
POST   /definitions/{definitionId}/dry-run
POST   /active/set/{definitionId}                   roll back / forward
GET    /active/getByAssessment/{assessmentId}
DELETE /active/clear/{assessmentId}
POST   /validate-expr                               {assessmentId, expr} → DsExprResponse
```
`POST /validate-expr` mirrors Data Studio's existing contract: **HTTP 200 with `errors[]`**,
never an error status — a half-typed formula is a normal state, not a failure. Conflicts are
**pre-checked** with `existsBy...`, never caught inside the transaction (rollback-only turns a
409 into a 500 at commit). **Never return entities** — `open-in-view` is off.

### Verify S3

```bash
BASE=http://localhost:8080; A=12   # an assessment with >=1 COMPLETED attempt
TOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"...","dob":"..."}' | jq -r .token)
AUTH="Authorization: Bearer $TOKEN"; JSON="Content-Type: application/json"

DEF=$(curl -s -X POST $BASE/api/report-formulas/definitions/create -H "$AUTH" -H "$JSON" -d '{
 "assessmentId":'$A',"cohortScope":"ASSESSMENT_COMPLETED","minCohortSize":30,
 "prompt":"__smoke__ extraversion","bindings":[
  {"outKey":"extraversion_score","label":"Extraversion","expr":"ROUND(([mqt:14]+[mqt:15])/2*20,1)","resultType":"number"},
  {"outKey":"extraversion_band","label":"Band","expr":"NORMBAND([calc:extraversion_score],40,\"Low\",70,\"Moderate\",\"High\")","resultType":"string"}]}' \
 | jq -r .reportFormulaDefinitionId)

# topological order was PERSISTED, not re-derived → sortOrder 0 then 1
curl -s -H "$AUTH" $BASE/api/report-formulas/definitions/getById/$DEF | jq '.bindings[]|{outKey,sortOrder}'

# the review's teeth
curl -s -X POST $BASE/api/report-formulas/definitions/$DEF/dry-run -H "$AUTH" | jq '{n:.cohortSize, stats:.keyStats}'
# assert extraversion_band is NOT 100% one bucket — that is the NORMBAND inversion trap
```

**Error paths — the part the phase must actually prove** (all four must NOT be 500s, R3):

| Case | Expect |
|---|---|
| cyclic bindings `a→b, b→a` | 400 |
| unknown column `[mqt:999999]` | 400 |
| anonymous, with `require-auth` **off** | 401 |
| unknown definition id | 404 |
| approve an already-APPROVED definition | 409 |
| author approves own draft, non-super-admin (S6) | 403 |

Cleanup: `delete from report_formula_definition where prompt like '\_\_smoke\_\_%';`

Targeted tests: `min_cohort_size` gate emits `null` not `0` at n=1; fresh evaluator per
binding yields distinct aggregates (R2); empty whitelist throws (R9).

---

## S3f — Thin frontend

**New:** `bodhassess-app/src/pages/report-engine/{index,formulas}.tsx`, `reportEngineApis.ts`
(axios, `import.meta.env.VITE_API_URL` — never `process.env`, it crashes in the browser).
**Touch:** [routes/index.tsx](../bodhassess-app/src/routes/index.tsx) (`lazyPage` + route in the
private branch), [config/bodhassess.config.tsx](../bodhassess-app/src/config/bodhassess.config.tsx)
(menu entry). **Reuse, don't fork:** `@/pages/data-studio/lib/formula`.

Note the coupling: `config/page-catalog.ts` **derives role permissions from
`MENU_SIDEBAR`**, so renaming a path later needs a DB migration of stored permissions
(see the V12 precedent).

**Verify:** `npm run typecheck && npm run build`, then the flow in the browser.

---

## S4 — Templates + single-respondent PDF

**New:** `V25__add_report_template.sql`, `model/reportengine/ReportTemplate.java` + repo,
`service/reportengine/template/{ReportTemplateParser,ReportTemplateRenderer,SvgChartHelper}.java`,
`service/reportengine/pdf/PdfRenderer.java`, `ReportTemplateService.java`,
`controller/reportengine/ReportTemplateController.java`, `dto/Rt{TemplateRequest,TemplateResponse}.java`,
`src/main/resources/report-fonts/*.ttf`, tests `ReportTemplateRenderTest`,
`ReportTemplateContractTest`, `ReportPdfSecurityTest`. **Touch:** `pom.xml` (OpenHTMLtoPDF,
permanently this time).

Build the closed `${key}` grammar as decided. **CSS 2.1 only — no flexbox, no grid, no
JavaScript**; charts are server-rendered inline SVG per your decision. Templates must be
authored inside that box from day one; retrofitting print CSS onto a flexbox design does not
work. HTML-escape every substitution — the template layer needs **its own** tag/attribute
allowlist, not `RichTextHtml` (correction 3). Lock the URI resolver and disable DTD
processing (R7). Run the XHTML well-formedness check **at save time** (R13).

Validate the placeholder contract at save: refuse a template naming a key the active
definition does not produce (409, keys listed); store the extracted set in `required_keys` so
the reverse check is cheap — approving a definition that drops a key must warn about every
template using it.

**Verify:** create a good template; then prove **409** on an unknown placeholder, **400** on
`<img src="http://169.254.169.254/">`, **400** on non-XHTML (`<br>`, unclosed `<p>`). Then the
payoff — `POST /report-templates/{t}/preview/{respondentId}` → a file starting `%PDF-` whose
numbers equal the S3 dry-run row for that respondent, exactly.

---

## S5 — Batch, executor, storage

**New:** `V26__add_report_batch.sql`, `model/reportengine/{ReportBatch,GeneratedReport}.java`
+ repos, `config/ReportExecutorConfig.java` (R11), `service/reportengine/ReportBatchService.java`,
`ReportRenderWorker.java`, `ReportStorage.java`, `controller/reportengine/{ReportBatch,GeneratedReport}Controller.java`,
`dto/Rb*.java` + `dto/GrRowResponse.java`.

**Touch:** `/home/kcc/Desktop/BODH/docker-compose.yml` — **two edits, not one**: uncomment the
`app-uploads` mount **and** add `app-uploads:` to the top-level `volumes:` block, which is also
missing. Uncommenting alone fails. Also `application.yml` (`app.reports.storage-dir`, both
profiles).

Follow [SubmissionDigestService](../spring-social/src/main/java/com/bodhpsychometric/service/SubmissionDigestService.java):
durable rows + `@Async` + `@Scheduled(fixedDelay)` sweeper + `MAX_ATTEMPTS = 3` + a **visible**
failed state with manual requeue. Durable in MySQL, not Redis — `generated_report` rows **are**
the queue and the progress UI at once (`COUNT(*) GROUP BY status`).

**Two phases, two failure granularities** — this is the split the original brief got wrong:

| Phase | On failure |
|---|---|
| **Score** — one dataset load, one compile, all bindings over the population | **Fails the whole batch, atomically.** A compile error is definition-level; a broken formula must not quietly produce 500 blank reports. |
| **Render** — per respondent, independent | **Fails one report.** Row → `FAILED` with `error_message`; the batch continues. |

**Reproducibility.** Store `values_json` (the exact map merged into the template) and
`inputs_hash` (SHA-256 over the *referenced-column subset* of the respondent's row + every
`expr` + `cohort_scope` + cohort size — `validate()` already tells us which columns to hash).
Re-render always reads the **snapshot**, never live answers, so fixing a template cannot
silently change the numbers; a recomputed hash that differs flags the report as superseded
rather than rewriting it. This matters because **no score is persisted anywhere else in this
repo** — `MqtScoringService` is pure and re-derived per export — and because a granted
re-attempt *replaces* the answer set with no historical row to fall back on.

**Only COMPLETED attempts**, enforced at batch creation, not render time.

**Verify:** create a batch, poll progress; one deliberately-broken template must fail **exactly
one** report, not the batch; requeue works; anonymous download is 401; `/values` returns the
snapshot. Then `docker compose down && up` and confirm a stored PDF still downloads — that is
what proves the volume fix.

---

## S6–S9 — outline

**S6 — Drafts, still no LLM.** `V27__add_report_formula_draft.sql`, entity, repo, draft
endpoints, `dto/RfDraft*.java`. Draft holds `prompt`, `bindings_json`, `assumptions_json`,
`raw_response`, `model`, `status`, `generation_attempts`, `human_edited`,
`superseded_by_draft_id`, and the review audit trail. JSON columns because a draft is an
opaque *proposal* edited as a whole — nothing references it by key. Verify the **403** on
self-approval with `require-separate-approver=true`, 200 when false.

**S7 — LLM generation.** Add `com.anthropic:anthropic-java` to `pom.xml`. The backend makes
**zero outbound HTTP calls** today, so timeouts, retries and graceful degradation are all new
work — the SDK supplies them, which is why it beats a hand-rolled `RestClient`. Jackson
coexists fine: the repo is on Jackson 3 (`tools.jackson.databind`, see
[DsJson.java](../spring-social/src/main/java/com/bodhpsychometric/service/datastudio/DsJson.java))
and the SDK on Jackson 2 (`com.fasterxml.jackson`) — different package roots by design; verify
on the first `clean test` regardless.

Constrained output via **strict tool use**, which guarantees the bindings JSON validates:

```java
MessageCreateParams.builder()
    .model("claude-opus-5")
    .maxTokens(16000L)
    .thinking(ThinkingConfigAdaptive.builder().build())
    .systemOfTextBlockParams(List.of(TextBlockParam.builder()
        .text(GRAMMAR_SYSTEM_PROMPT)               // stable across calls → cache it
        .cacheControl(CacheControlEphemeral.builder().build())
        .build()))
    .addTool(Tool.builder().name("emit_bindings").strict(true)
        .inputSchema(BINDINGS_SCHEMA)              // additionalProperties:false + required
        .build())
    .addUserMessage(columnSchemaTsv + "\n\n" + psychometricianPrompt)
    .build();
```

Config under `app.llm.anthropic.{api-key,model,timeout-seconds,max-retries}` — **key from
environment, never `application.yml`**. Degrade like `PortalRedisStore`: the API being
unavailable must break only *generate a new draft*; review, approval and report generation
never call it.

Four things decide whether this works:

- **PII invariant.** Column *schema* only — keys, labels, types. **Never rows.**
  `core:name`/`core:email` exist in every dataset row, so the serializer must never touch
  `dataset().rows()`. Assert with a test on the request body. Per your decision, MQT paths and
  truncated question stems **are** sendable.
- **Schema budget.** Always send every `core:`/`demo:`/`mq:`/`mqt:`/`mqtt:` column (bounded by
  the taxonomy — tens). `ans:` is the long tail: compact `key⇥label⇥type` lines, stems
  truncated to ~80 chars, capped at ~300, and **state in the prompt that the list was
  truncated** so the model reports an unresolved item rather than inventing a key. Label MQTs
  by `MqtRef.path` (`Cognition › Verbal › Vocabulary`) — MQT names are deliberately not unique.
- **The `NORMBAND` inversion trap.** Cuts are ascending with `v < cut`, so
  `NORMBAND(x, 40, "Low", 70, "Moderate", "High")` means *below 40 → Low*. "Label above 70 as
  High" therefore becomes `NORMBAND(x, 70, "Not High", "High")` — **the natural phrasing
  inverts.** This is the single most likely LLM error and **the validator cannot catch it**:
  arity passes, semantics invert. Worked examples in both directions in the system prompt; the
  dry-run band distribution is what actually catches it.
- **Retry loop.** Validate each binding, resend failures with their `errors[]` verbatim, **max
  2 retries** (matching `SubmissionDigestService.MAX_ATTEMPTS`). After that save the draft as
  `PENDING` with errors attached — a human fixes it. **Never discard the work.**

Verify: a real prompt on a real assessment produces a draft that compiles with zero human
edits; then unset the key and confirm generate degrades cleanly while approve, dry-run and
batch still work.

**S8 — Three-pane reviewer UI.** Frozen prompt │ bindings (key, label, expr, type, referenced
columns) │ dry-run table, with `rationale`/`assumptions`/`unresolved` alongside. Surface
null-count and band distribution prominently.

**S9 — Retention.** `service/reportengine/ReportPurge.java` modelled on `ActivityLogPurge`,
config-driven from the start so the policy answer is a restart.

---

## Verification loop (every step)

1. `cd spring-social && ./mvnw -B clean test` — 96 tests green as of 2026-08-24. **Never a
   bare `compile`** — per memory it reports `BUILD SUCCESS` over code that does not compile.
   Remember this suite proves mapping, **not migrations** (R4).
2. `cd bodhassess-app && npm run typecheck && npm run build` (S3f onward).
3. Live curl against `localhost:8080` with `__smoke__` data, deleted after. Prove
   400/401/403/404/409, not just 200.
4. IDE diagnostics arriving mid-edit are often stale — trust `tsc` and Maven.

## Deferred, deliberately

- **Formula scoping stays per-assessment**, as your brief specified. Worth knowing: every
  column key a formula can reference is derived from the *questionnaire*, so two assessments
  sharing a questionnaire have byte-identical whitelists and each need their own approved
  definition. If that duplication bites, the cheap fix is a "copy definition from assessment X"
  endpoint — **not** re-keying the tables, which would change `uqRfdefAssessmentVersion`, the
  primary key of `report_formula_active`, and force re-approval of everything.
- **Fixed external norm tables** (published means/SDs by age and sex) rather than a live
  cohort. Genuinely different feature; the most likely next request. The `NORMBAND` cut
  arguments are the seam it would attach to.
- **Sample sd.** If wanted for reports specifically, that is a **new whitelisted function**
  (`ZSCORE_S`), never an edit to `ZSCORE`.
- **Who authors template HTML.** If psychometricians rather than developers, a WYSIWYG editor
  is implied and is budgeted nowhere. Worth confirming before S4 ships.
- **PDF retention policy** — needed before go-live, not before code.

## Files to touch outside the new packages

- `spring-social/pom.xml` — OpenHTMLtoPDF (S4), `com.anthropic:anthropic-java` (S7)
- `spring-social/src/main/resources/application.yml` — `app.reports.*`, `app.llm.*`, both profiles
- `/home/kcc/Desktop/BODH/docker-compose.yml` — mount **and** `volumes:` entry (S5)
- `bodhassess-app/src/routes/index.tsx`, `src/config/bodhassess.config.tsx` (S3f)
- `docs/report-engine-plan.md` — the five corrections above
- `CLAUDE.md` — fix the stale per-attempt claim
