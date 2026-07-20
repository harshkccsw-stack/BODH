I'll start by enumerating all the files in both directories.
I have the file list. Now let me read all the repository files. I'll batch the reads.
Continuing with the next batch of repositories.
Continuing with the remaining repository files.
Now the remaining repository files.
All 30 repositories read. Now the exceptions and small service files first, then the larger services. Let me check sizes.
Let me read the small exception files and ChangeLogWriter, plus the mid-sized services.
Now let me read the remaining service files - DeliveryService, ItemBankService, OrganizationService.
Now the remaining larger services: QuestionnaireAuthoringService, RespondentGroupService, ScoringService, TaxonomyService, UserService.
Now the final two services: RespondentGroupService, TaxonomyService, and UserService.
All files read: 30 repositories, 10 services, 1 ChangeLogWriter component, 3 exception classes. Here is the complete structured report.

---

# REPOSITORIES (30 Spring Data JPA interfaces)
Package: `com.bodhpsychometric.bodhassess.domain.repository`. All `extends JpaRepository<Entity, Long>`.

### AnswerOptionRepository
- Entity: `item.AnswerOption`. Class-Javadoc: options created with their item and frozen; read-only paths (delivery, scoring, copy-on-write remapping), not editing.
- `List<AnswerOption> findByItemIdOrderBySortOrderAsc(Long itemId)`
- `long countByItemId(Long itemId)`

### AssessmentAttemptRepository
- Entity: `delivery.AssessmentAttempt`.
- `Optional<AssessmentAttempt> findBySessionIdAndArchivedAtIsNull(Long sessionId)` — the LIVE attempt; at most one per session (service invariant, not DB-enforced).
- `List<AssessmentAttempt> findBySessionIdOrderByAttemptNumberAsc(Long sessionId)`
- `Optional<AssessmentAttempt> findTopBySessionIdOrderByAttemptNumberDesc(Long sessionId)` — basis for numbering next attempt on reset.
- `List<AssessmentAttempt> findBySessionIdAndStatus(Long sessionId, AttemptStatus status)`
- `long countBySessionId(Long sessionId)`

### AssessmentGroupAllotmentRepository
- Entity: `assessment.AssessmentGroupAllotment`.
- `findByAssessmentId`, `findByGroupId` (List); `findByAssessmentIdAndGroupId` (Optional); `existsByAssessmentIdAndGroupId` (boolean).

### AssessmentOrganizationAllotmentRepository
- Entity: `assessment.AssessmentOrganizationAllotment`.
- `findByAssessmentId`, `findByOrganizationId` (List); `findByAssessmentIdAndOrganizationId` (Optional); `existsByAssessmentIdAndOrganizationId` (boolean).

### AssessmentRepository
- Entity: `assessment.Assessment`.
- `List<Assessment> findByDeletedAtIsNullOrderByCreatedAtDesc()`
- `Optional<Assessment> findByIdAndDeletedAtIsNull(Long id)`
- `List<Assessment> findByDeletedAtIsNotNull()` — recycle bin.
- `List<Assessment> findByStatusAndDeletedAtIsNull(AssessmentStatus status)`
- `List<Assessment> findByQuestionnaireIdAndStatusNotAndDeletedAtIsNull(Long questionnaireId, AssessmentStatus status)` — guard: are non-`status` (i.e. non-closed) live assessments reading a questionnaire live?
- `List<Assessment> findByQuestionnaireIdAndDeletedAtIsNull(Long questionnaireId)`

### AssessmentRespondentAllotmentRepository
- Entity: `assessment.AssessmentRespondentAllotment`.
- `findByAssessmentId`, `findByUserId` (List); `findByAssessmentIdAndUserId` (Optional); `existsByAssessmentIdAndUserId` (boolean). Direct allotments carry NO cap (see DeliveryService).

### AssessmentSessionRepository
- Entity: `delivery.AssessmentSession`.
- `findByAssessmentIdAndDeletedAtIsNull`, `findByUserIdAndDeletedAtIsNull` (List)
- `findByAssessmentIdAndUserIdAndDeletedAtIsNull` (Optional) — one live session per (assessment,user).
- `existsByAssessmentIdAndUserIdAndDeletedAtIsNull` (boolean)
- `findByIdAndDeletedAtIsNull` (Optional)
- `findByDeletedAtIsNotNull()` (List) — bin.
- `@Query countCapConsumedForOrganization(assessmentId, organizationId)`: JPQL `select count(s) from AssessmentSession s join s.attempts a where s.assessment.id = :assessmentId and s.organization.id = :organizationId and s.deletedAt is null and a.archivedAt is null and a.status = ...AttemptStatus.COMPLETED`. Counts sessions whose LIVE attempt is COMPLETED. Submit consumes a slot, reset frees it.
- `@Query countCapConsumedForGroup(assessmentId, groupId)`: identical, `s.group.id = :groupId`.

### DemographicFieldRepository
- Entity: `assessment.DemographicField`.
- `findByFieldKey` (Optional), `existsByFieldKey` (boolean)
- `List<DemographicField> findByActiveTrueAndDeletedAtIsNullOrderByLabelAsc()` — what the builder offers authors.
- `findByDeletedAtIsNullOrderByLabelAsc` (List), `findByIdAndDeletedAtIsNull` (Optional).

### ItemRepository
- Entity: `item.Item`. Class-Javadoc: items are IMMUTABLE content nodes; services must never update content columns of a persisted row; edits go through copy-on-write (new Item with `previousItem` set).
- `findByDeletedAtIsNull` (List), `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNotNull` (List, bin)
- `findByFormatAndDeletedAtIsNull(ItemFormat)`, `findByValidationStatusAndDeletedAtIsNull(ValidationStatus)`
- `findByStemContainingIgnoreCaseAndDeletedAtIsNull(String stem)` — text search.
- `List<Item> findByPreviousItemId(Long previousItemId)` — direct lineage children.
- `boolean existsByPreviousItemId(Long previousItemId)`

### ItemUsageTraitScoreRepository
- Entity: `questionnaire.ItemUsageTraitScore` (question-level credits).
- `findByUsageId(Long)` (List)
- `@Query findByQuestionnaireId`: JPQL `select s from ItemUsageTraitScore s join fetch s.placement where s.usage.questionnaire.id = :questionnaireId` — scoring-engine fetch, all question-level credits with placement eagerly fetched.
- `boolean existsByPlacementId(Long placementId)` — referential guard for placement hard-delete.

### MeasuredQualityRepository
- Entity: `taxonomy.MeasuredQuality`. Class-Javadoc: liveness explicit in every query name (no global soft-delete filter); recycle-bin views use plain findAll/findById.
- `findByDeletedAtIsNullOrderByNameAsc` (List), `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNotNull` (List), `findByNameContainingIgnoreCaseAndDeletedAtIsNull` (List).

### MeasuredQualityTraitRepository
- Entity: `taxonomy.MeasuredQualityTrait`.
- `findByDeletedAtIsNullOrderByNameAsc` (List), `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNotNull` (List).
- `findByNameContainingIgnoreCaseAndDeletedAtIsNull` — comment: names intentionally NOT unique; returns all homonyms for UI disambiguation by description.

### OptionUsageTraitScoreRepository
- Entity: `questionnaire.OptionUsageTraitScore` (option-level credits).
- `findByOptionUsageId(Long)` (List)
- `@Query findByQuestionnaireId`: JPQL `select s from OptionUsageTraitScore s join fetch s.placement join fetch s.optionUsage ou where ou.usage.questionnaire.id = :questionnaireId` — double fetch join.
- `boolean existsByPlacementId(Long placementId)` — placement hard-delete guard.

### OrganizationMemberRepository
- Entity: `people.OrganizationMember`. Class-Javadoc: TEMPORAL membership — rows never deleted; leaving stamps `removedAt`, re-joining inserts a new row. "Active" = `removedAt IS NULL`; service keeps ≤1 active row per (org,user).
- `findByOrganizationIdAndRemovedAtIsNull`, `findByUserIdAndRemovedAtIsNull` (List)
- `findByOrganizationIdAndUserIdAndRemovedAtIsNull` (Optional), `existsByOrganizationIdAndUserIdAndRemovedAtIsNull` (boolean)
- `findByUserIdOrderByCreatedAtDesc`, `findByOrganizationIdOrderByCreatedAtDesc` (List) — full join/leave history.
- `long countByOrganizationIdAndRemovedAtIsNull(Long)`

### OrganizationRepository
- Entity: `people.Organization`.
- `findByDeletedAtIsNullOrderByNameAsc` (List), `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNotNull` (List).
- `findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(OrganizationStatus)` — PENDING = self-signups awaiting approval.
- `findByNameContainingIgnoreCaseAndDeletedAtIsNull` (List).

### QuestionnaireChangeLogRepository
- Entity: `questionnaire.QuestionnaireChangeLog`. Class-Javadoc: APPEND-ONLY — `save()` is the only write; no update/delete path in any service.
- `findByQuestionnaireIdOrderByCreatedAtDesc` (List)
- `findByQuestionnaireIdAndChangeTypeOrderByCreatedAtDesc(Long, QuestionnaireChangeType)` (List)
- `findByCreatedByIdOrderByCreatedAtDesc(Long userId)` (List)

### QuestionnaireDemographicFieldRepository
- Entity: `questionnaire.QuestionnaireDemographicField`.
- `findByQuestionnaireIdOrderBySortOrderAsc` (List)
- `boolean existsByFieldId(Long fieldId)` — guard for DemographicField deletion.

### QuestionnaireItemOptionRepository
- Entity: `questionnaire.QuestionnaireItemOption` (per-usage option row).
- `findByUsageIdOrderByDisplayOrderAsc` (List)
- `findByUsageIdAndOptionId` (Optional) — used by ScoringService.
- `long countByUsageId(Long)` — coverage-check input for the every-option-has-a-row invariant.

### QuestionnaireItemRepository
- Entity: `questionnaire.QuestionnaireItem` (usage edge). Class-Javadoc: removing a question = deleting a row here (children cascade); item never touched.
- `findByQuestionnaireIdOrderBySortOrderAsc` (List)
- `@Query findWithItemsByQuestionnaireId`: JPQL `select qi from QuestionnaireItem qi join fetch qi.item where qi.questionnaire.id = :questionnaireId order by qi.sortOrder asc` — take-flow fetch.
- `findByItemId(Long)` (List) — where-used.
- `existsByItemId(Long)` (boolean) — guard for item bin.
- `findByQuestionnaireIdAndItemId` (Optional), `existsByQuestionnaireIdAndItemId` (boolean) — dedupe guard.
- `findBySectionIdOrderBySortOrderAsc` (List)
- `long countByQuestionnaireId(Long)`

### QuestionnaireRepository
- Entity: `questionnaire.Questionnaire`.
- `findByDeletedAtIsNullOrderByNameAsc` (List), `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNotNull` (List).
- `findByOrganizationIdAndDeletedAtIsNullOrderByNameAsc(Long)` — org-owned.
- `findByOrganizationIsNullAndDeletedAtIsNullOrderByNameAsc()` — platform-global (organization = null).
- `findByNameContainingIgnoreCaseAndDeletedAtIsNull` (List).

### QuestionnaireSectionRepository
- Entity: `questionnaire.QuestionnaireSection`.
- `findByQuestionnaireIdOrderBySortOrderAsc` (List), `existsByQuestionnaireId` (boolean).

### RespondentGroupMemberRepository
- Entity: `people.RespondentGroupMember`. Class-Javadoc: TEMPORAL, same contract as OrganizationMemberRepository.
- `findByGroupIdAndRemovedAtIsNull`, `findByUserIdAndRemovedAtIsNull` (List)
- `findByGroupIdAndUserIdAndRemovedAtIsNull` (Optional), `existsByGroupIdAndUserIdAndRemovedAtIsNull` (boolean)
- `findByUserIdOrderByCreatedAtDesc` (List), `countByGroupIdAndRemovedAtIsNull` (long).

### RespondentGroupRepository
- Entity: `people.RespondentGroup`.
- `findByOrganizationIdAndDeletedAtIsNullOrderByNameAsc` (List)
- `findByOrganizationIdAndParentIsNullAndDeletedAtIsNullOrderByNameAsc` (List) — top level of one org's group tree.
- `findByParentIdAndDeletedAtIsNull` (List) — live children (bin guard).
- `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNotNull` (List).

### RoleRepository
- Entity: `people.Role`.
- `findByName(String)` (Optional), `existsByName(String)` (boolean).

### SessionAnswerRepository
- Entity: `delivery.SessionAnswer`.
- `findByAttemptId(Long)` (List)
- `@Query findWithSelectionsByAttemptId`: JPQL `select distinct a from SessionAnswer a left join fetch a.selectedOptions where a.attempt.id = :attemptId` — resume fetch, partial answers + selections in one round trip.
- `findByAttemptIdAndItemId` (Optional), `existsByAttemptIdAndItemId` (boolean), `countByAttemptId` (long).

### SessionDemographicRepository
- Entity: `delivery.SessionDemographic`.
- `findByAttemptId(Long)` (List), `findByAttemptIdAndFieldId` (Optional), `existsByFieldId(Long)` (boolean).

### SessionTraitScoreRepository
- Entity: `delivery.SessionTraitScore`. Class-Javadoc: FROZEN results — written once at submit, then read-only; no service updates/deletes (reset archives the whole attempt instead).
- `findByAttemptId(Long)` (List)
- `@Query findWithPlacementsByAttemptId`: JPQL `select s from SessionTraitScore s join fetch s.placement p join fetch p.trait where s.attempt.id = :attemptId` — report fetch, scores + placement + trait labels.
- `boolean existsByPlacementId(Long placementId)` — placement hard-delete guard.

### TraitPlacementRepository
- Entity: `taxonomy.TraitPlacement`.
- `findByMeasuredQualityIdAndParentIsNullAndDeletedAtIsNullOrderBySortOrderAsc(Long)` — top level of one MQ tree (the placements collection on MQ holds ALL levels).
- `findByParentIdAndDeletedAtIsNullOrderBySortOrderAsc(Long)` (List) — live children.
- `findByMeasuredQualityIdAndDeletedAtIsNull(Long)` (List)
- `findByTraitIdAndDeletedAtIsNull(Long)` (List) — where-used; `existsByTraitIdAndDeletedAtIsNull(Long)` (boolean) — trait bin guard.
- `findByMeasuredQualityIdAndTraitId` (Optional) — dedupe on place (returns binned too).
- `findByIdAndDeletedAtIsNull` (Optional).
- `findByMeasuredQualityIdAndDeletedAt(Long, OffsetDateTime)` (List) — rows binned in one act (shared deletedAt stamp); restore support.
- `findByParentIdAndDeletedAt(Long, OffsetDateTime)` (List) — same, for subtree restore.

### UserRepository
- Entity: `people.User`.
- `findByEmailIgnoreCaseAndDeletedAtIsNull(String)` (Optional) — login lookup, email = canonical id.
- `existsByEmailIgnoreCase(String)` (boolean) — NOTE: does NOT filter deletedAt (uniqueness across binned users too).
- `findByIdAndDeletedAtIsNull` (Optional), `findByDeletedAtIsNull` (List), `findByStatusAndDeletedAtIsNull(UserStatus)` (List).
- `@Query findByRoleName`: JPQL `select distinct u from User u join u.roles ur where ur.role.name = :roleName and u.deletedAt is null`.
- `findByNameContainingIgnoreCaseAndDeletedAtIsNull` (List).

### UserRoleRepository
- Entity: `people.UserRole`.
- `findByUserId`, `findByRoleId` (List); `findByUserIdAndRoleId` (Optional); `existsByUserIdAndRoleId` (boolean).
- `boolean existsByRoleId(Long roleId)` — guard for Role deletion (FK is RESTRICT anyway; gives clean error first).

---

# SERVICES

Exceptions (all extend `RuntimeException`, serialVersionUID=1L):
- **NotFoundException(String what, Object id)** → message `what + " not found: " + id`; HTTP 404 — row missing or not live.
- **ConflictException(String message)** → HTTP 409 — duplicate pair, cap exhausted, illegal transition.
- **ValidationException(String message)** → HTTP 400 — bad format, wrong item's option, domain-rule violation.

### ChangeLogWriter (`@Component`, NOT a service, NOT transactional)
- The single write path into the questionnaire change log. Append-only (deliberately no update/delete). Owns a private `new ObjectMapper()`.
- `void log(Questionnaire questionnaire, QuestionnaireChangeType type, Map<String,Object> details)`: builds `QuestionnaireChangeLog`, sets questionnaire + changeType, serializes `details` to JSON string via Jackson. On `JsonProcessingException`, swallows it and stores `{"serializationError":"<msg>"}` instead of failing. Then `repository.save(entry)`. Actor (createdBy) + timestamp (createdAt) come from JPA auditing, not set here.

### AssessmentAdminService (`@Service @Transactional` — class-level read-write)
Create/lifecycle of assessments + the three allotment kinds with caps. Repos: Assessment, Questionnaire, Org/Group/Respondent allotment repos, Organization, RespondentGroup, User. No change-log writes.
- `Assessment create(String name, Long questionnaireId, boolean autoNext, Set<String> languages)`: loads live questionnaire (else NotFound); builds Assessment, sets name/questionnaire/autoNext, sets languages if non-null; saves. (No default status set here — relies on entity default.)
- `Assessment setStatus(Long assessmentId, AssessmentStatus status)`: `live()` then `setStatus`. No transition validation (any status → any status). Returns managed entity (dirty-checking persists).
- `void bin(Long assessmentId)`: `live().moveToBin(now)`.
- `void restore(Long assessmentId)`: `findById` (NOT deletedAt-filtered) else NotFound; `restoreFromBin()`.
- `AssessmentOrganizationAllotment allotToOrganization(Long assessmentId, Long organizationId, Integer cap)`: `allottable()` (rejects CLOSED); load live org else NotFound; if `existsByAssessmentIdAndOrganizationId` → Conflict "already allotted"; build+save with cap.
- `AssessmentGroupAllotment allotToGroup(Long assessmentId, Long groupId, Integer cap)`: same shape, live group, dup guard, cap.
- `AssessmentRespondentAllotment allotToRespondent(Long assessmentId, Long userId)`: `allottable()`; live user; dup guard; save — NO cap field (direct allotments are uncapped by design).
- `AssessmentOrganizationAllotment updateOrganizationCap(Long, Long, Integer cap)`: load allotment by (assessment,org) else NotFound; setCap; return (dirty-check).
- `AssessmentGroupAllotment updateGroupCap(Long, Long, Integer cap)`: same for group.
- `@Transactional(readOnly=true) List<Assessment> listLive()`: `findByDeletedAtIsNullOrderByCreatedAtDesc`.
- `@Transactional(readOnly=true) Assessment get(Long)`: `live()`.
- private `allottable(id)`: `live()` then throws Conflict if status == CLOSED.
- private `live(id)`: `findByIdAndDeletedAtIsNull` else NotFound.
- **Invariants:** ≤1 allotment per (assessment, target) via exists-guards; no new allotments on CLOSED assessment; org/group carry caps, respondent does not. **Flag:** no status-transition state machine; `create` doesn't set explicit initial status.

### DeliveryService (`@Service @Transactional`)
The take-flow. Nested `record Selection(Long optionId, Integer rankOrder)`. Depends on ScoringService + 14 repos. No change-log writes (change log is questionnaire-only).
Class-Javadoc cap rule: cap counts sessions whose LIVE attempt is COMPLETED; submit consumes, reset frees; checked at start AND re-checked at submit to close the concurrent-takers race.
- `AssessmentSession provisionSession(Long assessmentId, Long userId, String language)`: `takeable()` (not PAUSED); live user else NotFound; if existing live session for (assessment,user) → Conflict; build session (assessment/user/language); `resolveScope()` — if false → Conflict "not allotted"; `checkCap(session,"start")`; create attempt #1 via `session.addAttempt`; save.
- `AssessmentAttempt startOrResume(Long sessionId)` (RESUME): liveSession; `takeable()`; liveAttempt; if COMPLETED → Conflict "admin reset required to retake"; if NOT_STARTED → set IN_PROGRESS + startedAt=now. Returns attempt.
- `SessionAnswer saveAnswer(Long sessionId, Long itemId, List<Selection> selections, String freeText)`: liveSession; liveAttempt; if attempt not IN_PROGRESS → Conflict "start the session first"; verify item belongs to questionnaire via `usageRepository.existsByQuestionnaireIdAndItemId` else Validation; load item (plain `findById`, NOT deletedAt-filtered) else NotFound; find-or-create SessionAnswer for (attempt,item). If item FREE_TEXT: reject non-empty selections (Validation), set freeText, clear selectedOptions, save. Else: require ≥1 selection (Validation); clear freeText + selectedOptions; for each selection load option (`findById`) else NotFound, verify `option.getItem().getId().equals(itemId)` else Validation, build SessionAnswerOption with rankOrder, add; save.
- `AssessmentAttempt submit(Long sessionId)`: liveSession; liveAttempt; if not IN_PROGRESS → Conflict "nothing to submit"; `checkCap(session,"submit")` (RE-CHECK); `scoringService.scoreAttempt(attempt, questionnaireId)`; set COMPLETED + completedAt=now. Server-side scoring only.
- `AssessmentAttempt reset(Long sessionId)` (admin RESET): liveSession; liveAttempt (current); set `archivedAt=now` (nothing wiped — answers/scores/demographics stay forever); create next attempt with `attemptNumber = current+1`, add to session, save. Frees the cap slot.
- `@Transactional(readOnly=true) getSession(sessionId)`; `answersOfLiveAttempt(sessionId)` → `findWithSelectionsByAttemptId`; `resultsOfLiveAttempt(sessionId)` → `findWithPlacementsByAttemptId`.
- private `resolveScope(assessmentId, userId, session)`: returns true if direct respondent allotment exists (no org/group scope set); else iterate group allotments — if user is active member (`removedAt IS NULL`), set session group + org (via group.getOrganization()), return true; else iterate org allotments — if active org member, set org, return true; else false. **Order matters: direct → group → org (first match wins).**
- private `checkCap(session, stage)`: if session.group != null → get group allotment cap; if cap != null and `countCapConsumedForGroup >= cap` → Conflict "Group cap exhausted at <stage>". Else if session.org != null → same for org. Direct respondent allotments carry no cap (comment).
- private `takeable(assessmentId)`: live assessment else NotFound; if PAUSED → Conflict. (NOTE: does NOT block CLOSED for taking — only PAUSED.)
- private `liveSession`: `findByIdAndDeletedAtIsNull` else NotFound.
- private `liveAttempt`: `findBySessionIdAndArchivedAtIsNull` else Conflict "no live attempt".
- **Invariants owned here:** ≤1 live session per (assessment,user); ≤1 live (non-archived) attempt per session; scoring is server-side only (client never supplies scores); cap re-checked at submit; FREE_TEXT vs option-format answer shape; option must belong to the answered item. **Flag:** `saveAnswer`/option loads use plain `findById` (no soft-delete filter) — intentional since items/options are frozen.

### ItemBankService (`@Service @Transactional`)
The item bank; immutability by construction. Nested records `OptionContent(text, mediaUrl, mediaType)`, `ItemContent(format, stem, mediaUrl, mediaType, List<OptionContent> options)`. Repos: ItemRepository, QuestionnaireItemRepository. No change-log.
- `Item createItem(ItemContent content, Set<String> languages)`: `validate(content)`; `buildFrom(content, null)`; set languages if non-null; save.
- `Item editAsNewVersion(Long itemId, ItemContent content)` (COPY-ON-WRITE): load live item (previous); validate; `buildFrom(content, previous)` (chains previousItem); copy languages (defensive `Set.copyOf`); reset version-specific metadata: validationStatus=DRAFT; carry forward irtA/irtB/irtC, riskFlag, riskRule, subDomain; save NEW item. Nothing repointed automatically.
- `Item setValidationStatus(Long itemId, ValidationStatus status)`: workflow metadata mutable IN PLACE (never copy-on-write); live item; setStatus.
- `void binItem(Long itemId)`: live item; if `usageRepository.existsByItemId` → Conflict "used by questionnaires — remove usages first"; `moveToBin(now)`.
- `void restoreItem(Long itemId)`: plain `findById` else NotFound; `restoreFromBin`.
- `@Transactional(readOnly=true) Item get(Long)`; `List<Item> versionSuccessors(Long)` → `findByPreviousItemId`.
- private `buildFrom(content, previous)`: new Item, set format/stem/mediaUrl/mediaType/previousItem; iterate options assigning sortOrder=0,1,2… (authoring order) via `item.addOption`.
- private `validate(content)`: format required (Validation); needs stem OR media (Validation); FREE_TEXT must have 0 options (Validation); any non-FREE_TEXT needs ≥2 options (Validation) — **comment: this is exactly the C9 unanswerable-item bug, now unrepresentable.**
- private `liveItem(id)`: `findByIdAndDeletedAtIsNull` else NotFound.
- **Invariants:** items immutable (no content-update method exists); edit mints new version chained via previousItem; ≥2 options for non-FREE_TEXT; cannot bin an item still in use.

### OrganizationService (`@Service @Transactional`)
Organizations + temporal membership. Repos: Organization, OrganizationMember, User. No change-log.
- `Organization create(Organization organization, boolean selfSignup)`: status = PENDING if selfSignup else ACTIVE; save. (Takes a pre-built entity.)
- `Organization approve(Long organizationId)`: live org; if status != PENDING → Conflict "not pending approval"; set ACTIVE.
- `Organization setStatus(Long, OrganizationStatus)`: live; setStatus (no transition guard).
- `OrganizationMember addMember(Long organizationId, Long userId)`: live org; live user; if `existsByOrganizationIdAndUserIdAndRemovedAtIsNull` → Conflict "already active member"; build member (org+user); save. New row (does not resurrect old).
- `void removeMember(Long organizationId, Long userId)`: find active member else NotFound; set `removedAt=now` — row survives as history, user untouched.
- `void bin(Long)` / `void restore(Long)`: moveToBin(now) / findById+restoreFromBin.
- `@Transactional(readOnly=true) get`, `activeMembers` (removedAt null), `membershipHistory` (`findByOrganizationIdOrderByCreatedAtDesc`).
- private `live`: `findByIdAndDeletedAtIsNull` else NotFound.
- **Invariants:** ≤1 active membership row per (org,user); PENDING→ACTIVE only via approve (from pending); leaving is a stamp not a delete.

### QuestionnaireAuthoringService (`@Service @Transactional`) — LARGEST authoring surface
Nested `record PlacementValue(Long placementId, double value)`. Repos: Questionnaire, Section, QuestionnaireItem(usage), QuestionnaireItemOption, QuestionnaireDemographicField, DemographicField, Item, AnswerOption, TraitPlacement + **ChangeLogWriter**. Every mutation logs to change log (there is NO versioning — the log IS the accountability).
Class-Javadoc invariants: (1) full option coverage — a usage always has exactly one option row per AnswerOption of its item; questionnaires can reorder but never hide; (2) usages are the only place meaning lives — items untouched; (3) replacing a usage's item migrates option order + scores BY OPTION POSITION, drops removed, creates unscored for new.
- `Questionnaire create(Questionnaire)`: save; log METADATA_UPDATED `{event:created}`.
- `Questionnaire updateMetadata(Long id, Consumer<Questionnaire> mutator)`: live; apply mutator; log METADATA_UPDATED `{event:updated}`.
- `void bin(Long)` / `restore(Long)`: moveToBin / findById+restoreFromBin. **(bin/restore do NOT write change log.)**
- `@Transactional(readOnly=true) get(Long)`: live.
- `QuestionnaireSection addSection(Long questionnaireId, String title, int sortOrder)`: live q; build+save section; log SECTION_CHANGED `{event:added,title}`.
- `updateSection(Long sectionId, String title, int sortOrder)`: findById section else NotFound; set; log SECTION_CHANGED `{event:updated,...}`.
- `void deleteSection(Long sectionId)`: findById section; for each usage in section set `section=null` (questions drop to UNSECTIONED, never out of questionnaire); delete section; log SECTION_CHANGED `{event:deleted}`.
- `QuestionnaireItem addItem(Long questionnaireId, Long itemId, Long sectionId, int sortOrder)`: live q; live item; if `existsByQuestionnaireIdAndItemId` → Conflict "already in questionnaire"; build usage; if sectionId set, `requireSectionOf` (same-questionnaire check); **full option coverage** — one QuestionnaireItemOption per AnswerOption (displayOrder=option.sortOrder); save; log ITEM_ADDED `{itemId,usageId}`.
- `void removeItem(Long usageId)`: usage else NotFound; delete usage (children cascade); item stays in bank; log ITEM_REMOVED.
- `QuestionnaireItem moveItem(Long usageId, Long sectionId, int sortOrder)`: usage; setSortOrder; setSection (null or requireSectionOf); log ITEM_REORDERED.
- `QuestionnaireItem replaceItem(Long usageId, Long newItemId)`: usage; load newItem live; if same id → return unchanged; if newItem already in this questionnaire → Conflict; snapshot old option rows keyed by `option.getSortOrder()` (position); set new item; `getOptionUsages().clear()` (orphanRemoval deletes old rows + their scores); for each AnswerOption of new item build row, displayOrder carried from prior-position row if present else option.sortOrder, and carry OptionUsageTraitScore rows (placement+value) from matching prior position; add; log ITEM_REPLACED `{usageId,oldItemId,newItemId}`. **Migration is by option POSITION (sortOrder), not option id.**
- `QuestionnaireItem setItemScores(Long usageId, List<PlacementValue> scores)`: usage; clear existing item trait scores; for each `dedupe(scores)` build ItemUsageTraitScore with livePlacement + value; log SCORE_CHANGED `{level:item,count}`.
- `QuestionnaireItemOption setOptionScores(Long optionUsageId, List<PlacementValue> scores)`: load option-usage else NotFound; clear; add OptionUsageTraitScore per deduped PlacementValue; log SCORE_CHANGED `{level:option,count}`.
- `QuestionnaireItem setOptionOrder(Long usageId, List<Long> optionIdsInOrder)`: usage; require list size == rows size AND lists every option exactly once (Validation on size mismatch, and Validation if an id doesn't belong / consumed via `byOptionId.remove`); assign displayOrder=0,1,2…; log OPTION_ORDER_CHANGED. **Enforces full coverage, no hiding.**
- `List<QuestionnaireDemographicField> setDemographicFields(Long questionnaireId, List<Long> fieldIdsInOrder)`: live q; clear existing links; for each fieldId load live DemographicField else NotFound, build link (field + sortOrder), add; log DEMOGRAPHICS_CHANGED `{fieldIds}`.
- private `dedupe(scores)`: LinkedHashMap keyed by placementId, last-write-wins (comment: unique(usage,placement) holds).
- private `requireSectionOf(questionnaireId, sectionId)`: section else NotFound; if section.questionnaire.id != questionnaireId → Validation "belongs to a different questionnaire".
- private `live(id)`, `usage(usageId)` (plain findById else NotFound), `livePlacement(id)` (findByIdAndDeletedAtIsNull else NotFound).
- **Invariants owned:** full option coverage per usage; option reorder must cover all exactly once; replace migrates by position; sections deleted → questions unsectioned (never removed); dedupe placements per usage/option; every content mutation writes change log (but bin/restore/create-via-different-paths edge cases noted).
- **QuestionnaireChangeType values referenced:** METADATA_UPDATED, SECTION_CHANGED, ITEM_ADDED, ITEM_REMOVED, ITEM_REORDERED, ITEM_REPLACED, SCORE_CHANGED, OPTION_ORDER_CHANGED, DEMOGRAPHICS_CHANGED.

### RespondentGroupService (`@Service @Transactional`)
Groups belong to exactly one org; hierarchy same-org + acyclic (checked here, hardened by composite FK at cutover); group membership temporal + independent of org membership. Repos: RespondentGroup, RespondentGroupMember, Organization, User. No change-log.
- `RespondentGroup create(Long organizationId, String name, String description, Long parentGroupId)`: live org; build group; if parentGroupId set, `requireSameOrgParent`; save.
- `RespondentGroup update(Long groupId, String name, String description)`: live; set fields.
- `RespondentGroup move(Long groupId, Long newParentGroupId)`: live group; if newParent null → detach (root); else `requireSameOrgParent(group.org.id, newParent)`; **cycle guard** — walk newParent's ancestor chain, if any ancestor == groupId → Validation "would create a cycle"; set parent.
- `RespondentGroupMember addMember(Long groupId, Long userId)`: live group; live user; if active member exists → Conflict; build+save member.
- `void removeMember(Long groupId, Long userId)`: active member else NotFound; set removedAt=now.
- `void bin(Long groupId)`: live; if `findByParentIdAndDeletedAtIsNull` non-empty → Conflict "has live sub-groups — bin or move them first"; moveToBin. **(No cascade; blocks instead.)**
- `void restore(Long groupId)`: findById else NotFound; if parent != null AND `parent.isDeleted()` → Conflict "Restore the parent group first"; restoreFromBin.
- `@Transactional(readOnly=true) rootsOf(orgId)`; `activeMembers(groupId)`.
- private `requireSameOrgParent(orgId, parentGroupId)`: live parent; if parent.org.id != orgId → Validation "different organization".
- private `live`: findByIdAndDeletedAtIsNull else NotFound.
- **Invariants owned:** group tree acyclic; parent same org; cannot bin a group with live sub-groups; cannot restore under a binned parent; ≤1 active membership per (group,user).

### ScoringService (`@Service @Transactional`)
Server-side scoring computed once at submit, frozen as SessionTraitScore. Repos: SessionAnswer, QuestionnaireItem(usage), QuestionnaireItemOption. Called by DeliveryService.submit.
Class-Javadoc: client never supplies scores (that hole is closed). Question-level credits count once per answered item; option-level count per selected option; multi-select sums; **RANKING currently sums selected options too — rank-weighted scoring is a future product decision to slot in here.**
- `void scoreAttempt(AssessmentAttempt attempt, Long questionnaireId)`: accumulate into `Map<Long placementId, Accumulator>` (LinkedHashMap, insertion order preserved). Fetch answers via `findWithSelectionsByAttemptId`. For each answer: resolve usage via `findByQuestionnaireIdAndItemId`; if null → skip (item was removed from questionnaire after answer saved — answer stays as history, no longer scores). Add all item-level trait credits (usage.getTraitScores). For each selected option: resolve optionUsage via `findByUsageIdAndOptionId`; if null skip; add all option-level credits. Finally build one SessionTraitScore per accumulated placement (placement+total), `attempt.addTraitScore`.
- private static `accumulate(map, placement, value)`: computeIfAbsent → add value.
- private static class `Accumulator{ TraitPlacement placement; double total; }`.
- **Invariants:** deterministic server-side scoring; answers to since-removed items are silently ignored (not errors); RANKING treated as plain multi-select sum (flagged as TODO-ish, no rank weighting yet).

### TaxonomyService (`@Service @Transactional`)
Taxonomy rules the mappings can't express: same-MQ parenting, acyclic trees, recycle-bin subtree cascades, "psychometric history never loses its labels" (nothing referenced by score rows is removed, only binned). Repos: MeasuredQuality, MeasuredQualityTrait, TraitPlacement, ItemUsageTraitScore, OptionUsageTraitScore, SessionTraitScore. No change-log.
- `MeasuredQuality createMeasuredQuality(name, description)`: build+save.
- `updateMeasuredQuality(id, name, description)`: liveMq; set.
- `void binMeasuredQuality(id)`: liveMq; moveToBin(now); **cascade** — bin all live placements of the MQ with the SAME `now` timestamp (shared stamp enables precise restore).
- `void restoreMeasuredQuality(id)`: findById else NotFound; capture `binnedAt = mq.getDeletedAt()`; restore MQ; if binnedAt null return; restore exactly the placements whose deletedAt == binnedAt (`findByMeasuredQualityIdAndDeletedAt`).
- `MeasuredQualityTrait createTrait(name, description)`: build+save (comment: names deliberately not unique).
- `updateTrait(id, name, description)`: liveTrait; set.
- `void binTrait(id)`: liveTrait; if `existsByTraitIdAndDeletedAtIsNull` → Conflict "still placed in MQs — remove placements first"; moveToBin.
- `void restoreTrait(id)`: findById else NotFound; restoreFromBin.
- `TraitPlacement placeTrait(mqId, traitId, parentPlacementId, sortOrder)`: liveMq; liveTrait; if `findByMeasuredQualityIdAndTraitId` present → Conflict (message differs if the existing one is binned: "in the recycle bin — restore it instead"); build placement; if parent set, `requireSameMqParent`; save.
- `TraitPlacement movePlacement(placementId, newParentPlacementId, sortOrder)`: livePlacement; setSortOrder; if newParent null → detach; else `requireSameMqParent(placement.mq.id, newParent)`; **acyclic guard** walk newParent ancestors, if any == placementId → Validation "cycle"; setParent.
- `void binPlacementSubtree(placementId)`: livePlacement (root); `binRecursively(root, now)` — depth-first, bins root then all live children with same timestamp. Historical score rows keep pointing at them.
- `void restorePlacementSubtree(placementId)`: findById else NotFound; if parent != null AND parent.isDeleted() → Conflict "Restore the parent first"; `restoreRecursively(root, root.getDeletedAt())`.
- `void deletePlacementPermanently(placementId)` (TRUE hard-delete): findById else NotFound; if referenced by ItemUsage/OptionUsage/SessionTrait score rows (any `existsByPlacementId`) → Conflict "referenced by scoring history, can only be binned"; if has live children (`findByParentIdAndDeletedAtIsNullOrderBySortOrderAsc` non-empty) → Conflict "still has live children"; delete. **Only allowed for placements no score row ever referenced.**
- `@Transactional(readOnly=true) treeRoots(mqId)`: liveMq; roots; `whereUsed(traitId)`: `findByTraitIdAndDeletedAtIsNull`.
- private `binRecursively` / `restoreRecursively` (restore stops if binnedAt null; matches children by shared deletedAt); `requireSameMqParent` (Validation if different MQ); `liveMq`/`liveTrait`/`livePlacement` (all findByIdAndDeletedAtIsNull else NotFound).
- **Invariants owned:** placement tree acyclic + same-MQ; trait bin blocked while placed live; MQ bin cascades to placement subtree via shared timestamp (restore uses same stamp); hard-delete forbidden if any scoring history references the placement or it has live children; shared traits stay live when an MQ is binned.

### UserService (`@Service @Transactional`)
One identity per actor. Repos: User, Role, UserRole. No change-log.
- **Constants:** `ROLE_ADMIN="admin"`, `ROLE_PRACTITIONER="practitioner"`, `ROLE_RESPONDENT="respondent"` (role names are seeded data).
- `User createUser(email, name, LocalDate dob, phone, gender, boolean consent, List<String> roleNames)`: if `existsByEmailIgnoreCase` → Conflict "already exists" (checks binned users too — email unique across bin); build user; if consent set `consentedAt=now`; save; assign each role via `assignRole`.
- `User updateProfile(userId, name, phone, gender, dob)`: liveUser; set fields (email NOT updatable here).
- `User setStatus(userId, UserStatus)`: liveUser; setStatus.
- `User recordConsent(userId, boolean consent)`: liveUser; setConsent; consentedAt = now if consent else null.
- `UserRole assignRole(userId, roleName)`: liveUser; role by name else NotFound; if `existsByUserIdAndRoleId` → Conflict "already has role"; build+save.
- `void revokeRole(userId, roleName)`: role by name else NotFound; UserRole by (user,role) else NotFound; delete (hard delete of the mapping row).
- `void binUser(userId)` / `restoreUser(userId)`: moveToBin(now) / findById+restoreFromBin.
- `@Transactional(readOnly=true) get(userId)`; `getByEmail(email)` (`findByEmailIgnoreCaseAndDeletedAtIsNull` else NotFound); `byRole(roleName)` (`findByRoleName`).
- private `liveUser`: findByIdAndDeletedAtIsNull else NotFound.
- **Invariants owned:** email unique across all users incl. binned; ≤1 UserRole per (user,role); consentedAt tracks consent flag; role assignment centralized here.

---

# SYNTHESIS

**Service-layer ownership map (use-cases):**
- **UserService** — identity, profile, consent, role assign/revoke, user bin/restore. Owns role-name constants.
- **OrganizationService** — org CRUD + status/approval (PENDING→ACTIVE), temporal org membership.
- **RespondentGroupService** — group tree (same-org, acyclic), temporal group membership, bin/restore with sub-group guards.
- **TaxonomyService** — MeasuredQuality, shared Trait library, TraitPlacement tree (per-MQ), recycle-bin cascades, hard-delete guard against scoring history.
- **ItemBankService** — immutable item bank, copy-on-write versioning, validation-status workflow, item bin/restore.
- **QuestionnaireAuthoringService** — questionnaire lifecycle, sections, item usages, option coverage/order, per-usage & per-option scoring config, demographic field wiring; the ONLY change-log writer (via ChangeLogWriter).
- **AssessmentAdminService** — assessment create/lifecycle/status, three allotment kinds + caps (org/group capped, respondent uncapped).
- **DeliveryService** — the take-flow: session provisioning + scope resolution, resume, answer save, submit, admin reset; cap accounting.
- **ScoringService** — server-side frozen scoring; called only by DeliveryService.submit.
- **ChangeLogWriter** — append-only questionnaire change-log write path (`@Component`).

**Cross-service dependencies (Java-level):**
- `DeliveryService → ScoringService` (constructor injection; only inter-service call in the layer).
- `QuestionnaireAuthoringService → ChangeLogWriter` (component, not a service).
- No other service-to-service calls; services share state only through repositories/entities.

**Invariants enforced ONLY in services (not by DB):**
- ≤1 LIVE (archivedAt null) attempt per session — DeliveryService (`liveAttempt`, provision/reset logic).
- ≤1 live session per (assessment,user) — DeliveryService provision guard (`existsByAssessmentIdAndUserIdAndDeletedAtIsNull`).
- Allotment cap accounting (count COMPLETED live attempts vs cap, checked at start + submit) — DeliveryService.checkCap. Cap is a soft rule; DB has no cap trigger. Concurrency note: race only "closed" by re-check, not by locking — TOCTOU still possible under true concurrency.
- Scope resolution priority direct→group→org — DeliveryService.resolveScope.
- Item immutability / copy-on-write — ItemBankService (no update-content method exists; convention, not a DB constraint).
- ≥2 options for non-FREE_TEXT, FREE_TEXT has 0 options — ItemBankService.validate (the "C9 unanswerable-item bug" fix).
- Full option coverage per usage (one row per AnswerOption; reorder-not-hide) — QuestionnaireAuthoringService.addItem/replaceItem/setOptionOrder.
- Replace-item score/order migration by option POSITION — QuestionnaireAuthoringService.replaceItem.
- Acyclic + same-org group tree — RespondentGroupService; acyclic + same-MQ placement tree — TaxonomyService.
- Trait/placement bin guards + "history never loses labels" (no hard-delete if scoring rows reference) — TaxonomyService.
- ≤1 active membership per pair (org & group), leaving = removedAt stamp — Organization/RespondentGroup services.
- Email uniqueness incl. binned users; ≤1 UserRole per pair — UserService.
- Change-log completeness for questionnaire mutations — QuestionnaireAuthoringService (relies on discipline: every mutator calls changeLog.log).

**Gaps / things to flag:**
1. **No status-transition state machine.** `AssessmentAdminService.setStatus`, `OrganizationService.setStatus`, `UserService.setStatus` accept any target status with no legality check (approve is the only guarded transition). `DeliveryService.takeable` only blocks PAUSED — a CLOSED assessment is still takeable/resumable/submittable (only `allottable` blocks CLOSED, on the admin side).
2. **No SessionDemographic write path anywhere.** `SessionDemographicRepository` and `SessionDemographic` entity exist, `setDemographicFields` configures which fields a questionnaire asks, but NO service captures respondent demographic answers during delivery. `DeliveryService.saveAnswer` handles only items/options. Missing use-case.
3. **No DemographicField admin CRUD service.** `DemographicFieldRepository` is read from (Authoring `setDemographicFields`) but nothing creates/edits/bins DemographicField rows. Same for `existsByFieldId` guards never invoked.
4. **RANKING scoring not implemented** — ScoringService sums selected options regardless of rank (documented as future work). rankOrder is stored (SessionAnswerOption) but never used in scoring.
5. **Change-log gaps:** `bin`/`restore` in QuestionnaireAuthoringService do NOT write a change-log entry; neither do score deletes via `replaceItem`'s orphan removal (only the ITEM_REPLACED event). Actor (createdBy) relies entirely on JPA auditing being wired.
6. **`existsByEmailIgnoreCase` ignores deletedAt** — a binned user's email blocks new signups; may be intended but worth noting (no reuse of a deleted user's email).
7. **Cap concurrency** is TOCTOU — comment claims submit re-check "closes the race" but without pessimistic locking two concurrent submits can both pass. DB has no cap constraint.
8. **`versionSuccessors`/`findByPreviousItemId`** exposes lineage children but there's no service method to walk full version history backward (previousItem) or to list an item's whole chain.
9. **Restore methods use plain `findById`** (not deletedAt-filtered) and call `restoreFromBin()` without checking the row is actually binned — restoring an already-live entity is a silent no-op/possible undefined behavior depending on entity impl.
10. Several repo query methods appear unused by services in this layer (e.g. `AssessmentRepository.findByQuestionnaireIdAndStatusNotAndDeletedAtIsNull` — a questionnaire-edit guard — is defined but no service in this package calls it; questionnaire authoring does NOT check whether live assessments are reading a questionnaire before allowing edits). Likely enforced at controller/API layer or not yet wired.
