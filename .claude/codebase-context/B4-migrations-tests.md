I'll read all the target files in full. Let me start with the largest and most complex ones.
Now let me read the remaining test files and resources.
All files read completely. Here is the dense structured report.

---

# V1 baseline schema — `V1__baseline_schema.sql`

MySQL DDL (Hibernate-generated + hand-appended hardening). All entity tables carry audit columns `createdAt datetime(6) NN`, `updatedAt datetime(6) NN`, `version bigint NN`, and (except join/value tables) `createdById bigint`, `updatedById bigint` (both FK→User.id). Soft-delete tables have `deletedAt datetime(6)`.

## Entity tables (32) — columns (name:type), business cols only unless noted
- **AnswerOption**: id:bigint auto PK; mediaType:varchar(30); mediaUrl:TEXT; sortOrder:int NN; text:TEXT; itemId:bigint NN
- **Assessment**: id PK; deletedAt; autoNext:bit NN; name:varchar(200) NN; status:enum(ACTIVE,CLOSED,PAUSED,TEST) NN; questionnaireId:bigint NN
- **AssessmentAttempt**: id PK; archivedAt; attemptNumber:int NN; completedAt; startedAt; status:enum(COMPLETED,IN_PROGRESS,NOT_STARTED) NN; sessionId:bigint NN
- **AssessmentGroupAllotment**: id PK; cap:int; assessmentId NN; groupId NN
- **AssessmentOrganizationAllotment**: id PK; cap:int; assessmentId NN; organizationId NN
- **AssessmentRespondentAllotment**: id PK; assessmentId NN; userId NN
- **AssessmentSession**: id PK; deletedAt; consentId:varchar(64); invitationSent:bit NN; language:varchar(8); name:varchar(200); proctoring:bit NN; showQuestionIndex:bit NN; assessmentId NN; groupId; organizationId; userId NN
- **DemographicField**: id PK; deletedAt; active:bit NN; fieldKey:varchar(128) NN; label:varchar(200) NN; placeholder:varchar(255); required:bit NN; type:enum(DATE,NUMBER,SELECT,TEXT,TEXTAREA) NN
- **DemographicFieldOption**: id PK; sortOrder:int NN; value:varchar(255) NN; fieldId NN
- **Item**: id PK; deletedAt; format:enum(FREE_TEXT,IMAGE_CHOICE,LIKERT,MATRIX,MCQ,RANKING,RATING_SCALE,SJT) NN; irtA/irtB/irtC:float(53); mediaType:varchar(30); mediaUrl:TEXT; riskFlag:bit NN; riskRule:TEXT; stem:TEXT; subDomain:varchar(150); validationStatus:enum(DRAFT,UNDER_REVIEW,VALIDATED) NN; previousItemId:bigint (self-FK, item versioning)
- **ItemUsageTraitScore**: id PK; value:float(53) NN; placementId NN; questionnaireItemId NN
- **MeasuredQuality**: id PK; deletedAt; description:TEXT; name:varchar(150) NN
- **MeasuredQualityTrait**: id PK; deletedAt; description:TEXT; name:varchar(150) NN
- **OptionUsageTraitScore**: id PK; value:float(53) NN; questionnaireItemOptionId NN; placementId NN
- **Organization**: id PK; deletedAt; contactEmail:varchar(255); contactName:varchar(150); contactPhone:varchar(20); name:varchar(200) NN; status:enum(ACTIVE,PENDING,SUSPENDED) NN; website:varchar(255)
- **OrganizationMember**: id PK; removedAt; organizationId NN; userId NN
- **Questionnaire**: id PK; deletedAt; isAdaptive:bit NN; ageRange:varchar(50); category:varchar(100); description:TEXT; durationMinutes:int; isFixedSequence:bit NN; name:varchar(200) NN; normStatus:varchar(50); scoringModel:varchar(32); shortName:varchar(50); tierRequired:varchar(50); usesWeightedScoring:bit NN; vertical:varchar(100); organizationId (nullable — global vs org-owned)
- **QuestionnaireChangeLog**: id PK; changeType:enum(DEMOGRAPHICS_CHANGED,ITEM_ADDED,ITEM_REMOVED,ITEM_REORDERED,ITEM_REPLACED,METADATA_UPDATED,OPTION_ORDER_CHANGED,SCORE_CHANGED,SECTION_CHANGED) NN; details:TEXT; questionnaireId NN
- **QuestionnaireDemographicField**: id PK; sortOrder:int NN; fieldId NN; questionnaireId NN
- **QuestionnaireItem**: id PK; sortOrder:int NN; itemId NN; questionnaireId NN; sectionId (nullable)
- **QuestionnaireItemOption**: id PK; displayOrder:int NN; optionId NN; questionnaireItemId NN
- **QuestionnaireSection**: id PK; sortOrder:int NN; title:varchar(200) NN; questionnaireId NN
- **RespondentGroup**: id PK; deletedAt; description:TEXT; name:varchar(150) NN; organizationId NN; parentGroupId (self-FK)
- **RespondentGroupMember**: id PK; removedAt; groupId NN; userId NN
- **Role**: id PK; description:TEXT; name:varchar(50) NN
- **SessionAnswer**: id PK; freeText:TEXT; attemptId NN; itemId NN
- **SessionAnswerOption**: id PK; rankOrder:int; answerId NN; optionId NN
- **SessionDemographic**: id PK; value:TEXT; attemptId NN; fieldId NN
- **SessionTraitScore**: id PK; value:float(53) NN; attemptId NN; placementId NN
- **TraitPlacement**: id PK; deletedAt; sortOrder:int NN; measuredQualityId NN; parentPlacementId (self-FK); traitId NN
- **User**: id PK; deletedAt; consent:bit NN; consentedAt; dob:date; email:varchar(255) NN; gender:varchar(20); lastLoginAt; name:varchar(150); phone:varchar(20); status:enum(ACTIVE,INACTIVE,SUSPENDED) NN; isSuperAdmin:bit NN
- **UserRole**: id PK; roleId NN; userId NN

## Value-collection tables (5) — composite PK, no audit cols
- **AssessmentLanguage**(assessmentId, language:varchar(8)) PK both; FK fkAssessmentLanguageAssessment→Assessment
- **ItemLanguage**(itemId, language:varchar(8)) PK both; FK fkItemLanguageItem→Item
- **OrganizationModule**(organizationId, module:varchar(128)) PK both; FK fkOrgModuleOrg→Organization
- **OrganizationVertical**(organizationId, vertical:varchar(128)) PK both; FK fkOrgVerticalOrg→Organization
- **RoleUrlPath**(roleId, urlPath:varchar(255)) PK both; FK fkRoleUrlPathRole→Role

## Unique constraints (named)
uqAttemptNumber(AssessmentAttempt sessionId,attemptNumber); uqAllotAssessmentGroup(assessmentId,groupId); uqAllotAssessmentOrg(assessmentId,organizationId); uqAllotAssessmentUser(assessmentId,userId); uqDemographicFieldKey(DemographicField fieldKey); uqItemUsagePlacement(ItemUsageTraitScore questionnaireItemId,placementId); uqOptionUsagePlacement(OptionUsageTraitScore questionnaireItemOptionId,placementId); uqQuestionnaireField(questionnaireId,fieldId); uqQuestionnaireItem(questionnaireId,itemId); uqUsageOption(QuestionnaireItemOption questionnaireItemId,optionId); uqRoleName(Role name); uqAnswerAttemptItem(SessionAnswer attemptId,itemId); uqAnswerOption(SessionAnswerOption answerId,optionId); uqDemographicAttemptField(attemptId,fieldId); uqScoreAttemptPlacement(SessionTraitScore attemptId,placementId); uqPlacementMqTrait(TraitPlacement measuredQualityId,traitId); uqUserEmail(User email); uqUserRole(userId,roleId).

## Indexes (non-unique)
idxOptionItem, idxAssessmentQuestionnaire, idxAllotGroupGroup, idxAllotOrgOrganization, idxAllotUserUser, idxSessionAssessment/User/Organization/Group, idxDemographicOptionField, idxItemPrevious, idxItemUsageScorePlacement, idxOptionUsageScorePlacement, idxOrgMemberOrg/User, idxQuestionnaireOrganization, idxChangeLogQuestionnaire, idxQuestionnaireFieldField, idxQuestionnaireItemQuestionnaire/Item/Section, idxUsageOptionOption, idxSectionQuestionnaire, idxGroupOrganization/Parent, idxGroupMemberGroup/User, idxAnswerItem, idxAnswerOptionOption, idxSessionDemographicField, idxScorePlacement, idxPlacementMq/Trait/Parent, idxUserRoleRole, idxLegacyIdMapNew.

## FK constraints
Every entity has Hibernate-hashed `createdById`/`updatedById`→User(id) (FK names like FKjit5q9…). Named business FKs (semantic): fkOptionItem, fkAssessmentQuestionnaire, fkAttemptSession, fkAllotGroupAssessment/Group, fkAllotOrgAssessment/Organization, fkAllotUserAssessment/User, fkSessionAssessment/Group/Organization/User, fkDemographicOptionField, fkItemPrevious (self), fkItemUsageScorePlacement/Usage, fkOptionUsageScoreOptionUsage/Placement, fkOrgMemberOrg/User, fkQuestionnaireOrganization, fkChangeLogQuestionnaire, fkQuestionnaireFieldField/Questionnaire, fkQuestionnaireItemItem/Questionnaire/Section, fkUsageOptionOption/Usage, fkSectionQuestionnaire, fkGroupOrganization, fkGroupParent (self), fkGroupMemberGroup/User, fkUserRoleRole/User, fkAnswerAttempt/Item, fkAnswerOptionAnswer/Option, fkSessionDemographicAttempt/Field, fkScoreAttempt/Placement, fkPlacementMq/Parent(self)/Trait, User self-FK createdBy/updatedBy.

## Hardening beyond JPA (hand-added composite FKs, lines 209-226)
- **TraitPlacement parent-same-MQ**: `uqPlacementIdMq unique(id, measuredQualityId)` + `fkPlacementParentSameMq FK(parentPlacementId, measuredQualityId) → TraitPlacement(id, measuredQualityId)` — a parent placement must be in the SAME MeasuredQuality.
- **RespondentGroup parent-same-org**: `uqGroupIdOrg unique(id, organizationId)` + `fkGroupParentSameOrg FK(parentGroupId, organizationId) → RespondentGroup(id, organizationId)` — parent group must be in the SAME Organization.
- Comment notes QuestionnaireItemOption same-item integrity is left as a service invariant (would need denormalized itemId on the edge).

## Migration-support tables (permanent, created in V1)
- **LegacyIdMap**(id bigint auto PK; entityType varchar(50) NN; legacyId varchar(128) NN; newId bigint NN; **uqLegacyIdMap unique(entityType, legacyId)**; index idxLegacyIdMapNew(entityType, newId)) — old-UUID→new-id memory.
- **MigrationNote**(id bigint auto PK; severity varchar(10) NN; entityType varchar(50); legacyId varchar(128); note text NN; createdAt timestamp(6) NN default current_timestamp(6)) — INFO/WARN/ERROR audit trail.

---

# V2 Java migration — `V2__Migrate_legacy_data.java` (Flyway `BaseJavaMigration`)

**Design principles**: never fail whole migration on one bad row (record MigrationNote, continue); every migrated row leaves a LegacyIdMap entry; identity silos fold into User deduped by email; positional option_index resolved once against option order.

**legacyDb placeholder mechanics**: `legacy = context.getConfiguration().getPlaceholders().get("legacyDb")` (set via `spring.flyway.placeholders.legacyDb`). All cross-schema reads are `select … from <legacy>.<table>`. `schemaExists()` queries `information_schema.schemata`; `tableExists()` queries `information_schema.tables` (both case-insensitive, scoped to legacy schema). **Graceful skip**: if `legacy` null/blank OR schema absent → writes INFO MigrationNote "Legacy schema '…' not found — data migration skipped" and returns (fresh installs get empty schema). Every `migrateX()` method also individually guards with `tableExists()` and returns early if the source table is missing (tolerates partial legacy schemas).

**id mapping**: `map(type, legacyId, newId)` caches in `idCache` (key `type:legacyId`) AND inserts LegacyIdMap row (skips if legacyId null). `idOf(type, legacyId)` checks cache then LegacyIdMap. **Idempotency**: Flyway runs V2 once (versioned). Within-run dedupe via `ensureRole`/`assignRole`/`insertUser` (email lookup). Not safe to re-run standalone (LegacyIdMap unique would collide). Migrated rows never set createdById/updatedById (all null — provenance not carried).

**Ordering (dependency chain)**: `migrateTaxonomy → migrateRolesAndUsers → migrateOrganizations → migrateGroups → migrateDemographicFields → migrateItemBankAndQuestionnaires → migrateAssessments → migrateSessions`.

### Step 1 — migrateTaxonomy
- **`measured_qualities`**(id,name,description) → **MeasuredQuality**. name fallback "Unnamed MQ". map type `MQ`.
- **`mqts`**(id,mq_id,parent_mqt_id,name,sort_order) → **MeasuredQualityTrait** (name, fallback "Unnamed trait", map `MQT_TRAIT`) + **TraitPlacement**(measuredQualityId,traitId,parentPlacementId,sortOrder; map `MQT_PLACEMENT`). **Topological insertion**: ArrayDeque, roots first; if parent's placement not yet mapped, re-queue (stall counter guards infinite loop, `stall <= queue.size()`). If owning MQ missing → WARN "Owning MQ missing — trait skipped". Leftover queue after stall → WARN "Unresolvable parent chain — trait skipped".

### Step 2 — migrateRolesAndUsers
- Seeds 3 roles via `ensureRole` (idempotent by name): **admin** (path `/api/v2/**`), **practitioner** (auth/taxonomy/items/questionnaires/assessments/delivery/demographic-fields paths), **respondent** (auth, delivery). RoleUrlPath rows inserted per path. Comment: BootstrapDataRunner later leaves these alone.
- **`app_users`**(id,email,dob,status,is_super_admin) + optional **`user_meta`**(name,phone,gender,consent joined on user_id) → **User**, assignRole admin. superAdmin = truthy(is_super_admin) OR bool(is_super_admin).
- **`practitioners`**(id,name,email,phone,dob) → **User**, assignRole practitioner. dob handles java.sql.Date or string parse.
- **`respondents`**(id,name,email,phone,dob,consent) → **User**, assignRole respondent.
- **`insertUser`** (dedupe): effectiveEmail = `<entityType lower>-<legacyId>@migration.local` if email blank (+WARN "No email — placeholder assigned"). Looks up `User where lower(email)=lower(?)`; if exists → reuse id + INFO "Merged into existing user N by email" (does NOT update existing fields); else INSERT User(status ACTIVE, isSuperAdmin, name, phone, gender, consent, consentedAt=now if consent). Always `map(entityType, legacyId, newId)`. Note: a merged user accumulates roles from every silo (assignRole dedups via UserRole existence check).

### Step 3 — migrateOrganizations
- **`entity_registrations`**(id,name,company_name,official_email,phone,org_name,org_website,active) → **Organization**. orgName = company_name ?? org_name ?? name ?? "Unnamed organization". contactName=name, contactEmail=official_email, contactPhone=phone, website=org_website, status = active?ACTIVE:PENDING. map `ENTITY`.
- **`entity_members`**(entity_id,respondent_id) → **OrganizationMember** (idOf ENTITY + RESPONDENT; WARN "Unresolved org/user — skipped" if either missing).
- **`entity_verticals`**(entity_id,vertical) → **OrganizationVertical** via `copyValueList` (skips if owner unmapped).
- **`entity_platform_modules`**(entity_id,module) → **OrganizationModule** via `copyValueList`.

### Step 4 — migrateGroups
- **`respondent_groups`**(id,name,description,parent_id) → **RespondentGroup**. Legacy groups had no org: creates ONE "Legacy Unassigned" Organization (status ACTIVE) up front + WARN "Legacy groups had no organization — all placed under 'Legacy Unassigned' (id N); re-home them". Pass 1 inserts rows (name fallback "Unnamed group", map `GROUP`); pass 2 sets parentGroupId via UPDATE (WARN "Parent group missing — left at top level" if unresolved).
- **`respondent_group_members`**(group_id,respondent_id) → **RespondentGroupMember** (silent skip if unresolved).
- **`respondent_group_instruments`**: **NOT migrated** — INFO note "respondent_group_instruments not migrated — allotments are the only assignment path now".

### Step 5 — migrateDemographicFields
- **`demographic_fields`**(id,field_key,label,type,required,placeholder,sort_order,active) → **DemographicField**. type uppercased, validated against {TEXT,NUMBER,DATE,SELECT,TEXTAREA}; unknown → TEXT + WARN. key fallback "field-<id>", label fallback to key. map `DEMOFIELD` (by id) AND `DEMOFIELD_KEY` (by key — used later by session demographics).
- **`demographic_field_options`**(option_value where field_id=?) → **DemographicFieldOption** (sortOrder synthesized 0,1,2… since legacy was a Set — "order was never real").

### Step 6 — migrateItemBankAndQuestionnaires
- **`instruments`**(id,name,short_name,category,vertical,description,duration_minutes,tier_required,is_adaptive,is_fixed_sequence,norm_status,age_range,uses_weighted_scoring,scoring_model) → **Questionnaire** (name fallback "Unnamed questionnaire"). map `INSTRUMENT`.
- Item source table detected: `items` else `item` else return.
- **`items`/`item`**(id,instrument_id,item_format,stem,media_url,media_type,irt_a/b/c,validation_status,clinical_risk_flag,risk_flag_rule,sub_domain,sequence_order) → **Item**. format uppercased + space→underscore, validated against {MCQ,RATING_SCALE,LIKERT,SJT,FREE_TEXT,IMAGE_CHOICE,RANKING,MATRIX}; unknown → MCQ + WARN. validationStatus logic: null→DRAFT; contains "VALID" AND not startsWith "NON" → VALIDATED; equalsIgnoreCase "UNDER_REVIEW" → UNDER_REVIEW; else DRAFT. riskFlag=bool(clinical_risk_flag). map `ITEM`.
  - **`item_languages`**(language where item_id=?) → **ItemLanguage**.
  - **`item_options`**(id,sort_order,text,media_url,media_type where item_id=? order by sort_order) → **AnswerOption**. map `OPTION`.
  - Then **QuestionnaireItem** usage: idOf INSTRUMENT(instrument_id); if null → WARN "No owning instrument — item kept in bank, no usage created" (item still migrated, continue). Else insert QuestionnaireItem(sortOrder=sequence_order), map `USAGE` (keyed by item legacyId), then **INSERT…SELECT** full option coverage: `insert into QuestionnaireItemOption(... questionnaireItemId, optionId, displayOrder) select 0,?,?,?,id,sortOrder from AnswerOption where itemId=?`.
- **`item_question_scores`**(item_id,mqt_id,score) → **ItemUsageTraitScore** (idOf USAGE(item_id) + MQT_PLACEMENT(mqt_id); WARN "Unresolved usage/placement — skipped").
- **`item_option_scores`**(option_id,mqt_id,score) → **OptionUsageTraitScore**. Resolves option→QuestionnaireItemOption via `scalar select id from QuestionnaireItemOption where optionId=?`; WARN if unresolved.
- **`questionnaires`** (legacy "families")(id,name) → matched by name to an existing Questionnaire: `scalar select id from Questionnaire where lower(name)=lower(?)`. If match → map `FAMILY` (NO new row created, just a LegacyIdMap alias). If no match → WARN "No instrument matches family name '…' — assessments referencing it will be skipped".

### Step 7 — migrateAssessments
- **`assessments`**(id,name,questionnaire_id,status,auto_next,language) → **Assessment**. Resolves questionnaireId via idOf FAMILY(questionnaire_id) THEN fallback idOf INSTRUMENT(questionnaire_id). If both null → **ERROR** "Questionnaire unresolvable — assessment skipped (manual fix needed)" + continue. status uppercased, validated {ACTIVE,CLOSED,PAUSED,TEST}, unknown→ACTIVE. map `ASSESSMENT`. language (non-blank) → **AssessmentLanguage** (truncated to 8 chars).
- `migrateAllotment` (generic helper) for 3 legacy tables:
  - **`assessment_entity_allotments`**(assessment_id,entity_id,cap) → **AssessmentOrganizationAllotment**(organizationId) WITH cap (idOf ENTITY).
  - **`assessment_group_allotments`**(assessment_id,group_id) → **AssessmentGroupAllotment**(groupId), no cap (idOf GROUP).
  - **`assessment_respondent_allotments`**(assessment_id,respondent_id) → **AssessmentRespondentAllotment**(userId), no cap (idOf RESPONDENT).
  - Each: WARN "…row skipped — unresolved refs" if assessment or target unmapped.

### Step 8 — migrateSessions
- **`portal_sessions`**(id,assessment_id,respondent_id,entity_id,group_id,language,name,consent_id,proctoring,invitation_sent,show_question_index,status,started_at,completed_at) → **AssessmentSession** + **AssessmentAttempt**. Requires idOf ASSESSMENT + RESPONDENT; else WARN "Unresolved assessment/respondent — session skipped". organizationId=idOf ENTITY(entity_id), groupId=idOf GROUP(group_id) (nullable). language truncated to 8. map `SESSION`. Then AssessmentAttempt(attemptNumber=1): status = "Completed"(ci)→COMPLETED else started_at!=null→IN_PROGRESS else NOT_STARTED; startedAt/completedAt carried. map `ATTEMPT` (keyed by session legacyId).
- **`assessment_answers`**(session_id,question_id,option_index,free_text) → **SessionAnswer** (+ optional **SessionAnswerOption**). idOf ATTEMPT(session_id) + ITEM(question_id); WARN "Answer skipped — question id does not map to a bank item". Insert SessionAnswer(freeText). If option_index != null: **positional resolution** `scalar select id from AnswerOption where itemId=? order by sortOrder limit 1 offset <index>`. If null → WARN "option_index N out of range — selection dropped"; else insert SessionAnswerOption(answerId,optionId).
- **`portal_session_mqt_scores`**(session_id,mqt_id,score) → **SessionTraitScore** (idOf ATTEMPT + MQT_PLACEMENT; WARN "Unresolved refs — score skipped").
- **`portal_session_demographics`**(session_id,field_key,value) → **SessionDemographic** (idOf ATTEMPT + **DEMOFIELD_KEY**(field_key); WARN "Unresolved refs — skipped").

### Helper SQL patterns / plumbing
`rows()` (PreparedStatement→List<Map> lowercased col labels), `row()` (first or null), `scalar()` (Long, casts Number), `insert()` (RETURN_GENERATED_KEYS→long), `exec()` (executeUpdate), `bind()` (setObject). Converters: `str` (trim, empty→null), `fallback`, `bool` (Boolean/Number!=0/truthy-string), `truthy` (true/1/yes/y), `intOr`, `dbl`, `parseDate` (ISO first-10-chars; WARN "Unparseable dob '…' — left null"), `now()` (Timestamp.now). All legacy tables read (complete list): measured_qualities, mqts, app_users, user_meta, practitioners, respondents, entity_registrations, entity_members, entity_verticals, entity_platform_modules, respondent_groups, respondent_group_members, respondent_group_instruments(existence-checked only, INFO), demographic_fields, demographic_field_options, instruments, items/item, item_languages, item_options, item_question_scores, item_option_scores, questionnaires, assessments, assessment_entity_allotments, assessment_group_allotments, assessment_respondent_allotments, portal_sessions, assessment_answers, portal_session_mqt_scores, portal_session_demographics.

---

# Tests

### SchemaGenerationTest (`domain/`)
Proves the entire JPA model builds and DDL-generates offline. Uses `Persistence.generateSchema("bodh-domain", props)` with dialect MySQLDialect, `hibernate.temp.use_jdbc_metadata_defaults=false` (never touches JDBC/live conn), schema-generation database.action=none, scripts.action=create → writes `target/generated-schema.sql`. Asserts EXPECTED_TABLES=**37** `create table ` occurrences (case-insensitive count; comment: 32 entity + 5 value-collection tables = ItemLanguage, RoleUrlPath, OrganizationVertical, OrganizationModule, AssessmentLanguage). Asserts DDL contains `fkPlacementMq` (named FKs), `uqQuestionnaireItem` (named uniques), `createdById` (audit provenance cols). Broken mapping → generateSchema throws. Generated file doubles as raw material for the Flyway baseline. persistence.xml `bodh-domain` unit lists exactly 32 entity classes (packages: taxonomy(3), item(2), questionnaire(8), people(7), assessment(6), delivery(6)), `exclude-unlisted-classes=true`.

### ApiV2ApplicationTests (`v2/`)
Phase-3 smoke: `@SpringBootTest` boots FULL context on **H2** with `jdbc:h2:mem:bodh;MODE=MySQL;DATABASE_TO_LOWER=FALSE;NON_KEYWORDS=USER,VALUE;DB_CLOSE_DELAY=-1`, ddl-auto=create-drop, `spring.flyway.enabled=false`. Single `contextLoads()` test — proves every entity DDL's, every repository query method parses/validates, every service/controller wires. NON_KEYWORDS=USER,VALUE because those are MySQL-legal but H2-reserved identifiers.

### AuthFlowTest (`v2/`)
End-to-end security proof on H2 (`jdbc:h2:mem:bodhauth;…` same flags, flyway disabled). `@AutoConfigureMockMvc`. `@BeforeEach` seeds admin@test.bodh (ROLE_ADMIN, superAdmin=true) + taker@test.bodh (ROLE_RESPONDENT) via UserService.createUser (dob 1990-05-14). Tests:
- `anonymousIsRejectedWith401`: GET /api/v2/users → 401.
- `wrongDobIsRejected`: login with wrong dob → 401 (email+dob is the credential).
- `adminLogsInAndReachesAdminEndpoints`: login→JWT; GET /users, /taxonomy/mqs → 200; /auth/me → 200 & jsonPath $.email = admin.
- `respondentIsScopedByRolePaths`: respondent JWT reaches /delivery/sessions/999999 → **404** (proves it passed security), but /users & /taxonomy/mqs → **403**.
- `writesRecordTheAuthenticatedUserAsCreatedBy`: POST /taxonomy/mqs with admin JWT → 201; loads MQ, asserts createdBy != null and equals admin's id (JWT principal audited into createdBy).
- `login()` posts {email,dob} to /api/v2/auth/login, extracts `token` from JSON.

### FlywayMigrationTest (`v2/`)
End-to-end migration proof. `@SpringBootTest` + `@ContextConfiguration(initializers=LegacyFixture.class)` on H2 (`jdbc:h2:mem:bodhmig;…`), ddl-auto=**none**, `spring.flyway.enabled=true`, `spring.flyway.placeholders.legacyDb=legacy`. **Infrastructure trick**: `LegacyFixture` ApplicationContextInitializer opens a JDBC connection to the SAME in-memory URL and runs `/legacy-fixture.sql` via `org.h2.tools.RunScript` BEFORE Spring/Flyway start (DB_CLOSE_DELAY=-1 keeps the mem DB alive across connections). Flyway then runs V1 (schema+hardening) and V2 (data migration). Tests + key assertions:
- `identitySilosFoldIntoUsersWithEmailDedupe`: **4** Users (au-1,p-1,r-1,r-2; r-3 merges into au-1 by shared email admin@legacy.test — asserts LegacyIdMap RESPONDENT/r-3 newId == admin id). r-2 (blank email) → placeholder `respondent-r-2@%` + WARN note for r-2. UserRole: 1 admin, **3 respondent** (r-1,r-2,r-3→au-1, so admin user also carries respondent role).
- `taxonomyBecomesLibraryPlusPlacements`: 1 MQ, 2 traits, 2 placements; 'Working Memory' placement nests under 'Memory' placement in same MQ.
- `itemBankAndUsagesMigrateWithScores`: 1 Questionnaire, 2 Items, 2 AnswerOptions, 2 QuestionnaireItems, 2 QuestionnaireItemOptions (full coverage, MCQ only), 1 ItemUsageTraitScore, 1 OptionUsageTraitScore, 1 Item VALIDATED, 1 ItemLanguage.
- `assessmentResolvesFamilyByNameAndCarriesAllotments`: 1 Assessment; LegacyIdMap FAMILY/f-1 not null (family 'resilience scale' matched instrument 'Resilience Scale' case-insensitively); 1 AssessmentLanguage; AssessmentOrganizationAllotment cap=10; 1 AssessmentRespondentAllotment.
- `sessionsAnswersAndResultsSurvive`: 1 AssessmentSession, 1 COMPLETED AssessmentAttempt, 2 SessionAnswers; option_index 1 resolved to sortOrder-1 option 'Often'; freeText 'It was rough but fine' present; SessionTraitScore value 12.5; 1 SessionDemographic.
- `organizationsAndGroupsMigrate`: **2** Organizations (Acme Corp ACTIVE + 'Legacy Unassigned'); 1 OrganizationMember; group under Legacy Unassigned; 1 RespondentGroupMember.
- `demographicRegistryMigrates`: DemographicField fieldKey 'age_group' type SELECT; 2 DemographicFieldOptions.

---

# legacy-fixture.sql (synthetic legacy world)

DROP/CREATE schema `legacy`, then snake_case tables + edge-case rows:
- **measured_qualities**: mq-1 Cognition.
- **mqts**: mqt-1 Memory (root), mqt-2 Working Memory (child of mqt-1) — tests topo ordering.
- **app_users**: au-1 admin@legacy.test, dob 1980-01-01, status Active, is_super_admin TRUE.
- **user_meta**: au-1 → Legacy Admin, phone 111, gender NULL, consent 'yes'.
- **practitioners**: p-1 Dr. Prac prac@legacy.test, dob as DATE type (tests java.sql.Date branch).
- **respondents**: r-1 taker@legacy.test (clean); **r-2 NULL email + 'not-a-date' dob** (placeholder email + unparseable-dob WARN); **r-3 admin@legacy.test** (duplicate email → merges into au-1).
- **entity_registrations**: e-1 company_name 'Acme Corp', official_email hr@acme.test, org_website acme.test, active TRUE, org_name NULL (tests company_name precedence).
- **entity_members**: e-1↔r-1.
- **respondent_groups**: g-1 Cohort A (parent_id NULL) — orphan/no-org group.
- **respondent_group_members**: g-1↔r-1.
- **demographic_fields**: df-1 age_group, type 'select' (lowercase → SELECT), required TRUE.
- **demographic_field_options**: df-1 → '18-25', '26-35'.
- **instruments**: i-1 'Resilience Scale' RS, scoring_model MQ_MQT, is_fixed_sequence TRUE.
- **items**: it-1 MCQ 'validated' (lowercase→VALIDATED) seq 1; it-2 FREE_TEXT DRAFT seq 2.
- **item_options**: 100 (it-1, sort 0, 'Never'); 101 (it-1, sort 1, 'Often') — BIGINT ids.
- **item_question_scores**: it-1↔mqt-1 score 1.5.
- **item_option_scores**: option 101↔mqt-2 score 2.0.
- **item_languages**: it-1 'English'.
- **questionnaires** (family): f-1 'resilience scale' (lowercase — tests case-insensitive name match to instrument).
- **assessments**: a-1 'Spring Drive', questionnaire_id 'f-1' (resolves via FAMILY→instrument), status ACTIVE, auto_next TRUE, language 'English'.
- **assessment_entity_allotments**: a-1↔e-1 cap 10.
- **assessment_respondent_allotments**: a-1↔r-1 (no cap).
- **portal_sessions**: s-1 (a-1, r-1, e-1, group NULL), status 'Completed', started 2026-01-01 10:00, completed 10:25.
- **assessment_answers**: (s-1,it-1,option_index=1,NULL) → resolves to 'Often'; (s-1,it-2,NULL,'It was rough but fine') → free-text.
- **portal_session_mqt_scores**: s-1↔mqt-1 score 12.5.
- **portal_session_demographics**: s-1 field_key 'age_group' value '26-35' (resolves via DEMOFIELD_KEY).

**Edge cases planted**: email-dedupe merge (r-3), blank-email placeholder + unparseable dob (r-2), lowercase type/format/status normalization, family-name case-insensitive match, orphan group → Legacy Unassigned org, positional option_index resolution, company_name-over-name org naming, mixed dob types (DATE vs VARCHAR). NOT in fixture: entity_verticals, entity_platform_modules, respondent_group_instruments, assessment_group_allotments, questionnaire families with no match — these code paths exist but are untested by fixture.

---

# SYNTHESIS — coverage & blind spots

**Legacy tables MIGRATED (target):**
| Legacy | Target | Notes |
|---|---|---|
| measured_qualities | MeasuredQuality | |
| mqts | MeasuredQualityTrait + TraitPlacement | topo-ordered |
| app_users (+user_meta) | User (admin role) | email dedupe |
| practitioners | User (practitioner role) | |
| respondents | User (respondent role) | |
| entity_registrations | Organization | |
| entity_members | OrganizationMember | |
| entity_verticals | OrganizationVertical | code-only, untested |
| entity_platform_modules | OrganizationModule | code-only, untested |
| respondent_groups | RespondentGroup (+synthetic "Legacy Unassigned" Org) | |
| respondent_group_members | RespondentGroupMember | |
| demographic_fields | DemographicField | |
| demographic_field_options | DemographicFieldOption | synthetic sortOrder |
| instruments | Questionnaire | |
| items/item | Item + QuestionnaireItem + QuestionnaireItemOption | |
| item_languages | ItemLanguage | |
| item_options | AnswerOption | |
| item_question_scores | ItemUsageTraitScore | |
| item_option_scores | OptionUsageTraitScore | |
| questionnaires (families) | (name-alias → Questionnaire) | no new rows, LegacyIdMap FAMILY only |
| assessments | Assessment (+AssessmentLanguage) | |
| assessment_entity_allotments | AssessmentOrganizationAllotment | with cap |
| assessment_group_allotments | AssessmentGroupAllotment | code-only, untested |
| assessment_respondent_allotments | AssessmentRespondentAllotment | |
| portal_sessions | AssessmentSession + AssessmentAttempt | |
| assessment_answers | SessionAnswer (+SessionAnswerOption) | positional resolve |
| portal_session_mqt_scores | SessionTraitScore | |
| portal_session_demographics | SessionDemographic | via DEMOFIELD_KEY |

**Legacy tables NOT migrated (explicit):**
- **respondent_group_instruments** — intentionally dropped (INFO note): group→instrument assignments discarded; allotments are the only assignment path in the new model. This is a real data-loss point (group-level instrument scoping is gone unless re-created as allotments).

**New-model tables that receive NO legacy data (no source):**
- **QuestionnaireSection** — never populated; all migrated QuestionnaireItem.sectionId = null (legacy had no sections).
- **QuestionnaireDemographicField** — never populated; instrument→demographic-field associations are not migrated (lost link; SessionDemographic still resolves fields globally by key).
- **QuestionnaireChangeLog** — never populated (audit history not carried).

**Known blind spots / risks:**
1. **Provenance not carried**: every migrated row has createdById/updatedById = null (V2 inserts omit them). Audit trail begins at cutover.
2. **Item.previousItemId (version chains)** never set — item-versioning lineage flattened; each legacy item is standalone.
3. **User merge is lossy**: `insertUser` reuses an existing user by email WITHOUT updating name/phone/dob/gender/consent — the FIRST silo's fields win; later silos' attribute values silently discarded (only roles accumulate). Merge order = app_users → practitioners → respondents.
4. **Positional option_index resolution** (`offset` into sortOrder) is a one-time snapshot — correct only if AnswerOption.sortOrder matches the legacy positional index; any legacy option-order drift would silently mis-map a selected answer. Out-of-range → selection dropped (WARN), answer row still kept.
5. **Family-by-name match** is a case-insensitive exact-name heuristic; families whose name doesn't exactly match an instrument get no mapping → downstream assessments referencing them are ERROR-skipped.
6. **item_option_scores → OptionUsageTraitScore** assumes exactly one QuestionnaireItemOption per legacy option (`scalar … where optionId=?`); holds because each item maps to a single instrument-questionnaire, but would break if an item were reused across questionnaires.
7. **Not re-runnable**: LegacyIdMap uqLegacyIdMap unique makes a second V2 pass collide; safe only under Flyway's once-only versioning.
8. **language truncation** to 8 chars (e.g. 'English' fits, but longer locale strings silently cut).
9. **Fixture coverage gaps**: entity_verticals, entity_platform_modules, assessment_group_allotments, respondent_group_instruments INFO path, no-family-match WARN path, ASSESSMENT ERROR path, and the item-source `item` (singular) table-name fallback are all exercised only by code, never by the test fixture — untested branches.
