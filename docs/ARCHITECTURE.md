# BodhAssess — System Architecture

> **Audience:** senior engineers new to the codebase.
> **Scope:** the full stack — Spring Boot REST API (`bodhassess-api-spring`) and the Vite/React SPA (`bodhassess-app`).
> **Companion document:** [`DATA-MODEL-FAULTS.md`](./DATA-MODEL-FAULTS.md) — a prioritized audit of logical/design/entity/DB faults found while writing this document.

---

## 1. What the system is

**BodhAssess** is a multi-tenant **psychometric assessment platform**. Practitioners (clinicians, HR/industrial psychologists, counsellors) author questionnaires, publish immutable versions of them, allot them to respondents, and collect + score responses. The product is organized around verticals (CLINICAL, INDUSTRIAL, COUNSELLING, COMPLIANCE, …).

### 1.1 End-to-end domain flow

```
Author            Publish              Administer            Respond              Score / Report
------            -------              ----------            -------              --------------
Questionnaire  →  PublishedQuestion-  →  Assessment      →   PortalSession    →   PortalSessionMqtScore
 + Items           naire (+ snapshot      + Allotment         (+ answers,          + dataset / reports
 + ItemOptions     tree: questions,       (entity / group /   demographics)        + live tracking
 + scores          options, scores,       respondent)         via AssessmentToken  (Redis heartbeat)
 + MeasuredQuality MQ/MQT tree)
 + MQT
```

1. **Authoring** — A `Questionnaire` is composed of `Item`s, each with `ItemOption`s and per-option/per-question scores (`ItemOptionScore`, `ItemQuestionScore`). Items are tagged against `MeasuredQuality` (a trait being measured) and `Mqt` (measured-quality *type* / sub-trait). `DemographicField`s define what respondent metadata is collected.
2. **Publishing** — Authoring data is frozen into a `PublishedQuestionnaire` plus a normalized **snapshot tree** (`PublishedQuestionnaireQuestion`, `…QuestionOption`, `…QuestionOptionScore`, `…QuestionScore`, `…Mq`, `…Mqt`). Versioning lives here (draft → committed).
3. **Administering** — A practitioner creates an `Assessment` and *allots* it along three independent dimensions: to an **entity/organization** (`AssessmentEntityAllotment`), to a **`RespondentGroup`** (`AssessmentGroupAllotment`), or to an individual **`Respondent`** (`AssessmentRespondentAllotment`). All three use composite keys.
4. **Responding** — A respondent reaches the portal through an `AssessmentToken` (single/multi-use, QR-encodable). Their attempt is a `PortalSession`, with `PortalSessionDemographic` rows and answers.
5. **Scoring / Reporting** — Answers are scored into `PortalSessionMqtScore`. A dataset/reporting layer reads sessions; a **Redis heartbeat** powers live "who's taking it right now" tracking.

### 1.2 Technology stack

| Layer | Technology |
|---|---|
| API | Spring Boot **2.5.5**, Java **11**, Spring MVC |
| Persistence | Spring Data JPA / **Hibernate 5.x**, MySQL **8** (`MySQL8Dialect`), `hibernate-types-52` (JSON columns) |
| Schema management | **`spring.jpa.hibernate.ddl-auto=update`** + a hand-written `docker/mysql-init/01-schema.sql` + two boot-time migration runners |
| Auth | Spring Security + **JWT** (`jjwt` 0.11.5), stateless |
| Live tracking | Spring Data **Redis** (heartbeat keys, 30s TTL) |
| Misc | ZXing (QR codes for registration links) |
| Frontend | **Vite + React** SPA (TypeScript), ~760 components, shadcn/Tailwind |

---

## 2. The persistence model at a glance

A defining characteristic of this codebase is that **the database schema has two sources of truth that have drifted apart**:

* `docker/mysql-init/01-schema.sql` — a hand-written DDL **ported from an earlier Postgres/Go system**. It defines `tenants`, `users`, `instruments`, `items`, `sessions`, `measured_qualities`, `verticals`, `roles`, `respondents`, `practitioners`, `respondent_groups`, `portal_sessions`, `published_questionnaires`, `item_display_state`, `demographic_fields`.
* **`ddl-auto=update`** — Hibernate creates *everything else* at runtime from the `@Entity` classes (the entire `published_questionnaire_*` snapshot tree, `assessments`, `assessment_*`, `*_allotments`, `audit_log`, `entity_registrations`, `mqts`, `item_options*`, `portal_session_*`, `app_users`, `user_meta`, and all `@ElementCollection` join tables).

Because `ddl-auto=update` **never adds foreign keys, unique constraints, or indexes retroactively**, roughly half the schema has **no referential integrity at the database level**. See the fault audit, dimension *"JPA-vs-DDL drift"*.

### 2.1 Entity → table map

| Entity | `@Table` | Notes |
|---|---|---|
| `User` | `app_users` | Created by ddl-auto. The DDL's `users` table is a **separate legacy** table, unmapped, kept only for a JOIN. |
| `UserMeta` | `user_meta` | 1:1 with `app_users`, shares PK. |
| `Practitioner` | `practitioners` | Legacy table; its `roles`/`verticals` **JSON columns are dead** — data migrated to `practitioner_roles`/`practitioner_verticals` `@ElementCollection` tables. |
| `Respondent` | `respondents` | `dob` stored as `VARCHAR`; mirrored into `app_users` at boot by `IdentityBootstrapRunner`. |
| `RespondentGroup` | `respondent_groups` | `member_ids`, `assigned_instruments` are **JSON arrays** (no FK). |
| `Role` | `roles` | `url_paths` JSON; URL-path RBAC. |
| `Vertical` | `verticals` | Practice-domain taxonomy. |
| `EntityRegistration` | `entity_registrations` | ddl-auto; org self-registration staging queue. |
| `QuestionnaireCatalog` | `instruments` | **Reuses the legacy `instruments` table** — its `irt_*`, `theta_*`, `scoring_algorithm` columns are vestigial. |
| `Questionnaire` | `questionnaires` | ddl-auto. |
| `Item` | `items` | **Reuses the legacy `items` table** (IRT columns vestigial). |
| `ItemOption` / `ItemOptionScore` / `ItemQuestionScore` | `item_options` / `item_option_scores` / `item_question_scores` | ddl-auto. |
| `MeasuredQuality` | `measured_qualities` | `mqts` JSON column now duplicated by the `mqts` tree table. |
| `Mqt` | `mqts` | ddl-auto, self-referential tree. |
| `DemographicField` | `demographic_fields` | — |
| `ItemDisplayState` | `item_display_state` | `deleted` soft-delete flag (written, never read). |
| `PublishedQuestionnaire` | `published_questionnaires` | Legacy `mqs`/`questions` **JSON blobs coexist** with the normalized snapshot tree. |
| `PublishedQuestionnaire{Mq,Mqt,Question,QuestionOption,QuestionOptionScore,QuestionScore}` | `published_questionnaire_*` | ddl-auto snapshot tree (no FKs in DDL). |
| `Assessment` / `AssessmentAnswer` / `AssessmentToken` | `assessments` / `assessment_answers` / `assessment_tokens` | ddl-auto. |
| `AssessmentEntityAllotment` / `…GroupAllotment` / `…RespondentAllotment` | `assessment_*_allotments` | Composite `@IdClass` keys. |
| `PortalSession` | `portal_sessions` | Legacy `answers`/`mqt_scores`/`demographics` **JSON blobs coexist** with normalized child tables. |
| `PortalSessionDemographic` / `PortalSessionMqtScore` | `portal_session_demographics` / `portal_session_mqt_scores` | ddl-auto. |
| `AuditLogEntry` | `audit_log` | ddl-auto. |
| *(none)* | `tenants`, `users`, `sessions` | **Legacy DDL-only tables** with no JPA entity (Postgres-port remnants). |

> **Read this together with the fault audit.** Many of the "Notes" above (dead JSON columns, dual representations, missing FKs, vestigial IRT columns, `dob` typing) are the *symptoms* of the faults catalogued in `DATA-MODEL-FAULTS.md`.

---


## 3. Subsystem reference

1. Identity, Authentication, Multi-Tenancy & Respondents
2. Questionnaire Authoring, Question Bank, Qualities & Scoring Model
3. Publishing, Immutable Snapshots & Version Control
4. Assessments, Allotment, Tokens & Public Registration
5. Portal Sessions, Demographics, Score Persistence, Live Tracking, Dataset, Audit & Uploads
6. Build, Configuration, Persistence Setup, Exceptions, Repositories & Canonical DB Schema
7. Frontend SPA Architecture & API Integration

---


## Identity, Authentication, Multi-Tenancy & Respondents

### Purpose and Responsibilities

This subsystem owns every aspect of who can log in, what they are allowed to do, and how people participating in assessments are tracked. Concretely, it covers:

1. **Identity** — the canonical credential store (`app_users` / `user_meta`) and its predecessor tables (`practitioners`, `respondents`).
2. **Authentication** — stateless JWT issuance and per-request validation.
3. **Authorization** — a two-tier model: a boolean super-admin "god mode" for platform administrators, and a URL-path-based RBAC table for practitioners (partially implemented; full RBAC is an explicitly deferred future pass).
4. **Multi-tenancy scaffolding** — an entity-membership join table (`user_entities`) and the `EntityRegistration` staging queue for organisation-level sign-ups.
5. **Respondent management** — CRUD for individual respondents, bulk import, respondent groups, and the self-registration portal flow that ties an anonymous browser session to a specific `Assessment` via an `AssessmentToken`.
6. **Reference data** — `Vertical` (practice domain taxonomy) and `Role` (named permission sets with URL-path lists) used by practitioners.

---

### Data Model

#### Table: `app_users`  — class `User`

`@Entity @Table(name = "app_users")` — named to avoid colliding with the legacy `users` table (from the pre-migration Go era) that still exists in the DDL and is never mapped by a Spring entity.

| Field | Column | Java Type | JPA Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `String` | `@Id` | Application-assigned; matches the `respondents.id` of migrated accounts so all existing FK references stay valid |
| `email` | `email` | `String` | `@Column(nullable=false, unique=true)` | Canonical login identifier; case-insensitive matching enforced in `UserRepository.findByEmailIgnoreCase` |
| `dob` | `dob` | `String` | — | ISO `YYYY-MM-DD` string; serves as the password credential |
| `status` | `status` | `String` | `@Column(nullable=false)` | Default `"Active"`; login is blocked for any other value |
| `superAdmin` | `is_super_admin` | `boolean` | `@Column(name="is_super_admin", nullable=false)` | Boolean god-mode flag; overrides all role/permission checks; explicitly placed above the RBAC layer |
| `lastLogin` | `last_login` | `String` | — | Informational; not enforced by authentication logic |
| `entityIds` | `user_entities.entity_id` | `Set<String>` | `@ElementCollection(fetch=LAZY)` `@CollectionTable(name="user_entities", joinColumns=@JoinColumn(name="user_id"))` `@Column(name="entity_id")` | Many-to-many entity membership; a user can belong to multiple organisations; written during bootstrap migration and during public registration |
| `createdAt` | `created_at` | `OffsetDateTime` | `@CreationTimestamp @Column(updatable=false)` | Set by Hibernate on insert |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@UpdateTimestamp` | Set by Hibernate on update |

**Important note on DDL drift:** `app_users`, `user_meta`, `user_entities`, `practitioner_roles`, `practitioner_verticals`, and `role_url_paths` are not present in the canonical hand-written `01-schema.sql`. They are created at runtime by Hibernate's `ddl-auto=update` from the `@Entity` and `@ElementCollection` annotations. The hand-written DDL therefore describes only the pre-migration schema; these newer normalized tables exist only in the live database.

---

#### Table: `user_meta` — class `UserMeta`

`@Entity @Table(name = "user_meta")` — profile/demographic complement to `app_users`. One-to-one relationship sharing the user `id` as the primary key (`@Id @Column(name = "user_id")`). Deliberately contains no authentication fields.

| Field | Column | Java Type | Notes |
|---|---|---|---|
| `userId` | `user_id` (PK) | `String` | Matches `app_users.id` |
| `name` | `name` | `String` | Display name |
| `phone` | `phone` | `String` | — |
| `gender` | `gender` | `String` | — |
| `consent` | `consent` | `String` | Consent status string |
| `companyId` | `company_id` | `String` | Company identifier, populated during public registration |
| `orgName` | `org_name` | `String` | — |
| `orgWebsite` | `org_website` | `String` | — |

---

#### Table: `practitioners` — class `Practitioner`

`@Entity @Table(name = "practitioners")` — represents dashboard-side users who author and administer assessments. A legacy table that predates the unified `app_users` model; migration to the unified table is explicitly deferred. Practitioners authenticate through their own login path (`/api/v1/practitioners/login`) and receive `UserType.PRACTITIONER` tokens.

| Field | Column | Java Type | JPA Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `String` | `@Id` | Application-assigned |
| `name` | `name` | `String` | — | — |
| `email` | `email` | `String` | — | Unique in the DDL; case-insensitive matching in queries |
| `phone` | `phone` | `String` | — | Added via idempotent `ALTER TABLE` in `01-schema.sql` |
| `roles` | `practitioner_roles.role` | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="practitioner_roles", joinColumns=@JoinColumn(name="practitioner_id"))` `@Column(name="role")` | Role names (e.g., `"Practitioner"`); used to look up URL paths from the `roles` table at login time |
| `verticals` | `practitioner_verticals.vertical` | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="practitioner_verticals", joinColumns=@JoinColumn(name="practitioner_id"))` `@Column(name="vertical")` | Practice domains assigned to this practitioner |
| `status` | `status` | `String` | — | `"Active"` required for login |
| `lastLogin` | `last_login` | `String` | — | Informational |
| `dob` | `dob` | `LocalDate` | — | Credential; matched exactly in `findActiveByEmailAndDob` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB default timestamp |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB auto-update timestamp |

**DDL note:** the DDL-side `practitioners` table stores `roles` and `verticals` as `JSON NOT NULL` columns. The live `@Entity` maps them through normalized join tables (`practitioner_roles`, `practitioner_verticals`) via `@ElementCollection`. This is a migration artefact: the `JsonToTableMigrationRunner` (@Order 1, runs before `IdentityBootstrapRunner`) extracted the JSON arrays into the join tables. The old `roles` and `verticals` JSON columns on the `practitioners` row are a dead remnant in the DDL.

---

#### Table: `respondents` — class `Respondent`

`@Entity @Table(name = "respondents")` — the legacy respondent store. Respondents are the people who take assessments. The `IdentityBootstrapRunner` mirrors every row into `app_users` + `user_meta` on startup so respondents can authenticate through the unified `/auth/login` path while the legacy table is preserved for rollback.

| Field | Column | Java Type | Notes |
|---|---|---|---|
| `id` | `id` (PK) | `String` | Application-assigned, often `R-NNN` pattern in bulk import |
| `name` | `name` | `String` | — |
| `email` | `email` | `String` | `UNIQUE` in DDL |
| `phone` | `phone` | `String` | — |
| `dob` | `dob` | `String` | ISO `YYYY-MM-DD`; credential for portal login |
| `consent` | `consent` | `String` | `"Granted"`, `"Pending"`, or `"Withdrawn"` |
| `sessionsCount` | `sessions_count` | `Integer` | Denormalized counter; not enforced by FK |
| `lastAssessment` | `last_assessment` | `String` | Denormalized label |
| `accountType` | `account_type` | `String` | Default `"individual"` |
| `orgName` | `org_name` | `String` | — |
| `orgWebsite` | `org_website` | `String` | — |
| `companyId` | `company_id` | `String` | Used in returning-registrant dedup query `findDuplicates` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |

---

#### Table: `respondent_groups` — class `RespondentGroup`

`@Entity @Table(name = "respondent_groups")` — named collections of respondents, optionally nested.

| Field | Column | Java Type | JPA Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `String` | `@Id` | — |
| `name` | `name` | `String` | — | — |
| `description` | `description` | `String` | `@Column(columnDefinition="text")` | — |
| `parentId` | `parent_id` | `String` | — | Self-referential FK in DDL (`ON DELETE CASCADE`); not enforced as a JPA association |
| `memberIds` | `respondent_group_members.respondent_id` | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="respondent_group_members")` | References `respondents.id` by value; no FK constraint |
| `assignedInstruments` | `respondent_group_instruments.instrument_id` | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="respondent_group_instruments")` | Instrument ids assigned to this group for assessment allotment |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | — |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | — |

**DDL note:** the hand-written DDL stores `member_ids` and `assigned_instruments` as `JSON NOT NULL` columns. The live entity maps them through normalized join tables via `@ElementCollection`, again a product of `JsonToTableMigrationRunner`.

---

#### Table: `entity_registrations` — class `EntityRegistration`

`@Entity @Table(name = "entity_registrations")` — moderation queue for organisation-level self-sign-ups. New rows default to `active = false` and do not receive assessment allotments until an admin approves them.

| Field | Column | Java Type | JPA Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `String` | `@Id` | Auto-generated as `ER-{8-char UUID suffix}` if not supplied |
| `name` | `name` | `String` | — | Contact person's name |
| `companyName` | `company_name` | `String` | — | Organisation name |
| `email` | `official_email` | `String` | `@Column(name="official_email")` | Unique de-duplication key for self-signups |
| `phone` | `phone` | `String` | — | — |
| `dob` | `dob` | `String` | — | ISO `YYYY-MM-DD` |
| `sessionsCount` | `sessions_count` | `Integer` | — | Denormalized |
| `lastAssessment` | `last_assessment` | `String` | — | Denormalized |
| `accountType` | `account_type` | `String` | — | Default `"individual"` |
| `orgName` | `org_name` | `String` | — | — |
| `orgWebsite` | `org_website` | `String` | — | — |
| `active` | `active` | `boolean` | `@Column(name="active", nullable=false)` | Admin approval gate; default `false` |
| `memberIds` | `entity_members.respondent_id` | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="entity_members", joinColumns=@JoinColumn(name="entity_id"))` | Respondent ids belonging to this entity; written by admin and by `PublicRegistrationService` when a token scoped to this entity is consumed |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | — |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | — |

---

#### Table: `roles` — class `Role`

`@Entity @Table(name = "roles")` — named permission sets used by practitioners. Each role carries a set of URL path patterns the bearer is allowed to access.

| Field | Column | Java Type | JPA Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `String` | `@Id` | Application-assigned |
| `name` | `name` | `String` | — | Human-readable name (e.g., `"Practitioner"`, `"Assessor"`) |
| `description` | `description` | `String` | `@Column(columnDefinition="text")` | — |
| `urlPaths` | `role_url_paths.url_path` | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="role_url_paths", joinColumns=@JoinColumn(name="role_id"))` | Dashboard route patterns this role may access; flattened at login by `RoleRepository.findUrlPathsByRoleNames` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | — |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | — |

**DDL note:** the hand-written DDL stores `url_paths` as a `JSON NOT NULL` column. The live entity maps it through a normalized `role_url_paths` join table via `@ElementCollection`.

---

#### Table: `verticals` — class `Vertical`

`@Entity @Table(name = "verticals")` — reference data for practice domains (e.g., Clinical, Organizational). Practitioners and questionnaires are tagged with vertical codes.

| Field | Column | Java Type | Notes |
|---|---|---|---|
| `id` | `id` (PK) | `String` | — |
| `code` | `code` | `String` | Short mnemonic; forced `UPPER_CASE` on save; `UNIQUE` in DDL |
| `name` | `name` | `String` | Human-readable label |
| `description` | `description` | `String` | `@Column(columnDefinition="text")` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |

---

### JWT Security Infrastructure

#### `TokenProvider`

A `@Service` holding the `SecretKey` derived from `app.auth.tokenSecret` via `Keys.hmacShaKeyFor(secret.getBytes(UTF_8))` (jjwt 0.11.5). The default secret (`926D96C90030DD58429D2751...`) is hardcoded as a `${...}` default in `application.properties` and **must be overridden in production** via the `APP_AUTH_TOKEN_SECRET` environment variable.

Token claims:
- `sub` — `userId` (the `app_users.id` or `practitioners.id` or `respondents.id`)
- `email` — email address
- `userType` — one of `PRACTITIONER`, `RESPONDENT`, `ADMIN`
- `roles` — `List<String>` of role names
- Expiry controlled by `app.auth.tokenExpirationMsec` (default 7 days = 604800000 ms)

`getPrincipalFromToken(token)` reconstructs a stateless `UserPrincipal` entirely from the JWT claims — no database lookup is performed on the hot path.

#### `TokenAuthenticationFilter`

`OncePerRequestFilter`. Extracts the JWT from the `Authorization: Bearer <token>` header, with a fallback to the `?token=` query parameter (preserved for compatibility with the previous Go API). On a valid token it reconstructs the `UserPrincipal` and writes a `UsernamePasswordAuthenticationToken` into `SecurityContextHolder`.

No database call, no `UserDetailsService` — the token is fully self-describing. The filter is registered before `UsernamePasswordAuthenticationFilter` via `http.addFilterBefore(...)` in `SecurityConfig`.

#### `UserPrincipal`

Implements `UserDetails`. Fields: `id`, `email`, `UserType` (enum: `PRACTITIONER`, `RESPONDENT`, `ADMIN`), `List<String> roles`. Authorities are synthesized as `GrantedAuthority` objects: always `ROLE_<USERTYPE>` plus `ROLE_<ROLE_NAME_UPPERCASED>` for each role string. The `getPassword()` method always returns `null` — password checking is done in the service layer before the token is issued, not by Spring Security.

#### `@CurrentUser`

A meta-annotation `@AuthenticationPrincipal` shortcut. Any controller method that declares `@CurrentUser UserPrincipal principal` receives the principal resolved from the request's JWT.

#### `RestAuthenticationEntryPoint`

Returns a JSON `{"status":401,...}` body (not an HTML redirect) for unauthenticated requests to protected endpoints.

#### `SecurityConfig`

`@EnableWebSecurity @EnableGlobalMethodSecurity(securedEnabled=true, jsr250Enabled=true, prePostEnabled=true)`. Notable configuration:

- Session creation policy: `STATELESS`.
- CSRF: disabled (JWT-only API).
- Form login and HTTP Basic: disabled.
- CORS: configured from `app.cors.allowedOrigins`; credentials allowed; max age 300 s.
- Public (no-auth) paths:
  - `OPTIONS /**` — preflight
  - `POST /api/v1/entity-registrations` — public self-registration form
  - `POST /api/v1/respondents` — public respondent sign-up
  - `/api/v1/auth/login`, `/api/v1/practitioners/login`, `/api/v1/respondents/login` — all three login endpoints
  - `/api/v1/public/tokens/**` — anonymous token resolution and registration
  - `/api/v1/questionnaires/**`, `/api/v1/questionnaires-catalog/**` — questionnaire browsing
  - `/api/v1/upload`, `/uploads/**`, `/api/v1/health`

Everything else requires an authenticated JWT (`.anyRequest().authenticated()`). There are no `@PreAuthorize` or role-based `antMatchers` on individual routes beyond the public list; the practitioner URL-path list from the `roles` table is enforced by the SPA client, not by server-side Spring Security.

---

### REST Endpoints

| Method | Path | Auth Required | Controller / Handler | Purpose |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | None (public) | `AuthController.login` | Unified login against `app_users`; returns JWT + `AuthUser` |
| `GET` | `/api/v1/auth/me` | JWT (any type) | `AuthController.me` | Returns the resolved `AuthUser` for the current token |
| `POST` | `/api/v1/auth/logout` | JWT | `AuthController.logout` | Stateless no-op; returns 204 (token drop is client-side) |
| `POST` | `/api/v1/practitioners/login` | None (public) | `PractitionersController.login` | Legacy practitioner login against `practitioners` table; returns `PRACTITIONER`-type JWT |
| `GET` | `/api/v1/practitioners/me` | JWT (`PRACTITIONER`) | `PractitionersController.me` | Returns practitioner profile + URL paths |
| `GET` | `/api/v1/practitioners` | JWT | `PractitionersController.list` | List all practitioners (admin use) |
| `GET` | `/api/v1/practitioners/{id}` | JWT | `PractitionersController.get` | Single practitioner |
| `POST` | `/api/v1/practitioners` | JWT | `PractitionersController.create` | Create or upsert practitioner |
| `PUT` | `/api/v1/practitioners/{id}` | JWT | `PractitionersController.update` | Update practitioner fields |
| `DELETE` | `/api/v1/practitioners/{id}` | JWT | `PractitionersController.delete` | Delete practitioner |
| `POST` | `/api/v1/respondents/login` | None (public) | `RespondentsController.login` | Respondent portal login; returns `RESPONDENT`-type JWT |
| `GET` | `/api/v1/respondents/me` | JWT (`RESPONDENT`) | `RespondentsController.me` | Returns respondent profile |
| `GET` | `/api/v1/respondents` | JWT | `RespondentsController.list` | List all respondents |
| `GET` | `/api/v1/respondents/{id}` | JWT | `RespondentsController.get` | Single respondent |
| `POST` | `/api/v1/respondents` | None (public) | `RespondentsController.create` | Create a single respondent (public self-sign-up path) |
| `PUT` | `/api/v1/respondents/{id}` | JWT | `RespondentsController.update` | Update respondent fields |
| `DELETE` | `/api/v1/respondents/{id}` | JWT | `RespondentsController.delete` | Delete respondent |
| `POST` | `/api/v1/respondents/bulk` | JWT | `RespondentsController.bulkCreate` | Bulk CSV-style import of up to 1000 respondents with advisory-lock id generation |
| `GET` | `/api/v1/roles` | JWT | `RolesController.list` | List all roles alphabetically |
| `GET` | `/api/v1/roles/{id}` | JWT | `RolesController.get` | Single role |
| `POST` | `/api/v1/roles` | JWT | `RolesController.create` | Create / upsert role with URL paths |
| `PUT` | `/api/v1/roles/{id}` | JWT | `RolesController.update` | Update role name, description, URL paths |
| `DELETE` | `/api/v1/roles/{id}` | JWT | `RolesController.delete` | Delete role |
| `GET` | `/api/v1/verticals` | JWT | `VerticalsController.list` | List verticals alphabetically |
| `GET` | `/api/v1/verticals/{id}` | JWT | `VerticalsController.get` | Single vertical |
| `POST` | `/api/v1/verticals` | JWT | `VerticalsController.create` | Create vertical (`code` forced to uppercase) |
| `DELETE` | `/api/v1/verticals/{id}` | JWT | `VerticalsController.delete` | Delete vertical |
| `GET` | `/api/v1/entity-registrations` | JWT | `EntityRegistrationsController.list` | Admin: list all self-signups newest-first |
| `GET` | `/api/v1/entity-registrations/{id}` | JWT | `EntityRegistrationsController.get` | Admin: single registration |
| `POST` | `/api/v1/entity-registrations` | None (public) | `EntityRegistrationsController.create` | Public: submit entity self-registration (requires name, companyName, email, phone, dob) |
| `PATCH` | `/api/v1/entity-registrations/{id}` | JWT | `EntityRegistrationsController.adminUpdate` | Admin: flip `active` flag and/or replace `memberIds`; null fields are not touched |
| `DELETE` | `/api/v1/entity-registrations/{id}` | JWT | `EntityRegistrationsController.delete` | Admin: discard a registration |
| `GET` | `/api/v1/groups` | JWT | `GroupsController.list` | List all respondent groups |
| `GET` | `/api/v1/groups/{id}` | JWT | `GroupsController.get` | Single group |
| `POST` | `/api/v1/groups` | JWT | `GroupsController.create` | Create group with member and instrument sets |
| `PUT` | `/api/v1/groups/{id}` | JWT | `GroupsController.update` | Replace group members and instruments |
| `DELETE` | `/api/v1/groups/{id}` | JWT | `GroupsController.delete` | Delete group |
| `GET` | `/api/v1/public/tokens/{token}` | None (public) | `PublicTokensController.resolve` | Resolve assessment-token context for the /register page |
| `POST` | `/api/v1/public/tokens/{token}/consume` | None (public) | `PublicTokensController.consume` | Increment token usedCount |
| `GET` | `/api/v1/public/tokens/{token}/qr` | None (public) | `PublicTokensController.qr` | Stream QR-code PNG for the registration link |
| `POST` | `/api/v1/public/tokens/registration-check` | None (public) | `PublicTokensController.registrationCheck` | Pre-flight dedup check: returns `{exists: bool}` given dob + (email\|phone\|companyId) |
| `POST` | `/api/v1/public/tokens/{token}/register` | None (public) | `PublicTokensController.register` | Full public registration: create respondent, link entity/group, create session, consume token, return auth JWT |

---

### Service-Layer Business Logic

#### `AuthService.login` (unified login)

Step-by-step:

1. Validate that both `email` and `dob` are non-empty (accepts `identifier` field as alias for `email` via `AuthLoginRequest.resolveEmail()`).
2. Lookup `app_users` by `UserRepository.findByEmailIgnoreCase(email)` — case-insensitive JPQL.
3. Compare `dob` strings exactly (trimmed) — throws `UnauthorizedAccessException("invalid credentials")` on mismatch.
4. Check `status == "Active"` — throws `UnauthorizedAccessException("account is not active")` if not.
5. Determine `UserType`: `superAdmin == true` → `ADMIN`; otherwise → `RESPONDENT`.
6. Build role list: super-admin gets `["SUPER_ADMIN"]`; everyone else gets `[]` (full RBAC deferred).
7. Mint a JWT via `TokenProvider.createToken(userId, email, type, roles)` with the configured expiry.
8. Fetch display name from `UserMetaRepository.findById(userId)` — null-safe.
9. Return `AuthLoginResponse{token, AuthUser{id, email, name, isSuperAdmin, entityIds, roles, url_paths}}`.

`url_paths` for super-admin is `["/*"]` (unlimited dashboard access); for non-admins it is `[]` pending RBAC completion.

#### `PractitionersService.login` (legacy practitioner path)

1. Resolve identifier (email or phone) from `LoginRequest.resolveIdentifier()`.
2. Parse `dob` as `LocalDate` — strict `YYYY-MM-DD` required.
3. If identifier contains `@`: query `PractitionerRepository.findActiveByEmailAndDob(email, dob)` — JPQL with `LOWER()` comparison and `status = 'Active'` filter.
4. If identifier is a phone number: query `PractitionerRepository.findActiveByDobWithPhone(dob)` to get candidates, then do digit-normalised comparison in Java (strips all non-digits from both sides). This two-step approach handles stored numbers with formatting characters.
5. On no match: logs diagnostic information (whether the email exists at all, what the stored DOB and status are) to help diagnose migration issues — these `[login-debug]` log lines are explicitly temporary.
6. Lookup URL paths: `RoleRepository.findUrlPathsByRoleNames(practitioner.roles)` — native SQL `SELECT DISTINCT url_path FROM role_url_paths JOIN roles ... WHERE r.name IN (...)`.
7. Mint a `PRACTITIONER`-type JWT carrying the practitioner's role names.
8. Return `PractitionerLoginResponse{token, PractitionerMe{...profile..., urlPaths}}`.

#### `RespondentsService.login` (portal respondent path)

Similar to the practitioner flow but simpler:

1. Accept email or phone in `identifier` field; dob validated against `^\\d{4}-\\d{2}-\\d{2}$`.
2. Email path: `RespondentRepository.findByEmailAndDob(email, dob)`.
3. Phone path: `findByDobWithPhone(dob)` + digit-normalised Java comparison.
4. Mint a `RESPONDENT`-type JWT with empty role list.

#### `RespondentsService.bulkCreate` (bulk import)

Uses a MySQL advisory lock to prevent concurrent uploads from generating colliding `R-NNN` ids:

1. Acquire `GET_LOCK('bodhassess_respondents_id_gen', 30)` via `EntityManager.createNativeQuery`.
2. For each row: validate name, email (regex), dob (regex + `LocalDate` parse, must be in 1900–today range), consent (`Granted`/`Pending`/`Withdrawn`). In-file duplicate email detection with a `Map<email, rowNum>` accumulator.
3. Generate next id with a native query: `SELECT CONCAT('R-', LPAD(COALESCE(MAX(CAST(SUBSTRING(id,3) AS UNSIGNED)),0)+1,3,'0')) FROM respondents WHERE id REGEXP '^R-[0-9]+$'`. This produces `R-001`, `R-002`, etc.
4. `INSERT IGNORE INTO respondents ...` — silently skips if the email UNIQUE constraint fires (existing email in the database).
5. Re-fetch the inserted row via native query to produce the `RespondentDto` response.
6. `RELEASE_LOCK(...)` in a `finally` block.
7. Returns `BulkRespondentDtos.Response{created, skipped, errors[{rowNum, email, reason}], inserted[RespondentDto]}`.

#### `PublicRegistrationService.register` (portal self-registration)

The most complex identity flow; executed in a single `@Transactional` unit:

1. **Validate token** — lookup `AssessmentToken` by the opaque string PK; check `expiresAt` and `maxUses`.
2. **Validate input** — `name`, `email`, `dob` required.
3. **Resolve or create respondent:**
   - If the token carries a `respondentId` (admin-targeted re-send), reuse it.
   - Otherwise call `isExistingRegistrant(req)` via `RespondentRepository.findDuplicates(email, phone, companyId, dob)` — returns existing if DOB matches AND any of email/phone/companyId matches. If existing: throw `DuplicateResourceException` prompting the user to log in instead.
   - If new: create `Respondent` with a `R-{8-char UUID}` id, `consent = "Pending"`, `accountType = "individual"`.
4. **Link entity** (if `token.entityId` is set):
   - Load `EntityRegistration`, add `respondentId` to `memberIds` (idempotent).
   - Check entity assessment cap via `AssessmentService.wouldExceedEntityCap(assessmentId, entityId, 1)` before proceeding.
5. **Link group** (if `token.groupId` is set): add `respondentId` to `RespondentGroup.memberIds` (idempotent).
6. **Mirror into unified identity** (`upsertUser`): create-if-absent `app_users` row with the same id as the respondent (preserving all FK references), plus `user_meta`. If the email is already claimed by a different user row, the mirror is skipped rather than failing the registration.
7. **Create `PortalSession`** — `id = "SESS-{8-char UUID}"`, `status = "Active"`, pre-populated with assessment metadata.
8. **Consume token** — increment `token.usedCount`; persisted immediately so concurrent calls see the updated count.
9. **Mint a RESPONDENT JWT** — so the SPA can redirect the newly registered user directly into the assessment portal without a separate login step.
10. Return `PublicRegistrationDto.Result{sessionId, respondentId, assessmentId, authToken}`.

#### `IdentityBootstrapRunner` (`@Order(2)`, runs after `JsonToTableMigrationRunner`)

Executes once on every startup; all operations are idempotent:

1. **Seed super admin**: if `app.bootstrap.super-admin-email` is configured and no `app_users` row exists for that email, creates `User{id="U-SUPERADMIN", superAdmin=true, status="Active"}`.
2. **Migrate legacy respondents**: for every `Respondent` not yet present in `app_users` (by id):
   - Skip if the respondent's email is already owned by a different `app_users` row (email uniqueness guard).
   - Respondents without an email get a synthetic placeholder: `no-email+{id}-{uuid8}@invalid.local`.
   - Reconstruct entity memberships from `EntityRegistration.memberIds` into `user_entities`.
   - Create matching `user_meta` row with name, phone, consent.

This means the `app_users` table grows monotonically; rows are never deleted by the runner.

---

### Notable Design Decisions

**Three parallel login paths.** The system simultaneously supports three credential stores and three JWT-issuance paths: `/auth/login` (against `app_users`), `/practitioners/login` (against `practitioners`), and `/respondents/login` (against `respondents`). The stated intent is to converge on `/auth/login` backed by the single `app_users` table, but the two legacy paths are kept alive during the transition. A practitioner or respondent whose record has been migrated to `app_users` can therefore log in through two endpoints at once.

**Date-of-birth as password.** The credential is the user's date of birth stored as a plain `YYYY-MM-DD` string — no hashing, no salting. This is a deliberate domain choice for a psychometric assessment SaaS where respondents are not expected to manage passwords, but it is a significant security exposure. Any engineer touching this code must be aware that `app_users.dob` and `respondents.dob` are stored in plaintext.

**Stateless, database-free request path.** `TokenAuthenticationFilter` reconstructs `UserPrincipal` entirely from JWT claims with no database hit. This is the correct approach for a stateless API but means that if a user is deactivated after a token is issued, the token remains valid until expiry (up to 7 days).

**`is_super_admin` boolean above the RBAC layer.** The `User.superAdmin` flag is deliberately implemented as a raw boolean column so it is orthogonal to any future role structure. The Javadoc explicitly says it "survives the later RBAC build untouched." Super-admins receive `UserType.ADMIN` and the `SUPER_ADMIN` role claim, which maps to `url_paths = ["/*"]` — every dashboard route.

**URL-path RBAC for practitioners (not Spring Security).** Practitioner authorization is implemented as a list of URL paths returned in the login response (`url_paths`) and enforced on the client side (the SPA routes). Spring Security sees `ROLE_PRACTITIONER` on the authentication object but no `antMatchers` in `SecurityConfig` enforce it; the server trusts any valid `PRACTITIONER`-type JWT for all non-public endpoints. Full server-side RBAC is explicitly deferred.

**`@ElementCollection` everywhere for join tables.** Rather than mapping `@ManyToMany` associations with `@JoinTable`, the codebase uses `@ElementCollection` to model all multi-valued relationships (`user_entities`, `practitioner_roles`, `practitioner_verticals`, `role_url_paths`, `respondent_group_members`, `respondent_group_instruments`, `entity_members`). This avoids `MultipleBagFetchException` (noted in code comments) and simplifies cascade semantics, but means the join table rows are managed as value-type collections with no independent identity, lifecycle, or cascade-delete to the referenced table.

**DDL / `@Entity` drift.** The hand-written `01-schema.sql` describes the pre-migration state. The tables `app_users`, `user_meta`, `user_entities`, `practitioner_roles`, `practitioner_verticals`, `role_url_paths`, `respondent_group_members`, and `respondent_group_instruments` exist only in the live database, created by `ddl-auto=update`. The DDL-side `roles.url_paths`, `practitioners.roles`, `practitioners.verticals`, `respondent_groups.member_ids`, and `respondent_groups.assigned_instruments` are dead JSON columns (data already migrated to the normalized tables). A future cleanup should add the new tables to `01-schema.sql` and drop the dead JSON columns.

**Advisory lock for bulk insert.** Because MySQL has no sequence-type auto-increment on application-side ids, the bulk respondent import uses `GET_LOCK('bodhassess_respondents_id_gen', 30)` — a named MySQL advisory lock — to serialize id generation across concurrent uploads. `INSERT IGNORE` handles email-UNIQUE conflicts gracefully; a `try/finally` block guarantees `RELEASE_LOCK` even on exceptions.

**Moderation queue for entities.** `EntityRegistration` is a staging table, not the live respondent/entity store. Keeping self-signups separate from the curated `respondents` pool means a spam or duplicate submission does not pollute assessment allotments. Only after an admin sets `active = true` and populates `memberIds` does the entity participate in assessment delivery.

---

### Connections to Other Subsystems

| Downstream Subsystem | How It Connects |
|---|---|
| **Assessment / Allotments** | `AssessmentEntityAllotment` references `entity_registrations.id`; `AssessmentRespondentAllotment` references `respondents.id`; `AssessmentGroupAllotment` references `respondent_groups.id`. The cap-enforcement call in `PublicRegistrationService` calls `AssessmentService.wouldExceedEntityCap` before creating a session. |
| **Portal Sessions** | `PortalSession.respondentId` foreign-keys (by convention) into `respondents.id`. `PublicRegistrationService` creates the `PortalSession` as the final step of public registration. The live-tracking Redis heartbeat is keyed on `sessionId`, and `PortalSession.status` drives the dashboard's session-state machine. |
| **Assessment Tokens** | `AssessmentToken` carries `respondentId`, `entityId`, and `groupId` scoping fields; `PublicRegistrationService` consumes a token as part of every public registration. `PublicTokensController` exposes the unauthenticated token-resolution and QR-generation endpoints. |
| **Questionnaires / Published Questionnaires** | `Respondent` / `RespondentGroup` → `assignedInstruments` references `PublishedQuestionnaire` ids. The `Vertical` reference data is shared between practitioners, questionnaires, and assessments. |
| **Audit Log** | `AuditService` (not part of this subsystem) receives events from identity operations. |
| **Reporting / Dataset** | `DatasetService` joins `portal_sessions` with respondent data for scoring reports. The `respondents.id` is the consistent cross-table key. |

---


## Questionnaire Authoring, Question Bank, Qualities & Scoring Model

### Purpose and Responsibilities

This subsystem is the authoring half of BodhAssess. It owns every concept that exists *before* a respondent ever opens a test:

- **Instrument definition** — named questionnaires (called *instruments* in the DB, *questionnaires* in the Java layer) together with their display metadata, language tags, tier classification, and scoring model identifiers.
- **Item (question) bank** — the live, mutable pool of questions, MCQ options, per-option MQT score weights, and question-level MQT score weights that practitioners maintain between publishing cycles.
- **MeasuredQuality / MQT taxonomy** — the reusable tree of psychological constructs (e.g. *Anxiety → Somatic → Cardiovascular*) whose leaf IDs (`mqt_id`) are the only references that appear in scoring rows.
- **Versioned publishing** — a git-style two-layer model: the `Questionnaire` parent is a permanent identity; each `PublishedQuestionnaire` child is one immutable snapshot version. Respondents are always scored against the version locked at allotment time.
- **Demographic field registry** — platform-wide catalogue of optional data-collection fields presented to respondents before an assessment starts.
- **Item display state** — a thin tombstone table that the questionnaire builder uses to mark questions as soft-deleted for the UI without touching the item bank rows.

---

### Entity Model and DB Tables

#### `Questionnaire` → `questionnaires`

| Field | Column | Java Type | JPA / Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` | `String` | `@Id` | Caller-assigned; `QuestionnaireVersioningService` generates `"Q-" + 8-char UUID prefix` |
| `name` | `name` | `String` | `@Column(nullable=false)` | Denormalised from the current committed version; updated on commit |
| `vertical` | `vertical` | `String` | — | Also denormalised cache |
| `currentVersionId` | `current_version_id` | `String` | `@Column(name="current_version_id")` | FK-by-convention to `published_questionnaires.id`; no hard DB FK |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB-default timestamp |
| `createdBy` | `created_by` | `String` | — | Practitioner/user id captured at creation |

This is intentionally thin — it is a *named family header*. All content lives in `PublishedQuestionnaire` rows.

---

#### `PublishedQuestionnaire` → `published_questionnaires`

| Field | Column | Java Type | JPA / Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` | `String` | `@Id` | `"V-" + 8-char UUID prefix` for new rows; legacy rows keep their original UUID |
| `name` | `name` | `String` | — | Questionnaire display name snapshotted at save time |
| `shortName` | `short_name` | `String` | `@Column(name="short_name")` | Abbreviation (e.g. "PHQ-9") |
| `vertical` | `vertical` | `String` | — | e.g. "CLINICAL", "HR" |
| `category` | `category` | `String` | — | Sub-category within a vertical |
| `description` | `description` | `String` | `@Column(columnDefinition="text")` | Long-form description |
| `duration` | `duration` | `Integer` | — | Estimated minutes |
| `tier` | `tier` | `String` | — | Tenant tier gate e.g. "T1" |
| `languages` | `published_questionnaire_languages` (join table) | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="published_questionnaire_languages", joinColumns=@JoinColumn(name="questionnaire_id"))` `@Column(name="language")` | Was a JSON array column; migrated to join table on startup |
| `mqs` | — (child table) | `List<PublishedQuestionnaireMq>` | `@OneToMany(mappedBy="questionnaire", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` | Snapshot MQ tree; was a JSON column `mqs` — now normalised rows |
| `questions` | — (child table) | `List<PublishedQuestionnaireQuestion>` | `@OneToMany(mappedBy="questionnaire", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` | Snapshot question list; was a JSON column `questions` |
| `isDemo` | `is_demo` | `boolean` | `@Column(name="is_demo")` | Marks demonstration instruments |
| `disclaimer` | `disclaimer` | `String` | `@Column(columnDefinition="text")` | Pre-test disclaimer text |
| `instructions` | `instructions` | `String` | `@Column(columnDefinition="text")` | Pre-test instructions text |
| `showInstructions` | `show_instructions` | `boolean` | `@Column(name="show_instructions", nullable=false)` | Portal toggle for instructions display |
| `demographicFieldKeys` | `published_questionnaire_demographic_keys` (join table) | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="published_questionnaire_demographic_keys", joinColumns=@JoinColumn(name="questionnaire_id"))` `@Column(name="field_key")` | Which demographic fields this version collects |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB default |
| `parentId` | `parent_id` | `String` | `@Column(name="parent_id", length=64)` | FK-by-convention to `questionnaires.id` |
| `versionMajor` | `version_major` | `Integer` | `@Column(name="version_major", nullable=false)` | Semver major; 0 while DRAFT |
| `versionMinor` | `version_minor` | `Integer` | `@Column(name="version_minor", nullable=false)` | Semver minor; 0 while DRAFT |
| `versionLabel` | `version_label` | `String` | — | Computed string e.g. `"v1.2"` or `"draft"` |
| `versionName` | `version_name` | `String` | — | Human display name for this version |
| `versionComments` | `version_comments` | `String` | `@Column(columnDefinition="text")` | Release notes |
| `versionStatus` | `version_status` | `String` | `@Column(name="version_status", length=16, nullable=false)` | `"DRAFT"` or `"COMMITTED"` — plain string to avoid enum-migration cost |
| `branchedFromVersionId` | `branched_from_version_id` | `String` | — | Source version when created by `cloneAsDraft()` |
| `committedAt` | `committed_at` | `OffsetDateTime` | — | Timestamp of COMMITTED transition |
| `committedBy` | `committed_by` | `String` | — | User id from `SecurityContextHolder` |

The `published_questionnaires` schema in `01-schema.sql` still contains legacy JSON columns (`mqs`, `questions`, `languages`, `demographic_field_keys`). These are dropped on the first startup by `JsonToTableMigrationRunner` after their data has been moved to the normalised join / child tables. **On a live database those columns will be absent.**

---

#### Snapshot MQ tree: `PublishedQuestionnaireMq` + `PublishedQuestionnaireMqt`

These two tables hold a point-in-time copy of the MQ/MQT taxonomy as it existed when the version was published. Because `mqt_id` values are stored as plain `VARCHAR(64)` with no FK, the live taxonomy can be renamed or restructured without invalidating existing snapshot rows.

**`published_questionnaire_mqs`**

| Field | Column | Java Type | JPA / Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(IDENTITY)` | Surrogate PK |
| `questionnaire` | `questionnaire_id` | `PublishedQuestionnaire` | `@ManyToOne(LAZY)` `@JoinColumn(name="questionnaire_id", nullable=false)` | Back-pointer to version |
| `mqId` | `mq_id` | `String` | `@Column(name="mq_id", nullable=false, length=64)` | Snapshot of the `measured_qualities.id` |
| `name` | `name` | `String` | — | Denormalised MQ name at publish time |
| `sortOrder` | `sort_order` | `int` | `@Column(name="sort_order", nullable=false)` | Presentation order |
| `mqts` | — (child table) | `List<PublishedQuestionnaireMqt>` | `@OneToMany(mappedBy="mq", cascade=ALL, orphanRemoval=true)` `@Where(clause="parent_id IS NULL")` `@OrderBy("sortOrder ASC")` | Top-level MQTs only; nested children loaded recursively |

**`published_questionnaire_mqts`**

| Field | Column | Java Type | JPA / Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(IDENTITY)` | Surrogate PK |
| `mq` | `pq_mq_id` | `PublishedQuestionnaireMq` | `@ManyToOne(LAZY)` `@JoinColumn(name="pq_mq_id", nullable=false)` | Owning MQ row |
| `parent` | `parent_id` | `PublishedQuestionnaireMqt` | `@ManyToOne(LAZY)` `@JoinColumn(name="parent_id")` | `NULL` for top-level traits |
| `children` | — | `List<PublishedQuestionnaireMqt>` | `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` | Self-referential children |
| `mqtId` | `mqt_id` | `String` | `@Column(name="mqt_id", nullable=false, length=64)` | Snapshot of `mqts.id` |
| `name` | `name` | `String` | — | Denormalised name |
| `sortOrder` | `sort_order` | `int` | `@Column(name="sort_order", nullable=false)` | Presentation order |

---

#### Snapshot question tree: `PublishedQuestionnaireQuestion`, `PublishedQuestionnaireQuestionOption`, `PublishedQuestionnaireQuestionOptionScore`, `PublishedQuestionnaireQuestionScore`

**`published_questionnaire_questions`**

| Field | Column | Notes |
|---|---|---|
| `id` (Long, IDENTITY PK) | `id` | Surrogate |
| `questionnaire` | `questionnaire_id` | FK `@ManyToOne(LAZY)` |
| `snapshotQuestionId` | `snapshot_question_id` | Original item UUID from the publish payload; used by the portal to match answers |
| `stem` | `stem` (TEXT) | Question wording |
| `format` | `format` (VARCHAR 32) | e.g. "MCQ", "free-text" |
| `mediaUrl` / `mediaType` | `media_url` / `media_type` | Optional media attachment |
| `clinicalRiskFlag` | `clinical_risk_flag` | Flags questions requiring special handling |
| `riskFlagRule` | `risk_flag_rule` (TEXT) | JSON rule evaluated by the portal |
| `sectionId` / `sectionTitle` | `section_id` / `section_title` | Logical grouping for multi-section questionnaires |
| `sortOrder` | `sort_order` | Presentation order within the questionnaire |
| `options` | — | `@OneToMany → published_questionnaire_question_options` |
| `questionScores` | — | `@OneToMany → published_questionnaire_question_scores` |

**`published_questionnaire_question_options`** — one row per MCQ choice. FK `pq_question_id`. Carries `sort_order`, `text`, optional `media_url/media_type`, and a child collection `→ published_questionnaire_question_option_scores`.

**`published_questionnaire_question_option_scores`** — unique constraint `(pq_option_id, mqt_id)`. The `score` column is the numeric weight credited to `mqt_id` when this option is selected.

**`published_questionnaire_question_scores`** — unique constraint `(pq_question_id, mqt_id)`. Score credited to `mqt_id` regardless of which option the respondent picks (participation score).

---

#### `QuestionnaireCatalog` → `instruments`

This entity is the **authoring-time** face of an instrument — the mutable record practitioners manage before and after publishing. `PublishedQuestionnaire` is its immutable snapshot counterpart.

| Field | Column | Java Type | JPA / Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (CHAR 36) | `String` | `@Id @Column(columnDefinition="char(36)")` | |
| `tenantId` | `tenant_id` | `String` | — | Multi-tenancy hook |
| `name` | `name` | `String` | — | |
| `shortName` | `short_name` | `String` | — | |
| `vertical` | `vertical` | `String` | — | |
| `category` | `category` | `String` | — | |
| `description` | `description` | `String` | `@Column(columnDefinition="text")` | |
| `itemCount` | `item_count` | `Integer` | — | Denormalised counter; recomputed by `ItemsService.bulkCreateItems` |
| `durationMinutes` | `duration_minutes` | `Integer` | — | |
| `languages` | `instrument_languages` (join table) | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="instrument_languages", joinColumns=@JoinColumn(name="instrument_id"))` | Migrated from legacy JSON column |
| `tierRequired` | `tier_required` | `String` | — | Defaults to `"T1"` |
| `isAdaptive` | `is_adaptive` | `boolean` | — | IRT-CAT flag |
| `isFixedSequence` | `is_fixed_sequence` | `boolean` | — | |
| `normStatus` | `norm_status` | `String` | — | e.g. "AVAILABLE" |
| `ageRange` | `age_range` | `String` | — | |
| `isPublished` | `is_published` | `boolean` | — | Visibility gate |
| `usesWeightedScoring` | `uses_weighted_scoring` | `boolean` | — | |
| `scoringModel` | `scoring_model` (VARCHAR 32) | `String` | — | e.g. `"MQ_MQT"`, `"IRT_3PL"`; extracted from legacy `scoring_config` JSON by migration |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB-managed |

**Note on drift:** `01-schema.sql` still lists several columns on `instruments` that are dropped at runtime by `JsonToTableMigrationRunner`: `informant_types`, `metadata`, `languages` (JSON), `scoring_config`. The canonical live shape has only `scoring_model` in their place.

---

#### `Item` → `items`

The live, mutable question bank. Items are owned by an instrument (`instrument_id`) and carry full IRT parameters for adaptive testing.

| Field | Column | Java Type | JPA / Annotations | Notes |
|---|---|---|---|---|
| `id` | `id` (CHAR 36) | `String` | `@Id` | Caller-generated UUID |
| `instrumentId` | `instrument_id` | `String` | `@Column(name="instrument_id")` | No JPA FK object; raw string |
| `vertical` | `vertical` | `String` | — | Copied from instrument at insert time |
| `subDomain` | `sub_domain` | `String` | — | Deprecated single-domain field; superseded by `questionScores` |
| `questionScores` | `item_question_scores` | `List<ItemQuestionScore>` | `@OneToMany(mappedBy="item", cascade=ALL, orphanRemoval=true)` | Question-level MQT weights; migrated from legacy `sub_domains` JSON |
| `itemFormat` | `item_format` | `String` | — | e.g. "MCQ" |
| `stem` | `stem` (TEXT) | `String` | — | Question wording |
| `mediaUrl` / `mediaType` | `media_url` / `media_type` | `String` | — | Optional attachment |
| `options` | `item_options` | `List<ItemOption>` | `@OneToMany(mappedBy="item", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` | MCQ options; migrated from legacy `options` JSON |
| `irtA` / `irtB` / `irtC` | `irt_a` / `irt_b` / `irt_c` | `Double` | — | IRT 3-PL parameters; `irt_c` is `NOT NULL DEFAULT 0` in the schema |
| `validationStatus` | `validation_status` | `String` | — | `"DRAFT"` on creation |
| `riskFlag` | `clinical_risk_flag` | `boolean` | `@Column(name="clinical_risk_flag")` | |
| `riskRule` | `risk_flag_rule` (TEXT) | `String` | — | |
| `sequenceOrder` | `sequence_order` | `Integer` | — | Fixed presentation order |
| `languages` | `item_languages` (join table) | `Set<String>` | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="item_languages", joinColumns=@JoinColumn(name="item_id"))` | Migrated from legacy JSON |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | |

---

#### `ItemOption` → `item_options`

| Field | Column | JPA / Notes |
|---|---|---|
| `id` (Long, IDENTITY) | `id` | Surrogate PK |
| `item` | `item_id` | `@ManyToOne(LAZY)` `@JoinColumn(nullable=false)` |
| `sortOrder` | `sort_order` | Presentation order |
| `text` | `text` (TEXT) | Option wording |
| `mediaUrl` / `mediaType` | `media_url` / `media_type` | Optional |
| `scores` | `item_option_scores` | `@OneToMany(mappedBy="option", cascade=ALL, orphanRemoval=true, fetch=EAGER)` |

#### `ItemOptionScore` → `item_option_scores`

Unique constraint `(option_id, mqt_id)`. Columns: `id` (Long IDENTITY), `option_id` (FK), `mqt_id` (VARCHAR 64), `score` (double).

#### `ItemQuestionScore` → `item_question_scores`

Unique constraint `(item_id, mqt_id)`. Columns: `id` (Long IDENTITY), `item_id` (FK), `mqt_id` (VARCHAR 64), `score` (double). These are "participation scores" — credited whenever the question is answered, independent of which option was selected.

---

#### `MeasuredQuality` → `measured_qualities`

| Field | Column | JPA / Notes |
|---|---|---|
| `id` | `id` | `@Id`; caller-assigned string |
| `name` | `name` | UNIQUE NOT NULL in DDL |
| `description` | `description` (TEXT) | |
| `mqts` | `mqts` table | `@OneToMany(mappedBy="mq", cascade=ALL, orphanRemoval=true)` `@Where(clause="parent_mqt_id IS NULL")` `@OrderBy("sortOrder ASC")` — top-level traits only |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` | DB-managed; `insertable=false, updatable=false` |

`01-schema.sql` still shows a `mqts` JSON column on `measured_qualities`. `JsonToTableMigrationRunner.migrateMqtTree()` drains it into the `mqts` child table and then `dropLegacyColumn` removes it on startup. It will not exist in any production DB that has been booted at least once.

#### `Mqt` → `mqts`

| Field | Column | JPA / Notes |
|---|---|---|
| `id` | `id` (VARCHAR 64) | `@Id`; author-assigned semantic key e.g. `"anx-somatic"` |
| `mq` | `mq_id` | `@ManyToOne(LAZY)` `@JoinColumn(nullable=false)` |
| `parent` | `parent_mqt_id` | `@ManyToOne(LAZY)`; `NULL` for root traits |
| `children` | — | `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` |
| `name` | `name` | `@Column(nullable=false)` |
| `sortOrder` | `sort_order` | `@Column(name="sort_order", nullable=false)` |

MQTs form an arbitrary-depth tree; the system walks it recursively in both `QualitiesService.buildMqt()` and `QualitiesService.entityToDto()`.

---

#### `DemographicField` → `demographic_fields`

| Field | Column | JPA / Notes |
|---|---|---|
| `id` | `id` | `@Id` |
| `fieldKey` | `field_key` (VARCHAR 128) | Stable key referenced from `published_questionnaire_demographic_keys` |
| `label` | `label` | Display label |
| `type` | `type` | Validated in `DemographicFieldsService` to one of: `text`, `number`, `date`, `select`, `textarea` |
| `required` | `required` | |
| `placeholder` | `placeholder` | |
| `options` | `demographic_field_options` (join table) | `@ElementCollection(fetch=EAGER)` `@CollectionTable(name="demographic_field_options", joinColumns=@JoinColumn(name="field_id"))` `@Column(name="option_value")` — for `select` type |
| `sortOrder` | `sort_order` | |
| `active` | `active` | Soft-disable without deletion |

---

#### `ItemDisplayState` → `item_display_state`

| Field | Column | Notes |
|---|---|---|
| `itemId` | `item_id` (PK) | `@Id @Column(name="item_id")` |
| `deleted` | `deleted` | Boolean tombstone |

The `override` JSON column present in the DDL is dropped by `JsonToTableMigrationRunner.dropLegacyColumn("item_display_state", "override")`. The service (`ItemDisplayService.upsertOverride`) accepts an `override` map in the request payload for backward compatibility but silently discards it.

---

### REST Endpoints

All endpoints are under the Spring Security filter chain. The application uses JWT authentication; these routes require a valid Bearer token. No explicit `@PreAuthorize` annotations are present in these controllers — role enforcement is enforced at the security config level (not repeated here).

#### `/api/v1/questionnaires` — `QuestionnairesController` → `QuestionnairesService`

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/questionnaires` | List all `PublishedQuestionnaire` rows (full DTO with MQ tree + question list). Optional `?vertical=` filter. |
| `GET` | `/api/v1/questionnaires/summaries` | Lightweight projection (id, name, shortName, vertical, category, duration, questionCount) via a JPQL constructor projection — no question rows loaded. Used by assessment-create dropdowns. |
| `GET` | `/api/v1/questionnaires/by-name?name=` | Lookup by name or shortName (case-insensitive). Returns first match. |
| `GET` | `/api/v1/questionnaires/{id}` | Full DTO for one version by its UUID. |
| `POST` | `/api/v1/questionnaires` | Upsert (create or overwrite) a `PublishedQuestionnaire`. Body is `QuestionnaireDto` containing the full MQ tree and question array as JSON fields. COMMITTED versions are rejected with HTTP 400 — a new draft must be created instead. Duplicate name rows are cascade-deleted before saving. Returns HTTP 201. |
| `DELETE` | `/api/v1/questionnaires/{id}` | Hard-delete a version row; cascades to all child tables. |

#### `/api/v1/questionnaire-records` — `QuestionnaireVersioningController` → `QuestionnaireVersioningService`

This controller is the git-style surface that the Question Bank UI primarily uses.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/questionnaire-records` | List all `Questionnaire` parents (shallow: version/draft counts, current version label). |
| `POST` | `/api/v1/questionnaire-records` | Create a new `Questionnaire` parent + auto-creates a blank DRAFT version. Returns HTTP 201. |
| `GET` | `/api/v1/questionnaire-records/{id}` | Full parent DTO including all versions sorted (drafts first, then committed newest-to-oldest). |
| `PUT` | `/api/v1/questionnaire-records/{id}` | Update parent-level metadata (name, vertical). Audited. |
| `DELETE` | `/api/v1/questionnaire-records/{id}` | Delete parent and all versions — blocked if any version is referenced by an assessment. |
| `PATCH` | `/api/v1/questionnaire-records/{id}/current-version` | Move `current_version_id` to a specified COMMITTED version. Body: `{"versionId": "V-XXXXXXXX"}`. Audited. |
| `GET` | `/api/v1/questionnaire-records/{id}/audit` | Return audit log entries for this questionnaire from `AuditService`. |
| `GET` | `/api/v1/questionnaire-records/{id}/versions` | List all versions; `?committedOnly=true` restricts to COMMITTED rows. |
| `POST` | `/api/v1/questionnaire-records/{id}/versions/drafts` | Create a new DRAFT — either blank or branched from an existing COMMITTED version (`{"branchedFromVersionId": "V-...","initialName": "..."`). Returns HTTP 201. |
| `GET` | `/api/v1/questionnaire-records/{id}/versions/{vid}` | Full `QuestionnaireDto` for a specific version (delegates to `QuestionnairesService.get(vid)`). |
| `PATCH` | `/api/v1/questionnaire-records/{id}/versions/{vid}` | Overwrite DRAFT content with the provided `QuestionnaireDto`. Rejected with HTTP 400 if `versionStatus=COMMITTED`. |
| `POST` | `/api/v1/questionnaire-records/{id}/versions/{vid}/commit` | Transition DRAFT → COMMITTED. Body: `CommitVersionRequest` with `bump` (`MAJOR`/`MINOR`), optional `versionName`, `versionComments`, `setAsCurrent`. Computes semver label from the parent's latest committed row. |
| `DELETE` | `/api/v1/questionnaire-records/{id}/versions/{vid}` | Discard a DRAFT. COMMITTED versions cannot be deleted. |

#### `/api/v1/questionnaires-catalog` — `QuestionnairesCatalogController`

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/questionnaires-catalog` | List published instruments (native SQL with live `item_count` derivation; see service notes). Optional `?vertical=`. |
| `GET` | `/api/v1/questionnaires-catalog/{id}` | Single instrument detail (same native-SQL item-count logic). |
| `POST` | `/api/v1/questionnaires-catalog` | Create or upsert an instrument row (`ItemsService.createQuestionnaireCatalog`). MySQL `INSERT ... ON DUPLICATE KEY UPDATE`. |
| `DELETE` | `/api/v1/questionnaires-catalog/{id}` | Hard-delete instrument and all child items in FK order; also deletes any `published_questionnaires` row with the same name. |
| `GET` | `/api/v1/questionnaires-catalog/{instrumentId}/items` | List all `items` rows for this instrument with their options and scores (native SQL multi-query). |
| `POST` | `/api/v1/questionnaires-catalog/{instrumentId}/items` | Create one item with options and scores. Recomputes `item_count` on the instrument. |
| `POST` | `/api/v1/questionnaires-catalog/{instrumentId}/items/bulk` | Replace the entire item set for the instrument (delete-then-insert). Used by the publish flow's "Call 3". |

#### `/api/v1/qualities` — `QualitiesController` → `QualitiesService`

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/qualities` | List all `MeasuredQuality` rows ordered by name; each includes its full MQT tree. |
| `GET` | `/api/v1/qualities/{id}` | Single MQ with full MQT tree. |
| `POST` | `/api/v1/qualities` | Create or upsert an MQ + rebuild its MQT tree from the DTO. Returns HTTP 201. |
| `PUT` | `/api/v1/qualities/{id}` | Update — delegates to `upsert` after pinning the id. |
| `DELETE` | `/api/v1/qualities/{id}` | Hard-delete; idempotent (no-op if not found, mirrors original Go behaviour). |

#### `/api/v1/demographic-fields` — `DemographicFieldsController` → `DemographicFieldsService`

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/demographic-fields` | List all (or active-only with `?active=true`) demographic fields ordered by `sort_order, label`. |
| `POST` | `/api/v1/demographic-fields` | Upsert a demographic field. Validates `type` against the allowed enum. Returns HTTP 201. |
| `DELETE` | `/api/v1/demographic-fields/{id}` | Hard-delete; idempotent. |

#### `/api/v1/item-display` — `ItemDisplayController` → `ItemDisplayService`

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/item-display` | List all `ItemDisplayState` rows; the `override` map is always returned as an empty `{}` (column no longer exists). |
| `POST` | `/api/v1/item-display/override` | Upsert an `ItemDisplayState` row. The `override` field in the request body is accepted but silently discarded. |
| `POST` | `/api/v1/item-display/{id}/delete` | Set `deleted=true` on an item's display-state row (soft tombstone for the builder UI). |
| `DELETE` | `/api/v1/item-display/{id}` | Hard-delete the display-state row (clears tombstone). |

---

### Service-Layer Business Logic

#### `QuestionnairesService` — version content manager

This service is the single point that reads and writes the content of a `PublishedQuestionnaire` row together with all its child collections.

**`upsert(QuestionnaireDto dto)` — step by step:**

1. Validates that `id` and `name` are non-blank.
2. Loads the existing row by id. If `versionStatus == "COMMITTED"`, throws `BadRequestException` immediately — committed versions are immutable.
3. Queries `findOthersByName` for any other row holding the same name (case-insensitive). Deletes each found row individually via `repo.delete(entity)` — *not* a bulk JPQL DELETE — because `orphanRemoval` on the child collections (MQs, questions, languages, demographic keys) requires the entity lifecycle to fire, otherwise FK constraints on the child tables trip. Calls `repo.flush()` before the save so the cascade deletes are visible in the same transaction.
4. Loads (or creates) the target row.
5. Sets all scalar fields.
6. Calls `applyMqsFromJson(q, dto.getMqs())` — clears the existing MQ collection, then reconstructs the entire tree from the incoming Jackson `JsonNode` array. The tree is built depth-first via `buildMqt()` which wires `PublishedQuestionnaireMqt.parent` and `PublishedQuestionnaireMqt.children` correctly before anything is persisted.
7. Calls `applyQuestionsFromJson(q, dto.getQuestions())` — analogously rebuilds questions, options, option scores, and question scores.
8. Sets the `demographicFieldKeys` set.
9. Calls `repo.save(q)` to persist the full object graph in one flush.

**`toDto(PublishedQuestionnaire)` / `questionsToJson` / `mqsToJson`**: The inverse direction — reconstructs Jackson `ArrayNode` trees from the in-memory entity graph for the API response. This bidirectional JSON ↔ entity conversion means the API's wire format is a self-contained JSON document, not a relational projection.

---

#### `QuestionnaireVersioningService` — git-style lifecycle

**`createParent(dto)`:** Generates a `"Q-"` prefixed id, saves the `Questionnaire` parent, then immediately creates a blank `PublishedQuestionnaire` with `versionStatus="DRAFT"`, `versionMajor=0`, `versionLabel="draft"`. Every parent is born with at least one draft.

**`createDraft(parentId, req)`:**
- If `req.branchedFromVersionId` is set: loads the source, validates it is COMMITTED and belongs to this parent, then calls `cloneAsDraft(base)`.
- `cloneAsDraft()` persists a shell draft row first (to acquire a stable `"V-"` id), then round-trips the source through `QuestionnairesService.get() → upsert()` to deep-copy the MQ tree, questions, options, and scores as independent rows owned by the new draft. This avoids JPA re-attachment issues with detached managed entities.

**`updateDraftContent(versionId, dto)`:** Asserts `versionStatus == "DRAFT"`, forces `dto.id = versionId`, then delegates to `QuestionnairesService.upsert()`.

**`commitDraft(versionId, req)`:**
1. Validates `versionStatus == "DRAFT"` and `bump` is `MAJOR` or `MINOR`.
2. Queries `findLatestCommittedByParent` to get the current highest committed version (ordering by `version_major DESC, version_minor DESC`). If none, starts at `v1.0`.
3. Increments accordingly (`MAJOR` bumps `major+1, minor=0`; `MINOR` bumps `minor+1`).
4. Sets `version_label = "v{major}.{minor}"`, stamps `committed_at`, `committed_by`, and flips `version_status = "COMMITTED"`.
5. Syncs the parent's cached `name` and `vertical` from the committed version.
6. If `req.setAsCurrent == true` or the parent has no current version, advances `current_version_id`.
7. Creates two audit log entries: `VERSION_COMMITTED` and optionally `VERSION_SET_CURRENT`.

**`deleteParent(id)`:** Guards against deletion by iterating all child versions and checking `assessments.countByQuestionnaireVersionId(v.getId()) > 0`. Even a single assessment pinned to any version blocks the entire parent from being deleted.

---

#### `QuestionnairesCatalogService` — instrument catalogue

Both `list()` and `get()` use native SQL rather than JPA because they need to compute `item_count` as the greater of two counts: the live count from `items` and a correlated count from `published_questionnaire_questions` matched by name. This handles two real-world drift cases: (1) the bulk-items call was never made during publishing, so `items` is empty; (2) questions were only written to the snapshot, not the live bank.

The `list()` method also bulk-loads languages via a second native query and stitches them to the result rows in memory — avoiding N+1 while keeping the main query simple.

`delete()` manually walks the FK chain in MySQL join-delete syntax:
`item_option_scores → item_options → item_question_scores → item_languages → items → instrument_languages → instruments` — then also drops the matching `published_questionnaires` row by name (case-insensitive `LOWER()` compare).

---

#### `ItemsService` — item bank writer

This service bypasses JPA entities entirely and uses `EntityManager.createNativeQuery` throughout. Reasons documented in the code: the bulk operation needs MySQL `LAST_INSERT_ID()` to recover auto-increment PKs after inserting `item_options` rows before attaching their `item_option_scores`.

**`bulkCreateItems(instrumentId, req)`:**
1. Calls `deleteItemChildrenForInstrument()` — a four-step FK-ordered delete (`option_scores → options → question_scores → languages`) followed by `DELETE FROM items WHERE instrument_id = ?`.
2. Iterates the incoming item list; for each: inserts the `items` row, then `item_languages` rows, then `item_question_scores` rows (from `req.subDomains`), then `item_options` rows with nested `item_option_scores`.
3. Recomputes `item_count` on the `instruments` row with a `COUNT(*)` subquery.

Errors on individual items are caught and logged (`log.warn`) so one bad row does not abort the entire bulk operation.

---

#### `QualitiesService` — MQ/MQT tree manager

`upsert(dto)` rebuilds the entire MQT tree from the DTO on each call: `q.getMqts().clear()` followed by recursively calling `buildMqt()` which wires `mq`, `parent`, `sortOrder`, and `children`. `orphanRemoval=true` on `MeasuredQuality.mqts` ensures that any removed MQT subtrees are deleted when `repo.save(q)` flushes. The `@Where(clause="parent_mqt_id IS NULL")` annotation on `MeasuredQuality.mqts` ensures only root-level MQTs are included in that collection — children are traversed through `Mqt.getChildren()`.

---

#### `DemographicFieldsService`

Straightforward `findById → set fields → save` for upsert. The type field is validated in the service against a fixed switch: `text`, `number`, `date`, `select`, `textarea`. The `options` set (for `select` type) is stored via `@ElementCollection` in `demographic_field_options`.

---

#### `ItemDisplayService`

`markDeleted(id)` creates the row if it does not exist (tombstone creation), sets `deleted=true`. `clear(id)` hard-deletes the row, restoring the item to visible. The `upsertOverride()` method accepts the legacy `override` map in the DTO body for wire-compatibility but the column it used to write to was dropped by `JsonToTableMigrationRunner`.

---

### Startup Migration Runners

Two `CommandLineRunner` / `ApplicationRunner` implementations execute on every boot:

**`QuestionnaireVersioningMigrationRunner` (`@Order(10)`):**
Iterates all `PublishedQuestionnaire` rows that lack a `parent_id`. For each, creates a `Questionnaire` parent row, sets `version_status = "COMMITTED"`, `version_major = 1`, `version_minor = 0`, `version_label = "v1.0"`, and wires `current_version_id` on the parent. Also backfills `Assessment.questionnaire_version_id` and retargets `Assessment.questionnaire_id` from the version to the parent. Both passes are idempotent.

**`JsonToTableMigrationRunner` (`@Order(1)`):**
A comprehensive one-shot migration that drains JSON blob columns into normalised tables: MQT trees from `measured_qualities.mqts`, item options from `items.options`, question scores from `items.sub_domains`, MQ/MQT snapshots from `published_questionnaires.mqs`, question snapshots from `published_questionnaires.questions`, language lists from `instruments.languages`, `items.languages`, `published_questionnaires.languages`, demographic key lists from `published_questionnaires.demographic_field_keys`, and scoring model name from `instruments.scoring_config`. After moving each dataset it **drops the legacy column** via `ALTER TABLE ... DROP COLUMN` so later inserts are not required to supply a value for an unmapped column. A fast-path `COUNT(*)` on `INFORMATION_SCHEMA.COLUMNS` at the start means each boot after migration completes in a single query.

---

### Notable Design Decisions

1. **Two parallel "questionnaire" representations.** `QuestionnaireCatalog` (`instruments` table) is the live authoring record; `PublishedQuestionnaire` (`published_questionnaires`) is the immutable snapshot used for assessment delivery and scoring. They are linked by name (case-insensitive `LOWER(TRIM(...))` match), not by a hard FK, so a republish can update the snapshot without knowing the instrument's UUID.

2. **JSON ↔ entity round-trip instead of in-place mutation.** `QuestionnairesService` exposes `mqs` and `questions` as `JsonNode` fields in `QuestionnaireDto`. Every PUT/POST re-serialises the entire tree. `orphanRemoval=true` on every child collection ensures that stale rows are deleted on each upsert without explicit DELETE statements in the service. The tradeoff is that a large questionnaire involves deleting and re-inserting every question row on every save, but this provides a clean, stateless update path with zero partial-state risk.

3. **COMMITTED versions are immutable.** Once `version_status = "COMMITTED"`, `QuestionnairesService.upsert()` throws `BadRequestException` and the only path to a new version is `QuestionnaireVersioningService.createDraft()` + `commitDraft()`. Assessments are permanently pinned to the version they were created against via `questionnaire_version_id`, so changing the current version pointer never retroactively affects scoring.

4. **`item_count` is a denormalised counter with live fallback.** `QuestionnairesCatalogService.list()` and `get()` compute `item_count` as `GREATEST(count from items, count from published_questionnaire_questions)`. This tolerates publishers that skip the bulk-items step (only writing the snapshot) or the reverse (writing items but not publishing a snapshot). The fallback is computed at read time rather than maintained with triggers.

5. **Native SQL throughout the item-write path.** `ItemsService` uses raw native queries instead of JPA entities because it requires `LAST_INSERT_ID()` to chain an `item_options` insert with its `item_option_scores` children. This avoids two-phase persist and the overhead of Hibernate's dirty-checking for bulk write operations.

6. **MQT id is a semantic string, not a surrogate.** `Mqt.id` is `VARCHAR(64)` assigned by the practitioner (e.g. `"anx-somatic-cardio"`). This id is what appears in `ItemOptionScore.mqt_id`, `ItemQuestionScore.mqt_id`, `PublishedQuestionnaireMqt.mqtId`, and ultimately `PortalSessionMqtScore.mqt_id`. There is no hard FK between these columns and the `mqts` table — the semantic id acts as a join key without enforcing referential integrity, so snapshot rows remain valid even if the live MQT tree is restructured.

7. **`@Where(clause="parent_mqt_id IS NULL")` on root MQT collections.** Both `MeasuredQuality.mqts` and `PublishedQuestionnaireMq.mqts` carry this Hibernate annotation. It prevents Hibernate from loading all MQT rows into the root collection; only root-level (parentless) traits appear there. Child traits are loaded through their respective `Mqt.getChildren()` / `PublishedQuestionnaireMqt.getChildren()` collections, giving a correct tree shape without a recursive query.

---

### Connections to Other Subsystems

- **Assessment creation:** `QuestionnaireVersioningService` exposes `listVersions(parentId, committedOnly=true)` and `PublishedQuestionnaireRepository.findAllSummariesOrderByCreated()` for the assessment-create picker. The `Assessment` entity stores both `questionnaire_id` (→ parent) and `questionnaire_version_id` (→ the specific `PublishedQuestionnaire` row), keeping the family association queryable while locking content to an immutable version.

- **Portal session delivery:** `PortalSession` references the questionnaire by name (the `instrument` field) and the scoring subsystem looks up questions and MQTs from the `PublishedQuestionnaire` snapshot at session-start time. `PublishedQuestionnaireQuestion.snapshotQuestionId` is matched against respondent answers in `AssessmentAnswer.questionId` to drive scoring into `PortalSessionMqtScore`.

- **Scoring model:** `ItemOptionScore.mqt_id` and `ItemQuestionScore.mqt_id` in the live item bank mirror `PublishedQuestionnaireQuestionOptionScore.mqt_id` and `PublishedQuestionnaireQuestionScore.mqt_id` in the snapshot. The scoring engine accumulates values from these score rows into `PortalSessionMqtScore` rows keyed by the same `mqt_id` string.

- **Demographic data collection:** `PublishedQuestionnaire.demographicFieldKeys` (join table `published_questionnaire_demographic_keys`) names which `DemographicField.fieldKey` values to present to a respondent before the session begins. The portal reads this set and renders the appropriate input controls; answers land in `PortalSessionDemographic` rows.

- **Audit log:** `QuestionnaireVersioningService` calls `AuditService.record()` with action codes `QUESTIONNAIRE_CREATED`, `QUESTIONNAIRE_UPDATED`, `QUESTIONNAIRE_DELETED`, `VERSION_DRAFT_CREATED`, `VERSION_DRAFT_BRANCHED`, `VERSION_COMMITTED`, `DRAFT_DISCARDED`, `VERSION_SET_CURRENT`. These are surfaced back to the UI via `GET /api/v1/questionnaire-records/{id}/audit`.

- **Access control:** `QuestionnaireVersioningService.currentActorId()` resolves the logged-in user from `SecurityContextHolder` — expects a `UserPrincipal` in the authentication principal. If the call comes from an unauthenticated context (e.g. a migration runner), `currentActorId()` returns `null` and the recorded actor is `"system-migration"`.

---


## Publishing, Immutable Snapshots & Version Control

### Purpose and Responsibilities

This subsystem solves a fundamental data-integrity problem in a psychometric SaaS: once a respondent has been allotted an assessment and begins answering, the questionnaire content — question stems, option text, scoring weights — must never change beneath them. Equally, if a practitioner later revises the questionnaire (adding items, re-weighting scores, correcting a typo), those changes must not silently alter in-flight or historical assessment results.

The solution is a **Git-inspired versioning model** layered on top of what was originally a flat `published_questionnaires` table. Every published questionnaire now belongs to a **parent** (`Questionnaire`) that acts as the stable identity ("PHQ-9", "Custom Hiring Screen 2026"), and the actual content lives in one or more **version rows** (`PublishedQuestionnaire`), each of which is a complete, self-contained snapshot of the instrument at a point in time. Once a version is committed, no code path can mutate it; only a new draft-then-commit cycle can produce the next version.

Concretely, the subsystem is responsible for:

- Maintaining the `questionnaires` parent table (the "Question Bank" catalogue entry).
- The full lifecycle of a `PublishedQuestionnaire` version: `DRAFT` creation (blank or branched from a committed ancestor), content editing, `COMMITTED` promotion with semver labelling, and the `current_version_id` pointer that defaults new Assessment creation.
- Protecting the immutability invariant: `QuestionnairesService.upsert()` refuses to materialise content onto a `COMMITTED` row; `QuestionnaireVersioningService.discardDraft()` refuses to delete a `COMMITTED` row.
- Cascade-deleting entire snapshot trees (MQs → MQTs → Questions → Options → Option-Scores and Question-Scores) when a draft is discarded, via JPA `orphanRemoval = true`.
- Backfill migration of pre-versioning data and of the legacy JSON column storage via two `ApplicationRunner` / `CommandLineRunner` components.
- Writing an audit trail entry for every state transition via `AuditService`.

---

### Data Model

#### Table: `questionnaires` — the parent / catalogue entry

Mapped to `@Entity @Table(name = "questionnaires")` → `Questionnaire.java`.

| Field | Column | Type | JPA / Notes |
|---|---|---|---|
| `id` | `id` | `String` (VARCHAR) | `@Id`. Format: `"Q-" + 8-char UUID fragment (upper-cased)` assigned in `createParent()`. |
| `name` | `name` | `String` | `@Column(nullable = false)`. Denormalised cache of the committed version's name — updated at commit time for list-view performance. |
| `vertical` | `vertical` | `String` | Denormalised cache, also updated at commit. |
| `currentVersionId` | `current_version_id` | `String` | FK (soft, no DB constraint declared) to `published_questionnaires.id`. Points at the COMMITTED version the Assessment-create UI defaults to. Moving this pointer never retroactively affects existing Assessments. |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable = false, updatable = false)` — DB default `CURRENT_TIMESTAMP`. |
| `createdBy` | `created_by` | `String` | The practitioner id of the actor who ran `createParent()`, or `"system-migration"` for backfilled rows. |

**Note:** The `questionnaires` table is **not** in the hand-written DDL (`01-schema.sql`). It was added to the live database by Hibernate `ddl-auto=update` when the versioning feature was deployed. This is a known drift between the DDL file and the live schema.

---

#### Table: `published_questionnaires` — the version / snapshot root

Mapped to `@Entity @Table(name = "published_questionnaires")` → `PublishedQuestionnaire.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `String` (VARCHAR 64) | `@Id`. | Format: `"V-" + 8-char UUID fragment (upper-cased)`. Globally unique; `parentId`+`id` pair is the compound logical key. |
| `name` | `name` | `String` | plain column | Snapshot of the name at publish time. |
| `shortName` | `short_name` | `String` | `@Column(name = "short_name")` | |
| `vertical` | `vertical` | `String` | | |
| `category` | `category` | `String` | | |
| `description` | `description` | `String` | `@Column(columnDefinition = "text")` | |
| `duration` | `duration` | `Integer` | | Minutes. |
| `tier` | `tier` | `String` | | e.g. `T1`, `T2`. |
| `languages` | *(join table)* | `Set<String>` | `@ElementCollection(fetch = EAGER)` `@CollectionTable(name = "published_questionnaire_languages", joinColumns = @JoinColumn(name = "questionnaire_id"))` `@Column(name = "language", length = 8)` | Migrated out of legacy `languages` JSON column by `JsonToTableMigrationRunner`. |
| `demographicFieldKeys` | *(join table)* | `Set<String>` | `@ElementCollection(fetch = EAGER)` `@CollectionTable(name = "published_questionnaire_demographic_keys", joinColumns = @JoinColumn(name = "questionnaire_id"))` `@Column(name = "field_key", length = 128)` | Keys of demographic form fields to surface in the portal. Migrated similarly. |
| `mqs` | *(child table)* | `List<PublishedQuestionnaireMq>` | `@OneToMany(mappedBy = "questionnaire", cascade = ALL, orphanRemoval = true)` `@OrderBy("sortOrder ASC")` | The snapshot MQ tree. See below. |
| `questions` | *(child table)* | `List<PublishedQuestionnaireQuestion>` | `@OneToMany(mappedBy = "questionnaire", cascade = ALL, orphanRemoval = true)` `@OrderBy("sortOrder ASC")` | The flat ordered list of snapshot questions. |
| `isDemo` | `is_demo` | `boolean` | `@Column(name = "is_demo")` | |
| `disclaimer` | `disclaimer` | `String` | `@Column(columnDefinition = "text")` | |
| `instructions` | `instructions` | `String` | `@Column(columnDefinition = "text")` | Pre-assessment instructions. The text can be saved while disabled. |
| `showInstructions` | `show_instructions` | `boolean` | `@Column(name = "show_instructions", nullable = false)` | Toggle: whether the portal surfaces the instructions screen. |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable = false, updatable = false)` | DB default. |
| `parentId` | `parent_id` | `String` (VARCHAR 64) | `@Column(name = "parent_id", length = 64)` | Soft FK to `questionnaires.id`. Null on pre-migration legacy rows until `QuestionnaireVersioningMigrationRunner` backfills it. |
| `versionMajor` | `version_major` | `Integer` | `@Column(name = "version_major", nullable = false)` | Semver major component. `0` while DRAFT. |
| `versionMinor` | `version_minor` | `Integer` | `@Column(name = "version_minor", nullable = false)` | Semver minor component. `0` while DRAFT. |
| `versionLabel` | `version_label` | `String` | `@Column(name = "version_label")` | Human-readable label: `"draft"` while in progress; `"v1.0"`, `"v2.3"`, etc. after commit. |
| `versionName` | `version_name` | `String` | `@Column(name = "version_name")` | Optional free-text name the author gives the release (e.g. "Q2 2026 Clinical Revision"). |
| `versionComments` | `version_comments` | `String` | `@Column(name = "version_comments", columnDefinition = "text")` | Release notes / change description. |
| `versionStatus` | `version_status` | `String` (VARCHAR 16) | `@Column(name = "version_status", nullable = false)` | `"DRAFT"` or `"COMMITTED"`. Stored as a plain string — no DB-level enum — so future states (e.g. `"ARCHIVED"`) can be added without a schema migration. Default: `"COMMITTED"` on the entity (backfill-safe); the service explicitly sets `"DRAFT"` on new rows. |
| `branchedFromVersionId` | `branched_from_version_id` | `String` (VARCHAR 64) | `@Column(name = "branched_from_version_id", length = 64)` | When a draft is created by cloning another committed version, this records the source version's id. Null for blank drafts and for legacy rows. |
| `committedAt` | `committed_at` | `OffsetDateTime` | `@Column(name = "committed_at")` | Set to `OffsetDateTime.now(ZoneOffset.UTC)` at commit time. |
| `committedBy` | `committed_by` | `String` | `@Column(name = "committed_by")` | Practitioner id drawn from `SecurityContextHolder` at commit time. |

---

#### Table: `published_questionnaire_mqs` — snapshot MQ (Measured Quality) rows

Mapped to `@Entity @Table(name = "published_questionnaire_mqs")` → `PublishedQuestionnaireMq.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(strategy = IDENTITY)` | Surrogate PK. |
| `questionnaire` | `questionnaire_id` | FK → `published_questionnaires.id` | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "questionnaire_id", nullable = false)` | Parent version row. |
| `mqId` | `mq_id` | `String` (VARCHAR 64) | `@Column(name = "mq_id", nullable = false, length = 64)` | The source `MeasuredQuality.id` at publish time. Stored as a plain varchar — **no FK** to `measured_qualities` — so the live authoring row can be renamed or deleted without invalidating historical snapshots. |
| `name` | `name` | `String` | | Snapshot of the MQ name. |
| `sortOrder` | `sort_order` | `int` | `@Column(name = "sort_order", nullable = false)` | Position within the version's MQ list. |
| `mqts` | *(child table)* | `List<PublishedQuestionnaireMqt>` | `@OneToMany(mappedBy = "mq", cascade = ALL, orphanRemoval = true)` `@Where(clause = "parent_id IS NULL")` `@OrderBy("sortOrder ASC")` | **Top-level MQTs only** under this MQ. The `@Where` filter excludes nested children from this collection; nested rows are reached via each `PublishedQuestionnaireMqt.children`. |

---

#### Table: `published_questionnaire_mqts` — snapshot MQT (Measured Quality Trait) tree

Mapped to `@Entity @Table(name = "published_questionnaire_mqts")` → `PublishedQuestionnaireMqt.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(strategy = IDENTITY)` | Surrogate PK. |
| `mq` | `pq_mq_id` | FK → `published_questionnaire_mqs.id` | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "pq_mq_id", nullable = false)` | The parent MQ snapshot row. All MQTs in a tree share the same `pq_mq_id`. |
| `parent` | `parent_id` | FK → self (nullable) | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "parent_id")` | Null for top-level MQTs; set to the parent row's `id` for nested children. This is the closure column that makes the table a self-referencing tree. |
| `children` | *(self-join)* | `List<PublishedQuestionnaireMqt>` | `@OneToMany(mappedBy = "parent", cascade = ALL, orphanRemoval = true)` `@OrderBy("sortOrder ASC")` | Nested child MQTs. |
| `mqtId` | `mqt_id` | `String` (VARCHAR 64) | `@Column(name = "mqt_id", nullable = false, length = 64)` | Source `Mqt.id` at publish time. No FK for the same reason as `mqId` above. This id is the cross-reference key used by scoring rows in `published_questionnaire_question_option_scores` and `published_questionnaire_question_scores`. |
| `name` | `name` | `String` | | Snapshot of the MQT name. |
| `sortOrder` | `sort_order` | `int` | `@Column(name = "sort_order", nullable = false)` | |

---

#### Table: `published_questionnaire_questions` — snapshot question rows

Mapped to `@Entity @Table(name = "published_questionnaire_questions")` → `PublishedQuestionnaireQuestion.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(strategy = IDENTITY)` | Surrogate PK. |
| `questionnaire` | `questionnaire_id` | FK → `published_questionnaires.id` | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "questionnaire_id", nullable = false)` | |
| `snapshotQuestionId` | `snapshot_question_id` | `String` (VARCHAR 64) | `@Column(name = "snapshot_question_id", nullable = false, length = 64)` | The authoring-side question/item UUID at publish time. The respondent portal matches `assessment_answers.question_id` against this value to locate the correct scoring rows. |
| `stem` | `stem` | `String` | `@Column(columnDefinition = "text")` | Question text. |
| `format` | `format` | `String` (VARCHAR 32) | | e.g. `MCQ`, `FREETEXT`. |
| `mediaUrl` | `media_url` | `String` | `@Column(name = "media_url", columnDefinition = "text")` | |
| `mediaType` | `media_type` | `String` (VARCHAR 20) | `@Column(name = "media_type", length = 20)` | |
| `clinicalRiskFlag` | `clinical_risk_flag` | `boolean` | `@Column(name = "clinical_risk_flag", nullable = false)` | If true, the scoring engine may trigger a clinical-risk alert pathway. |
| `riskFlagRule` | `risk_flag_rule` | `String` | `@Column(name = "risk_flag_rule", columnDefinition = "text")` | Rule expression evaluated at score time. |
| `sectionId` | `section_id` | `String` (VARCHAR 64) | `@Column(name = "section_id", length = 64)` | Optional logical grouping. |
| `sectionTitle` | `section_title` | `String` | `@Column(name = "section_title")` | Display label for the section heading. |
| `sortOrder` | `sort_order` | `int` | `@Column(name = "sort_order", nullable = false)` | Position in the flat question list shown to the respondent. |
| `options` | *(child table)* | `List<PublishedQuestionnaireQuestionOption>` | `@OneToMany(mappedBy = "question", cascade = ALL, orphanRemoval = true)` `@OrderBy("sortOrder ASC")` | MCQ option snapshot rows. |
| `questionScores` | *(child table)* | `List<PublishedQuestionnaireQuestionScore>` | `@OneToMany(mappedBy = "question", cascade = ALL, orphanRemoval = true)` | Question-level MQT score credits (awarded regardless of which option the respondent picks). |

---

#### Table: `published_questionnaire_question_options` — snapshot MCQ options

Mapped to `@Entity @Table(name = "published_questionnaire_question_options")` → `PublishedQuestionnaireQuestionOption.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(strategy = IDENTITY)` | Surrogate PK. |
| `question` | `pq_question_id` | FK → `published_questionnaire_questions.id` | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "pq_question_id", nullable = false)` | |
| `sortOrder` | `sort_order` | `int` | `@Column(name = "sort_order", nullable = false)` | The option index the portal submits as `assessment_answers.option_index`. |
| `text` | `text` | `String` | `@Column(columnDefinition = "text")` | Option label. |
| `mediaUrl` | `media_url` | `String` | `@Column(name = "media_url", columnDefinition = "text")` | |
| `mediaType` | `media_type` | `String` (VARCHAR 20) | `@Column(name = "media_type", length = 20)` | |
| `scores` | *(child table)* | `List<PublishedQuestionnaireQuestionOptionScore>` | `@OneToMany(mappedBy = "option", cascade = ALL, orphanRemoval = true)` | Per-MQT score weights attached to this option choice. |

---

#### Table: `published_questionnaire_question_option_scores` — per-MQT weights on an MCQ option

Mapped to `@Entity @Table(name = "published_questionnaire_question_option_scores", uniqueConstraints = {@UniqueConstraint(name = "uniq_pq_option_mqt", columnNames = {"pq_option_id", "mqt_id"})})` → `PublishedQuestionnaireQuestionOptionScore.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(strategy = IDENTITY)` | |
| `option` | `pq_option_id` | FK → `published_questionnaire_question_options.id` | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "pq_option_id", nullable = false)` | |
| `mqtId` | `mqt_id` | `String` (VARCHAR 64) | `@Column(name = "mqt_id", nullable = false, length = 64)` | Cross-reference to `published_questionnaire_mqts.mqt_id`. No FK constraint — intentionally loose coupling to the snapshot tree, because the lookup at scoring time matches by string equality, not by surrogate PK. |
| `score` | `score` | `double` | `@Column(nullable = false)` | The numeric contribution added to the MQT's running total when this option is selected. |

---

#### Table: `published_questionnaire_question_scores` — question-level MQT credits

Mapped to `@Entity @Table(name = "published_questionnaire_question_scores", uniqueConstraints = {@UniqueConstraint(name = "uniq_pq_question_mqt", columnNames = {"pq_question_id", "mqt_id"})})` → `PublishedQuestionnaireQuestionScore.java`.

| Field | Column | Type | JPA Annotation | Notes |
|---|---|---|---|---|
| `id` | `id` | `Long` | `@Id @GeneratedValue(strategy = IDENTITY)` | |
| `question` | `pq_question_id` | FK → `published_questionnaire_questions.id` | `@ManyToOne(fetch = LAZY)` `@JoinColumn(name = "pq_question_id", nullable = false)` | |
| `mqtId` | `mqt_id` | `String` (VARCHAR 64) | `@Column(name = "mqt_id", nullable = false, length = 64)` | As above — loose string coupling to the MQT snapshot id. |
| `score` | `score` | `double` | `@Column(nullable = false)` | Credit awarded to this MQT simply for answering the question, independent of which option is chosen. Used in instruments where presence/absence of a response carries meaning (e.g. checklist-style items). |

---

### Scoring Model: Two Parallel Credit Paths

Every `published_questionnaire_questions` row can carry both kinds of score simultaneously:

- **Option-level scores** (`published_questionnaire_question_option_scores`): score is awarded based on *which* option the respondent selects. The scoring engine walks `assessment_answers.option_index` → `sort_order` → the matching `PublishedQuestionnaireQuestionOption` → `scores` for that option.
- **Question-level scores** (`published_questionnaire_question_scores`): a fixed credit added to one or more MQTs just for answering the question at all. Useful for mandatory presence scoring (e.g. "the item contributes 1.0 to Domain X regardless of answer choice").

Both paths reference MQTs by their `mqt_id` string values, cross-referencing the snapshot MQT tree rooted in `published_questionnaire_mqts`. The accumulated totals are persisted as `PortalSessionMqtScore` rows after the session completes.

---

### Key REST Endpoints

All endpoints in `QuestionnaireVersioningController` are mapped under `/api/v1/questionnaire-records`. The controller carries no explicit `@PreAuthorize` annotations — access control is applied at the Spring Security filter level (JWT bearer token required for all `/api/v1/**` paths).

| Method | Path | What it Does |
|---|---|---|
| `GET` | `/api/v1/questionnaire-records` | List all `Questionnaire` parents (Question Bank catalogue). Returns `List<QuestionnaireParentDto>` with version/draft counts but without the per-version content tree. Sorted newest-first. |
| `POST` | `/api/v1/questionnaire-records` | Create a new questionnaire family. Body: `QuestionnaireParentDto { name, vertical }`. Allocates a `Q-XXXXXXXX` parent id, writes an initial blank DRAFT (`V-XXXXXXXX`), records a `QUESTIONNAIRE_CREATED` audit event. |
| `GET` | `/api/v1/questionnaire-records/{id}` | Retrieve one parent with its full list of version summaries (both DRAFT and COMMITTED), sorted DRAFTs-first then COMMITTED descending by semver. |
| `PUT` | `/api/v1/questionnaire-records/{id}` | Update parent metadata (name, vertical). Only cached display fields — does not touch any version content. Records `QUESTIONNAIRE_UPDATED`. |
| `DELETE` | `/api/v1/questionnaire-records/{id}` | Delete a questionnaire family. **Guards:** iterates all version rows and calls `assessments.countByQuestionnaireVersionId(v.getId())`; throws `BadRequestException` if any version is pinned by one or more Assessments. When safe, deletes all versions (cascading to their child tables) then the parent. Records `QUESTIONNAIRE_DELETED`. |
| `PATCH` | `/api/v1/questionnaire-records/{id}/current-version` | Body: `{ "versionId": "V-XXXXXXXX" }`. Moves the parent's `current_version_id` pointer to a different COMMITTED version. Fails if the target version belongs to a different parent or is not COMMITTED. Records `VERSION_SET_CURRENT`. |
| `GET` | `/api/v1/questionnaire-records/{id}/audit` | Returns audit log entries for the parent, delegated to `AuditService.listForTarget("questionnaire", id)`. |
| `GET` | `/api/v1/questionnaire-records/{id}/versions` | List all versions of a parent. `?committedOnly=true` restricts to COMMITTED rows (used by the assessment-creation version picker). |
| `POST` | `/api/v1/questionnaire-records/{id}/versions/drafts` | Create a new DRAFT. Body (`CreateDraftRequest`): `branchedFromVersionId` (null = blank) + optional `initialName`. Triggers `cloneAsDraft()` or `newDraft()` as appropriate. Records `VERSION_DRAFT_BRANCHED` or `VERSION_DRAFT_CREATED`. |
| `GET` | `/api/v1/questionnaire-records/{id}/versions/{vid}` | Retrieve the full content of a specific version (MQs, MQTs, questions, options, scores) as a `QuestionnaireDto`. Delegates to `QuestionnairesService.get(vid)`. The parent `{id}` path segment is accepted for URL symmetry but ignored — version ids are globally unique. |
| `PATCH` | `/api/v1/questionnaire-records/{id}/versions/{vid}` | Edit a DRAFT's content. Body: `QuestionnaireDto`. Enforces `versionStatus == "DRAFT"` before delegating to `QuestionnairesService.upsert(dto)`. A COMMITTED version returns `400 Bad Request`. |
| `POST` | `/api/v1/questionnaire-records/{id}/versions/{vid}/commit` | Commit a draft to an immutable version. Body: `CommitVersionRequest { bump: "MAJOR"|"MINOR", versionName, versionComments, setAsCurrent: bool }`. Computes the next semver, seals the row, optionally promotes to current. Records `VERSION_COMMITTED` and optionally `VERSION_SET_CURRENT`. |
| `DELETE` | `/api/v1/questionnaire-records/{id}/versions/{vid}` | Discard (delete) a DRAFT. Throws `400` if the version is COMMITTED — "history is preserved forever". Records `DRAFT_DISCARDED`. |

---

### Service-Layer Business Logic

#### `QuestionnaireVersioningService` — the version lifecycle

`@Service @Transactional` at class level; read-only methods override to `@Transactional(readOnly = true)`.

**Creating a new questionnaire family (`createParent`)**

1. Validate `name` is non-blank.
2. Allocate a parent id: `"Q-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase()`.
3. Persist the `Questionnaire` parent row with `createdBy` = current actor from `SecurityContextHolder`.
4. Call `newDraft(parentId, null)` to build a blank `PublishedQuestionnaire` with `versionStatus = "DRAFT"`, `versionMajor = 0`, `versionMinor = 0`, `versionLabel = "draft"`, and a `"V-XXXXXXXX"` id.
5. Save the draft, record `QUESTIONNAIRE_CREATED` audit event, return a `QuestionnaireParentDto`.

**Creating a blank draft (`newDraft`)**

A private helper that allocates the `"V-XXXXXXXX"` id, sets `parentId`, copies `name` and `vertical` from an optional base row, and forces `versionStatus = "DRAFT"`. It does **not** persist the row — callers do.

**Branched draft (`cloneAsDraft`)**

When `CreateDraftRequest.branchedFromVersionId` is non-null:

1. Load the base `PublishedQuestionnaire` and validate it is COMMITTED and belongs to the requested parent.
2. Call `newDraft(parentId, base)` to get a skeleton row with `branchedFromVersionId = base.getId()` and all scalar metadata fields (shortName, category, description, duration, tier, languages, isDemo, disclaimer, instructions, showInstructions, demographicFieldKeys) copied from the base.
3. Save the skeleton shell immediately to obtain a stable surrogate id.
4. Call `content.get(base.getId())` to materialise a `QuestionnaireDto` from the base version's persisted child rows, then swap the `id` to the new draft's id and call `content.upsert(dto)`.
5. This round-trip through the DTO pipeline causes `QuestionnairesService` to build fresh `PublishedQuestionnaireMq` / `PublishedQuestionnaireMqt` / `PublishedQuestionnaireQuestion` / `PublishedQuestionnaireQuestionOption` / `PublishedQuestionnaireQuestionOptionScore` / `PublishedQuestionnaireQuestionScore` child rows owned by the new draft — preserving the base's content without sharing any JPA-managed entity instances across the two version rows.
6. Re-fetch the draft from the repository and return it.

**Editing a draft (`updateDraftContent`)**

1. Load the version row; throw `404` if absent.
2. Verify `versionStatus == "DRAFT"`. If the row is COMMITTED, return `400`.
3. Force `dto.setId(versionId)` so `QuestionnairesService.upsert()` lands on the correct row.
4. Delegate to `content.upsert(dto)`, which clears and rebuilds the child collections from the incoming JSON tree using orphanRemoval to handle deleted items.

**Committing a draft (`commitDraft`)**

1. Load and validate the version row is a DRAFT.
2. Validate `CommitVersionRequest.bump` is `"MAJOR"` or `"MINOR"` (case-insensitive after `.toUpperCase()`).
3. Fetch the parent `Questionnaire`.
4. Call `versions.findLatestCommittedByParent(parentId)` (ordered by `versionMajor DESC, versionMinor DESC`) and read the top element's `(versionMajor, versionMinor)` to compute `(nextMajor, nextMinor)`:
   - `MAJOR` bump: `nextMajor = lm + 1`, `nextMinor = 0`.
   - `MINOR` bump: `nextMajor = lm`, `nextMinor = ln + 1`.
   - If no committed versions exist yet, defaults to `(1, 0)`.
5. Set `versionMajor`, `versionMinor`, `versionLabel` (`"v{major}.{minor}"`), `versionName`, `versionComments`, `versionStatus = "COMMITTED"`, `committedAt = OffsetDateTime.now(ZoneOffset.UTC)`, `committedBy = currentActorId()`.
6. Save the version row.
7. Sync the parent's cached `name` and `vertical` if the committed version changed them.
8. If `setAsCurrent == true` OR if `parent.currentVersionId == null`, set `parent.currentVersionId = saved.getId()` and save the parent.
9. Record `VERSION_COMMITTED` audit event; record `VERSION_SET_CURRENT` if the pointer was moved.

**Discarding a draft (`discardDraft`)**

1. Load; return silently if not found (idempotent).
2. Throw `400` if `versionStatus` is not `"DRAFT"`.
3. Call `versions.delete(v)` — JPA cascade and `orphanRemoval = true` on all `@OneToMany` associations delete the MQ, MQT, question, option, and score child rows in the correct FK order.
4. Record `DRAFT_DISCARDED` audit event.

**Moving the current-version pointer (`setCurrentVersion`)**

Validates that the target version (a) exists, (b) belongs to the named parent, and (c) is COMMITTED. Updates `parent.currentVersionId`. Records `VERSION_SET_CURRENT`. Existing Assessments are not touched.

---

#### `QuestionnairesService` — snapshot content materialisation

This is the **content engine** that the versioning service delegates to for all structural reads and writes. It is `@Service @Transactional` and operates directly on `PublishedQuestionnaireRepository`.

**`upsert(QuestionnaireDto dto)`**

The core write path, used both by the legacy `/api/v1/questionnaires` controller (direct saves) and by the versioning service's `updateDraftContent` and `cloneAsDraft`:

1. Guard: if a row already exists for `dto.getId()` and its `versionStatus == "COMMITTED"`, throw `400`. This is the primary immutability enforcement point.
2. Deduplication: find and `repo.delete(entity)` any other rows whose name matches `dto.getName()` but whose id differs. Call `repo.flush()` to ensure cascaded child-row deletes complete before the upsert's INSERT, preventing FK constraint races in a single transaction.
3. Load or create the `PublishedQuestionnaire` root.
4. Copy all scalar fields from the DTO.
5. Call `applyMqsFromJson(q, dto.getMqs())`: clears `q.getMqs()`, then iterates the incoming JSON array. For each MQ node, creates a `PublishedQuestionnaireMq`, recurses into its `"mqts"` array via `buildMqt()` to create the full `PublishedQuestionnaireMqt` tree (preserving parent–child linkage via `parent` back-references and the `children` list), and adds each to `q.getMqs()`.
6. Call `applyQuestionsFromJson(q, dto.getQuestions())`: clears `q.getQuestions()`, then for each question JSON node creates a `PublishedQuestionnaireQuestion` with all its `PublishedQuestionnaireQuestionOption` children (each with their `PublishedQuestionnaireQuestionOptionScore` scores) and any `PublishedQuestionnaireQuestionScore` question-level scores.
7. `repo.save(q)` persists the root and cascades all child rows via the `CascadeType.ALL` + `orphanRemoval = true` on each `@OneToMany` collection.

**`toDto(PublishedQuestionnaire q)`** / **`get(String id)`**

The read path: load a `PublishedQuestionnaire` by id and convert to `QuestionnaireDto` by:
- Converting the `mqs` collection back to a JSON tree via `mqsToJson()` (recursing through `mqtToJson()`).
- Converting the `questions` collection via `questionsToJson()` (inlining options and both score arrays as nested JSON arrays).

This DTO is the same wire format consumed by the admin frontend editor and re-submitted as a draft edit body, creating a clean round-trip.

---

### Startup Migration Runners

Two `ApplicationRunner` / `CommandLineRunner` components handle the two generations of schema evolution. Both are idempotent.

#### `QuestionnaireVersioningMigrationRunner` — `@Order(10)`

**Purpose:** Backfills the two-table versioning model onto pre-migration data.

**Backfill 1 — `backfillParents()`:**
For every `PublishedQuestionnaire` row whose `parentId` is null or empty:
1. Create a new `Questionnaire` parent with id `"Q-" + UUID fragment`, copying `name` and `vertical` from the version.
2. Set `currentVersionId = v.getId()`.
3. Mark the version as `versionMajor=1`, `versionMinor=0`, `versionLabel="v1.0"`, `versionStatus="COMMITTED"`, `versionName="Initial version (migrated)"`, `versionComments="Auto-imported from the pre-versioning schema."`, `committedBy="system-migration"`, `committedAt = v.createdAt ?? now`.
4. Save both rows.

**Backfill 2 — `backfillAssessmentVersionIds()`:**
For every `Assessment` whose `questionnaireVersionId` is null, the old `questionnaireId` used to point directly at a `PublishedQuestionnaire` (now a version row). The migration:
1. Builds a `versionId → parentId` map in a single sweep of all `PublishedQuestionnaire` rows.
2. For each qualifying assessment: sets `questionnaireVersionId = oldQuestionnaireId` and `questionnaireId = parentId` (retargeting the FK to the parent family). This decouples "which questionnaire family does this assessment belong to" from "which specific snapshot version was it pinned to."

#### `JsonToTableMigrationRunner` — `@Order(1)`

**Purpose:** Migrates all legacy JSON column storage (from the original schema) into the normalized child tables introduced alongside the entity changes.

**Fast path:** A single `COUNT(*)` on `INFORMATION_SCHEMA.COLUMNS` checks whether all tracked legacy columns still exist. If none do, the runner exits immediately — adding no overhead to steady-state startups.

**Relevant published-questionnaire migrations:**
- `migratePublishedQuestionnaireMqs()`: reads `published_questionnaires.mqs` JSON (shape: `[{id, name, mqts: [{id, name, children: [...]}]}]`) and inserts rows into `published_questionnaire_mqs` and `published_questionnaire_mqts` via `insertSnapshotMqt()` (recursive), then nulls the source column.
- `migratePublishedQuestionnaireQuestions()`: reads `published_questionnaires.questions` JSON (shape: `[{id, stem, format, options: [{text, scores: [{mqt_id, score}]}], question_scores: [{mqt_id, score}], ...}]`) and inserts into `published_questionnaire_questions`, `published_questionnaire_question_options`, `published_questionnaire_question_option_scores`, and `published_questionnaire_question_scores`, then nulls the source column.
- `migrateStringListColumn("published_questionnaires", "languages", "published_questionnaire_languages", "questionnaire_id", "language")` and the equivalent for `demographic_field_keys`.
- After all column data is drained: `dropLegacyColumn("published_questionnaires", "mqs")`, `dropLegacyColumn("published_questionnaires", "questions")`, `dropLegacyColumn("published_questionnaires", "languages")`, `dropLegacyColumn("published_questionnaires", "demographic_field_keys")`. These `ALTER TABLE DROP COLUMN` calls are also idempotent via `columnExists()` checks.

---

### Key Repository Queries

`PublishedQuestionnaireRepository` extends `JpaRepository<PublishedQuestionnaire, String>` and provides:

| Method | JPQL / Notes |
|---|---|
| `findByParent(parentId)` | All versions for a parent, `ORDER BY versionMajor DESC, versionMinor DESC, committedAt DESC`. Includes both DRAFTs and COMMITTED. |
| `findCommittedByParent(parentId)` | COMMITTED only, same order. Used by the assessment-create version picker. |
| `findDraftsByParent(parentId)` | DRAFT only, `ORDER BY createdAt DESC`. Used by the drafts UI tab. |
| `findLatestCommittedByParent(parentId)` | COMMITTED only, ordered descending. `commitDraft()` takes `latest.get(0)` to derive the next semver increment. |
| `countCommittedByParent(parentId)` | `COUNT` query — used to populate `QuestionnaireParentDto.versionCount` without loading rows. |
| `countDraftsByParent(parentId)` | As above for `draftCount`. |
| `findAllSummariesOrderByCreated()` | Constructor-projection `QuestionnaireSummaryDto` using `SIZE(q.questions)` — a correlated `COUNT` over the join table — so the assessment-create dropdown never fetches question/option rows. |

`AssessmentRepository` provides:

```
@Query("SELECT COUNT(a) FROM Assessment a WHERE a.questionnaireVersionId = :vid")
long countByQuestionnaireVersionId(@Param("vid") String questionnaireVersionId);
```

This count appears in `QuestionnaireVersionSummaryDto.inUseByAssessmentCount` (read-side aggregate) and gates parent deletion in `deleteParent()`.

---

### Notable Design Decisions

**1. `PublishedQuestionnaire` IS the version row — there is no separate "version" table.**
The same `published_questionnaires` table that was the original flat store is now the multi-version store. Each row is either a `DRAFT` (mutable) or a `COMMITTED` (immutable) snapshot. The `Questionnaire` parent is a separate, lightweight table added on top. This avoids a disruptive table rename and keeps all the existing FK references from `assessments.questionnaire_version_id` pointing at the same physical table.

**2. Version status as a plain `VARCHAR` not a Java enum or DB enum.**
`versionStatus` is stored as a bare `VARCHAR(16)`. The code comment is explicit: "adding a new state (e.g. ARCHIVED) later doesn't need a migration." This is a deliberate trade-off of type safety at the DB layer for schema evolution flexibility.

**3. Soft foreign keys from snapshot tables to the authoring tree.**
`published_questionnaire_mqs.mq_id`, `published_questionnaire_mqts.mqt_id`, and all `*_option_scores` / `*_question_scores` `mqt_id` columns are plain `VARCHAR` with no `FOREIGN KEY` constraint to the live `measured_qualities` or `mqts` tables. This is intentional: the live authoring MQ/MQT tree can be modified, renamed, or deleted after publication without causing FK violations on historical snapshot rows. The scoring engine matches by string equality at query time.

**4. The content DTO is a JSON tree; `QuestionnairesService` is the single normalisation point.**
The admin frontend submits and receives the entire questionnaire content as a single `QuestionnaireDto` whose `mqs` and `questions` fields are Jackson `JsonNode` trees. `QuestionnairesService.applyMqsFromJson()` and `applyQuestionsFromJson()` translate these trees into JPA-managed child collections. The versioning service never directly manipulates child entities — it always calls through `content.upsert(dto)` or `content.get(id)`. This ensures the normalisation logic lives in one place.

**5. Clone-via-DTO-round-trip for `branchedFrom` drafts.**
`cloneAsDraft()` deliberately does not copy JPA entity instances from the base version to the draft. Instead it serialises the base to a `QuestionnaireDto` via `content.get()` and then materialises that DTO onto the new draft row via `content.upsert()`. This sidesteps Hibernate's "detached entity passed to persist" problem when re-attaching child rows that already have surrogate ids, at the cost of an extra SELECT + INSERT cycle.

**6. DDL file drift — the normalised child tables and the `questionnaires` table are not in `01-schema.sql`.**
The hand-written DDL in `docker/mysql-init/01-schema.sql` still defines only the original `published_questionnaires` table with its legacy JSON columns (which `JsonToTableMigrationRunner` will drop on first boot). The nine new tables (`questionnaires`, `published_questionnaire_mqs`, `published_questionnaire_mqts`, `published_questionnaire_questions`, `published_questionnaire_question_options`, `published_questionnaire_question_option_scores`, `published_questionnaire_question_scores`, `published_questionnaire_languages`, `published_questionnaire_demographic_keys`) are created exclusively by Hibernate `ddl-auto=update`. This means a clean Docker spin-up requires the application to start once before the schema is fully initialised — the `01-schema.sql` init script and Hibernate's auto-DDL run in sequence.

**7. Deletion is prevented when any version is pinned by an Assessment.**
`deleteParent()` calls `assessments.countByQuestionnaireVersionId(v.getId())` for every version of the family before touching anything. If any count is non-zero, a `BadRequestException` is thrown naming the version label and the count. Committed versions are also individually indestructible (only drafts can be discarded). This protects the referential integrity of all in-flight and historical respondent data.

**8. `current_version_id` is a non-cascading advisory pointer.**
Moving `questionnaires.current_version_id` via `setCurrentVersion()` affects only which version is pre-selected on the Assessment-create form. It has absolutely no effect on Assessments that already exist — they each carry their own `questionnaire_version_id` set at creation time and never updated.

---

### Connection to Other Subsystems

| Subsystem | Relationship |
|---|---|
| **Authoring (MeasuredQuality / Mqt / Item)** | The publish step reads from the live authoring tables (MQs, MQTs, Items/Questions) to build the JSON DTO payload, then calls `QuestionnairesService.upsert()` to freeze it. After publication, the snapshot has no live FK coupling to the authoring tables — changes to the live tree do not affect committed snapshots. |
| **Assessment creation** | `Assessment.questionnaireVersionId` is set at creation time to `Questionnaire.currentVersionId` (the COMMITTED version the admin has designated). All downstream portal logic — question rendering, option display, scoring — reads exclusively from the snapshot tables (`published_questionnaire_*`), never from the live authoring tree. |
| **Portal / Respondent session** | `PortalSession` holds an `assessment_id` and (by join) resolves the pinned `questionnaireVersionId`. The session scoring engine walks `published_questionnaire_questions` → `published_questionnaire_question_option_scores` (matching `option_index` to `sort_order`) + `published_questionnaire_question_scores` to compute `PortalSessionMqtScore` rows. The `snapshotQuestionId` on each question row is the key that links `assessment_answers.question_id` back to the correct score configuration. |
| **Audit log** | Every parent and version state transition (`QUESTIONNAIRE_CREATED`, `QUESTIONNAIRE_UPDATED`, `QUESTIONNAIRE_DELETED`, `VERSION_DRAFT_CREATED`, `VERSION_DRAFT_BRANCHED`, `VERSION_COMMITTED`, `VERSION_SET_CURRENT`, `DRAFT_DISCARDED`) is recorded by `AuditService.record()` with before/after snapshots. The `GET /questionnaire-records/{id}/audit` endpoint surfaces this history. |
| **Legacy `/api/v1/questionnaires` endpoint** | The existing flat CRUD endpoint (handled by a separate `QuestionnairesController`) still calls `QuestionnairesService.upsert()` directly. Because `upsert()` now guards against writing to a COMMITTED row, any legacy direct-save call against an already-committed version will receive a `400`. Legacy rows that have not yet been versioned (pre-migration data) are treated as COMMITTED by `QuestionnaireVersioningMigrationRunner` and are therefore also protected. |

---


## Assessments, Allotment, Tokens & Public Registration

### Purpose & Responsibilities

This subsystem is the bridge between authoring a questionnaire and a respondent actually sitting down to take it. It is responsible for four tightly coupled concerns:

1. **Assessment lifecycle** — A first-class `Assessment` record pins a specific immutable `PublishedQuestionnaire` snapshot to a named allotment event, owns status (`ACTIVE`/`CLOSED`/`PAUSED`), and is the shared key that ties portal sessions, allotment records, and tokens together.

2. **Three-dimensional allotment** — Who is allowed to take the assessment is recorded in three parallel join tables keyed on `(assessmentId, entityId|groupId|respondentId)`. Entity allotments additionally carry a per-pair session cap.

3. **Token issuance & redemption** — Opaque invite links (and their QR-code equivalents) are pre-minted and handed out to respondents. The public `/register` page resolves and consumes them without requiring the visitor to hold any existing credential.

4. **Public registration** — A single transactional call on the public surface creates or reuses a respondent, links them into an entity/group if the token is scoped, enforces the entity cap, creates the `PortalSession`, mints a RESPONDENT-scoped JWT, and returns everything the SPA needs to redirect straight into the assessment—all without admin involvement after the token is issued.

There is also a secondary, older concept of "portal sessions" exposed at `/api/v1/assessments` (via `AssessmentsController` / `AssessmentsService`) that treats each `PortalSession` as a first-class assessment row. This predates the `Assessment` entity; both surfaces coexist, with `assessmentId` on `PortalSession` being the forward reference to the newer `assessments` table.

---

### Domain Entities

#### `Assessment` — table `assessments`

| Field | Column | Type | JPA / notes |
|-------|--------|------|-------------|
| `id` | `id` | `String` | `@Id`; format `AS-{8-char UUID}` assigned at create time |
| `name` | `name` | `String` | Display name for the assessment |
| `questionnaireId` | `questionnaire_id` | `String` | `@Column(nullable=false)` FK into `published_questionnaires.id` — the questionnaire family anchor |
| `questionnaireVersionId` | `questionnaire_version_id` | `String(64)` | FK into `published_questionnaires.id` pinned at create-time; never mutated. Locks the content / scoring seen by all respondents of this assessment. |
| `questionnaireName` | `questionnaire_name` | `String` | Cached denormalization; copied from `PublishedQuestionnaire.name` at create time so list views do not need a join |
| `vertical` | `vertical` | `String` | Inherited from questionnaire unless overridden on update |
| `language` | `language` | `String` | Default `"English"` |
| `status` | `status` | `String(16)` | `@Column(nullable=false)`; values `ACTIVE`, `CLOSED`, `PAUSED`. Stored as a plain string (not a DB enum) so adding new states is migration-free |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` — DB-managed timestamp |
| `createdBy` | `created_by` | `String` | Actor user-id from the JWT principal at create time |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |

**Note:** The canonical DDL (`01-schema.sql`) does not include a `CREATE TABLE assessments` block. This table is created and migrated entirely by Hibernate's `ddl-auto=update` at startup. The four allotment tables and `assessment_tokens` are in the same situation.

---

#### `AssessmentEntityAllotment` — table `assessment_entity_allotments`

Composite PK via `@IdClass(AssessmentEntityAllotmentId.class)`.

| Field | Column | Type | JPA / notes |
|-------|--------|------|-------------|
| `assessmentId` | `assessment_id` | `String(64)` | `@Id` — part of composite PK |
| `entityId` | `entity_id` | `String(64)` | `@Id` — part of composite PK |
| `cap` | `cap` | `Integer` | Nullable; `null` = unlimited. Maximum `PortalSession` rows allowed for the `(assessmentId, entityId)` pair. Enforced in `AssessmentService.wouldExceedEntityCap()` before each new session |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |
| `createdBy` | `created_by` | `String` | Actor user-id |

`AssessmentEntityAllotmentId` is a plain `Serializable` POJO with `equals`/`hashCode` over `(assessmentId, entityId)`.

---

#### `AssessmentGroupAllotment` — table `assessment_group_allotments`

Composite PK via `@IdClass(AssessmentGroupAllotmentId.class)`.

| Field | Column | Type | JPA / notes |
|-------|--------|------|-------------|
| `assessmentId` | `assessment_id` | `String(64)` | `@Id` |
| `groupId` | `group_id` | `String(64)` | `@Id` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |
| `createdBy` | `created_by` | `String` | Actor user-id |

No cap column. Groups are designed to fan out to all their current members at session-creation time; session volume is bounded only by the group's membership, not by a static cap.

---

#### `AssessmentRespondentAllotment` — table `assessment_respondent_allotments`

Composite PK via `@IdClass(AssessmentRespondentAllotmentId.class)`.

| Field | Column | Type | JPA / notes |
|-------|--------|------|-------------|
| `assessmentId` | `assessment_id` | `String(64)` | `@Id` |
| `respondentId` | `respondent_id` | `String(64)` | `@Id` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |
| `createdBy` | `created_by` | `String` | Actor user-id |

No cap. One row = one respondent's eligibility for that assessment. There is no system-level constraint preventing the same respondent from having multiple portal sessions under the same assessment; the allotment row is purely an eligibility record, not a session count constraint.

---

#### `AssessmentToken` — table `assessment_tokens`

The PK is the token string itself, not a surrogate key.

| Field | Column | Type | JPA / notes |
|-------|--------|------|-------------|
| `token` | `token` | `String(64)` | `@Id`; generated as 32 cryptographically random bytes, Base64-URL encoded without padding, via `java.security.SecureRandom` |
| `assessmentId` | `assessment_id` | `String(64)` | `@Column(nullable=false)` |
| `entityId` | `entity_id` | `String(64)` | Nullable; scopes the registration to this entity |
| `groupId` | `group_id` | `String(64)` | Nullable; scopes the registration to this group |
| `respondentId` | `respondent_id` | `String(64)` | Nullable; pre-binds the token to a specific existing respondent (targeted resend path) |
| `maxUses` | `max_uses` | `Integer` | Nullable = unlimited. Typical individual invite uses `maxUses=1` |
| `usedCount` | `used_count` | `int` | `@Column(nullable=false)` default `0`; incremented atomically in the registration transaction |
| `expiresAt` | `expires_at` | `OffsetDateTime` | Optional hard expiry; checked on both resolve and consume |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` |
| `createdBy` | `created_by` | `String` | Actor user-id |
| `qrCode` | `qr_code` | `byte[]` | `@Lob @Column(columnDefinition="LONGBLOB")`; stores the 512×512 PNG generated once by `QrCodeService` and persisted to avoid regeneration on every download |

---

#### `AssessmentAnswer` — table `assessment_answers`

| Field | Column | Type | JPA / notes |
|-------|--------|------|-------------|
| `id` | `id` | `Long` | `@Id @GeneratedValue(IDENTITY)` surrogate key |
| `session` | `session_id` | `PortalSession` | `@ManyToOne(fetch=LAZY) @JoinColumn(nullable=false)` |
| `questionId` | `question_id` | `String(64)` | `@Column(nullable=false)` |
| `optionIndex` | `option_index` | `Integer` | Populated for MCQ answers |
| `freeText` | `free_text` | `String` | `@Column(columnDefinition="text")` populated for open-ended answers |

Table-level: `@UniqueConstraint(name="uniq_answer_session_question", columnNames={"session_id","question_id"})` — exactly one answer row per (session, question). Exactly one of `optionIndex` / `freeText` should be non-null per row; the constraint is enforced by application convention, not a DB check constraint.

---

#### `PortalSession` — table `portal_sessions`

This is the central session entity. Key fields relevant to this subsystem:

| Field | Column | Type | Notes |
|-------|--------|------|-------|
| `id` | `id` | `String` | `@Id`; format `SESS-{8-char UUID}` when created via the public registration path |
| `assessmentId` | `assessment_id` | `String(64)` | FK back to `assessments.id`; nullable on legacy rows pre-dating the `Assessment` entity |
| `entityId` | `entity_id` | `String` | Populated when the session was created through an entity allotment; drives per-entity cap counting via `countByAssessmentIdAndEntityId` |
| `entityName` | `entity_name` | `String` | Denormalized display copy |
| `answers` | — | `List<AssessmentAnswer>` | `@OneToMany(mappedBy="session", cascade=ALL, orphanRemoval=true)` — child rows in `assessment_answers` |
| `mqtScores` | — | `List<PortalSessionMqtScore>` | `@OneToMany(cascade=ALL, orphanRemoval=true)` — per-MQT score rows |
| `demographics` | — | `List<PortalSessionDemographic>` | `@OneToMany(cascade=ALL, orphanRemoval=true)` |
| `startedAt` | `started_at` | `OffsetDateTime` | Stamped on the first `update()` call that carries at least one non-empty answer value |
| `completedAt` | `completed_at` | `OffsetDateTime` | Stamped when `status` transitions to `"Completed"` |
| `showQuestionIndex` | `show_question_index` | `boolean` | Per-session override; added via idempotent `ALTER TABLE` in `01-schema.sql` |

---

### REST Endpoints

All endpoints at `/api/v1/assessment-records/**`, `/api/v1/assessments/**`, and `/api/v1/assessment-tokens/**` require a valid JWT (`anyRequest().authenticated()`). The `/api/v1/public/tokens/**` prefix is fully `permitAll()` in `SecurityConfig`.

#### `AssessmentController` — `/api/v1/assessment-records`

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| `GET` | `/api/v1/assessment-records` | Required | List all `Assessment` rows ordered by `createdAt DESC`. Each row includes denormalized counts: `entityCount`, `groupCount`, `respondentCount`, `sessionsCount`, `completedCount`. |
| `GET` | `/api/v1/assessment-records/{id}` | Required | Single `Assessment` by id with the same counts. |
| `POST` | `/api/v1/assessment-records` | Required | Create an `Assessment` and optionally seed its initial allotments in one shot (body carries `entityAllotments[]`, `groupAllotments[]`, `respondentAllotments[]`). Returns HTTP 201. |
| `PUT` | `/api/v1/assessment-records/{id}` | Required | Update `name`, `language`, `vertical`. Questionnaire binding is immutable after creation. |
| `PATCH` | `/api/v1/assessment-records/{id}/status` | Required | Reversible status transition. Body: `{"status":"ACTIVE\|CLOSED\|PAUSED"}`. Audited as `ASSESSMENT_STATUS_CHANGED`. |
| `DELETE` | `/api/v1/assessment-records/{id}` | Required | Removes allotment rows for all three dimensions first (no FK cascades are wired), then deletes the `Assessment`. Audited as `ASSESSMENT_DELETED`. |
| `GET` | `/api/v1/assessment-records/{id}/audit` | Required | Returns the audit log for this assessment (delegates to `AuditService.listForTarget("assessment", id)`). |

**Note on the path name:** The controller explicitly uses `/assessment-records` to avoid colliding with the legacy `/assessments` path, which remains in service for the older per-session view. The inline comment in `AssessmentController` documents this as a transitional name pending a frontend refactor.

---

#### `AssessmentsController` — `/api/v1/assessments`

This controller operates on `PortalSession` rows (surfacing them as "assessments" for the dashboard), not the newer `Assessment` entity.

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| `GET` | `/api/v1/assessments` | Required | List all `PortalSession` rows as `AssessmentSessionDto`. Optionally filtered by `?respondentId=`. Full payload (answers, mqtScores, demographics) included. |
| `GET` | `/api/v1/assessments/summaries` | Required | Lightweight projection (`AssessmentSummaryDto`) — id, name, respondentName, instrument, vertical, status, score, timestamps only. Optional `?respondentId=` and `?limit=` params. Uses a JPQL `SELECT new` constructor query to avoid loading child collections. |
| `GET` | `/api/v1/assessments/groups` | Required | One row per `assessmentId` with aggregate `totalCount`, `completedCount`, `activeCount`, `pendingReviewCount`. Drives the grouped All Assessments table. |
| `GET` | `/api/v1/assessments/by-assessment` | Required | Slim summary list filtered to `?assessmentId=` — drives the respondents tab on the assessment detail page. |
| `GET` | `/api/v1/assessments/{id}` | Required | Full single `PortalSession` by id. |
| `POST` | `/api/v1/assessments` | Required | Create a single `PortalSession`. Idempotent: if a session with the given id already exists, returns the existing row. Required fields: `id`, `respondentId`, `instrument`. |
| `POST` | `/api/v1/assessments/bulk` | Required | Create multiple `PortalSession` rows in one request. Per-row errors are collected and returned without aborting the remaining rows (`BulkAssessmentResponse`). |
| `PUT` | `/api/v1/assessments/{id}` | Required | Update a session. Stamps `startedAt` on the first call that carries non-empty answers. Stamps `completedAt` and clears the Redis heartbeat key when `status=Completed`. |
| `DELETE` | `/api/v1/assessments/{id}` | Required | Delete a `PortalSession`. |
| `POST` | `/api/v1/assessments/{id}/heartbeat` | Required (RESPONDENT JWT) | Record a Redis heartbeat for the in-progress session. Ownership check: the JWT principal's id must equal `session.respondentId`. Rejects if status is `Completed`. |

---

#### `AssessmentAllotmentsController` — `/api/v1/assessment-records/{assessmentId}/allotments`

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| `GET` | `…/allotments` | Required | Returns `AssessmentAllotteesDto` with all three allotee lists in one response. Entity rows include live `sessionsCount`. |
| `POST` | `…/allotments/entities` | Required | Add an entity allotment with optional cap. Validates entity exists and is active. Returns HTTP 201. |
| `PATCH` | `…/allotments/entities/{entityId}` | Required | Update just the `cap` on an existing entity allotment. Audited as `ALLOTMENT_CAP_CHANGED`. |
| `DELETE` | `…/allotments/entities/{entityId}` | Required | Remove entity allotment (idempotent). |
| `POST` | `…/allotments/groups` | Required | Add a group allotment (idempotent). Returns HTTP 201. |
| `DELETE` | `…/allotments/groups/{groupId}` | Required | Remove group allotment (idempotent). |
| `POST` | `…/allotments/respondents` | Required | Add individual respondent allotment (idempotent). Returns HTTP 201. |
| `DELETE` | `…/allotments/respondents/{respondentId}` | Required | Remove respondent allotment (idempotent). |

---

#### `AssessmentTokensController` — `/api/v1/assessment-tokens`

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| `POST` | `/api/v1/assessment-tokens` | Required | Issue a token (get-or-create semantics for scoped tokens). |
| `GET` | `/api/v1/assessment-tokens/by-assessment/{assessmentId}` | Required | List all tokens for an assessment, ordered newest first. |
| `DELETE` | `/api/v1/assessment-tokens/{token}` | Required | Revoke (hard-delete) a token. Audited as `TOKEN_REVOKED`. |

---

#### `PublicTokensController` — `/api/v1/public/tokens`

All endpoints under this prefix are `permitAll()` — they are reachable by anonymous browsers.

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| `GET` | `/api/v1/public/tokens/{token}` | None | Resolve: validate token (not expired, not at maxUses), enrich with `assessmentName`, `entityName`, `groupName` display labels. Read-only — does not increment `usedCount`. |
| `POST` | `/api/v1/public/tokens/{token}/consume` | None | Increment `usedCount`. Used by legacy flows that handle respondent creation separately; superseded by `/register` in the current implementation. |
| `GET` | `/api/v1/public/tokens/{token}/qr` | None | Returns a 512×512 PNG of the QR code. Generates it once via ZXing, persists to `assessment_tokens.qr_code` (LONGBLOB), and streams the stored bytes on subsequent calls. Accepts `?base=` to override the frontend origin encoded in the URL (supports dev/staging without a config change). |
| `POST` | `/api/v1/public/tokens/registration-check` | None | Pre-flight duplicate check before the registration form is submitted. Returns `{"exists": true/false}`. Matches on `(email OR phone OR companyId) AND dob` against the `respondents` table. |
| `POST` | `/api/v1/public/tokens/{token}/register` | None | Single-call full registration (see flow below). Returns `{sessionId, respondentId, assessmentId, token}`. |

---

### Service-Layer Business Logic

#### `AssessmentService` — Core Assessment CRUD

**Create flow (`create`):**

1. Validates `name` and `questionnaireId` are present.
2. Looks up the `PublishedQuestionnaire` — throws `BadRequestException` if not found.
3. Assigns id as `AS-{8-char UUID uppercase}` unless a specific id was provided in the DTO.
4. Copies `questionnaireName`, `vertical`, `language` from the questionnaire (overrideable from the DTO).
5. Persists the `Assessment` row.
6. Iterates `dto.entityAllotments`, `dto.groupAllotments`, `dto.respondentAllotments` and persists join rows inline, in the same transaction.
7. Calls `AuditService.record("ASSESSMENT_CREATED", ...)`.
8. Returns a DTO with aggregate counts derived from the three allotment repositories and `PortalSessionRepository`.

**Status transition (`updateStatus`):**

The service accepts any of `ACTIVE`, `CLOSED`, `PAUSED` (case-insensitive, normalised to uppercase). No-op if the target equals the current status. Previous status is captured as a before-snapshot in the audit log. Status semantics are enforced at the portal layer (session creation) and not by a DB-level constraint.

**Cap enforcement (`wouldExceedEntityCap`):**

Called by `PublicRegistrationService` before creating a session from an entity-scoped token. Loads the `AssessmentEntityAllotment` row; if `cap` is null, returns `false` (unlimited). Otherwise compares `PortalSessionRepository.countByAssessmentIdAndEntityId(assessmentId, entityId) + delta > cap`. The check is read-only (annotated `@Transactional(readOnly=true)`) and occurs inside the registration transaction.

**Delete flow:**

No FK cascade constraints exist between `assessments` and the three allotment tables. The service manually fetches and deletes each allotment set before deleting the root row.

---

#### `AssessmentsService` — PortalSession CRUD

Operates on `PortalSession` entities. Key behaviours:

**Answer persistence:** On every `update()` call the existing `assessment_answers` child rows are cleared (`s.getAnswers().clear()`) and rebuilt from the incoming `Map<String, Object>`. `orphanRemoval=true` on the `@OneToMany` means cleared rows are deleted by Hibernate. Numeric values go into `optionIndex`; anything else goes into `freeText`. The same pattern applies to `mqtScores` and `demographics`.

**`startedAt` stamping:** If `startedAt` is still null and the incoming answers map contains at least one non-null, non-blank value, the service stamps `startedAt = OffsetDateTime.now(UTC)` before saving.

**Heartbeat integration:** On status transition to `"Completed"`, the service calls `HeartbeatService.clear(id)` to evict the Redis key so the live-tracking dashboard stops showing a completed session as in-progress.

**Bulk create:** `bulkCreate()` processes rows sequentially inside one outer transaction. Per-row failures are caught, logged, and collected into `BulkAssessmentError` entries rather than aborting the batch. Idempotency check: if a session with the requested id already exists, the row is skipped and an error is added.

---

#### `AssessmentAllotmentsService` — Allotment CRUD

All three allotment add/remove operations are idempotent: `addEntity`/`addGroup`/`addRespondent` return the existing row if it is already present. `removeEntity`/`removeGroup`/`removeRespondent` silently succeed if the row does not exist.

**Entity-specific validation in `addEntity`:**

1. Verifies the entity exists in `EntityRegistrationRepository`.
2. Checks `EntityRegistration.isActive()` — throws `BadRequestException` if the entity is inactive. An active entity is a precondition for allotment.
3. Validates `cap >= 0` if supplied.
4. Upserts the allotment row (create or update), auditing `ALLOTMENT_ENTITY_ADDED` vs `ALLOTMENT_ENTITY_UPDATED`.

The `toEntityDto` mapper enriches the DTO with a `sessionsCount` from `PortalSessionRepository.countByAssessmentIdAndEntityId`. It prefers `EntityRegistration.companyName` over `EntityRegistration.name` as the display label, falling back to `name` for legacy rows that pre-date the `companyName` field.

---

#### `AssessmentTokenService` — Token Issuance & QR

**Issue (get-or-create):**

1. Validates `assessmentId` exists.
2. If the request carries any scope id (`entityId`, `groupId`, or `respondentId`), calls `AssessmentTokenRepository.findByScope(...)` — a null-safe JPQL query that matches each scope dimension as "(param is null AND column is null) OR column = param". Returns the first result where `isLive(token)` is true (not expired, `usedCount < maxUses` if bounded).
3. If no reusable token is found, generates a new 32-byte random token, persists it, and audits `TOKEN_ISSUED`.
4. Unscoped tokens (no entity, group, or respondent id) always create a new row — collapsing anonymous open links would incorrectly share a single cap counter.

**Resolve (public, read-only):**

Rejects on expiry or exhaustion before returning. Enriches the DTO with `assessmentName`, `entityName`, `groupName` using `assessments`, `entities`, and `groups` repositories respectively so the anonymous `/register` page can display context without hitting auth-gated endpoints.

**QR code generation (`qrPng`):**

`QrCodeService.pngForText` wraps ZXing's `QRCodeWriter` at 512×512 pixels with error correction level M, margin 1, UTF-8 encoding. The encoded string is `{base}/register?token={token}`. The PNG bytes are stored back to `assessment_tokens.qr_code` (LONGBLOB) on first generation; subsequent calls stream the stored bytes directly. The `base` URL can be overridden per-request via `?base=` so that development, staging, and production frontends all encode the correct origin.

---

#### `PublicRegistrationService` — Atomic Public Registration

The entire `register()` method runs in a single `@Transactional` unit. Step-by-step:

1. **Token validation** — Loads token by PK; throws `BadRequestException` on expiry or `usedCount >= maxUses`.
2. **Assessment load** — Loads the `Assessment` referenced by `token.assessmentId`.
3. **Respondent resolution:**
   - If `token.respondentId` is set, that existing respondent is used directly (targeted resend path; no duplicate check needed).
   - Otherwise, calls `isExistingRegistrant(req)` which queries `RespondentRepository.findDuplicates(email, phone, companyId, dob)`. A match on `(email OR phone OR companyId) AND dob` throws `DuplicateResourceException` ("log in" prompt rather than creating a second account).
   - New respondents are assigned id `R-{8-char UUID uppercase}`, status `"individual"`, consent `"Pending"`.
4. **Entity membership** — If `token.entityId` is set, loads `EntityRegistration` and adds the respondentId to `entityRegistration.memberIds` (a JSON-backed `Set<String>` in Hibernate) if not already present. Then calls `AssessmentService.wouldExceedEntityCap()` — throws `BadRequestException` if the cap would be exceeded before the session is created.
5. **Group membership** — If `token.groupId` is set, loads `RespondentGroup` and idempotently adds the respondentId to `group.memberIds`.
6. **Identity upsert** — Calls `upsertUser()` to mirror the registrant into `app_users` / `user_meta`. If the email is already owned by another `User` row, the upsert is silently skipped (preserves existing identity without failing the registration). On return visits the entity link is added to `User.entityIds`.
7. **Session creation** — Creates a `PortalSession` with status `"Active"`, score `"--"`, `assessmentId` from the token, `entityId`/`entityName` from the token scope. Id format `SESS-{8-char UUID uppercase}`.
8. **Token consumption** — Increments `token.usedCount` and saves.
9. **JWT issuance** — Calls `TokenProvider.createToken(respondentId, email, UserType.RESPONDENT, [])` to mint a RESPONDENT-scoped JWT so the SPA can redirect to `/portal/take` without a second login step.
10. Returns `PublicRegistrationDto.Result(sessionId, respondentId, assessmentId, authToken)`.

---

### Repository Notes

| Repository | Entity | Notable queries |
|-----------|--------|-----------------|
| `AssessmentRepository` | `Assessment` | `findAllOrderByCreated()` — JPQL `ORDER BY a.createdAt DESC`; `countByQuestionnaireVersionId(vid)` — used by the version detail UI to block deletion of a `PublishedQuestionnaire` version that is referenced by live assessments |
| `AssessmentEntityAllotmentRepository` | `AssessmentEntityAllotment` | PK type `AssessmentEntityAllotmentId`; `findByAssessmentId`, `findByEntityId` (for reverse lookup) |
| `AssessmentGroupAllotmentRepository` | `AssessmentGroupAllotment` | PK type `AssessmentGroupAllotmentId`; `findByAssessmentId` |
| `AssessmentRespondentAllotmentRepository` | `AssessmentRespondentAllotment` | PK type `AssessmentRespondentAllotmentId`; `findByAssessmentId` |
| `AssessmentTokenRepository` | `AssessmentToken` | `findByScope(aid, eid, gid, rid)` — null-safe JPQL matching each scope dimension; `findByAssessmentId(aid)` ordered newest-first |
| `PortalSessionRepository` | `PortalSession` | `countByAssessmentIdAndEntityId` — drives cap enforcement; `findAssessmentGroups()` — aggregate JPQL grouping sessions by `assessmentId`; `findSummariesByAssessmentId` — slim `SELECT new AssessmentSummaryDto(...)` projection for the respondents tab |

---

### Notable Design Decisions

**Dual controller surface (`AssessmentController` vs `AssessmentsController`):**  
The system has two separate paths — `/api/v1/assessment-records` (new, operates on `Assessment`) and `/api/v1/assessments` (legacy, operates on `PortalSession`). The legacy path predates the `Assessment` entity; the `assessmentId` column on `portal_sessions` is the forward reference. The two surfaces coexist with the inline comment "Frontend will adopt this prefix during the refactor" in `AssessmentController`. Engineers must be careful: `AssessmentService` != `AssessmentsService`; they operate on different entity types.

**`@IdClass` composite keys instead of `@EmbeddedId`:**  
All three allotment join tables use `@IdClass` with a separate plain `Serializable` POJO. This approach keeps the entity fields flat (no embedded wrapper) but requires the PK class to be manually constructed for `findById` and `deleteById` calls, as seen throughout `AssessmentAllotmentsService` and `AssessmentService.delete()`.

**Token as its own primary key:**  
`AssessmentToken.token` is the table's PK (a 43-character Base64-URL string). This means `findById`, `existsById`, and `deleteById` on `AssessmentTokenRepository` operate directly on the opaque token string. No surrogate key exists; the opaque string is both the public identifier and the DB row locator.

**QR code stored in the DB (LONGBLOB):**  
The "generate once, save in DB" requirement is implemented by a check-before-generate pattern in `AssessmentTokenService.qrPng()`. If `token.qrCode != null && token.qrCode.length > 0`, the stored bytes are returned directly; otherwise ZXing generates and the result is immediately persisted. This avoids repeated CPU-bound QR generation at the cost of storing binary data in MySQL. There is no separate cache layer for QR blobs.

**Idempotent token issue:**  
`AssessmentTokenService.issue()` is get-or-create for scoped tokens: a second click on "Copy Link" for the same entity returns the existing live token. Liveness is checked as "not expired AND (maxUses is null OR usedCount < maxUses)". Unscoped (anonymous) tokens are always minted fresh to avoid sharing a single cap counter across independent open-link registrations.

**`portal_sessions` schema drift:**  
The canonical DDL in `01-schema.sql` does not define `assessment_id`, `entity_id`, `entity_name`, or `assessment_answers`/`assessment_entity_allotments`/`assessment_group_allotments`/`assessment_respondent_allotments`/`assessment_tokens` tables at all. These were added after the initial schema was written; they exist only because `spring.jpa.hibernate.ddl-auto=update` creates and alters them at startup. The DDL file is therefore incomplete as a standalone schema reference for the assessment subsystem.

**No FK constraints between allotment tables and `assessments`:**  
As documented in `AssessmentService.delete()`: "we don't have FK cascades wired between assessments and the three allotment tables yet." Deletes are handled in application code by manually fetching and deleting allotment rows before the parent row. This is a known structural gap.

**Legacy answer storage:**  
`portal_sessions` still has `answers`, `mqt_scores`, and `demographics` JSON columns in the DDL. The migration runner (`JsonToTableMigrationRunner`) migrated existing JSON blob data into the normalized `assessment_answers`, `portal_session_mqt_scores`, and `portal_session_demographics` child tables. The `AssessmentsService.applyAnswersFromMap()` and matching flatten methods now write/read exclusively against the child tables via the `@OneToMany` collections. The JSON columns on `portal_sessions` are dead but not dropped.

---

### Connections to Other Subsystems

- **Questionnaire authoring** — `Assessment.questionnaireId` and `Assessment.questionnaireVersionId` are FKs into `published_questionnaires`. `AssessmentRepository.countByQuestionnaireVersionId()` is the gate that prevents deletion of a version still referenced by live assessments.

- **Respondents & Entities** — `AssessmentAllotmentsService` validates `EntityRegistration.isActive()` before adding an entity allotment. `PublicRegistrationService` writes to both `respondents` and `entity_registrations.member_ids` (JSON array) and mirrors into `app_users` / `user_meta` for unified authentication. The `portal_sessions.entity_id` column is the runtime linkage used for cap counting.

- **Portal sessions & take flow** — `PortalSession` is the runtime vehicle for an in-progress assessment. `PublicRegistrationService` creates the session; the take-assessment SPA writes answers back through `PUT /api/v1/assessments/{id}` and sends heartbeats through `POST /api/v1/assessments/{id}/heartbeat`.

- **Redis heartbeat** — `AssessmentsService.recordHeartbeat()` delegates to `HeartbeatService`, which writes a JSON payload to Redis key `heartbeat:{sessionId}` with TTL 30 seconds (configurable via `app.heartbeat.ttl-seconds`). On completion, `AssessmentsService.update()` calls `HeartbeatService.clear(id)` to evict the key. The idle threshold (15 seconds, `app.heartbeat.idle-threshold-seconds`) is used by the live-tracking dashboard to distinguish actively in-progress sessions from dropped ones.

- **Audit trail** — `AssessmentService` and `AssessmentAllotmentsService` both inject `AuditService` and call `audit.record()` for every state-mutating operation. Audit events include: `ASSESSMENT_CREATED`, `ASSESSMENT_UPDATED`, `ASSESSMENT_STATUS_CHANGED`, `ASSESSMENT_DELETED`, `ALLOTMENT_ENTITY_ADDED`, `ALLOTMENT_ENTITY_UPDATED`, `ALLOTMENT_ENTITY_REMOVED`, `ALLOTMENT_CAP_CHANGED`, `ALLOTMENT_GROUP_ADDED`, `ALLOTMENT_GROUP_REMOVED`, `ALLOTMENT_RESPONDENT_ADDED`, `ALLOTMENT_RESPONDENT_REMOVED`, `TOKEN_ISSUED`, `TOKEN_REVOKED`. These are surfaced to the admin at `GET /api/v1/assessment-records/{id}/audit`.

- **Security / authentication** — The `PublicRegistrationService.register()` method calls `TokenProvider.createToken()` at the end to mint a RESPONDENT-scoped JWT, tying the new registrant's identity directly into the JWT security layer used by all other authenticated endpoints. The `@CurrentUser UserPrincipal` injection in `AssessmentsController.heartbeat()` is the only ownership check in this subsystem; all other endpoints rely solely on authentication being present.

---


## Portal Sessions, Demographics, Score Persistence, Live Tracking, Dataset, Audit & Uploads

### Purpose and Responsibilities

This subsystem is the operational core of the respondent-facing BodhAssess platform. It covers every phase of the assessment lifecycle from the moment a respondent follows an invite link through to score persistence, practitioner reporting, and immutable audit trail. Concretely, this subsystem is responsible for:

- **Session lifecycle management** — creation at registration time, status transitions (`Active` → `Completed`), and association to an Assessment, Respondent, Entity, and/or Group.
- **Demographic capture** — persisting pre-assessment field answers that qualify each session for segmentation and filtering.
- **Answer storage** — per-question responses for MCQ (option index) and free-text items, stored as normalized child rows rather than JSON blobs.
- **Score persistence** — per-MQT (Measured Quality Trait) numeric scores stored as normalized child rows so reports can filter and aggregate on individual traits.
- **Live tracking** — a Redis heartbeat mechanism that lets administrators observe which respondents are actively taking an assessment in real time, and at what question index they currently are.
- **Dataset / reporting API** — a self-describing grid API that surfaces flat session rows with dynamic score and demographic columns; supports batched, audited cell edits.
- **Audit logging** — an append-only trail of all admin-initiated mutations to entities, assessments, allotments, and dataset cells.
- **File uploads** — accepting practitioner-submitted media files (images, audio, video) for item stems and options, stored on the local filesystem.
- **Infrastructure health** — a readiness probe endpoint used by load-balancers and monitoring.

---

### Entity Reference

#### `PortalSession` — table `portal_sessions`

`@Entity @Table(name = "portal_sessions")` — the central session entity. The `id` is a practitioner-readable string generated by `PublicRegistrationService` in the format `SESS-{UUID_PREFIX}`.

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `String` | `@Id` | Caller-assigned; format `SESS-XXXXXXXX` |
| `assessmentId` | `assessment_id` | `String` | `@Column(length=64)` | FK-by-convention to `assessments.id`; groups all sessions from one allotment batch; nullable for pre-feature rows |
| `name` | `name` | `String` | `@Column` | Denormalized copy of `Assessment.name` at session-creation time |
| `respondentId` | `respondent_id` | `String` | `@Column` | FK-by-convention to `respondents.id` |
| `respondentName` | `respondent_name` | `String` | `@Column` | Denormalized; editable via Dataset API |
| `respondentEmail` | `respondent_email` | `String` | `@Column` | Denormalized; editable via Dataset API |
| `instrument` | `instrument` | `String` | `@Column` | Short instrument code; used as grouping key by live tracking |
| `instrumentFullName` | `instrument_full_name` | `String` | `@Column` | Display name; preferred over `instrument` in Dataset rows |
| `vertical` | `vertical` | `String` | `@Column` | Copied from Assessment at creation |
| `language` | `language` | `String` | `@Column` | Defaults to `"English"` |
| `status` | `status` | `String` | `@Column` | Lifecycle value: `"Active"` or `"Completed"` |
| `score` | `score` | `String` | `@Column` | Human-readable overall score string; initialized to `"--"` |
| `answers` | _(child table)_ | `List<AssessmentAnswer>` | `@OneToMany(mappedBy="session", cascade=ALL, orphanRemoval=true)` | One row per (session, question); replaced legacy `answers` JSON column |
| `mqtScores` | _(child table)_ | `List<PortalSessionMqtScore>` | `@OneToMany(mappedBy="session", cascade=ALL, orphanRemoval=true)` | Per-MQT score rows; replaced legacy `mqt_scores` JSON column |
| `demographics` | _(child table)_ | `List<PortalSessionDemographic>` | `@OneToMany(mappedBy="session", cascade=ALL, orphanRemoval=true)` | Per-field demographic answers; replaced legacy `demographics` JSON column |
| `groupId` | `group_id` | `String` | `@Column` | FK-by-convention to `respondent_groups.id` |
| `groupName` | `group_name` | `String` | `@Column` | Denormalized group label |
| `entityId` | `entity_id` | `String` | `@Column` | Set when created via entity allotment; drives cap enforcement |
| `entityName` | `entity_name` | `String` | `@Column` | Denormalized organisation label |
| `consentId` | `consent_id` | `String` | `@Column` | Optional reference to a consent record |
| `proctoring` | `proctoring` | `boolean` | `@Column` | Whether proctoring is enabled for this session |
| `invitationSent` | `invitation_sent` | `boolean` | `@Column` | Whether an invitation email has been dispatched |
| `showQuestionIndex` | `show_question_index` | `boolean` | `@Column(nullable=false)` | Per-session toggle: shows numbered question panel in the assessment portal; defaults `false` |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB-managed timestamp; `CURRENT_TIMESTAMP` default |
| `updatedAt` | `updated_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB-managed; `ON UPDATE CURRENT_TIMESTAMP`; used as optimistic concurrency token in Dataset edits |
| `completedAt` | `completed_at` | `OffsetDateTime` | `@Column` | Set when session is submitted |
| `startedAt` | `started_at` | `OffsetDateTime` | `@Column` | Set on first answer submission; drives 24h/48h overdue notifications |

The DDL in `01-schema.sql` defines `portal_sessions` with separate indexes on `respondent_id` and `status`. Three legacy JSON columns (`answers`, `mqt_scores`, `demographics`) appear in the DDL because it doubles as the schema for fresh databases; `JsonToTableMigrationRunner` drops them on the first startup after migration.

---

#### `AssessmentAnswer` — table `assessment_answers`

`@Entity @Table(name = "assessment_answers", uniqueConstraints = @UniqueConstraint(name="uniq_answer_session_question", columnNames={"session_id","question_id"}))` — one row per (session, question).

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `Long` | `@Id @GeneratedValue(IDENTITY)` | Surrogate key |
| `session` | `session_id` (FK) | `PortalSession` | `@ManyToOne(LAZY) @JoinColumn(nullable=false)` | Parent session |
| `questionId` | `question_id` | `String` | `@Column(nullable=false, length=64)` | References the question's stable id from the published snapshot |
| `optionIndex` | `option_index` | `Integer` | `@Column` | Populated for MCQ; null for free-text |
| `freeText` | `free_text` | `String` | `@Column(columnDefinition="text")` | Populated for open-ended items; null for MCQ |

Exactly one of `optionIndex` / `freeText` should be non-null per row (application-level contract, not DB-enforced).

---

#### `PortalSessionDemographic` — table `portal_session_demographics`

`@Entity @Table(name = "portal_session_demographics", uniqueConstraints = @UniqueConstraint(name="uniq_session_field", columnNames={"session_id","field_key"}))` — one row per (session, demographic field key).

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `Long` | `@Id @GeneratedValue(IDENTITY)` | Surrogate key |
| `session` | `session_id` (FK) | `PortalSession` | `@ManyToOne(LAZY) @JoinColumn(nullable=false)` | Parent session |
| `fieldKey` | `field_key` | `String` | `@Column(nullable=false, length=128)` | Key from `demographic_fields.field_key` |
| `value` | `value` | `String` | `@Column(columnDefinition="text")` | Stored as TEXT; accommodates any primitive shape |

The unique constraint on `(session_id, field_key)` guarantees exactly one answer per field per session. The Dataset API's cell-edit path performs upsert logic: it iterates the session's `demographics` list and updates in place, or creates a new child row if the key is absent.

---

#### `PortalSessionMqtScore` — table `portal_session_mqt_scores`

`@Entity @Table(name = "portal_session_mqt_scores", uniqueConstraints = @UniqueConstraint(name="uniq_session_mqt", columnNames={"session_id","mqt_id"}))` — one row per (session, MQT) after scoring.

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `Long` | `@Id @GeneratedValue(IDENTITY)` | Surrogate key |
| `session` | `session_id` (FK) | `PortalSession` | `@ManyToOne(LAZY) @JoinColumn(nullable=false)` | Parent session |
| `mqtId` | `mqt_id` | `String` | `@Column(nullable=false, length=64)` | MQT identifier from the scoring snapshot |
| `mqtName` | `mqt_name` | `String` | `@Column` | Cached display name; avoids rejoining to questionnaire snapshot for report rendering |
| `score` | `score` | `double` | `@Column(nullable=false)` | Computed numeric score for this MQT |

The cached `mqt_name` is a deliberate denormalization: report views need the label without accessing the published questionnaire snapshot, and the snapshot is immutable so staleness is not a concern.

---

#### `AuditLogEntry` — table `audit_log`

`@Entity @Table(name = "audit_log")` — append-only administrative event record.

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `id` | `id` (PK) | `Long` | `@Id @GeneratedValue(IDENTITY)` | Surrogate key; always incrementing (natural ordering proxy) |
| `actorId` | `actor_id` | `String` | `@Column` | Principal id of the authenticated user who triggered the action |
| `actorName` | `actor_name` | `String` | `@Column` | Email or id string for human-readable display |
| `action` | `action` | `String` | `@Column(nullable=false, length=64)` | Stable action code: `ASSESSMENT_CREATED`, `ASSESSMENT_STATUS_CHANGED`, `TOKEN_ISSUED`, `TOKEN_REVOKED`, `dataset.cell.edit`, `ALLOTMENT_ADDED`, `ALLOTMENT_REMOVED`, etc. |
| `targetType` | `target_type` | `String` | `@Column(length=64)` | Domain object type: `"assessment"`, `"entity"`, `"assessment_token"`, `"PortalSession"`, etc. |
| `targetId` | `target_id` | `String` | `@Column(length=128)` | Id of the affected row |
| `beforeJson` | `before_json` | `String` | `@Column(columnDefinition="text")` | Jackson-serialized snapshot of the fields before mutation; null for creation events |
| `afterJson` | `after_json` | `String` | `@Column(columnDefinition="text")` | Jackson-serialized snapshot of the fields after mutation; null for deletion events |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB-managed `CURRENT_TIMESTAMP` |

The table is purely append-only; no entity has an update or delete path for audit entries.

---

#### `AssessmentToken` — table `assessment_tokens`

`@Entity @Table(name = "assessment_tokens")` — opaque registration token backing the invite / copy-link portal. Included here because its lifecycle is tightly coupled to session creation.

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `token` (PK) | `token` | `String` | `@Id @Column(length=64)` | 32 random bytes as URL-safe Base64; IS the primary key |
| `assessmentId` | `assessment_id` | `String` | `@Column(nullable=false, length=64)` | Which Assessment this link is for |
| `entityId` | `entity_id` | `String` | `@Column(length=64)` | If set, registrant joins this entity |
| `groupId` | `group_id` | `String` | `@Column(length=64)` | If set, registrant joins this group |
| `respondentId` | `respondent_id` | `String` | `@Column(length=64)` | If set, token is pre-bound to this respondent (targeted resend) |
| `maxUses` | `max_uses` | `Integer` | `@Column` | Null means unlimited; individual invites typically use 1 |
| `usedCount` | `used_count` | `int` | `@Column(nullable=false)` | Incremented atomically on registration |
| `expiresAt` | `expires_at` | `OffsetDateTime` | `@Column` | Optional ISO-8601 expiry |
| `createdAt` | `created_at` | `OffsetDateTime` | `@Column(insertable=false, updatable=false)` | DB-managed |
| `createdBy` | `created_by` | `String` | `@Column` | Actor id who issued the token |
| `qrCode` | `qr_code` | `byte[]` | `@Lob @Column(columnDefinition="LONGBLOB")` | PNG bytes of the QR encoding the registration link; generated once and stored (lazy generation on first QR request) |

---

#### `ItemDisplayState` — table `item_display_state`

`@Entity @Table(name = "item_display_state")` — per-item soft-delete tombstone flag used by the questionnaire builder.

| Field | Column | Java Type | JPA | Notes |
|---|---|---|---|---|
| `itemId` | `item_id` (PK) | `String` | `@Id @Column` | Same id as the `items` table |
| `deleted` | `deleted` | `boolean` | `@Column` | True when the item has been soft-deleted in the builder |

The `override` JSON column that once accompanied this table was never populated in production and has been dropped by `JsonToTableMigrationRunner`. The API shape is preserved backward-compatibly: the service returns an empty `override` map.

---

### REST Endpoints

#### Assessment Token Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/assessment-tokens` | Authenticated | Issue or reuse a token for a given `(assessmentId, entityId, groupId, respondentId)` scope. Returns existing live token for scoped requests; mints a new 32-byte random token otherwise. Audited as `TOKEN_ISSUED`. |
| `GET` | `/api/v1/assessment-tokens/by-assessment/{assessmentId}` | Authenticated | List all tokens ever issued for an assessment. |
| `DELETE` | `/api/v1/assessment-tokens/{token}` | Authenticated | Revoke (hard-delete) a token. Audited as `TOKEN_REVOKED`. |
| `GET` | `/api/v1/public/tokens/{token}` | Anonymous (`permitAll`) | Resolve a token to its assessment context (name, entity name, group name). Validates expiry and `maxUses` — throws 400 if breached. |
| `POST` | `/api/v1/public/tokens/{token}/consume` | Anonymous | Increment `usedCount` after a successful registration. |
| `GET` | `/api/v1/public/tokens/{token}/qr` | Anonymous | Return a PNG QR code encoding the registration link. Generated once and persisted; subsequent requests stream the stored bytes. Accepts `?base=` to override the front-end origin. |
| `POST` | `/api/v1/public/tokens/registration-check` | Anonymous | Pre-registration duplicate check: returns `{exists: true/false}` given `(dob + email/phone/companyId)`. Used by the `/register` page to prompt "log in" if the person already has an account. |
| `POST` | `/api/v1/public/tokens/{token}/register` | Anonymous | Single-call self-registration: validates token, creates or reuses `Respondent`, links to entity/group, enforces entity cap, creates `PortalSession`, increments `usedCount`, mirrors respondent to `app_users`, and returns `{sessionId, respondentId, assessmentId, authToken}`. |

#### Live Tracking Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/live-tracking/assessments` | `ROLE_ADMIN` | Return one `LiveAssessmentSummary` row per `(instrument, groupId)` tuple across all sessions, enriched with `activeNow` and `notStarted` counts from Redis. |
| `GET` | `/api/v1/admin/live-tracking/assessments/sessions?instrument=&groupId=` | `ROLE_ADMIN` | Return per-respondent `LiveSessionDto` rows for one instrument/group, merged with Redis heartbeat data (current question index, percent complete, last-seen timestamp, derived live status). |

#### Dataset Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/datasets/sessions?entityId=&questionnaireId=` | Authenticated | Return a self-describing `DatasetResponseDto` with column metadata and flat session rows. Applies row-level scope (respondents see only their own sessions); supports `entityId` and `questionnaireId` filters. PII is masked for principals with a `research`-matching role who are not ADMIN. |
| `PATCH` | `/api/v1/datasets/sessions/cells` | Authenticated (ADMIN or PRACTITIONER) | Apply a batch of cell edits. Each edit is scope-checked and guarded by optimistic concurrency on `updated_at`. Valid edits are applied transactionally and each is recorded via `AuditService`. Returns refreshed rows and per-cell errors. |

#### Audit Log Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/audit` | Authenticated | Return all audit entries ordered by `created_at DESC` (no pagination currently). |
| `GET` | `/api/v1/audit/{targetType}/{targetId}` | Authenticated | Return all audit entries for a specific `(targetType, targetId)` pair, ordered by `created_at DESC`. Used by entity/assessment detail drill-in tabs. |

#### Upload Endpoint

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/upload` | Anonymous (`permitAll` in SecurityConfig) | Accept a multipart `file`, validate extension against an allowlist (jpg/jpeg/png/gif/webp/mp4/webm/mov/mp3/wav/ogg), save to `app.uploads.dir` under a UUID-based filename, and return `{url, media_type, filename, size}`. |

#### Health Endpoint

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Anonymous | Execute `SELECT 1` against the configured datasource. Returns `200 OK` with `{status:"healthy", database:true, ...}` when the DB is reachable, or `503 Service Unavailable` with `{status:"degraded", database:false}` otherwise. |

#### Item Display State Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/item-display` | Authenticated | List all item display state rows. Returns `override` as an empty map (legacy field removed). |
| `POST` | `/api/v1/item-display/override` | Authenticated | Upsert an `ItemDisplayState` row for the given `itemId`. The `override` payload is accepted but discarded (backward compatibility). |
| `POST` | `/api/v1/item-display/{id}/delete` | Authenticated | Soft-delete: sets `deleted=true` on the row. |
| `DELETE` | `/api/v1/item-display/{id}` | Authenticated | Hard-delete the `ItemDisplayState` row. |

---

### Service-Layer Business Logic

#### Registration and Session Creation — `PublicRegistrationService.register()`

This is the primary entry point for the respondent path. All steps execute in a single `@Transactional` unit.

1. **Token validation** — load `AssessmentToken` by PK; reject with `BadRequestException` if expired (`expiresAt` < now) or exhausted (`usedCount >= maxUses`).
2. **Assessment load** — load `Assessment` from `assessmentId`; fail fast if unknown.
3. **Respondent resolution** — if `token.respondentId` is set (admin-targeted resend), the existing respondent is reused. Otherwise this is an open registration: `PublicRegistrationService.isExistingRegistrant()` calls `RespondentRepository.findDuplicates()` matching `(email OR phone OR companyId) AND dob`. A match throws `DuplicateResourceException` (HTTP 409), directing the user to log in. On a clean check a new `Respondent` is created with id `R-{UUID_PREFIX}`.
4. **Entity membership** — if `token.entityId` is set, the `EntityRegistration` row is loaded and the respondent id is added to `memberIds` (idempotent `Set.add`). The entity cap is then tested via `AssessmentService.wouldExceedEntityCap()`, which queries `PortalSessionRepository.countByAssessmentIdAndEntityId()` and compares to the cap stored in `AssessmentEntityAllotment`. A breach throws `BadRequestException`.
5. **Group membership** — if `token.groupId` is set, the respondent id is added to `RespondentGroup.memberIds` (idempotent).
6. **User identity mirror** — `upsertUser()` creates a row in `app_users` (+ `user_meta`) keyed by the same respondent id, unless the email is already owned by a different user. This enables the respondent to authenticate through `/auth/login` without a separate registration step.
7. **Session creation** — a `PortalSession` is created with `status="Active"` and `score="--"`. The `assessmentId`, denormalized instrument/vertical/language fields, and entity scope are stamped at this point. Id format: `SESS-{UUID_PREFIX}`.
8. **Token consumption** — `token.usedCount` is incremented and the token is saved.
9. **Auth token mint** — `TokenProvider.createToken()` produces a JWT for the new respondent so the SPA can redirect directly to the assessment portal without a separate login round-trip. The token encodes `UserType.RESPONDENT`.

#### Token Issue Logic — `AssessmentTokenService.issue()`

The token service implements a get-or-create pattern to satisfy the requirement that a link is generated once. For scoped requests (at least one of `entityId`, `groupId`, `respondentId` is set), the service calls `AssessmentTokenRepository.findByScope()` and returns the first live token found. A token is live if it is not expired and `usedCount < maxUses` (or `maxUses` is null). Only when no live scoped token exists is a new 32-byte `SecureRandom` token minted. Unscoped ("anonymous") tokens are never collapsed — every click produces a distinct token. Token issuance is audited as `TOKEN_ISSUED` via `AuditService`.

#### QR Code Generation — `QrCodeService` + `AssessmentTokenService.qrPng()`

`QrCodeService.pngForText()` uses ZXing (`QRCodeWriter`, `MatrixToImageWriter`) to encode a URL string as a 512×512 PNG with error-correction level M and 1-cell margin. The URL is `{base}/register?token={token}`, where `base` is the caller's `?base=` query parameter or falls back to `app.public-base-url`. The PNG bytes are stored in `AssessmentToken.qrCode` (`LONGBLOB`) after first generation; repeat requests stream the stored bytes, guaranteeing the QR is produced exactly once per token.

#### Redis Heartbeat — `HeartbeatService`

During active assessment taking, the portal client is expected to POST heartbeats (not via a dedicated auth-gated controller — heartbeats are recorded by whatever session-aware component calls `HeartbeatService.record()`). `HeartbeatService` operates as follows:

- **Key scheme**: `heartbeat:{sessionId}` stored as a JSON string in Redis via `StringRedisTemplate`.
- **Record structure** (`HeartbeatService.Record`): `sessionId`, `respondentId`, `instrument`, `groupId`, `currentIndex` (question number), `totalQuestions`, `lastSeen` (ISO-8601 UTC timestamp).
- **TTL**: configurable via `app.heartbeat.ttl-seconds` (default 30 seconds, from `AppProperties.Heartbeat`). A heartbeat that is not refreshed within 30 seconds expires automatically from Redis. There is no database write involved in the heartbeat path.
- **Idle threshold**: `app.heartbeat.idle-threshold-seconds` (default 15 seconds). Used by `LiveTrackingService` to classify a session as `"idle"` vs `"live"`.
- **Batch read**: `HeartbeatService.getMany()` uses `StringRedisTemplate.opsForValue().multiGet()` to retrieve all heartbeats for a set of session ids in a single Redis round-trip, avoiding N+1 latency on the live-tracking page.
- **Clear on completion**: `HeartbeatService.clear()` deletes the Redis key, called when a session is submitted/completed.

#### Live Tracking — `LiveTrackingService`

`LiveTrackingService.listAssessments()`:
1. Calls `PortalSessionRepository.findAssessmentSummaries()` — a JPQL constructor projection that groups all portal sessions by `(instrument, instrumentFullName, groupId, groupName)` and returns aggregate totals. This is a single SQL `GROUP BY` query.
2. For each summary row, loads all non-completed session ids for that `(instrument, groupId)` pair.
3. Calls `HeartbeatService.getMany()` with those ids to fetch all active Redis keys in one shot.
4. Sets `activeNow = beats.size()` and `notStarted = activeIds.size() - beats.size()`.

`LiveTrackingService.listSessions()`:
1. Loads all `PortalSession` rows for the requested `(instrument, groupId)`.
2. Retrieves heartbeats in batch.
3. For each session derives a `liveStatus` by calling `deriveLiveStatus()`:
   - `"completed"` if `session.status` is `"Completed"` (case-insensitive).
   - `"not_started"` if no heartbeat record exists or `lastSeen` is absent.
   - `"live"` if `now - lastSeen <= idleThresholdSeconds`.
   - `"idle"` if `now - lastSeen > idleThresholdSeconds` (but heartbeat still existed; TTL expired state is treated as `not_started` since the key would be gone).
4. Computes `percentComplete = floor(100 * currentIndex / totalQuestions)`, clamped to `[0, 100]`.

#### Dataset / Reporting — `DatasetService`

`DatasetService.sessions()` builds the self-describing grid view in two passes:

1. **Scope and filter**: Load all sessions via `PortalSessionRepository.findAllOrderByCreated()`. Apply `isVisibleTo()` (ADMINs see all; RESPONDENTs see only their own session; PRACTITIONERs currently see all — a commented TODO notes this should be entity-scoped once the mapping is wired). Apply optional `entityId` and `questionnaireId` query filters.

2. **Column assembly** (`buildColumns()`): Fixed `CORE_COLUMNS` array defines 11 columns covering respondent identity, instrument, group, entity, status, score, and three timestamps. Dynamic columns are then appended by iterating the scoped sessions: the union of all `mqtId` values becomes `"mqt:{mqtId}"` columns in the `"scores"` group; the union of all `fieldKey` values becomes `"demo:{fieldKey}"` columns in the `"demographics"` group. Both sets are sorted alphabetically for stable column ordering. Score columns are type `"number"`, demographic columns are type `"string"`. Only `respondentName`, `respondentEmail`, `status`, `groupName`, and all `demo:*` columns are declared editable (`editable="field"`); score columns are read-only.

3. **Row assembly** (`buildRow()`): Each session yields a flat `Map<String, Object>` keyed by column key, plus meta-keys `rowId` (= session id) and `_updatedAt` (ISO-8601 `updated_at` timestamp, used as the optimistic concurrency token). If the principal has a role containing `"research"` and is not ADMIN, `respondentName` is replaced by `"Respondent " + hex(respondentId.hashCode())` and `respondentEmail` is omitted (PII masking).

`DatasetService.applyEdits()` processes batched cell edits:
1. Requires the principal to be ADMIN or PRACTITIONER (researchers are read-only).
2. Groups edits by `rowId` so each session is loaded once.
3. For each row, checks optimistic concurrency: if `edit.rowUpdatedAt` is present and differs from the loaded `session.updatedAt`, the edit is rejected as a conflict and `CellEditErrorDto.conflict=true` with `currentUpdatedAt` is returned, so the client can reconcile.
4. `applyCell()` dispatches on `columnKey`: `respondentName`, `respondentEmail` (with email format validation), `status` (non-blank required), `groupName` are applied directly on the entity. Columns prefixed `demo:` are routed to `applyDemographic()`, which either updates an existing `PortalSessionDemographic` child row or creates a new one (cascaded via the `@OneToMany` collection). Unrecognized columns throw `IllegalArgumentException`.
5. After applying edits to a row, the JPA `EntityManager` is explicitly flushed to trigger the DB's `ON UPDATE CURRENT_TIMESTAMP` and then `refresh`ed to read the new `updated_at` back into memory. The refreshed row is included in the response.
6. Every accepted edit is audited via `AuditService.record("dataset.cell.edit", "PortalSession", rowId, before, after)`.

#### Audit Service — `AuditService`

`AuditService.record()` is a synchronous, in-transaction write. It extracts the current `UserPrincipal` from the `SecurityContextHolder`, serializes `before` and `after` objects to JSON via Jackson, and saves an `AuditLogEntry` row. Serialization failures fall back to `String.valueOf(o)` rather than throwing. The method is `@Transactional`, inheriting the caller's transaction by default (no `REQUIRES_NEW`), so audit entries are rolled back if the calling transaction fails.

Read methods (`listAll()`, `listForTarget()`) use `@Transactional(readOnly=true)` and return `AuditLogEntryDto` projections. The DTO serializes `beforeJson`/`afterJson` as `@JsonProperty("before")`/`@JsonProperty("after")` so field names in the API response differ from the Java property names.

#### Upload Service — `UploadService`

`UploadService.save()` validates the file extension against a static `ALLOWED_EXT` map (images: jpg/jpeg/png/gif/webp; video: mp4/webm/mov; audio: mp3/wav/ogg). The original extension is preserved; the filename is re-randomized with `UUID.randomUUID()` to prevent path traversal and content overwrite attacks. The file is streamed via `Files.copy()` to `app.uploads.dir/{uuid}.{ext}`. The returned `UploadResponse` carries a public URL built as `app.uploads.baseUrl + "/uploads/" + filename`. The upload directory is created on application startup via `@PostConstruct`. The `/uploads/**` path is `permitAll` in `SecurityConfig`, so uploaded media is publicly readable — this is intentional for item stem/option media.

#### Health Service — `HealthService`

Issues a native `SELECT 1` via `EntityManager` inside a `@Transactional(readOnly=true)` context. Returns a `Map` with keys `status` (`"healthy"` or `"degraded"`), `service`, `version`, `database` (boolean), and `time`. `HealthController` maps the boolean to HTTP 200 vs 503. This endpoint is `permitAll` and serves as the load-balancer health check.

---

### Migration History and Schema Drift

`JsonToTableMigrationRunner` (`@Order(1)`, runs on every startup) embodies the complete migration history of the portal session subsystem:

1. **Legacy JSON columns on `portal_sessions`** — The original schema stored answers, MQT scores, and demographics as JSON blobs (`portal_sessions.answers`, `portal_sessions.mqt_scores`, `portal_sessions.demographics`). `JsonToTableMigrationRunner` drains each to its normalized child table (`assessment_answers`, `portal_session_mqt_scores`, `portal_session_demographics`) using `INSERT IGNORE` so reruns are idempotent. After successful migration it `ALTER TABLE portal_sessions DROP COLUMN` for each legacy column.

2. **Legacy `sessions` table** — A completely separate `sessions` table existed in the original DDL (the DDL still defines it as a creation artifact). The migration runner explicitly `DROP TABLE sessions` on first run after confirming the table exists. The live entity is now solely `portal_sessions`.

3. The DDL in `01-schema.sql` still declares `portal_sessions` with `answers JSON`, `mqt_scores JSON`, and `demographics JSON` columns because the file bootstraps fresh databases — but those columns are immediately dropped by `JsonToTableMigrationRunner` on the first application startup. An engineer inspecting `01-schema.sql` must be aware they are not the live authoritative schema for migrated databases.

4. `show_question_index` was added to `portal_sessions` later; the DDL includes an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-style block using `INFORMATION_SCHEMA` checks.

---

### Notable Design Decisions

1. **Denormalized session fields** — `PortalSession` stores `respondentName`, `respondentEmail`, `instrument`, `instrumentFullName`, `vertical`, `language`, `groupName`, `entityName`, `assessmentId`, and `name` as plain string columns rather than foreign keys. This is an intentional trade-off: session history is independent of whether the referenced entities are later renamed or deleted, and list/reporting queries avoid joins on every row fetch.

2. **Respondent id as stable cross-table key** — `Respondent.id` (format `R-{PREFIX}`) is reused verbatim as `User.id` in `app_users`. `PublicRegistrationService.upsertUser()` enforces this identity by keying `users` on the same string. This means `portal_sessions.respondent_id` references both `respondents.id` and `app_users.id` without a formal FK. Practitioners log in via a separate `practitioners` table.

3. **Optimistic concurrency in Dataset edits** — Rather than row-level pessimistic locking, the Dataset API uses `updated_at` as a concurrency token. The client sends `rowUpdatedAt` with each edit; the server rejects edits where the stored `updated_at` differs. Conflicts are surfaced per-cell with `conflict=true` and the server's current `currentUpdatedAt`, so the UI can let the user decide whether to overwrite.

4. **Redis TTL as presence signal** — Heartbeat liveness is deliberately encoded in Redis key expiry rather than a database field. A TTL of 30 seconds means a crashed browser tab or lost network connection self-heals within 30 seconds with no explicit "disconnect" call. The idle/live distinction (15 s threshold) is a finer-grained signal computed from `lastSeen` at read time.

5. **Researcher PII masking** — `DatasetService` checks whether the principal's roles list contains any string matching `"research"` (case-insensitive substring). Such principals see pseudonymous respondent names (`Respondent {hex-hash}`) and no email address. This is a soft read-only guard implemented in the application layer, not enforced at the DB level.

6. **Batch multiGet for heartbeats** — `HeartbeatService.getMany()` uses `StringRedisTemplate.opsForValue().multiGet()` to avoid N+1 Redis round-trips when the live-tracking page loads dozens of sessions simultaneously.

7. **QR code store-once semantics** — The `AssessmentToken.qrCode` LONGBLOB column is used as a write-once cache: `AssessmentTokenService.qrPng()` checks for a non-empty byte array before calling `QrCodeService`; once written the PNG is never regenerated. This satisfies the product requirement that "the link is generated once and saved" and ensures the QR code remains consistent across multiple downloads.

8. **Token scoping and deduplication** — `AssessmentTokenService.issue()` deliberately deduplicates scoped tokens (entity/group/respondent-targeted) to prevent link proliferation when admins click "Copy Link" multiple times. Unscoped tokens are never deduplicated, since each anonymous invite is considered a distinct link.

9. **Upload security model** — Uploaded files are publicly readable (`/uploads/**` is `permitAll`). Access control is at write time only (the endpoint itself has no `@PreAuthorize`, relying on the server's general CORS + JWT layer to block unauthenticated writes in production contexts). The UUID-renamed filename is the only obscurity measure against enumeration.

---

### Connections to Other Subsystems

- **Questionnaire / Publishing subsystem** — `PublicRegistrationService` populates `PortalSession.instrument` from `Assessment.questionnaireName`, which is denormalized from `PublishedQuestionnaire.name` at Assessment creation time. Score computation (not yet visible as a standalone service) consumes the published snapshot's MQT/option-score tree to produce `PortalSessionMqtScore` rows. `DatasetService` exposes all `mqtId`s present in `portal_session_mqt_scores` as dynamic `"mqt:{id}"` columns.
- **Assessment and Allotments subsystem** — `AssessmentService.wouldExceedEntityCap()` is called from `PublicRegistrationService` before session creation. `AssessmentService` status transitions (`ACTIVE`/`CLOSED`/`PAUSED`) are audited via `AuditService`. `PortalSessionRepository.countByAssessmentId*` methods feed session/completion tallies into `AssessmentDto`.
- **Respondent and Group subsystem** — `PublicRegistrationService` creates `Respondent` rows and mutates `RespondentGroup.memberIds` and `EntityRegistration.memberIds`. The `respondent_id` on `PortalSession` is the join key to respondent display metadata.
- **Security / Authentication subsystem** — `PublicRegistrationService` calls `TokenProvider.createToken()` to mint a `RESPONDENT`-type JWT immediately after session creation so the registrant is auto-logged-in. `DatasetService` consumes `UserPrincipal.getUserType()` and `UserPrincipal.getRoles()` to apply row-level scope and PII masking.
- **Redis infrastructure** — `HeartbeatService` depends exclusively on `StringRedisTemplate`. If Redis is unavailable, heartbeat writes log a `WARN` and return silently; heartbeat reads return `Optional.empty()` / empty maps. The live-tracking page degrades gracefully (all sessions appear `"not_started"`) rather than erroring.

---


## Build, Configuration, Persistence Setup, Exceptions, Repositories & Canonical DB Schema

---

### 1. Purpose and Responsibilities

This subsystem constitutes the foundational infrastructure layer of BodhAssess. It provides:

- **Build toolchain**: Maven multi-phase JAR build with a two-stage Docker image.
- **Configuration management**: Layered Spring Boot properties (common → profile → environment variables), including authentication secrets, CORS origins, Redis, file upload paths, and a bootstrap super-admin seeding routine.
- **Persistence**: JPA/Hibernate entity graph mapped to MySQL 8, with `ddl-auto=update` supplemented by two startup `ApplicationRunner`/`CommandLineRunner` data-migration shims that implement schema evolution the ORM cannot safely handle.
- **Error handling**: A single `@RestControllerAdvice` that converts every application exception and Spring MVC validation failure into a uniform JSON envelope.
- **Repository layer**: 22 `JpaRepository` interfaces covering every aggregate, with non-trivial JPQL and native queries for reporting, projection DTOs, and null-safe scope matching.

---

### 2. Build

#### 2.1 Maven (`pom.xml`)

| Property | Value |
|---|---|
| Artifact ID | `bodhassess-api` |
| Packaging | `jar` |
| Spring Boot parent | `2.5.5` |
| Java version | `11` |

**Key dependencies:**

| Dependency | Group/Artifact | Version | Notes |
|---|---|---|---|
| Spring Boot Web | `spring-boot-starter-web` | (BOM) | Embedded Tomcat, Jackson |
| Spring Data JPA | `spring-boot-starter-data-jpa` | (BOM) | Hibernate 5.x |
| Spring Security | `spring-boot-starter-security` | (BOM) | JWT filter chain |
| Bean Validation | `spring-boot-starter-validation` | (BOM) | `@Valid` on request bodies |
| Spring Data Redis | `spring-boot-starter-data-redis` | (BOM) | Heartbeat TTL |
| MySQL Connector | `mysql:mysql-connector-java` | (BOM) | Runtime scope |
| Hibernate Types 52 | `com.vladmihalcea:hibernate-types-52` | `2.21.1` | `JsonNodeStringType` for JSON columns on `QuestionnaireCatalog`; leftover from when many more columns were JSON. |
| jjwt-api / jjwt-impl / jjwt-jackson | `io.jsonwebtoken:jjwt-*` | `0.11.5` | HMAC-signed JWT |
| ZXing Core + JavaSE | `com.google.zxing:*` | `3.5.1` | PNG QR code generation for registration tokens |

Build plugin: `spring-boot-maven-plugin` (repackages into an executable fat JAR at `target/*.jar`).

#### 2.2 Dockerfile (two-stage build)

**Stage 1 — `maven:3.8.6-eclipse-temurin-11`**

```
COPY pom.xml ./
RUN mvn -B -q -e -DskipTests dependency:go-offline   # layer-cached dep download
COPY src ./src
RUN mvn -B -q -e -DskipTests package
```

**Stage 2 — `eclipse-temurin:11-jre`**

- Non-root `bodh:bodh` user for runtime isolation.
- `COPY --from=build /workspace/target/*.jar app.jar`
- `JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"` — JVM respects Docker memory limits automatically.
- `EXPOSE 4000`
- `ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]`

The `/app/uploads` directory is created inside the image and owned by the `bodh` user; it is shadowed by an external Docker volume in production.

#### 2.3 `docker-compose.yml`

Three services on a `bodh` bridge network:

| Service | Image | Role |
|---|---|---|
| `mysql` | `mysql:8.0` | Persistent MySQL, init directory `/docker/mysql-init` auto-executes `01-schema.sql` on first boot |
| `redis` | `redis:7-alpine` | In-memory heartbeat store, persistence disabled (`--save "" --appendonly no`) |
| `app` | `bodhassess-api:latest` | Spring Boot app; `profiles: ["prod"]` — only started by `docker compose --profile prod up` |

The `app` service depends on `mysql` and `redis` health checks (mysqladmin ping, redis-cli ping) before starting. Database host inside Docker is `mysql:3306`; Redis host is `redis:6379`.  In dev mode the app runs on the host JVM talking to containers on `localhost:3306` and `localhost:6390` (mapped `${REDIS_PORT}`).

---

### 3. Configuration

#### 3.1 `application.properties` (base, always loaded)

```properties
server.port=4000
spring.jpa.hibernate.ddl-auto=update
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQL8Dialect
spring.jpa.show-sql=false
spring.jpa.open-in-view=false
spring.servlet.multipart.max-file-size=50MB
spring.servlet.multipart.max-request-size=50MB
spring.redis.host=${REDIS_HOST:localhost}
spring.redis.port=${REDIS_PORT:6390}
spring.redis.timeout=2000ms
app.heartbeat.ttl-seconds=30
app.heartbeat.idle-threshold-seconds=15
app.auth.tokenSecret=${APP_AUTH_TOKEN_SECRET:926D96C90030...}   # HARDCODED DEFAULT — must override in prod
app.auth.tokenExpirationMsec=${APP_AUTH_TOKEN_EXPIRATION_MSEC:604800000}   # 7 days
app.cors.allowedOrigins=${APP_CORS_ALLOWED_ORIGINS:http://localhost:*,http://127.0.0.1:*}
app.uploads.dir=${APP_UPLOADS_DIR:./uploads}
app.uploads.baseUrl=${APP_UPLOADS_BASE_URL:http://localhost:4000}
app.bootstrap.super-admin-email=${APP_BOOTSTRAP_SUPER_ADMIN_EMAIL:superadmin@bodh.biz}
app.bootstrap.super-admin-dob=${APP_BOOTSTRAP_SUPER_ADMIN_DOB:1990-01-01}
spring.jackson.serialization.write-dates-as-timestamps=false
spring.jackson.default-property-inclusion=non_null
spring.profiles.active=${SPRING_PROFILES_ACTIVE:dev}
```

**Critical security note**: `app.auth.tokenSecret` has a hardcoded 128-character hex default. Any deployment that does not set `APP_AUTH_TOKEN_SECRET` in the environment will share the same JWT signing key across all instances. This must be overridden before public exposure.

#### 3.2 Profile-specific overrides

**`application-dev.properties`** — local MySQL at `localhost:3306/bodhassess`, credentials `bodh/bodh`, `show-sql=true`.

**`application-prod.properties`** — MySQL host becomes `mysql` (the Docker service name), `show-sql=false`. All connection details arrive via `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` environment variables.

The active profile is selected via `SPRING_PROFILES_ACTIVE` env var; defaults to `dev`.

#### 3.3 `AppProperties`

`@ConfigurationProperties`-bound POJO exposing `app.auth.tokenSecret`, `app.auth.tokenExpirationMsec`, `app.cors.allowedOrigins`, `app.uploads.dir`, `app.uploads.baseUrl`, `app.heartbeat.*`, and `app.bootstrap.*`. Injected across `SecurityConfig`, `JwtTokenProvider`, `HeartbeatService`, `BootstrapRunner`.

---

### 4. Persistence Setup

#### 4.1 Hibernate / JPA configuration

| Setting | Value | Implication |
|---|---|---|
| `hibernate.dialect` | `MySQL8Dialect` | Enables MySQL 8–specific DDL (e.g., `TINYINT(1)` booleans, `JSON` column type awareness) |
| `ddl-auto` | `update` | **On startup, Hibernate scans every `@Entity` and issues `ALTER TABLE ADD COLUMN` / `CREATE TABLE IF NOT EXISTS` for any new mapping.** It never drops columns, never renames columns, and never modifies column types. This means: (a) adding a new field to an entity is safe — the column appears; (b) renaming a field leaves the old column orphaned; (c) changing a type or constraint requires manual DDL. Schema drift accumulates silently. |
| `open-in-view` | `false` | The JPA `EntityManager` is not kept open across the HTTP request/response lifecycle. Lazy associations accessed outside a transactional context will throw `LazyInitializationException`. All service methods that traverse lazy associations must be `@Transactional`. |
| `show-sql` | `true` in dev, `false` in prod | |

#### 4.2 JSON column support

`com.vladmihalcea:hibernate-types-52` is present and `QuestionnaireCatalog` uses `@TypeDef(name = "json-node", typeClass = JsonNodeStringType.class)`. This was the mechanism for all JSON columns before the `JsonToTableMigrationRunner` (§5.2 below) migrated them to normalized child tables and dropped the columns. The only remaining JSON handling is via Jackson inside the migration runners themselves, not at the JPA mapping level.

#### 4.3 Primary key strategy

All user-facing entities use application-generated string PKs (UUID or short alphanumeric IDs). Child/join tables whose rows have no business identity use `@GeneratedValue(strategy = GenerationType.IDENTITY)` with a `Long` PK (`ItemOption`, `ItemOptionScore`, `ItemQuestionScore`, `AuditLogEntry`, `PublishedQuestionnaireMq`, `PublishedQuestionnaireMqt`, `PublishedQuestionnaireQuestion`, `PublishedQuestionnaireQuestionOption`, `PublishedQuestionnaireQuestionOptionScore`, `AssessmentAnswer`, `PortalSessionMqtScore`, `PortalSessionDemographic`).

Composite PKs appear on the three allotment join entities: `AssessmentEntityAllotment` uses `@IdClass(AssessmentEntityAllotmentId.class)` with `(assessment_id, entity_id)`, `AssessmentGroupAllotment` with `(assessment_id, group_id)`, and `AssessmentRespondentAllotment` with `(assessment_id, respondent_id)`.

#### 4.4 ElementCollection / join-table collections

Several entities use `@ElementCollection` + `@CollectionTable` to store sets of strings in dedicated join tables, replacing former JSON arrays. This pattern is used for:

- `Practitioner.roles` → `practitioner_roles(practitioner_id, role)`
- `Practitioner.verticals` → `practitioner_verticals(practitioner_id, vertical)`
- `RespondentGroup.memberIds` → `respondent_group_members(group_id, respondent_id)`
- `RespondentGroup.assignedInstruments` → `respondent_group_instruments(group_id, instrument_id)`
- `Role.urlPaths` → `role_url_paths(role_id, url_path)`
- `DemographicField.options` → `demographic_field_options(field_id, option_value)`
- `User.entityIds` → `user_entities(user_id, entity_id)`
- `EntityRegistration.memberIds` → `entity_members(entity_id, respondent_id)`
- `PublishedQuestionnaire.languages` → `published_questionnaire_languages(questionnaire_id, language)`
- `PublishedQuestionnaire.demographicFieldKeys` → `published_questionnaire_demographic_keys(questionnaire_id, field_key)`
- `Item.languages` → `item_languages(item_id, language)`
- `QuestionnaireCatalog.languages` → `instrument_languages(instrument_id, language)`

`Set<String>` is used (not `List<String>`) on entities that have two such collections to avoid Hibernate's `MultipleBagFetchException` when both are fetched eagerly.

---

### 5. Startup Data Migrations

Two `ApplicationRunner`/`CommandLineRunner` beans run on every application startup to handle schema evolution that `ddl-auto=update` cannot express.

#### 5.1 `QuestionnaireVersioningMigrationRunner` (`@Order(10)`)

Implements `CommandLineRunner`. Introduced when Git-style versioning was added to `PublishedQuestionnaire`.

**`backfillParents()`**: Scans every `PublishedQuestionnaire` row with a null `parent_id`. For each such row:
1. Creates a new `Questionnaire` parent with the same `name`/`vertical` and `created_by="system-migration"`.
2. Sets `parent_id`, `version_major=1`, `version_minor=0`, `version_label="v1.0"`, `version_status="COMMITTED"`, `committed_at=createdAt`, `committed_by="system-migration"` on the legacy row.
3. Sets `current_version_id` on the new parent to point at the legacy row.

**`backfillAssessmentVersionIds()`**: Scans every `Assessment` with a null `questionnaire_version_id`. The legacy `questionnaire_id` used to point directly at a `PublishedQuestionnaire`. After the versioning migration, `questionnaire_id` should point at the `Questionnaire` parent. This method: sets `questionnaire_version_id := old questionnaire_id`, then retargets `questionnaire_id := parent.id`.

Runs before `JsonToTableMigrationRunner` (higher order number = later execution; `@Order(10)` runs after `@Order(1)` — the data dependency is backward here; both are idempotent so ordering matters only for logging clarity).

#### 5.2 `JsonToTableMigrationRunner` (`@Order(1)`)

Implements `ApplicationRunner`. Migrates all legacy JSON columns out of wide tables into normalized child/join tables. **The fast path**: on startup, one `INFORMATION_SCHEMA.COLUMNS` count query checks whether any of the 25+ legacy columns still exist. If the count is zero and the legacy `sessions` table is gone, the runner returns immediately — this keeps startup overhead negligible on fully-migrated databases.

**Migrations performed** (all idempotent via `INSERT IGNORE` and null/empty-array guards):

| Source | Shape | Target |
|---|---|---|
| `practitioners.roles` | JSON string array | `practitioner_roles` |
| `practitioners.verticals` | JSON string array | `practitioner_verticals` |
| `respondent_groups.member_ids` | JSON string array | `respondent_group_members` |
| `respondent_groups.assigned_instruments` | JSON string array | `respondent_group_instruments` |
| `measured_qualities.mqts` | Nested JSON tree | `mqts` (self-referential with `parent_mqt_id`) |
| `portal_sessions.answers` | JSON object `{questionId: optionIndex\|freeText}` | `assessment_answers` |
| `portal_sessions.mqt_scores` | JSON object `{mqt_id: {name, score}}` | `portal_session_mqt_scores` |
| `portal_sessions.demographics` | JSON object `{field_key: value}` | `portal_session_demographics` |
| `items.options` | JSON array of options with nested scores | `item_options` + `item_option_scores` |
| `items.sub_domains` | JSON array `[{domain, weight}]` | `item_question_scores` |
| `published_questionnaires.mqs` | Nested MQ/MQT tree | `published_questionnaire_mqs` + `_mqts` |
| `published_questionnaires.questions` | JSON array of questions with options and scores | `published_questionnaire_questions` + options + scores |
| `roles.url_paths` | JSON string array | `role_url_paths` |
| `demographic_fields.options` | JSON string array | `demographic_field_options` |
| `instruments.languages` | JSON string array | `instrument_languages` |
| `items.languages` | JSON string array | `item_languages` |
| `published_questionnaires.languages` | JSON string array | `published_questionnaire_languages` |
| `published_questionnaires.demographic_field_keys` | JSON string array | `published_questionnaire_demographic_keys` |
| `instruments.scoring_config` | JSON `{model, ...}` | scalar column `instruments.scoring_model` (model field only) |

After migrating, the runner **drops every legacy column** via `ALTER TABLE ... DROP COLUMN`. This is necessary because those columns were `NOT NULL` with no default in the old schema — leaving them would cause `INSERT` failures on entities that no longer map them. The legacy `sessions` table (superseded by `portal_sessions`) is also dropped if present.

---

### 6. Canonical DB Schema (`01-schema.sql`)

The file at `/home/morningstar/Projects/bodh/bodhassess-api-spring/docker/mysql-init/01-schema.sql` is the **source of truth for a fresh database**. It creates the database in `utf8mb4_unicode_ci` and defines the tables described below. The file is mounted into the MySQL Docker container's `/docker-entrypoint-initdb.d/` directory — MySQL executes it once, on first container boot. It also contains idempotent `INFORMATION_SCHEMA`-guarded `ALTER TABLE` stanzas for columns added after the initial release (`practitioners.phone`, `portal_sessions.show_question_index`, `portal_sessions.started_at`).

**Note on schema vs. entities**: Several tables defined in `01-schema.sql` (`tenants`, `users`, `instruments`, `items`, `sessions`) pre-date this Spring Boot rewrite or belong to a broader multi-tenant future design. The Spring `@Entity` classes map to a subset of these tables. The startup migration runner drops the legacy `sessions` table. The `tenants`, `users` (unmapped legacy), `instruments`, and `items` tables all have partial entity coverage described below.

#### 6.1 Core domain tables

The following tables and their `@Entity` mappings are described. Column annotations shown are those explicitly declared in the Java entity; un-annotated columns use Hibernate's default column name derivation (camelCase → snake_case).

---

**`app_users`** — `@Table(name = "app_users")` → `User`

| Field | Column | SQL type | Annotation / Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | `@Id` |
| `email` | `email` | `VARCHAR(255)` UNIQUE NOT NULL | `@Column(nullable=false, unique=true)` |
| `dob` | `dob` | `VARCHAR(64)` | ISO `YYYY-MM-DD` string; the credential ("password") |
| `status` | `status` | `VARCHAR(32)` NOT NULL DEFAULT `'Active'` | |
| `superAdmin` | `is_super_admin` | `TINYINT(1)` NOT NULL DEFAULT 0 | `@Column(name="is_super_admin")` — god-mode bypass |
| `lastLogin` | `last_login` | `VARCHAR(64)` | |
| `entityIds` | (join table) | — | `@ElementCollection(LAZY)` → `user_entities(user_id, entity_id)` |
| `createdAt` | `created_at` | `TIMESTAMP` | `@CreationTimestamp` |
| `updatedAt` | `updated_at` | `TIMESTAMP` | `@UpdateTimestamp` |

This table is NOT the legacy `users` table in `01-schema.sql` (which pre-dates the rewrite and is left unmapped). New auth resolves exclusively against `app_users`. Created on first boot by `IdentityBootstrapRunner` for the super-admin seed.

---

**`user_meta`** — `@Table(name = "user_meta")` → `UserMeta`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `userId` | `user_id` | `VARCHAR(64)` PK | Shares PK with `app_users`; 1:1 extension |
| `name` | `name` | `VARCHAR(255)` | |
| `phone` | `phone` | `VARCHAR(64)` | |
| `gender` | `gender` | `VARCHAR(32)` | |
| `consent` | `consent` | `VARCHAR(32)` | |
| `companyId` | `company_id` | `VARCHAR(64)` | |
| `orgName` | `org_name` | `VARCHAR(255)` | |
| `orgWebsite` | `org_website` | `VARCHAR(512)` | |

Deliberately holds no auth fields. Allows profile extension without touching the credentials table.

---

**`practitioners`** — `@Table(name = "practitioners")` → `Practitioner`

| Field | Column | SQL type | Annotation / Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` | |
| `email` | `email` | `VARCHAR(255)` UNIQUE | |
| `phone` | `phone` | `VARCHAR(32)` | Added via idempotent ALTER in `01-schema.sql` |
| `roles` | (join table) | — | `@ElementCollection(EAGER)` → `practitioner_roles(practitioner_id, role)` |
| `verticals` | (join table) | — | `@ElementCollection(EAGER)` → `practitioner_verticals(practitioner_id, vertical)` |
| `status` | `status` | `VARCHAR(32)` DEFAULT `'Active'` | |
| `lastLogin` | `last_login` | `VARCHAR(32)` | |
| `dob` | `dob` | `DATE` | `LocalDate`; the login credential for practitioners |
| `createdAt` | `created_at` | `TIMESTAMP` | `insertable=false, updatable=false` |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

`PractitionerRepository.findActiveByEmailAndDob()` is the login lookup. `findActiveByDobWithPhone()` returns candidates for phone-based login; digit normalization is done in service code because the stored phone may contain separators.

---

**`respondents`** — `@Table(name = "respondents")` → `Respondent`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` NOT NULL | |
| `email` | `email` | `VARCHAR(255)` NOT NULL UNIQUE | |
| `phone` | `phone` | `VARCHAR(64)` | |
| `dob` | `dob` | `VARCHAR(16)` | Stored as string (`YYYY-MM-DD`); login credential for respondents |
| `consent` | `consent` | `VARCHAR(32)` DEFAULT `'Pending'` | |
| `sessionsCount` | `sessions_count` | `INT` DEFAULT 0 | Denormalized counter |
| `lastAssessment` | `last_assessment` | `VARCHAR(255)` | |
| `accountType` | `account_type` | `VARCHAR(32)` DEFAULT `'individual'` | |
| `orgName` | `org_name` | `VARCHAR(255)` | |
| `orgWebsite` | `org_website` | `VARCHAR(512)` | |
| `companyId` | `company_id` | `VARCHAR(64)` | Optional company ID for returning-registrant dedup |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

`RespondentRepository.findDuplicates()` implements a three-channel dedup: same DOB AND any of (email OR phone OR companyId), with null-safe guards so blank fields do not match other blank fields.

---

**`respondent_groups`** — `@Table(name = "respondent_groups")` → `RespondentGroup`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` | |
| `description` | `description` | `TEXT` | |
| `parentId` | `parent_id` | `VARCHAR(64)` | Self-referential FK with `ON DELETE CASCADE` in DDL |
| `memberIds` | (join table) | — | `@ElementCollection(EAGER)` → `respondent_group_members(group_id, respondent_id)` |
| `assignedInstruments` | (join table) | — | `@ElementCollection(EAGER)` → `respondent_group_instruments(group_id, instrument_id)` |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

**Note**: The DDL declares `CONSTRAINT fk_groups_parent ... ON DELETE CASCADE` but the entity does not model children — the self-referential cascade only fires at the DB level.

---

**`entity_registrations`** — `@Table(name = "entity_registrations")` → `EntityRegistration`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` | |
| `companyName` | `company_name` | `VARCHAR(255)` | |
| `email` | `official_email` | `VARCHAR(255)` | `@Column(name="official_email")` |
| `phone` | `phone` | `VARCHAR(64)` | |
| `dob` | `dob` | `VARCHAR(16)` | |
| `sessionsCount` | `sessions_count` | `INT` DEFAULT 0 | |
| `accountType` | `account_type` | `VARCHAR(32)` | |
| `orgName` | `org_name` | `VARCHAR(255)` | |
| `orgWebsite` | `org_website` | `VARCHAR(512)` | |
| `active` | `active` | `TINYINT(1)` NOT NULL DEFAULT 0 | Admin approval gate |
| `memberIds` | (join table) | — | `@ElementCollection(EAGER)` → `entity_members(entity_id, respondent_id)` |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

Self-service entity registrations stay here pending admin review. An admin promotes a row to the respondents pool and activates the entity.

---

**`measured_qualities`** — `@Table(name = "measured_qualities")` → `MeasuredQuality`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` NOT NULL UNIQUE | |
| `description` | `description` | `TEXT` | `@Column(columnDefinition="text")` |
| `mqts` | (child table) | — | `@OneToMany(mappedBy="mq", cascade=ALL, orphanRemoval=true)` with `@Where(clause="parent_mqt_id IS NULL")` — only top-level traits |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

The `@Where(clause="parent_mqt_id IS NULL")` annotation is critical: Hibernate applies this SQL filter to the collection so only root-level `Mqt` rows appear in `MeasuredQuality.mqts`. Nested children are reached transitively via `Mqt.getChildren()`.

---

**`mqts`** — `@Table(name = "mqts")` → `Mqt`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `mq` | `mq_id` | FK → `measured_qualities.id` | `@ManyToOne(LAZY)` |
| `parent` | `parent_mqt_id` | FK → `mqts.id` NULL | `@ManyToOne(LAZY)` — null for root MQTs |
| `children` | (self-FK) | — | `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true)` |
| `name` | `name` | `VARCHAR(255)` NOT NULL | |
| `sortOrder` | `sort_order` | `INT` NOT NULL | |

Self-referential tree. Depth is unbounded in the model but typically 2 levels (MQ → MQT or MQ → MQT → sub-MQT).

---

**`roles`** — `@Table(name = "roles")` → `Role`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` | |
| `description` | `description` | `TEXT` | |
| `urlPaths` | (join table) | — | `@ElementCollection(EAGER)` → `role_url_paths(role_id, url_path)` |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

`RoleRepository.findUrlPathsByRoleNames()` uses a **native query** that joins `role_url_paths` → `roles` by name to return a flat, deduplicated list of URL paths. This is the access-control lookup for RBAC route guards.

---

**`verticals`** — `@Table(name = "verticals")` → `Vertical`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `code` | `code` | `VARCHAR(64)` UNIQUE | Indexed |
| `name` | `name` | `VARCHAR(255)` | |
| `description` | `description` | `TEXT` | |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | |

User-defined vertical catalog. Built-in verticals (e.g., `CLINICAL`) are implicit constants in service code and do not require a row here.

---

**`demographic_fields`** — `@Table(name = "demographic_fields")` → `DemographicField`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `fieldKey` | `field_key` | `VARCHAR(128)` | |
| `label` | `label` | `VARCHAR(255)` | |
| `type` | `type` | `VARCHAR(32)` | e.g., `text`, `select`, `date` |
| `required` | `required` | `TINYINT(1)` NOT NULL DEFAULT 0 | |
| `placeholder` | `placeholder` | `VARCHAR(255)` | |
| `options` | (join table) | — | `@ElementCollection(EAGER)` → `demographic_field_options(field_id, option_value)` |
| `sortOrder` | `sort_order` | `INT` NOT NULL DEFAULT 0 | |
| `active` | `active` | `TINYINT(1)` NOT NULL DEFAULT 1 | |

`DemographicFieldRepository.findActiveOrdered()` returns only `active=true` rows sorted by `sort_order` ASC — this is what the portal's pre-assessment form renders.

---

**`questionnaires`** — `@Table(name = "questionnaires")` → `Questionnaire`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | Prefixed `Q-` + 8-char UUID fragment by migration |
| `name` | `name` | `VARCHAR(255)` NOT NULL | |
| `vertical` | `vertical` | `VARCHAR(64)` | |
| `currentVersionId` | `current_version_id` | `VARCHAR(64)` | Points at the latest COMMITTED `PublishedQuestionnaire` version |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `createdBy` | `created_by` | `VARCHAR(64)` | |

This is the "questionnaire family" parent. One row represents PHQ-9 as a concept; all its versions (v1.0, v1.1, v2.0) live in `published_questionnaires` with `parent_id` pointing here. The `current_version_id` tells new Assessments which version to default to.

---

**`published_questionnaires`** — `@Table(name = "published_questionnaires")` → `PublishedQuestionnaire`

| Field | Column | SQL type | Annotation / Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` | Indexed |
| `shortName` | `short_name` | `VARCHAR(255)` | Indexed |
| `vertical` | `vertical` | `VARCHAR(64)` | |
| `category` | `category` | `VARCHAR(255)` | |
| `description` | `description` | `TEXT` | |
| `duration` | `duration` | `INT` | Minutes |
| `tier` | `tier` | `VARCHAR(32)` | |
| `languages` | (join table) | — | `@ElementCollection(EAGER)` → `published_questionnaire_languages(questionnaire_id, language)` |
| `mqs` | (child table) | — | `@OneToMany(mappedBy="questionnaire", cascade=ALL, orphanRemoval=true)` ordered by `sortOrder` |
| `questions` | (child table) | — | `@OneToMany(mappedBy="questionnaire", cascade=ALL, orphanRemoval=true)` ordered by `sortOrder` |
| `isDemo` | `is_demo` | `TINYINT(1)` | |
| `disclaimer` | `disclaimer` | `TEXT` | |
| `instructions` | `instructions` | `TEXT` | Author-written pre-assessment text |
| `showInstructions` | `show_instructions` | `TINYINT(1)` NOT NULL | Toggle: show instructions on portal |
| `demographicFieldKeys` | (join table) | — | `@ElementCollection(EAGER)` → `published_questionnaire_demographic_keys(questionnaire_id, field_key)` |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `parentId` | `parent_id` | `VARCHAR(64)` | FK → `questionnaires.id` (not enforced at DB level) |
| `versionMajor` | `version_major` | `INT` NOT NULL DEFAULT 1 | |
| `versionMinor` | `version_minor` | `INT` NOT NULL DEFAULT 0 | |
| `versionLabel` | `version_label` | `VARCHAR(32)` | e.g., `"v1.2"` |
| `versionName` | `version_name` | `VARCHAR(255)` | Human label |
| `versionComments` | `version_comments` | `TEXT` | |
| `versionStatus` | `version_status` | `VARCHAR(16)` NOT NULL DEFAULT `'COMMITTED'` | `DRAFT` or `COMMITTED`. Only COMMITTED versions can be allotted. |
| `branchedFromVersionId` | `branched_from_version_id` | `VARCHAR(64)` | Optional; set when a new DRAFT branches from a prior version |
| `committedAt` | `committed_at` | `TIMESTAMP` | |
| `committedBy` | `committed_by` | `VARCHAR(64)` | |

**Versioning semantics**: Each row is an immutable snapshot once `version_status = 'COMMITTED'`. A DRAFT row is mutable. Creating a new Assessment pins it to a specific committed version via `questionnaireVersionId` on the `Assessment` row — the content shown to respondents and the scoring rules are forever fixed to that snapshot regardless of future version commits.

`PublishedQuestionnaireRepository` has extensive version-aware queries: `findByParent`, `findCommittedByParent`, `findDraftsByParent`, `findLatestCommittedByParent`, and count variants. `findOthersByName` is used to delete colliding legacy rows by entity-level cascade (not bulk JPQL DELETE) so FK constraints on child tables are respected.

---

**`published_questionnaire_mqs`** — `@Table(name="published_questionnaire_mqs")` → `PublishedQuestionnaireMq`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO_INCREMENT | |
| `questionnaire` | `questionnaire_id` | FK → `published_questionnaires.id` | `@ManyToOne(LAZY)` |
| `mqId` | `mq_id` | `VARCHAR(64)` NOT NULL | Snapshot of the `MeasuredQuality.id` at publish time; no live FK |
| `name` | `name` | `VARCHAR(255)` | Snapshot name |
| `sortOrder` | `sort_order` | `INT` NOT NULL | |
| `mqts` | (child table) | — | `@OneToMany(...) @Where(clause="parent_id IS NULL")` → top-level `PublishedQuestionnaireMqt` only |

---

**`published_questionnaire_mqts`** — → `PublishedQuestionnaireMqt`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `mq` | `pq_mq_id` | FK → `published_questionnaire_mqs.id` | `@ManyToOne(LAZY)` |
| `parent` | `parent_id` | FK → `published_questionnaire_mqts.id` NULL | Self-ref tree |
| `children` | — | — | `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true)` |
| `mqtId` | `mqt_id` | `VARCHAR(64)` NOT NULL | Snapshot `Mqt.id` |
| `name` | `name` | `VARCHAR(255)` | Snapshot name |
| `sortOrder` | `sort_order` | `INT` NOT NULL | |

---

**`published_questionnaire_questions`** — → `PublishedQuestionnaireQuestion`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `questionnaire` | `questionnaire_id` | FK | `@ManyToOne(LAZY)` |
| `snapshotQuestionId` | `snapshot_question_id` | `VARCHAR(64)` NOT NULL | Author-assigned stable ID; used by portal to match answers |
| `stem` | `stem` | `TEXT` | |
| `format` | `format` | `VARCHAR(32)` | e.g., `MCQ`, `FREE_TEXT` |
| `mediaUrl` | `media_url` | `TEXT` | |
| `mediaType` | `media_type` | `VARCHAR(20)` | |
| `clinicalRiskFlag` | `clinical_risk_flag` | `TINYINT(1)` NOT NULL | |
| `riskFlagRule` | `risk_flag_rule` | `TEXT` | |
| `sectionId` | `section_id` | `VARCHAR(64)` | |
| `sectionTitle` | `section_title` | `VARCHAR(255)` | |
| `sortOrder` | `sort_order` | `INT` NOT NULL | |
| `options` | (child table) | — | `@OneToMany(mappedBy="question", cascade=ALL, orphanRemoval=true)` ordered by `sortOrder` |
| `questionScores` | (child table) | — | `@OneToMany(mappedBy="question", cascade=ALL, orphanRemoval=true)` |

---

**`published_questionnaire_question_options`** → `PublishedQuestionnaireQuestionOption`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `question` | `pq_question_id` | FK | |
| `sortOrder` | `sort_order` | `INT` NOT NULL | |
| `text` | `text` | `TEXT` | |
| `mediaUrl` | `media_url` | `TEXT` | |
| `mediaType` | `media_type` | `VARCHAR(20)` | |
| `scores` | (child table) | — | `@OneToMany` → `PublishedQuestionnaireQuestionOptionScore` |

---

**`published_questionnaire_question_option_scores`** → `PublishedQuestionnaireQuestionOptionScore`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `option` | `pq_option_id` | FK | |
| `mqtId` | `mqt_id` | `VARCHAR(64)` NOT NULL | |
| `score` | `score` | `DOUBLE` NOT NULL | |

`UNIQUE KEY uniq_pq_option_mqt (pq_option_id, mqt_id)`.

---

**`published_questionnaire_question_scores`** → `PublishedQuestionnaireQuestionScore`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `question` | `pq_question_id` | FK | |
| `mqtId` | `mqt_id` | `VARCHAR(64)` NOT NULL | |
| `score` | `score` | `DOUBLE` NOT NULL | |

`UNIQUE KEY uniq_pq_question_mqt (pq_question_id, mqt_id)`. Credited when respondent answers the question regardless of which option is selected.

---

**`assessments`** — `@Table(name = "assessments")` → `Assessment`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `name` | `name` | `VARCHAR(255)` | |
| `questionnaireId` | `questionnaire_id` | `VARCHAR(64)` NOT NULL | FK → `questionnaires.id` (the family parent) |
| `questionnaireVersionId` | `questionnaire_version_id` | `VARCHAR(64)` | FK → `published_questionnaires.id` — immutably pinned |
| `questionnaireName` | `questionnaire_name` | `VARCHAR(255)` | Denormalized display cache |
| `vertical` | `vertical` | `VARCHAR(64)` | |
| `language` | `language` | `VARCHAR(32)` | |
| `status` | `status` | `VARCHAR(16)` NOT NULL DEFAULT `'ACTIVE'` | `ACTIVE` / `CLOSED` / `PAUSED` |
| `createdAt` | `created_at` | `TIMESTAMP` | `insertable=false, updatable=false` |
| `createdBy` | `created_by` | `VARCHAR(64)` | |
| `updatedAt` | `updated_at` | `TIMESTAMP` | `insertable=false, updatable=false` |

`AssessmentRepository.countByQuestionnaireVersionId()` gates version-draft deletion: a version cannot be deleted while assessments are pinned to it.

---

**`assessment_entity_allotments`** — `@Table(name="assessment_entity_allotments")` → `AssessmentEntityAllotment`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `assessmentId` | `assessment_id` | `VARCHAR(64)` PK (composite) | `@Id @Column(name="assessment_id")` |
| `entityId` | `entity_id` | `VARCHAR(64)` PK (composite) | `@IdClass(AssessmentEntityAllotmentId.class)` |
| `cap` | `cap` | `INT` NULL | Per-pair respondent cap; null = unlimited |
| `createdAt` | `created_at` | `TIMESTAMP` | |
| `createdBy` | `created_by` | `VARCHAR(64)` | |

`PortalSessionRepository.countByAssessmentIdAndEntityId()` enforces the cap at session-creation time.

---

**`assessment_group_allotments`** — → `AssessmentGroupAllotment`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `assessmentId` | `assessment_id` | `VARCHAR(64)` PK (composite) | |
| `groupId` | `group_id` | `VARCHAR(64)` PK (composite) | |
| `createdAt` / `createdBy` | — | | |

No cap column — group allotments fan out to all current members.

---

**`assessment_respondent_allotments`** — → `AssessmentRespondentAllotment`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `assessmentId` | `assessment_id` | `VARCHAR(64)` PK (composite) | |
| `respondentId` | `respondent_id` | `VARCHAR(64)` PK (composite) | |
| `createdAt` / `createdBy` | — | | |

One row = one respondent's direct eligibility for the assessment.

---

**`assessment_tokens`** — `@Table(name = "assessment_tokens")` → `AssessmentToken`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `token` | `token` | `VARCHAR(64)` PK | Cryptographically random opaque string; also the PK |
| `assessmentId` | `assessment_id` | `VARCHAR(64)` NOT NULL | |
| `entityId` | `entity_id` | `VARCHAR(64)` NULL | Scope: entity-level link |
| `groupId` | `group_id` | `VARCHAR(64)` NULL | Scope: group-level link |
| `respondentId` | `respondent_id` | `VARCHAR(64)` NULL | Scope: individual pre-bound invite |
| `maxUses` | `max_uses` | `INT` NULL | NULL = unlimited |
| `usedCount` | `used_count` | `INT` NOT NULL DEFAULT 0 | |
| `expiresAt` | `expires_at` | `TIMESTAMP` NULL | |
| `createdAt` / `createdBy` | — | | |
| `qrCode` | `qr_code` | `LONGBLOB` | PNG bytes generated once on first QR request; `@Lob @Column(columnDefinition="LONGBLOB")` |

`AssessmentTokenRepository.findByScope()` is used to reuse an already-issued live token for the same (assessment, entity, group, respondent) tuple — null-safe matching so `NULL` only matches `NULL`.

---

**`portal_sessions`** — `@Table(name = "portal_sessions")` → `PortalSession`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `VARCHAR(64)` PK | |
| `assessmentId` | `assessment_id` | `VARCHAR(64)` NULL | Group key tying N sessions to one allotment act |
| `name` | `name` | `VARCHAR(255)` | Assessment name (display) |
| `respondentId` | `respondent_id` | `VARCHAR(64)` NOT NULL | Indexed |
| `respondentName` | `respondent_name` | `VARCHAR(255)` NOT NULL | Denormalized |
| `respondentEmail` | `respondent_email` | `VARCHAR(255)` | Denormalized |
| `instrument` | `instrument` | `VARCHAR(255)` NOT NULL | Short name |
| `instrumentFullName` | `instrument_full_name` | `VARCHAR(255)` | |
| `vertical` | `vertical` | `VARCHAR(64)` | |
| `language` | `language` | `VARCHAR(64)` NOT NULL DEFAULT `'English'` | |
| `status` | `status` | `VARCHAR(32)` NOT NULL DEFAULT `'Active'` | `Active`, `Completed`, `Pending Review` |
| `score` | `score` | `VARCHAR(255)` | Computed overall score string |
| `answers` | (child table) | — | `@OneToMany(mappedBy="session", cascade=ALL, orphanRemoval=true)` → `assessment_answers` |
| `mqtScores` | (child table) | — | `@OneToMany` → `portal_session_mqt_scores` |
| `demographics` | (child table) | — | `@OneToMany` → `portal_session_demographics` |
| `groupId` | `group_id` | `VARCHAR(64)` | Respondent group FK |
| `groupName` | `group_name` | `VARCHAR(255)` | Denormalized |
| `entityId` | `entity_id` | `VARCHAR(64)` | Entity FK; drives per-(entity, assessment) cap |
| `entityName` | `entity_name` | `VARCHAR(255)` | Denormalized |
| `consentId` | `consent_id` | `VARCHAR(64)` | |
| `proctoring` | `proctoring` | `TINYINT(1)` NOT NULL DEFAULT 0 | |
| `invitationSent` | `invitation_sent` | `TINYINT(1)` NOT NULL DEFAULT 0 | |
| `showQuestionIndex` | `show_question_index` | `TINYINT(1)` NOT NULL DEFAULT 0 | Per-session override for numbered question panel |
| `createdAt` | `created_at` | `TIMESTAMP` | `insertable=false, updatable=false` |
| `updatedAt` | `updated_at` | `TIMESTAMP` | `insertable=false, updatable=false` |
| `completedAt` | `completed_at` | `TIMESTAMP` NULL | Set when status → Completed |
| `startedAt` | `started_at` | `TIMESTAMP` NULL | Set on first answer submission; drives "not started" notifications |

The `showQuestionIndex` column was previously on `published_questionnaires` and was migrated to per-session override per the DDL comment in `01-schema.sql`.

`PortalSessionRepository` is the most query-rich repository. Key non-trivial queries:
- `findAllSummariesOrderByCreated()` and variants: constructor-projection `SELECT new AssessmentSummaryDto(...)` that selects only the 10 fields the list view needs, bypassing the lazy `answers`/`mqtScores`/`demographics` collections entirely.
- `findAssessmentGroups()`: groups by `assessmentId`, uses JPQL `SUM(CASE WHEN ...)` to produce aggregate counts (`total`, `completed`, `active`, `pendingReview`) in a single pass.
- `findAssessmentSummaries()`: groups by `(instrument, groupId)` for the live-assessment dashboard tile.
- `countByAssessmentIdAndEntityId()`: scalar count for cap enforcement.

---

**`assessment_answers`** — `@Table(name="assessment_answers")` → `AssessmentAnswer`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `session` | `session_id` | FK → `portal_sessions.id` | `@ManyToOne(LAZY)` |
| `questionId` | `question_id` | `VARCHAR(64)` NOT NULL | |
| `optionIndex` | `option_index` | `INT` NULL | MCQ answer |
| `freeText` | `free_text` | `TEXT` NULL | Free-text answer |

`UNIQUE KEY uniq_answer_session_question (session_id, question_id)`.

---

**`portal_session_mqt_scores`** — → `PortalSessionMqtScore`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `session` | `session_id` | FK | `@ManyToOne(LAZY)` |
| `mqtId` | `mqt_id` | `VARCHAR(64)` NOT NULL | |
| `mqtName` | `mqt_name` | `VARCHAR(255)` | Cached label for report rendering |
| `score` | `score` | `DOUBLE` NOT NULL | |

`UNIQUE KEY uniq_session_mqt (session_id, mqt_id)`.

---

**`portal_session_demographics`** — → `PortalSessionDemographic`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO | |
| `session` | `session_id` | FK | `@ManyToOne(LAZY)` |
| `fieldKey` | `field_key` | `VARCHAR(128)` NOT NULL | |
| `value` | `value` | `TEXT` | Any primitive value as string |

`UNIQUE KEY uniq_session_field (session_id, field_key)`.

---

**`items`** — `@Table(name = "items")` → `Item`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `CHAR(36)` PK | `@Column(columnDefinition="char(36)")` |
| `instrumentId` | `instrument_id` | `CHAR(36)` FK → `instruments.id` | |
| `vertical` | `vertical` | `VARCHAR(32)` NOT NULL | Indexed with `sub_domain`, `validation_status` |
| `subDomain` | `sub_domain` | `VARCHAR(100)` | Single-domain shortcut |
| `questionScores` | (child table) | — | `@OneToMany(mappedBy="item", cascade=ALL, orphanRemoval=true)` → `item_question_scores` |
| `itemFormat` | `item_format` | `VARCHAR(32)` DEFAULT `'MCQ'` | |
| `stem` | `stem` | `TEXT` NOT NULL | |
| `mediaUrl` | `media_url` | `TEXT` | |
| `mediaType` | `media_type` | `VARCHAR(20)` | |
| `options` | (child table) | — | `@OneToMany(mappedBy="item", cascade=ALL, orphanRemoval=true) @OrderBy("sortOrder ASC")` |
| `irtA` | `irt_a` | `DOUBLE` | IRT discrimination |
| `irtB` | `irt_b` | `DOUBLE` | IRT difficulty |
| `irtC` | `irt_c` | `DOUBLE` NOT NULL DEFAULT 0 | IRT guessing |
| `validationStatus` | `validation_status` | `VARCHAR(20)` DEFAULT `'DRAFT'` | |
| `riskFlag` | `clinical_risk_flag` | `TINYINT(1)` | |
| `riskRule` | `risk_flag_rule` | `TEXT` | |
| `sequenceOrder` | `sequence_order` | `INT` | |
| `languages` | (join table) | — | `@ElementCollection(EAGER)` → `item_languages(item_id, language)` |
| `createdAt` | `created_at` | `TIMESTAMP` | |

---

**`item_options`** → `ItemOption`, **`item_option_scores`** → `ItemOptionScore`, **`item_question_scores`** → `ItemQuestionScore`

These three tables form the normalized replacement for the former `items.options` and `items.sub_domains` JSON arrays.

`item_options`: `(id BIGINT AUTO, item_id, sort_order, text TEXT, media_url TEXT, media_type)`. One row per MCQ option.
`item_option_scores`: `(id BIGINT AUTO, option_id FK, mqt_id VARCHAR(64), score DOUBLE)`. `UNIQUE(option_id, mqt_id)`.
`item_question_scores`: `(id BIGINT AUTO, item_id FK, mqt_id VARCHAR(64), score DOUBLE)`. `UNIQUE(item_id, mqt_id)`.

---

**`instruments`** — `@Table(name = "instruments")` → `QuestionnaireCatalog`

This entity maps the `instruments` table (the original multi-tenant catalog concept) using `@TypeDef(name="json-node", typeClass=JsonNodeStringType.class)`. After `JsonToTableMigrationRunner` the JSON columns (`informant_types`, `metadata`, `languages`, `scoring_config`) are dropped. The entity exposes `scoring_model` (a scalar `VARCHAR(32)` column written from `scoring_config.model` during migration).

---

**`item_display_state`** — `@Table(name = "item_display_state")` → `ItemDisplayState`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `itemId` | `item_id` | `VARCHAR(64)` PK | `@Id @Column(name="item_id")` |
| `deleted` | `deleted` | `TINYINT(1)` NOT NULL DEFAULT 0 | Tombstone flag for questionnaire builder |

The former `override` JSON column is dropped by the migration runner; it was never populated in production.

---

**`audit_log`** — `@Table(name = "audit_log")` → `AuditLogEntry`

| Field | Column | SQL type | Notes |
|---|---|---|---|
| `id` | `id` | `BIGINT` PK AUTO_INCREMENT | `@GeneratedValue(IDENTITY)` |
| `actorId` | `actor_id` | `VARCHAR(64)` | |
| `actorName` | `actor_name` | `VARCHAR(255)` | |
| `action` | `action` | `VARCHAR(64)` NOT NULL | Stable codes: `ENTITY_ACTIVATED`, `ASSESSMENT_PAUSED`, `ALLOTMENT_ADDED`, … |
| `targetType` | `target_type` | `VARCHAR(64)` | `entity`, `assessment`, `entity_allotment`, … |
| `targetId` | `target_id` | `VARCHAR(128)` | ID of affected row |
| `beforeJson` | `before_json` | `TEXT` | Snapshot before change |
| `afterJson` | `after_json` | `TEXT` | Snapshot after change |
| `createdAt` | `created_at` | `TIMESTAMP` | `insertable=false, updatable=false` |

`AuditLogRepository.findByTarget()` retrieves all audit events for a specific `(targetType, targetId)` pair, newest first. `findAllRecent()` retrieves the global log, newest first.

---

**DDL-only tables** (defined in `01-schema.sql`, not directly mapped by a top-level `@Entity`):

| Table | Purpose |
|---|---|
| `tenants` | Multi-tenant scaffold. Has `id`, `name`, `slug`, `domain`, `vertical`, `tier`, `is_whitelabel`, `status`. The `branding` JSON column is dropped by the migration runner. Not currently mapped to a Spring entity. |
| `users` (legacy) | Pre-rewrite legacy user table. Kept in DDL because the sessions list query (`sessions` table) once joined against it; `sessions` itself is dropped by the migration runner. Not mapped by any Spring `@Entity`. |
| `sessions` | The original IRT session table (one per active CAT session). Entirely superseded by `portal_sessions`. Dropped at runtime by `JsonToTableMigrationRunner`. |

---

#### 6.2 Indexes and Foreign Keys (from `01-schema.sql`)

| Table | Index / FK |
|---|---|
| `users` | `UNIQUE (tenant_id, email)`, `INDEX (email)`, `INDEX (role)`, `FK → tenants(id)` |
| `instruments` | `INDEX (vertical)`, `INDEX (tier_required)`, `FK → tenants(id)` |
| `items` | `INDEX (instrument_id)`, `INDEX (vertical, sub_domain, validation_status)`, `FK → instruments(id)` |
| `sessions` | `INDEX (tenant_id, practitioner_id, respondent_id, status, vertical)`, `FK → tenants(id)`, `FK → instruments(id)` |
| `respondent_groups` | `INDEX (parent_id)`, `FK (parent_id) ... ON DELETE CASCADE` |
| `portal_sessions` | `INDEX (respondent_id)`, `INDEX (status)` |
| `published_questionnaires` | `INDEX (name)`, `INDEX (short_name)` |
| `verticals` | `INDEX (code)` |
| `roles` | `INDEX (name)` |

No FK is declared from `portal_sessions.respondent_id` → `respondents.id`, nor from `portal_sessions.assessment_id` → `assessments.id`. These are application-enforced logical relationships only. This is a deliberate trade-off for migration safety and soft-delete/archiving flexibility.

---

### 7. Exception Handling

All exceptions propagate to `GlobalExceptionHandler` (`@RestControllerAdvice`), which maps them to HTTP status codes and builds a uniform `ApiErrorResponse` JSON envelope.

#### 7.1 `ApiErrorResponse`

```java
{
  "status":    <HTTP status code (int)>,
  "error":     <HTTP status reason phrase>,
  "message":   <human-readable message string>,
  "timestamp": <ISO-8601 LocalDateTime>,
  "path":      <request URI>
}
```

Constructed from `HttpServletRequest` so the path is always the original URI.

#### 7.2 Custom exception hierarchy

All custom exceptions extend `RuntimeException` (unchecked), so they propagate through the service layer without requiring `throws` declarations.

| Exception class | HTTP status | Constructor |
|---|---|---|
| `ResourceNotFoundException` | `404 NOT_FOUND` | `(resourceName, fieldName, fieldValue)` or `(message)`. Formats message as `"{resource} not found with {field} : '{value}'"` |
| `BadRequestException` | `400 BAD_REQUEST` | `(message)` or `(message, cause)` |
| `DuplicateResourceException` | `409 CONFLICT` | `(message)` |
| `UnauthorizedAccessException` | `401 UNAUTHORIZED` | `(message)` |
| `ServiceException` | `500 INTERNAL_SERVER_ERROR` | `(message)` or `(message, cause)`. Also logs at `ERROR` level. |

#### 7.3 Framework exception mappings

| Spring/Java exception | HTTP status | Handler behavior |
|---|---|---|
| `MethodArgumentNotValidException` | `400` | Concatenates all field-level `FieldError` messages as `"fieldName: message; fieldName2: message2"` |
| `HttpMessageNotReadableException` | `400` | Returns `"Malformed request body"` |
| `NoHandlerFoundException` | `404` | Returns `"Endpoint not found: {uri}"` |
| `HttpRequestMethodNotSupportedException` | `405` | Passes through Spring's default message |
| `AccessDeniedException` (Spring Security) | `403` | Returns `"You do not have permission to perform this action"` |
| `Exception` (catch-all) | `500` | Logs at `ERROR` with URI and message, returns `"An unexpected error occurred"` |

The catch-all handler ensures no stack trace or internal detail leaks to the client.

---

### 8. Repository Layer

All 22 repositories extend `JpaRepository<Entity, Id>` and are annotated `@Repository`. Spring Data provides `findById`, `findAll`, `save`, `delete`, and pagination/sorting methods for free. Custom behavior is added via `@Query` JPQL or native SQL.

#### 8.1 Naming and query conventions

- All `findAll*` custom methods include `ORDER BY` clauses (typically `createdAt DESC`) because JPA provides no default ordering guarantee.
- Case-insensitive lookups (email, name, vertical) use `LOWER()` on both sides.
- Constructor-projection queries (`SELECT new com.bodhpsychometric...Dto(...)`) produce flat DTOs populated directly from the query without loading entity child collections. This is the primary optimization for list views.

#### 8.2 Notable queries by repository

**`PortalSessionRepository`** — most complex:

```java
// Aggregation: one row per assessment, counts by status
@Query("SELECT new AssessmentGroupDto(s.assessmentId, MAX(s.name), ..., COUNT(s),
        SUM(CASE WHEN s.status = 'Completed' THEN 1 ELSE 0 END), ...)
        FROM PortalSession s WHERE s.assessmentId IS NOT NULL
        GROUP BY s.assessmentId ORDER BY MAX(s.createdAt) DESC")
List<AssessmentGroupDto> findAssessmentGroups();

// Cap enforcement
@Query("SELECT COUNT(s) FROM PortalSession s WHERE s.assessmentId = :aid AND s.entityId = :eid")
long countByAssessmentIdAndEntityId(...);

// Null-safe group filter
@Query("SELECT s FROM PortalSession s WHERE s.instrument = :instrument
        AND ((:groupId IS NULL AND s.groupId IS NULL) OR s.groupId = :groupId)
        ORDER BY s.createdAt DESC")
List<PortalSession> findByInstrumentAndGroup(...);
```

**`PublishedQuestionnaireRepository`**:
- `SIZE(q.questions)` in a constructor projection avoids fetching question rows; Hibernate translates this to a correlated `COUNT`.
- `findOthersByName()` — used before deletion to find and cascade-delete name collisions.
- Five version-aware queries for the DRAFT/COMMITTED lifecycle picker.

**`PractitionerRepository`**:
- `findActiveByEmailAndDob()` — exact LOWER() email + `LocalDate` DOB + `status='Active'`. This is the practitioner login lookup.
- `findByEmailForDebug()` — debug-only diagnostic that matches email only, for diagnosing login failures. The comment marks it for removal once login is confirmed stable.

**`RespondentRepository`**:
- `findDuplicates()` — three-channel dedup (email OR phone OR companyId) with null-safe guards using ternary JPQL: `(:email IS NOT NULL AND LOWER(r.email) = LOWER(:email))`.

**`AssessmentTokenRepository`**:
- `findByScope()` — null-safe four-way scope match `(assessmentId, entityId, groupId, respondentId)` to reuse an already-issued token.

**`RoleRepository`**:
- `findUrlPathsByRoleNames()` — **native query**: `SELECT DISTINCT rup.url_path FROM role_url_paths rup JOIN roles r ON r.id = rup.role_id WHERE r.name IN (:names)`. Returns the union of allowed URL paths for a set of role names.

**`UserRepository`**:
- `findByEmailAndDob()` — the unified login lookup for `app_users` (super-admin and portal users share this table).

---

### 9. Design Decisions and Notable Patterns

**`ddl-auto=update` vs. managed migrations**: The team chose `update` for developer agility and relies on the two `ApplicationRunner` shims (`JsonToTableMigrationRunner`, `QuestionnaireVersioningMigrationRunner`) to handle the complex structural changes that Hibernate cannot express (column drops, data transformations, table renames). The canonical `01-schema.sql` acts as a reference for what a fresh database should look like. This approach works but introduces a class of risks: column renames leave orphan columns; constraint changes (NOT NULL → nullable) require manual intervention; rollbacks require reversing the data migration in code. An engineer reading this should treat `01-schema.sql` as ground truth and the `ApplicationRunner` shims as a migration history in code form.

**No ENUM types**: PostgreSQL ENUMs were explicitly mapped to `VARCHAR` with validation in application code. This means invalid enum values can be inserted directly via SQL and will not be caught at the DB level. All status columns (`ACTIVE/CLOSED/PAUSED`, `DRAFT/COMMITTED`, etc.) are plain strings.

**String PKs throughout**: Application-generated UUIDs or short IDs are used everywhere. This avoids auto-increment PKs leaking row counts, enables ID generation before insert (useful for setting FKs before persisting), and simplifies cross-system data exchange. The trade-off is slightly larger index footprint vs. `BIGINT` PKs.

**Denormalization on `portal_sessions`**: `respondent_name`, `respondent_email`, `instrument`, `instrument_full_name`, `vertical`, `group_name`, `entity_name` are all cached on the session row at creation time. This makes list-view queries (which render these fields for every row) a single-table scan. The trade-off is that changing a respondent's name or an instrument's name does not retroactively update session rows.

**`@Where` for tree roots**: `MeasuredQuality.mqts` and `PublishedQuestionnaireMq.mqts` both use `@Where(clause = "parent_mqt_id IS NULL")` / `@Where(clause = "parent_id IS NULL")`. This is a Hibernate-specific annotation that appends the WHERE clause to the collection query. It ensures only root-level nodes appear in the parent's collection; deep traversal goes through `Mqt.getChildren()` or `PublishedQuestionnaireMqt.getChildren()` recursively.

**`open-in-view=false` and lazy loading**: With `open-in-view=false`, any service method that accesses a lazy association must be annotated `@Transactional`. Repositories accessed outside a transaction context (e.g., in controller-layer code that calls a repository directly without a service) will throw `LazyInitializationException`. All business logic that traverses the entity graph should live in `@Transactional` service methods.

**Token-as-PK**: `AssessmentToken` uses the opaque random token string as both the PK and the registration URL parameter. This is sound — the token is cryptographically generated and there is no need for a separate surrogate key.

**QR code stored as LONGBLOB**: `AssessmentToken.qrCode` is persisted as `LONGBLOB` and generated exactly once per token (the service generates it on the first QR request, then every subsequent download reads the stored bytes). ZXing `MatrixToImageWriter` is the rendering engine. This avoids repeated generation cost but means QR images accumulate in the database; at scale this column should be offloaded to object storage.

---

### 10. Connections to Other Subsystems

| Subsystem | Connection |
|---|---|
| **Security / Auth** | `UserRepository.findByEmailAndDob()`, `PractitionerRepository.findActiveByEmailAndDob()` are the credential lookup entry points called by the JWT authentication filter. The `app.auth.tokenSecret` property is consumed by `JwtTokenProvider`. The `app.bootstrap.*` properties feed `IdentityBootstrapRunner`. |
| **Questionnaire authoring** | `QuestionnaireRepository`, `PublishedQuestionnaireRepository`, `ItemRepository`, `ItemDisplayStateRepository`, `MeasuredQualityRepository` are the persistence layer for the authoring subsystem. The migration runners are activated when the authoring data model is first observed (legacy JSON shape) and normalize it to the relational schema. |
| **Assessment lifecycle** | `AssessmentRepository`, `AssessmentEntityAllotmentRepository`, `AssessmentGroupAllotmentRepository`, `AssessmentRespondentAllotmentRepository`, `AssessmentTokenRepository` back the allotment and token-issuance flows. The `portal_sessions`-rooted entity graph (`PortalSession`, `AssessmentAnswer`, `PortalSessionMqtScore`, `PortalSessionDemographic`) backs the session lifecycle and scoring output. |
| **Portal / respondent portal** | `PortalSessionRepository` is the primary query target for the respondent-facing portal (session state, answers) and the admin dashboard (list views, aggregates). |
| **Redis heartbeat** | `app.heartbeat.ttl-seconds=30` / `app.heartbeat.idle-threshold-seconds=15` are consumed by the heartbeat service (separate Redis component) to maintain live-tracking state per `portal_sessions.id`. No JPA entity is involved in the heartbeat path — it is purely Redis key-value. |
| **Audit** | `AuditLogRepository.findByTarget()` is called by the entity/assessment management subsystem to render per-resource history. All writes go through the repository directly from service code as append-only inserts. |

---


## Frontend SPA Architecture & API Integration

### Purpose and Responsibilities

The BodhAssess frontend is a React 19 Single-Page Application that serves as the primary user interface for two distinct surfaces sharing a single bundle:

1. **Practitioner Dashboard** — a multi-section administrative interface used by super admins and role-restricted practitioners to author questionnaires, create and allot assessments, manage respondents and entities, track live sessions, and view reports.
2. **Respondent Portal** — a minimal, respondent-facing surface through which test-takers log in, view their assigned assessments, complete them question-by-question, and submit responses.

A third surface — the **Public Registration / Token Claim flow** — handles anonymous registrants arriving via admin-issued invite links.

The SPA consumes the Spring Boot JSON API exclusively through a typed fetch client in `lib/api.ts`. There is no local-storage persistence of domain data (the codebase contains deliberate stubs in `lib/data-store.ts` for legacy callers); all reads and writes round-trip to the backend.

---

### Technology Stack

| Concern | Choice | Key details |
|---|---|---|
| Framework | React 19 | `react` + `react-dom` v19.2.1 |
| Build tool | Vite 7 + `@vitejs/plugin-react` | Configured in `vite.config.ts`; `@tailwindcss/vite` for CSS |
| Language | TypeScript 5.9 | Strict; `tsc -b` in CI |
| Routing | React Router v7 | `createBrowserRouter`; all routes registered in `src/router.tsx` |
| Server state | TanStack Query v5 (`@tanstack/react-query`) | Global `QueryClient` in `App.tsx`; `staleTime: 30_000`, no refetch on focus |
| UI components | shadcn/ui + Radix UI + Lucide icons | `components.json` alias; zinc base colour; Tailwind CSS v4 |
| Forms | `react-hook-form` + `@hookform/resolvers` + `zod` | Per-form local validation |
| Charts | ApexCharts + Recharts | Dashboard KPIs and reports |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Questionnaire item ordering |
| Spreadsheet grid | `@glideapps/glide-data-grid` v6 | Canvas-based; dataset views |
| Date handling | `date-fns` v4 | Formatting only; no global state |
| Theme | `next-themes` | Light/dark toggle; persisted as `bodhassess-theme` in localStorage |
| Toast | `sonner` | Global `<Toaster />` mounted in `App.tsx` |
| HTTP | Native `fetch` | Wrapped in `lib/api.ts#jsonFetch` |
| i18n | `react-i18next` | Installed but minimally used in current pages |

---

### Project Layout

```
bodhassess-app/
├── lib/                    # Non-JSX utilities and the API client
│   ├── api.ts              # ALL backend calls; every TypeScript interface
│   ├── config.ts           # VITE_* env-var reader; exports `config` constant
│   ├── data-store.ts       # Thin wrapper; re-exports types; legacy stubs
│   ├── practitioner-auth.tsx  # PractitionerAuthProvider + usePractitionerAuth hook
│   └── practitioner-auth-utils.ts  # Pure helpers: token helpers, canAccess(), pathMatchesPattern()
├── hooks/                  # Generic UI hooks (use-mobile, use-scroll-position, etc.)
├── config/                 # Layout config files (layout-1 through layout-34)
├── components/             # Shared UI components (from Metronic/shadcn base)
│   └── screen-loader.tsx   # Full-page loading spinner
├── src/
│   ├── main.tsx            # React mount point
│   ├── App.tsx             # QueryClient + ThemeProvider + RouterProvider
│   ├── router.tsx          # Full route tree (createBrowserRouter)
│   ├── lib/
│   │   └── router-helpers.tsx  # useRouter(), usePathname(), useSearchParams(), Link shim
│   ├── components/
│   │   ├── app-shell.tsx        # Dashboard chrome wrapper (Layout1 + Outlet)
│   │   ├── private-route.tsx    # Auth + RBAC guard component
│   │   ├── public-route.tsx     # Bounces authenticated users away from /login
│   │   └── data-grid/
│   │       └── DataGrid.tsx     # Glide Data Grid wrapper component
│   └── pages/              # Route-level page components (code-split per route)
│       ├── admin/          # Groups, Permissions, Practitioners, Respondents,
│       │                   # EntityRegistrations, EntityDrillIn, Roles, LiveTracking, DataGrid
│       ├── assessments/    # AllAssessments, Create, Edit, Batch, Browse, Respondents, InviteOrCopy, Take
│       ├── clinical/       # Clients, MseUpload, RiskAlerts, Tracking
│       ├── compliance/     # Audit, Consent, Erasure, Portal
│       ├── counselling/    # Consent, Developmental, MultiInformant, Students
│       ├── experiments/    # Builder, Export, Paradigms
│       ├── industrial/     # AiAdaptability, Cohorts, Competency, Proctoring
│       ├── portal/         # Login, Assessments, Take, Complete (respondent surface)
│       ├── question-bank/  # ItemExplorer, CreateQuestionnaire, Calibration, Norms
│       ├── questionnaires/ # AllQuestionnaires, Parents, Versions, per-vertical views, Demographics
│       ├── reports/        # AllReports, Clinical, Counselling, Industrial
│       ├── settings/       # Integrations, Tenant, Tiers
│       └── white-label/    # Api, Branding, Tenants
└── public/
    └── respondents-template.csv   # CSV template for bulk respondent upload
```

---

### Configuration and Environment Variables

All environment is read through `lib/config.ts` which calls `import.meta.env.*` via a `read(key, fallback)` helper. Vite inlines only `VITE_*`-prefixed variables at build time.

| Config key | `config.ts` field | Default | Purpose |
|---|---|---|---|
| `VITE_API_URL` | `config.apiBase` | `http://localhost:4000/api/v1` | Spring Boot API base; every `jsonFetch` call prepends this |
| `VITE_APP_NAME` | `config.appName` | `BodhAssess` | Brand name in page titles and toasts |
| `VITE_AUTH_STORAGE_KEY` | `config.authStorageKey` | `bodhassess.auth.token` | `sessionStorage` key for the respondent portal JWT |
| `VITE_PRACTITIONER_AUTH_STORAGE_KEY` | `config.practitionerAuthStorageKey` | `bodhassess.practitioner.token` | `sessionStorage` key for the practitioner/admin dashboard JWT |
| `VITE_ADMIN_AUTH_STORAGE_KEY` | `config.adminAuthStorageKey` | `bodhassess.admin.token` | Reserved (not yet used in routing logic) |
| `VITE_BASE_PATH` | `config.basePath` | `""` | Sub-path mount; production uses `/dashboard` |

In production the SPA is served at `https://admin.bodh.biz/dashboard` (Nginx, Docker) with `VITE_BASE_PATH=/dashboard` baked into the build. The API is at `https://api.bodh.biz/api/v1`.

---

### Application Bootstrap (`App.tsx`, `main.tsx`, `src/router.tsx`)

`main.tsx` mounts `<App />` into `#root`. `App.tsx` composes the global providers in order:

```tsx
<ThemeProvider storageKey="bodhassess-theme" ...>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>
</ThemeProvider>
```

The `QueryClient` is constructed once with `defaultOptions.queries.staleTime = 30_000` and `refetchOnWindowFocus: false`. Most pages do **not** use TanStack Query hooks; they use `useEffect` + `setState` with direct `await` calls into `lib/api.ts`. TanStack Query is present in `package.json` and available to future refactors.

`createBrowserRouter` receives a flat `RouteObject[]` tree with `VITE_BASE_PATH` as `basename`. Every dashboard and portal page is code-split via `React.lazy` inside the `lazyPage()` helper, which wraps each import in `<Suspense fallback={<ScreenLoader />}>`.

---

### Route Tree and Guard Structure

The route tree in `src/router.tsx` uses a three-level structure:

```
<Root>                         ← mounts PractitionerAuthProvider once
  / → <HomePage>
  <PublicRoute>                ← bounces authenticated users to /dashboard
    /login
    /select-vertical
  /entity-registration         ← anonymous self-registration form
  /register                    ← token-based invite flow (public with ?token=…)
  /portal/login                ← respondent portal auth
  /portal/assessments          ← respondent session list
  /portal/take                 ← assessment-taking UI
  /portal/complete             ← submission confirmation
  /assessments/:id/take        ← PrivateRoute, no AppShell (full-screen)
  <PrivateRoute>               ← auth + RBAC gate
    <AppShell>                 ← Layout1 chrome (sidebar, header, footer)
      /dashboard
      /admin/*                 ← 10 admin pages
      /assessments/*           ← 8 assessment management pages
      /clinical/*, /compliance/*, /counselling/*
      /experiments/*, /industrial/*
      /question-bank/*         ← 4 question-bank pages
      /questionnaires/*        ← 7 questionnaire pages
      /reports/*, /settings/*, /white-label/*
  * → Navigate to /dashboard   ← catch-all
```

`Root` is a simple layout component that renders `<PractitionerAuthProvider>` above all routes so auth state is shared across navigations. It must live inside the router because the provider uses `useNavigate` and `useLocation` internally.

`AppShell` (`src/components/app-shell.tsx`) renders `<Layout1>` (the Metronic sidebar/header shell from `components/layouts/layout-1`) and an `<Outlet />`. Layout config variants (`config/layout-1.config.tsx` through `layout-34.config.tsx`) define which sidebar items are shown, but only Layout1 is currently wired.

---

### Authentication Architecture

There are two independent auth sessions, each backed by a separate `sessionStorage` key:

#### Practitioner / Admin Dashboard Auth

**Provider**: `lib/practitioner-auth.tsx` exports `PractitionerAuthProvider` and `usePractitionerAuth()`.

**Login flow** (`src/pages/login.tsx`):
1. User submits email + DOB (formatted as `DD/MM/YYYY` by `autoFormatDdmmyyyy`, converted to ISO by `ddmmyyyyToIso`).
2. `authApi.login(email, isoDob)` calls `POST /auth/login`. Returns `{ token, user: AuthUser }`.
3. If `user.isSuperAdmin === true` → `setDashboardToken(token)` writes to `sessionStorage` key `bodhassess.practitioner.token`; `login(token, user)` updates React state; `router.replace('/dashboard')`.
4. If not super-admin → token written to `bodhassess.auth.token`; hard redirect to `/portal/assessments` (respondent surface).

**Token validation on mount** (`PractitionerAuthProvider`):
1. On mount: read `sessionStorage` token via `getDashboardToken()`.
2. Call `authApi.me(token)` → `GET /auth/me`.
3. On success: `authUserToPractitionerMe(user)` adapts the flat `AuthUser` (with `url_paths`) into a `PractitionerMe` shape; state → `{ status: 'authenticated', me }`.
4. On failure: clear token; state → `{ status: 'unauthenticated' }`.

**Route protection** (`src/components/private-route.tsx`):
- `auth.status === 'loading'` or `'unauthenticated'` → render `<ScreenLoader />` (the provider handles the `router.replace('/login')` redirect via its own `useEffect`).
- `auth.status === 'authenticated'` but `!auth.canAccess(pathname)` → render an inline "Access denied" card with a sign-out button inside `<Layout1>`.
- Otherwise: render `children` or `<Outlet />`.

**RBAC** is enforced client-side via `canAccess(pathname, me.url_paths)`:
- `url_paths` comes from the merged union of all roles the user holds (returned by `/auth/me`).
- Super admins carry `url_paths: ['/*']` which matches every route.
- `pathMatchesPattern` supports exact (`/dashboard`), prefix-glob (`/admin/*`), and universal-glob (`/*`).
- Public path prefixes `['/login', '/portal', '/register', '/select-vertical']` always return `true` from `isPublicPath()`.

**Logout**: `clearDashboardToken()` removes the sessionStorage key; state → `unauthenticated`; best-effort `POST /auth/logout` server call; `router.replace('/login')`.

#### Respondent Portal Auth

The portal uses a separate sessionStorage key (`bodhassess.auth.token`) but now calls the **same** `/auth/login` unified endpoint introduced alongside the practitioner auth migration. Individual portal pages (`portal/login.tsx`, `portal/assessments.tsx`, `portal/take.tsx`) perform raw sessionStorage reads and manual redirects via `window.location.href` rather than the React auth context — the portal is intentionally decoupled from the dashboard's `PractitionerAuthProvider`.

**Portal login flow** (`src/pages/portal/login.tsx`):
1. `authApi.login(identifier, isoDob)` → `POST /auth/login`.
2. Token stored under `config.authStorageKey`.
3. Hard redirect to `/portal/assessments`.

---

### API Client (`lib/api.ts`)

All HTTP communication flows through the private `jsonFetch<T>(path, init?)` function:

```typescript
async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T>
```

Key behaviours:
- Prepends `config.apiBase` (`VITE_API_URL + /api/v1`).
- Auto-attaches `Authorization: Bearer <token>` in priority order: `bodhassess.practitioner.token` (dashboard session) then `bodhassess.auth.token` (portal session).
- Throws an `Error` with `[API <status>] <path>: <response-body>` on non-2xx responses — pages catch this and set local `error` state.
- Returns `null as T` for HTTP 204 and for non-`application/json` content-type responses.

#### API Namespaces

All API objects follow the same pattern: a named TypeScript interface plus an object literal of typed async functions (`list`, `get`, `create`, `update`, `delete`).

| Export | Base path | Methods |
|---|---|---|
| `authApi` | `/auth` | `login`, `me`, `logout` |
| `respondentsApi` | `/respondents` | `list`, `get`, `create`, `update`, `delete`, `bulk`, `login`, `me`, `logout` |
| `practitionersApi` | `/practitioners` | `list`, `get`, `create`, `update`, `delete` |
| `rolesApi` | `/roles` | `list`, `get`, `create`, `update`, `delete` |
| `groupsApi` | `/groups` | `list`, `get`, `create`, `update`, `delete` |
| `entityRegistrationsApi` | `/entity-registrations` | `list`, `get`, `create`, `update`, `delete` |
| `qualitiesApi` | `/qualities` | `list`, `get`, `create`, `update`, `delete` |
| `demographicFieldsApi` | `/demographic-fields` | `list`, `upsert`, `delete` |
| `itemDisplayApi` | `/item-display` | `list`, `upsertOverride`, `markDeleted`, `clear` |
| `questionnairesApi` | `/questionnaires` | `list`, `listSummaries`, `get`, `getByName`, `upsert`, `delete` |
| `assessmentsApi` (alias: `portalSessionsApi`) | `/assessments` | `list`, `listSummaries`, `listGroups`, `listByAssessment`, `get`, `create`, `bulk`, `update`, `delete`, `heartbeat` |
| `assessmentRecordsApi` | `/assessment-records` | `list`, `get`, `create`, `update`, `updateStatus`, `delete`, `audit` |
| `assessmentAllotmentsApi` | `/assessment-records/:id/allotments` | `list`, `addEntity`, `updateEntityCap`, `removeEntity`, `addGroup`, `removeGroup`, `addRespondent`, `removeRespondent` |
| `assessmentTokensApi` | `/assessment-tokens` | `issue`, `listForAssessment`, `revoke` |
| `publicTokensApi` | `/public/tokens` | `resolve`, `consume`, `register`, `registrationCheck`, `qrUrl` |
| `auditApi` | `/audit` | `recent`, `byTarget` |
| `liveTrackingApi` | `/admin/live-tracking` | `listAssessments`, `listSessions` |
| `verticalsApi` | `/verticals` | `list`, `create`, `delete` |
| `questionnaireRecordsApi` | `/questionnaire-records` | `list`, `get`, `create`, `update`, `delete`, `setCurrentVersion`, `audit` |
| `questionnaireVersionsApi` | `/questionnaire-records/:parentId/versions` | `list`, `get`, `createDraft`, `editDraft`, `commit`, `discardDraft` |
| `datasetsApi` | `/datasets` | `sessions`, `patchSessionCells` |

#### Key TypeScript Interfaces

| Interface | Backend maps to | Key fields |
|---|---|---|
| `AuthUser` | `app_users` row | `id`, `email`, `name`, `isSuperAdmin`, `roles[]`, `url_paths[]` |
| `AuthLoginResponse` | `/auth/login` response | `token`, `user: AuthUser` |
| `Respondent` | `respondents` table | `id`, `name`, `email`, `phone`, `dob`, `consent`, `accountType`, `orgName` |
| `Practitioner` | `practitioners` / `app_users` | `id`, `name`, `email`, `roles[]`, `verticals[]`, `status`, `dob` |
| `PractitionerMe` | `/auth/me` response | extends `Practitioner`; adds `url_paths[]` |
| `Role` | `roles` table | `id`, `name`, `url_paths[]` |
| `Group` | `groups` table | `id`, `parentId`, `memberIds[]`, `assignedInstruments[]` |
| `EntityRegistration` | `entity_registrations` | `id`, `name`, `email`, `dob`, `active`, `member_ids[]` |
| `MQ` / `MQT` | `measured_qualities` / `mqts` | Recursive tree; `MQT.children?: MQT[]` |
| `PublishedQuestionnaire` | `published_questionnaires` snapshot | Full content: `mqs[]`, `questions[]`, `options[]`, `scores[]`, `demographicFieldKeys[]` |
| `QuestionnaireSummary` | Lightweight projection | `id`, `name`, `itemCount`, `vertical` |
| `Assessment` (= `PortalSession`) | `portal_sessions` | `id`, `assessmentId`, `respondentId`, `instrument`, `status`, `answers{}`, `mqtScores{}`, `demographics{}`, `showQuestionIndex`, `startedAt`, `completedAt` |
| `AssessmentRecord` | `assessment_records` | `id`, `name`, `questionnaireId`, `questionnaireVersionId`, `status: ACTIVE\|CLOSED\|PAUSED`, allotment counts |
| `AssessmentEntityAllotment` | junction table | `assessmentId`, `entityId`, `cap` (nullable = unlimited), `sessionsCount` |
| `AssessmentToken` | `assessment_tokens` | `token`, `assessmentId`, `entityId`, `groupId`, `respondentId`, `maxUses`, `usedCount`, `expiresAt` |
| `AuditLogEntry` | `audit_log` | `id`, `actorId`, `action`, `targetType`, `targetId`, `before`, `after` (JSON strings) |
| `QuestionnaireParent` | `questionnaire_records` | `id`, `name`, `currentVersionId`, `versions[]` |
| `QuestionnaireVersionSummary` | version rows | `id`, `parentId`, `versionMajor`, `versionMinor`, `status: DRAFT\|COMMITTED`, `isCurrent` |
| `DatasetColumn` | Backend-declared metadata | `key`, `label`, `type`, `group: core\|scores\|demographics`, `editable: none\|field\|answer\|override` |
| `DatasetRow` | One session row | `rowId`, `_updatedAt`, plus dynamic score and demographic keys |
| `MQTScore` | Embedded in `portal_sessions.mqt_scores` | `name`, `score`; legacy shape is `Record<string,number>` by name |

The `readMqtScores()` helper normalises both the current shape (`Record<string, { name, score }>` keyed by MQT id) and the legacy shape (`Record<string, number>` keyed by name) into a uniform `Array<{ key, name, score }>`.

---

### Key REST Endpoints (as Called by the Frontend)

| Method | Path | Auth required | Purpose |
|---|---|---|---|
| `POST` | `/auth/login` | None | Unified login; returns JWT + `AuthUser`; used by both `/login` (dashboard) and `/portal/login` |
| `GET` | `/auth/me` | Bearer (practitioner) | Token validation on mount; returns `url_paths` for RBAC |
| `POST` | `/auth/logout` | Bearer | Best-effort session invalidation |
| `GET` | `/respondents` | Bearer (practitioner) | List all respondents |
| `POST` | `/respondents/bulk` | Bearer | CSV-imported bulk respondent creation; returns `{ created, skipped, errors[] }` |
| `GET` | `/respondents/me` | Bearer (respondent) | Portal identity check |
| `GET` | `/assessments?respondentId=` | Bearer | List portal sessions, optionally filtered to one respondent |
| `GET` | `/assessments/summaries` | Bearer | Lightweight projection for list views |
| `GET` | `/assessments/groups` | Bearer | One row per `assessmentId` bulk key with aggregate counts |
| `PUT` | `/assessments/:id` | Bearer | Update session (answers, status, demographics, mqtScores, completedAt) |
| `POST` | `/assessments/:id/heartbeat` | Bearer | Respondent progress ping: `{ currentIndex, totalQuestions }` → Redis |
| `GET` | `/assessment-records` | Bearer | List first-class Assessment records (AllAssessments page) |
| `POST` | `/assessment-records` | Bearer | Create a new Assessment record with initial allotments |
| `PATCH` | `/assessment-records/:id/status` | Bearer | Change Assessment lifecycle status |
| `GET` | `/assessment-records/:id/allotments` | Bearer | Aggregate allotee list for the "Allotees" popup |
| `POST` | `/assessment-records/:id/allotments/entities` | Bearer | Add entity allotment (with optional cap) |
| `POST` | `/assessment-tokens` | Bearer | Issue a registration token (scoped to entity/group/respondent) |
| `GET` | `/assessment-tokens/by-assessment/:id` | Bearer | List tokens for the Invite/Copy-Link page |
| `GET` | `/public/tokens/:token` | None | Resolve token metadata for the `/register?token=…` page |
| `POST` | `/public/tokens/:token/register` | None | One-shot: create respondent, join entity, create session, consume token |
| `POST` | `/public/tokens/registration-check` | None | Pre-registration dedup by DOB + email/phone/companyId |
| `GET` | `/public/tokens/:token/qr?base=` | None | Server-generated QR PNG as image stream |
| `GET` | `/questionnaire-records` | Bearer | List questionnaire parent families (Question Bank) |
| `POST` | `/questionnaire-records/:id/versions/drafts` | Bearer | Branch a new draft version |
| `PATCH` | `/questionnaire-records/:id/versions/:vid` | Bearer | Edit a DRAFT version's content; backend rejects COMMITTED |
| `POST` | `/questionnaire-records/:id/versions/:vid/commit` | Bearer | Promote draft to COMMITTED with semver bump |
| `GET` | `/questionnaires/by-name?name=` | Bearer (portal) | Portal take-page: resolve instrument by name |
| `GET` | `/admin/live-tracking/assessments` | Bearer | Summary row per active instrument |
| `GET` | `/admin/live-tracking/assessments/sessions?instrument=&groupId=` | Bearer | Per-session heartbeat status (5 s poll) |
| `GET` | `/datasets/sessions` | Bearer | Self-describing column metadata + all rows for the DataGrid page |
| `PATCH` | `/datasets/sessions/cells` | Bearer | Batch audited cell edits; optimistic concurrency via `rowUpdatedAt` |
| `GET` | `/audit/:targetType/:targetId` | Bearer | Audit log for a specific entity/questionnaire/assessment |
| `GET` | `/health` | None | Dashboard health tile: `{ status, database, version, time }` |

---

### Main User-Facing Flows

#### 1. Practitioner Login (Dashboard)

1. `/login` renders an email + DOB form. `autoFormatDdmmyyyy` auto-inserts slashes as the user types; `ddmmyyyyToIso` converts to ISO before the API call.
2. On submit: `authApi.login(email, isoDob)` → `POST /auth/login`.
3. If `res.user.isSuperAdmin` → `PractitionerAuthProvider.login(token, user)` sets state; `router.replace('/dashboard')`. On next render `PractitionerAuthProvider` detects `status === 'authenticated'` and the `PublicRoute` wrapper navigates away from `/login`.
4. If not super-admin but auth succeeds → store token in `bodhassess.auth.token`; hard redirect to `/portal/assessments`.
5. Every dashboard navigation: `PrivateRoute` calls `auth.canAccess(pathname)` against the merged `url_paths` from step 2. Access denied renders an inline card; the user can sign out.

#### 2. Questionnaire Authoring (Question Bank + Create Questionnaire)

1. `/question-bank` (`ItemExplorer`) lists all questionnaire families from `/questionnaire-records`, with per-vertical filter. Inline actions: create new parent, soft-delete/restore via `itemDisplayApi`, drill to version history.
2. `/question-bank/create` (`CreateQuestionnaire`) is the full item-authoring editor. It loads MQs (`qualitiesApi.list`), verticals (`getVerticals` from `data-store.ts` which merges built-in + API), and demographic field catalogue (`demographicFieldsApi.list`). An editor state holds an array of questions; each question carries `stem`, `format`, `media_url/type`, and an array of `options`, each option carrying per-MQT `scores` referencing the MQT tree resolved by `flattenMqtsForPicker`. DnD reordering uses `@dnd-kit`. The save action calls `questionnairesApi.upsert()` → `POST /questionnaires`.
3. `/questionnaires/parents` lists questionnaire families. Each row links to `/questionnaires/:id/versions`.
4. `/questionnaires/:id/versions` shows three tabs:
   - **Versions** — all `COMMITTED` versions in semver-descending order; actions: "Set as current" (`PATCH /questionnaire-records/:id/current-version`), "Branch new draft" (`POST .../versions/drafts`).
   - **Drafts** — in-flight drafts; "Edit" links to the Create Questionnaire editor with `?draftId=…`; "Commit" opens a modal that calls `questionnaireVersionsApi.commit()` with a `MAJOR`/`MINOR` bump, version name, comments, and optional `setAsCurrent: true`.
   - **Audit** — flat `AuditLogEntry[]` from `auditApi.byTarget('questionnaire', parentId)`.

#### 3. Assessment Lifecycle (Practitioners)

1. **Create** (`/assessments/create`): practitioner fills name, picks a `QuestionnaireParent` (from `/questionnaire-records`), picks a committed `QuestionnaireVersionSummary` (loaded lazily on questionnaire change), selects language, and multi-selects entities (with per-entity caps), groups, and individual respondents from searchable pickers. On submit: `assessmentRecordsApi.create()` → `POST /assessment-records` with embedded `entityAllotments`, `groupAllotments`, `respondentAllotments`.
2. **All Assessments** (`/assessments`): lists `AssessmentRecord[]` from `/assessment-records`. In-row dropdown: Edit, Change Status (`PATCH .../status`), Allotees popup (loads `AssessmentAllotees` from `/assessment-records/:id/allotments`), Invite/Copy Link, Delete.
3. **Invite or Copy Link** (`/assessments/:id/invite` or `/assessments/:id/copy-link`): loads the assessment's allotees; UI lets the admin multi-select entities/groups/individuals or enter a standalone email; clicking "Issue Token" calls `assessmentTokensApi.issue()` → `POST /assessment-tokens`; the page renders the resulting link and a QR code image from `publicTokensApi.qrUrl(token, window.location.origin)`.
4. **Browse by Group** (`/assessments/respondents`): `assessmentsApi.listGroups()` returns `AssessmentGroup[]` (one row per `assessmentId` bulk key). Drilling into a group → `/assessments/:assessmentId/respondents` calls `assessmentsApi.listByAssessment()`.

#### 4. Token-Based Respondent Registration (`/register?token=…`)

1. `RegisterWithTokenPage` reads `?token=` from the URL.
2. `publicTokensApi.resolve(token)` fetches token metadata (assessment name, entity name, expiry).
3. The user fills name, email, phone, DOB. On blur, `publicTokensApi.registrationCheck({ email, dob })` → `POST /public/tokens/registration-check` checks for a pre-existing account; if `exists === true` a "Please log in" prompt appears.
4. On submit: `publicTokensApi.register(token, { name, email, phone, dob })` → `POST /public/tokens/:token/register`. The server atomically creates/reuses the respondent, appends them to the token's entity, creates a `PortalSession`, and consumes the token.
5. The response includes `{ sessionId, respondentId, token }` (a respondent JWT). The SPA stores it under `bodhassess.auth.token` and hard-redirects to `/portal/take?id=<sessionId>`.

#### 5. Respondent Portal — Taking an Assessment

The portal take flow (`src/pages/portal/take.tsx`) is the most complex page in the application. Execution sequence on mount:

1. Read respondent token from `sessionStorage.getItem(config.authStorageKey)`.
2. `respondentsApi.me(token)` validates the token and retrieves the `Respondent`.
3. Read `?id=<sessionId>` from the query string; `portalSessionsApi.get(sid)` loads the `PortalSession`.
4. Ownership check: `session.respondentId !== user.id` → render error card.
5. Status check: `session.status === 'Completed'` → render error card.
6. Instrument resolution: tries `questionnairesApi.getByName(session.instrumentFullName)` then `getByName(session.instrument)` — name-based lookup because the session stores only the instrument short name/full name, not a FK to `published_questionnaires`.
7. Demographics gate: if `session.demographics` already has data, skip collection. Otherwise, load active `DemographicField[]` from `/demographic-fields?active=true`; filter by `questionnaire.demographicFieldKeys` if non-empty. On submit: `portalSessionsApi.update(session.id, { demographics: clean })`.
8. Disclaimer gate: if `instrument.disclaimer` is non-empty and not yet agreed, render the T&C screen with a mandatory checkbox.
9. Instructions gate: if `instrument.showInstructions && instrument.instructions`, render the read-only instructions screen.
10. Question rendering: one question at a time; `index` state drives navigation. MCQ/Likert/SJT formats render radio-button cards; `FREE_TEXT` format renders a textarea.
11. **Heartbeat** (`useEffect` on `index`): calls `portalSessionsApi.heartbeat(session.id, { currentIndex: index, totalQuestions: total })` → `POST /assessments/:id/heartbeat` every 5 seconds while taking. Failures are silently swallowed.
12. **Start ping**: when the first non-empty answer is recorded, a one-shot `portalSessionsApi.update(session.id, { answers })` triggers `started_at` on the backend.
13. **Optional question index panel**: if `session.showQuestionIndex === true`, a sticky sidebar grid shows each question number coloured: blue = current, green = answered, grey = not yet answered.
14. **Submission** (`submit()`):
    - Walks the entire MQT tree (`walkMqts`, depth-first) to build `mqtName: Record<string, string>` and zero-initialised `totals`.
    - For each answered question: adds `question_scores` (question-level scores applied regardless of option) and then the selected option's `scores`.
    - Calls `portalSessionsApi.update(session.id, { status: 'Completed', score: summary, answers, mqtScores, completedAt })` → `PUT /assessments/:id`.
    - Hard redirects to `/portal/complete?id=<sessionId>`.

#### 6. Live Tracking (Admin)

`src/pages/admin/live-tracking.tsx` polls the backend every 5 seconds (`POLL_MS = 5000`):

1. On mount: `liveTrackingApi.listAssessments()` → `GET /admin/live-tracking/assessments`; returns `LiveAssessmentSummary[]` (one row per instrument + optional groupId).
2. Admin selects a row via a `<Select>`; the selection is encoded as `"${instrument}::${groupId ?? ''}"` to handle null group.
3. `liveTrackingApi.listSessions(instrument, groupId)` → `GET /admin/live-tracking/assessments/sessions?instrument=…&groupId=…`; returns `LiveSessionRow[]` with `liveStatus: 'not_started' | 'live' | 'idle' | 'completed'` derived from Redis heartbeat TTL.
4. A 1-second `setInterval` re-renders relative timestamps (`relativeFromIso`) without re-fetching.
5. Status badges use `liveStatusStyles` — green for `live`, amber for `idle` (heartbeat stale but within TTL), blue for `completed`, muted for `not_started`.

#### 7. DataGrid / Sessions Dataset View (Admin)

`src/pages/admin/data-grid.tsx` renders the analytical spreadsheet:

1. On mount: `datasetsApi.sessions()` → `GET /datasets/sessions`; response is a `DatasetResponse` with `columns: DatasetColumn[]` and `rows: DatasetRow[]`.
2. `columns` is **self-describing**: the backend dynamically generates column metadata including one column per MQT (in the `scores` group) and one per demographic field (in the `demographics` group). No frontend changes are needed when new questionnaires or demographic fields are added.
3. `DataGrid` component (`src/components/data-grid/DataGrid.tsx`) wraps `@glideapps/glide-data-grid`'s `DataEditor`. It handles: client-side sort (toggle asc/desc per column header), column resize, `getCellContent` mapping `DatasetColumn.type` to `GridCellKind.Text` or `GridCellKind.Number`.
4. Editable cells: only columns with `editable === 'field'` set `allowOverlay: true`. On edit: `onCellEdited(rowId, columnKey, newValue, row._updatedAt)` is called by the grid.
5. The page applies optimistic update immediately, then calls `datasetsApi.patchSessionCells([{ rowId, columnKey, oldValue, newValue, rowUpdatedAt }])` → `PATCH /datasets/sessions/cells`. On conflict (`CellEditError.conflict === true`) the grid reverts and shows the server's current value.
6. CSV export serialises visible rows with proper CSV quoting.
7. Column groups (`core`, `scores`, `demographics`) are shown as a summary in the card header.

---

### Notable Design Decisions

**Single `jsonFetch` entry point.** Every API call goes through one function in `lib/api.ts`. Token priority (practitioner token first, then respondent) is resolved in `getActiveToken()`. This means a practitioner who has both tokens (e.g., while testing the portal) will always send the dashboard token — intentional, since admin routes require the practitioner JWT.

**`sessionStorage` instead of `localStorage`.** Both tokens are stored in `sessionStorage`, so they are automatically cleared when the browser tab is closed. This is a deliberate security posture for a psychometric platform handling sensitive data.

**Dual-surface login via a single `/auth/login` endpoint.** The unified `app_users` table behind `/auth` serves both surfaces. The frontend's `/login` page (dashboard) checks `res.user.isSuperAdmin` to decide where to route the user; the portal's `/portal/login` page always routes to `/portal/assessments` regardless. This means a super admin who accidentally signs in via the portal link lands in the portal but can still log into the dashboard in another tab.

**`portalSessionsApi` is a type alias for `assessmentsApi`.** The backend uses a single `portal_sessions` table regardless of how sessions are created. The alias `export const portalSessionsApi = assessmentsApi` in `lib/api.ts` preserves backward compatibility with portal page imports while the naming consolidation is in progress.

**Legacy `lib/data-store.ts` stubs.** `getSessions()` and `getQuestionnaires()` return empty arrays with comments explaining they are preserved only for callers that pre-date the API migration. Reports pages that still reference these stubs render empty state.

**Portal take-page avoids React Router navigation.** `window.location.href = '/portal/login'` and similar imperative redirects are used throughout portal pages rather than `useNavigate`. This is because the portal pages are outside `PrivateRoute` and `AppShell`; using React Router's navigate would still work, but the hard redirect guarantees a clean session re-check on the next page mount.

**Instrument name-based resolution.** The `PortalSession` stores `instrument` (short name) and `instrumentFullName`. The portal take-page resolves the full questionnaire by `GET /questionnaires/by-name?name=…` using a try-first-then-fallback pattern. This is a known loose coupling — if the admin renames or deletes the published questionnaire, existing sessions will fail to load.

**`readMqtScores()` dual-shape compatibility.** The MQT scoring schema on `portal_sessions.mqt_scores` evolved from `Record<string, number>` (name-keyed) to `Record<string, { name, score }>` (id-keyed). The helper handles both shapes so older session records continue to render correctly in reports and the DataGrid.

**Self-describing dataset columns.** The `DatasetColumn[]` metadata returned by `/datasets/sessions` eliminates the need for frontend changes when new questionnaires (and thus new MQT score columns) or new demographic fields are added by administrators. The `DataGrid` component is purely driven by this metadata.

**Route matching order for literal vs. parameterised paths.** In `src/router.tsx`, `/assessments/respondents` (literal) is registered before `/assessments/:assessmentId/respondents` (parameterised) to prevent the literal from being consumed as an `assessmentId`. The comment makes this explicit.

---

### Connection to Other Subsystems

| Subsystem | Integration point |
|---|---|
| **Spring Boot API** | All integration is through `lib/api.ts`. The frontend is a pure REST consumer; there is no WebSocket, no SSE, and no GraphQL. |
| **Authentication / JWT** | The `/auth/login` response JWT is stored in `sessionStorage` and sent as `Authorization: Bearer` on every request. Token validation happens server-side on every call. |
| **Redis Heartbeat** | The portal take-page drives `POST /assessments/:id/heartbeat` every 5 seconds; the admin live-tracking page polls `GET /admin/live-tracking/assessments/sessions` every 5 seconds to read Redis-backed `liveStatus`. The frontend has no direct Redis access. |
| **Published Questionnaire snapshot** | The take-page fetches the immutable `PublishedQuestionnaire` (via `/questionnaires/by-name`) at session start. Scoring is computed entirely client-side from the snapshot's `options[i].scores` and `question_scores` arrays; the computed `mqtScores` are persisted in a single `PUT /assessments/:id` call. |
| **Versioning system** | The create-assessment flow consumes `questionnaireVersionsApi` to present only `COMMITTED` versions for allotment. The `questionnaireVersionsApi.editDraft` and `commit` calls drive the version authoring UI in `/questionnaires/:id/versions`. |
| **Audit log** | `auditApi.byTarget()` is used in three places: the entity drill-in page, the assessment edit page, and the questionnaire versions page. Writing audit records is done server-side; the frontend only reads. |
| **Entity/Token registration** | The public `publicTokensApi.register()` call is the sole entry point that atomically creates a respondent, joins an entity, creates a session, and consumes a token — the full pre-assessment onboarding in a single round-trip. |
| **Dataset / DataGrid** | `datasetsApi.sessions()` and `datasetsApi.patchSessionCells()` expose the `portal_sessions` data with dynamic column metadata. The self-describing contract means the `DataGrid` component works for any view the backend adds without frontend changes. |
| **Nginx / Docker** | `docker/nginx.conf` in the frontend repo serves the SPA at the configured `VITE_BASE_PATH`. All `404` responses are rewritten to `index.html` to support client-side routing. |

---
