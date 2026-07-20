I'll enumerate all Java files in the target directories first.
I'll read all 43 files in full. Starting with base and auditing directories.
Now the taxonomy directory.
Now the item directory.
Now the questionnaire directory (9 files).
Now the people directory (9 files).
Now the assessment directory (8 files).
Now the delivery directory (7 files).
All 44 files read in full. Structured data below.

---

## base/

### BaseEntity.java (domain.base)
- Kind: `@MappedSuperclass`, abstract, `implements Serializable`, `@EntityListeners(AuditingEntityListener.class)`. Root of ALL entities.
- Fields:
  - `id` col `id`, `Long`, `@Id @GeneratedValue(IDENTITY)`.
  - `version` col `version`, `Long`, `@Version`, nullable=false (optimistic locking).
  - `createdAt` col `createdAt`, `OffsetDateTime`, `@CreationTimestamp`, nullable=false, updatable=false.
  - `updatedAt` col `updatedAt`, `OffsetDateTime`, `@UpdateTimestamp`, nullable=false.
  - `createdBy` col `createdById`, `User`, `@CreatedBy @ManyToOne(LAZY)`, updatable=false. Nullable (no explicit nullable set; FK unnamed by design).
  - `updatedBy` col `updatedById`, `User`, `@LastModifiedBy @ManyToOne(LAZY)`. Nullable.
- Methods: getters/setters (no setters for createdAt/updatedAt — read-only). `equals`: id-based identity, unsaved entities equal only to themselves, requires same `getClass()`. `hashCode` = `getClass().hashCode()`.
- Rules (javadoc): provenance FKs filled from authenticated user via AuditorAware; services never set them. Provenance FKs left unnamed here (an explicit @ForeignKey name in a @MappedSuperclass collides across subclass tables); Flyway names them per table at cutover. createdBy/updatedBy nullable by design.
- Flag: audit user columns nullable (records "no actor" for batch/migration/tests).

### SoftDeletableEntity.java (domain.base)
- Kind: `@MappedSuperclass`, abstract, `extends BaseEntity`.
- Field: `deletedAt` col `deletedAt`, `OffsetDateTime`, nullable.
- Methods: `isDeleted()` = deletedAt!=null; `moveToBin(when)` sets deletedAt; `restoreFromBin()` nulls it.
- Rules (javadoc): recycle-bin semantics, nothing physically deleted. Subtree bin/restore cascades are service-layer responsibility; DB backstop is `ON DELETE RESTRICT` on referencing FKs. NO global Hibernate filters — repositories query liveness explicitly.

## auditing/

### CurrentUserResolver.java (domain.auditing)
- Kind: interface, `@FunctionalInterface`. Single method `Optional<User> currentUser()`. Bridge to host app's auth; domain stays security-framework agnostic; API module implements at cutover.

### DomainAuditingConfig.java (domain.auditing)
- Kind: config. `@Configuration @EnableJpaAuditing(auditorAwareRef = "domainAuditorAware")`.
- Bean `domainAuditorAware` (`AuditorAware<User>`): pulls optional `CurrentUserResolver` via `ObjectProvider.getIfAvailable()`; returns `Optional.empty()` when no resolver present. No DateTimeProvider (timestamps stay with Hibernate). Auditing records no actor when unauthenticated.

## taxonomy/

### MeasuredQuality.java (domain.taxonomy)
- Kind: entity, `@Table(name="MeasuredQuality")`, extends **SoftDeletableEntity**.
- Fields: `name` col `name` String nn len150; `description` col `description` String TEXT nullable.
- `placements` `@OneToMany(mappedBy="measuredQuality", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` List<TraitPlacement>. Holds ALL placements of this MQ (roots have parent==null); root-only views are repo queries, not filtered mapping (compiles on Hibernate 5 & 6).
- Helpers: `addPlacement`/`removePlacement` maintain both sides.
- Top-level psychometric construct (MQ). **Owns** entire per-MQ trait tree via TraitPlacement.

### MeasuredQualityTrait.java (domain.taxonomy)
- Kind: entity, `@Table(name="MeasuredQualityTrait")`, extends **SoftDeletableEntity**.
- Fields: `name` col `name` String nn len150; `description` col `description` String TEXT nullable.
- Rules: pure library node shared across MQs — NO parent, NO MQ link (context comes from TraitPlacement). Names deliberately NOT unique (product choice). Soft-delete keeps historical score rows labelled forever.

### TraitPlacement.java (domain.taxonomy)
- Kind: entity, extends **SoftDeletableEntity**.
- `@Table(name="TraitPlacement")`, uniqueConstraint `uqPlacementMqTrait`(measuredQualityId, traitId); indexes idxPlacementMq(measuredQualityId), idxPlacementTrait(traitId), idxPlacementParent(parentPlacementId).
- Fields:
  - `measuredQuality` `@ManyToOne(LAZY, optional=false)` FK col `measuredQualityId` nn, FK `fkPlacementMq`.
  - `trait` `@ManyToOne(LAZY, optional=false)` FK col `traitId` nn, FK `fkPlacementTrait`.
  - `parent` `@ManyToOne(LAZY)` FK col `parentPlacementId` nullable, FK `fkPlacementParent` (self-ref).
  - `children` `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` List<TraitPlacement>.
  - `sortOrder` col `sortOrder` `int` nn.
- Methods: `isRoot()`=parent==null; `addChild()` sets parent AND propagates `measuredQuality` to child; `removeChild()` nulls parent only.
- Rules (javadoc): the "context edge" — every scoring row references a placement, never a bare trait (shared trait can't double-count across MQs). Two rules the mapping can't express: (1) parent placement must belong to same MQ — Flyway adds composite FK (parentPlacementId, measuredQualityId)→(id, measuredQualityId) at cutover; (2) tree must stay acyclic (service check).

## item/

### Item.java (domain.item)
- Kind: entity, `@Table(name="Item")`, index idxItemPrevious(previousItemId), extends **SoftDeletableEntity**.
- Fields:
  - `format` `@Enumerated(STRING)` col `format` nn len30 `ItemFormat`.
  - `stem` col `stem` String TEXT nullable.
  - `mediaUrl` col `mediaUrl` String TEXT nullable.
  - `mediaType` col `mediaType` String len30 nullable.
  - `previousItem` `@ManyToOne(LAZY)` FK col `previousItemId` nullable, FK `fkItemPrevious` (self-ref lineage; NULL=original, set=born by editing).
  - `options` `@OneToMany(mappedBy="item", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` List<AnswerOption>.
  - `validationStatus` `@Enumerated(STRING)` col `validationStatus` nn len20, default `ValidationStatus.DRAFT`.
  - Kept-from-old (refine later): `irtA`/`irtB`/`irtC` col irtA/irtB/irtC `Double` nullable; `riskFlag` col `riskFlag` `boolean` nn; `riskRule` col `riskRule` TEXT nullable; `subDomain` col `subDomain` len150 nullable.
  - `languages` `@ElementCollection(LAZY)` `@CollectionTable(name="ItemLanguage", joinColumn itemId, FK fkItemLanguageItem)` col `language` nn len8, `Set<String>`.
- Helpers: addOption/removeOption.
- Rules (javadoc): IMMUTABLE content node. Content (format, stem, media, options) written once; any content edit creates a NEW Item (copy-on-write) chained via previousItem; editing questionnaire repoints its usage row, other questionnaires keep old row forever. Immutability is a SERVICE contract, not mapping-enforced — repos must never update content columns. Mutable metadata exempt from COW: validationStatus, deletedAt (bank hiding), and refine-later fields. Carries NO scoring (trait credits live on questionnaire usage edges). Service enforces stem-or-media presence per format.

### AnswerOption.java (domain.item)
- Kind: entity, `@Table(name="AnswerOption")`, index idxOptionItem(itemId), extends **BaseEntity** (NOT soft-deletable).
- Fields:
  - `item` `@ManyToOne(LAZY, optional=false)` FK col `itemId` nn, FK `fkOptionItem`.
  - `sortOrder` col `sortOrder` `int` nn.
  - `text` col `text` TEXT nullable.
  - `mediaUrl` col `mediaUrl` TEXT nullable; `mediaType` col `mediaType` len30 nullable.
- Rules: exclusively owned by Item, frozen with it (COW mints new option rows alongside new item). Session answers FK these rows directly → historical answers immune to authoring changes. sortOrder is authoring/bank-preview order only; per-questionnaire display order lives on QuestionnaireItemOption.

### ItemFormat.java (domain.item)
- Kind: enum. Values (exact): `MCQ, RATING_SCALE, LIKERT, SJT, FREE_TEXT, IMAGE_CHOICE, RANKING, MATRIX`.
- Rules: 8 authoring formats. FREE_TEXT only format valid with zero options; every other requires ≥2 (service validation). MATRIX kept for parity but delivery structure undesigned — items may carry it, portal can't serve it yet.

### ValidationStatus.java (domain.item)
- Kind: enum. Values: `DRAFT, UNDER_REVIEW, VALIDATED`. Mutable metadata — changing never triggers COW.

## questionnaire/

### Questionnaire.java (domain.questionnaire)
- Kind: entity, `@Table(name="Questionnaire")`, index idxQuestionnaireOrganization(organizationId), extends **SoftDeletableEntity**.
- Fields:
  - `organization` `@ManyToOne(LAZY)` FK col `organizationId` nullable, FK `fkQuestionnaireOrganization` (tenant: NULL=platform-global, set=org-owned).
  - `name` col `name` nn len200; `shortName` col len50; `category` col len100; `vertical` col len100 (plain label until deferred Vertical entity); `description` TEXT; `durationMinutes` `Integer` nullable.
  - Kept-from-old: `tierRequired` col len50; `adaptive` col `isAdaptive` boolean nn; `fixedSequence` col `isFixedSequence` boolean nn; `normStatus` col len50; `ageRange` col len50; `usesWeightedScoring` col `usesWeightedScoring` boolean nn; `scoringModel` col len32.
  - `sections` `@OneToMany(mappedBy="questionnaire", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` List<QuestionnaireSection>.
  - `items` same-config List<QuestionnaireItem>.
  - `demographicFields` same-config List<QuestionnaireDemographicField>.
- Helpers: add/remove for section/item/demographicField.
- Rules: ONE table replacing legacy instruments+questionnaires split. NO version pointer — assessments read this LIVE aggregate; QuestionnaireChangeLog records every edit. **Aggregate root** owning sections, items, demographicFields.

### QuestionnaireSection.java (domain.questionnaire)
- Kind: entity, `@Table(name="QuestionnaireSection")`, index idxSectionQuestionnaire(questionnaireId), extends **BaseEntity**.
- Fields: `questionnaire` `@ManyToOne(LAZY, optional=false)` FK col `questionnaireId` nn, FK `fkSectionQuestionnaire`; `title` col nn len200; `sortOrder` `int` nn.
- Rules: deleting a section drops its questions back to unsectioned (service reassigns); never removes them from questionnaire. Unsectioned questionnaires have no section rows and usage rows carry section=null.

### QuestionnaireItem.java (domain.questionnaire)
- Kind: entity (the "usage edge"), `@Table(name="QuestionnaireItem")`, extends **BaseEntity**.
- uniqueConstraint `uqQuestionnaireItem`(questionnaireId, itemId); indexes on questionnaireId, itemId, sectionId.
- Fields:
  - `questionnaire` `@ManyToOne(LAZY, optional=false)` FK `questionnaireId` nn, FK fkQuestionnaireItemQuestionnaire.
  - `item` `@ManyToOne(LAZY, optional=false)` FK `itemId` nn, FK fkQuestionnaireItemItem.
  - `section` `@ManyToOne(LAZY)` FK `sectionId` nullable, FK fkQuestionnaireItemSection.
  - `sortOrder` `int` nn.
  - `traitScores` `@OneToMany(mappedBy="usage", cascade=ALL, orphanRemoval=true)` List<ItemUsageTraitScore>.
  - `optionUsages` `@OneToMany(mappedBy="usage", cascade=ALL, orphanRemoval=true)` `@OrderBy("displayOrder ASC")` List<QuestionnaireItemOption>.
- Helpers: add/remove traitScore & optionUsage.
- Rules: the usage edge — which item, where, what it means here. All trait scoring & per-questionnaire option order hang off this row → same immutable item contributes differently per questionnaire. Removing a question deletes this row + children only; item stays in bank. Service invariants: every AnswerOption of item has exactly one optionUsage row (no hiding); COW repoint migrates children to new item's options.

### QuestionnaireItemOption.java (domain.questionnaire)
- Kind: entity, `@Table(name="QuestionnaireItemOption")`, extends **BaseEntity**.
- uniqueConstraint `uqUsageOption`(questionnaireItemId, optionId); index idxUsageOptionOption(optionId).
- Fields:
  - `usage` `@ManyToOne(LAZY, optional=false)` FK col `questionnaireItemId` nn, FK fkUsageOptionUsage.
  - `option` `@ManyToOne(LAZY, optional=false)` FK col `optionId` nn, FK fkUsageOptionOption (→ AnswerOption).
  - `displayOrder` `int` nn.
  - `traitScores` `@OneToMany(mappedBy="optionUsage", cascade=ALL, orphanRemoval=true)` List<OptionUsageTraitScore>.
- Rules: one row per option per usage; carries this questionnaire's displayOrder; hosts option-level trait scores. Every option of usage's item must have exactly one row — reorder allowed, hide never (service invariant). Option must belong to usage's item; Flyway hardens with composite FKs at cutover; service always validates.

### ItemUsageTraitScore.java (domain.questionnaire)
- Kind: entity, `@Table(name="ItemUsageTraitScore")`, extends **BaseEntity**.
- uniqueConstraint `uqItemUsagePlacement`(questionnaireItemId, placementId); index idxItemUsageScorePlacement(placementId).
- Fields: `usage` `@ManyToOne(LAZY, optional=false)` FK col `questionnaireItemId` nn, FK fkItemUsageScoreUsage; `placement` `@ManyToOne(LAZY, optional=false)` FK col `placementId` nn, FK fkItemUsageScorePlacement (→ TraitPlacement); `value` col `value` `double` nn.
- Rules: question-level trait credit — granted whenever item answered at all in this questionnaire, regardless of option. References TraitPlacement, never bare trait.

### OptionUsageTraitScore.java (domain.questionnaire)
- Kind: entity, `@Table(name="OptionUsageTraitScore")`, extends **BaseEntity**.
- uniqueConstraint `uqOptionUsagePlacement`(questionnaireItemOptionId, placementId); index idxOptionUsageScorePlacement(placementId).
- Fields: `optionUsage` `@ManyToOne(LAZY, optional=false)` FK col `questionnaireItemOptionId` nn, FK fkOptionUsageScoreOptionUsage; `placement` `@ManyToOne(LAZY, optional=false)` FK col `placementId` nn, FK fkOptionUsageScorePlacement; `value` `double` nn.
- Rules: option-level trait credit — granted when this option chosen in this questionnaire. Reverse-coding a shared item = different values per questionnaire, no item duplication.

### QuestionnaireDemographicField.java (domain.questionnaire)
- Kind: entity, `@Table(name="QuestionnaireDemographicField")`, extends **BaseEntity**.
- uniqueConstraint `uqQuestionnaireField`(questionnaireId, fieldId); index idxQuestionnaireFieldField(fieldId).
- Fields: `questionnaire` `@ManyToOne(LAZY, optional=false)` FK `questionnaireId` nn FK fkQuestionnaireFieldQuestionnaire; `field` `@ManyToOne(LAZY, optional=false)` FK `fieldId` nn FK fkQuestionnaireFieldField (→ DemographicField, in assessment pkg); `sortOrder` `int` nn.
- Rules: which demographic fields the registration form shows + order. Replaces published-snapshot field_key string set.

### QuestionnaireChangeLog.java (domain.questionnaire)
- Kind: entity, `@Table(name="QuestionnaireChangeLog")`, index idxChangeLogQuestionnaire(questionnaireId), extends **BaseEntity**.
- Fields: `questionnaire` `@ManyToOne(LAZY, optional=false)` FK `questionnaireId` nn FK fkChangeLogQuestionnaire; `changeType` `@Enumerated(STRING)` col nn len40 `QuestionnaireChangeType`; `details` col TEXT nullable (JSON before/after payload).
- Rules: append-only trail replacing questionnaire versioning; actor/moment = inherited createdBy/createdAt; rows never updated/deleted.

### QuestionnaireChangeType.java (domain.questionnaire)
- Kind: enum. Values (exact): `ITEM_ADDED, ITEM_REMOVED, ITEM_REPLACED` (=COW repoint), `ITEM_REORDERED, OPTION_ORDER_CHANGED, SCORE_CHANGED, SECTION_CHANGED, DEMOGRAPHICS_CHANGED, METADATA_UPDATED`. Closed set by design.

## people/

### User.java (domain.people)
- Kind: entity, `@Table(name="User")`, uniqueConstraint `uqUserEmail`(email), extends **SoftDeletableEntity**.
- Fields:
  - `email` col nn len255 (unique).
  - `dob` col `dob` `LocalDate` nullable — the portal CREDENTIAL (product decision), typed as real date, compared by auth service.
  - `status` `@Enumerated(STRING)` col nn len20 `UserStatus` default ACTIVE.
  - `superAdmin` col `isSuperAdmin` boolean nn — sits above role system, overrides all permission checks.
  - `lastLoginAt` `OffsetDateTime` nullable.
  - `name` len150; `phone` len20; `gender` len20 (all nullable).
  - `consent` col `consent` boolean nn; `consentedAt` `OffsetDateTime` nullable.
  - `roles` `@OneToMany(mappedBy="user", cascade=ALL, orphanRemoval=true)` Set<UserRole>.
- Helpers: addRole/removeRole.
- Rules: SINGLE identity for every actor (admin/practitioner/respondent are roles, not tables); legacy practitioner/respondent silos fold in. Profile fields merged from legacy user_meta. Flag: legacy DB has unmapped `users` table predating old model — cutover must archive it to avoid collision with this `User` table.

### Role.java (domain.people)
- Kind: entity, `@Table(name="Role")`, uniqueConstraint `uqRoleName`(name), extends **BaseEntity**.
- Fields: `name` col nn len50 (unique); `description` TEXT nullable; `urlPaths` `@ElementCollection(LAZY)` `@CollectionTable(name="RoleUrlPath", joinColumn roleId, FK fkRoleUrlPathRole)` col `urlPath` nn len255, `Set<String>`.
- Rules: RBAC role. Seeded: admin, practitioner, respondent. Access = url-path allow-list. Deleting a role in use blocked by UserRole FK (RESTRICT).

### UserRole.java (domain.people)
- Kind: entity, `@Table(name="UserRole")`, uniqueConstraint `uqUserRole`(userId, roleId), index idxUserRoleRole(roleId), extends **BaseEntity**.
- Fields: `user` `@ManyToOne(LAZY, optional=false)` FK `userId` nn FK fkUserRoleUser; `role` `@ManyToOne(LAZY, optional=false)` FK `roleId` nn FK fkUserRoleRole. M:N join.

### UserStatus.java (domain.people)
- Kind: enum. Values: `ACTIVE, INACTIVE, SUSPENDED`. Legacy rows carry "Active" strings; set-beyond-ACTIVE/INACTIVE confirmed vs frontend at migration.

### Organization.java (domain.people)
- Kind: entity, `@Table(name="Organization")` (NO indexes), extends **SoftDeletableEntity**.
- Fields:
  - `name` col nn len200; `website` len255; `contactName` len150; `contactEmail` len255; `contactPhone` len20 (nullable).
  - `status` `@Enumerated(STRING)` col nn len20 `OrganizationStatus` default **PENDING**.
  - `verticals` `@ElementCollection(LAZY)` `@CollectionTable(name="OrganizationVertical", joinColumn organizationId, FK fkOrgVerticalOrg)` col `vertical` nn len128, Set<String>.
  - `platformModules` `@ElementCollection(LAZY)` `@CollectionTable(name="OrganizationModule", joinColumn organizationId, FK fkOrgModuleOrg)` col `module` nn len128, Set<String>.
  - `members` `@OneToMany(mappedBy="organization", cascade=ALL, orphanRemoval=true)` Set<OrganizationMember>.
- Helpers: `addMember` only (no removeMember — asymmetric vs other entities).
- Rules: company/institute master, replaces legacy entity_registrations. Provisioning kept simple (string value-tables); assessment allow-list became real allotment rows.

### OrganizationMember.java (domain.people)
- Kind: entity, `@Table(name="OrganizationMember")`, indexes idxOrgMemberOrg(organizationId), idxOrgMemberUser(userId), extends **BaseEntity**.
- Fields: `organization` `@ManyToOne(LAZY, optional=false)` FK `organizationId` nn FK fkOrgMemberOrg; `user` `@ManyToOne(LAZY, optional=false)` FK `userId` nn FK fkOrgMemberUser; `removedAt` `OffsetDateTime` nullable.
- Method: `isActive()`=removedAt==null.
- Rules: temporal membership (createdAt=joined, removedAt=left); re-join = fresh row, full history survives. Deliberately NO unique(org,user) — history rows share pair; service keeps at most one ACTIVE row per pair. Independent of group membership.

### OrganizationStatus.java (domain.people)
- Kind: enum. Values: `PENDING, ACTIVE, SUSPENDED`. Public self-registration born PENDING; admin approves to ACTIVE before it can receive allotments.

### RespondentGroup.java (domain.people)
- Kind: entity, `@Table(name="RespondentGroup")`, indexes idxGroupOrganization(organizationId), idxGroupParent(parentGroupId), extends **SoftDeletableEntity**.
- Fields:
  - `organization` `@ManyToOne(LAZY, optional=false)` FK `organizationId` nn FK fkGroupOrganization.
  - `name` col nn len150; `description` TEXT nullable.
  - `parent` `@ManyToOne(LAZY)` FK `parentGroupId` nullable FK fkGroupParent (self-ref hierarchy).
  - `children` `@OneToMany(mappedBy="parent", cascade=ALL, orphanRemoval=true)` List<RespondentGroup>.
  - `members` `@OneToMany(mappedBy="group", cascade=ALL, orphanRemoval=true)` Set<RespondentGroupMember>.
- Helpers: `addChild` (sets parent + propagates organization to child), `removeChild` (nulls parent), `addMember`.
- Rules: cohort belonging to exactly ONE org. Parent must belong to same org (Flyway composite FK at cutover) + acyclic (service). Group membership does NOT imply org membership (independent edges). Legacy per-group instrument assignment gone — allotments are only assignment path.

### RespondentGroupMember.java (domain.people)
- Kind: entity, `@Table(name="RespondentGroupMember")`, indexes idxGroupMemberGroup(groupId), idxGroupMemberUser(userId), extends **BaseEntity**.
- Fields: `group` `@ManyToOne(LAZY, optional=false)` FK `groupId` nn FK fkGroupMemberGroup; `user` `@ManyToOne(LAZY, optional=false)` FK `userId` nn FK fkGroupMemberUser; `removedAt` `OffsetDateTime` nullable.
- Method: `isActive()`. Same temporal pattern as OrganizationMember; at most one active row per pair (service).

## assessment/

### Assessment.java (domain.assessment)
- Kind: entity, `@Table(name="Assessment")`, index idxAssessmentQuestionnaire(questionnaireId), extends **SoftDeletableEntity**.
- Fields:
  - `questionnaire` `@ManyToOne(LAZY, optional=false)` FK `questionnaireId` nn FK fkAssessmentQuestionnaire.
  - `name` col nn len200.
  - `status` `@Enumerated(STRING)` col nn len16 `AssessmentStatus` default **ACTIVE**.
  - `autoNext` col `autoNext` boolean nn (portal UX auto-advance; single source of truth, sessions surface via DTO).
  - `languages` `@ElementCollection(LAZY)` `@CollectionTable(name="AssessmentLanguage", joinColumn assessmentId, FK fkAssessmentLanguageAssessment)` col `language` nn len8, Set<String>.
- Rules: one "Create Assessment" act — questionnaire offered to allottees. Reads LIVE questionnaire (versioning removed; changelog covers accountability; attempts freeze computed scores at submit). Creator = inherited createdBy. NOTE: does NOT own allotments as a mapped collection — allotment entities point at Assessment but there is no `@OneToMany` here.

### AssessmentStatus.java (domain.assessment)
- Kind: enum. Values: `ACTIVE, CLOSED, PAUSED, TEST`. ACTIVE=allottable+takeable; CLOSED=no new allotments, in-progress may finish; PAUSED=takers blocked; TEST=trial mode (kept from old system).

### AssessmentOrganizationAllotment.java (domain.assessment)
- Kind: entity, extends **BaseEntity**. `@Table(name="AssessmentOrganizationAllotment")`, uniqueConstraint `uqAllotAssessmentOrg`(assessmentId, organizationId), index idxAllotOrgOrganization(organizationId).
- Fields: `assessment` `@ManyToOne(LAZY, optional=false)` FK `assessmentId` nn FK fkAllotOrgAssessment; `organization` `@ManyToOne(LAZY, optional=false)` FK `organizationId` nn FK fkAllotOrgOrganization; `cap` col `cap` `Integer` nullable.
- Rules: cap = max COMPLETED sessions in scope (NULL=unlimited); consumed at submit, freed at admin reset, never consumed by in-progress. Service re-checks cap at submit to close concurrent-takers race.

### AssessmentGroupAllotment.java (domain.assessment)
- Kind: entity, extends **BaseEntity**. `@Table(name="AssessmentGroupAllotment")`, uniqueConstraint `uqAllotAssessmentGroup`(assessmentId, groupId), index idxAllotGroupGroup(groupId).
- Fields: `assessment` FK `assessmentId` nn FK fkAllotGroupAssessment; `group` `@ManyToOne(LAZY, optional=false)` FK `groupId` nn FK fkAllotGroupGroup (→ RespondentGroup); `cap` `Integer` nullable.
- Rules: cap is NEW vs old system (product decision), same completed-sessions semantics as org allotment.

### AssessmentRespondentAllotment.java (domain.assessment)
- Kind: entity, extends **BaseEntity**. `@Table(name="AssessmentRespondentAllotment")`, uniqueConstraint `uqAllotAssessmentUser`(assessmentId, userId), index idxAllotUserUser(userId).
- Fields: `assessment` FK `assessmentId` nn FK fkAllotUserAssessment; `user` `@ManyToOne(LAZY, optional=false)` FK `userId` nn FK fkAllotUserUser. **NO cap field.**
- Rules: direct individual eligibility, one row, no cap. Retake/reset lives on session's attempts.

### DemographicField.java (domain.assessment)
- Kind: entity, `@Table(name="DemographicField")`, uniqueConstraint `uqDemographicFieldKey`(fieldKey), extends **SoftDeletableEntity**.
- Fields:
  - `fieldKey` col nn len128 (unique); `label` col nn len200.
  - `type` `@Enumerated(STRING)` col nn len20 `DemographicFieldType`.
  - `required` col boolean nn; `placeholder` len255 nullable.
  - `active` col `active` boolean nn default **true** — "currently offered to authors" toggle, DISTINCT from deletedAt.
  - `options` `@OneToMany(mappedBy="field", cascade=ALL, orphanRemoval=true)` `@OrderBy("sortOrder ASC")` List<DemographicFieldOption>.
- Helpers: addOption/removeOption.
- Rules: global registry of registration-form fields; questionnaires pick via QuestionnaireDemographicField; session answers FK it.

### DemographicFieldOption.java (domain.assessment)
- Kind: entity, `@Table(name="DemographicFieldOption")`, index idxDemographicOptionField(fieldId), extends **BaseEntity**.
- Fields: `field` `@ManyToOne(LAZY, optional=false)` FK `fieldId` nn FK fkDemographicOptionField; `value` col nn len255; `sortOrder` `int` nn.
- Rules: one choice of a SELECT-type field, ordered rows (legacy Set lost display order).

### DemographicFieldType.java (domain.assessment)
- Kind: enum. Values: `TEXT, NUMBER, DATE, SELECT, TEXTAREA` (five types old service validated).

## delivery/

### AssessmentSession.java (domain.delivery)
- Kind: entity, `@Table(name="AssessmentSession")`, indexes on assessmentId, userId, organizationId, groupId, extends **SoftDeletableEntity**.
- Fields:
  - `assessment` `@ManyToOne(LAZY, optional=false)` FK `assessmentId` nn FK fkSessionAssessment.
  - `user` `@ManyToOne(LAZY, optional=false)` FK `userId` nn FK fkSessionUser.
  - `organization` `@ManyToOne(LAZY)` FK `organizationId` nullable FK fkSessionOrganization (which allotment door → cap accounting).
  - `group` `@ManyToOne(LAZY)` FK `groupId` nullable FK fkSessionGroup.
  - `language` len8; `name` len200; `consentId` len64 (opaque id of consent text, NO backend table — kept as-is per product); `proctoring` boolean nn; `invitationSent` boolean nn; `showQuestionIndex` boolean nn.
  - `attempts` `@OneToMany(mappedBy="session", cascade=ALL, orphanRemoval=true)` `@OrderBy("attemptNumber ASC")` List<AssessmentAttempt>.
- Helpers: `addAttempt`; `getLiveAttempt()` returns attempt with archivedAt==null (else null).
- Rules: one respondent's engagement w/ one assessment (was portal_sessions). Answers/scores/demographics hang off attempts, not session — admin RESET archives live attempt & spawns next, nothing wiped. Recycle-bin only.

### AssessmentAttempt.java (domain.delivery)
- Kind: entity, `@Table(name="AssessmentAttempt")`, uniqueConstraint `uqAttemptNumber`(sessionId, attemptNumber), extends **BaseEntity** (NOT soft-deletable — archive is via archivedAt).
- Fields:
  - `session` `@ManyToOne(LAZY, optional=false)` FK `sessionId` nn FK fkAttemptSession.
  - `attemptNumber` `int` nn.
  - `status` `@Enumerated(STRING)` col nn len16 `AttemptStatus` default **NOT_STARTED**.
  - `startedAt`, `completedAt`, `archivedAt` all `OffsetDateTime` nullable.
  - `answers` `@OneToMany(mappedBy="attempt", cascade=ALL, orphanRemoval=true)` List<SessionAnswer>.
  - `traitScores` same-config List<SessionTraitScore>.
  - `demographics` same-config List<SessionDemographic>.
- Helpers: `isLive()`=archivedAt==null; addAnswer/addTraitScore/addDemographic.
- Rules: one run. RESUME=live attempt continues w/ partial answers. RESET=admin stamps archivedAt, service spawns attempt N+1; row+children stay intact forever (archive IS the row). At most one live attempt per session (service invariant). Cap consumed exactly while live attempt is COMPLETED.

### AttemptStatus.java (domain.delivery)
- Kind: enum. Values: `NOT_STARTED, IN_PROGRESS, COMPLETED`. Legacy stored only "Active"/"Completed"; NOT_STARTED vs IN_PROGRESS split by whether first answer submitted (startedAt).

### SessionAnswer.java (domain.delivery)
- Kind: entity, `@Table(name="SessionAnswer")`, uniqueConstraint `uqAnswerAttemptItem`(attemptId, itemId), index idxAnswerItem(itemId), extends **BaseEntity**.
- Fields:
  - `attempt` `@ManyToOne(LAZY, optional=false)` FK `attemptId` nn FK fkAnswerAttempt.
  - `item` `@ManyToOne(LAZY, optional=false)` FK `itemId` nn FK fkAnswerItem (→ IMMUTABLE Item, NOT usage edge).
  - `freeText` col TEXT nullable (serves FREE_TEXT).
  - `selectedOptions` `@OneToMany(mappedBy="answer", cascade=ALL, orphanRemoval=true)` List<SessionAnswerOption>.
- Helpers: add/removeSelectedOption.
- Rules: anchored to immutable Item so authors can edit questionnaires later without touching history.

### SessionAnswerOption.java (domain.delivery)
- Kind: entity, `@Table(name="SessionAnswerOption")`, uniqueConstraint `uqAnswerOption`(answerId, optionId), index idxAnswerOptionOption(optionId), extends **BaseEntity**.
- Fields: `answer` `@ManyToOne(LAZY, optional=false)` FK `answerId` nn FK fkAnswerOptionAnswer; `option` `@ManyToOne(LAZY, optional=false)` FK `optionId` nn FK fkAnswerOptionOption (→ frozen AnswerOption); `rankOrder` col `rankOrder` `Integer` nullable.
- Rules: single choice=1 row, multi=N rows, RANKING=N rows w/ rank (1-based, NULL for unranked). Points at frozen AnswerOption → legacy positional-index corruption structurally impossible. NOTE: `rankOrder` column named to avoid MySQL 8 reserved word `rank`.

### SessionTraitScore.java (domain.delivery)
- Kind: entity, `@Table(name="SessionTraitScore")`, uniqueConstraint `uqScoreAttemptPlacement`(attemptId, placementId), index idxScorePlacement(placementId), extends **BaseEntity**.
- Fields: `attempt` `@ManyToOne(LAZY, optional=false)` FK `attemptId` nn FK fkScoreAttempt; `placement` `@ManyToOne(LAZY, optional=false)` FK `placementId` nn FK fkScorePlacement (→ TraitPlacement); `value` `double` nn.
- Rules: FROZEN result — computed by SERVER at submit from usage scores in effect then, never touched; later re-scoring affects future takers only. Placement-level rows only; MQ rollups derived in reports. Placement FK RESTRICT + soft-deleted taxonomy → dimension labels survive forever.

### SessionDemographic.java (domain.delivery)
- Kind: entity, `@Table(name="SessionDemographic")`, uniqueConstraint `uqDemographicAttemptField`(attemptId, fieldId), index idxSessionDemographicField(fieldId), extends **BaseEntity**.
- Fields: `attempt` `@ManyToOne(LAZY, optional=false)` FK `attemptId` nn FK fkSessionDemographicAttempt; `field` `@ManyToOne(LAZY, optional=false)` FK `fieldId` nn FK fkSessionDemographicField (→ DemographicField); `value` col TEXT nullable.
- Rules: one demographic answer captured at attempt start; per-attempt (re-entered after reset); value stays TEXT to accept any field-type shape.

---

## SYNTHESIS

### Inheritance / base scheme
- Two `@MappedSuperclass` roots: `BaseEntity` (id BIGINT IDENTITY, `@Version` version, `@CreationTimestamp` createdAt, `@UpdateTimestamp` updatedAt, `@CreatedBy` createdBy→User, `@LastModifiedBy` updatedBy→User) and `SoftDeletableEntity extends BaseEntity` (adds `deletedAt`).
- **Auditing**: Spring Data JPA auditing via `@EnableJpaAuditing` + `AuditorAware<User>` bean (`domainAuditorAware`) which delegates to an optional host-provided `CurrentUserResolver` functional interface. No actor recorded when unauthenticated (columns nullable). Timestamps are Hibernate-managed, not Spring-managed. createdBy/updatedBy are self-referential ManyToOne into `User` on every table.
- **Soft-delete**: recycle-bin via `deletedAt` timestamp; `isDeleted/moveToBin/restoreFromBin`. NO Hibernate `@Where`/`@Filter` — liveness is queried explicitly by repos. DB backstop = `ON DELETE RESTRICT` on referencing FKs (declared in Flyway, not in these annotations). Subtree cascade of bin/restore is service responsibility.
- Two OTHER "archival" mechanisms distinct from soft-delete: (1) `AssessmentAttempt.archivedAt` (attempt reset — attempt extends plain BaseEntity, no deletedAt); (2) temporal membership `removedAt` on OrganizationMember/RespondentGroupMember.

### Which entities are SoftDeletable vs plain BaseEntity
- **SoftDeletableEntity** (has deletedAt): MeasuredQuality, MeasuredQualityTrait, TraitPlacement, Item, Questionnaire, User, Organization, RespondentGroup, Assessment, DemographicField, AssessmentSession. (11)
- **Plain BaseEntity**: AnswerOption, QuestionnaireSection, QuestionnaireItem, QuestionnaireItemOption, ItemUsageTraitScore, OptionUsageTraitScore, QuestionnaireDemographicField, QuestionnaireChangeLog, Role, UserRole, OrganizationMember, RespondentGroupMember, AssessmentOrganizationAllotment, AssessmentGroupAllotment, AssessmentRespondentAllotment, DemographicFieldOption, AssessmentAttempt, SessionAnswer, SessionAnswerOption, SessionTraitScore, SessionDemographic. (21)

### Aggregates (who owns which children via cascade=ALL + orphanRemoval)
- **MeasuredQuality** ⟶ owns all its TraitPlacement rows (`placements`, ALL/orphan). TraitPlacement ⟶ self-owns `children` (adjacency tree, ALL/orphan). MeasuredQualityTrait is a standalone shared library node (no owner).
- **Item** ⟶ owns AnswerOption (`options`, ALL/orphan) + ItemLanguage element collection. Item self-references `previousItem` (COW lineage, non-owning).
- **Questionnaire** (aggregate root) ⟶ owns QuestionnaireSection, QuestionnaireItem, QuestionnaireDemographicField (all ALL/orphan).
  - **QuestionnaireItem** ⟶ owns ItemUsageTraitScore + QuestionnaireItemOption (ALL/orphan).
  - **QuestionnaireItemOption** ⟶ owns OptionUsageTraitScore (ALL/orphan).
  - QuestionnaireDemographicField references DemographicField (non-owning). QuestionnaireItem references Item + QuestionnaireSection (non-owning).
  - QuestionnaireChangeLog references Questionnaire but is NOT owned as a collection (append-only, no OneToMany on Questionnaire).
- **User** ⟶ owns UserRole (ALL/orphan). Role ⟶ owns RoleUrlPath element collection. UserRole references Role (non-owning, RESTRICT).
- **Organization** ⟶ owns OrganizationMember (ALL/orphan) + OrganizationVertical/OrganizationModule element collections.
- **RespondentGroup** ⟶ owns children (self-tree) + RespondentGroupMember (ALL/orphan); references Organization (non-owning).
- **DemographicField** ⟶ owns DemographicFieldOption (ALL/orphan).
- **Assessment** ⟶ references Questionnaire (non-owning) + AssessmentLanguage element collection. Allotment rows (Org/Group/Respondent) reference Assessment but are NOT owned collections (no OneToMany on Assessment) — they are independent join rows.
- **AssessmentSession** ⟶ owns AssessmentAttempt (ALL/orphan). References Assessment, User, Organization, RespondentGroup (non-owning).
- **AssessmentAttempt** ⟶ owns SessionAnswer, SessionTraitScore, SessionDemographic (ALL/orphan).
- **SessionAnswer** ⟶ owns SessionAnswerOption (ALL/orphan); references immutable Item.
- SessionAnswerOption→AnswerOption, SessionTraitScore→TraitPlacement, SessionDemographic→DemographicField (all non-owning, frozen references, RESTRICT).

### Key architectural invariants (cross-cutting)
- **Item immutability + copy-on-write**: Item content frozen; edits mint new Item chained via previousItem; QuestionnaireItem repoints. Enforced by service, not mapping.
- **Scoring always references TraitPlacement (trait-in-MQ context edge), never bare MeasuredQualityTrait** — prevents cross-MQ double counting. Two scoring granularities: ItemUsageTraitScore (question-level, any answer) and OptionUsageTraitScore (option-level, specific choice). Frozen at submit into SessionTraitScore.
- **History immunity**: SessionAnswer→Item (immutable), SessionAnswerOption→AnswerOption (frozen), SessionTraitScore→TraitPlacement (soft-deleted taxonomy survives). Legacy positional-index corruption "structurally impossible."
- **No questionnaire versioning**: live aggregate + append-only QuestionnaireChangeLog; attempts freeze scores at submit.
- **Temporal patterns**: membership (removedAt), attempt reset (archivedAt) — never physical delete; at-most-one-active enforced by service (deliberately no unique constraints on those pairs).
- **Cap accounting**: Org & Group allotments have `cap` (Integer, NULL=unlimited COMPLETED sessions); Respondent allotment has no cap.
- Several service/DB rules declared in javadoc but NOT in mappings: composite FKs (parent-same-MQ, parent-same-org, option-belongs-to-item), acyclic trees, at-most-one-active/live rows, cap re-check at submit, ON DELETE RESTRICT — all deferred to Flyway/service layer.

### Odd / inconsistent / flag-worthy
- `DemographicField` lives in `assessment` package but is referenced by `questionnaire.QuestionnaireDemographicField` and `delivery.SessionDemographic` (cross-package coupling).
- Column naming inconsistency: some boolean cols prefixed `is` (`isSuperAdmin`, `isAdaptive`, `isFixedSequence`) while others aren't (`autoNext`, `proctoring`, `usesWeightedScoring`, `riskFlag`, `active`, `consent`). All entity table + FK/column names are camelCase (not snake_case) — unusual for MySQL.
- `Organization.addMember` and `RespondentGroup.addMember` have no matching `removeMember` (asymmetric with all other add/remove pairs) — because membership removal is via removedAt, not collection removal.
- `AnswerOption` is plain BaseEntity (no soft-delete) yet is "frozen"; deletion protection relies on FK RESTRICT from session rows.
- `AssessmentAttempt` is NOT soft-deletable but Session IS — inconsistent recycle-bin coverage within the delivery aggregate (attempt archival uses archivedAt instead).
- `User.dob` used as the login credential (product decision, plaintext date comparison) — security-relevant.
- Flag (from javadoc): legacy DB has an unmapped `users` table that must be archived at cutover to avoid colliding with the new `User` table.
- `rankOrder` column deliberately renamed from `rank` (MySQL 8 reserved word).
- `MeasuredQualityTrait.name` intentionally NOT unique.
- BaseEntity `hashCode()` returns `getClass().hashCode()` (constant per class) — intentional for Hibernate collection stability but means all instances of a class share a hash bucket.

### Every table name (32 entity tables + 5 element-collection tables = 37)
Entity: `MeasuredQuality, MeasuredQualityTrait, TraitPlacement, Item, AnswerOption, Questionnaire, QuestionnaireSection, QuestionnaireItem, QuestionnaireItemOption, ItemUsageTraitScore, OptionUsageTraitScore, QuestionnaireDemographicField, QuestionnaireChangeLog, User, Role, UserRole, Organization, OrganizationMember, RespondentGroup, RespondentGroupMember, Assessment, AssessmentOrganizationAllotment, AssessmentGroupAllotment, AssessmentRespondentAllotment, DemographicField, DemographicFieldOption, AssessmentSession, AssessmentAttempt, SessionAnswer, SessionAnswerOption, SessionTraitScore, SessionDemographic`.
Element-collection: `ItemLanguage, RoleUrlPath, OrganizationVertical, OrganizationModule, AssessmentLanguage`.
