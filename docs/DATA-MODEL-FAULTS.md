# BodhAssess — Data-Model & System-Design Fault Audit

> **Companion to** [`ARCHITECTURE.md`](./ARCHITECTURE.md).
> **Method:** an 8-dimension adversarial audit of the JPA entities, services, configuration, and the canonical DDL. Every finding below was **independently re-verified by a second reviewer** that read the cited code and tried to *refute* it; 4 candidate findings were dropped as false positives (see Appendix B). What remains are **77 confirmed findings**.
> **Severity is the post-verification (adjusted) severity.**

## Executive summary

BodhAssess works, but its data layer carries serious **structural debt from an incomplete Postgres/Go → Spring/MySQL migration**. The recurring root causes are:

1. **Two schemas that disagree.** Half the tables come from a hand-written `01-schema.sql`; the other half are conjured at boot by `ddl-auto=update`, which *never* creates foreign keys, unique constraints, or indexes. The result is a database with **no referential integrity across most relationships** and **silent drift** between the entities and the DDL.
2. **Half-finished normalization.** A "JSON → tables" migration created normalized child tables (`portal_session_*`, `published_questionnaire_*`, `mqts`, `practitioner_roles`) but **left the old JSON blob columns in place** (`portal_sessions.answers/mqt_scores/demographics`, `published_questionnaires.questions/mqs`). The code now has **dual representations that can drift**.
3. **Broken immutability/versioning.** The "immutable published snapshot" is not immutable: editing or cloning a draft can **physically delete committed versions that live assessments depend on** (VER-01), and assessments **never pin the version they were published from** (VER-02), resolving content later by *name* (VER-03).
4. **Wrong storage types for measured data.** Psychometric **scores are `DOUBLE`** (TYPE-01) and the overall session **score is `VARCHAR(255)`** (TYPE-02); **date-of-birth has three different column types** across tables and is also a **plaintext login credential** (SEC-01, TYPE-04).
5. **No concurrency control.** **No `@Version` anywhere** (CON-04); token redemption, session caps, and version numbering are **read-modify-write races** (CON-01/02/04, VER-04).
6. **Security modeling gaps.** No password hashing infrastructure (SEC-02), hardcoded JWT/DB secrets (SEC-04), **multi-tenant isolation is absent** on identity/PII/session tables (SEC-05), and credentials are logged in cleartext (SEC-06).

### Severity breakdown

| Severity | Count |
|---|---|
| 🔴 Critical | 5 |
| 🟠 High | 28 |
| 🟡 Medium | 25 |
| 🔵 Low | 19 |
| **Total** | **77** |

### Findings by dimension

| Dimension | Count |
|---|---|
| Column data types, precision & storage representation | 10 |
| Entity relationships, cardinality & cascade | 6 |
| JPA-vs-DDL drift, referential integrity & ddl-auto risk | 13 |
| Primary keys, composite IDs, uniqueness & indexes | 8 |
| Security, credentials & sensitive-data-at-rest modeling | 11 |
| Snapshot/denormalization integrity & versioning correctness | 9 |
| Transactions, concurrency & query integrity | 10 |
| Validation, lifecycle, defaults, timestamps & soft-delete | 10 |

### The 5 fix-first items

| ID | Severity | One-liner |
|---|---|---|
| **VER-01** | 🔴 Critical | Saving/cloning a draft deletes committed versions live assessments are pinned to — silent, irreversible snapshot loss. |
| **VER-02** | 🔴 Critical | Assessments never record which published version they used. |
| **SEC-01** | 🔴 Critical | Date-of-birth is the permanent login credential, stored/compared in plaintext (~13 bits of entropy). |
| **DDL-01** | 🔴 Critical | ~half the tables have no FK constraints (ddl-auto), so referential integrity is unenforced. |
| **TS-01** | 🔴 Critical | `created_at`/`updated_at` are `insertable=false` on ddl-auto tables → permanently NULL (breaks audit ordering, TS-02). |

---

## How to read a finding

> **`[ID] Title`**
> **Severity** · **Dimension** · **Confidence** (the finder's confidence) · **Locations** (file:line)
> **Problem** (root cause) — **Impact** (production consequence) — **Evidence** (the offending code) — **Recommendation** (the fix) — **Verifier** (what the second reviewer confirmed).

---


## 🔴 Critical findings (5)
### [DDL-01] Roughly half of all @Entity tables have no definition in the canonical DDL — created only by ddl-auto with zero FK constraints

**Severity:** Critical · **Dimension:** DDL drift *(finder ref `REL-01`)* · **Confidence:** High

**Locations:** `model/Assessment.java:22-23`, `model/Questionnaire.java:28-29`, `model/AssessmentToken.java:26-27`, `model/AssessmentAnswer.java:20-24`, `model/AssessmentEntityAllotment.java:18-19`, `model/AssessmentGroupAllotment.java:16-17`, `model/AssessmentRespondentAllotment.java:17-18`, `model/AuditLogEntry.java:23-24`, `model/Mqt.java:22-23`, `model/PortalSessionMqtScore.java:18-22`, `model/PortalSessionDemographic.java:20-24`, `model/PublishedQuestionnaireMq.java:27-28`, `model/PublishedQuestionnaireMqt.java:23-24`, `model/PublishedQuestionnaireQuestion.java:23-24`, `model/PublishedQuestionnaireQuestionOption.java:21-22`, `model/PublishedQuestionnaireQuestionOptionScore.java:18-21`, `model/PublishedQuestionnaireQuestionScore.java:19-22`, `model/ItemOption.java:23-24`, `model/ItemOptionScore.java:18-21`, `model/ItemQuestionScore.java:20-23`, `model/EntityRegistration.java:23-24`, `docker/mysql-init/01-schema.sql:1-381`

**Problem.** These tables exist only as JPA mappings; on a fresh container the hand-written 01-schema.sql never creates them, so Hibernate ddl-auto=update creates them at boot. Hibernate NEVER emits FOREIGN KEY constraints for @ManyToOne/@JoinColumn or @OneToMany(mappedBy) relationships. Every logical relation (AssessmentAnswer.session_id -> portal_sessions.id, Mqt.mq_id -> measured_qualities.id, Mqt.parent_mqt_id self-FK, ItemOption.item_id -> items.id, ItemOptionScore.option_id -> item_options.id, all published_questionnaire_* parent chains, PortalSessionMqtScore.session_id, etc.) is therefore enforced only in application code, with no DB-level referential integrity.

**Impact.** Orphan-row corruption: deleting a PortalSession, Item, PublishedQuestionnaire, MeasuredQuality or option leaves dangling child rows (answers, scores, snapshot questions/options, mqt subtrees) that silently break scoring and reporting joins. A bad service path or manual SQL can insert child rows pointing at non-existent parents. Cascade/orphanRemoval is enforced only when entities are loaded and mutated through Hibernate — bulk deletes or other code paths leave orphans permanently. The canonical DDL is not a usable source of truth for the live schema.

**Evidence.**

> DDL `CREATE TABLE` list contains only: tenants, users, instruments, items, sessions, measured_qualities, verticals, roles, respondents, practitioners, respondent_groups, portal_sessions, published_questionnaires, item_display_state, demographic_fields. No CREATE TABLE exists for assessments, questionnaires, assessment_tokens, assessment_answers, assessment_entity_allotments, assessment_group_allotments, assessment_respondent_allotments, audit_log, mqts, portal_session_mqt_scores, portal_session_demographics, all published_questionnaire_* snapshot tables, item_options/item_option_scores/item_question_scores, app_users/user_meta, or any @ElementCollection join table. `grep CREATE TABLE IF NOT EXISTS (assessments|questionnaires|assessment_tokens|audit_log|mqts|app_users|...)` => NONE FOUND.

**Recommendation.** Add explicit CREATE TABLE statements with FOREIGN KEY ... ON DELETE CASCADE for every one of these tables to 01-schema.sql so the real schema is reproducible and integrity is DB-enforced, e.g. `ALTER TABLE assessment_answers ADD CONSTRAINT fk_aa_session FOREIGN KEY (session_id) REFERENCES portal_sessions(id) ON DELETE CASCADE;`, `ALTER TABLE mqts ADD CONSTRAINT fk_mqts_mq FOREIGN KEY (mq_id) REFERENCES measured_qualities(id), ADD CONSTRAINT fk_mqts_parent FOREIGN KEY (parent_mqt_id) REFERENCES mqts(id) ON DELETE CASCADE;`, etc. Then move to ddl-auto=validate (or none) so drift is caught at startup instead of silently patched.

**Verifier confirmed.** All evidence checks out exactly as the auditor described. The DDL at /home/morningstar/Projects/bodh/bodhassess-api-spring/docker/mysql-init/01-schema.sql contains CREATE TABLE for only 15 tables (tenants, users, instruments, items, sessions, measured_qualities, verticals, roles, respondents, practitioners, respondent_groups, portal_sessions, published_questionnaires, item_display_state, demographic_fields). At least 22 additional tables mapped by @Entity classes (assessments, questionnaires, assessment_tokens, assessment_answers, assessment_entity_allotments, assessment_group_allotments, assessment_respondent_allotments, audit_log, mqts, portal_session_mqt_scores, portal_session_demographics, published_questionnaire_mqs, published_questionnaire_mqts, published_questionnaire_questions, published_questionnaire_question_options, published_questionnaire_question_option_scores, published_questionnaire_question_scores, item_options, item_option_scores, item_question_scores, entity_registrations, and the @ElementCollection join table entity_members) have no DDL definition at all. spring.jpa.hibernate.ddl-auto=update is set in application.properties and is not overridden in either profile file, confirming Hibernate auto-creates these tables on startup. Hibernate ddl-auto=update is a well-known non-emitter of FK constraints, so every @ManyToOne/@JoinColumn relationship among the auto-created tables (AssessmentAnswer.session_id -> portal_sessions.id, Mqt.mq_id -> measured_qualities.id, Mqt.parent_mqt_id self-FK, ItemOption.item_id -> items.id, ItemOptionScore.option_id -> item_options.id, all published_questionnaire_* parent chains, PortalSessionMqtScore.session_id, PortalSessionDemographic.session_id) has zero database-level referential integrity. The CascadeType.ALL/orphanRemoval=true annotations in several entities (ItemOption, Mqt, PublishedQuestionnaireMq) only fire through the JPA session, not for bulk deletes or direct SQL. The 01-schema.sql is not a usable source of truth: a fresh container deploying only that file would be missing more than half the application's tables. Critical severity is warranted: this is a production system, the schema is not reproducibly defined, and all foreign-key integrity for the core assessment data flow (answers, scores, demographics, mqt trees, snapshot tables) is absent at the database layer.

---
### [SEC-01] Date-of-birth is the permanent login credential, stored and compared in plaintext (no hashing, ~13 bits entropy)

**Severity:** Critical · **Dimension:** Security · **Confidence:** High

**Locations:** `model/User.java:45-46`, `service/AuthService.java:51-66`, `model/Practitioner.java:51`, `service/PractitionersService.java:104-145`, `model/Respondent.java:23`, `service/RespondentsService.java:103-125`

**Problem.** The authentication secret for every account (super admin, practitioner, respondent) is the user's date of birth, stored in cleartext and verified with a plain Java String/Object equality check. DOB is not secret (it is often public, and is collected as demographic data inside this very system), it cannot be rotated, and its keyspace is tiny: a plausible birth-year window of ~100 years is only ~36,500 values (~15 bits), trivially smaller if the attacker knows an approximate age. There is no BCrypt/Argon2 hashing and no rate limiting on the login endpoints.

**Impact.** Account takeover at scale. Any party who knows or guesses a target's birthday (or brute-forces 36,500 combinations against /auth/login, /practitioners/login, /respondents/login) logs in as that user. A breach of the database exposes every credential directly because dob is stored in cleartext. Because the super admin's dob is also the credential, the entire platform's god-mode account is protected only by a guessable birthday.

**Evidence.**

> User.java: `/** Permanent credential, stored ISO 'YYYY-MM-DD' to match the portal. */ private String dob;` AuthService.java: `if (!dob.equals(u.getDob() == null ? null : u.getDob().trim())) { ... throw new UnauthorizedAccessException("invalid credentials"); }`. DDL respondents: `dob VARCHAR(16)`; practitioners: `dob DATE` — no hash column anywhere.

**Recommendation.** Stop using DOB as a credential. Add a real secret credential column hashed with BCrypt/Argon2 (e.g. `password_hash VARCHAR(72)` on app_users) and verify with `PasswordEncoder.matches()`. Until that ships, at minimum add per-account login throttling/lockout. DDL: `ALTER TABLE app_users ADD COLUMN password_hash VARCHAR(72) NULL;` and register a `BCryptPasswordEncoder` @Bean; replace the `dob.equals(...)` check in AuthService with `encoder.matches(rawCredential, u.getPasswordHash())`.

**Verifier confirmed.** Every claim in the finding is confirmed verbatim by the source code and DDL. User.java line 45-46 carries the Javadoc comment explicitly calling `dob` "the permanent credential" and the class-level comment at line 24 repeats this. AuthService.java line 63 performs a plain Java String equality check (`dob.equals(u.getDob().trim())`) with no hashing. PractitionersService.java uses `repo.findActiveByEmailAndDob()` and RespondentsService.java uses `repo.findByEmailAndDob()` — both pass DOB directly to the query as the authentication factor. The DDL confirms no `password_hash` column exists on any of the three relevant tables (`app_users`, `practitioners`, `respondents`). A grep across the entire Java source tree returns zero hits for `PasswordEncoder`, `BCrypt`, `Argon2`, any rate-limiter, or any login-attempt lockout. SecurityConfig.java explicitly marks all three login endpoints as `permitAll()` with no rate-limiting filter in the chain. Additionally, AuthService.java line 64 logs both the stored DOB and the user-supplied DOB in plain text to application logs, creating a secondary exposure. The application.properties bootstrap default sets the super-admin credential to `1990-01-01`, confirming the god-mode account ships with a well-known default DOB. The Critical severity rating is correct: all account types including the platform-wide super-admin are authenticated solely by a guessable, non-rotatable, low-entropy plaintext secret with no brute-force protection.

---
### [VER-01] upsert() deletes all same-named PublishedQuestionnaire rows — destroys committed, in-use versions when editing/cloning a draft

**Severity:** Critical · **Dimension:** Versioning · **Confidence:** High

**Locations:** `QuestionnairesService.java:92-94`, `PublishedQuestionnaireRepository.java:43-44`, `QuestionnaireVersioningService.java:228`, `QuestionnaireVersioningService.java:354`

**Problem.** Every version row in a family shares the same `name` (the parent name is copied onto each PublishedQuestionnaire). upsert() was written for the pre-versioning world where name was a unique key, so it eagerly deletes every other row with the same name to enforce name-idempotency. There is NO guard on versionStatus and NO guard on whether the row is pinned by an Assessment. The versioning service routes draft edits and clones straight through this method.

**Impact.** Saving a DRAFT (updateDraftContent) or creating a branched draft (cloneAsDraft) for a questionnaire family physically DELETEs (via cascade/orphanRemoval) every COMMITTED version of that family that shares the name — including versions that live Assessments are pinned to. Already-administered assessments lose their immutable snapshot entirely; respondent content and scoring for those versions become unresolvable. This is silent, catastrophic loss of supposedly-immutable historical snapshots.

**Evidence.**

> QuestionnairesService.upsert: `for (PublishedQuestionnaire dup : repo.findOthersByName(dto.getName().trim(), dto.getId().trim())) { repo.delete(dup); }` driven by `WHERE LOWER(q.name) = LOWER(:name) AND q.id <> :id`. QuestionnaireVersioningService.updateDraftContent and cloneAsDraft both call `content.upsert(dto)`.

**Recommendation.** Remove the name-dedup deletion from upsert() entirely in the versioned model, or scope it to never touch COMMITTED rows: `findOthersByName` must add `AND q.versionStatus = 'DRAFT' AND q.parentId = :parentId` (only collide within the same family's drafts), and the loop must skip any row where `assessments.countByQuestionnaireVersionId(dup.getId()) > 0`. Better: drop the name-based dedup and rely on the id-based upsert only, since version ids are now the key.

**Verifier confirmed.** The evidence quote is accurate and the logic flaw is confirmed. In QuestionnairesService.upsert() at lines 92-94, the loop over `repo.findOthersByName(dto.getName().trim(), dto.getId().trim())` deletes every PublishedQuestionnaire row that shares the same name but has a different id, with no filter on versionStatus. The query at PublishedQuestionnaireRepository line 43-44 is: `WHERE LOWER(q.name) = LOWER(:name) AND q.id <> :id` — no versionStatus guard at all. Because all versions in a family share the same `name` field (set in newDraft() at line 312 as `base.getName()`), calling upsert() for a DRAFT will match and delete all COMMITTED sibling rows.

The COMMITTED guard in upsert() lines 85-90 only protects the row identified by dto.getId() (the row being saved). It provides zero protection for the other rows returned by findOthersByName() that are then unconditionally deleted in the loop.

Both call sites confirmed: updateDraftContent (line 228) passes the DRAFT id with the family name; cloneAsDraft (line 354) passes the new DRAFT id with the base's name — both supply a name that will match existing COMMITTED rows via findOthersByName. The cascade/orphanRemoval on the PublishedQuestionnaire entity means these deletes also destroy all child question, option, score, and MQ-tree rows. Since Assessment.questionnaireVersionId is a FK to PublishedQuestionnaire, this silently orphans or FK-violates live assessments pinned to those deleted COMMITTED versions.

The severity is correctly rated Critical: the flaw causes irreversible, silent deletion of immutable committed version snapshots (and their cascaded content) when any draft is edited or branched.

---
### [VER-02] Assessment.create never pins questionnaireVersionId — assessments are not bound to a specific published version

**Severity:** Critical · **Dimension:** Versioning · **Confidence:** High

**Locations:** `AssessmentService.java:79-94`, `Assessment.java:43-44`, `AssessmentDto (no version field)`

**Problem.** The entire versioning design hinges on an Assessment pinning the exact committed version it was created against (Assessment.java comment: 'what drives content shown to the respondent and how their answers are scored'). The create path leaves questionnaire_version_id NULL. Worse, it stores the parent-or-version id ambiguously in questionnaire_id (dto.getQuestionnaireId() is validated against the PublishedQuestionnaire repo, i.e. a version id, but the field is supposed to hold the parent family id).

**Impact.** Assessments do not pin a version. When admins commit new versions or move the parent's current_version_id, there is no stored pin to protect in-flight or completed assessments. Combined with VER-03 (portal resolves by name), the version a respondent actually sees/scored-against is whatever findByName returns first — non-deterministic and mutable. Reporting cannot attribute results to the version that produced them.

**Evidence.**

> AssessmentService.create resolves `PublishedQuestionnaire q = questionnaireRepo.findById(dto.getQuestionnaireId())` then `a.setQuestionnaireId(q.getId())` and caches name/vertical, but never calls `a.setQuestionnaireVersionId(...)`. The Assessment entity documents questionnaireVersionId as 'Set at assessment-creation time and never changes', yet nothing sets it. AssessmentDto has no version field at all.

**Recommendation.** In AssessmentService.create, accept a versionId (default to the parent's currentVersionId), validate it is COMMITTED and belongs to the parent, then set both `a.setQuestionnaireId(parentId)` and `a.setQuestionnaireVersionId(versionId)`. Make questionnaire_version_id NOT NULL going forward. Add the version field to AssessmentDto.

**Verifier confirmed.** The evidence in the finding is fully confirmed by the source. In AssessmentService.java (line 58), `questionnaireRepo` is injected as `PublishedQuestionnaireRepository` — the version repo, not the parent-family repo. The `create` method (lines 79-80) calls `questionnaireRepo.findById(dto.getQuestionnaireId())`, which retrieves a `PublishedQuestionnaire` version row. Line 87 then calls `a.setQuestionnaireId(q.getId())`, storing the version row's ID in the field that the Assessment.java comment explicitly documents as "FK to the Questionnaire PARENT (the questionnaire family)". Nowhere in the create path is `a.setQuestionnaireVersionId(...)` called — `questionnaire_version_id` is left NULL despite Assessment.java's comment stating it is "Set at assessment-creation time and never changes." AssessmentDto has no version field at all (confirmed by reading the full file). The Questionnaire.java parent entity exists with a `currentVersionId` field, and there is a separate `QuestionnaireRepository`, but neither is referenced in AssessmentService.create. As a result: (1) the version pin is never written — assessments have no immutable binding to a specific content/scoring version; (2) the questionnaireId column holds a version-row ID rather than a parent-family ID, inverting the intended semantic. The `Questionnaire` parent concept with `currentVersionId` exists in the model but is entirely bypassed during assessment creation. The Critical severity rating is warranted — the entire version-pinning guarantee documented in the design is absent, and the field that should hold the parent ID instead holds the version ID, making both fields semantically wrong.

---
### [TS-01] createdAt/updatedAt are insertable=false on tables Hibernate creates, so they are permanently NULL (no DB default ever generated)

**Severity:** Critical · **Dimension:** Validation · **Confidence:** High

**Locations:** `model/Assessment.java:61-68`, `model/AuditLogEntry.java:52-53`, `model/EntityRegistration.java:73-77`, `model/AssessmentToken.java:57-58`, `model/AssessmentEntityAllotment.java:36-38`, `model/AssessmentGroupAllotment.java:29-30`, `model/AssessmentRespondentAllotment.java:30-31`, `docker/mysql-init/01-schema.sql:1-381 (these tables are absent)`

**Problem.** These entities rely on the column having a DB-side `DEFAULT CURRENT_TIMESTAMP` / `ON UPDATE CURRENT_TIMESTAMP` (as the canonical DDL does for hand-written tables). But for tables that exist ONLY because Hibernate auto-created them, ddl-auto emits a plain `datetime`/`timestamp` column with NO default. Because the field is `insertable=false`, every INSERT omits the column. MySQL then stores NULL (or, for an implicit NOT NULL TIMESTAMP under some sql_mode, the epoch / '0000-00-00'). The app never sets the value either, so createdAt/updatedAt are dead.

**Impact.** Every Assessment, AuditLogEntry, EntityRegistration, AssessmentToken and allotment row has a NULL createdAt. Repository queries that ORDER BY createdAt DESC (AssessmentRepository.findAllOrderByCreated, AuditLogRepository.findAllRecent/findByTarget, EntityRegistrationRepository.findAllOrderByCreatedAtDesc) return rows in arbitrary order (all NULL keys), so the 'All Assessments' list, the per-target audit history, and the entity list are effectively unordered. The audit trail loses the single most important field — WHEN an admin paused/closed/deleted — defeating the compliance purpose of the append-only log. AssessmentService.toDtoWithCounts and AuditService.toDto already defensively skip the null (`if (a.getCreatedAt() != null)`), confirming the field never populates.

**Evidence.**

> Assessment: `@Column(name = "created_at", insertable = false, updatable = false) private OffsetDateTime createdAt;` plus `updatedAt` same. The tables `assessments`, `audit_log`, `entity_registrations`, `assessment_tokens`, `assessment_*_allotments` do NOT appear in 01-schema.sql (only `measured_qualities` of the new entities is there) — they are created by `spring.jpa.hibernate.ddl-auto=update`.

**Recommendation.** Stop depending on a DB default that ddl-auto never creates. Either (a) annotate these with Hibernate's `@CreationTimestamp`/`@UpdateTimestamp` and drop `insertable=false`/`updatable=false` (the pattern already used correctly in User.java:66-72), so the value is set application-side and is portable across both DDL paths; or (b) add these tables to 01-schema.sql with `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` and keep insertable=false. Option (a) is strongly preferred because ddl-auto=update will never retroactively add the default to already-created columns.

**Verifier confirmed.** Every piece of evidence in the finding is confirmed by the actual source code. All seven entities (Assessment, AuditLogEntry, EntityRegistration, AssessmentToken, AssessmentEntityAllotment, AssessmentGroupAllotment, AssessmentRespondentAllotment) use `insertable = false, updatable = false` on their timestamp columns with no `@CreationTimestamp`/`@UpdateTimestamp` annotation. The tables for these entities are entirely absent from the only DDL file (docker/mysql-init/01-schema.sql), which only defines hand-managed tables — all of which correctly carry `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`. With `spring.jpa.hibernate.ddl-auto=update` (confirmed in application.properties line 9), Hibernate auto-creates those tables as plain nullable `datetime` columns with no DB default. Since the field is `insertable=false`, Hibernate omits it from every INSERT, and MySQL stores NULL. The three ORDER BY queries (AssessmentRepository.findAllOrderByCreated, AuditLogRepository.findByTarget/findAllRecent, EntityRegistrationRepository.findAllOrderByCreatedAtDesc) all sort on this permanently-NULL column, producing non-deterministic ordering. The defensive null checks in AssessmentService.java line 215 and AuditService.java line 81 (`if (a.getCreatedAt() != null)`) corroborate that the field is effectively never populated. The correct pattern is already demonstrated in User.java lines 66-72, which uses `@CreationTimestamp`/`@UpdateTimestamp` and is mapped to the `app_users` table that Hibernate also auto-creates. Critical severity is appropriate: the audit log loses its temporal dimension entirely, making it useless for compliance purposes, and all list views relying on creation-date ordering are broken.

---

## 🟠 High findings (28)
### [TYPE-01] All psychometric score columns stored as double (DOUBLE) instead of DECIMAL/BigDecimal

**Severity:** High *(finder rated Critical)* · **Dimension:** Column types · **Confidence:** High

**Locations:** `ItemOptionScore.java:36`, `ItemQuestionScore.java:37`, `PublishedQuestionnaireQuestionOptionScore.java:36`, `PublishedQuestionnaireQuestionScore.java:36`, `PortalSessionMqtScore.java:41-42`, `service/AssessmentsService.java:291-318`

**Problem.** Every score weight in the authoring tree, the published snapshot tree, AND the per-respondent result row (PortalSessionMqtScore) is a Java primitive double, which Hibernate maps to a MySQL DOUBLE (IEEE-754 binary float). None of these tables are in 01-schema.sql, so ddl-auto creates them as DOUBLE with no precision/scale. Summing option weights into per-MQT totals in double arithmetic accumulates binary rounding error (e.g. 0.1 + 0.2 != 0.3), and DOUBLE cannot exactly represent decimal weights authored by practitioners.

**Impact.** Respondent MQT scores and clinical cut-off comparisons can be off by ~1e-15 to ~1e-12, producing non-deterministic totals, scores like 4.999999999 instead of 5.0, mismatched equality/threshold checks at clinical band boundaries, and irreproducible report numbers across machines. In a psychometric product these are wrong-score / wrong-diagnosis defects.

**Evidence.**

> @Column(nullable = false) private double score;  // repeated in ItemOptionScore, ItemQuestionScore, PublishedQuestionnaireQuestionOptionScore, PublishedQuestionnaireQuestionScore, PortalSessionMqtScore. Scoring path accumulates via doubles: score = ((Number) v).doubleValue(); row.setScore(score);

**Recommendation.** Change the field type to java.math.BigDecimal and annotate precision/scale, e.g. @Column(nullable = false, precision = 9, scale = 4) private BigDecimal score; on ItemOptionScore, ItemQuestionScore, PublishedQuestionnaireQuestionOptionScore, PublishedQuestionnaireQuestionScore and PortalSessionMqtScore. Migrate columns: ALTER TABLE item_option_scores MODIFY score DECIMAL(9,4) NOT NULL; (same for item_question_scores, published_questionnaire_question_option_scores, published_questionnaire_question_scores, portal_session_mqt_scores). Do all scoring arithmetic with BigDecimal and a fixed MathContext/scale.

**Verifier confirmed.** All five cited entity files confirm `private double score` with `@Column(nullable = false)` and no precision/scale: ItemOptionScore.java:36, ItemQuestionScore.java:37, PublishedQuestionnaireQuestionOptionScore.java:36, PublishedQuestionnaireQuestionScore.java:36, PortalSessionMqtScore.java:41. The service code at AssessmentsService.java:291 does use `((Number) v).doubleValue()` when deserialising the incoming MQT map, and calls `row.setScore(score)`. The DDL file (01-schema.sql) contains none of these tables, and application.properties confirms `spring.jpa.hibernate.ddl-auto=update`, so Hibernate auto-creates all five tables with DOUBLE columns. The core flaw is real and confirmed. Severity is adjusted from Critical to High because the visible server-side code does not itself perform the score accumulation arithmetic (summing option weights into totals) — that path appears to happen in the frontend/client and the scores are passed in pre-computed. The storage-level IEEE-754 imprecision still causes round-trip noise (~1e-15) and prevents exact decimal representation of authored weights, which is a genuine defect for a psychometric product, but the worst-case wrong-band scenario requires the threshold comparison to also execute on the double-stored values, which is not confirmed in the visible service code. High severity is appropriate.

---
### [TYPE-02] portal_sessions.score (overall result) stored as VARCHAR(255) free-text instead of a numeric type

**Severity:** High · **Dimension:** Column types · **Confidence:** High

**Locations:** `PortalSession.java:50-51`, `docker/mysql-init/01-schema.sql:272`, `service/DatasetService.java:62,335`

**Problem.** The headline overall assessment score is persisted as an arbitrary VARCHAR, not a DECIMAL/numeric column. There is no type or range enforcement, and the reporting/dataset layer treats it as type 'string', so it cannot be aggregated, sorted numerically, or compared against thresholds in SQL.

**Impact.** Cannot run SQL-side analytics (AVG/MIN/MAX/ORDER BY) on the primary score; sorting is lexicographic ('10' < '9'); any free-form or locale-formatted string ('5,0', 'N/A', '5 / 9') silently persists and corrupts downstream parsing; cross-report numeric comparisons are unreliable.

**Evidence.**

> DDL: score VARCHAR(255). Entity: private String score;  Dataset column declared as {"score", "Overall Score", "string"} and emitted row.put("score", s.getScore());

**Recommendation.** Decide the canonical representation. If it is a single number, change to BigDecimal mapped to DECIMAL(9,4): ALTER TABLE portal_sessions MODIFY score DECIMAL(9,4) NULL; and mark the dataset column type 'number'. If it must stay a composite label, keep the string for display but add a numeric score_value DECIMAL column for analytics.

**Verifier confirmed.** All four evidence quotes in the finding are confirmed verbatim in the source. PortalSession.java line 51 declares `private String score;`. The DDL at line 272 declares `score VARCHAR(255)`. DatasetService.java line 62 declares the column with type "string" and line 335 emits `row.put("score", s.getScore())`. Additionally, PublicRegistrationService.java line 157 stores `s.setScore("--")` as the initial sentinel on every new session, which proves non-numeric strings are written to this column in production. The DTO (AssessmentSessionDto) also carries score as String with no validation, meaning any string the scoring engine or admin sends is persisted verbatim. No SQL-side AVG/MIN/MAX/ORDER BY on this column exists anywhere in the codebase. The impact claims (lexicographic sort ordering, inability to aggregate, silent acceptance of sentinel strings like "--") are genuine consequences of this design. Severity High is appropriate.

---
### [TYPE-04] Date-of-birth stored with three different types across person tables; the login credential dob is a free-text VARCHAR(255)

**Severity:** High · **Dimension:** Column types · **Confidence:** High

**Locations:** `User.java:45-46`, `Respondent.java:23`, `EntityRegistration.java:40`, `Practitioner.java:51`, `docker/mysql-init/01-schema.sql:199,222`, `config/IdentityBootstrapRunner.java:72,105`

**Problem.** The same domain concept (date of birth) is modelled as java.time.LocalDate->DATE for Practitioner but as plain String for User, Respondent and EntityRegistration. For User the string dob is also the authentication credential, persisted without any format/validation as VARCHAR(255). Strings allow '1990-1-1', '01/01/1990', whitespace, or arbitrary text, all of which compare unequal to the canonical 'YYYY-MM-DD'.

**Impact.** Authentication can silently fail or be bypassed by format drift (e.g. a respondent migrated with a differently-formatted dob can no longer log in, or two distinct strings represent the same date); no DB-level date validation; impossible to do age/date arithmetic or range queries on respondents; storage waste (VARCHAR(255) for a 10-char date). Cross-table joins/dedup on dob (used in returning-registrant dedup) are brittle.

**Evidence.**

> User.dob: private String dob; (no @Column -> VARCHAR(255), and it is the credential: 'dob is the permanent credential'). Respondent.dob: private String dob; DDL respondents.dob VARCHAR(16). EntityRegistration.dob: String. Practitioner.dob: private LocalDate dob; DDL practitioners.dob DATE. Bootstrap: su.setDob(dob.trim()); u.setDob(r.getDob());

**Recommendation.** Model dob as java.time.LocalDate everywhere and store as DATE: change User.dob and Respondent.dob/EntityRegistration.dob to LocalDate; ALTER TABLE respondents MODIFY dob DATE; create app_users.dob as DATE. If dob must remain the credential, normalize and validate to ISO-8601 on the way in and store as DATE; never compare credentials as unnormalized free text.

**Verifier confirmed.** All cited evidence is confirmed by the actual source. User.java line 46 is `private String dob;` with no @Column annotation (Hibernate will generate VARCHAR(255)); the Javadoc explicitly states "dob is the permanent credential". Respondent.java line 23 is `private String dob;` and the DDL at line 199 confirms `dob VARCHAR(16)`. EntityRegistration.java line 40 is `private String dob;`. Practitioner.java line 51 is `private LocalDate dob;` and the DDL at line 222 confirms `dob DATE`. The bootstrap evidence at lines 72 and 105 of IdentityBootstrapRunner.java is confirmed: `su.setDob(dob == null ? null : dob.trim())` and `u.setDob(r.getDob())` copy the respondent's raw VARCHAR(16) string directly into the User credential field. AuthService.java further confirms the risk: the only normalization before credential comparison is `.trim()` on both sides — no ISO-8601 format enforcement. The app_users table is not in the DDL file at all; it is created entirely by Hibernate's `ddl-auto=update`, meaning dob lands as VARCHAR(255). The inconsistency (LocalDate/DATE for Practitioner, String/VARCHAR for User+Respondent+EntityRegistration) and the authentication-credential format-drift risk are genuine faults. Severity High is appropriate because the authentication credential for every respondent-migrated user can silently fail if the source dob string in respondents.dob was stored in any non-canonical format.

---
### [REL-01] Assessment has no association to its PortalSessions; delete() orphans every session and its answers/scores

**Severity:** High · **Dimension:** Relationships · **Confidence:** High

**Locations:** `model/Assessment.java:24-90 (entire entity, no @OneToMany to PortalSession)`, `model/PortalSession.java:26-27 (assessmentId is a raw String, not a @ManyToOne)`, `service/AssessmentService.java:171-182 (delete)`

**Problem.** The Assessment->PortalSession parent/child relationship (1:N, the central flow of the app) is modeled as a loose denormalized String FK with neither a JPA association nor a DB FK constraint (the assessments and portal_sessions tables are created by ddl-auto=update and carry no FK between them). Deleting an Assessment removes the parent row and the allotment join rows but leaves all child portal_sessions (and their assessment_answers / portal_session_mqt_scores / portal_session_demographics) dangling with a now-invalid assessment_id.

**Impact.** Orphaned sessions: respondents' in-flight/completed sessions point at a deleted assessment. The All Assessments list (which collapses sessions by assessment_id) and cap-enforcement counts (countByAssessmentIdAndEntityId) see ghost rows; reporting/dataset joins return rows that can never be navigated back to an assessment. Storage leak and data-integrity corruption that compounds over every assessment deletion.

**Evidence.**

> Assessment.java has NO relationship field for sessions. PortalSession.java: `@Column(name = "assessment_id", length = 64) private String assessmentId;`. AssessmentService.delete(): only `entityAllotments...delete`, `groupAllotments...delete`, `respondentAllotments...delete`, then `repo.delete(a)` — portal_sessions for the assessment are never touched.

**Recommendation.** Decide the intended semantics and enforce them. If sessions should survive (audit), block deletion when sessions exist. If they should die with the assessment, either (a) add `sessionRepo.deleteByAssessmentId(id)` (and cascade its children) in AssessmentService.delete before repo.delete, or (b) model the relationship: `@OneToMany(mappedBy="assessment", cascade=ALL, orphanRemoval=true)` on Assessment with a `@ManyToOne @JoinColumn(name="assessment_id") private Assessment assessment;` on PortalSession, plus DDL `ALTER TABLE portal_sessions ADD CONSTRAINT fk_ps_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id)`.

**Verifier confirmed.** All evidence claims verified directly from source. Assessment.java (lines 24-90) has no @OneToMany or any JPA relationship field pointing to PortalSession. PortalSession.java line 26-27 confirms assessmentId is a plain @Column String with no @ManyToOne. AssessmentService.delete() (lines 171-182) removes only the three allotment join-table rows and then calls repo.delete(a) — portal_sessions whose assessment_id matches are never touched. The DDL at 01-schema.sql defines portal_sessions with no FOREIGN KEY referencing assessments, and the assessments table itself is absent from the DDL entirely (created by ddl-auto=update from the entity with no FK). PortalSessionRepository has no deleteByAssessmentId method; sessionRepo is injected into AssessmentService but used solely for cap-count queries. After an assessment is deleted, all child portal_sessions retain their now-invalid assessment_id and continue to appear in findAssessmentGroups(), countByAssessmentId(), countByAssessmentIdAndEntityId(), and findSummariesByAssessmentId() queries, producing ghost rows that can never be navigated back to a parent assessment. The High severity is correct: this is a silent, compounding data-integrity corruption on every assessment deletion.

---
### [REL-06] Canonical DDL is stale: none of the normalized child tables or their FK constraints exist in 01-schema.sql — every parent/child FK depends on ddl-auto=update, which never adds FKs to pre-existing tables

**Severity:** High · **Dimension:** Relationships · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:1-380 (no item_options, item_option_scores, item_question_scores, mqts, published_questionnaire_mqs/_mqts/_questions/_question_options/_question_option_scores/_question_scores, assessments, assessment_*_allotments, assessment_tokens, assessment_answers, portal_session_mqt_scores, portal_session_demographics, app_users, user_meta, audit_log, entity_registrations)`, `model/* (all child entities listed above)`, `src/main/resources/application.properties:9 (ddl-auto=update)`

**Problem.** The 'real source of truth' DDL describes the pre-migration JSON schema, while the live app runs the normalized schema generated by ddl-auto=update. Hibernate's update mode adds FK constraints when it CREATES a table for the first time, but it never retroactively adds a FK to a table that already exists (e.g. when the table was hand-created earlier without one, or when a @JoinColumn is added later). It also never adds the declared @UniqueConstraints to an existing table. So whether a given child FK / unique key physically exists in any deployed DB is non-deterministic and undocumented.

**Impact.** Referential integrity for the entire normalized model (answers->session, scores->session, options->item, snapshot tree edges, allotments) is unenforced or inconsistent across environments. Orphan rows from REL-01/REL-03 cannot be caught by the DB. The declared uniqueness guards (uniq_answer_session_question, uniq_session_mqt, uniq_option_mqt, etc.) may be silently absent on databases that predate them, allowing duplicate answers/scores that corrupt scoring. DR/rebuild from 01-schema.sql produces a structurally different (JSON-era) database than production.

**Evidence.**

> 01-schema.sql defines only the legacy JSON-era tables (measured_qualities.mqts JSON NOT NULL, portal_sessions.answers/mqt_scores/demographics JSON, items.options JSON, published_questionnaires.mqs/questions JSON). A grep for the normalized child tables in the DDL returns nothing. All @JoinColumn child relationships (AssessmentAnswer.session, ItemOption.item, PublishedQuestionnaireQuestion.questionnaire, etc.) are realized solely by Hibernate's update mode.

**Recommendation.** Regenerate the canonical DDL from the current entity model (hibernate schema export) so 01-schema.sql contains every normalized table, its FK constraints (with intended ON DELETE), and the @UniqueConstraint indexes. Switch ddl-auto to `validate` in prod so the app fails fast on drift instead of silently diverging. Add the missing FK/unique constraints to existing databases via explicit, idempotent ALTER statements (the file already uses INFORMATION_SCHEMA-guarded dynamic SQL for columns — extend that pattern to constraints).

**Verifier confirmed.** All evidence in the finding is confirmed by direct code inspection.

The canonical DDL at /home/morningstar/Projects/bodh/bodhassess-api-spring/docker/mysql-init/01-schema.sql contains exactly 16 CREATE TABLE statements (tenants, users, instruments, items, sessions, measured_qualities, verticals, roles, respondents, practitioners, respondent_groups, portal_sessions, published_questionnaires, item_display_state, demographic_fields). Every single normalized child table referenced by @Table annotations in the model package is absent: app_users, user_meta, mqts, item_options, item_option_scores, item_question_scores, assessments, assessment_answers, assessment_tokens, assessment_entity_allotments, assessment_group_allotments, assessment_respondent_allotments, audit_log, entity_registrations, portal_session_mqt_scores, portal_session_demographics, published_questionnaire_mqs, published_questionnaire_mqts, published_questionnaire_questions, published_questionnaire_question_options, published_questionnaire_question_option_scores, published_questionnaire_question_scores — plus the @ElementCollection join tables (user_entities, item_languages, published_questionnaire_languages, published_questionnaire_demographic_keys).

The legacy JSON columns cited in the finding are confirmed: measured_qualities.mqts JSON NOT NULL (line 161), portal_sessions.answers/mqt_scores/demographics JSON (lines 273-275), items.options JSON (line 99), published_questionnaires.mqs/questions JSON (lines 334-335). Meanwhile the corresponding model entities (MeasuredQuality, PortalSession, Item, PublishedQuestionnaire) have migrated those to normalized OneToMany child relationships.

application.properties line 9 confirms spring.jpa.hibernate.ddl-auto=update. Neither application-dev.properties nor application-prod.properties overrides this value. The docker-compose mounts the init SQL via docker-entrypoint-initdb.d, meaning a fresh containerised deployment gets the JSON-era schema, and all normalized tables are created solely by Hibernate update on first startup.

The Hibernate update mode limitation stated in the finding is accurate: it will CREATE missing tables on startup (providing them to new deployments), but it will never retroactively ADD FK constraints or @UniqueConstraint indexes to tables that pre-exist. The @UniqueConstraints declared on assessment_answers (uniq_answer_session_question), portal_session_mqt_scores (uniq_session_mqt), portal_session_demographics (uniq_session_field), and others are entirely absent from the DDL. On any database where these tables were initially hand-created or created by an earlier version of Hibernate update without those constraints, the uniqueness guards will be silently absent.

High severity is appropriate: a DR rebuild from 01-schema.sql produces a structurally incompatible (JSON-era) database, referential integrity enforcement is non-deterministic across environments, and critical uniqueness guards protecting against duplicate answers and scores may be missing.

---
### [DDL-02] portal_sessions retains legacy NOT NULL columns (instrument, respondent_name, language) that the entity treats as nullable — INSERTs will fail on upgraded DBs

**Severity:** High *(finder rated Critical)* · **Dimension:** DDL drift *(finder ref `REL-02`)* · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:261-288`, `model/PortalSession.java:14-110`, `config/JsonToTableMigrationRunner.java:113-115`

**Problem.** ddl-auto=update never relaxes an existing column's nullability, and the migration runner never drops or alters `instrument`/`respondent_name`. They remain NOT NULL in the DB (instrument has no default). Hibernate generates INSERTs from the entity's mapped fields, and since the entity allows null, any session created without setting instrument or respondentName violates the DB NOT NULL constraint the JPA layer believes is nullable.

**Impact.** Session creation 500s (SQLIntegrityConstraintViolationException) whenever instrument or respondent_name is left null at the JPA layer, despite the mapping permitting null. The mismatch between entity nullability (nullable) and DB nullability (NOT NULL) is invisible until runtime insert failure in production.

**Evidence.**

> DDL portal_sessions: `instrument VARCHAR(255) NOT NULL`, `respondent_name VARCHAR(255) NOT NULL`, `language VARCHAR(64) NOT NULL DEFAULT 'English'`, plus `answers JSON`, `mqt_scores JSON`, `demographics JSON`. The PortalSession entity maps `instrument`/`respondentName`/`language` as plain nullable Strings and replaces answers/mqt_scores/demographics with @OneToMany child collections. The migration runner only drops `answers`, `mqt_scores`, `demographics` (lines 113-115) — it does NOT touch the NOT-NULL `instrument`/`respondent_name` columns.

**Recommendation.** Decide ownership: either keep these columns required and add `@Column(nullable=false)` to PortalSession.instrument/respondentName/language (and guarantee they are always set), or relax the DB with `ALTER TABLE portal_sessions MODIFY instrument VARCHAR(255) NULL, MODIFY respondent_name VARCHAR(255) NULL;`. Align the DDL and entity so nullability matches exactly.

**Verifier confirmed.** The DDL at lines 261–288 of 01-schema.sql confirms `instrument VARCHAR(255) NOT NULL`, `respondent_name VARCHAR(255) NOT NULL`, and `language VARCHAR(64) NOT NULL DEFAULT 'English'`. The PortalSession entity maps all three as plain nullable String fields with no `@Column(nullable=false)`. The migration runner (lines 113–115) only drops `answers`, `mqt_scores`, and `demographics` from `portal_sessions` — it never alters `instrument` or `respondent_name`. The nullability mismatch is genuine. In practice, `AssessmentsService.fromDto` passes `dto.getInstrument()` and `dto.getRespondentName()` directly through without null guards, so if a caller supplies null for either, the INSERT will throw `SQLIntegrityConstraintViolationException`. `language` is effectively protected by an application-level fallback to "English" in every known creation path, but `instrument` and `respondentName` are not. Severity is adjusted down from Critical to High: failures only materialize when the DTO carries null for these fields (not on every INSERT), but the path is reachable from external API calls and the mismatch is invisible until runtime.

---
### [DDL-04] published_questionnaires is missing all versioning + instructions columns from the DDL; ddl-auto silently adds them with no FK on parent_id/branched_from

**Severity:** High · **Dimension:** DDL drift *(finder ref `REL-04`)* · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:322-341`, `model/PublishedQuestionnaire.java:70-127`, `config/QuestionnaireVersioningMigrationRunner.java:73-129`

**Problem.** These columns exist only because ddl-auto adds them. Hibernate adds the columns but will NOT backfill existing rows nor create the implied FKs (parent_id, branched_from_version_id, Questionnaire.current_version_id, Assessment.questionnaire_version_id). The versioning migration runner depends on these columns existing and writes parent_id/current_version_id with no referential enforcement.

**Impact.** The entire Git-style versioning graph has zero DB-level integrity. A deleted version or parent orphans assessments pinned to it (Assessment scoring is pinned to questionnaire_version_id), and the backfill (runner line 123) silently skips 'stale FK' rows, leaving assessments unversioned. The DDL cannot recreate the live schema.

**Evidence.**

> DDL published_questionnaires has no instructions, show_instructions, parent_id, version_major, version_minor, version_label, version_name, version_comments, version_status, branched_from_version_id, committed_at, committed_by. The entity declares all of them, several @Column(nullable=false) (version_major/minor default 1/0, version_status, show_instructions). parent_id logically references questionnaires(id) and branched_from_version_id references published_questionnaires(id), with no DB FK.

**Recommendation.** Add the version/instructions columns to the published_questionnaires DDL and a `questionnaires` table DDL, then add FKs: `ALTER TABLE published_questionnaires ADD CONSTRAINT fk_pq_parent FOREIGN KEY (parent_id) REFERENCES questionnaires(id);` and `ALTER TABLE assessments ADD CONSTRAINT fk_assess_version FOREIGN KEY (questionnaire_version_id) REFERENCES published_questionnaires(id);`. Switch to ddl-auto=validate after reconciling.

**Verifier confirmed.** All evidence claims are verified verbatim in the source. The DDL at 01-schema.sql lines 322-341 defines published_questionnaires with only base columns; it is missing all 12 versioning and instructions columns declared in PublishedQuestionnaire.java (instructions, show_instructions, parent_id, version_major, version_minor, version_label, version_name, version_comments, version_status, branched_from_version_id, committed_at, committed_by). The entity marks show_instructions (line 73), version_status (line 116), version_major (line 99), and version_minor (line 102) as @Column(nullable=false), meaning a fresh DB provisioned purely from the DDL and started with ddl-auto=update would initially have NULL in those columns for any rows inserted before Hibernate runs its ALTER. The questionnaires table (@Table(name="questionnaires") in Questionnaire.java) has no CREATE TABLE in the DDL at all, and neither does the assessments table. No FK constraints exist for parent_id, branched_from_version_id, or questionnaire_version_id anywhere in the DDL. application.properties confirms ddl-auto=update, meaning Hibernate silently adds columns but does not backfill existing rows or create FK constraints. The migration runner at line 123 explicitly silently skips assessments whose old questionnaire_id no longer maps to a known version ("stale FK; leave the row alone"), confirming that orphaned assessments remain unversioned with no DB-level detection. The DDL is genuinely out of sync with the live schema and cannot recreate it; the versioning graph has zero referential integrity enforcement. Severity High is appropriate.

---
### [DDL-07] measured_qualities.mqts JSON column dropped, but the new self-referential mqts tree table has no DDL and no FK constraints

**Severity:** High · **Dimension:** DDL drift *(finder ref `REL-07`)* · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:156-163`, `model/MeasuredQuality.java:34-37`, `model/Mqt.java:30-40`, `config/JsonToTableMigrationRunner.java:112`

**Problem.** The mqts table is created only by ddl-auto with no FK on mq_id or parent_mqt_id. The replacement tree has no DB referential integrity. A deleted MeasuredQuality leaves orphan Mqt rows; a deleted parent Mqt can orphan its subtree when removed outside the managed collection.

**Impact.** Orphaned MQT rows break questionnaire MQ/MQT scoring (scores reference mqt_id). DDL is non-reproducible for the MQ tree.

**Evidence.**

> DDL measured_qualities has `mqts JSON NOT NULL` and NO `mqts` table. The Mqt entity (@Table=mqts) has @ManyToOne mq_id (nullable=false) -> measured_qualities, self-FK parent_mqt_id, and @OneToMany children with cascade+orphanRemoval. Migration runner drops measured_qualities.mqts (line 112) and inserts into the ddl-auto-created mqts table (migrateMqtTree).

**Recommendation.** Add `CREATE TABLE mqts (... mq_id VARCHAR(64) NOT NULL, parent_mqt_id VARCHAR(64) NULL, ... CONSTRAINT fk_mqts_mq FOREIGN KEY (mq_id) REFERENCES measured_qualities(id) ON DELETE CASCADE, CONSTRAINT fk_mqts_parent FOREIGN KEY (parent_mqt_id) REFERENCES mqts(id) ON DELETE CASCADE)` to the DDL.

**Verifier confirmed.** All cited evidence is confirmed by reading the actual source files. The DDL at 01-schema.sql defines `measured_qualities` with `mqts JSON NOT NULL` (lines 156-163) but contains no `CREATE TABLE mqts` anywhere in the file. The `Mqt` entity (@Table("mqts")) has `@JoinColumn(name="mq_id", nullable=false)` pointing to `measured_qualities` and a self-referential `@JoinColumn(name="parent_mqt_id")`, but neither column has a corresponding FOREIGN KEY constraint in the DDL. The `mqts` table is created solely by Hibernate's `ddl-auto=update` (confirmed in application.properties line 9), which in this codebase does not emit FK constraints (no @ForeignKey annotations are present on either JoinColumn). The migration runner at line 112 calls `dropLegacyColumn("measured_qualities", "mqts")` and `migrateMqtTree()` correctly reads the JSON and inserts into the `mqts` table, but the entire `mqts` table is absent from the Docker init script (`docker/mysql-init/01-schema.sql`), making the schema non-reproducible from DDL alone. A fresh Docker deployment will have `measured_qualities` with `mqts JSON NOT NULL` but no `mqts` table until Hibernate creates it on first startup, and even after creation there are no DB-level FK constraints: deleting a MeasuredQuality outside the JPA-managed collection leaves orphan mqts rows, and removing a parent Mqt outside the managed `children` collection leaves orphan subtree rows. The impact on MQT-based scoring (item_option_scores, item_question_scores, portal_session_mqt_scores all reference mqt_id with no FK) is real. Severity High is accurate.

---
### [PK-02] Hibernate-created tables get NO indexes on FK / hot-lookup columns that are mapped as plain @Column (not @ManyToOne)

**Severity:** High · **Dimension:** Keys / Index · **Confidence:** High

**Locations:** `model/PortalSession.java:26-27 (assessment_id), :77-78 (entity_id), :68-69 (group_id), :31-32 (respondent_id)`, `model/AssessmentToken.java:36-46 (assessment_id, entity_id, group_id, respondent_id)`, `repository/PortalSessionRepository.java:46-56 (countByAssessmentId / countByAssessmentIdAndEntityId)`, `repository/AssessmentTokenRepository.java:15-31 (findByAssessmentId / findByScope)`

**Problem.** Plain @Column string FKs receive no automatic index from Hibernate (only true @ManyToOne join columns or @Index/@Table(indexes=...) declarations do), and ddl-auto=update never adds indexes to a pre-existing table. The hot paths — assessment cap enforcement, /assessments/:id/respondents listing, grouped All-Assessments view, token-by-assessment lookup, token-by-scope reuse — all filter/group on these unindexed columns.

**Impact.** Full table scans of portal_sessions and assessment_tokens on every cap check, assessment detail load, and invite-link issue. As session volume grows this becomes an O(N) scan per respondent fan-out and per page load; cap enforcement (a correctness guard) silently degrades and can race under load. assessment_tokens.findByScope scans every token for the assessment on every copy-link click.

**Evidence.**

> portal_sessions is created in 01-schema.sql with ONLY idx_portal_sessions_respondent + idx_portal_sessions_status; there is NO index on assessment_id, entity_id, group_id. The PortalSession entity declares these as @Column(name="assessment_id"/"entity_id"/"group_id") (plain strings, not @ManyToOne), so Hibernate's ddl-auto=update never creates an index for them. Yet countByAssessmentIdAndEntityId (the per-(entity,assessment) cap check run on every session creation) filters WHERE s.assessmentId = :aid AND s.entityId = :eid.

**Recommendation.** Add explicit indexes via @Table(indexes=...) on the entities AND ship DDL since update won't backfill: e.g. @Table(name="portal_sessions", indexes={@Index(name="idx_ps_assessment", columnList="assessment_id"), @Index(name="idx_ps_assessment_entity", columnList="assessment_id,entity_id"), @Index(name="idx_ps_group", columnList="group_id")}); plus CREATE INDEX idx_ps_assessment_entity ON portal_sessions(assessment_id, entity_id); CREATE INDEX idx_tokens_assessment ON assessment_tokens(assessment_id); CREATE INDEX idx_tokens_scope ON assessment_tokens(assessment_id, entity_id, group_id, respondent_id);

**Verifier confirmed.** All evidence cited in the finding is confirmed by reading the actual source. In 01-schema.sql, portal_sessions is defined (lines 261-288) with only idx_portal_sessions_respondent and idx_portal_sessions_status — there is no index on assessment_id, entity_id, or group_id, and those columns are not even present in the DDL at all (they are Hibernate-managed additions via ddl-auto=update). PortalSession.java declares assessment_id (line 26), entity_id (line 77), and group_id (line 68) as plain @Column string fields with no @Index annotation and no indexes attribute on the bare @Table(name="portal_sessions") annotation. AssessmentToken.java similarly declares all four scope columns as plain @Column strings with no indexes on @Table(name="assessment_tokens"); that entire table is absent from the DDL and exists only via ddl-auto=update, meaning it has zero manually-defined indexes. PortalSessionRepository.java confirms countByAssessmentIdAndEntityId (lines 55-56) filters WHERE assessmentId = :aid AND entityId = :eid on every cap check, findSummariesByAssessmentId (lines 38-41) filters by assessment_id, and findAssessmentGroups (lines 61-71) does a GROUP BY assessment_id — all will cause full table scans. AssessmentTokenRepository.java confirms findByScope (lines 23-31) filters on all four unindexed columns. application.properties confirms ddl-auto=update (line 9) which never backfills indexes onto existing tables. The problem, impact, and recommendation stated in the finding are all technically sound.

---
### [SEC-02] No password hashing infrastructure exists; SecurityConfig defines no PasswordEncoder

**Severity:** High *(finder rated Critical)* · **Dimension:** Security · **Confidence:** High

**Locations:** `config/SecurityConfig.java:25-101`, `service/AuthService.java:63`, `service/PractitionersService.java:114`, `service/RespondentsService.java:115`

**Problem.** The application has no credential-hashing mechanism at all. Every credential comparison is a plaintext equality. Even if DOB were replaced by a chosen password tomorrow, there is no encoder to hash it, so passwords would also land in the DB in cleartext.

**Impact.** Any future or current secret stored for authentication is stored and compared in cleartext. A single DB dump fully compromises all accounts with zero cracking effort, and there is no defense-in-depth (no work factor, no salt).

**Evidence.**

> SecurityConfig.java contains no `PasswordEncoder` bean and no `AuthenticationManager`/`UserDetailsService` credential wiring; all three login services compare the credential as a raw string. There is no `import ...crypto.password...` anywhere in the security/config packages.

**Recommendation.** Add `@Bean public PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }` to SecurityConfig, store only hashes, and route all credential verification through `passwordEncoder.matches()`.

**Verifier confirmed.** All evidence cited in the finding is confirmed by reading the source. SecurityConfig.java (lines 1-102) contains no PasswordEncoder bean and no AuthenticationManager or UserDetailsService wiring — the only beans defined are a CORS source and a JWT token filter. AuthService.java line 63 performs a raw string equality check: `!dob.equals(u.getDob() == null ? null : u.getDob().trim())`. PractitionersService.java and RespondentsService.java push the DOB comparison into plaintext DB queries (findActiveByEmailAndDob, findByEmailAndDob). User.java's `dob` field is a plain VARCHAR and its Javadoc explicitly labels it as "Permanent credential". IdentityBootstrapRunner seeds the super admin with `u.setDob(dob)` directly from the plaintext config value. A project-wide grep for PasswordEncoder, BCrypt, and crypto.password returns zero hits in the application source. The credential system as implemented has no hashing, no salt, and no work factor anywhere. However, the credential itself is a date of birth (format YYYY-MM-DD), not a user-chosen password — DOB has low entropy regardless of hashing, so the marginal uplift from hashing is less dramatic than the finding implies for current users. The absence of any hashing infrastructure is nevertheless a genuine architectural gap: any future migration to a real password would inherit the plaintext storage pattern, and current DOB credentials are fully exposed by any DB read. Severity is adjusted from Critical to High because the credential is a low-entropy DOB (not an arbitrary secret), which limits the practical confidentiality gain from hashing, but the structural absence of any encoding infrastructure remains a real and serious flaw.

---
### [SEC-04] JWT signing secret and DB passwords have hardcoded defaults committed in properties

**Severity:** High · **Dimension:** Security · **Confidence:** High

**Locations:** `resources/application.properties:33`, `resources/application-prod.properties:4`, `security/TokenProvider.java:37-39`

**Problem.** The JWT HMAC secret has a concrete fallback value baked into version control, and the prod DB password defaults to `bodh`. If the corresponding env vars are not set (a single deploy mistake), the app silently runs on the publicly-known committed secret.

**Impact.** Anyone with repo access who knows the default is in effect can forge JWTs for any userId/userType — including `ADMIN` + `SUPER_ADMIN` — and gain god-mode access without any credential. Combined with the query-param token fallback in TokenAuthenticationFilter, a forged token can be passed even in a URL. The `bodh` DB default similarly risks an unauthenticated DB if not overridden.

**Evidence.**

> application.properties: `app.auth.tokenSecret=${APP_AUTH_TOKEN_SECRET:926D96C90030DD58429D2751AC1BDBBC...BD7CF85F8B2C6B9D2A1C}`. application-prod.properties: `spring.datasource.password=${DB_PASSWORD:bodh}`. TokenProvider builds the HMAC key directly from this value.

**Recommendation.** Remove the literal fallback so startup fails fast when the secret is absent: `app.auth.tokenSecret=${APP_AUTH_TOKEN_SECRET}` (no default) and `spring.datasource.password=${DB_PASSWORD}`. Rotate the leaked secret/password immediately and treat the committed values as compromised.

**Verifier confirmed.** All three pieces of evidence are confirmed verbatim in the source. application.properties line 29 contains the full hardcoded 128-character hex JWT secret as a Spring property fallback. application-prod.properties line 4 contains `spring.datasource.password=${DB_PASSWORD:bodh}`. TokenProvider.java lines 37-38 constructs the HMAC SecretKey directly from whatever string the property resolves to, meaning the committed default is silently used when APP_AUTH_TOKEN_SECRET is unset. TokenAuthenticationFilter.java additionally confirms the query-param token fallback (?token=...) on lines 50-51. The attack chain is genuine: an attacker with repo access can sign arbitrary JWTs using the public default secret, include any userType (ADMIN/SUPER_ADMIN) and roles in the claims, and deliver the token via URL query parameter — all without any real credential. The DB password default `bodh` is a separate but confirmed risk. High severity is correct.

---
### [SEC-05] Multi-tenant isolation absent: tenant FK missing on all identity/PII/session JPA tables; one tenant can read another's data

**Severity:** High *(finder rated Critical)* · **Dimension:** Security · **Confidence:** High

**Locations:** `model/User.java:35-64`, `model/Respondent.java:10-12`, `model/PortalSession.java:14-78`, `model/EntityRegistration.java:23-71`, `controller/RespondentsController.java:32-36`, `controller/EntityRegistrationsController.java:28-36`, `config/SecurityConfig.java:98`

**Problem.** The data model has no enforced tenant/entity boundary on the tables holding people and their assessment sessions. PortalSession.entityId and User.entityIds exist but are never used to filter reads, and there is no DB-level tenant FK. Authorization is coarse (only ROLE_PRACTITIONER / ROLE_RESPONDENT / ROLE_ADMIN), so any authenticated principal of any tenant passes `anyRequest().authenticated()`.

**Impact.** Horizontal privilege escalation / cross-tenant data exposure: any logged-in respondent or practitioner (even a self-registered one) can call GET /api/v1/respondents and GET /api/v1/entity-registrations to read every tenant's PII (names, emails, phones, DOBs), GET/PUT/DELETE arbitrary respondents by id, and read any session. This is a direct breach of multi-tenant confidentiality for a system holding psychometric and demographic PII.

**Evidence.**

> Only QuestionnaireCatalog.java carries `@Column(name="tenant_id")`. app_users/respondents/portal_sessions/entity_registrations have NO tenant_id field and no per-entity filter. SecurityConfig ends with `.anyRequest().authenticated()` and there is no @PreAuthorize anywhere except LiveTrackingController. RespondentsService.list() is `repo.findAllOrderByCreatedAt()` — every row, unscoped.

**Recommendation.** Introduce an enforced tenant/entity scope: add `tenant_id`/`entity_id` to app_users, respondents, portal_sessions, entity_registrations, and a Hibernate `@Filter`/`@Where` or service-layer `WHERE entity_id IN (:callerEntityIds)` on every list/get/update/delete. Add method security (`@PreAuthorize`) restricting management endpoints to ADMIN/PRACTITIONER and scoping results to the principal's entityIds. DDL: add the FK columns and `FOREIGN KEY ... REFERENCES entity_registrations(id)`.

**Verifier confirmed.** The core authorization gap is confirmed. RespondentsService.list() calls repo.findAllOrderByCreatedAt() with no caller-scoping, and EntityRegistrationsService.list() calls repo.findAllOrderByCreatedAtDesc() equally unscoped. SecurityConfig ends at .anyRequest().authenticated() with no route-level restrictions on GET/PUT/DELETE for /api/v1/respondents or /api/v1/entity-registrations. The @EnableGlobalMethodSecurity(prePostEnabled=true) is declared but @PreAuthorize appears only on LiveTrackingController — RespondentsController and EntityRegistrationsController have zero method-level guards. A valid RESPONDENT JWT (issued by /api/v1/respondents/login) satisfies the authentication check and can enumerate all respondents, all entity registrations, and modify or delete arbitrary records. The DDL confirms: the respondents and portal_sessions tables have no tenant_id or entity_id FK column. PortalSession.java has an entity_id field but it was added post-schema via ddl-auto=update with no constraint, and no query filter uses it. However, the "Critical multi-tenant isolation" framing is overstated: this is a single-tenant application where "entity" means an organization/company within one deployment, not a separate tenant. The actual failure is a missing RBAC layer — management endpoints (list-all, update, delete) should be restricted to ADMIN/PRACTITIONER roles and are not. Downgraded from Critical to High because cross-deployment tenant isolation is not the architecture here; the genuine risk is horizontal privilege escalation within a single deployment (any authenticated respondent can read all other respondents' PII and mutate/delete records).

---
### [SEC-06] DOB credential is written to application logs in cleartext on every login attempt

**Severity:** High · **Dimension:** Security · **Confidence:** High

**Locations:** `service/AuthService.java:56,64`, `service/PractitionersService.java:109-143`, `service/RespondentsService.java`

**Problem.** The login credential (DOB) and the account identifier (email) are emitted to INFO/WARN logs on every attempt, including the stored DOB on mismatch. Since DOB *is* the password here, this is logging plaintext credentials.

**Impact.** Anyone with log access (ops, log aggregators, SIEM, leaked log files) obtains valid login credentials for any account, including the stored correct DOB on failed attempts. This defeats whatever protection the credential offered and creates a compliance violation for PII (DOB) at rest in logs.

**Evidence.**

> AuthService.java:56 `log.info("[login-debug] auth login attempt: email='{}' dob={}", email, dob);` and :64 `log.warn("... (stored={}, typed={})", email, u.getDob(), dob);`. PractitionersService logs `storedDob={} vs typedDob={}` with full email.

**Recommendation.** Remove the `dob`/`storedDob`/`typedDob` and full-email values from all `[login-debug]` log lines (these were flagged 'Remove once login is fixed' in the code). Never log credentials; log only a boolean match result and a hashed/opaque user id.

**Verifier confirmed.** The evidence quotes are verified verbatim in the source. AuthService.java line 56 emits `log.info("[login-debug] auth login attempt: email='{}' dob={}", email, dob)` — logging the user-supplied DOB credential at INFO level on every login attempt. Line 64 emits `log.warn("[login-debug] FAIL: dob mismatch for '{}' (stored={}, typed={})", email, u.getDob(), dob)` — on a failed attempt this logs BOTH the stored (correct) DOB pulled from the database AND the typed DOB at WARN level. PractitionersService.java lines 109-110 similarly logs the DOB at INFO level on every practitioner login attempt, and lines 133-137 log `storedDob={} vs typedDob={}` (the stored correct DOB) on mismatch. The code itself contains inline comments acknowledging these are debug lines that must be removed ("Remove once login is fixed"), confirming these were intentional but temporary additions that were never cleaned up. The claim about RespondentsService logging credentials is incorrect — that service's login method (lines 103-130) contains no credential logging; it silently throws on mismatch. That inaccuracy in one of the three cited locations does not negate the genuine vulnerability in the other two. Since DOB is the sole authentication factor (used as a password), emitting it in cleartext logs — especially emitting the stored correct value on failed attempts — constitutes a real credential-leakage vulnerability. Anyone with log access (ops dashboards, log aggregators, SIEM exports, leaked log archives) obtains valid login credentials. High severity is appropriate.

---
### [SEC-07] All PII (names, emails, phone, DOB, demographics, answers) stored unencrypted with no data classification

**Severity:** High · **Dimension:** Security · **Confidence:** Medium

**Locations:** `model/Respondent.java:17-45`, `model/UserMeta.java:18-39`, `model/PortalSession.java:31-84`, `model/PortalSessionDemographic.java:35-39`, `model/AssessmentAnswer.java`, `docker/mysql-init/01-schema.sql:194-208,261-288`

**Problem.** A psychometric SaaS holds special-category personal data (health-adjacent psychometric results, demographics, DOB, contact info). The model stores all of it as plaintext columns with no encryption-at-rest annotation (e.g. no JPA AttributeConverter for sensitive fields), no tokenization, and no classification. DOB is duplicated across respondents, app_users, entity_registrations, and demographics, widening the exposure surface.

**Impact.** Any database compromise, backup leak, or over-broad query (see SEC-05) exposes the full PII/psychometric dataset in directly usable form. For psychometric/health-adjacent data this is a high-severity privacy and regulatory (GDPR special category / similar) exposure.

**Evidence.**

> Respondent: `email`, `phone`, `dob`, `company_id` as plain VARCHAR. PortalSession denormalizes `respondent_name`, `respondent_email` into every session. PortalSessionDemographic stores arbitrary demographic answers as `value TEXT`. DDL has no encryption, no column-level protection, no classification comments.

**Recommendation.** Classify sensitive columns and apply column-level encryption for the most sensitive (DOB, demographic answers, psychometric results) via a JPA `AttributeConverter` backed by an envelope-encrypted key (KMS), or MySQL/InnoDB at-rest encryption + restricted access. Stop denormalizing email/name/dob into portal_sessions unless necessary, to shrink the PII blast radius.

**Verifier confirmed.** All evidence cited in the finding is confirmed by direct code inspection. Respondent.java (lines 17-45) stores name, email, phone, dob as plain String fields with no @Convert or AttributeConverter annotation. PortalSession.java denormalizes respondent_name and respondent_email into every session row as plain strings. PortalSessionDemographic.java stores arbitrary demographic answers as columnDefinition="text" with no encryption. AssessmentAnswer.java stores free_text responses as plain text. EntityRegistration.java also holds dob, phone, email in plaintext, further widening the DOB duplication surface the finding describes. The DDL at 01-schema.sql has no ENCRYPTION directives, no column-level protection, no InnoDB transparent data encryption setup, and no classification comments. A full-codebase grep for AttributeConverter, @Convert, encrypt, AES, cipher, and KMS returned zero results — there is no encryption at any layer (application, database, or infrastructure config). The production datasource URL in application-prod.properties uses useSSL=false, meaning transport encryption to the DB is also disabled by default. The finding's factual claims are entirely accurate and the severity of High is appropriate given that this is a psychometric SaaS handling health-adjacent psychometric results, demographics, DOB, and contact information. The auditor's confidence rating of "Medium" is actually conservative — the absence of encryption is directly and completely verifiable from the code.

---
### [SEC-08] Audit log has no tamper-evidence, nullable actor, and no tenant — integrity not guaranteed despite being the security record

**Severity:** High · **Dimension:** Security · **Confidence:** High

**Locations:** `model/AuditLogEntry.java:23-53`, `service/AuditService.java:34-48`, `controller/AuditLogController.java`

**Problem.** The audit trail is described as append-only but is a normal read/write JPA entity with no immutability enforcement (no trigger/REVOKE UPDATE,DELETE, no hash-chaining), nullable actor, and no tenant attribution. Anyone with write access to the DB (or the application) can silently alter or delete history, and many privileged actions reachable without a logged-in admin record actorId=NULL.

**Impact.** The audit log cannot be relied on for forensic or compliance purposes: entries are forgeable/erasable without detection, cross-tenant actions are indistinguishable, and actor attribution is missing for the highest-risk anonymous flows (token issue/consume). Undermines incident investigation and non-repudiation.

**Evidence.**

> AuditLogEntry maps a plain mutable table with `@Column(name="actor_id") private String actorId;` (nullable, no NOT NULL) and setters on every field; AuditService sets actor only `if (p != null)` — anonymous/public-token actions record a NULL actor. No tenant_id, no hash chain / signature / sequence-integrity column. The table is created only by Hibernate (absent from canonical DDL), so it has no DB-side constraints.

**Recommendation.** Make actor_id NOT NULL (or record a synthetic 'anonymous/system' actor), add tenant_id, and add tamper-evidence: a per-row hash chaining the previous row's hash (or DB-level append-only via a trigger that blocks UPDATE/DELETE and a DB role with INSERT-only grants). Define the table in the canonical DDL with these constraints since ddl-auto=update will never add them.

**Verifier confirmed.** All evidence claims are verified by the actual source code. AuditLogEntry.java (lines 31-32) declares `actorId` with no `nullable=false` constraint and exposes public setters on every field with no `@Immutable` or similar guard. AuditService.java (lines 37-40) only sets actor fields inside `if (p != null)`, so any call from an unauthenticated or non-UserPrincipal security context records actorId=NULL. AuditLogRepository extends JpaRepository which provides full delete/update CRUD — no append-only enforcement exists at any layer. The entity has no tenant_id field. The canonical DDL at /home/morningstar/Projects/bodh/bodhassess-api-spring/docker/mysql-init/01-schema.sql contains no `audit_log` table whatsoever (confirmed by grep returning empty), so the table is created solely by Hibernate ddl-auto=update, which adds no DB-level constraints or triggers. Additionally, the `consume()` method in AssessmentTokenService (line 186-191) — which is called by the public anonymous /api/v1/public/tokens/** endpoint — increments usedCount but calls no audit.record at all, meaning anonymous token consumption is not logged. All three sub-claims (nullable actor, no tamper-evidence/immutability, absent from canonical DDL) are genuine. High severity is appropriate: the audit trail cannot be used for forensic or compliance purposes but this is not a direct exploitation vector like an injection or privilege escalation.

---
### [SEC-09] JPA entities bound directly as request bodies enable mass-assignment / privilege bypass

**Severity:** High *(finder rated Medium)* · **Dimension:** Security · **Confidence:** Medium

**Locations:** `model/EntityRegistration.java:60-71`, `service/EntityRegistrationsService.java:87-95`, `controller/EntityRegistrationsController.java:43-60`

**Problem.** `active` is an explicit admin approval gate ('new rows default to inactive so an admin must approve'). The update path accepts client-controlled `active` and `memberIds` and the endpoint has no method-level authorization restricting it to admins or scoping it to the caller's tenant (SEC-05). Any authenticated caller can set active=true and inject arbitrary respondent ids into any entity's member set.

**Impact.** A non-admin (or another tenant's user) can self-approve a self-registered entity (active=true) and add/remove arbitrary respondents as members of any entity, bypassing the moderation gate and corrupting membership/allotment scoping. Membership changes also are not audited here.

**Evidence.**

> EntityRegistration has an admin-only gate `@Column(name="active", nullable=false) private boolean active = false;` and `memberIds`. The PATCH endpoint binds an `EntityRegistrationDto` and `adminUpdate` does `if (dto.getActive() != null) e.setActive(dto.getActive());` / `if (dto.getMemberIds() != null) e.setMemberIds(...)`. The PATCH route is only behind generic `anyRequest().authenticated()` with no role/scope check.

**Recommendation.** Restrict the PATCH to admins via `@PreAuthorize("hasRole('ADMIN')")` and scope to the caller's tenant; never let the public/self-service path mutate `active` or `memberIds`. Use a dedicated input DTO that excludes privileged fields rather than mirroring the entity.

**Verifier confirmed.** All evidence quotes are accurate and the flaw is genuine. In EntityRegistration.java lines 60-71 the `active` field is explicitly documented as an admin-controlled approval gate ("New rows default to inactive so an admin must explicitly approve"). EntityRegistrationsService.java lines 87-95 implements `adminUpdate` that applies `dto.getActive()` and `dto.getMemberIds()` unconditionally when non-null. EntityRegistrationsController.java lines 57-60 maps this to `PATCH /api/v1/entity-registrations/{id}` with no `@PreAuthorize`, `@Secured`, or `@RolesAllowed` annotation. SecurityConfig.java shows the fallback rule is `.anyRequest().authenticated()` — the PATCH endpoint only requires a valid JWT, not any specific role. UserPrincipal defines three user types: PRACTITIONER, RESPONDENT, ADMIN, and only PRACTITIONER/RESPONDENT grants ROLE_PRACTITIONER/ROLE_RESPONDENT authorities — neither restricts access to this endpoint. Therefore any authenticated user (practitioner, respondent) can send `{"active":true}` to self-approve any entity registration, or inject arbitrary respondent IDs into any entity's member set. The method-level Javadoc says "Admin-only" but no security enforcement backs this. Severity is adjusted to High (not Medium) because the `active` flag is the sole moderation gate described in the code comments, and bypassing it directly grants unauthorized entities access to assessment allotments.

---
### [VER-03] Respondent portal resolves questionnaire content by NAME, not by the pinned version id — reads a mutable, ambiguous target

**Severity:** High *(finder rated Critical)* · **Dimension:** Versioning · **Confidence:** High

**Locations:** `PublicRegistrationService.java:152-153`, `PortalSession.java:40 (instrument)`, `QuestionnairesController.java:42-45`, `QuestionnairesService.java:59-63`, `PublishedQuestionnaireRepository.java:35-36`

**Problem.** The session carries only the questionnaire's display name, and the take-assessment flow looks up content by that name. With multiple committed versions per family all sharing the same name, findByName returns N rows and arbitrarily picks the first (no ORDER BY, no version filter). The session is therefore not bound to the immutable snapshot it was created for; it resolves to whichever same-named row the DB returns first, which changes as versions are added/edited.

**Impact.** Two respondents in the same assessment can be served different versions; a respondent can be served a different version than the one the assessment intended; editing/adding a version changes what already-registered respondents see and how they are scored. The published snapshot tree is effectively bypassed — content/scoring read a mutable, name-keyed target. There is also no DB uniqueness on name, so the ambiguity is unbounded.

**Evidence.**

> PublicRegistrationService stamps the session with only a name: `s.setInstrument(a.getQuestionnaireName()); s.setInstrumentFullName(a.getQuestionnaireName());` — no version id. The content endpoint is `/by-name` -> `getByName(name)` -> `repo.findByName(name)` (`WHERE LOWER(q.name)=LOWER(:n) OR LOWER(q.shortName)=LOWER(:n)`) which returns a `List` and the service does `hits.get(0)`.

**Recommendation.** Persist the pinned version id on PortalSession (e.g. published_questionnaire_id / questionnaire_version_id) at registration from Assessment.questionnaireVersionId, and resolve take/score content via findById(versionId), never by name. Deprecate the by-name lookup for the take flow.

**Verifier confirmed.** All cited evidence is present and accurate in the code. PublicRegistrationService lines 152-153 store only the questionnaire display name (`a.getQuestionnaireName()`) on the PortalSession — no version id. PortalSession has no questionnaire_version_id column in either the entity class or the DDL. The findByName JPQL query (`WHERE LOWER(q.name)=LOWER(:n) OR LOWER(q.shortName)=LOWER(:n)`) has no ORDER BY and no version filter, and QuestionnairesService.getByName() does hits.get(0) on the raw result. The published_questionnaires.name column has only a non-unique index in the DDL, so multiple rows can share a name. AssessmentService.create() never sets questionnaireVersionId on the Assessment entity even though the field exists and the code comment explicitly says it "drives content shown to the respondent." The QuestionnaireVersioningMigrationRunner only backfills legacy data on startup. The upsert() method does delete same-name rows before saving, which partially mitigates the plain (non-versioned) duplicate-name scenario — but this deduplication only runs at publish time, not at read time, and with Git-style versioning multiple committed versions (different ids, related names) can coexist. The architectural intent for version pinning exists but the wiring is absent end-to-end: PortalSession carries no version id, so the take-assessment flow resolves content by mutable name lookup regardless of which version was intended at registration time. Severity is adjusted to High (not Critical) because the upsert() deduplication means the simple case of two rows with an identical name string is unlikely in the non-versioned code path; the risk materialises primarily once the versioning feature (parent/child committed versions) is used in production, at which point it becomes Critical in practice.

---
### [VER-04] Version number assignment has a read-then-write race with no unique constraint — duplicate version labels under concurrent commits

**Severity:** High · **Dimension:** Versioning · **Confidence:** High

**Locations:** `QuestionnaireVersioningService.java:252-264`, `PublishedQuestionnaireRepository.java:65-69`, `PublishedQuestionnaire.java:99-106`

**Problem.** Next-version computation is a classic read-max-then-insert with no serialization. Two concurrent commitDraft calls on the same parent both read the same latest committed (major,minor) and both compute and persist the same next label. There is no DB-level uniqueness to reject the collision (and under ddl-auto=update such a constraint would never be added retroactively even if declared).

**Impact.** Two distinct version rows can share the same semver label (e.g. two 'v1.1') under the same parent. Downstream lookups, the version picker, audit history, and any assumption that a label identifies a version break; 'set current' and reporting become ambiguous. Lost-update on the parent's current_version_id pointer is also possible.

**Evidence.**

> commitDraft: `List<PublishedQuestionnaire> latest = versions.findLatestCommittedByParent(p.getId()); ... nextMajor = lm + 1 ... v.setVersionLabel("v"+nextMajor+"."+nextMinor)`. No row lock, no SELECT ... FOR UPDATE, no @Version optimistic lock, and the entity has no unique constraint on (parent_id, version_major, version_minor) or (parent_id, version_label).

**Recommendation.** Add @Version optimistic locking to PublishedQuestionnaire (or pessimistic-lock the parent row during commit), and declare a unique constraint `@UniqueConstraint(columnNames={"parent_id","version_major","version_minor"})`. Because ddl-auto=update won't create it, also add it to 01-schema.sql / a migration: `ALTER TABLE published_questionnaires ADD UNIQUE KEY uniq_pq_parent_version (parent_id, version_major, version_minor)`.

**Verifier confirmed.** The finding is confirmed as a genuine fault. All quoted evidence exists verbatim in the source:

1. QuestionnaireVersioningService.java lines 252-264: `findLatestCommittedByParent` is a plain SELECT (no FOR UPDATE), followed by arithmetic on the result, then `versions.save(v)`. There is no row lock, no pessimistic lock annotation, and no GET_LOCK advisory lock (that pattern exists only in RespondentsService for bulk respondent uploads, not here).

2. PublishedQuestionnaire.java: The entity has no `@Version` field and no `@Table(uniqueConstraints=...)` clause at all. The `@Table(name="published_questionnaires")` annotation is bare.

3. 01-schema.sql: The `CREATE TABLE published_questionnaires` DDL does not include the versioning columns (parent_id, version_major, version_minor, version_label, version_status, committed_at, committed_by, branched_from_version_id). Those columns are added only by Hibernate's `ddl-auto=update` at startup, which cannot retroactively add unique constraints — confirmed by application.properties line 9 (`spring.jpa.hibernate.ddl-auto=update`).

4. No unique key on (parent_id, version_major, version_minor) exists anywhere — not in the DDL, not as a JPA annotation, not as a migration script.

The race is a textbook read-max-then-insert without serialization. Two concurrent `commitDraft` calls on the same parent questionnaire, arriving within the same short window, will both read the same "latest committed" row, compute identical next-version numbers, and persist two rows with the same (parent_id, version_label) — e.g., two "v1.1" rows — with no DB-level constraint to reject the second insert. The class-level `@Transactional` provides only per-call atomicity, not serialized ordering across concurrent callers. The severity of High is appropriate given the data integrity impact on version history and the assessment-create version picker.

---
### [VER-06] Canonical DDL is massively drifted: no parent/assessment/snapshot tables and no versioning columns — production schema exists only by ddl-auto=update

**Severity:** High · **Dimension:** Versioning · **Confidence:** High

**Locations:** `01-schema.sql:322-341 (published_questionnaires)`, `01-schema.sql (no questionnaires/assessments tables)`, `PublishedQuestionnaire.java:96-126`, `Assessment.java`

**Problem.** All versioning state and the entire normalized snapshot tree are created implicitly by Hibernate ddl-auto=update, which never adds FK constraints, unique keys, indexes, or NOT NULL retroactively, and never reconciles drift. The hand-written DDL — declared canonical — does not describe the live shape at all for the versioning subsystem.

**Impact.** Anyone provisioning from 01-schema.sql gets a schema that can't hold versions or snapshots correctly; required FKs/uniques (e.g. VER-04) are absent because ddl-auto won't create them; the version_status column the immutability guard relies on (QuestionnairesService.upsert:86) is missing from the canonical schema, so a fresh DB has no DRAFT/COMMITTED gate until Hibernate adds the column with whatever nullability it infers. Operational integrity of the snapshot/versioning model is unenforced at the DB layer.

**Evidence.**

> 01-schema.sql defines published_questionnaires with legacy JSON columns `mqs JSON, questions JSON, demographic_field_keys JSON` and NONE of the versioning columns (parent_id, version_major/minor, version_status, branched_from_version_id, committed_at/by). There is NO `questionnaires` (parent) table, NO `assessments` table, NO `assessment_*_allotment` tables, and NONE of the snapshot child tables (published_questionnaire_questions/_options/_option_scores/_question_scores/_mqs/_mqts) or assessment_answers/portal_session_mqt_scores. The doc says this file is 'the real source of truth for the live DB'.

**Recommendation.** Bring 01-schema.sql in sync: add the questionnaires, assessments, allotment, and all published_questionnaire_* / assessment_answers / portal_session_* tables with explicit FKs, NOT NULL, and the unique constraints from VER-04; add the versioning columns to published_questionnaires. Stop depending on ddl-auto=update for structural integrity (set to validate in prod).

**Verifier confirmed.** All evidence claims are confirmed by direct source inspection. The canonical DDL at 01-schema.sql (the only SQL file in the project) defines published_questionnaires with the three legacy JSON blobs (mqs, questions, demographic_field_keys) and zero versioning columns (parent_id, version_major/minor, version_status, branched_from_version_id, committed_at/by). The Java entity PublishedQuestionnaire.java lines 96-126 declares all of those versioning columns as mapped @Column fields, none of which appear in the DDL. There is no `questionnaires` table in the DDL despite Questionnaire.java being annotated @Table(name="questionnaires"). There is no `assessments` table despite Assessment.java using @Table(name="assessments"). The assessment allotment tables (assessment_entity_allotments, assessment_group_allotments, assessment_respondent_allotments) and all snapshot child tables (published_questionnaire_mqs, published_questionnaire_mqts, published_questionnaire_questions, published_questionnaire_question_options, published_questionnaire_question_option_scores, published_questionnaire_question_scores, assessment_answers, portal_session_mqt_scores) are entirely absent from the DDL, despite corresponding @Entity classes existing in the model package. application.properties confirms ddl-auto=update is active for all profiles, meaning Hibernate silently creates these tables and columns — without FK constraints, NOT NULL enforcement, unique indexes, or any of the structural guarantees the DDL was meant to capture. This is a genuine, well-evidenced schema drift finding. The severity of High is appropriate: a fresh provisioning from the canonical DDL produces a schema that cannot correctly hold versions, snapshots, assessments, allotments, or normalized answers.

---
### [CON-01] Token single-use / maxUses redemption is a lost-update race (read-modify-write, no lock, no @Version, no atomic UPDATE)

**Severity:** High *(finder rated Critical)* · **Dimension:** Concurrency · **Confidence:** High

**Locations:** `service/PublicRegistrationService.java:67-74,166-167`, `service/AssessmentTokenService.java:186-191`, `model/AssessmentToken.java:51-52`

**Problem.** The usedCount cap is enforced by reading the row, comparing in Java, then writing read+1 — a classic check-then-act. Two requests redeeming the same token concurrently both read the same usedCount, both pass the maxUses gate, and both write the same incremented value (a lost update). There is no @Version optimistic lock, no SELECT ... FOR UPDATE, and no atomic `UPDATE ... SET used_count = used_count + 1 WHERE used_count < max_uses` guard.

**Impact.** A single-use (maxUses=1) invite link can be redeemed N times in parallel, creating N respondents/sessions and bypassing per-entity caps; usedCount under-counts so the cap is never actually reached. Directly defeats the documented 'the link is generated once' / single-use guarantee and lets attackers fan out registrations.

**Evidence.**

> PublicRegistrationService.register: `if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses()) throw ...` then later `t.setUsedCount(t.getUsedCount() + 1); tokens.save(t);`. AssessmentTokenService.consume: `t.setUsedCount(t.getUsedCount() + 1); return toDto(tokens.save(t));`. AssessmentToken.usedCount is a plain `int` with no @Version.

**Recommendation.** Make redemption atomic: add a derived/conditional update on the repository, e.g. `@Modifying @Query("UPDATE AssessmentToken t SET t.usedCount = t.usedCount + 1 WHERE t.token = :tok AND (t.maxUses IS NULL OR t.usedCount < t.maxUses)")` and treat an affected-rows==0 result as 'cap reached'. Alternatively add `@Version private long version;` to AssessmentToken and retry on OptimisticLockException. Do the increment BEFORE creating the respondent/session so the cap is reserved.

**Verifier confirmed.** The finding is confirmed genuine. All cited evidence was verified in the source:

1. AssessmentToken.java lines 51-52: `usedCount` is a plain `int` field with no `@Version` annotation and no optimistic-lock field anywhere in the class.

2. PublicRegistrationService.java lines 72-74 and 166-167: The cap check (`if (t.getMaxUses() != null && t.getUsedCount() >= t.getMaxUses())`) and the increment (`t.setUsedCount(t.getUsedCount() + 1); tokens.save(t)`) are separate in-memory operations with no atomic database-level guard between them.

3. AssessmentTokenService.java lines 186-191: The `consume()` method has the identical read-modify-write pattern with no locking.

4. AssessmentTokenRepository.java: Contains no `@Modifying` conditional UPDATE, no `@Lock(LockModeType.PESSIMISTIC_WRITE)`, and no atomic `UPDATE ... WHERE used_count < max_uses` query.

5. application.properties: No custom transaction isolation level is set; MySQL defaults to REPEATABLE READ, which does not prevent lost updates between two concurrent transactions that each read the same row before either commits.

Two concurrent HTTP requests both redeeming the same maxUses=1 token will both read usedCount=0, both pass the cap gate, both write usedCount=1 (a lost update), and both successfully create respondent rows and portal sessions — bypassing the single-use guarantee entirely.

Severity is adjusted from Critical to High because exploitation requires concurrent requests arriving in a tight time window (a race condition rather than a straightforward logic bypass), and typical registration flows involve human-speed interactions that reduce but do not eliminate the practical risk. An attacker scripting parallel requests can reliably trigger the race.

---
### [CON-02] Per-(entity,assessment) session cap is enforced with a count-then-insert race

**Severity:** High · **Dimension:** Concurrency · **Confidence:** High

**Locations:** `service/AssessmentService.java:189-197`, `service/PublicRegistrationService.java:118-162`, `repository/PortalSessionRepository.java:55-56`

**Problem.** The cap check is a COUNT(*) read followed by an unguarded INSERT of a new portal_sessions row, with nothing serialising the gap. Concurrent registrations for the same (assessment, entity) all observe the same count, all pass the gate, and all insert sessions. There is no unique constraint or counter row that could reject the surplus inserts.

**Impact.** Entity caps (e.g. 'this company gets 50 seats') are routinely overshot under concurrent self-registration — exactly the high-traffic public path. Over-allocation of paid assessment seats / licence breaches and incorrect billing.

**Evidence.**

> AssessmentService.wouldExceedEntityCap: `long used = sessionRepo.countByAssessmentIdAndEntityId(assessmentId, entityId); return used + extra > al.getCap();`. PublicRegistrationService then unconditionally `sessions.save(s)` a few lines later.

**Recommendation.** Serialise the check+insert: either take a pessimistic lock on the AssessmentEntityAllotment row (`@Lock(LockModeType.PESSIMISTIC_WRITE)` on a findById used inside the same tx) before counting and inserting, or model the cap as a single counter row updated with a conditional atomic `UPDATE ... SET used = used + 1 WHERE used < cap`. The existing GET_LOCK pattern (used in RespondentsService.bulkCreate) could also be applied keyed by assessmentId+entityId.

**Verifier confirmed.** The evidence quote is accurate and the race condition is genuine. `AssessmentService.wouldExceedEntityCap` (lines 189-197) performs a COUNT(*) read via `sessionRepo.countByAssessmentIdAndEntityId`, and `PublicRegistrationService.register` calls this check at line 118 then unconditionally inserts a new `PortalSession` at line 162. Both methods share the same transaction (the `@Transactional(readOnly=true)` on `wouldExceedEntityCap` uses default propagation REQUIRED, so it joins the caller's transaction). However, sharing a single transaction does not prevent the race: under MySQL REPEATABLE READ, two concurrent transactions both begin before either commits, both read the same pre-insert count, both pass the cap gate, and both insert — overshooting the cap by one per concurrent request. The DDL confirms there is no unique constraint on `(assessment_id, entity_id)` in `portal_sessions`, no counter column, and no pessimistic lock on the `AssessmentEntityAllotment` row before counting. The `GET_LOCK` pattern that exists in `RespondentsService.bulkCreate` is not applied here. The impact on paid seat/licence limits is real and the high-traffic public-registration path makes it exploitable in practice.

---
### [CON-03] clear()+re-add of child collections collides with their UNIQUE constraint (Hibernate orphan-removal ordering): answer/score/demographic saves can fail or corrupt

**Severity:** High · **Dimension:** Concurrency · **Confidence:** High

**Locations:** `service/AssessmentsService.java:242-259,281-308,325-339`, `model/AssessmentAnswer.java:21-24`, `model/PortalSessionMqtScore.java:19-22`, `model/PortalSession.java:57-66`

**Problem.** On a re-save of an existing session (the normal auto-save / answer-update path), the collection is cleared (orphanRemoval schedules DELETEs) and repopulated with rows carrying the SAME (session_id, question_id) keys. Hibernate's ActionQueue orders entity INSERTs before collection-orphan DELETEs within one flush, so the new INSERT for a question already present transiently duplicates the unique key and throws a ConstraintViolationException.

**Impact.** Every PUT /assessments/{id} that updates answers/scores for a question that already has a row can 500 with a unique-constraint violation, rolling back the whole save — respondents lose their progress on auto-save. Where it doesn't throw it depends on fragile statement ordering. This is the core scoring/answer-persist path.

**Evidence.**

> applyAnswersFromMap: `s.getAnswers().clear(); ... s.getAnswers().add(row);` then a single `repo.save(s)` flush. assessment_answers has `@UniqueConstraint(columnNames={"session_id","question_id"})`; portal_session_mqt_scores has `@UniqueConstraint(columnNames={"session_id","mqt_id"})`. No em.flush() between clear() and the re-adds.

**Recommendation.** Either (a) call `repo.flush()` (or em.flush()) immediately after each `getXxx().clear()` so DELETEs hit the DB before the re-inserts, mirroring the flush already done in QuestionnairesService.upsert; or (b) switch from clear+rebuild to an in-place merge (update existing rows by key, insert only new keys, remove only missing keys); or (c) configure `hibernate.order_updates`/use a Set keyed by business key. Option (b) is the robust enterprise fix.

**Verifier confirmed.** All evidence cited in the finding is confirmed by reading the actual source files. `applyAnswersFromMap` (lines 242-259), `applyMqtScoresFromMap` (lines 281-308), and `applyDemographicsFromMap` (lines 325-339) all follow the exact pattern: `s.getXxx().clear()` followed by re-population with new entity objects carrying the same business keys, then a single `repo.save(s)` at line 159 of `update()`. The `PortalSession` entity has `orphanRemoval = true` on all three `@OneToMany` collections (lines 57-66), and `AssessmentAnswer` and `PortalSessionMqtScore` carry the exact `@UniqueConstraint` annotations cited (on `{session_id, question_id}` and `{session_id, mqt_id}` respectively). No `hibernate.order_updates`/`order_inserts` properties are set, and no intermediate `flush()` call exists in `AssessmentsService.update()`. Crucially, `QuestionnairesService` already has a `repo.flush()` call (line 99) with an explicit comment explaining why it is needed to prevent INSERT/DELETE ordering races — confirming the team is aware of the problem in that service but missed it here. Hibernate's default `ActionQueue` ordering inserts entity `INSERT` actions before orphan-removal `DELETE` actions within a single flush, so on any update that re-saves a question/MQT/demographic already present, the new `INSERT` races the pending `DELETE` for the same unique key, producing a `ConstraintViolationException`. The 500-error on every auto-save update for an existing answer row is a genuine production bug. Severity High is appropriate.

---
### [CON-04] No optimistic locking (@Version) on any entity — concurrent edits silently lost across the whole model

**Severity:** High · **Dimension:** Concurrency · **Confidence:** High

**Locations:** `model/PortalSession.java:14-19`, `model/Assessment.java`, `model/AssessmentEntityAllotment.java:21-34`, `model/PublishedQuestionnaire.java`, `model/Respondent.java`

**Problem.** With no @Version column, Hibernate issues blind `UPDATE ... WHERE id = ?` statements. Two admins (or an admin + the respondent's own auto-save) editing the same row concurrently each overwrite the other; the second writer wins and the first writer's changes vanish with no error. Status transitions, cap changes, and score writes are all exposed.

**Impact.** Last-write-wins data loss on every concurrent edit: a cap raised by one admin can be silently reverted, a session marked Completed can be flipped back to Active by a stale auto-save, score/answer edits clobber each other. No conflict is ever surfaced. The DatasetService.applyEdits path even advertises 'optimistic concurrency' but implements it on a client-supplied updated_at string (see CON-08), not a real @Version.

**Evidence.**

> grep for `@Version` across src/main/java returns nothing. Every mutating service is load-mutate-save: e.g. AssessmentService.updateStatus does `a.setStatus(next); repo.save(a);`; AssessmentAllotmentsService.updateEntityCap does `row.setCap(cap); save(row);`; RespondentsService.update overwrites fields.

**Recommendation.** Add `@Version private long version;` (mapped to a `version BIGINT NOT NULL DEFAULT 0` column) to the mutable entities that have concurrent writers — at minimum PortalSession, Assessment, AssessmentEntityAllotment, AssessmentToken, Respondent, EntityRegistration. Handle ObjectOptimisticLockingException at the controller layer (HTTP 409). Note ddl-auto=update will add the column but never backfill safely, so ship explicit DDL too.

**Verifier confirmed.** All evidence cited in the finding is confirmed by direct code inspection. The grep for @Version across all of src/main/java returns nothing — no entity uses Hibernate optimistic locking. The five cited entities (PortalSession, Assessment, AssessmentEntityAllotment, PublishedQuestionnaire, Respondent) are all confirmed to have no @Version field. The DDL (01-schema.sql) contains no version column on portal_sessions, respondents, or published_questionnaires; the assessments and assessment_entity_allotments tables are Hibernate-managed only (ddl-auto=update) and also carry no version column. The load-mutate-save pattern is confirmed in all three services: AssessmentsService.update (lines 128-159) does findById then setStatus/setScore/etc. then repo.save; AssessmentAllotmentsService.updateEntityCap (lines 94-101) does the same; RespondentsService.update (lines 84-96) does the same. The "optimistic concurrency" in DatasetService.applyEdits is a soft check comparing a client-supplied rowUpdatedAt string to the DB updated_at field — not a real @Version and subject to races within the same transaction. No pessimistic locking, no SELECT FOR UPDATE, no custom transaction isolation is used anywhere. Two concurrent writers will each issue a blind UPDATE ... WHERE id = ? and the last write silently wins with no exception raised. The severity of High is correct: the most acute scenario is a respondent auto-save racing an admin status/score write on PortalSession, but the narrow concurrent-edit window and typical single-admin-per-session usage keeps this below Critical.

---
### [CON-05] Concurrent member additions to entity_members / respondent_group_members lose updates (EAGER ElementCollection full-rewrite)

**Severity:** High · **Dimension:** Concurrency · **Confidence:** High

**Locations:** `service/PublicRegistrationService.java:106-134`, `model/EntityRegistration.java:67-71`, `model/RespondentGroup.java:36-42`, `service/EntityRegistrationsService.java:90-94`

**Problem.** Adding a member is load-the-whole-Set / add-one / save. Two respondents registering against the same entity link concurrently both load the Set without member X or Y, each adds only its own id, and each save rewrites the collection (Hibernate typically DELETEs absent rows / re-inserts) from its stale snapshot. One of the two new members is dropped. No row-level lock or @Version guards the parent.

**Impact.** Under concurrent self-registration (the entity/group invite link is explicitly multi-use), members silently go missing from the entity/group, so they never receive the fanned-out assessments and counts are wrong. Membership corruption is hard to detect and reproduce.

**Evidence.**

> PublicRegistrationService: `if (!e.getMemberIds().contains(respondentId)) { e.getMemberIds().add(respondentId); entities.save(e); }` and the same pattern for groups. EntityRegistration.memberIds is `@ElementCollection(fetch=EAGER)` Set<String> on table entity_members.

**Recommendation.** Insert the membership directly as its own row instead of round-tripping the whole Set: give entity_members/respondent_group_members a real join entity (or use a native `INSERT IGNORE INTO entity_members(entity_id,respondent_id) VALUES(?,?)` keyed by a UNIQUE(entity_id,respondent_id)). If keeping the ElementCollection, add @Version to EntityRegistration/RespondentGroup so a lost update throws instead of silently dropping a member.

**Verifier confirmed.** All evidence quoted in the finding is confirmed by reading the source. EntityRegistration.java:67-71 has an @ElementCollection(fetch=EAGER) Set<String> memberIds on table entity_members with no @Version and no @UniqueConstraint. RespondentGroup.java:36-42 is identical. PublicRegistrationService.java:112-115 performs the exact load-check-add-save pattern described, and lines 130-133 do the same for groups. The service class is @Transactional at default (READ_COMMITTED) isolation with no pessimistic locking; EntityRegistrationRepository and RespondentGroupRepository have no @Lock annotations. The DDL file (01-schema.sql) does not define entity_members or respondent_group_members at all — Hibernate creates them via ddl-auto=update without a UNIQUE(entity_id, respondent_id) constraint. Under concurrent self-registration on the same invite link, two transactions each load the stale set, each adds only its own member id, and Hibernate's ElementCollection flush issues a DELETE-all-rows-for-owner followed by re-insert of the in-memory set. Whichever transaction commits second silently drops the member added by the first. No @Version guard causes an optimistic lock exception to surface this. The severity is correctly stated as High.

---
### [CON-06] N+1 query explosion: list/dataset endpoints fetch all sessions then walk lazy child collections per row

**Severity:** High · **Dimension:** Concurrency · **Confidence:** High

**Locations:** `service/DatasetService.java:79-101,285-351`, `service/AssessmentsService.java:46-52`, `service/QuestionnairesService.java:38-44`, `repository/PortalSessionRepository.java:16-17`, `model/PortalSession.java:57-66`

**Problem.** For the full Sessions dataset, each row's mqtScores and demographics (and in the full AssessmentsService.list path, answers too) are lazily initialised one entity at a time. A grid of N sessions issues 1 + 2N (or 3N) SELECTs. The same anti-pattern exists in QuestionnairesService.list, which maps every PublishedQuestionnaire through toDto and touches its EAGER ElementCollections + lazy mqs/questions trees.

**Impact.** The admin dataset/grid and questionnaire-list endpoints degrade linearly with data volume — hundreds of round-trips and connection-pool pressure for a single page load; under load this is a latency/throughput cliff and a DoS vector. open-in-view=false means each lazy hit also stays inside the service tx, holding the connection longer.

**Evidence.**

> DatasetService.sessions: `List<PortalSession> sessions = repo.findAllOrderByCreated();` then buildColumns + buildRow iterate `s.getMqtScores()` and `s.getDemographics()` for every session. PortalSessionRepository.findAllOrderByCreated is `SELECT s FROM PortalSession s` with no fetch join; the answers/mqtScores/demographics @OneToMany are LAZY.

**Recommendation.** For read views, fetch via projection DTOs in a single query (already done for the slim summaries — extend that), or use `JOIN FETCH` / @EntityGraph to batch-load mqtScores+demographics, or set `hibernate.default_batch_fetch_size` (e.g. 50) so collections load in IN-batches. For DatasetService specifically, build the dynamic columns/rows from a flat projection query rather than walking managed-entity graphs.

**Verifier confirmed.** All evidence in the finding is confirmed by reading the source code directly.

DatasetService.sessions (line 79) calls `repo.findAllOrderByCreated()` which executes `SELECT s FROM PortalSession s ORDER BY s.createdAt DESC` with no fetch join. The three @OneToMany collections on PortalSession (answers, mqtScores, demographics at lines 57-66) carry no fetch=EAGER, no @BatchSize, and no @EntityGraph — defaulting to LAZY. Both buildColumns (lines 297-310) and buildRow (lines 340-350) iterate s.getMqtScores() and s.getDemographics() for every session in the result set, triggering two additional SELECT statements per session. For N sessions this produces 1 + 2N queries.

AssessmentsService.list (lines 46-52) calls the same bare-entity query paths and then passes each PortalSession through toDto(), which accesses all three lazy collections (answers, mqtScores, demographics), yielding 1 + 3N queries.

QuestionnairesService.list (lines 38-44) calls repo.findAllOrderByCreated() returning full PublishedQuestionnaire entities, then maps each through toDto() which accesses q.getMqs() (LAZY OneToMany) and q.getQuestions() (LAZY OneToMany). The two ElementCollections (languages, demographicFieldKeys) are EAGER but still generate a separate SQL join per entity during loading.

No mitigating configuration exists: application.properties has no hibernate.default_batch_fetch_size, no @BatchSize annotations appear on any of the lazy collections, no @EntityGraph is used in PortalSessionRepository or PublishedQuestionnaireRepository. spring.jpa.open-in-view=false is confirmed (line 12 of application.properties), meaning every lazy hit occurs inside the service transaction, holding the DB connection for the full duration of the grid-build loop.

The safer projection paths (listSummaries, listGroups, findAllSummariesOrderByCreated) do exist and correctly avoid this pattern, but the full-entity list() methods remain exposed on the REST API and are the paths the finding cites. The "DoS vector" framing is mildly overstated since these are authenticated admin endpoints, but the latency and connection-pool degradation at scale is genuine and High severity is appropriate.

---
### [SD-01] Soft-delete tombstone ItemDisplayState.deleted is written but never read — 'deleted' items resurface everywhere

**Severity:** High · **Dimension:** Validation · **Confidence:** High

**Locations:** `model/ItemDisplayState.java:14-27`, `service/ItemDisplayService.java:49-55`, `controller/ItemDisplayController.java:34-35`, `repository/ItemDisplayStateRepository.java:9`

**Problem.** The deleted flag is a soft-delete tombstone for the questionnaire builder, but nothing filters items by it. The Item entity has no `@Where(clause="...")`, and the item/question listing paths never join item_display_state to exclude deleted item_ids. The only reader (ItemDisplayService.list) just echoes the flag back; it does not remove the item from any catalog.

**Impact.** An author 'deletes' an item, the tombstone row flips to deleted=1, but the item continues to appear in item lists, question banks, and any published/snapshot rendering — the delete is a no-op from the user's perspective. Conversely, this is dead state that misleads anyone reading the schema. Deleted clinical items can still be served to respondents.

**Evidence.**

> ItemDisplayService.markDeleted: `s.setDeleted(true); repo.save(s);` exposed at DELETE `/api/v1/item-display/{id}`. ItemDisplayStateRepository has no query method, and grep shows `ItemDisplayStateRepository` is injected ONLY into ItemDisplayService — no ItemsService / QuestionnairesCatalogService consults the tombstone. No `@Where`/`@SQLDelete` exists on Item.

**Recommendation.** Either implement the filter (e.g. an explicit `WHERE i.id NOT IN (SELECT item_id FROM item_display_state WHERE deleted=1)` in the item/question queries, or move the flag onto Item and add `@Where(clause="deleted = false")` with `@SQLDelete`), or remove the soft-delete feature entirely if hard delete is intended. Do not ship a write-only tombstone.

**Verifier confirmed.** All evidence cited in the finding is confirmed by the actual source code. ItemDisplayService.markDeleted (lines 49-55) sets deleted=true and saves via repo, exactly as quoted. ItemDisplayStateRepository has no custom query methods beyond JpaRepository. The list() method in ItemDisplayService (lines 25-34) maps the deleted flag through to a DTO but applies no filter — it is purely a read-through of all rows. ItemsService.listByQuestionnaireCatalog executes a raw SQL query "SELECT ... FROM items WHERE instrument_id = ?1" with no join to item_display_state and no filter on deleted. QuestionnairesCatalogService has zero references to item_display_state. The Item entity has no @Where, @SQLDelete, or deleted field. No other class in the codebase injects or references ItemDisplayStateRepository. The DDL at 01-schema.sql:361-365 confirms the table and column exist without any associated view, trigger, or CHECK constraint that would enforce filtering. The hard-delete path (DELETE /{id} → service.clear()) physically removes the row, so the only soft-delete path is markDeleted, which is genuinely write-only. The tombstone is never consulted when serving items to any downstream consumer, including item listing and questionnaire rendering paths.

---
### [TS-02] Audit log is ordered and timestamped by a column that is always NULL, silently breaking chronological audit

**Severity:** High · **Dimension:** Validation · **Confidence:** High

**Locations:** `model/AuditLogEntry.java:52-53`, `repository/AuditLogRepository.java:15-19`, `service/AuditService.java:33-47,81-84`

**Problem.** The `audit_log` table is created by ddl-auto (not in 01-schema.sql), so `created_at` has no DB default and, being insertable=false, is never written — it is permanently NULL. The audit log is explicitly documented as an append-only trail of admin actions, where the timestamp is essential.

**Impact.** Every audit entry has no usable timestamp; the history tabs and 'who paused and when' narrative the code comments promise are unrecoverable. ORDER BY created_at over all-NULL keys yields non-deterministic ordering, so the audit history is neither chronological nor trustworthy for compliance/forensics.

**Evidence.**

> AuditLogEntry: `@Column(name = "created_at", insertable = false, updatable = false) private OffsetDateTime createdAt;`. AuditLogRepository: `SELECT a FROM AuditLogEntry a ORDER BY a.createdAt DESC`. AuditService.record(...) sets actor/action/target/before/after but never a timestamp; toDto: `if (e.getCreatedAt() != null) d.setCreatedAt(...)`.

**Recommendation.** Set the timestamp in code: add `@CreationTimestamp @Column(name="created_at", updatable=false) private OffsetDateTime createdAt;` (remove insertable=false), or set `e.setCreatedAt(OffsetDateTime.now(UTC))` in AuditService.record. Optionally add `audit_log` to the canonical DDL with a `DEFAULT CURRENT_TIMESTAMP` for fresh installs.

**Verifier confirmed.** All four evidence points are confirmed by direct source reading. In AuditLogEntry.java line 52-53, `created_at` is annotated `insertable=false, updatable=false` with no `@CreationTimestamp` or `@PrePersist` to supply a value from the Java side. AuditService.record() (lines 33-47) never sets `createdAt`. AuditLogRepository orders both queries by `a.createdAt DESC` (lines 15-19). The `toDto()` method silently skips the timestamp with a null guard (lines 81-84). The `audit_log` table is absent from 01-schema.sql (the only DDL file), so it is created entirely by Hibernate's `ddl-auto=update` (application.properties line 9); Hibernate will generate a nullable column with no DEFAULT, not a `DEFAULT CURRENT_TIMESTAMP`. The result is that every audit row will have a permanently NULL `created_at`, making the ORDER BY non-deterministic and the timestamp field always absent from the DTO. The impact claim is accurate: the audit history is untrustworthy for chronological reconstruction or compliance. Severity High is correct.

---
### [VAL-01] PortalSession.status is a free String with no validation on the write path (Active/Completed/Pending Review accepted as anything)

**Severity:** High · **Dimension:** Validation · **Confidence:** High

**Locations:** `model/PortalSession.java:49,131-132`, `service/AssessmentsService.java:128-160,189-191`, `repository/PortalSessionRepository.java:49,66-68`

**Problem.** Unlike the first-class Assessment status (validated against a fixed set), the respondent-facing PortalSession.status is an unconstrained string set verbatim from the client DTO, with no enum, no DB CHECK (MySQL DDL has none), and no guarded transitions. The completion check is case-insensitive (`"Completed".equalsIgnoreCase`) but the aggregate COUNT/SUM queries are case-sensitive exact matches.

**Impact.** A client can persist any status string ('completed', 'done', 'COMPLETED', typos). Because the dashboard tallies use exact-match literals, a session saved as 'completed' is counted as not-completed in countByAssessmentIdAndStatus and the AssessmentGroupDto SUMs, corrupting completion metrics, live-tracking, and cap/overdue logic. State is effectively un-modelled, so invalid transitions (e.g. Completed -> Active) are silently allowed.

**Evidence.**

> PortalSession: `private String status;` (no @Column nullable=false, no enum). AssessmentsService.update: `if (StringUtils.hasText(dto.getStatus())) s.setStatus(dto.getStatus());` — no allow-list. Counts/grouping key off exact literals: `countByAssessmentIdAndStatus(..., "Completed")`, `SUM(CASE WHEN s.status = 'Active' ...)`, `s.status = 'Pending Review'`. Contrast AssessmentService.normaliseStatus (lines 244-250) which DOES validate ACTIVE/CLOSED/PAUSED.

**Recommendation.** Model status as a `@Enumerated(EnumType.STRING)` enum (or validate against a fixed Set as AssessmentService does) and normalize case on write. Add `@Column(nullable=false)` and a DB default. Guard transitions (e.g. reject changes out of Completed). Make the count queries use the same canonical values.

**Verifier confirmed.** All evidence quoted in the finding is confirmed by direct code inspection. PortalSession.java line 49 declares `private String status` with no @Enumerated, no validation annotation, and no @Column(nullable=false). AssessmentsService.java line 132 sets `s.setStatus(dto.getStatus())` verbatim from the client DTO with no allow-list check. The fromDto factory at line 190 similarly accepts any non-empty string as status. The DDL at docker/mysql-init/01-schema.sql defines `status VARCHAR(32) NOT NULL DEFAULT 'Active'` with no CHECK constraint or ENUM. The aggregate JPQL queries in PortalSessionRepository use exact string literals ('Completed', 'Active', 'Pending Review') for SUM/CASE expressions. The completion guard at line 146 uses equalsIgnoreCase, meaning the stored value may differ in case from the query literals. By contrast, AssessmentService.normaliseStatus (lines 244-250) validates and uppercases the first-class Assessment status against VALID_STATUSES — no equivalent guard exists for PortalSession. The case-sensitivity impact on COUNT queries is partially mitigated by MySQL's default case-insensitive collation for VARCHAR comparisons, but typos, arbitrary client-supplied strings (e.g. 'done', 'pending review' vs 'Pending Review'), and silently permitted invalid transitions (Completed back to Active) remain genuine data-integrity problems. The High severity is appropriate given the corruption risk to completion metrics, cap enforcement, and live-tracking dashboards.

---

## 🟡 Medium findings (25)
### [TYPE-03] Canonical DDL (01-schema.sql) still defines NOT-NULL JSON columns the entities no longer map — schema source-of-truth is stale and breaks fresh-DB inserts

**Severity:** Medium *(finder rated High)* · **Dimension:** Column types · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:160,185,218,219,249,250,273,274,275,331,332,333,336`, `config/JsonToTableMigrationRunner.java:108-136`

**Problem.** After the JSON->table migration the entities (MeasuredQuality, Role, RespondentGroup, Practitioner, PublishedQuestionnaire, PortalSession) no longer map these columns, yet 01-schema.sql — declared the canonical source of truth for the live DB — still recreates them as NOT NULL with no default on any fresh database. Hibernate INSERTs omit unmapped columns, so until JsonToTableMigrationRunner happens to run and DROP them, every insert into those tables fails. The DDL and the runtime have diverged: the runner, not the DDL, is the real schema authority.

**Impact.** On a freshly provisioned DB created from 01-schema.sql, inserts 500 with 'Field has no default value' for the window before/if the migration runner drops the columns; the documented canonical schema misleads operators and any tooling (backups, replicas, analytics DDL) built from it. ddl-auto=update will never drop these columns, so they linger.

**Evidence.**

> DDL fresh-create still emits e.g. measured_qualities.mqts JSON NOT NULL; roles.url_paths JSON NOT NULL; respondent_groups.member_ids JSON NOT NULL, assigned_instruments JSON NOT NULL; practitioners.roles/verticals JSON NOT NULL; published_questionnaires.languages/demographic_field_keys JSON NOT NULL, mqs/questions JSON; portal_sessions.answers/mqt_scores/demographics JSON. The runner comments confirm: 'the legacy columns are NOT NULL with no default, which would 500 on every create/update' and drops them at runtime.

**Recommendation.** Make 01-schema.sql reflect the post-migration reality: remove the migrated JSON columns from the CREATE TABLE statements (mqts, url_paths, member_ids, assigned_instruments, practitioners.roles/verticals, published_questionnaires.mqs/questions/languages/demographic_field_keys, portal_sessions.answers/mqt_scores/demographics), or at minimum declare them NULL DEFAULT NULL. Keep the runner's idempotent DROPs for existing DBs.

**Verifier confirmed.** The DDL divergence is confirmed and genuine. 01-schema.sql at lines 160, 185, 218-219, 249-250, 331, 336 defines NOT NULL JSON columns (measured_qualities.mqts, roles.url_paths, respondent_groups.member_ids/assigned_instruments, practitioners.roles/verticals, published_questionnaires.languages/demographic_field_keys) that are no longer mapped by their respective entities — all have been replaced with @ElementCollection/@OneToMany join-table mappings. The migration runner at lines 108-136 explicitly acknowledges this: "the legacy columns are NOT NULL with no default, which would 500 on every create/update." The runner does drop them at startup. However, the severity should be Medium rather than High because the "500 on insert" window is not a user-facing production risk: ApplicationRunner.run() executes synchronously during Spring startup before the embedded Tomcat begins accepting HTTP requests, so no API handler can fire until the drops have already occurred. The real, confirmed problem is that 01-schema.sql is the documented canonical DDL but does not reflect post-migration reality — operators provisioning new databases, running analytics against the schema file, or building replicas from the DDL will get NOT NULL columns that the application immediately drops on first boot. The portal_sessions.answers/mqt_scores/demographics columns (lines 273-275) are nullable in the DDL (JSON without NOT NULL), so they pose no insert-failure risk at all, making that part of the finding overstated. The stale DDL is a real schema documentation and tooling hazard, but the operational INSERT failure described in the impact is blocked in practice by the startup runner executing before any web requests are served.

---
### [TYPE-05] last_login timestamps stored as String/VARCHAR instead of a timestamp type

**Severity:** Medium · **Dimension:** Column types · **Confidence:** High

**Locations:** `Practitioner.java:48-49`, `User.java:54-55`, `docker/mysql-init/01-schema.sql:221`

**Problem.** A point-in-time value (last login) is stored as text. No timezone discipline, no chronological ordering at the DB, and the format is whatever the writer chose. This contrasts with the TIMESTAMP columns used for created_at/updated_at elsewhere.

**Impact.** Cannot ORDER BY / filter 'logged in since X' in SQL (lexicographic ordering only works if the format is rigidly identical, which a String does not guarantee); 'last active' dashboards and stale-account cleanup become unreliable; mixed formats or null/empty strings corrupt parsing.

**Evidence.**

> Practitioner: @Column(name = "last_login") private String lastLogin; DDL practitioners.last_login VARCHAR(32). User: @Column(name = "last_login") private String lastLogin; (app_users created by ddl-auto -> VARCHAR(255)).

**Recommendation.** Change lastLogin to java.time.OffsetDateTime (or Instant) and the columns to TIMESTAMP: ALTER TABLE practitioners MODIFY last_login TIMESTAMP NULL; and define app_users.last_login as TIMESTAMP NULL. Write UTC instants consistent with serverTimezone=UTC.

**Verifier confirmed.** All evidence quotes are confirmed verbatim. Practitioner.java lines 48-49 declare `@Column(name = "last_login") private String lastLogin;` and the DDL at line 221 defines `last_login VARCHAR(32)` on the `practitioners` table. User.java lines 54-55 likewise declare `private String lastLogin;`, and `app_users` is absent from the DDL entirely, so Hibernate ddl-auto=update will create it as VARCHAR(255). The contrast with correctly-typed TIMESTAMP columns (`created_at`, `updated_at` in both entities, and the legacy `users.last_login TIMESTAMP NULL` at DDL line 45) confirms this is an intentional divergence rather than an oversight in the DDL tool. Critically, `AuthService.login()` never calls `setLastLogin()` on the User entity — the field is only set via the PractitionersService DTO path, accepting whatever string the API caller provides, meaning there is no disciplined write path and the format is completely caller-defined. The stated impacts (no reliable ORDER BY, stale-account cleanup unreliable, mixed-format corruption risk) all follow from the String type. Severity Medium is correct: this is a schema design fault with real operational consequences but no immediate security or data-loss exposure.

---
### [REL-03] AssessmentToken->Assessment is a raw String FK with no cascade; deleting an Assessment orphans live registration tokens (and their QR blobs)

**Severity:** Medium · **Dimension:** Relationships · **Confidence:** High

**Locations:** `model/AssessmentToken.java:36-37`, `service/AssessmentService.java:171-182`

**Problem.** Tokens are children of an Assessment (token.assessmentId is NOT NULL and is meaningless without the parent) but the relationship is an unassociated String FK with no JPA cascade and no DB FK. delete() does not clean them up.

**Impact.** After an assessment is deleted, its registration/QR tokens remain valid in assessment_tokens. A respondent hitting the still-live link registers against a non-existent assessment (NPE/500 or a stranded session). Also a storage leak of the persisted LONGBLOB qr_code bytes. Tokens are an externally-shared, security-relevant artifact, so leaving them live after deletion is worse than a plain orphan.

**Evidence.**

> AssessmentToken.java: `@Column(name = "assessment_id", nullable = false, length = 64) private String assessmentId;` (no @ManyToOne). AssessmentService.delete() deletes the three allotment tables and the assessment, but never assessment_tokens.

**Recommendation.** In AssessmentService.delete add `tokenRepo.deleteByAssessmentId(id)` alongside the allotment cleanup (mirroring the existing pattern), or model AssessmentToken with `@ManyToOne @JoinColumn(name="assessment_id")` on the owning Assessment side with cascade REMOVE and add a DB FK `FOREIGN KEY (assessment_id) REFERENCES assessments(id)`.

**Verifier confirmed.** All three legs of the finding are confirmed by the source code. (1) AssessmentToken.java lines 36-37 hold a bare @Column String assessmentId with no @ManyToOne, no cascade, and no @ForeignKey annotation — exactly as quoted. (2) AssessmentService.delete() (lines 171-182) removes the three allotment tables and the assessment but has no import of AssessmentTokenRepository and no token cleanup call whatsoever. (3) The DDL file 01-schema.sql does not define an assessment_tokens table at all, so the table is Hibernate-auto-generated without any DB-level FK constraint on assessment_id. The impact is real: PublicRegistrationService.register() calls assessments.findById(t.getAssessmentId()).orElseThrow(...) when a token is consumed, so any respondent following a link whose parent assessment has been deleted receives a 500/ResourceNotFoundException. AssessmentTokenRepository already exposes findByAssessmentId, making the fix straightforward. Severity Medium is correct — it is a concrete broken-flow for end users and a LONGBLOB storage leak, but not a direct security exploit path.

---
### [REL-04] respondent_groups.parent_id: DDL declares a self-FK with ON DELETE CASCADE, but the entity maps it as a plain String — no JPA awareness, and silent multi-level child deletion

**Severity:** Medium · **Dimension:** Relationships · **Confidence:** Medium

**Locations:** `model/RespondentGroup.java:28-29`, `docker/mysql-init/01-schema.sql:248-256`

**Problem.** The schema enforces a real self-referencing hierarchy with database-level ON DELETE CASCADE, but JPA only sees an opaque String. Hibernate has no knowledge of the parent/child edge, so it neither orders deletes/inserts by the tree nor reflects the cascade. The persistence context can become stale after a DB-side cascade and the app can never navigate or eager-manage the hierarchy.

**Impact.** GroupsService.deleteById(parent) triggers a DB cascade that silently removes all descendant groups, but Hibernate's first-level cache / any loaded child entities are unaware — subsequent operations in the same unit of work can resurrect or fail on rows the DB already deleted. Deleting a top-level group can wipe an entire group subtree with no application-level confirmation or audit. Inserting a child before its parent in one batch can also violate the FK because Hibernate doesn't order by the (unknown) self-reference.

**Evidence.**

> Entity: `@Column(name = "parent_id") private String parentId;`. DDL: `parent_id VARCHAR(64), ... CONSTRAINT fk_groups_parent FOREIGN KEY (parent_id) REFERENCES respondent_groups(id) ON DELETE CASCADE`.

**Recommendation.** Either model the self-reference (`@ManyToOne @JoinColumn(name="parent_id") private RespondentGroup parent;` + `@OneToMany(mappedBy="parent") private List<RespondentGroup> children;`) so JPA understands the tree and you control cascade in code, OR drop the DB-side ON DELETE CASCADE (`...REFERENCES respondent_groups(id)` with no ON DELETE) and perform child handling explicitly in the service. Do not leave a DB cascade hidden from the ORM.

**Verifier confirmed.** All evidence quotes are verified verbatim. RespondentGroup.java lines 28-29 map parent_id as a plain @Column(name="parent_id") String, and the DDL at lines 248-255 of 01-schema.sql confirms CONSTRAINT fk_groups_parent FOREIGN KEY (parent_id) REFERENCES respondent_groups(id) ON DELETE CASCADE. GroupsService.delete() calls repo.deleteById(id) inside its own @Transactional context with no child-awareness. The DB cascade then silently removes all descendant groups without any application-level confirmation, audit, or JPA lifecycle event. The stale first-level cache risk across separate transactions is mitigated by spring.jpa.open-in-view=false, but within a single transaction that loads and then deletes a parent, child entities in the persistence context would be stale. The silent bulk-delete risk (deleting a top-level group wipes an entire subtree with no application-layer warning) is the primary genuine concern and warrants the Medium severity rating.

---
### [REL-05] Self-referencing snapshot/MQ trees (Mqt, PublishedQuestionnaireMqt) cascade-delete via JPA but have no DB FK ordering; deletes depend entirely on Hibernate emitting child-first DELETEs

**Severity:** Medium · **Dimension:** Relationships · **Confidence:** Medium

**Locations:** `model/Mqt.java:30-40`, `model/MeasuredQuality.java:34-37`, `model/PublishedQuestionnaireMqt.java:31-41`, `model/PublishedQuestionnaireMq.java:52-55`, `service/QualitiesService.java:64-69`

**Problem.** MeasuredQuality.mqts only contains root MQTs (because of @Where parent_id IS NULL), so a top-level orphanRemoval/cascade delete must rely on Hibernate recursively cascading through Mqt.children to reach grandchildren. This works only if Hibernate loads the full tree and issues leaf-first DELETEs; the deeper the tree, the more it depends on every nested children collection being initialized. Under ddl-auto=update there is a real self-FK on parent_mqt_id (Hibernate adds it when it creates the table fresh), so an out-of-order delete throws a constraint violation rather than silently leaking.

**Impact.** Deleting an MQ with multi-level MQT nesting (or a published questionnaire snapshot with nested MQTs) can throw a ConstraintViolationException (parent deleted before child) on databases where the FK exists, or silently leave grandchild rows orphaned where it doesn't — corrupting scoring lookups that resolve mqt_id against the tree. The @Where root-only filter is the root cause: cascade no longer mirrors the true child set held in the DB.

**Evidence.**

> Mqt.java self-ref: `@ManyToOne @JoinColumn(name="parent_mqt_id") private Mqt parent;` + `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true) private List<Mqt> children;`, with MeasuredQuality.mqts `@Where(clause="parent_mqt_id IS NULL")`. QualitiesService.delete just calls `repo.deleteById(id)`. The `mqts` table and self-FK exist only via ddl-auto=update (01-schema.sql still has `measured_qualities.mqts JSON NOT NULL` instead of a table).

**Recommendation.** Add `@OnDelete(action = OnDeleteAction.CASCADE)` to the parent self-ref @JoinColumn (so the DB FK carries ON DELETE CASCADE and deletes are correct regardless of Hibernate ordering), or have the service delete children depth-first explicitly before the root. Verify the generated mqts / published_questionnaire_mqts self-FK and add an explicit DDL `FOREIGN KEY (parent_mqt_id) REFERENCES mqts(id) ON DELETE CASCADE` to the canonical schema rather than relying on ddl-auto.

**Verifier confirmed.** The finding's evidence is fully accurate. All cited code constructs exist exactly as described: `Mqt.java` has the self-referencing `@ManyToOne @JoinColumn(name="parent_mqt_id")` plus `@OneToMany(mappedBy="parent", cascade=CascadeType.ALL, orphanRemoval=true) List<Mqt> children`; `MeasuredQuality.java` has `@Where(clause = "parent_mqt_id IS NULL")` on the `mqts` collection; `QualitiesService.delete` simply calls `repo.deleteById(id)` with no explicit tree traversal; and `01-schema.sql` still defines `mqts JSON NOT NULL` as a column on `measured_qualities` (line 160) — there is no `CREATE TABLE mqts` or `CREATE TABLE published_questionnaire_mqts` anywhere in the DDL file. The same `@Where(clause = "parent_id IS NULL")` pattern is confirmed on `PublishedQuestionnaireMq.java` line 53.

The dual-risk the finding describes is genuine: (1) Under `ddl-auto=update` (confirmed in `application.properties` line 9), Hibernate creates the `mqts` table with a self-FK on `parent_mqt_id`. Cascade-delete relies entirely on Hibernate loading and recursively traversing the `children` collections before issuing DELETEs; if a nested lazy collection is not initialized prior to deletion, Hibernate could attempt to delete a parent row before its children, triggering a FK constraint violation. (2) The canonical DDL and the entity model are structurally diverged — any environment that runs the DDL and uses `ddl-auto=none` or `validate` will fail at startup because the `mqts` table doesn't exist in the schema file.

The severity Medium is appropriate: the cascade-delete issue requires multi-level MQT nesting to trigger and depends on Hibernate's collection initialization behavior, making it an operational/data-integrity risk rather than a critical path failure. The DDL divergence compounds the risk for production deployments.

---
### [REL-07] EAGER @ElementCollection sets on instruments/items/published_questionnaires/groups/practitioners/roles load join tables on every entity read

**Severity:** Medium · **Dimension:** Relationships · **Confidence:** Medium

**Locations:** `model/QuestionnaireCatalog.java:52-56 (languages EAGER)`, `model/Item.java:84-88 (languages EAGER)`, `model/PublishedQuestionnaire.java:44-48 and 76-80 (languages + demographicFieldKeys EAGER)`, `model/RespondentGroup.java:36-46 (memberIds + assignedInstruments EAGER)`, `model/Practitioner.java:34-44 (roles + verticals EAGER)`, `model/Role.java:28-32 (urlPaths EAGER)`, `model/EntityRegistration.java:67-71 (memberIds EAGER)`

**Problem.** Every single-row read of these entities forces extra SELECTs against the collection tables, and any list query that needs more than one EAGER collection cannot be a single join (the code comments acknowledge this — Set is used specifically to dodge MultipleBagFetchException). EAGER is the wrong default for collections that are not needed on every read path (e.g. a respondent_group's full memberIds set when only listing group names).

**Impact.** N+1 / extra round-trips on every list and detail endpoint for these entities; with open-in-view=false the cost is concentrated in the service transaction. RespondentGroup with a large memberIds set drags the entire membership into memory just to render a group row. Practitioner login/list pulls roles+verticals join tables unconditionally.

**Evidence.**

> Repeated pattern `@ElementCollection(fetch = FetchType.EAGER) @CollectionTable(...)`. e.g. RespondentGroup: two EAGER Sets (memberIds, assignedInstruments); Practitioner: two EAGER Sets (roles, verticals); Item.languages EAGER.

**Recommendation.** Default these @ElementCollection sets to FetchType.LAZY and fetch them explicitly (JOIN FETCH / @EntityGraph / @BatchSize) only on the endpoints that render them. Keep EAGER only where the collection is genuinely required on every read (e.g. Role.urlPaths used by every security check), and even there prefer @BatchSize-tuned lazy loading.

**Verifier confirmed.** All seven cited locations were confirmed in the source code. Every entity listed carries at least one `@ElementCollection(fetch = FetchType.EAGER)` backed by a `@CollectionTable`, and no mitigations (`@BatchSize`, `@EntityGraph`, `JOIN FETCH`, DTO projections) exist anywhere in the codebase. The source code comments in `RespondentGroup` and `Practitioner` explicitly acknowledge using `Set` instead of `List` to dodge `MultipleBagFetchException` — confirming the developer knowingly chose EAGER loading for multiple collections per entity. With `spring.jpa.open-in-view=false` confirmed in `application.properties`, the full N+1 cost falls inside service transactions. List endpoints (`GroupsService.list()`, `PractitionersService.list()`) use plain JPQL (`SELECT g FROM RespondentGroup g ...`) that returns full entity objects, so Hibernate will fire 2 extra SELECTs per group row (memberIds + assignedInstruments) and 2 per practitioner row (roles + verticals). The problem and impact claims in the finding accurately reflect what the code does. Medium severity is appropriate — this is a performance/scalability concern, not a correctness or security bug.

---
### [DDL-03] User entity maps to app_users (not in DDL) while DDL ships a conflicting, dead `users` table with NOT NULL tenant_id + FK

**Severity:** Medium *(finder rated High)* · **Dimension:** DDL drift *(finder ref `REL-03`)* · **Confidence:** High

**Locations:** `model/User.java:35-37`, `model/UserMeta.java:16-18`, `docker/mysql-init/01-schema.sql:36-52`, `config/IdentityBootstrapRunner.java:59-77`

**Problem.** The canonical DDL's `users` table is dead (no entity maps it; kept per a stale comment 'the sessions list query JOINs against it' — and the sessions table is itself dropped by the migration runner). The live identity table app_users is created blindly by ddl-auto with no FK constraints and no tenant scoping; its email-uniqueness relies on @Column(unique=true), which Hibernate only enforces on a FRESH table — if app_users already exists from an earlier deploy without the unique index, ddl-auto will not add it retroactively.

**Impact.** Schema confusion plus a real integrity gap: the multi-tenant `users` table with its tenant FK is unused while real users live in an unconstrained app_users. If app_users predates the unique(email) mapping, duplicate-email accounts become possible, breaking the login-by-email identity model. The dead `users` table also still carries a NOT NULL FK to tenants that nothing satisfies.

**Evidence.**

> DDL defines `users` with `tenant_id CHAR(36) NOT NULL`, `name NOT NULL`, `role NOT NULL`, `CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)` and UNIQUE(tenant_id,email). The User entity is `@Table(name = "app_users")` with completely different columns (dob, is_super_admin, status) and no tenant_id. app_users, user_meta and user_entities have NO DDL — created by ddl-auto. The bootstrap runner writes the super admin into app_users.

**Recommendation.** Drop the dead `users` table from the DDL (or repurpose it), and add explicit `CREATE TABLE app_users (... email VARCHAR(255) NOT NULL, UNIQUE KEY uniq_app_users_email (email), ...)` plus user_meta (PK user_id, FK to app_users) and user_entities (FK user_id -> app_users) to 01-schema.sql with the unique constraint guaranteed. Verify/add `ALTER TABLE app_users ADD UNIQUE KEY uniq_app_users_email (email)` on existing DBs.

**Verifier confirmed.** All evidence quoted in the finding is confirmed by the source code.

1. User.java (@Table(name="app_users"), lines 35-36) is confirmed. The class comment (lines 29-31) explicitly acknowledges the legacy unmapped `users` table. The DDL (01-schema.sql lines 36-52) confirms `users` with `tenant_id CHAR(36) NOT NULL`, `name NOT NULL`, `role NOT NULL`, and `CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)`.

2. The DDL comment "kept because the sessions list query JOINs against it" (line 34) is confirmed. However, JsonToTableMigrationRunner.java (lines 141-144) drops the `sessions` table at every startup if it exists, and a grep of all Java source finds no query that JOINs against `users`. The justification for keeping the table is already invalidated by the migration runner.

3. The DDL contains no CREATE TABLE for `app_users`, `user_meta`, or `user_entities`. application.properties line 9 confirms `spring.jpa.hibernate.ddl-auto=update`, so these tables are created/updated by Hibernate schema tooling, not by explicit DDL.

4. User.java line 42-43 (`@Column(nullable = false, unique = true)` on email) confirms the unique constraint is only declared as a Hibernate schema hint. With `ddl-auto=update`, Hibernate adds columns and tables but does NOT add unique indexes to pre-existing tables. If `app_users` was created by an earlier deploy before the `unique=true` annotation was added, the UNIQUE KEY is absent from the live database, making duplicate-email accounts possible.

5. The `users` table is genuinely dead: no JPA entity maps it (confirmed by searching all model/*.java files), the `sessions` table that supposedly referenced it is dropped at startup, and IdentityBootstrapRunner writes only to `app_users`.

Severity is adjusted from High to Medium. While the dead `users` table and the Hibernate-only unique constraint are real schema integrity issues, neither causes an immediate data corruption or security breach on a fresh install. On an upgrade path, the missing UNIQUE KEY on `app_users.email` is exploitable only if the table predates the annotation change — which is a conditional, deployment-specific risk rather than a guaranteed runtime fault. The dead `users` table with an unsatisfied FK wastes schema clarity but has no runtime consequences since no code writes to it. Medium is the appropriate severity.

---
### [DDL-05] instruments table keeps NOT NULL legacy columns and JSON columns dropped by the migration runner, while the entity adds an unmapped scoring_model the DDL lacks

**Severity:** Medium *(finder rated High)* · **Dimension:** DDL drift *(finder ref `REL-05`)* · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:57-84`, `model/QuestionnaireCatalog.java:22-83`, `config/JsonToTableMigrationRunner.java:91-136`

**Problem.** scoring_model is created only by ddl-auto. On a DB built purely from 01-schema.sql without ddl-auto (e.g. a DBA-provisioned replica), the column is absent and migrateScoringConfigModel silently no-ops, losing the scoring algorithm. Conversely the DDL keeps NOT NULL item_count/vertical/is_published while the entity maps itemCount (Integer) and isPublished (boolean) without nullable=false, so a Java-side null itemCount would violate the DB NOT NULL.

**Impact.** Drift makes the DDL non-reproducible and risks silent loss of scoring_model on non-ddl-auto provisioning; the nullability mismatch on item_count/vertical can 500 on instrument create.

**Evidence.**

> DDL instruments has `vertical VARCHAR(32) NOT NULL`, `item_count INT NOT NULL DEFAULT 0`, `is_published TINYINT NOT NULL DEFAULT 1`, `languages JSON`, `informant_types JSON`, `metadata JSON`, `scoring_config JSON`. The QuestionnaireCatalog entity (@Table=instruments) drops languages->instrument_languages join table, removes informant_types/metadata/scoring_config, and ADDS `scoring_model VARCHAR(32)` which is NOT in the DDL. The migration runner drops languages/informant_types/metadata/scoring_config (lines 122-136) and guards migrateScoringConfigModel on columnExists('instruments','scoring_model').

**Recommendation.** Add `scoring_model VARCHAR(32)` and the `instrument_languages` join table to the instruments DDL; remove the now-dead JSON columns (informant_types, metadata, scoring_config, languages) so the DDL matches the post-migration shape. Mark QuestionnaireCatalog.itemCount/vertical/isPublished with the correct nullability to match the DB.

**Verifier confirmed.** All three evidence locations were verified. The DDL at 01-schema.sql lines 57-84 confirms: `instruments` has `vertical VARCHAR(32) NOT NULL`, `item_count INT NOT NULL DEFAULT 0`, `is_published TINYINT(1) NOT NULL DEFAULT 1`, `languages JSON`, `informant_types JSON`, `metadata JSON`, `scoring_config JSON` — and no `scoring_model` column and no `instrument_languages` join table. QuestionnaireCatalog.java maps `scoring_model` (line 82) and uses an `@ElementCollection` into `instrument_languages` (lines 52-56), both of which are absent from the DDL. JsonToTableMigrationRunner.java line 791-826 confirms that `migrateScoringConfigModel()` guards on `columnExists('instruments','scoring_model')` and silently no-ops if the column is absent — it does not create the column. The column is created only by Hibernate ddl-auto=update (confirmed in application.properties line 9). This means on any DB provisioned purely from 01-schema.sql without running the app (e.g., a DBA-managed replica, CI test DB, or disaster-recovery restore), `scoring_model` will be missing and the scoring algorithm migration silently skips. The `informant_types`/`metadata`/`scoring_config` drop via the runner (lines 122-136) is also not reflected in the DDL. The nullability mismatch is real but partially mitigated: `is_published` is a Java primitive boolean (cannot be null), so it cannot cause a NULL violation. `itemCount` as `Integer` (boxed, nullable) vs `INT NOT NULL DEFAULT 0` is a genuine mismatch but the DB DEFAULT 0 prevents a constraint violation on app-side inserts that omit the column. Severity is reduced from High to Medium because ddl-auto=update is the application default (not just dev-only), meaning standard deployments self-heal. The risk is real but scoped to non-ddl-auto provisioning paths.

---
### [DDL-06] items table keeps legacy NOT NULL columns (stem) and JSON columns; entity normalizes options/sub_domains/languages into ddl-auto child tables with no FK

**Severity:** Medium *(finder rated High)* · **Dimension:** DDL drift *(finder ref `REL-06`)* · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:89-114`, `model/Item.java:21-92`, `config/JsonToTableMigrationRunner.java:125-128`

**Problem.** Entity stem/itemFormat are nullable while the DB columns are NOT NULL (item_format has a default so insert survives, but stem does not) — saving an Item with null stem violates the DB constraint the JPA layer thinks is optional. The new item_options/item_option_scores/item_question_scores/item_languages tables are ddl-auto-created with FK columns (item_id, option_id) but no FOREIGN KEY constraints, so deleting an Item orphans its options and per-option/per-question MQT scores used for scoring.

**Impact.** Item creation 500s when stem is null; orphaned option/score rows silently corrupt MQT scoring after item deletes done outside an entity-managed cascade. DDL cannot recreate the normalized item model.

**Evidence.**

> DDL items: `stem TEXT NOT NULL`, `item_format VARCHAR(32) NOT NULL DEFAULT 'MCQ'`, `instrument_id CHAR(36) NOT NULL` + FK fk_items_instrument, plus `options JSON`, `sub_domains JSON`, `languages JSON`, `norm_group JSON`. The Item entity maps stem/itemFormat as plain nullable Strings, drops options/sub_domains/languages in favor of item_options, item_question_scores, item_languages child tables (no DDL, no FK). Migration runner drops options/sub_domains/languages/norm_group (lines 125-128).

**Recommendation.** Add `@Column(name="stem", nullable=false, columnDefinition="text")` to Item.stem (and itemFormat), and add explicit DDL for item_options/item_option_scores/item_question_scores/item_languages with FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE and FK (option_id) REFERENCES item_options(id) ON DELETE CASCADE.

**Verifier confirmed.** The finding is partially confirmed but overstates two of its three sub-claims.

CONFIRMED: Item.stem is mapped as @Column(columnDefinition = "text") with no nullable=false, while the DDL declares stem TEXT NOT NULL (01-schema.sql line 96). Hibernate will not enforce the constraint at the Java layer and will attempt an INSERT with a null stem, which MySQL will reject with a constraint violation (500). This is a genuine nullable mismatch.

CONFIRMED: The four child tables (item_options, item_option_scores, item_question_scores, item_languages) have no DDL in 01-schema.sql — all 16 CREATE TABLE statements were inspected and none of these appear. They exist only because spring.jpa.hibernate.ddl-auto=update creates them at application startup.

NOT CONFIRMED — "no FOREIGN KEY constraints": Hibernate ddl-auto=update does generate FOREIGN KEY DDL for @ManyToOne(fetch=LAZY) @JoinColumn(name="item_id", nullable=false) relationships. ItemOption.item and ItemQuestionScore.item are both @ManyToOne with @JoinColumn(nullable=false), so Hibernate will emit FK constraints when it creates those tables. The claim that "no FOREIGN KEY constraints" exist is not supported by the code as written.

NOT CONFIRMED — orphan corruption risk: Item.options and Item.questionScores both use CascadeType.ALL and orphanRemoval=true. Deletes through JPA will cascade properly. Corruption would only arise from direct SQL deletes that bypass the entity layer, which is speculative.

CONFIRMED: item_format is also nullable in the entity but has DEFAULT 'MCQ' in the DDL, so inserts survive without a value — a minor drift but not a runtime failure path.

The genuine fault is specifically the stem nullable mismatch (entity omits nullable=false while DB enforces NOT NULL) and the absence of child tables from the canonical DDL file (bootstrap from 01-schema.sql alone leaves the normalized model broken until the app runs). These are real issues but the severity is Medium rather than High because: (1) the FK/cascade integrity concern is mitigated by Hibernate's own DDL generation and orphanRemoval, and (2) null stem is only triggered when calling code passes null explicitly — reasonable validation elsewhere could prevent this.

---
### [DDL-09] ddl-auto-created @ElementCollection/join tables get default VARCHAR(255) FK columns mismatching the CHAR(36)/VARCHAR(64) parent keys — type/charset join mismatch and no FK

**Severity:** Medium · **Dimension:** DDL drift *(finder ref `REL-09`)* · **Confidence:** Medium

**Locations:** `model/Item.java:84-88`, `model/QuestionnaireCatalog.java:52-56`, `model/DemographicField.java:35-39`, `model/Practitioner.java:34-44`, `model/RespondentGroup.java:36-46`, `model/Role.java:28-32`, `model/User.java:60-64`, `model/EntityRegistration.java:67-71`

**Problem.** Hibernate generates @JoinColumn/@CollectionTable FK columns as VARCHAR(255) when no length/columnDefinition is given, even when the referenced PK is CHAR(36) or VARCHAR(64). MySQL requires identical type, length and collation for a FOREIGN KEY; these tables already have no FK (ddl-auto won't add one), and the type/charset mismatch would also block any later attempt to ADD the FK manually. CHAR(36) vs VARCHAR(255) join columns also defeat index efficiency and can mis-compare under different collations.

**Impact.** Cannot retrofit FK constraints without first ALTERing every join column to match the parent type/charset; join performance degraded; latent collation-comparison bugs between CHAR(36) PKs and VARCHAR(255) FKs.

**Evidence.**

> Item.id is `@Column(columnDefinition="char(36)")` and instrument_id char(36), but the @CollectionTable item_languages join column `item_id` has no length/columnDefinition (Hibernate defaults VARCHAR(255)). instrument_languages.instrument_id likewise defaults VARCHAR(255) while instruments.id is CHAR(36). demographic_field_options.field_id defaults VARCHAR(255) while demographic_fields.id is VARCHAR(64).

**Recommendation.** On every @CollectionTable/@JoinColumn that references a CHAR(36) or VARCHAR(64) PK, set the matching type, e.g. `@Column(name="item_id", columnDefinition="char(36)")` / `@JoinColumn(name="instrument_id", columnDefinition="char(36)")`, then add the join-table DDL with proper FK constraints and matching collation.

**Verifier confirmed.** The finding is confirmed by reading the source. `ddl-auto=update` is set in application.properties (line 9). The `@ElementCollection` / `@CollectionTable` join tables (`item_languages`, `instrument_languages`, `demographic_field_options`, `practitioner_roles`, `practitioner_verticals`, `respondent_group_members`, `respondent_group_instruments`, `role_url_paths`) are absent from the static DDL in `01-schema.sql` and will be created by Hibernate at runtime. None of the `@JoinColumn` declarations in the cited entities carry a `columnDefinition`, so Hibernate defaults to VARCHAR(255). The parent PKs differ: `items.id` and `instruments.id` are `CHAR(36)` (confirmed both in the Java `@Column(columnDefinition="char(36)")` annotation and in the DDL); `demographic_fields.id`, `practitioners.id`, `respondent_groups.id`, and `roles.id` are all `VARCHAR(64)` in the DDL. This produces a CHAR(36)-vs-VARCHAR(255) mismatch for the item/instrument join tables and a VARCHAR(64)-vs-VARCHAR(255) length mismatch for the others. For `User` (maps to `app_users`) and `EntityRegistration` (maps to `entity_registrations`) the parent tables are also absent from the DDL and fully Hibernate-managed, so both the parent PK and join FK will be generated as VARCHAR(255) — no mismatch there, partially weakening the claim for those two entities. The practical harm is: (a) no FK constraints exist or can easily be added without altering the join columns first; (b) CHAR(36) vs VARCHAR(255) join columns defeat covering-index efficiency and carry collation-comparison risk under strict MySQL modes. Medium severity is appropriate — there is no immediate runtime failure, but retrofitting integrity constraints is blocked and join performance is suboptimal.

---
### [DDL-10] Unique constraints declared via @UniqueConstraint/@Column(unique=true) are only honored on fresh tables — ddl-auto never adds them to existing tables; INSERT IGNORE migrations rely on them

**Severity:** Medium · **Dimension:** DDL drift *(finder ref `REL-10`)* · **Confidence:** Medium

**Locations:** `model/AssessmentAnswer.java:20-24`, `model/ItemOptionScore.java:18-21`, `model/ItemQuestionScore.java:20-23`, `model/PortalSessionMqtScore.java:18-22`, `model/PortalSessionDemographic.java:20-24`, `model/PublishedQuestionnaireQuestionOptionScore.java:18-21`, `model/User.java:42`, `config/JsonToTableMigrationRunner.java:394-401`

**Problem.** Hibernate ddl-auto=update only creates a unique index when it first creates the table; if any of these tables already exists from a prior deploy (created before the @UniqueConstraint was added, or by an earlier app version), update will NOT add the missing unique index. The migration runner's INSERT IGNORE depends on the unique index to skip duplicates — without it, duplicate (session_id,mqt_id)/(option_id,mqt_id) rows are inserted silently.

**Impact.** Duplicate per-MQT score rows and duplicate answers accumulate, double-counting scores (wrong psychometric results) and breaking the idempotency assumption of the migration. Duplicate user emails become possible if app_users predates the unique mapping (see REL-03).

**Evidence.**

> AssessmentAnswer: @UniqueConstraint(uniq_answer_session_question on session_id,question_id). ItemOptionScore: uniq_option_mqt(option_id,mqt_id). PortalSessionMqtScore: uniq_session_mqt(session_id,mqt_id). User.email: @Column(unique=true). None of these tables exist in 01-schema.sql, and the migration runner inserts with `INSERT IGNORE INTO portal_session_mqt_scores ...` / `INSERT IGNORE INTO item_option_scores ...` (relying on the unique index to dedupe).

**Recommendation.** Add the unique indexes explicitly in the canonical DDL for every one of these tables (e.g. `UNIQUE KEY uniq_session_mqt (session_id, mqt_id)`), and run a one-off `ALTER TABLE ... ADD UNIQUE KEY ...` against existing DBs after de-duping. Do not rely on ddl-auto to create uniques retroactively.

**Verifier confirmed.** All evidence cited in the finding is confirmed by direct code inspection. The six entity classes (AssessmentAnswer, ItemOptionScore, ItemQuestionScore, PortalSessionMqtScore, PortalSessionDemographic, PublishedQuestionnaireQuestionOptionScore) and User all declare @UniqueConstraint / @Column(unique=true) exactly as described. None of the corresponding tables (assessment_answers, item_option_scores, item_question_scores, portal_session_mqt_scores, portal_session_demographics, published_questionnaire_question_option_scores, app_users) appear anywhere in /docker/mysql-init/01-schema.sql. The setting spring.jpa.hibernate.ddl-auto=update is confirmed in application.properties with no override in either profile file. The migration runner at JsonToTableMigrationRunner.java uses INSERT IGNORE INTO portal_session_mqt_scores, assessment_answers, portal_session_demographics, item_option_scores, item_question_scores, and published_questionnaire_question_option_scores — all of which rely on the unique indexes to suppress duplicate rows. Hibernate ddl-auto=update creates unique indexes only when it first creates the table; it does not retroactively add a missing unique index to a pre-existing table. Any database that had these tables created before the @UniqueConstraint annotations were introduced will be missing the unique indexes, making INSERT IGNORE silently insert duplicates instead of suppressing them, which corrupts per-MQT score aggregations and breaks migration idempotency. The Medium severity is appropriate: the failure is conditional on table pre-existence from an older deploy, but the impact when it occurs (duplicate rows corrupting psychometric scoring) is concrete.

---
### [DDL-11] PortalSession adds assessment_id/entity_id/entity_name columns absent from DDL; assessment_id is a logical FK to a ddl-auto-only assessments table with no constraint

**Severity:** Medium · **Dimension:** DDL drift *(finder ref `REL-11`)* · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:261-288`, `model/PortalSession.java:26-27`, `model/PortalSession.java:77-81`, `model/Assessment.java:10-15`

**Problem.** assessment_id/entity_id/entity_name exist only via ddl-auto. assessment_id is described as the FK linking sessions to assessments and drives the All-Assessments rollup and per-(entity,assessment) cap enforcement, yet there is no FOREIGN KEY to assessments(id) (which itself has no DDL). entity_id drives cap enforcement against entity_registrations with no FK.

**Impact.** Sessions can reference deleted/non-existent assessments or entities; cap-enforcement and rollup logic operate on unconstrained string pointers, so an orphaned assessment_id silently produces phantom assessment rows in the dashboard or miscounts caps. DDL omits columns the app depends on.

**Evidence.**

> DDL portal_sessions has group_id/group_name/consent_id but NO assessment_id, entity_id, or entity_name. The entity declares `@Column(name="assessment_id", length=64) assessmentId`, `@Column(name="entity_id") entityId`, `@Column(name="entity_name") entityName`. Assessment.java comment: 'Sessions hang off this row via the portal_sessions.assessment_id FK' — but assessments has no DDL table and no FK.

**Recommendation.** Add assessment_id (VARCHAR(64)), entity_id, entity_name to the portal_sessions DDL with indexes, and `ALTER TABLE portal_sessions ADD CONSTRAINT fk_ps_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id)` and `... fk_ps_entity FOREIGN KEY (entity_id) REFERENCES entity_registrations(id)` once those tables are added to the DDL.

**Verifier confirmed.** All evidence cited in the finding is confirmed by reading the source. The `portal_sessions` DDL (lines 261-288 of 01-schema.sql) does not contain `assessment_id`, `entity_id`, or `entity_name` columns. `PortalSession.java` declares all three via `@Column`. The `assessments` table has no DDL definition at all — only `Assessment.java` mapped via `@Table(name="assessments")`. `entity_registrations` and `assessment_entity_allotments` tables are similarly absent from the DDL. `application.properties` confirms `spring.jpa.hibernate.ddl-auto=update`, which means Hibernate silently creates/alters these tables at runtime. Fresh deployments via the Docker init script (`01-schema.sql`) will be missing all of these tables/columns, making the application non-functional on a clean database until Hibernate runs. No FK constraints are declared anywhere — neither in DDL nor via JPA `@JoinColumn`/`@ManyToOne` annotations. The cap-enforcement and dashboard rollup logic described in `AssessmentEntityAllotment.java` and the `PortalSession` comments operates on unconstrained string references. The finding's evidence, problem description, and impact are all accurate. Severity Medium is correct: this is a deployment-correctness and data-integrity gap rather than an active runtime security breach.

---
### [DDL-12] EntityRegistration membership (entity_members) and User.user_entities reference plain respondent/entity ids with no FK; identity bootstrap relies on id-equality only

**Severity:** Medium · **Dimension:** DDL drift *(finder ref `REL-12`)* · **Confidence:** Medium

**Locations:** `model/EntityRegistration.java:67-71`, `model/User.java:60-64`, `config/IdentityBootstrapRunner.java:79-119`

**Problem.** entity_members.respondent_id and user_entities.entity_id/user_id are unconstrained strings created by ddl-auto. There is no FK from entity_members.respondent_id to respondents/app_users(id), nor from user_entities to app_users/entity_registrations. The bootstrap preserves respondent id as user id specifically so these references 'stay valid' — but nothing enforces it at the DB.

**Impact.** Membership rows can point at deleted respondents/entities; a respondent deleted before migration leaves dangling memberships that silently fabricate entity membership for a non-existent user, affecting allotment fan-out and cap counting.

**Evidence.**

> EntityRegistration.memberIds -> @CollectionTable entity_members(entity_id, respondent_id) holds respondent ids as plain strings (length 64). User.entityIds -> @CollectionTable user_entities(user_id, entity_id). IdentityBootstrapRunner reconstructs user_entities from entity_members (lines 81-87) by string id. Neither entity_members nor user_entities exists in the DDL.

**Recommendation.** Add DDL for entity_members and user_entities with FK constraints: `FOREIGN KEY (entity_id) REFERENCES entity_registrations(id) ON DELETE CASCADE`, `FOREIGN KEY (respondent_id) REFERENCES app_users(id)`, `FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE`. Match the id column types/charset to the parent PKs.

**Verifier confirmed.** All evidence cited in the finding is confirmed by the source code. EntityRegistration.java lines 67-71 declare @ElementCollection on `entity_members(entity_id, respondent_id)` storing respondent IDs as plain VARCHAR(64) strings. User.java lines 60-64 declare @ElementCollection on `user_entities(user_id, entity_id)` storing entity IDs as plain VARCHAR(64) strings. IdentityBootstrapRunner.java lines 79-119 reconstruct user_entities from entity_members purely by string-equality of IDs. The DDL at 01-schema.sql contains no CREATE TABLE for either `entity_members` or `user_entities` — both tables are created exclusively by Hibernate's `ddl-auto=update` at startup, which will produce them with no foreign key constraints. The parent tables `entity_registrations`, `respondents`, and `app_users` do appear in the DDL (either directly or via Hibernate). There is therefore no DB-level enforcement preventing entity_members.respondent_id from pointing at a deleted respondent row, nor user_entities.entity_id from pointing at a deleted entity_registration row. The bootstrap's intent to preserve respondent ids as user ids is documented but not enforced by the DB schema. Dangling membership rows after respondent or entity deletion would silently affect allotment fan-out and cap counting as described. Medium severity is appropriate — the impact is bounded to the entity-membership and allotment subsystems and requires an actual delete event to manifest, but the absence of FK constraints is a genuine structural gap.

---
### [PK-03] entity_registrations.email has no unique constraint (entity- and DDL-level), unlike respondents/practitioners

**Severity:** Medium *(finder rated High)* · **Dimension:** Keys / Index · **Confidence:** High

**Locations:** `model/EntityRegistration.java:34-36 (@Column(name="official_email") String email; no unique)`, `repository/EntityRegistrationRepository.java:18 (Optional<EntityRegistration> findByEmail(String email))`, `config/IdentityBootstrapRunner.java:82-86 (iterates entities by email to build membership)`

**Problem.** findByEmail returns Optional (assumes at most one row per email) but nothing enforces that at the DB. Two self-registrations with the same official_email produce two rows; findByEmail then throws NonUniqueResultException (Spring Data IncorrectResultSizeDataAccessException) at runtime, and the entity-dedup logic in registration breaks.

**Impact.** Duplicate entity registrations silently accumulate; the first lookup that hits two rows for an email crashes the registration/promotion endpoint with a 500. The IdentityBootstrapRunner membership reconstruction can also double-link respondents.

**Evidence.**

> @Column(name = "official_email") private String email;  // EntityRegistration — no unique=true, no @Table uniqueConstraints. entity_registrations is NOT in 01-schema.sql, so it is wholly created by Hibernate ddl-auto from this mapping => column official_email is non-unique. Yet the repo exposes Optional<EntityRegistration> findByEmail(String email).

**Recommendation.** Add @Table(name="entity_registrations", uniqueConstraints=@UniqueConstraint(name="uniq_entity_reg_email", columnNames="official_email")) (decide whether nullable emails should be allowed — if so, dedup only non-null). Because ddl-auto=update never adds a unique to an existing table, also ship: ALTER TABLE entity_registrations ADD CONSTRAINT uniq_entity_reg_email UNIQUE (official_email); after de-duplicating existing rows.

**Verifier confirmed.** The core evidence is confirmed: EntityRegistration.java has @Column(name="official_email") with no unique=true and no @Table uniqueConstraints; entity_registrations is absent from 01-schema.sql (confirmed by reading the full DDL), so the table is created solely by Hibernate ddl-auto=update from the non-unique mapping; and EntityRegistrationRepository.findByEmail returns Optional. The findByEmail method IS called in EntityRegistrationsService.create() (line 54) as an application-level dedup check before saving, but this check has no DB-level enforcement. Two concurrent registration requests can both pass the check and both insert, after which any subsequent findByEmail call on a table containing two rows for the same email will throw Spring Data's IncorrectResultSizeDataAccessException (IncorrectResultSizeDataAccessException wraps NonUniqueResultException). The finding's claim about IdentityBootstrapRunner is partly wrong: lines 82-86 use entities.findAll() and iterate memberIds — there is no findByEmail call on EntityRegistrationRepository in that runner, so that specific impact is not real. The overall vulnerability is genuine but requires concurrent submissions to trigger the duplicate; for a B2B self-registration form this is a realistic but not high-frequency scenario. Severity is adjusted down to Medium from High because: (a) the runner impact cited is not real, (b) the form requires name+companyName+email+phone+dob all non-empty (lowering bot/accidental duplicate risk), and (c) the crash only occurs after duplicates already exist, not on every submission. The fix recommended (adding a unique constraint and migrating existing rows) is correct.

---
### [PK-04] app_users.email uniqueness depends solely on the entity annotation; user_entities collection table has no FK and email collation makes findByEmailIgnoreCase semantically redundant/fragile

**Severity:** Medium · **Dimension:** Keys / Index · **Confidence:** Medium

**Locations:** `model/User.java:42-43 (@Column(nullable=false, unique=true) String email)`, `model/User.java:60-64 (@ElementCollection user_entities, no FK back to app_users)`, `repository/UserRepository.java:16 (findByEmailIgnoreCase)`, `config/IdentityBootstrapRunner.java:94-100 (unique-email guard in app code)`

**Problem.** Two coupled issues: (1) The unique=true on email is only honored if the table was actually created by this mapping with the constraint — fine on a fresh DB, but ddl-auto=update will not ADD the unique if an app_users table already exists from an earlier build without it, so the guard in IdentityBootstrapRunner is the only protection on upgraded DBs. (2) user_entities.user_id has no FK to app_users(id), so orphaned membership rows survive user deletion.

**Impact.** On an upgraded environment, duplicate app_users emails can slip in (the app-level guard is racy across concurrent requests), breaking login (findByEmailIgnoreCase becomes non-unique). Orphan user_entities rows accumulate and can mis-grant entity scope.

**Evidence.**

> @Column(nullable = false, unique = true) private String email;  // app_users is NOT in 01-schema.sql -> created by Hibernate. @ElementCollection ... @CollectionTable(name="user_entities", joinColumns=@JoinColumn(name="user_id")) — ddl-auto creates user_entities but adds NO foreign key from user_entities.user_id to app_users.id (Hibernate omits FKs under MySQL update in many setups and never backfills them).

**Recommendation.** Verify the constraint exists on every environment and ship explicit DDL: ALTER TABLE app_users ADD CONSTRAINT uniq_app_users_email UNIQUE (email); CREATE INDEX idx_user_entities_user ON user_entities(user_id); ALTER TABLE user_entities ADD CONSTRAINT fk_user_entities_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE; Keep the entity @Table uniqueConstraints declared for fresh DBs.

**Verifier confirmed.** Both sub-claims in the finding are confirmed by the source code.

Issue 1 — email uniqueness gap on upgraded DBs: User.java:42-43 has @Column(nullable=false, unique=true) on email, and 01-schema.sql contains no CREATE TABLE app_users at all. The table is entirely Hibernate-managed via spring.jpa.hibernate.ddl-auto=update (application.properties:9). Under ddl-auto=update, Hibernate adds new columns and tables but does NOT retrofit a UNIQUE constraint onto an already-existing app_users table that was created without it. The app-level duplicate-email guards in IdentityBootstrapRunner.java:93-100 and PublicRegistrationService.upsertUser() both follow a check-then-insert pattern (findByEmailIgnoreCase → save) inside a @Transactional method but without any SELECT FOR UPDATE or table-level lock, so concurrent requests can race past the check and insert duplicate email rows if the DB constraint is missing.

Issue 2 — user_entities.user_id has no FK to app_users(id): The @ElementCollection / @CollectionTable at User.java:60-64 creates the user_entities table under Hibernate management. No entry for user_entities exists anywhere in 01-schema.sql, and Hibernate's MySQL update mode routinely omits FK constraints for collection tables. No other SQL file in the project defines this FK. Orphaned rows in user_entities will survive user deletion.

The finding's evidence quotes match the actual source exactly. The characterization of findByEmailIgnoreCase as "semantically redundant" is accurate but minor: the DB uses utf8mb4_unicode_ci (already case-insensitive), so LOWER() in the JPQL adds nothing, though this is a correctness non-issue. The core structural problems (missing DB-level UNIQUE and missing FK) are genuine. Medium severity is appropriate — these are latent integrity risks rather than immediate exploits, and on a fresh Docker deployment the constraints do exist.

---
### [PK-06] Surrogate PKs (assessment, questionnaire, entity-registration) are built from an 8-hex-char truncated UUID — ~32 bits of entropy, collision-prone for a PRIMARY KEY

**Severity:** Medium · **Dimension:** Keys / Index · **Confidence:** Medium

**Locations:** `service/AssessmentService.java:83-85 ("AS-" + UUID.randomUUID().toString().substring(0,8))`, `service/EntityRegistrationsService.java:58 ("ER-" + UUID...substring(0,8))`, `service/QuestionnaireVersioningService.java:87 ("Q-" + UUID...substring(0,8)), :310 ("V-" + ...substring(0,8))`

**Problem.** Truncating a UUID to 8 hex chars yields only 2^32 possible values. By the birthday bound a collision becomes likely (~50%) at ~77k ids, and the code does not retry on duplicate-key — it does a single save(). For a PRIMARY KEY this is an avoidable collision risk, especially for assessments which are created frequently.

**Impact.** A PK collision causes the save() to throw DataIntegrityViolationException, failing assessment/version creation; if any path used merge/upsert-by-id semantics it could instead silently overwrite an unrelated existing row (e.g. AssessmentsService/RespondentsService upsert via findById(dto.getId()).orElseGet(...)).

**Evidence.**

> a.setId(... : "AS-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase());  // 8 hex chars = 32 bits. Same pattern for ER-, Q-, V- ids. These strings are the PRIMARY KEY of assessments / entity_registrations / questionnaires / published_questionnaires.

**Recommendation.** Use the full UUID (or a longer random suffix) for these PKs: a.setId("AS-" + UUID.randomUUID()); or generate a collision-checked id. If a short human-friendly id is required, generate-and-retry on duplicate key, or use a dedicated sequence/IDENTITY surrogate and keep the short code as a separate non-PK unique column.

**Verifier confirmed.** All four evidence quotes are confirmed exactly as cited in the source code. AssessmentService.java:85 uses "AS-" + UUID.randomUUID().toString().substring(0,8).toUpperCase(), EntityRegistrationsService.java:58 uses "ER-" + UUID...substring(0,8).toUpperCase(), QuestionnaireVersioningService.java:87 uses "Q-" + UUID...substring(0,8).toUpperCase(), and line 310 uses "V-" + UUID...substring(0,8).toUpperCase(). These are the actual PKs of the assessments, entity_registrations, questionnaires, and published_questionnaires tables (confirmed via the entity @Id annotations and the DDL/Hibernate ddl-auto=update configuration). There is no retry loop, no collision-check before save(), and no existsById() call guarding any of these insertions. The math is accurate: 8 hex chars from the UUID string's first block yields exactly 32 bits of entropy (2^32 = ~4.3 billion values); by the birthday bound, a 50% collision probability is reached around 54,000 IDs (the finding states ~77k, a minor overstatement). The impact described is correct: a collision causes a DataIntegrityViolationException on save() with no recovery path. The severity rating of Medium is appropriate — the collision risk is real but requires accumulation of tens of thousands of records before becoming statistically likely on a B2B psychometric platform, so it is not an immediate production-breaking issue but is a genuine design defect that should be fixed before the dataset grows.

---
### [SEC-03] AssessmentToken (portal registration token) is stored in plaintext as the primary key

**Severity:** Medium *(finder rated High)* · **Dimension:** Security · **Confidence:** High

**Locations:** `model/AssessmentToken.java:30-34`, `service/AssessmentTokenService.java:157-180`, `service/PublicRegistrationService.java:67-68`

**Problem.** The token is a bearer secret (it grants anonymous access to register into an assessment/entity/group, and the register flow immediately mints a respondent JWT). Storing the secret itself as the PK means the database holds the live secret in cleartext, exactly like storing plaintext passwords. The token is also echoed back in DTOs and embedded in QR PNGs persisted in the same table.

**Impact.** A read of the assessment_tokens table (DB dump, backup leak, SQL injection, or an over-broad admin/list endpoint) yields working, unexpired registration tokens that an attacker can replay to self-register into a tenant's entity, consume allotment caps, and obtain a respondent session token — no authentication required (the /public/tokens/** path is permitAll).

**Evidence.**

> AssessmentToken.java: `@Id @Column(length = 64) private String token;` with comment `The opaque token string — also the PK.` Lookups are `tokens.findById(token)` against the raw value. AssessmentTokenService.toDto() returns the raw `token` to clients.

**Recommendation.** Store only a hash of the token: keep a separate generated PK, add `token_hash CHAR(64)` (SHA-256, unique-indexed), index lookups on the hash, and never persist or return the raw token after issuance. JPA: replace the @Id token with a surrogate id and `@Column(name="token_hash", unique=true) private String tokenHash;`; service hashes the incoming token before `findByTokenHash(...)`.

**Verifier confirmed.** The evidence quoted in the finding is accurate and confirmed by direct code inspection.

AssessmentToken.java lines 30-34 contain exactly the quoted `@Id @Column(length = 64) private String token;` with the comment "The opaque token string — also the PK." The token is 32 random bytes encoded as URL-safe Base64 (43 characters), stored as the primary key.

AssessmentTokenService.toDto() (lines 211-224) does return the raw token value in the DTO via `d.setToken(t.getToken())`. The `resolve()` method (lines 156-180) returns the full DTO including the raw token to unauthenticated callers via the public endpoint.

SecurityConfig.java confirms `/api/v1/public/tokens/**` is `permitAll()` — anyone can call the resolve, consume, QR, and register endpoints anonymously.

However, the finding's severity assessment warrants adjustment. The token is 32 random bytes (256 bits of entropy) from `SecureRandom`, which is cryptographically strong — it cannot be guessed or brute-forced. The actual threat requires either: (1) a DB dump/backup leak, (2) SQL injection, or (3) an over-broad admin list endpoint.

For threat vector (3): the `listForAssessment` endpoint (`GET /api/v1/assessment-tokens/by-assessment/{assessmentId}`) IS protected by authentication (not in the `permitAll` list), so it is not publicly accessible. The `issue` (POST) and `revoke` (DELETE) endpoints are similarly auth-gated.

The genuine residual risk is: if an attacker gains read access to the database (via SQL injection, backup leak, or compromised DB credentials), the live tokens are directly usable without any additional cracking step. For cleartext passwords this is the canonical high-severity issue, but for a 256-bit random opaque token, hashing provides defense-in-depth rather than closing an independently exploitable vulnerability — the database compromise itself is the primary threat.

The DDL (01-schema.sql) does not include an `assessment_tokens` table, confirming Hibernate's `ddl-auto=update` creates it at runtime from the entity definition, so no DDL-level remediation exists.

The QR code embeds the registration URL containing the raw token in a LONGBLOB in the same row — confirmed in `qrPng()` (lines 124-138) — which slightly increases the attack surface but does not change the fundamental nature of the issue.

The core claim is technically correct: the cleartext token stored as PK means any DB read yields directly usable bearer secrets. The severity is downgraded from High to Medium because the tokens are cryptographically strong (not guessable), the admin list endpoints require authentication, and exploitation requires an independent database access vulnerability as a prerequisite.

---
### [SEC-10] Security-critical tables (app_users, assessment_tokens, audit_log, etc.) absent from canonical DDL; ddl-auto=update never adds their unique/FK constraints

**Severity:** Medium · **Dimension:** Security · **Confidence:** High

**Locations:** `docker/mysql-init/01-schema.sql:1-381`, `model/User.java:42-43`, `model/AssessmentToken.java:30-34`, `model/EntityRegistration.java:67-71`

**Problem.** ddl-auto=update only ADDs missing columns/tables; it does not add UNIQUE indexes, FK constraints, or NOT NULLs to tables that already exist, and the security-relevant tables are not pinned in the reviewed DDL. So the email-uniqueness the identity/migration logic relies on, and referential integrity for membership/credential tables, are not guaranteed at the DB level.

**Impact.** On an upgraded DB, the app_users.email UNIQUE constraint may be missing, allowing duplicate-email identities that break the login-by-email contract and the migration's unique-email guard (IdentityBootstrapRunner relies on it), enabling account confusion/takeover. Orphaned membership rows (user_entities/entity_members) can grant or leak entity scope. The absence from canonical DDL also means these tables ship without the constraints a DBA would normally enforce.

**Evidence.**

> 01-schema.sql (the stated source of truth, 381 lines) contains NO definition for app_users, user_meta, assessment_tokens, audit_log, entity_registrations, entity_members, user_entities, assessments/allotments, or portal_session_* — these are created solely by Hibernate. User.email is `@Column(unique=true)` but Hibernate-on-update will not retro-add a UNIQUE index to a pre-existing app_users table; no entity declares FKs between user_entities/entity_members and their parents.

**Recommendation.** Add explicit, constraint-bearing DDL for app_users (with `email VARCHAR(255) NOT NULL UNIQUE`), user_meta, assessment_tokens (token_hash UNIQUE), audit_log, entity_registrations, entity_members/user_entities (with FKs) to 01-schema.sql, and run a one-time migration to add the missing UNIQUE/FK constraints on existing databases rather than relying on ddl-auto=update.

**Verifier confirmed.** All factual claims in the finding are confirmed by direct code inspection. The 01-schema.sql (381 lines) contains no DDL for app_users, user_meta, assessment_tokens, audit_log, entity_registrations, entity_members, user_entities, assessments, or any allotment table — these are entirely Hibernate-managed. spring.jpa.hibernate.ddl-auto=update is confirmed in application.properties. User.java line 42 has @Column(nullable = false, unique = true) on email, and this constraint is not reflected in any DDL script. entity_members and user_entities are @ElementCollection join tables with no explicit FK declarations beyond the owning-side @JoinColumn that Hibernate generates back to the owning entity. The IdentityBootstrapRunner performs an application-level uniqueness guard (findByEmailIgnoreCase before insert) that provides partial mitigation, but relies on the DB-level UNIQUE index existing in the first place to be race-condition-safe. On a completely fresh Docker deployment Hibernate does create all tables including the UNIQUE constraint, so the risk is narrower than claimed — it is specific to in-place database upgrades where app_users already exists from a prior Hibernate run but a constraint was never added (Hibernate update never retro-adds UNIQUE indexes). The finding's high-confidence label is slightly overstated because it presents a narrow upgrade-path risk as a universal guarantee failure. Severity Medium (as originally rated) is appropriate: the gap is real and could allow duplicate-email identities on upgraded deployments, breaking the login-by-email contract and the migration's unique-email guard, but the blast radius is limited to non-fresh-install upgrade scenarios.

---
### [SEC-11] JWT accepted from query parameter, exposing god-mode tokens in logs/history/referrers

**Severity:** Medium · **Dimension:** Security · **Confidence:** Medium

**Locations:** `security/TokenAuthenticationFilter.java:44-52`

**Problem.** The signed session JWT (which can carry ADMIN/SUPER_ADMIN authority) is accepted as a URL query parameter, not just the Authorization header. Query strings are routinely written to web-server access logs, proxy logs, browser history, and leaked via the Referer header to third parties.

**Impact.** A privileged JWT placed in a URL (the code even mints respondent tokens to redirect into /portal/take) can leak into logs and referrers; an attacker who reads such a log replays the bearer token until expiry (default 7 days) to impersonate the user. Combined with the hardcoded secret (SEC-04) and 7-day expiry, leakage is high-impact.

**Evidence.**

> TokenAuthenticationFilter.getJwtFromRequest(): `String tokenParam = request.getParameter("token"); return StringUtils.hasText(tokenParam) ? tokenParam : null;` — falls back to `?token=...` for the auth JWT.

**Recommendation.** Remove the `?token=` fallback and accept the session JWT only via the `Authorization: Bearer` header. If a query-param entry point is unavoidable for QR/email links, use a single-use, short-TTL exchange token that is swapped for a header-only session token, and never log full URLs.

**Verifier confirmed.** The evidence quote is accurate: TokenAuthenticationFilter.java lines 44-52 implement exactly the described fallback — if no `Authorization: Bearer` header is present, `request.getParameter("token")` is accepted as the JWT. The fallback is actively used: PublicRegistrationService.register() mints a RESPONDENT-scoped JWT and returns it in the JSON response body; the SPA comment at line 170-171 confirms it is intended for the registrant to be redirected directly into /portal/take with this token, which the SPA places in a URL. The 7-day default expiry (604800000ms in application.properties) and the hardcoded default secret compound the risk. The primary automated code path only mints RESPONDENT-type tokens for this query-param usage, not ADMIN/SUPER_ADMIN tokens, so the "god-mode" framing in the title is slightly overstated — but the filter accepts any valid JWT (including ADMIN-signed ones) via the query param, so a privileged actor who constructs such a URL would expose a high-privilege token. The leakage vector (web-server access logs, proxy logs, browser history, Referer headers) is standard and well-established for query-string tokens. Severity Medium is correct: the automated flow targets RESPONDENT users only, the risk is real but not directly exploitable without token interception from logs or history.

---
### [VER-07] Versioning backfill misclassifies pre-existing DRAFT snapshots as COMMITTED v1.0 and pins assessments to them

**Severity:** Medium · **Dimension:** Versioning · **Confidence:** Medium

**Locations:** `QuestionnaireVersioningMigrationRunner.java:73-98`, `QuestionnaireVersioningMigrationRunner.java:110-129`

**Problem.** The migration assumes all legacy rows were finished/published content. Any legacy published_questionnaires row that was actually a work-in-progress (or a duplicate left over from the name-dedup behavior) is force-committed as an immutable v1.0. The detection key is solely 'parent_id IS NULL', so a re-run after a partial first pass that set parent_id on some rows but crashed will skip the half-done rows but the already-created orphan parents remain — there is no reconciliation.

**Impact.** Drafts/garbage rows become permanently immutable 'committed' versions that can never be discarded (discardDraft refuses COMMITTED) and may be pinned by retargeted assessments. Combined with the name-dedup delete (VER-01), the set of 'committed v1.0' rows that survive is order-dependent and partly arbitrary, corrupting which snapshot an assessment ends up pinned to.

**Evidence.**

> backfillParents marks EVERY parent-less PublishedQuestionnaire as `v.setVersionStatus("COMMITTED"); v.setVersionMajor(1); v.setVersionMinor(0)` unconditionally. backfillAssessmentVersionIds then sets `a.setQuestionnaireVersionId(oldRef)` for any assessment whose old questionnaire_id matches a now-known version.

**Recommendation.** Gate the backfill on real publish state (e.g. only rows referenced by an existing assessment, or with non-empty question snapshot), record a completion ledger, and make the assessment retarget verify the resolved version is COMMITTED and belongs to the resolved parent before pinning. Run inside a proper migration tool, not on every boot.

**Verifier confirmed.** The evidence cited in the finding is accurate and confirmed by reading the source. In QuestionnaireVersioningMigrationRunner.java lines 73-98, `backfillParents()` iterates every `PublishedQuestionnaire` where `parentId` is null and unconditionally sets `versionStatus = "COMMITTED"`, `versionMajor = 1`, `versionMinor = 0`. There is no gate on whether the row was actually published/complete (e.g., checking that it has questions, or that it was referenced by an assessment). Lines 110-129 confirm `backfillAssessmentVersionIds()` uses only the presence of a parentId mapping as the criterion for retargeting. The `discardDraft()` method in `QuestionnaireVersioningService.java` (lines 294-303) confirms that COMMITTED rows can never be deleted — throwing a `BadRequestException` for any non-DRAFT version. The migration runs on every boot (`CommandLineRunner`), and idempotency is achieved only by the `parentId != null` skip-guard — so any row that survived a previous partial pass and already has a parentId will not be re-processed, but any orphan Questionnaire rows created in the partial pass remain permanently. The VER-01 (name-dedup delete) claim cannot be verified — no such dedup logic exists in the codebase — so the compounding scenario is speculative. The core problem (force-committing all parent-less rows without any publish-state gate, and making them undeletable as COMMITTED) is real. The severity is correctly assessed as Medium: it corrupts migration outcomes for genuinely unpublished/garbage legacy rows and makes them permanently immutable, but the blast radius is limited to pre-versioning legacy data rows and would only manifest on deployments with such legacy data present.

---
### [CON-08] DatasetService 'optimistic concurrency' compares a client-echoed updated_at string instead of a real version — and is bypassable / racy

**Severity:** Medium · **Dimension:** Concurrency · **Confidence:** Medium

**Locations:** `service/DatasetService.java:113-176`, `service/DatasetService.java:143-154,166-172`

**Problem.** Concurrency control hangs on a client-supplied timestamp string matching the row's current updated_at, with the comparison done in-memory after a non-locking read. (1) If the client omits rowUpdatedAt the check is skipped (silent last-write-wins). (2) MySQL TIMESTAMP has 1-second resolution by default, so two edits within the same second produce identical stamps and the conflict is missed. (3) Between the findById read and the flush there is no lock, so two batches can both pass the check and the second overwrites the first.

**Impact.** The feature labelled as conflict-detection gives false assurance: concurrent cell edits to the same session row are lost or interleave without raising the advertised 'Row changed since it was loaded' error. Audit log then records misleading before/after pairs.

**Evidence.**

> `String loadedStamp = iso(s.getUpdatedAt());` then `if (e.getRowUpdatedAt() != null && loadedStamp != null && !loadedStamp.equals(e.getRowUpdatedAt())) { ...conflict... }`. The guard is skipped entirely when `e.getRowUpdatedAt()` is null. updated_at is DB-maintained `ON UPDATE CURRENT_TIMESTAMP`.

**Recommendation.** Back this with a true @Version on PortalSession and let Hibernate raise OptimisticLockException on flush (translate to the per-cell conflict response). If keeping a timestamp, store sub-second precision (TIMESTAMP(6)) and make rowUpdatedAt mandatory; still combine with @Version to close the read-to-flush gap.

**Verifier confirmed.** All three sub-claims in the finding are confirmed by the source code and DDL.

1. Evidence quote is accurate: DatasetService.java lines 143-154 exactly match the quoted code. `loadedStamp = iso(s.getUpdatedAt())` is computed once from the non-locking `findById` result, then each `CellEditDto` is checked only if `e.getRowUpdatedAt() != null`. If the client sends a null `rowUpdatedAt` (no `@NotNull` annotation exists on `CellEditDto.rowUpdatedAt`), the entire concurrency guard is skipped silently and `applyCell` proceeds.

2. TIMESTAMP 1-second resolution confirmed: The DDL at /home/morningstar/Projects/bodh/bodhassess-api-spring/docker/mysql-init/01-schema.sql line 283 declares `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` — plain `TIMESTAMP` with no fractional-second precision argument, giving MySQL's default 1-second granularity. Two edits within the same second produce identical ISO strings and the conflict is missed.

3. No locking or `@Version`: `PortalSession.java` has no `@Version` annotation, and `DatasetService.java` has no `LockModeType`, `SELECT ... FOR UPDATE`, or pessimistic lock call. The `findById` at line 132 is a plain optimistic (non-locking) read inside an `@Transactional` method. Between that read and the eventual `em.flush()` at line 169, another transaction can commit a change to the same row; both will read the same stamp, both will pass the in-memory check, and the second flush will silently overwrite the first.

The feature is labelled "optimistic concurrency" in its own Javadoc comment (line 108-111) but does not satisfy the guarantees that term implies. The audit log at line 157-159 then records misleading before/after pairs because `before` is captured from the in-memory state that may already have been overwritten. Severity Medium is correct — the attack surface requires concurrent admin users editing the same session row, which limits real-world frequency, but the flaw is structural.

---
### [CON-10] Allotment add is check-then-insert (existsById then save) — relies on a composite PK that ddl-auto may not have created

**Severity:** Medium · **Dimension:** Concurrency · **Confidence:** Medium

**Locations:** `service/AssessmentAllotmentsService.java:119-130,142-153,67-82`, `model/AssessmentEntityAllotment.java:18-29`, `docker/mysql-init/01-schema.sql (no allotment tables)`

**Problem.** Adding an allotment checks existence then inserts without a lock, so two concurrent adds of the same (assessment,group) both see 'not present' and both attempt the insert. The only thing that turns the second insert into a clean failure (rather than a duplicate row) is the composite PRIMARY KEY. That PK exists only if Hibernate created the table from scratch; ddl-auto=update never adds/changes a primary key on a pre-existing table, so any environment where these tables were created under an earlier mapping can be missing the composite PK and would accept duplicate allotment rows. addEntity is worse: find-or-create with no lock means concurrent cap edits race to last-write-wins.

**Impact.** Best case the second concurrent add throws a DataIntegrityViolation (uncaught -> 500) instead of being idempotent as intended; worst case (PK not present from a prior schema) duplicate allotment rows are created, double-counting entities/groups and breaking cap math and counts.

**Evidence.**

> addGroup: `if (groupAllotments.existsById(pk)) return ...; ... groupAllotments.save(row);`. addRespondent mirrors it. The assessment_*_allotments tables are absent from the canonical 01-schema.sql and are created only by Hibernate ddl-auto=update from the @IdClass mapping.

**Recommendation.** Use INSERT-IGNORE / upsert semantics or catch DataIntegrityViolationException and treat as idempotent success, instead of existsById-then-save. Verify the live DB actually has the composite PRIMARY KEY on each allotment table (ship explicit DDL: `ALTER TABLE assessment_group_allotments ADD PRIMARY KEY (assessment_id, group_id)` etc.) since ddl-auto=update will not have added it retroactively.

**Verifier confirmed.** All three claims in the finding are verified by the source. The check-then-insert pattern is confirmed in addGroup (lines 119-130: existsById -> save) and addRespondent (lines 142-153: existsById -> save) with no locking mechanism between the two calls. The addEntity method uses a slightly different find-or-create pattern (findById().orElseGet() then save) at lines 67-82, which also has a TOCTOU window under concurrency. The three allotment tables (assessment_entity_allotments, assessment_group_allotments, assessment_respondent_allotments) are confirmed absent from /home/morningstar/Projects/bodh/bodhassess-api-spring/docker/mysql-init/01-schema.sql — all 16 CREATE TABLE statements in that file are for other entities. The application.properties file at line 9 confirms spring.jpa.hibernate.ddl-auto=update, and the comment on line 5 itself acknowledges its limitations. The GlobalExceptionHandler does not handle DataIntegrityViolationException — it falls through to the generic Exception handler which returns a 500. The severity is correctly rated Medium: in a typical admin-facing workflow, concurrent allotment creation for the exact same (assessment, group/respondent) pair is unlikely, but the schema management concern (relying on ddl-auto=update to create tables with correct composite PKs, and its inability to retroactively fix pre-existing tables) is a genuine operational risk if tables were ever created under a different mapping. The best-case failure (duplicate PK violation -> unhandled 500) is a real but non-critical issue; the worst-case (missing PK allows silent duplicate rows) is real but depends on schema history.

---
### [CNT-01] Respondent.sessions_count (and last_assessment) are stored derived fields that are never updated when sessions are created — permanently stale

**Severity:** Medium · **Dimension:** Validation · **Confidence:** High

**Locations:** `model/Respondent.java:27-31`, `service/PublicRegistrationService.java:98,145-162`, `service/RespondentsService.java:76-77,91-92`, `model/EntityRegistration.java:42-46`

**Problem.** sessions_count / last_assessment are denormalized counters stored on the respondent row, but the session-creation path (the only thing that should bump them) does not maintain them. There is no @Formula / derived computation and no trigger.

**Impact.** Self-registered respondents always show sessions_count=0 and an empty last_assessment in the admin Respondents list regardless of how many assessments they actually took, because the registration path that creates their sessions never touches the counter. The stored value drifts from the true count (which is computable from portal_sessions). Admins make decisions on wrong numbers.

**Evidence.**

> PublicRegistrationService creates a Respondent with `r.setSessionsCount(0)` then later `sessions.save(s)` for the PortalSession — but never increments the respondent's counter. grep for setSessionsCount shows it is only ever set from the inbound DTO (RespondentsService.create/update) or hard-coded 0 at registration; no code does `sessionsCount + 1` on session creation. last_assessment is likewise only set from DTO, never on session create.

**Recommendation.** Either (a) stop storing the counter and derive it (`SELECT COUNT(*) FROM portal_sessions WHERE respondent_id=?`) or map it as a read-only `@Formula`; or (b) increment `sessionsCount` and set `lastAssessment` in PublicRegistrationService.register (and any other session-creation path) within the same transaction. Do not leave a stored counter that nothing maintains.

**Verifier confirmed.** The finding is confirmed by direct inspection of the source. Respondent.java maps sessions_count and last_assessment as plain @Column fields (lines 27-31) with no @Formula or computed annotation. PublicRegistrationService.java line 98 hard-codes r.setSessionsCount(0) at registration time, and lines 145-162 call sessions.save(s) to persist the PortalSession without subsequently incrementing the respondent counter or setting lastAssessment. RespondentsService.java lines 76-77 and 91-92 only update these fields when the admin explicitly passes values in a DTO (create/update admin API calls). The DDL at 01-schema.sql lines 201-202 defines sessions_count and last_assessment as ordinary INT/VARCHAR columns with no database triggers anywhere in the file. A grep across all service files confirms no code path does sessionsCount + 1 or writes lastAssessment during session creation. AssessmentService.java line 224 does query portal_sessions for a live count, but that updates AssessmentDto (the assessment-level counter shown on the assessments list), not the respondent row. Self-registered respondents will permanently show sessions_count=0 and a null last_assessment regardless of how many sessions they have taken, because the only path that creates their sessions (PublicRegistrationService.register) never touches the counter after initializing it to zero.

---
### [VAL-02] Uniqueness for self-registration email relies only on an app-side SELECT; no DB unique constraint exists (ddl-auto never adds one)

**Severity:** Medium · **Dimension:** Validation · **Confidence:** Medium

**Locations:** `model/EntityRegistration.java:35-37`, `service/EntityRegistrationsService.java:53-56`, `repository/EntityRegistrationRepository.java:18`

**Problem.** The 'email is the de-facto unique key for self-signups' invariant (per the service Javadoc) is enforced purely by a non-atomic check-then-insert in application code, with no backing UNIQUE index. There is also no NOT NULL on official_email despite it being the dedup key.

**Impact.** Two concurrent registrations with the same email both pass the findByEmail check and both insert — duplicate unmoderated entity rows for the same person, which the design explicitly tries to prevent. A NULL email (no DB NOT NULL) also slips through and breaks the dedup. Later promotion to respondents can collide.

**Evidence.**

> EntityRegistration: `@Column(name = "official_email") private String email;` — no `unique=true`, no `nullable=false`. Service: `if (repo.findByEmail(email).isPresent()) throw new BadRequestException("This email is already registered.");`. The entity_registrations table is created by ddl-auto (absent from 01-schema.sql), and ddl-auto=update never adds unique indexes retroactively.

**Recommendation.** Add `@Column(name="official_email", nullable=false, unique=true)` and a DDL `UNIQUE KEY uniq_entity_reg_email (official_email)` (and add the table to 01-schema.sql so a fresh DB gets it; for existing DBs add a one-shot ALTER like the practitioners.phone idempotent block). Rely on the constraint + catch the duplicate-key exception rather than check-then-insert.

**Verifier confirmed.** All evidence quotes verified against actual source. In EntityRegistration.java lines 35-36, `@Column(name = "official_email") private String email` has no `unique=true` or `nullable=false`. The service (lines 53-56) performs a non-atomic `findByEmail` check then `repo.save`, both within the same `@Transactional` boundary but without any serializable isolation or SELECT FOR UPDATE, so concurrent registrations can both pass the check before either commits. The `entity_registrations` table is absent from 01-schema.sql (which covers 15 other tables), and `spring.jpa.hibernate.ddl-auto=update` (application.properties line 9) confirms Hibernate manages the table — it creates the table on first run but never adds unique indexes retroactively to existing columns. The combination means no DB-level uniqueness safety net exists. The NULL email concern is partially mitigated: the service validates `StringUtils.hasText(dto.getEmail())` before proceeding, so the NULL path through the public API is blocked — but no DB NOT NULL constraint protects against direct DB writes or future code paths. The primary risk (duplicate rows from concurrent registrations) is genuine and unmitigated at the DB level. Severity Medium is correct: exploiting the race requires two near-simultaneous submissions for the same email, but self-registration endpoints are public and a duplicate row causing admin-promotion collision is a real downstream consequence.

---
### [VAL-03] Entity-level NOT NULL / unique / email validation missing on Respondent and PortalSession key fields (only the hand-written DDL enforces it)

**Severity:** Medium · **Dimension:** Validation · **Confidence:** Medium

**Locations:** `model/Respondent.java:17-25`, `model/PortalSession.java:29-49`, `service/RespondentsService.java:65-97`

**Problem.** The JPA mapping omits the constraints that the canonical DDL has, creating drift between the mapping and the schema, and there is zero Bean Validation (@Valid) safety net. Email is never validated as an email at the entity layer; only the bulk-import path has a regex, while the generic create/update path does not.

**Impact.** On any environment where Hibernate creates these tables (or in tests/H2), the NOT NULL/UNIQUE guarantees vanish, allowing null respondent_id/instrument and duplicate respondent emails. RespondentsService.create/update can store a malformed email (no format check on that path), which later breaks login-by-email and dedup.

**Evidence.**

> Respondent: `private String name; private String email; ...` — no `@Column(nullable=false, unique=true)` on email even though respondents.email is `NOT NULL UNIQUE` in 01-schema.sql:197. PortalSession: respondentId/respondentName/instrument have no nullable=false although the DDL declares them NOT NULL (01-schema.sql:264-267). No `@NotNull`/`@Email`/`@Size` Bean Validation anywhere on entities or the *Dto payloads; RespondentsService.create/update (lines 65-97) only checks hasText, not email format.

**Recommendation.** Mirror the DDL on the entities: `@Column(nullable=false, unique=true) private String email;` on Respondent; `nullable=false` on PortalSession.respondentId/respondentName/instrument; add Bean Validation (`@NotBlank`, `@Email`, `@Size`) on the DTOs and annotate controllers with `@Valid`. Validate email format on the generic Respondent create/update path, not only in bulk import.

**Verifier confirmed.** All evidence cited in the finding is confirmed by direct code inspection.

Respondent.java lines 17-19: `name` and `email` are plain `private String` fields with no `@Column` annotation at all, so neither `nullable=false` nor `unique=true` is present in the JPA mapping. The DDL at 01-schema.sql:196-197 declares both `NOT NULL` and `email` as `UNIQUE`.

PortalSession.java lines 31-40: `respondentId` (@Column name only), `respondentName` (@Column name only), and `instrument` (no @Column at all) all lack `nullable=false`. The DDL at lines 264-267 declares all three `NOT NULL`.

application.properties line 9 sets `spring.jpa.hibernate.ddl-auto=update`. With this setting, if Hibernate creates the table (e.g., on a fresh database before the Docker init script runs, or in a test environment), it will omit the NOT NULL and UNIQUE constraints because they are absent from the entity annotations. The `ddl-auto=update` does not re-apply constraints to existing columns, so on an already-initialized production DB the drift is latent rather than immediately exploitable, but it is real.

Bean Validation: confirmed zero `@NotNull`/`@NotBlank`/`@Email`/`@Size` annotations anywhere in entities or DTOs, and no `@Valid` on controllers.

Email format gap: the `EMAIL` pattern (line 43) is used only in the `login()` path (line 114) and `bulkCreate()` path (line 183). The generic `create()` (lines 65-82) and `update()` (lines 84-97) only call `StringUtils.hasText()` — a non-empty string with no `@` passes without error. A malformed email stored this way will fail the login-by-email lookup because the login path does match against the EMAIL pattern.

Severity is Medium (not High): in the standard Docker deployment the init SQL runs before the application, so the authoritative MySQL constraints are in place in production. The missing JPA annotations become harmful primarily in test environments or if the application starts against a blank MySQL instance before the init script runs.

---

## 🔵 Low findings (19)
### [TYPE-06] items.irt_c is NOT NULL DEFAULT 0 in DDL but mapped as nullable Double in the entity

**Severity:** Low *(finder rated Medium)* · **Dimension:** Column types · **Confidence:** Medium

**Locations:** `Item.java:69-70`, `docker/mysql-init/01-schema.sql:102`

**Problem.** The entity declares irtC as a nullable boxed Double with no nullable=false, implying the application may set it null, but the column is NOT NULL. (Also a float-precision concern: IRT guessing parameter as DOUBLE rather than a fixed-scale DECIMAL, but the immediate fault is the nullability mismatch.) ddl-auto=update will not relax the existing NOT NULL.

**Impact.** Persisting an Item with irtC == null throws a DataIntegrityViolation / constraint error at insert/update time on existing DBs; the mapping misleads callers into thinking null is allowed. irt_a/irt_b are nullable in both, so only irt_c is inconsistent.

**Evidence.**

> DDL: irt_c DOUBLE NOT NULL DEFAULT 0. Entity: @Column(name = "irt_c") private Double irtC;  (object type, no nullable=false).

**Recommendation.** Align the two: either make the column nullable (ALTER TABLE items MODIFY irt_c DOUBLE NULL) if a missing guessing parameter is valid, or annotate the field @Column(name="irt_c", nullable=false) and default it to 0 in the entity so it is never null. Prefer the latter to match psychometric semantics (c defaults to 0).

**Verifier confirmed.** The DDL/entity mismatch is real and confirmed: `irt_c DOUBLE NOT NULL DEFAULT 0` in the schema (01-schema.sql line 102) vs `@Column(name = "irt_c") private Double irtC;` (Item.java lines 69-70) with no `nullable=false`. However, the claimed runtime impact does not materialize in practice. All writes to the `items` table are executed via native SQL in `ItemsService.insertItem()`, which explicitly guards against null at line 305 (`req.getIrtC() == null ? 0.0 : req.getIrtC()`) with a comment acknowledging the NOT NULL constraint. The `ItemRepository` (a bare `JpaRepository<Item, String>`) is defined but never called with `.save()` anywhere in the codebase — no service injects or uses it. There is no JPA `em.persist()`/`em.merge()` path for `Item` entities either. The mismatch is a latent code-quality issue that would cause a `DataIntegrityViolationException` only if someone adds a JPA-managed save path in the future, but it does not currently trigger. Severity is downgraded from Medium to Low because the protective null-guard is in place at every write site and the dangerous path (entity-level save) is unused.

---
### [TYPE-07] instruments table carries two parallel scoring columns: stale NOT-NULL scoring_algorithm (DDL) plus ddl-auto-added scoring_model (entity)

**Severity:** Low · **Dimension:** Column types · **Confidence:** Medium

**Locations:** `docker/mysql-init/01-schema.sql:74`, `QuestionnaireCatalog.java:82-83`, `service/ItemsService.java:66,74,87`, `config/JsonToTableMigrationRunner.java:787-793`

**Problem.** The instrument scoring flavour is now stored in scoring_model (added as VARCHAR(32) by ddl-auto and written by ItemsService), while the original scoring_algorithm column persists in the DDL, NOT NULL, unmapped, and never dropped by the migration runner. Two columns model the same concept with different lengths (32 vs 50) and only one is maintained.

**Impact.** Schema confusion and silent divergence: scoring_algorithm retains a stale default ('IRT_3PL') that no longer reflects the actual scoring model in scoring_model; any consumer reading scoring_algorithm gets wrong data. The unused NOT NULL column also wastes a slot and could surprise future inserts via raw SQL.

**Evidence.**

> DDL: scoring_algorithm VARCHAR(50) NOT NULL DEFAULT 'IRT_3PL'. Entity: @Column(name = "scoring_model", length = 32) private String scoringModel; The runner migrates scoring_config->scoring_model and drops scoring_config, but never drops scoring_algorithm.

**Recommendation.** Pick one column. Either drop the dead column (ALTER TABLE instruments DROP COLUMN scoring_algorithm) and keep scoring_model, or consolidate scoring_model back into scoring_algorithm and map it. Add the chosen drop to JsonToTableMigrationRunner so existing DBs converge.

**Verifier confirmed.** The finding is confirmed genuine. The DDL at 01-schema.sql:74 defines `scoring_algorithm VARCHAR(50) NOT NULL DEFAULT 'IRT_3PL'` on the instruments table. The entity QuestionnaireCatalog.java maps only `scoring_model` (length=32) — there is no Java-side reference to `scoring_algorithm` anywhere in the codebase (grep across all source returned nothing). With `spring.jpa.hibernate.ddl-auto=update`, Hibernate adds `scoring_model` as a new column but never removes `scoring_algorithm`. The migration runner (JsonToTableMigrationRunner.java) migrates `scoring_config -> scoring_model` and drops `scoring_config` at line 136, but has no corresponding DROP for `scoring_algorithm`. Every INSERT issued by ItemsService omits `scoring_algorithm` from the column list; MySQL silently fills it with the default `'IRT_3PL'` for every row, meaning `scoring_algorithm` perpetually holds a stale, meaningless default value while `scoring_model` holds the real value. No runtime failures result (the DEFAULT prevents constraint violations), making this a schema drift / silent data confusion issue, not a breakage. The Low severity assigned by the auditor is appropriate.

---
### [TYPE-08] Status / version_status enums persisted as unconstrained free-text VARCHAR with no CHECK or enum type

**Severity:** Low · **Dimension:** Column types · **Confidence:** Medium

**Locations:** `Assessment.java:56-59`, `PublishedQuestionnaire.java:114-117`, `User.java:48-49`, `Respondent.java:25`, `docker/mysql-init/01-schema.sql:271,200`

**Problem.** These are closed enumerations (ACTIVE/CLOSED/PAUSED, DRAFT/COMMITTED, Active/..., Pending/...) intentionally stored as plain String with neither a Java @Enumerated(EnumType.STRING) enum nor any DB-side CHECK constraint or ENUM type. The author's stated motive (avoid migrations) leaves the column with zero validation. MySQL 8 would honour a CHECK constraint, but none is defined.

**Impact.** Any typo or stale client value ('active' vs 'ACTIVE', 'Closed' vs 'CLOSED') silently persists and then fails downstream status-driven logic (respondents blocked/allowed incorrectly, versions treated as editable). Case/whitespace drift across writers fragments the value space and breaks WHERE status = ... filters.

**Evidence.**

> Assessment: // Plain string instead of enum ... @Column(nullable=false, length=16) private String status = "ACTIVE";  PublishedQuestionnaire: @Column(name="version_status", length=16, nullable=false) private String versionStatus = "COMMITTED"; (DRAFT|COMMITTED). User.status String; Respondent.consent VARCHAR(32).

**Recommendation.** Model as a Java enum with @Enumerated(EnumType.STRING) (keeps human-readable, reorder-safe values) and/or add a DB CHECK constraint, e.g. ALTER TABLE assessments ADD CONSTRAINT chk_assess_status CHECK (status IN ('ACTIVE','CLOSED','PAUSED')); and the analogous constraint for published_questionnaires.version_status. Normalize case on write.

**Verifier confirmed.** The evidence quotes are accurate. All four fields exist as plain VARCHAR with no DB-side CHECK constraint or ENUM type, and the DDL header at line 4 of 01-schema.sql explicitly documents this as an intentional design choice ("ENUM types -> VARCHAR with no DB-side check (validation in app)"). The `assessments` and `app_users` tables are not in the DDL at all — they are created by Hibernate's `ddl-auto=update`, so no DDL-level constraints ever exist for them.

However, the "zero validation" claim is significantly overstated. `AssessmentService` has a `VALID_STATUSES` constant set and a `normaliseStatus()` helper that trims, uppercases, and validates every write to `Assessment.status`, throwing `BadRequestException` on invalid input. `QuestionnaireVersioningService` never accepts `versionStatus` from user input — all transitions are hard-coded literal strings in service methods. The bulk-import path in `RespondentsService` validates `consent` must be one of "Granted", "Pending", or "Withdrawn".

The genuine gaps are narrower: (1) `Respondent.consent` in the single-update path (line 90 of RespondentsService) accepts any non-empty string with no validation; (2) `User.status` has no write-time validation — it is set to "Active" by default but could accept arbitrary strings through an update path; (3) there is no case-normalization on `versionStatus` writes (though these are all literal constants, so in practice it is fine). The impact described — silent persistence of typos for the main status fields — is prevented by the application layer. The finding is real as a design-quality issue (defense in depth is missing at the DB layer), but the stated impact is mostly mitigated and the confidence of "Medium" is reasonable. Severity Low is appropriate; the risk is primarily theoretical for the well-guarded fields and minor for the under-guarded ones.

---
### [TYPE-09] Respondent.companyId mapped but column absent from canonical DDL — created implicitly as VARCHAR(255) by ddl-auto

**Severity:** Low · **Dimension:** Column types · **Confidence:** Medium

**Locations:** `Respondent.java:44-45`, `docker/mysql-init/01-schema.sql:194-208`

**Problem.** company_id is part of the Respondent entity (and the returning-registrant dedup key) but is not declared in the canonical respondents DDL, so its type/length is whatever Hibernate ddl-auto picks: VARCHAR(255) with default charset. The documented schema and the live schema disagree on the table's columns.

**Impact.** The canonical DDL understates the real table; a DB provisioned strictly from 01-schema.sql lacks company_id until ddl-auto adds it, and the implicit VARCHAR(255) length/charset is unreviewed. Dedup that relies on company_id behaves differently from what the DDL implies.

**Evidence.**

> Entity: @Column(name = "company_id") private String companyId;  grep of 01-schema.sql for company_id on respondents returns nothing.

**Recommendation.** Add the column explicitly to 01-schema.sql with an intentional type, e.g. ALTER TABLE respondents ADD COLUMN company_id VARCHAR(64) NULL; (mirroring other id columns) and annotate @Column(name="company_id", length=64) on the entity so the type is pinned rather than defaulted.

**Verifier confirmed.** The finding is confirmed by direct code inspection. Respondent.java lines 44-45 declare @Column(name = "company_id") private String companyId; and the respondents CREATE TABLE in 01-schema.sql (lines 194-208) lists no company_id column. There is only one SQL init file in the project (docker/mysql-init/01-schema.sql) with no ALTER TABLE or migration to add the column. application.properties sets spring.jpa.hibernate.ddl-auto=update, so Hibernate will silently add the column as VARCHAR(255) on first startup, but a database provisioned strictly from 01-schema.sql would lack the column until that happens. Critically, the column is not dead code: RespondentRepository.java uses it in a JPQL dedup query (:companyId IS NOT NULL AND r.companyId = :companyId) and PublicRegistrationService.java calls that query at registration time. A DB provisioned from the DDL alone and queried before the app has run would fail or silently omit the company_id dedup leg. The severity Low assessment is appropriate: on a normal running deployment with ddl-auto=update the gap is self-healing, but the canonical DDL is genuinely incomplete and the implicit VARCHAR(255) length and charset are unreviewed.

---
### [TYPE-10] AssessmentToken QR image uses @Lob + LONGBLOB, but @Lob on byte[] in MySQL/Hibernate can be misinterpreted as a streamed BLOB locator

**Severity:** Low · **Dimension:** Column types · **Confidence:** Low

**Locations:** `AssessmentToken.java:67-69`

**Problem.** Combining @Lob with byte[] is a known Hibernate footgun: @Lob requests JDBC Blob/streaming semantics while byte[] expects a materialized VARBINARY/LONGBLOB. The explicit columnDefinition=LONGBLOB here keeps the DDL correct, but the @Lob hint is redundant and on some driver/dialect combinations causes Hibernate to bind the value as a Blob locator, which MySQL does not support the same way Postgres does, occasionally surfacing as read/write errors or unexpected truncation.

**Impact.** At minimum confusing/redundant; at worst, depending on driver behaviour, the @Lob locator path can throw on read or write of the stored QR PNG. Low because the explicit columnDefinition currently forces LONGBLOB.

**Evidence.**

> @Lob @Column(name = "qr_code", columnDefinition = "LONGBLOB") private byte[] qrCode;

**Recommendation.** For a byte[] that fully materializes in memory (a small QR PNG), drop @Lob and keep only @Column(name="qr_code", columnDefinition="LONGBLOB") (or MEDIUMBLOB, which is ample for a QR image). Reserve @Lob for streamed java.sql.Blob fields.

**Verifier confirmed.** The evidence quote is accurate: AssessmentToken.java lines 67-69 do use @Lob @Column(name="qr_code", columnDefinition="LONGBLOB") private byte[] qrCode. The assessment_tokens table is not defined in 01-schema.sql at all — it is created entirely by Hibernate via ddl-auto=update — so the LONGBLOB column type comes solely from the entity annotation. The application uses MySQL8Dialect explicitly. The qrCode field is used as a materialized byte[] in the service layer (AssessmentTokenService lines 127-128, 134-135), not as a streamed Blob. The combination of @Lob with byte[] is genuinely redundant: @Lob requests JDBC Blob/streaming semantics while byte[] and the explicit columnDefinition already ensure the correct LONGBLOB column type and materialized read/write. With MySQL Connector/J 8.x + MySQL8Dialect, this combination does not currently cause runtime failures because the connector transparently handles byte-array LOBs without locators, but the @Lob annotation is unnecessary and on older driver versions or different configurations could cause Hibernate to take the Blob locator path. The Low severity is correctly calibrated — it is a real code-quality and latent-risk issue, not a currently broken mapping.

---
### [DDL-08] OffsetDateTime mapped onto MySQL TIMESTAMP columns across many entities — offset/zone lost and DDL date types diverge from what ddl-auto emits

**Severity:** Low *(finder rated Medium)* · **Dimension:** DDL drift *(finder ref `REL-08`)* · **Confidence:** Medium

**Locations:** `model/Assessment.java:61-68`, `model/AssessmentToken.java:54-58`, `model/PortalSession.java:97-109`, `model/Respondent.java:47-51`, `model/Practitioner.java:53-57`, `model/PublishedQuestionnaire.java:122-123`, `model/User.java:66-72`, `docker/mysql-init/01-schema.sql:206-207`

**Problem.** MySQL TIMESTAMP has no offset storage and a 1970-2038 range; Hibernate 5 converts OffsetDateTime to/from TIMESTAMP using the JDBC session timezone, so the persisted instant depends on the connection's time_zone and the offset is discarded on read. Columns the entity declares but the DDL does not (e.g. assessments.created_at) get created by ddl-auto, which emits DATETIME for OffsetDateTime on MySQL8Dialect — so ddl-auto-created date columns are DATETIME while hand-written ones are TIMESTAMP, an inconsistent type across the schema.

**Impact.** Cross-timezone deployments record/return wrong wall-clock times; the 24h/48h overdue notifications and time-to-start metric (driven by portal_sessions.started_at) can be off by the server/connection offset. New ddl-auto tables get DATETIME while legacy get TIMESTAMP, producing type drift and inconsistent default/ON-UPDATE behavior.

**Evidence.**

> Entities use `private OffsetDateTime createdAt/updatedAt/expiresAt/completedAt/startedAt/committedAt`. DDL columns are `TIMESTAMP` (e.g. respondents.created_at/updated_at, portal_sessions.completed_at/started_at). MySQL TIMESTAMP stores no zone and is internally converted via the session time_zone; OffsetDateTime carries an explicit offset.

**Recommendation.** Standardize: either set `spring.jpa.properties.hibernate.jdbc.time_zone=UTC` and keep TIMESTAMP, or change DDL date columns to DATETIME and add `columnDefinition="DATETIME"` so hand-written and ddl-auto-created tables agree. Pin the connection time_zone explicitly.

**Verifier confirmed.** The evidence is partially confirmed but the impact is substantially overstated. OffsetDateTime is used across all cited entities, and the DDL does use TIMESTAMP for respondents, practitioners, portal_sessions, published_questionnaires, and other hand-written tables. The assessments, assessment_tokens, and app_users tables are absent from the DDL entirely, meaning Hibernate ddl-auto=update creates them — and with MySQL8Dialect, Hibernate maps OffsetDateTime to DATETIME for ddl-auto-generated columns. That TIMESTAMP vs DATETIME type drift between hand-written and ddl-auto tables is a genuine inconsistency. However, the primary severity claim — cross-timezone wrong wall-clock times causing bad 24h/48h notifications and time-to-start metrics — is largely neutralized by a mitigation the finding missed: both application-dev.properties and application-prod.properties set serverTimezone=UTC in the JDBC URL (e.g. jdbc:mysql://localhost:3306/bodhassess?...&serverTimezone=UTC). This pins the JDBC session timezone to UTC for all connections in both environments, which is exactly the fix the recommendation prescribes. The recommendation to also add spring.jpa.properties.hibernate.jdbc.time_zone=UTC and use columnDefinition=DATETIME for consistency remains valid, but the actual runtime impact is low given the UTC pinning already in place. The real residual issue is the schema type inconsistency (TIMESTAMP in hand-written DDL, DATETIME in ddl-auto-created tables) and the fact that the UTC pinning is in the JDBC URL rather than a Hibernate property, which could break if a connection pool overrides the session timezone — but this is a minor hygiene concern, not a Medium-severity data-corruption risk.

---
### [DDL-14] Legacy `sessions` table (with FKs) is DROP-ed by application code at runtime, not by DDL — schema source of truth diverges from runtime behavior

**Severity:** Low · **Dimension:** DDL drift *(finder ref `REL-14`)* · **Confidence:** Low

**Locations:** `docker/mysql-init/01-schema.sql:119-151`, `config/JsonToTableMigrationRunner.java:141-144`

**Problem.** The application performs destructive DDL (DROP TABLE) at boot inside a transactional runner while the canonical 01-schema.sql still creates the table. The schema source of truth (the SQL file) and the actual runtime schema permanently disagree, and a destructive operation is hidden inside application startup rather than a reviewed migration.

**Impact.** Confusing, non-reproducible schema; a DBA reading 01-schema.sql sees a sessions table the app deletes on next boot. App code issuing DROP TABLE is risky if the guard logic ever misfires.

**Evidence.**

> DDL still defines `sessions` with fk_sessions_tenant and fk_sessions_instrument. JsonToTableMigrationRunner.run() executes `DROP TABLE sessions` at startup (line 142) when it exists, logging 'Dropped legacy table sessions'.

**Recommendation.** Remove the sessions CREATE TABLE from 01-schema.sql (or move the DROP into a versioned, reviewed migration run by Flyway/Liquibase), and stop issuing DDL from ApplicationRunner code.

**Verifier confirmed.** The evidence is confirmed. The DDL at 01-schema.sql:119-151 does create the `sessions` table (with `fk_sessions_tenant` and `fk_sessions_instrument`), and JsonToTableMigrationRunner.java:141-144 does execute `DROP TABLE sessions` at startup when the table exists, logging "Dropped legacy table sessions". The finding's core observation — that the schema source of truth (01-schema.sql) and the actual runtime schema permanently disagree — is genuine. On a fresh environment, MySQL init creates `sessions` via the DDL, and the runner immediately drops it on first boot. After that, the table no longer exists anywhere, yet the DDL still defines it. A DBA or developer reading 01-schema.sql would see a table that the application removes on startup. The guard (`if (tableExists("sessions"))`) does make the operation safe and idempotent, and the entire runner is already performing similar DDL mutations (dropping legacy columns from many tables). So this is not a rogue or misfiring operation — it is an intentional one-time cleanup. However, the schema drift concern is real: the canonical SQL file creates something the application destroys, and this relationship is not documented in the SQL file itself. The severity of Low is appropriate because there is no data loss risk (the table is empty/superseded by `portal_sessions`), no correctness bug, and no security issue — it is purely a maintainability and schema-clarity problem. Keeping `CREATE TABLE sessions` in 01-schema.sql while the application drops it at boot is misleading but not harmful in practice.

---
### [PK-01] Opaque registration token is the PRIMARY KEY but lives in a case-insensitive / accent-insensitive collation (utf8mb4_unicode_ci)

**Severity:** Low *(finder rated Critical)* · **Dimension:** Keys / Index · **Confidence:** High

**Locations:** `model/AssessmentToken.java:32-34 (@Id @Column(length=64) String token)`, `service/AssessmentTokenService.java:205-209 (randomToken -> Base64.getUrlEncoder)`, `docker/mysql-init/01-schema.sql:10-12 (DB default COLLATE utf8mb4_unicode_ci)`

**Problem.** The token PK is a cryptographically-random Base64URL string that mixes upper- and lower-case letters. Under utf8mb4_unicode_ci every string comparison MySQL performs for that PRIMARY KEY (uniqueness check on INSERT, and every findById lookup) is case- AND accent-insensitive. Two genuinely-distinct tokens that differ only by letter case (e.g. 'aB...' vs 'Ab...') collate as EQUAL.

**Impact.** On INSERT this can throw a spurious Duplicate entry error and fail to issue a valid invite link. Worse, on resolve()/consume()/qrPng() (all tokens.findById(token)) a respondent presenting token X can be matched to a different respondent's token Y if they collate equal — cross-assignment of an assessment registration to the wrong scope/respondent, plus the practical loss of the token's intended entropy (collation folds the keyspace). This is both a correctness and a security/authorization bug for the public registration flow.

**Evidence.**

> @Id @Column(length = 64) private String token;  // PK
... randomToken(): Base64.getUrlEncoder().withoutPadding().encodeToString(buf)  // mixed-case A-Za-z0-9-_
DB: CREATE DATABASE bodhassess ... COLLATE utf8mb4_unicode_ci;  (assessment_tokens is created by ddl-auto, inheriting this collation, with no per-column COLLATE override)

**Recommendation.** Force a binary/case-sensitive collation on the PK column: in the entity use @Column(name="token", length=64, columnDefinition="VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin") (or utf8mb4_bin). Since ddl-auto=update will NOT retroactively change an existing column's collation, also ship explicit DDL: ALTER TABLE assessment_tokens MODIFY token VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin; (the same applies to any other opaque random-string identifier used as a key).

**Verifier confirmed.** The evidence is accurate. AssessmentToken.java declares `@Id @Column(length = 64) private String token` with no columnDefinition override, and randomToken() at line 205-208 generates mixed-case Base64URL output. The database is created with `COLLATE utf8mb4_unicode_ci` (schema line 12), and the assessment_tokens table does not appear anywhere in 01-schema.sql — it is created at runtime by Hibernate's ddl-auto=update, inheriting that case-insensitive collation. The collation mismatch is therefore real: MySQL will perform case-insensitive comparisons on the PK.

However, the claimed Critical severity and described attack scenarios are heavily overstated. A 32-byte random token encoded as 43 Base64URL characters has ~256 bits of entropy before considering case-folding. Under utf8mb4_unicode_ci, two tokens must differ only in the case of one or more alphabetic characters AND those case variants must be the exact values produced by the independent RNG calls. The probability of any two distinct tokens being case-fold equals is astronomically small (on the order of 1 in 2^(number of letter positions), combined with the independent generation requirement). No realistic code path produces duplicate keys or wrong-respondent access from natural token generation. An external attacker cannot construct a case-fold variant of a target token because tokens are only obtained through the invite flow — there is no public endpoint that allows token enumeration or submission of an attacker-chosen token string for registration. The flaw is a correctness/hygiene issue (wrong collation for an opaque binary key) that should be fixed, but the practical risk is negligible and the Critical designation is not warranted. Low is the appropriate severity.

---
### [PK-05] Assessment.id PK is VARCHAR(255) but every referencing column (portal_sessions/assessment_tokens/allotment FKs) is VARCHAR(64) — type/length mismatch on the logical join key

**Severity:** Low *(finder rated Medium)* · **Dimension:** Keys / Index · **Confidence:** Medium

**Locations:** `model/Assessment.java:26-27 (@Id String id; no length -> VARCHAR(255))`, `model/AssessmentToken.java:36 (assessment_id length=64)`, `model/PortalSession.java:26-27 (assessment_id length=64)`, `model/AssessmentEntityAllotment.java:23-25 (assessment_id length=64)`, `service/AssessmentService.java:83-85 (id = "AS-" + UUID...substring(0,8))`

**Problem.** The PK and its logical foreign keys are declared with different column lengths (255 vs 64). Even though these tables have no DB-level FK constraints (they are app-managed), a real FK could never be added later without an ALTER, and any composite index / join behaves on mismatched definitions. It also signals an inconsistent contract for the key width.

**Impact.** Prevents adding referential integrity later; on MySQL a future FK creation fails with errno 150 due to mismatched column types. Mismatched widths also waste index space and can defeat index merge optimizations on joins between assessments and portal_sessions/assessment_tokens.

**Evidence.**

> Assessment: @Id private String id;  (no @Column(length=...) -> Hibernate emits VARCHAR(255)). All referrers pin length 64: AssessmentToken @Column(name="assessment_id", length=64); PortalSession @Column(name="assessment_id", length=64); AssessmentEntityAllotment @Id @Column(name="assessment_id", length=64).

**Recommendation.** Pin the Assessment PK to the same width as its references: @Id @Column(name="id", length=64) on Assessment, then ALTER TABLE assessments MODIFY id VARCHAR(64); (after confirming no id exceeds 64 chars — they are 'AS-' + 8 hex = 11 chars). Apply the same audit to Questionnaire.id, EntityRegistration.id, RespondentGroup.id which are unbounded VARCHAR(255) but referenced as length-64 columns elsewhere.

**Verifier confirmed.** All cited evidence is confirmed accurate. Assessment.java has @Id private String id; with no @Column annotation, so Hibernate will emit VARCHAR(255) for the assessments.id PK column when creating/updating the schema via ddl-auto=update. The three referencing columns are confirmed at length=64: AssessmentToken.assessmentId (@Column length=64), PortalSession.assessmentId (@Column length=64), and AssessmentEntityAllotment.assessmentId (@Id @Column length=64). The DDL file (01-schema.sql) does not define the assessments, assessment_tokens, or assessment_entity_allotments tables at all — those tables are created entirely by Hibernate's ddl-auto=update, making the Java annotations the sole source of truth for column widths. The ID generation in AssessmentService produces strings of the form "AS-" + 8 uppercase hex chars = 11 characters maximum, which fits easily within both 64 and 255 chars, so no data truncation occurs in practice. There are no database-level FK constraints between these tables (no @ManyToOne/@JoinColumn annotations, no FOREIGN KEY clauses in the DDL for these tables), so the mismatch causes no current runtime error. The finding is technically real: Hibernate will create assessments.id as VARCHAR(255) and the referencing columns as VARCHAR(64), producing a genuine width inconsistency that would prevent adding FK constraints later (MySQL errno 150 on mismatched column types/lengths). However, since actual IDs never exceed 11 chars, no overflow/truncation risk exists. The practical impact is limited to blocking future FK addition and representing a semantic inconsistency — not a data integrity or performance problem in the current state. Severity Medium is overstated; Low is more appropriate given the absence of any current failure mode and the trivially small actual ID values.

---
### [PK-07] Mqt / PublishedQuestionnaireMqt natural-key id columns carry no uniqueness or scoping guarantee within the JPA model

**Severity:** Low · **Dimension:** Keys / Index · **Confidence:** Low

**Locations:** `model/Mqt.java:26-28 (@Id @Column(length=64) String id)`, `service/QualitiesService.java:73 (m.setId(dto.getId())  // client-supplied)`, `model/PublishedQuestionnaireMqt.java:43-44 (mqt_id snapshot, no unique within questionnaire)`

**Problem.** Mqt.id is a client-supplied natural key used as a global PK. The QualitiesService.upsert clears and rebuilds the tree (orphanRemoval), so if a DTO reuses an mqt id that already exists under a DIFFERENT MeasuredQuality, the save either collides on PK or re-parents an existing row, because there is no (mq_id, id) scoping. Scoring rows (ItemOptionScore.mqtId etc.) reference these ids as plain strings with no FK.

**Impact.** Cross-MQ id reuse can fail the upsert (PK collision) or, combined with cascade, move/delete an MQT belonging to another quality — corrupting the trait tree that drives scoring. Because PublishedQuestionnaireQuestionOptionScore.mqtId / portal_session_mqt_scores.mqt_id are unconstrained strings, a stale/duplicated mqt id silently scores into the wrong trait.

**Evidence.**

> Mqt: @Id @Column(length=64) private String id;  set directly from the client DTO (m.setId(dto.getId())). The mqts table is created by Hibernate; id is the PK so it is globally unique across ALL MeasuredQualities, but nothing validates that a client doesn't reuse an mqt id that already belongs to a different MeasuredQuality tree.

**Recommendation.** Either (a) generate Mqt ids server-side (UUID) to eliminate client-controlled key reuse, or (b) keep a surrogate PK and make the natural id unique per MQ via @Table(name="mqts", uniqueConstraints=@UniqueConstraint(columnNames={"mq_id","id"})) plus validation that a submitted mqt id is not already owned by another mq. Add an index on mqts(mq_id) and on the *_scores(mqt_id) columns used for scoring joins.

**Verifier confirmed.** All evidence quotes verified as accurate. Mqt.java lines 26-28 confirm @Id @Column(length=64) String id with no composite uniqueness. QualitiesService.buildMqt (line 73) does call m.setId(dto.getId()) with no server-side ownership check. The DDL file (01-schema.sql) has no CREATE TABLE for mqts at all — that table is generated entirely by Hibernate ddl-auto=update, meaning no explicit (mq_id, id) unique constraint is ever created. There is no MqtRepository so there is no lookup to validate that a submitted mqt id already belongs to another MeasuredQuality. The q.getMqts().clear() + orphanRemoval in upsert only removes Mqt rows linked to the specific MQ being edited, leaving another MQ's rows with the same id intact. If a client submits a cross-MQ id reuse, JPA will attempt to persist a new Mqt entity with a PK that already exists, causing a PK constraint violation exception — a loud failure rather than silent corruption. The scoring tables (ItemOptionScore, PublishedQuestionnaireQuestionOptionScore, PortalSessionMqtScore) all store mqt_id as bare VARCHAR strings with no FK constraint, so stale or ambiguous ids could score into the wrong trait silently. The vulnerability is genuine but the primary failure mode is a runtime exception (not silent data corruption), and cross-MQ id collision requires an operational mistake by a privileged API caller. Low severity is appropriate and matches the auditor's original rating.

---
### [PK-08] verticals.code and measured_qualities.name uniqueness exist only in hand-written DDL; the JPA entities omit them, so any Hibernate-created/upgraded environment loses the guarantee

**Severity:** Low · **Dimension:** Keys / Index · **Confidence:** Medium

**Locations:** `model/Vertical.java:16-19 (no unique on code)`, `model/MeasuredQuality.java:21-24 (no unique on name)`, `docker/mysql-init/01-schema.sql:157-158 (measured_qualities.name UNIQUE), :170 (verticals.code UNIQUE)`

**Problem.** The DDL and the JPA model disagree (schema drift). On the canonical Docker DB the unique exists; but the project relies on ddl-auto=update for schema, and these constraints are invisible to Hibernate. Any environment whose tables were created/migrated by Hibernate (or where 01-schema.sql wasn't applied) has NO uniqueness on vertical code / quality name, and ddl-auto=update will never add it.

**Impact.** Duplicate vertical codes or measured-quality names can be inserted in non-Docker environments, breaking lookups/filters that assume one row per code/name and producing ambiguous scoring/category references.

**Evidence.**

> DDL: measured_qualities ... name VARCHAR(255) NOT NULL UNIQUE; verticals ... code VARCHAR(64) NOT NULL UNIQUE. Entities: Vertical.code is a plain @Column with no unique=true; MeasuredQuality.name is a plain field with no unique=true. The uniqueness lives ONLY in 01-schema.sql.

**Recommendation.** Move the constraints into the entities so they are part of the model of record: Vertical -> @Table(name="verticals", uniqueConstraints=@UniqueConstraint(columnNames="code")); MeasuredQuality -> @Column(name="name", nullable=false, unique=true). Keep the DDL in sync. For already-created tables ship explicit ALTER ... ADD UNIQUE after de-duplication, since update won't backfill.

**Verifier confirmed.** All evidence cited in the finding is confirmed by reading the source files directly. Vertical.java declares `private String code;` with no @Column annotation at all (no unique=true), and MeasuredQuality.java declares `private String name;` similarly bare. The DDL at 01-schema.sql line 158 has `name VARCHAR(255) NOT NULL UNIQUE` and line 170 has `code VARCHAR(64) NOT NULL UNIQUE`. application.properties line 9 confirms `spring.jpa.hibernate.ddl-auto=update`, which will never backfill a UNIQUE constraint on an already-existing column. The schema drift is real: the uniqueness guarantees exist only in the hand-written Docker init SQL. Any environment whose schema was created or migrated by Hibernate (rather than by running 01-schema.sql) will have no uniqueness on vertical.code or measured_quality.name. The Low severity rating is appropriate — the canonical Docker deployment is unaffected, and the risk materialises only in Hibernate-managed environments where the init script was not applied.

---
### [VER-05] Migration runners execute on EVERY boot inside one transaction with no run-once ledger; partial failure leaves split-brain JSON-vs-table data

**Severity:** Low *(finder rated High)* · **Dimension:** Versioning · **Confidence:** High

**Locations:** `JsonToTableMigrationRunner.java:47-145`, `QuestionnaireVersioningMigrationRunner.java:55-64`

**Problem.** MySQL DDL (ALTER TABLE) is non-transactional and auto-commits — it implicitly commits the surrounding transaction. So the 'all-or-nothing @Transactional' guarantee is an illusion: a failure after some columns are dropped but before others are migrated leaves data half in JSON (now dropped) and half in tables, with no rollback. Re-running depends on the dropped column still existing to detect 'already done', which it no longer does. The COUNT fast-path only short-circuits once EVERY legacy column is gone; until then the full body re-runs and re-probes every boot.

**Impact.** An interrupted deploy (OOM, timeout, crash mid-DROP) can permanently lose snapshot/answer/mqt-score data that lived in a JSON column that was dropped before its rows were drained, with no idempotent recovery. On large fleets every boot also re-scans all versions/assessments. The two runners' DML+DDL mix is fundamentally unsafe for a production data move.

**Evidence.**

> JsonToTableMigrationRunner is an ApplicationRunner that runs its whole body in `@Transactional run(...)` every startup, mixing DML (INSERT/UPDATE) with DDL (`ALTER TABLE ... DROP COLUMN`). Idempotency relies solely on 'JSON column emptied/nulled' and 'column dropped' side effects. QuestionnaireVersioningMigrationRunner.run is also @Transactional and re-sweeps `versions.findAll()` / `assessments.findAll()` every boot. No schema_version/flyway ledger.

**Recommendation.** Move these to a real migration tool (Flyway/Liquibase) with a versioned, run-once ledger; never interleave DROP COLUMN with data drains in the same logical step. Drain+verify in one release, drop columns only in a later release after confirming the target tables are authoritative. At minimum, record a completion marker row and guard each migration method on it.

**Verifier confirmed.** The finding is real in principle — both runners execute on every boot, mix DML with DDL inside a @Transactional method, and rely on no run-once ledger — but the actual severity is dramatically lower than claimed. After reading the full source of JsonToTableMigrationRunner.java and QuestionnaireVersioningMigrationRunner.java, the specific catastrophic-failure scenario described in the finding does not hold up:

1. DATA-BEFORE-DROP ORDER IS CORRECT. All migrate*() methods fully drain data from each JSON column (INSERT IGNORE into child tables, then null/empty the source row) BEFORE any dropLegacyColumn() call is made. There is no path where a column is dropped while data still lives only in it.

2. COLUMN-DROP IDEMPOTENCY IS GUARDED. dropLegacyColumn() (line 832) calls columnExists() before every ALTER TABLE. If the process crashes mid-run and is restarted, each individual drop is a no-op when the column is already absent. The finding's claim "Re-running depends on the dropped column still existing to detect 'already done', which it no longer does" is false.

3. FAST-PATH IS CORRECT. The INFORMATION_SCHEMA COUNT query at lines 53-69 correctly returns early (COUNT==0) when all legacy columns have been dropped, making subsequent startups near-zero cost.

4. DRAIN IDEMPOTENCY IS MOSTLY CORRECT. Most migrate*() methods use INSERT IGNORE and filter on IS NOT NULL AND JSON_LENGTH > 0, then null/empty the source per row only after successful insert. However, migratePublishedQuestionnaireMqs() (line 625) and migratePublishedQuestionnaireQuestions() (line 707) use plain INSERT (not INSERT IGNORE) for the top-level row before getting LAST_INSERT_ID(). A crash between the INSERT and the subsequent UPDATE...SET mqs=NULL could cause duplicate rows on re-run. This is a narrow but real idempotency gap, not the sweeping data-loss scenario described.

5. QUESTIONNAIRE VERSIONING RUNNER. The finding says it "re-sweeps versions.findAll() / assessments.findAll() every boot" — true, but backfillParents() has a correct guard (skip if parentId != null) and backfillAssessmentVersionIds() skips rows with questionnaireVersionId already set. Cost is a full table scan on every startup, which is a performance concern not a correctness or data-loss concern.

6. @TRANSACTIONAL + DDL AUTO-COMMIT. This is a real antipattern in MySQL: DDL (ALTER TABLE) implicitly commits the surrounding transaction, so the @Transactional annotation provides no rollback safety across a mixed DML+DDL batch. However, because of points 1-3 above, the practical impact of an interrupted migration is a re-run that correctly resumes, not permanent data loss.

The genuine, narrow issues are: (a) a few INSERT (not INSERT IGNORE) calls that could produce duplicates on interrupted re-run of published_questionnaire snapshot tables; (b) no run-once ledger means full-table scans in QuestionnaireVersioningMigrationRunner on every boot; (c) the @Transactional annotation is misleading and provides false safety impression. These collectively warrant a Low severity finding, not High. The core claim of "permanently losing snapshot/answer/mqt-score data" from an interrupted deploy is unsupported by the code's actual control flow.

---
### [VER-08] Snapshot scoring/score rows reference live MQT ids as bare varchars with no copy of the value at publish time, so renaming/reusing an MQT id desynchronizes labels

**Severity:** Low *(finder rated Medium)* · **Dimension:** Versioning · **Confidence:** Medium

**Locations:** `PublishedQuestionnaireQuestionOptionScore.java:32-33`, `PublishedQuestionnaireQuestionScore.java:33-34`, `PortalSessionMqtScore.java:33-39`, `PublishedQuestionnaireMqt.java:43-44`

**Problem.** The snapshot's option/question score rows reference traits by the live MQT id string. There is no in-snapshot join (no FK to the snapshot's own mqt rows) and no per-score label copy. Resolving a score's trait name requires matching mqt_id against the snapshot's published_questionnaire_mqts by value, or worse falling back to the live mqts table. If a live MQT id is reused/repurposed for a different trait after publish, the score's meaning silently shifts; if it's only renamed, the snapshot's copied name on the mqt row diverges from the live one but reports may pull either.

**Impact.** Reporting that resolves trait names via the live measured_qualities/mqts tree (rather than strictly the snapshot) will show post-edit labels against pre-edit scores. Because the snapshot side is only loosely coupled by string id, the snapshot is not fully self-describing for scoring output, undermining the 'immutable, self-contained snapshot' guarantee for the scored results.

**Evidence.**

> Score rows store only `@Column(name="mqt_id") String mqtId` and a numeric score; the only human-readable copy of the trait is on PublishedQuestionnaireMqt.name / the cached PortalSessionMqtScore.mqtName. The snapshot does not copy MQT names onto the score rows, and mqt_id is a plain string matched by value, not an FK into the snapshot's own published_questionnaire_mqts.

**Recommendation.** Resolve all score labels strictly within the snapshot tree (join published_questionnaire_question_*_scores.mqt_id to published_questionnaire_mqts within the same questionnaire_id), never the live mqts table. Consider storing the snapshot's own surrogate mqt key (the published_questionnaire_mqts.id) on score rows, or copying the trait name onto each score row at publish time so output is fully self-contained.

**Verifier confirmed.** The structural claim is confirmed: `PublishedQuestionnaireQuestionOptionScore` and `PublishedQuestionnaireQuestionScore` store only a bare `String mqtId` (no FK to `published_questionnaire_mqts`), and `PublishedQuestionnaireMqt` stores both `mqtId` and `name` but with no DB-level FK linking score rows to the snapshot MQT rows. The evidence quotes match the actual code exactly.

However, the severity is overstated. The worst-case scenario described (reports resolving labels from the live `mqts` table) is not observed anywhere in the codebase. Specifically: (1) `DatasetService.buildColumns` resolves MQT labels exclusively from `PortalSessionMqtScore.mqtName`, which is a cached field copied at scoring time — no join back to live `mqts` or even the snapshot `published_questionnaire_mqts` is performed; (2) `AssessmentsService.applyMqtScoresFromMap` writes both `mqtId` and `mqtName` from the incoming API payload, so the name is frozen at submission time; (3) `QuestionnairesService` never touches the live `mqts` table when building or reading the snapshot. The actual risk is a referential integrity gap: if a `published_questionnaire_mqts` row is deleted or its `mqtId` value changes, the option/question score rows would dangle silently with no DB-enforced constraint to catch it. But under the current code paths, MQT names in reporting output come from the cached `mqtName` on `PortalSessionMqtScore`, not from the snapshot tree or the live `mqts` table, which substantially limits the label-drift impact described. The finding is real as a weak referential integrity concern but is Low severity given the actual code paths do not exhibit the described live-table fallback behavior.

---
### [VER-09] Parent display fields (name/vertical) are denormalized and updated on commit, retroactively changing labels shown for old versions/assessments

**Severity:** Low · **Dimension:** Versioning · **Confidence:** Medium

**Locations:** `QuestionnaireVersioningService.java:273-275`, `Questionnaire.java:40-41`, `Assessment.java:49-50 (questionnaireName cache)`

**Problem.** name/vertical are denormalized in three places (parent, each version, each assessment) and reconciled inconsistently: committing a new version mutates the parent's cached display fields, but never updates the cached questionnaireName on existing assessments, and the version rows keep their own (possibly different) name. There is no single source of truth.

**Impact.** After a rename-on-commit, the Question Bank list (parent) shows the new name while old assessments still show the stale cached name and the take flow resolves by the version's own name (VER-03). Cross-screen inconsistency and, via VER-01/VER-03, contributes to name-based ambiguity. Low severity on its own but compounds the name-keyed resolution bugs.

**Evidence.**

> commitDraft: `if (saved.getName() != null && !saved.getName().equals(p.getName())) p.setName(saved.getName()); if (saved.getVertical() != null) p.setVertical(saved.getVertical());` — the parent's cached name/vertical are overwritten from the newest commit. Assessment also caches questionnaireName at create time and never refreshes it.

**Recommendation.** Treat the parent (or the pinned version) as the single source of truth for display and join for it rather than caching, or refresh all caches transactionally on commit. Decouple the take-flow content resolution from name entirely (see VER-03).

**Verifier confirmed.** The evidence quote is verbatim present at QuestionnaireVersioningService.java lines 272-275. On commit, the parent Questionnaire row's `name` and `vertical` are overwritten from the newly-committed version row if they differ. However, existing Assessment rows that cached `questionnaireName` at creation time (AssessmentService.java:89 — `a.setQuestionnaireName(q.getName())`) are never updated by the commit path or by the `updateParent` path. The `questionnaireName` cache in assessments is also sourced from the PublishedQuestionnaire (version) row's `name`, not the parent's `name` — so the three denormalized copies (parent row, version row, assessment cache) can all diverge independently. The described cross-screen inconsistency is genuine: the Question Bank list (driven by the parent row) shows the post-commit name, while the All Assessments list shows stale cached names from creation time, and the take-flow resolves content via the version row's own name. Severity Low is correct — this is purely a display-label inconsistency with no impact on data integrity, content delivery, or scoring. It compounds name-keyed resolution ambiguity flagged by VER-01/VER-03 but is not independently dangerous.

---
### [CON-07] LiveTrackingService runs outside any transaction with open-in-view=false — fragile lazy access on detached entities

**Severity:** Low *(finder rated Medium)* · **Dimension:** Concurrency · **Confidence:** Medium

**Locations:** `service/LiveTrackingService.java:20-77`, `service/HeartbeatService.java:25-26`, `model/PortalSession.java:57-66`

**Problem.** With open-in-view disabled and no @Transactional on the service method, each repository call runs in its own short transaction and returns entities that are immediately detached. The code currently reads only scalar fields, but any future access to s.getAnswers()/getMqtScores()/getDemographics() (all LAZY) — or a refactor that serialises the entity — throws LazyInitializationException at runtime, not compile time. It is a latent landmine on a hot live-tracking path.

**Impact.** Brittle: a one-line change to include child data, or returning the entity instead of a DTO, produces 500s only in production (where open-in-view=false), not in any test that happens to keep a session open. Also each find runs in its own tx, so the two reads in listAssessments are not a consistent snapshot.

**Evidence.**

> LiveTrackingService has no @Transactional (class or method) while application.properties sets `spring.jpa.open-in-view=false`. listSessions/listAssessments call `repo.findByInstrumentAndGroup(...)` and then iterate the returned PortalSession entities.

**Recommendation.** Annotate LiveTrackingService (or its public methods) with `@Transactional(readOnly = true)` so entity access happens inside an open persistence context, and keep returning DTOs rather than entities. Long-term, project directly to LiveSessionDto in the query to avoid holding entities at all.

**Verifier confirmed.** The structural facts cited are accurate: spring.jpa.open-in-view=false is set in application.properties, LiveTrackingService carries no @Transactional annotation at the class or method level, and PortalSession.answers/mqtScores/demographics are all @OneToMany (default LAZY) collections on a detached entity. findByInstrumentAndGroup returns full entities (not DTOs), so those entities are detached after the repository's implicit transaction closes.

However, the current code in listSessions and listAssessments exclusively accesses scalar columns on those detached entities (getId, getStatus, getRespondentId, getRespondentName, getRespondentEmail, getCreatedAt, getCompletedAt). None of the three lazy collections are touched anywhere in LiveTrackingService. The findAssessmentSummaries call returns a constructor-expression DTO (LiveAssessmentSummary), not entities, so there is zero lazy-load exposure on that path. HeartbeatService is Redis-only with no JPA involvement.

No LazyInitializationException can occur with the code as written. The finding is self-described as a latent landmine dependent on a future code change, and the auditor's own confidence is Medium. The recommendation to add @Transactional(readOnly=true) is sound best practice, but the stated Medium severity implies an existing production risk that does not currently exist. The correct classification is Low: a code hygiene concern worth fixing defensively, but not a confirmed present fault.

---
### [CON-11] AssessmentToken.qrPng get-or-create races: concurrent first downloads both generate and double-save the LOB

**Severity:** Low · **Dimension:** Concurrency · **Confidence:** Low

**Locations:** `service/AssessmentTokenService.java:124-138`, `model/AssessmentToken.java:67-69`

**Problem.** The 'generate exactly once' guarantee is a read-check-then-write with no lock or @Version. Two concurrent first-time QR requests both see qrCode==null, both render the PNG, and both write — the second blind UPDATE overwrites the first. No correctness corruption (bytes are equivalent) but the 'once' invariant and any future per-generation side effects are not actually serialised.

**Impact.** Wasted CPU generating the QR twice and a redundant LONGBLOB write; harmless today but the stated invariant is unenforced. If QR generation ever becomes side-effecting or rate-limited this becomes a real bug.

**Evidence.**

> `if (t.getQrCode() != null && t.getQrCode().length > 0) return t.getQrCode(); ... byte[] png = qrCodes.pngForText(link); t.setQrCode(png); tokens.save(t); return png;`

**Recommendation.** Acceptable to leave, but to truly enforce once-only, guard with a conditional update (`UPDATE ... SET qr_code = ? WHERE token = ? AND qr_code IS NULL`) or @Version, or pre-generate the QR at token issue time inside the issuing transaction.

**Verifier confirmed.** The evidence quote is accurate. Lines 124-138 of AssessmentTokenService.java implement a read-check-then-write: the method fetches the token, checks qrCode == null, generates the PNG, sets it, and calls tokens.save(). The AssessmentToken entity has no @Version field for optimistic locking, and the repository findById call uses no pessimistic lock. The class-level @Transactional uses the default READ_COMMITTED isolation (MySQL default), which does not prevent two concurrent transactions from each reading qr_code = NULL, independently generating the PNG, and both persisting. The race is real. However, its impact is strictly cosmetic: because QR generation is deterministic (same token string always yields the same PNG bytes), the second blind UPDATE merely overwrites with identical bytes. There is no data corruption, no user-visible error, and no security consequence. The "generate exactly once" invariant is an internal comment goal, not a functional requirement with observable adverse effects today. Severity Low is correct.

---
### [ENUM-01] Lifecycle/status fields modeled as free String with no DB constraint and inconsistent normalization (Assessment, PublishedQuestionnaire, User)

**Severity:** Low *(finder rated Medium)* · **Dimension:** Validation · **Confidence:** Medium

**Locations:** `model/Assessment.java:58-59`, `model/PublishedQuestionnaire.java:116-117`, `model/User.java:48-49,80-81`, `service/AssessmentService.java:244-250`, `service/AuthService.java:67-70`

**Problem.** State machines are stored as unconstrained varchars with the canonical/casing rules living only in scattered service code. There is no DB CHECK (MySQL VARCHAR, the DDL comment itself notes 'no DB-side check, validation in app'), no enum, and casing conventions differ across entities ('ACTIVE' vs 'Active' vs 'COMMITTED'). Some write paths (e.g. User.setStatus, PublishedQuestionnaire.setVersionStatus) are not funnelled through any validator.

**Impact.** Out-of-vocabulary or wrong-case status values can be persisted via any path that bypasses the one validator (e.g. seeding, migrations, direct setStatus). Because AuthService gates login on `equalsIgnoreCase("Active")` but AssessmentService normalizes to uppercase, status handling is inconsistent across entities, and version gating (DRAFT vs COMMITTED) has no enforced vocabulary, risking a draft being treated as committed.

**Evidence.**

> Assessment: `@Column(nullable = false, length = 16) private String status = "ACTIVE";` with comment 'Plain string instead of enum so adding a new state doesn't require a migration'. PublishedQuestionnaire: `private String versionStatus = "COMMITTED";`. User: `private String status = "Active";`. AssessmentService validates uppercase ACTIVE/CLOSED/PAUSED; AuthService checks `"Active".equalsIgnoreCase(u.getStatus())`.

**Recommendation.** Promote these to `@Enumerated(EnumType.STRING)` enums with a fixed vocabulary, or at minimum centralize a single normalize+validate for each and add a DB-level constraint where the engine allows (CHECK on MySQL 8.0.16+). Standardize casing per field. Validate on every write path, not only the REST update method.

**Verifier confirmed.** The structural evidence is confirmed: all three entities use plain `String` status fields with no DB CHECK constraint (the DDL comment at line 4 of 01-schema.sql explicitly acknowledges this), and the casing conventions differ across entities ("ACTIVE/CLOSED/PAUSED" for Assessment, "Active" for User, "DRAFT/COMMITTED" for PublishedQuestionnaire). The DDL for the `assessments` and `app_users` tables is generated by Hibernate `ddl-auto=update`, not in the init SQL, so no CHECK constraints exist there either.

However, the finding significantly overstates the impact. Reading all write paths:

1. Assessment.status: Both creation (`AssessmentService.create`, line 92) and status mutation (`AssessmentService.updateStatus`, line 159) route through `normaliseStatus()`, which validates and uppercases to ACTIVE/CLOSED/PAUSED. The `update()` method deliberately does not touch status. No unguarded write path exists in this service.

2. PublishedQuestionnaire.versionStatus: Every setter call in the entire codebase uses only the string literals "DRAFT" or "COMMITTED" (QuestionnaireVersioningService lines 267, 314; migration runner line 89; newDraft helper line 314). No external input flows directly into setVersionStatus.

3. User.status: All write paths (IdentityBootstrapRunner, PublicRegistrationService) hard-code "Active". There is no admin endpoint that allows arbitrary status values to be set on User. AuthService deliberately uses `equalsIgnoreCase("Active")` which provides tolerance.

The DatasetService.setStatus call (line 213) is on PortalSession, not on the three cited entities.

The finding's assertion that "some write paths (e.g. User.setStatus) are not funnelled through any validator" is technically true at the Java level (the public setter itself is unguarded), but in practice every caller hard-codes the canonical value, so the realistic exploitability is confined to seeding/migrations/direct DB access — not application request paths. The "draft being treated as committed" scenario has no demonstrated code path.

The issue is real as a code-quality concern (no DB constraint, public unguarded setters, inconsistent casing across entities), but the described impact is largely speculative given the actual call-site analysis. Severity should be Low rather than Medium.

---
### [TS-03] AuthService never updates last_login on successful login (last_login stays null forever)

**Severity:** Low · **Dimension:** Validation · **Confidence:** Medium

**Locations:** `service/AuthService.java:47-80`, `model/User.java:54-55`, `service/RespondentsService.java:103-130`

**Problem.** A last_login tracking column exists on the identity and respondent rows, but no code maintains it on the actual login path, so the lifecycle timestamp is never recorded.

**Impact.** last_login is permanently null/empty for every user and respondent, so any 'inactive account' reaping, last-seen reporting, or security review that depends on last_login is impossible. Minor because nothing currently reads it, but it is a silent dead field that will mislead future features.

**Evidence.**

> User has `@Column(name = "last_login") private String lastLogin;` but AuthService.login(...) issues a token and returns without ever calling `u.setLastLogin(...)` or saving. RespondentsService.login likewise never sets last_login.

**Recommendation.** Set `u.setLastLogin(now)` (ISO string to match the column type) and persist within the login transaction, or drop the column if it is intentionally unused. Note last_login is a String here while sessions.last_login etc. are TIMESTAMP — consider unifying to OffsetDateTime.

**Verifier confirmed.** The finding is confirmed by reading the source. User.java (line 54-55) declares `@Column(name = "last_login") private String lastLogin` with a corresponding getter/setter. AuthService.login() (lines 47-80) is annotated @Transactional, authenticates the user, issues a JWT token, and returns — it never calls `u.setLastLogin(...)` or persists any update to the User entity. RespondentsService.login() (lines 103-130) likewise never sets lastLogin on the Respondent. The only code that calls setLastLogin is PractitionersService.java, and only for CRUD management of practitioner records (not for any login event). The app_users table is absent from the DDL (01-schema.sql) because Hibernate ddl-auto=update creates it, but the mapped column still exists. The last_login column is therefore permanently null for every user login. Severity Low is correct: no existing code reads last_login to make access-control or reporting decisions, so the impact is a silent dead field that misleads future development rather than a current functional defect.

---
### [TS-04] New PublishedQuestionnaire versioning columns have no DB default; created via ddl-auto with Java-only defaults that diverge from the schema

**Severity:** Low · **Dimension:** Validation · **Confidence:** Low

**Locations:** `model/PublishedQuestionnaire.java:73-74,99-117,122-123`, `docker/mysql-init/01-schema.sql:322-341`

**Problem.** The default for version_status/version_major/version_minor/show_instructions lives only in Java field initializers; the columns ddl-auto adds carry no DB DEFAULT. Any row inserted via a path that does not go through the JPA entity (raw SQL, a future bulk import, replication) gets NULL for NOT NULL columns or a missing default. committed_at has no default and is only backfilled by the one-shot migration.

**Impact.** Rows created outside the JPA entity can violate the nullable=false expectation or default to wrong version state, e.g. a row defaulting to NULL version_status would be treated as neither DRAFT nor COMMITTED, breaking the commit/allot gate. Low because in practice all writes currently go through the entity.

**Evidence.**

> Entity declares `@Column(name="version_status", length=16, nullable=false) private String versionStatus = "COMMITTED";`, `versionMajor = 1`, `versionMinor = 0`, `show_instructions nullable=false`, plus `committed_at`, `parent_id`, etc. The 01-schema.sql published_questionnaires table (lines 322-341) contains NONE of these columns — they are added by ddl-auto.

**Recommendation.** Add these columns to 01-schema.sql with explicit DB defaults (`version_status VARCHAR(16) NOT NULL DEFAULT 'COMMITTED'`, `version_major INT NOT NULL DEFAULT 1`, `version_minor INT NOT NULL DEFAULT 0`, `show_instructions TINYINT(1) NOT NULL DEFAULT 0`) and an idempotent ALTER block for existing DBs, so the Java defaults and the DB defaults agree.

**Verifier confirmed.** The evidence checks out on all points. PublishedQuestionnaire.java (lines 73-74, 99-123) confirms version_status (nullable=false, default "COMMITTED"), version_major (nullable=false, default 1), version_minor (nullable=false, default 0), show_instructions (nullable=false), committed_at, parent_id, and the other versioning fields exactly as quoted. The CREATE TABLE in 01-schema.sql (lines 322-341) definitively has none of these columns — only the original 14 columns are defined there. application.properties confirms ddl-auto=update, which causes Hibernate to add the missing columns on startup without any DB DEFAULT clause. The QuestionnaireVersioningMigrationRunner.java handles the legacy-row backfill via JPA but does not solve the DDL gap. The practical risk is limited because all current writes go through the JPA entity (which supplies the Java-side defaults), but any path that bypasses JPA — raw SQL tooling, bulk imports, replication replay, or a DB initialized purely from 01-schema.sql before the app ever starts — would produce NULL values in NOT NULL columns or fail the insert entirely. The Low severity rating is correct: this is a latent maintenance hazard, not an active data-integrity failure.

---

## Appendix A — Full finding index
| ID | Severity | Dimension | Title |
|---|---|---|---|
| DDL-01 | Critical | DDL drift | Roughly half of all @Entity tables have no definition in the canonical DDL — created only by ddl-auto with zero FK constraints |
| SEC-01 | Critical | Security | Date-of-birth is the permanent login credential, stored and compared in plaintext (no hashing, ~13 bits entropy) |
| VER-01 | Critical | Versioning | upsert() deletes all same-named PublishedQuestionnaire rows — destroys committed, in-use versions when editing/cloning a draft |
| VER-02 | Critical | Versioning | Assessment.create never pins questionnaireVersionId — assessments are not bound to a specific published version |
| TS-01 | Critical | Validation | createdAt/updatedAt are insertable=false on tables Hibernate creates, so they are permanently NULL (no DB default ever generated) |
| TYPE-01 | High | Column types | All psychometric score columns stored as double (DOUBLE) instead of DECIMAL/BigDecimal |
| TYPE-02 | High | Column types | portal_sessions.score (overall result) stored as VARCHAR(255) free-text instead of a numeric type |
| TYPE-04 | High | Column types | Date-of-birth stored with three different types across person tables; the login credential dob is a free-text VARCHAR(255) |
| REL-01 | High | Relationships | Assessment has no association to its PortalSessions; delete() orphans every session and its answers/scores |
| REL-06 | High | Relationships | Canonical DDL is stale: none of the normalized child tables or their FK constraints exist in 01-schema.sql — every parent/child FK depends on ddl-auto=update, which never adds FKs to pre-existing tables |
| DDL-02 | High | DDL drift | portal_sessions retains legacy NOT NULL columns (instrument, respondent_name, language) that the entity treats as nullable — INSERTs will fail on upgraded DBs |
| DDL-04 | High | DDL drift | published_questionnaires is missing all versioning + instructions columns from the DDL; ddl-auto silently adds them with no FK on parent_id/branched_from |
| DDL-07 | High | DDL drift | measured_qualities.mqts JSON column dropped, but the new self-referential mqts tree table has no DDL and no FK constraints |
| PK-02 | High | Keys / Index | Hibernate-created tables get NO indexes on FK / hot-lookup columns that are mapped as plain @Column (not @ManyToOne) |
| SEC-02 | High | Security | No password hashing infrastructure exists; SecurityConfig defines no PasswordEncoder |
| SEC-04 | High | Security | JWT signing secret and DB passwords have hardcoded defaults committed in properties |
| SEC-05 | High | Security | Multi-tenant isolation absent: tenant FK missing on all identity/PII/session JPA tables; one tenant can read another's data |
| SEC-06 | High | Security | DOB credential is written to application logs in cleartext on every login attempt |
| SEC-07 | High | Security | All PII (names, emails, phone, DOB, demographics, answers) stored unencrypted with no data classification |
| SEC-08 | High | Security | Audit log has no tamper-evidence, nullable actor, and no tenant — integrity not guaranteed despite being the security record |
| SEC-09 | High | Security | JPA entities bound directly as request bodies enable mass-assignment / privilege bypass |
| VER-03 | High | Versioning | Respondent portal resolves questionnaire content by NAME, not by the pinned version id — reads a mutable, ambiguous target |
| VER-04 | High | Versioning | Version number assignment has a read-then-write race with no unique constraint — duplicate version labels under concurrent commits |
| VER-06 | High | Versioning | Canonical DDL is massively drifted: no parent/assessment/snapshot tables and no versioning columns — production schema exists only by ddl-auto=update |
| CON-01 | High | Concurrency | Token single-use / maxUses redemption is a lost-update race (read-modify-write, no lock, no @Version, no atomic UPDATE) |
| CON-02 | High | Concurrency | Per-(entity,assessment) session cap is enforced with a count-then-insert race |
| CON-03 | High | Concurrency | clear()+re-add of child collections collides with their UNIQUE constraint (Hibernate orphan-removal ordering): answer/score/demographic saves can fail or corrupt |
| CON-04 | High | Concurrency | No optimistic locking (@Version) on any entity — concurrent edits silently lost across the whole model |
| CON-05 | High | Concurrency | Concurrent member additions to entity_members / respondent_group_members lose updates (EAGER ElementCollection full-rewrite) |
| CON-06 | High | Concurrency | N+1 query explosion: list/dataset endpoints fetch all sessions then walk lazy child collections per row |
| SD-01 | High | Validation | Soft-delete tombstone ItemDisplayState.deleted is written but never read — 'deleted' items resurface everywhere |
| TS-02 | High | Validation | Audit log is ordered and timestamped by a column that is always NULL, silently breaking chronological audit |
| VAL-01 | High | Validation | PortalSession.status is a free String with no validation on the write path (Active/Completed/Pending Review accepted as anything) |
| TYPE-03 | Medium | Column types | Canonical DDL (01-schema.sql) still defines NOT-NULL JSON columns the entities no longer map — schema source-of-truth is stale and breaks fresh-DB inserts |
| TYPE-05 | Medium | Column types | last_login timestamps stored as String/VARCHAR instead of a timestamp type |
| REL-03 | Medium | Relationships | AssessmentToken->Assessment is a raw String FK with no cascade; deleting an Assessment orphans live registration tokens (and their QR blobs) |
| REL-04 | Medium | Relationships | respondent_groups.parent_id: DDL declares a self-FK with ON DELETE CASCADE, but the entity maps it as a plain String — no JPA awareness, and silent multi-level child deletion |
| REL-05 | Medium | Relationships | Self-referencing snapshot/MQ trees (Mqt, PublishedQuestionnaireMqt) cascade-delete via JPA but have no DB FK ordering; deletes depend entirely on Hibernate emitting child-first DELETEs |
| REL-07 | Medium | Relationships | EAGER @ElementCollection sets on instruments/items/published_questionnaires/groups/practitioners/roles load join tables on every entity read |
| DDL-03 | Medium | DDL drift | User entity maps to app_users (not in DDL) while DDL ships a conflicting, dead `users` table with NOT NULL tenant_id + FK |
| DDL-05 | Medium | DDL drift | instruments table keeps NOT NULL legacy columns and JSON columns dropped by the migration runner, while the entity adds an unmapped scoring_model the DDL lacks |
| DDL-06 | Medium | DDL drift | items table keeps legacy NOT NULL columns (stem) and JSON columns; entity normalizes options/sub_domains/languages into ddl-auto child tables with no FK |
| DDL-09 | Medium | DDL drift | ddl-auto-created @ElementCollection/join tables get default VARCHAR(255) FK columns mismatching the CHAR(36)/VARCHAR(64) parent keys — type/charset join mismatch and no FK |
| DDL-10 | Medium | DDL drift | Unique constraints declared via @UniqueConstraint/@Column(unique=true) are only honored on fresh tables — ddl-auto never adds them to existing tables; INSERT IGNORE migrations rely on them |
| DDL-11 | Medium | DDL drift | PortalSession adds assessment_id/entity_id/entity_name columns absent from DDL; assessment_id is a logical FK to a ddl-auto-only assessments table with no constraint |
| DDL-12 | Medium | DDL drift | EntityRegistration membership (entity_members) and User.user_entities reference plain respondent/entity ids with no FK; identity bootstrap relies on id-equality only |
| PK-03 | Medium | Keys / Index | entity_registrations.email has no unique constraint (entity- and DDL-level), unlike respondents/practitioners |
| PK-04 | Medium | Keys / Index | app_users.email uniqueness depends solely on the entity annotation; user_entities collection table has no FK and email collation makes findByEmailIgnoreCase semantically redundant/fragile |
| PK-06 | Medium | Keys / Index | Surrogate PKs (assessment, questionnaire, entity-registration) are built from an 8-hex-char truncated UUID — ~32 bits of entropy, collision-prone for a PRIMARY KEY |
| SEC-03 | Medium | Security | AssessmentToken (portal registration token) is stored in plaintext as the primary key |
| SEC-10 | Medium | Security | Security-critical tables (app_users, assessment_tokens, audit_log, etc.) absent from canonical DDL; ddl-auto=update never adds their unique/FK constraints |
| SEC-11 | Medium | Security | JWT accepted from query parameter, exposing god-mode tokens in logs/history/referrers |
| VER-07 | Medium | Versioning | Versioning backfill misclassifies pre-existing DRAFT snapshots as COMMITTED v1.0 and pins assessments to them |
| CON-08 | Medium | Concurrency | DatasetService 'optimistic concurrency' compares a client-echoed updated_at string instead of a real version — and is bypassable / racy |
| CON-10 | Medium | Concurrency | Allotment add is check-then-insert (existsById then save) — relies on a composite PK that ddl-auto may not have created |
| CNT-01 | Medium | Validation | Respondent.sessions_count (and last_assessment) are stored derived fields that are never updated when sessions are created — permanently stale |
| VAL-02 | Medium | Validation | Uniqueness for self-registration email relies only on an app-side SELECT; no DB unique constraint exists (ddl-auto never adds one) |
| VAL-03 | Medium | Validation | Entity-level NOT NULL / unique / email validation missing on Respondent and PortalSession key fields (only the hand-written DDL enforces it) |
| TYPE-06 | Low | Column types | items.irt_c is NOT NULL DEFAULT 0 in DDL but mapped as nullable Double in the entity |
| TYPE-07 | Low | Column types | instruments table carries two parallel scoring columns: stale NOT-NULL scoring_algorithm (DDL) plus ddl-auto-added scoring_model (entity) |
| TYPE-08 | Low | Column types | Status / version_status enums persisted as unconstrained free-text VARCHAR with no CHECK or enum type |
| TYPE-09 | Low | Column types | Respondent.companyId mapped but column absent from canonical DDL — created implicitly as VARCHAR(255) by ddl-auto |
| TYPE-10 | Low | Column types | AssessmentToken QR image uses @Lob + LONGBLOB, but @Lob on byte[] in MySQL/Hibernate can be misinterpreted as a streamed BLOB locator |
| DDL-08 | Low | DDL drift | OffsetDateTime mapped onto MySQL TIMESTAMP columns across many entities — offset/zone lost and DDL date types diverge from what ddl-auto emits |
| DDL-14 | Low | DDL drift | Legacy `sessions` table (with FKs) is DROP-ed by application code at runtime, not by DDL — schema source of truth diverges from runtime behavior |
| PK-01 | Low | Keys / Index | Opaque registration token is the PRIMARY KEY but lives in a case-insensitive / accent-insensitive collation (utf8mb4_unicode_ci) |
| PK-05 | Low | Keys / Index | Assessment.id PK is VARCHAR(255) but every referencing column (portal_sessions/assessment_tokens/allotment FKs) is VARCHAR(64) — type/length mismatch on the logical join key |
| PK-07 | Low | Keys / Index | Mqt / PublishedQuestionnaireMqt natural-key id columns carry no uniqueness or scoping guarantee within the JPA model |
| PK-08 | Low | Keys / Index | verticals.code and measured_qualities.name uniqueness exist only in hand-written DDL; the JPA entities omit them, so any Hibernate-created/upgraded environment loses the guarantee |
| VER-05 | Low | Versioning | Migration runners execute on EVERY boot inside one transaction with no run-once ledger; partial failure leaves split-brain JSON-vs-table data |
| VER-08 | Low | Versioning | Snapshot scoring/score rows reference live MQT ids as bare varchars with no copy of the value at publish time, so renaming/reusing an MQT id desynchronizes labels |
| VER-09 | Low | Versioning | Parent display fields (name/vertical) are denormalized and updated on commit, retroactively changing labels shown for old versions/assessments |
| CON-07 | Low | Concurrency | LiveTrackingService runs outside any transaction with open-in-view=false — fragile lazy access on detached entities |
| CON-11 | Low | Concurrency | AssessmentToken.qrPng get-or-create races: concurrent first downloads both generate and double-save the LOB |
| ENUM-01 | Low | Validation | Lifecycle/status fields modeled as free String with no DB constraint and inconsistent normalization (Assessment, PublishedQuestionnaire, User) |
| TS-03 | Low | Validation | AuthService never updates last_login on successful login (last_login stays null forever) |
| TS-04 | Low | Validation | New PublishedQuestionnaire versioning columns have no DB default; created via ddl-auto with Java-only defaults that diverge from the schema |

## Appendix B — Candidate findings rejected during verification
These were proposed by a finder but **dropped** when the adversarial verifier read the code and refuted them. Recorded for transparency.

- **[REL-02] ItemOption.scores is EAGER inside a LAZY Item.options collection — guaranteed N+1 / cartesian fetch on item reads**
  - *Why dropped:* All Item/ItemOption/ItemOptionScore reads go through native SQL (EntityManager.createNativeQuery) in ItemsService.attachItemOptions, which manually batch-fetches options and scores in two queries for the entire page at once. The EAGER annotation on ItemOption.scores is never exercised because no code path loads Item or ItemOption entities through the Hibernate entity graph. ItemRepository exists but is unused.
- **[REL-08] Bidirectional PortalSession children: inverse side never synced on read/build paths, and back-reference is set only in write helpers — fragile orphanRemoval contract**
  - *Why dropped:* All four child-entity construction sites (AssessmentsService lines 248, 301, 333 and DatasetService line 241) correctly call both setSession and parent-collection.add before the transaction commits. The raw collection setters on PortalSession are never invoked from service layer code — only DTO setters with the same name are called. The finding's own confidence is Low and its impact is labelled Latent; closer inspection reveals no actual desync path exists today. This is a speculative future-maintenance concern, not a genuine fault.
- **[CON-09] Session status flipped to Completed via the dataset cell-edit path does not clear the Redis heartbeat — Redis/DB live-tracking inconsistency**
  - *Why dropped:* LiveTrackingService already treats DB status as authoritative. listAssessments filters out Completed sessions before the heartbeat scan, and deriveLiveStatus checks DB status first — both guards mean a stale Redis heartbeat key from a dataset-path status edit has no effect on dashboard counts or session live-status display. The finding incorrectly assumes the heartbeat key is authoritative for completed detection.
- **[REL-13] No explicit ENGINE/charset on any CREATE TABLE — FK enforcement and join collations depend on server defaults for both DDL and ddl-auto tables**
  - *Why dropped:* The deployment target is mysql:8.0 where InnoDB is the immutable default storage engine, making the MyISAM/FK-silent-drop scenario impossible. The utf8mb4 charset divergence risk is also neutralised by MySQL's database-level charset inheritance — tables created inside the utf8mb4_unicode_ci database automatically inherit that collation. The finding's impact depends on a hypothetical non-default server configuration that does not exist in this project's docker-compose or any other configuration file.

## Appendix C — Methodology

The audit ran as a multi-agent workflow:

1. **Find (8 parallel lenses).** Eight independent reviewers each audited one dimension — entity relationships/cascade; column types & storage; primary/composite keys, uniqueness & indexes; snapshot/versioning integrity; transactions & concurrency; security & PII-at-rest; validation/lifecycle/defaults; and JPA-vs-DDL drift & referential integrity. Each compared the JPA mappings against `docker/mysql-init/01-schema.sql` and against enterprise MySQL/Hibernate practice.
2. **Verify (adversarial).** Every raw finding was handed to a *separate* reviewer instructed to **refute** it by reading the cited source. Only findings confirmed as genuine survive here (77 of 81).

**Caveats.** Line numbers are approximate (cite the symbol, then the line). Severities reflect impact on a production multi-tenant deployment. This audit covers **logical/design/entity/DB modeling** faults, not an exhaustive line-by-line security pen-test or a frontend review.
