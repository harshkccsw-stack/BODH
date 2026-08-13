# Error handling & activity logging — implementation plan

Two related jobs, deliberately kept in one plan because the second depends on
the first:

1. **Error handling** — every failure leaves the API in the one shape both
   frontends can read, and nothing falls through to Spring's default body.
2. **Activity logging** — who hit what, when, with what result, stored so the
   dashboard can show it.

Phases 0–5 are **built and verified**; the one deliberate switch — `REQUIRE_AUTH=true` — is still off everywhere.
Tick the boxes as they land; each phase is independently shippable.

---

## Status at a glance

| Phase | Scope | Est. | Status |
| --- | --- | --- | --- |
| 0 | Logging hygiene + error config | ½ day | ✅ **done** 2026-08-10 |
| 1 | Widen `ApiExceptionHandler` + request id | 1–2 days | ✅ **done** 2026-08-10 |
| 2 | Bulk `@Valid` hole | ½ day | ✅ **done** 2026-08-10 |
| 3 | **Identity on the wire (the gate)** | 2–4 days | ✅ 3a, ✅ 3b, ◐ 3c built — **flag off, awaiting the flip** |
| 4 | Activity trail (capture + store) | 3–5 days | ✅ **done** 2026-08-10 |
| 5 | Activity viewer UI | 2–3 days | ✅ **done** 2026-08-10 (5b split out) |
| 6 | Optional depth (entity auditing, log shipping) | — | ☐ deferred |

Backend tests: **17 → 55**, all green. Phases 0–2 touched **no frontend code**
and changed no request or response shape, so nothing had to ship in lockstep.

**Nothing in phases 0–3b changes what any client sees.** Enforcement exists but
is switched off; `REQUIRE_AUTH=true` is the single deliberate step that makes
the API start refusing anonymous callers.

**The activity trail records `actor = anonymous` until `REQUIRE_AUTH=true`.**
The dashboard and portal both send their token now, so authenticated calls are
already attributed — but nothing yet *forces* a caller to identify itself, so
anything that skips the header is recorded without a who. That is the intended
behaviour of the flag being off, not a defect.

---

## Where we started (baseline audit, 2026-08-10 — kept for context)

| Area | State |
| --- | --- |
| Controllers | 20; **15 carry class-level `@Transactional`** |
| Hand-written error returns | ~75 `Map.of("message", …)` sites |
| Thrown errors | `ResponseStatusException` in 5 services (Portal auth 9, Portal registration 11, Dashboard auth 9, Portal assessment 7) |
| Central handling | `exception/ApiExceptionHandler.java` — handles **2** exception types |
| try/catch in the whole backend | **5 blocks**, all deliberate |
| Request pipeline hooks | **none** — `CorsConfig` is the only `WebMvcConfigurer`; no filter, no interceptor |
| Auth on dashboard endpoints | **none**; the dashboard's per-page axios files send **no `Authorization` header** and there is no axios interceptor. Only the legacy `lib/api.ts` attaches a bearer |
| Backend files reading the header | 7, all auth/portal |
| Migrations | V1–V6 applied; **next free version is V7** |
| `ddl-auto` | `validate` — an entity without its migration fails startup |
| `show-sql` | **`true` in both dev and production** |
| Observability deps | no actuator, no micrometer, no logback config, no request id |
| Backend tests | 17, green |

### What a client sees today when it goes wrong

| Situation | Response |
| --- | --- |
| `GET /api/questions/getById/abc` | 400, **no `message` key** |
| Malformed JSON body | 400, no `message` |
| Unique-key race outside `/api/portal/register/{token}` | 500, no `message` |
| Unexpected `RuntimeException` | 500, no `message` |
| Unknown URL / wrong method | 404 / 405, no `message` |
| `@Valid` on a `List<T>` body | **elements never validated** |

All of these fall through to Spring's default error handler.
`server.error.include-message` is unset (defaults to `NEVER`) and
**spring-boot-devtools flips it to `ALWAYS`** — so every one of these looks
correct in development and goes blank in production. Devtools is `runtime`
scope and absent from the packaged jar.

---

## Decisions locked before we start

1. **The error body stays `{"message": "…"}`.** Every api file in both
   frontends reads `e?.response?.data?.message`. We do **not** turn on
   `spring.mvc.problemdetails.enabled` / RFC 9457 unless the frontends change
   in the same PR.
2. **One throw style.** Services throw; controllers stop building error
   `ResponseEntity`s by hand. `ResponseStatusException` stays until Phase 5b
   introduces the domain exception family — we do not run both conventions
   permanently.
3. **Schema via Flyway only.** Next free version is `V7`. `ddl-auto: validate`
   means the entity and its migration land in the same commit or the app will
   not boot.
4. **Audit writes never join the business transaction.** After-commit or
   `REQUIRES_NEW`; a logging failure must never roll back a legitimate save.
5. **Never recorded:** dob (it is the password), JWTs, `Organization.logoBase64`
   (up to 2 MB/row), assessment answers, demographic values. Request bodies, if
   stored at all, are truncated to 2 KB.
6. **No try/catch inside a `@Transactional` controller.** See the trap below.

### The `@Transactional` trap (read before writing any catch block)

15 of 20 controllers are `@Transactional` at class level. Catching a
`DataIntegrityViolationException` inside one marks the transaction
rollback-only: you return 409, then Spring throws `UnexpectedRollbackException`
at commit and the client gets a **500**. `PortalAuthController` is the existing
worked example — it has **no** class-level `@Transactional` precisely so its
catch sits outside the service's transaction. Either follow that pattern or let
the exception reach the advice, which runs after the rollback.

---

## Phase 0 — logging hygiene ✅

**Goal:** make the logs readable before we add to them.

- [x] `spring.jpa.show-sql: false` in the **production** profile — development keeps it on
- [x] `server.error.include-stacktrace: never`, `include-message: always`, `include-exception: false` set explicitly in both profiles — stop depending on devtools defaults
- [x] `logging.level.com.bodhpsychometric: INFO`
- [x] `logging.pattern.level: "%5p [%X{requestId:-}]"` — the request id rides in every log line of a request

All in `src/main/resources/application.yml`. Config only, no code paths changed.

---

## Phase 1 — widen the exception handler ✅

**Goal:** nothing reaches Spring's default error body, and every 5xx is
traceable to a log line.

> **Revised 2026-08-10** — `ApiExceptionHandler` now **extends
> `ResponseEntityExceptionHandler`** instead of listing exceptions by hand.
> See "the catch-all defect" at the end of this section for why; the
> behaviour below is unchanged, and the framework now owns ~20 more statuses.

`exception/ApiExceptionHandler.java` handles the following (was 2):

- [x] `MethodArgumentTypeMismatchException` → 400, `"id" must be a number` (enums list their values)
- [x] `HttpMessageNotReadableException` → 400, generic — the parser message names Jackson internals and is never echoed
- [x] `HttpRequestMethodNotSupportedException` → 405
- [x] `MissingServletRequestParameterException` → 400
- [x] `ConstraintViolationException` → 400
- [x] `HandlerMethodValidationException` → 400 — added for Phase 2; reports the failing element's position
- [x] `NoResourceFoundException` → 404, `No such endpoint`
- [x] `DataIntegrityViolationException` → 409, generic — the net **behind** the `existsBy…` pre-checks, which keep the good wording. Runs post-rollback, so no transaction interaction
- [x] `Exception` catch-all → 500, fixed sentence + `requestId`, **never** the exception text
- [x] `config/RequestIdFilter.java` — `HIGHEST_PRECEDENCE` `OncePerRequestFilter`; honours an inbound `X-Request-Id` **only after sanitising** (the value reaches both the log file and a response header, so an unchecked one would let a caller forge log lines with CR/LF), else generates a UUID. Clears MDC in `finally` — pooled threads would otherwise mislabel the next request
- [x] `ERROR` + stack for 5xx, single-line `WARN` for 4xx, both in one place
- [x] `ApiExceptionHandlerTest` — 12 tests driven through **real endpoints**, so they also prove the exception reaches the advice

**Verified live** against localhost:8080:

| Request | Before | After |
| --- | --- | --- |
| `GET /api/questions/getById/abc` | 400, no message | `{"message":"\"id\" must be a number"}` |
| `GET /api/there-is-no-such-thing` | 404, no message | `{"message":"No such endpoint"}` |
| `POST /api/reports/getRespondents` | 405, no message | `{"message":"POST is not supported on this endpoint"}` |
| malformed JSON | 400, no message | `{"message":"The request body could not be read"}` |
| any response | — | `X-Request-Id` header |

Note the fix is in the advice, **not** in `server.error.include-message`: the
advice builds the body itself, so these responses no longer depend on that
setting at all — which is what makes dev and production agree.

### The catch-all defect, and why the base class replaced it

The first version listed exception types by hand and finished with
`@ExceptionHandler(Exception.class)`. That backstop is matched by Spring
**before** the framework's own `DefaultHandlerExceptionResolver`, so every MVC
exception the list did not name was flattened to 500:

```
POST with Content-Type: text/plain
  before → 500 {"message":"Something went wrong on our side…"}   + ERROR + stack trace
  after  → 415 {"message":"Unsupported Media Type"}              + one WARN line
```

Wrong status, and worse, a caller's mistake logged as a server fault — the
exact signal a 5xx is supposed to carry.

Extending `ResponseEntityExceptionHandler` hands ~20 statuses (415, 406, 503,
413, …) back to the framework, which knows them. Spring matches the most
specific handler, so those never reach the backstop any more; the backstop now
only sees exceptions that are genuinely ours.

Two things this cost, both handled:

- **The body shape.** The base class emits RFC 9457 `ProblemDetail`, which
  would have broken every `e?.response?.data?.message` in both frontends.
  `handleExceptionInternal` is overridden as the single funnel that reshapes
  it back to `{"message"}` — adopting the base class did not mean adopting its
  format.
- **`ResponseStatusException` reasons.** It reaches the base class as an
  `ErrorResponseException`, but the reason our services throw does **not**
  arrive in `ProblemDetail.detail` — that is only filled when a `MessageSource`
  resolves one, so "Invalid email or date of birth" briefly became
  "Unauthorized". The funnel now falls back to `getReason()`. Caught by an
  existing test, which is the argument for having written them first.

One case genuinely cannot carry our body: a client sending
`Accept: application/xml` gets a **bodyless 406**, because the error shape is
JSON and it has said it will not take JSON. Asserted in the tests so it is a
known outcome rather than a surprise.

---

## Phase 2 — the bulk validation hole ✅

**Goal:** close a real correctness bug, not a shape bug.

Three endpoints took a bare `List<T>` body, and none of them ran bean
validation on the elements at all:

| Endpoint | Body |
| --- | --- |
| `POST /api/questions/bulk-create` | `List<QuestionRequest>` |
| `PUT /api/questionnaire/{id}/demographic-fields` | `List<QuestionnaireDemographicFieldRequest>` |
| `PUT /api/questionnaire/{id}/questions` | `List<QuestionnaireQuestionRequest>` |

- [x] All three now take `List<@Valid T>` — the **element** form. `@Valid List<T>` does not cascade and silently validates nothing
- [x] `QuestionnaireDemographicFieldRequest.demographicFieldId` and `QuestionnaireQuestionRequest.questionId` gained `@NotNull` — they had no constraints at all, so there was nothing for a cascade to check
- [x] The advice reports the position: **`item 2: stem is required`**
- [x] Hand-written pass-1 checks **kept** — they cover what bean validation cannot express (a referenced MQT must exist, no duplicate ids in one list)
- [x] Two tests: the element is rejected *with its position*, and the valid first item of a rejected batch is **not** committed

**Deviation from the original plan, deliberate.** The plan called for wrapping
each body in a record, which changes the wire format and forces a
frontend/backend lockstep deploy. `List<@Valid T>` gets the same validation
through Spring's built-in handler-method validation with **no change to the
request shape**, so no frontend work and no coordinated release. The record
wrapper is strictly worse here.

**Risk:** none to the wire. The only visible change is better messages —
`item 2: stem is required` where the hand-check previously said
`question 2: stem is required`.

---

## Phase 3 — identity on the wire ⟵ the gate

**Goal:** the server knows who is calling. Without this, Phase 4 records
`actor = null` for nearly every request.

`JwtService` already gives us everything: subject = `userId`, plus `email` and
`superAdmin` claims, so resolving the actor costs **no database hit**.

Roll out in this order — the sequence is the safety.

**3a — frontends send the token (harmless on its own)** ✅ *bodhassess-app done 2026-08-10*
- [x] `lib/authApis.ts` — `/auth/login` and `/auth/me` moved out of `lib/api.ts` into the per-page axios dialect. They were the **only 2 of 130 calls** in that file that still exist on spring-social; the other 128 target the retired v2 API. Nothing in the new module imports `lib/api.ts`, so sign-in no longer depends on any of it
- [x] `lib/apiClient.ts` — one shared axios instance (`baseURL`, not a global `axios.defaults`, so the bearer can never leak onto a third-party request)
- [x] Request interceptor attaches `Authorization: Bearer …` from the dashboard token slot, never overwriting a header the caller set
- [x] Response interceptor: **401 only** (not 403) clears the token and redirects to login, guarded against looping on `/login`
- [x] All **11 per-page api files / 97 call sites** migrated off bare `axios` — the app now has exactly two `import axios` lines, both in `lib/`
- [x] Sign-in itself deliberately stays on plain axios: no token to send, and a failed login must render on the form rather than trigger the redirect
- [x] **Fixed a regression the swap would have shipped silently**: `jsonFetch` put `[API 401] <body>` into `err.message`, axios does not. Three call sites parsed that string — `login.tsx` (the "account disabled" branch), `register-with-token.tsx` (its 401 regex matched nothing), `portal/login.tsx`. All now read `err.response.status` / `err.response.data.message`
- [x] Verified live: login → token, `/auth/me` returns the exact typed shape, both 401 paths return `{"message"}`, and a dashboard endpoint accepts the attached token
- [x] `bodhassess-portal` — **already satisfied, no work needed.** It has a single `lib/api.ts` whose `jsonFetch` auto-attaches the bearer on all 24 calls, and it already parses `{"message"}` out of error bodies. It was only ever the dashboard that called the API anonymously
- [ ] Deploy and confirm nothing changes functionally before 3b

**3b — backend resolves, does not reject** ✅ *done 2026-08-10*
- [x] `security/RequestActor.java` — `(userId, email, superAdmin)` with a first-class `ANONYMOUS` value rather than a null, so callers never null-check and the activity trail records "anonymous" instead of losing the row
- [x] `security/ActorFilter.java` — `OncePerRequestFilter` right after `RequestIdFilter`, so even a rejection is logged against a request id
- [x] Built from the token's own claims — **no database round trip**, so resolving on every request is free. `JwtService.parseClaims` added for this; `parseUserId` now delegates to it, so its existing callers are untouched
- [x] A malformed or expired token is treated exactly like no token: anonymous, not an error
- [x] Actor pushed to MDC and into the log pattern, cleared in `finally` (pooled threads would otherwise mislabel the next request)
- [x] `ActorFilter.current()` — static accessor for Phase 4

**3c — flip to required, behind a flag** ◐ *mechanism built, flag OFF everywhere*
- [x] `app.security.require-auth` in both profiles, default **false**, override `REQUIRE_AUTH=true`. A property, not a code change, so switching on — and rolling back — is a restart
- [x] Enforcement lives in the same filter: resolved-anonymous + not public → 401 `{"message":"Sign in to continue"}`, written by hand because a filter sits outside `ApiExceptionHandler`
- [x] Public allowlist, explicit: `/api/auth/login`, `/api/portal/login`, `/api/portal/register/**`, `/api/registration-tokens/getByToken/**`, and **every OPTIONS** — browsers send no Authorization on a CORS preflight, so rejecting it would break every cross-origin call before it was made
- [x] Portal endpoints deliberately NOT public: they carry a respondent token this filter resolves like any other, and the controllers still do their own ownership checks
- [x] `RequireAuthTest` — 6 tests pinning the enforcing behaviour *now*, while the flag is still off everywhere, so the switch is a known quantity rather than an experiment on staging
- [ ] **Turn on in dev → staging → production** ← the remaining human step

**Verified live**, both modes, on a throwaway port:

| Request | flag OFF (today) | flag ON |
| --- | --- | --- |
| no token | 200 | 401 `{"message":"Sign in to continue"}` |
| garbage token | 200 | 401 |
| valid token | 200 | 200 |
| `POST /reports/resetAssessment/{id}` no token | 200 | 401 |
| CORS preflight | 200 | 200 |
| `/api/auth/login`, `/api/portal/login` | open | open |

And the log line now names the caller either way:

```
WARN [3162c0ac-…-d6e4ea007135 2]         GET /api/questions/getById/abc -> 400 : "id" must be a number
WARN [36a00570-…-bc2c9f36b3f5 anonymous] GET /api/questions/getById/xyz -> 400 : "id" must be a number
```

**Risk:** the flip is still the highest-risk step in this plan — any caller not
sending a token breaks the moment it goes on. What is now de-risked: the
dashboard sends tokens (3a), the portal already did, the behaviour is pinned by
tests, and the rollback is `REQUIRE_AUTH=false` + restart.

---

## Phase 4 — the activity trail ✅ *done 2026-08-10*

**Scope decision: EVERY request is recorded, reads included** (product call).
That is what makes retention and batching load-bearing rather than optional,
and it is why the row is deliberately narrow.

| Piece | File |
| --- | --- |
| Schema | `V7__add_activity_log.sql` + `V8__fix_activity_log_status_type.sql` |
| Entity | `model/activity/ActivityLog.java`, `enums/ActivityOutcome.java` |
| Capture | `security/ActivityLogFilter.java` |
| Write | `service/ActivityRecorder.java` |
| Retention | `service/ActivityLogPurge.java` |
| Query (feeds Phase 5) | `repository/activity/ActivityLogRepository.findForViewer` |

- [x] **A filter, not a HandlerInterceptor.** An interceptor only sees requests that reached a controller — it would miss exactly what is worth recording: unknown endpoints, and the 401s `ActorFilter` itself returns. The one thing a filter cannot know up front, the matched mapping, turns out to be free: the DispatcherServlet leaves it on the request, readable *after* the chain
- [x] `"/**"` is recorded as **no template**. An unknown URL still reaches the static-resource handler, whose pattern is literally `/**`, so storing it verbatim would file every 404 under one meaningless template
- [x] Bounded queue + single writer thread, draining in batches of 500. Overflow **drops and counts** rather than blocking — an unbounded buffer turns a slow database into an out-of-memory kill
- [x] Writes never join the request's transaction, so a rolled-back business transaction still leaves its row (the whole point when recording failures)
- [x] A failed batch is dropped, not retried: retrying a bad row forever would wedge the writer and starve everything behind it
- [x] `app.activity.enabled` / `retention-days` / `queue-capacity`, plus `async` (tests run it inline)
- [x] Daily purge at 03:15, bounded batches, capped per run — one unbounded DELETE over this table would hold locks against the database serving traffic
- [x] 6 tests; suite **42 → 48**

**Retention defaults to 365 days.** That is a placeholder, not a decision — it
is a policy question for whoever owns compliance. `ACTIVITY_RETENTION_DAYS`
changes it; `0` keeps everything and hands you the growth.

**Verified against real MySQL** (H2 cannot check this — see below):

```
actor  actor_email           method path                        path_template                  st   outcome
NULL   NULL                  GET    /api/no-such-thing          NULL                           404  CLIENT_ERROR
NULL   NULL                  GET    /api/questions/getById/abc  /api/questions/getById/{id}    400  CLIENT_ERROR
2      superadmin@bodh.biz   GET    /api/reports/getRespondents /api/reports/getRespondents    200  SUCCESS
NULL   NULL                  GET    /api/qualities/getAll       /api/qualities/getAll          200  SUCCESS
```

### Why V8 exists — worth reading before writing the next migration

V7 declared `http_status smallint`; the entity field is an `int`, so Hibernate
expected INTEGER and **`ddl-auto: validate` refused to start the application**.

The test suite could not have caught it. Tests run on H2 with Flyway disabled
and the schema built *from the entities*, so the entity is both sides of the
comparison and any mapping is self-consistent. Only a real MySQL boot compares
the entity against the migration. That is not a gap to close by testing harder
— it is exactly what `validate` is for, and it did its job.

The fix shipped as **V8, not an edit to V7**, because V7 had already been
applied: Flyway checksums migrations, and editing an applied one makes every
later boot fail on a mismatch.

## Phase 4 — the activity trail (original plan)

**Goal:** one queryable row per meaningful action.

Capture with a `HandlerInterceptor` (registered on the existing
`WebMvcConfigurer`) — it knows the **path template**
(`/api/questions/delete/{id}`, not `/…/47`) and `afterCompletion` receives the
exception. A filter sees more (unmatched routes, 500s that never reach a
handler) but not the handler; if we want both, the filter records the envelope
and the interceptor enriches it.

- [ ] `V7__add_activity_log.sql` + entity, landing together (`ddl-auto: validate`)
- [ ] Columns: `id, requestId, occurredAt, actorUserId, actorEmail, actorRole, method, pathTemplate, entityType, entityId, action, httpStatus, durationMs, outcome, errorType, errorMessage, ip, userAgent`
- [ ] Indexes: `(occurredAt)`, `(actorUserId, occurredAt)`, `(httpStatus, occurredAt)`
- [ ] Interceptor + `ApplicationEvent`; listener writes `@TransactionalEventListener(AFTER_COMMIT)` / `@Async` in its own transaction
- [ ] **Bounded** executor queue with a drop-and-count policy — an unbounded queue turns a DB stall into an OOM
- [ ] Scope v1: **mutations only** (POST/PUT/PATCH/DELETE) **plus every error**. GET traffic is 10–50× the volume; add it later if it earns its place
- [ ] Redaction list from "Decisions locked" enforced in the writer, not the caller
- [ ] Retention job + documented policy (e.g. purge > 12 months), or the table grows without bound on shared staging MySQL
- [ ] Errors correlate: the `requestId` in the audit row matches the log line and the 500 body from Phase 1

**Done when:** deleting a question produces one row naming the actor, the
target and the outcome; a forced failure produces one row with `outcome=ERROR`
and the same `requestId` as the log line.
**Risk:** write amplification and PII. Both are handled in the writer, which is
the single place to review.

---

## Phase 5 — the activity viewer ✅ *done 2026-08-10*

**Goal:** the trail is visible in the dashboard.

- [x] `GET /api/activity/getAll` — server-side paged, same `ReportPageResponse<T>` envelope as the reports area. Filters: outcome, method, date range, and a search over path + actor email
- [x] `dto/ActivityLogResponse.java`, `controller/activity/ActivityLogController.java`
- [x] `pages/admin/activity-log.tsx` + `activityApis.ts`, route `/admin/activity-log`, menu entry under **Roles**
- [x] Row detail popup: full error, user agent, IP, and the **request id** that ties the row to the server log lines and to the reference a 500 hands the user
- [x] Writes are visually distinct from reads — a DELETE should not look like a GET in a list where every request appears
- [x] **Super-admin only, enforced twice**: `SUPERADMIN_ONLY_PATHS` hides the route and the sidebar entry, and the endpoint refuses non-super-admins itself
- [x] Export deferred until someone asks
- [x] 5 tests; suite **48 → 53**

### The gate is independent of `require-auth`, on purpose

The endpoint answers **401 to anonymous callers even while
`app.security.require-auth` is off** — verified live, in the same run where
`/api/reports/getRespondents` still served anonymous requests happily.

That flag is a rollout control for the API as a whole. This table is not
something to leave open while that rollout finishes: it records which
respondents took which assessments, and who looked at them. A frontend route
guard would not have been enough — it hides a page, it does not protect an
endpoint.

Non-super-admins get **403, not 401**, because `apiClient` logs a user out on
401. Being bounced to the login screen for opening a page you simply lack
rights to would be both wrong and baffling.

There is deliberately **no write endpoint** here, and there should never be.
Rows are written by the filter and removed only by retention — an audit trail
an operator can edit is not an audit trail.

### Verified live

```
anonymous (while REQUIRE_AUTH is off) → 401 {"message":"Sign in to continue"}
super admin                           → 200

10:23:25  anonymous             POST   /api/auth/login              200 SUCCESS       91ms
10:10:25  anonymous             GET    /api/no-such-thing           404 CLIENT_ERROR   2ms
10:10:25  anonymous             GET    /api/questions/getById/{id}  400 CLIENT_ERROR   4ms
          superadmin@bodh.biz   POST   /api/qualities/create        201 SUCCESS
          requestId=34c35dfe-3ad3-4dbb-bc71-63f422570480

filters:  outcome=CLIENT_ERROR → 2    method=POST → 2    search=reports → 1
viewer's own reads:  9 rows before, 9 after  ✓ not self-recording
```

**Done when:** an admin can answer "who deleted that questionnaire on Tuesday"
without shell access. ✅

---

## Phase 5b — throw-style cleanup ☐ *split out, not started*

Bundled into phase 5 originally; it has nothing to do with the viewer and
should be its own phase. A wide, mechanical diff across 20 controllers, best
done one file per PR with the phase 1 tests as the seatbelt.

With the advice complete, the ~75 hand-written error returns can collapse.

- [ ] Domain exceptions: `NotFoundException` (exists, unused), `ConflictException`, `ValidationException`, mapped in the advice
- [ ] Migrate controllers **one file at a time**, biggest first: `OrganizationController` (20 sites), `QuestionnaireController` (7), `QuestionController` (7), `RespondentController` (6), `RespondentAssessmentController` (6), `PractitionerController` (5)
- [ ] Move `@Transactional` from controller to service as each file is touched — this is what makes catch-placement safe by construction
- [ ] Services stop importing `org.springframework.web`

**Risk:** it is a wide diff. One controller per PR; the `@WebMvcTest`s from
Phase 1 are the seatbelt.

---

## Phase 6 — deferred, only if asked for

- **Entity-level auditing** (`@EntityListeners` or Hibernate Envers) — before/after
  values per row, which the request trail cannot give. Envers auto-creates
  `_AUD` tables and fights `ddl-auto: validate` + Flyway; the migrations would
  be hand-written.
- **Structured JSON logs + shipper** (Loki/ELK) — for diagnostics at volume.
  Cheaper than the DB trail, but it is not a feature inside the product.
- **Actuator + micrometer** — health, metrics, and a real readiness probe for
  the container.

---

## Explicitly not doing

- Per-endpoint `try/catch (Exception e)` — that is the advice's job
- `try/catch` inside the 15 `@Transactional` controllers (see the trap)
- RFC 9457 / `ProblemDetail` without changing both frontends in the same PR
- Replacing the `existsBy…` pre-checks with catch-based conflict handling — the
  pre-checks produce the good messages; the global handler is only the net
- Logging request bodies wholesale

---

## Verification loop (every phase)

```bash
cd spring-social && ./mvnw -B test          # 17 tests today, keep them green
cd bodhassess-app && npm run typecheck && npm run build
cd bodhassess-portal && npm run typecheck && npm run build
```

Then a live smoke against `localhost:8080` with `__smoke__`-prefixed data,
deleted afterwards — **proving the error paths (400/404/409/500), not just the
happy path**. For Phase 1 specifically, verify with devtools **absent**
(`./mvnw spring-boot:run -Dspring-boot.run.profiles=production` against a local
DB, or the packaged jar), since devtools masks exactly the bug being fixed.
