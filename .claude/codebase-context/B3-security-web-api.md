I'll enumerate the v2 tree and the other target files, then read them all.
I'll read all files in parallel batches.
Now the controllers, application.yml, and pom.xml.
Now the remaining controllers: Taxonomy, ItemBank, Questionnaire, Assessment, Delivery, DemographicField.
Now the four larger controllers: ItemBank, Questionnaire, Assessment, Delivery.
Now the last two: Assessment and Delivery controllers.
Let me grab the definitions of the imported nested records that define the wire format (Selection, PlacementValue, ItemContent, OptionContent) since they are load-bearing for the frontend.
I have all the files I need. Here is the complete structured catalog.

---

# BodhAssess API v2 — File-by-File Context

Package root: `com.bodhpsychometric.bodhassess.v2`. All controllers under `.../v2/web`, all security under `.../v2/security`. Domain model/services/repos live in sibling package `com.bodhpsychometric.bodhassess.domain` (out of scope but referenced).

## ApiV2Application.java
- `@SpringBootApplication(scanBasePackages = "com.bodhpsychometric.bodhassess")` — scans BOTH v2 and domain packages.
- `@EnableJpaRepositories(basePackages = "...domain.repository")`, `@EntityScan(basePackages = "...domain")`.
- Plain `main` → `SpringApplication.run`. No other config.

---

## SECURITY LAYER

### JwtService (`@Component`)
- Stateless HS256 (jjwt 0.11.5). Key = `Keys.hmacShaKeyFor(secret.getBytes(UTF_8))` from `${bodh.security.jwt-secret}`. Expiry = `Duration.ofHours(${bodh.security.jwt-expiry-hours})`.
- Nested public record: `TokenContents(Long userId, List<String> roles, boolean superAdmin)`.
- `issue(Long userId, List<String> roles, boolean superAdmin)` → JWT with: `sub` = String userId, claim `roles` (list of role-name strings), claim `superAdmin` (boolean), `iat`, `exp`. Signed HS256.
- `parse(token)` → `TokenContents` or `null` on `JwtException`/`IllegalArgumentException` (invalid/expired). Reads `sub`→Long, `roles` claim (null→empty list), `superAdmin` claim (`Boolean.TRUE.equals`).
- JWT CLAIM LAYOUT: `{ sub: "<userId>", roles: ["admin","practitioner",...], superAdmin: bool, iat, exp }`. NOTE: `superAdmin` in token is informational only — the authorization path re-reads it from DB (see AccessControlService); it is NOT trusted for the RBAC decision.

### JwtAuthFilter (`@Component extends OncePerRequestFilter`)
- Reads `Authorization` header; if starts with `Bearer `, strips 7 chars, calls `jwtService.parse`.
- On valid token: builds `List<SimpleGrantedAuthority>` mapping each role → `"ROLE_" + role`; sets `UsernamePasswordAuthenticationToken(principal = contents.userId() [Long], credentials = null, authorities)` into `SecurityContextHolder`.
- Invalid/absent token → stays anonymous (no exception). Always calls `chain.doFilter`.
- KEY: the principal is a bare `Long` (userId). Downstream code everywhere checks `principal instanceof Long userId`.

### AccessControlService (`@Service`)
- The actual RBAC decision. `@Transactional(readOnly=true) boolean mayAccess(Long userId, String path)`:
  1. `userRepository.findByIdAndDeletedAtIsNull(userId)`; null or `status != UserStatus.ACTIVE` → **false**.
  2. `user.isSuperAdmin()` (from DB) → **true** (bypass).
  3. Else iterate `user.getRoles()` → each `UserRole.getRole().getUrlPaths()` (Set<String>); if `AntPathMatcher.match(pattern, path)` → **true**.
  4. Otherwise **false**.
- Reads DB per request (no cache) so role-path edits apply immediately. superAdmin comes from the persisted User, not the JWT.

### RoleUrlPathAuthorizationManager (`@Component implements AuthorizationManager<RequestAuthorizationContext>`)
- Bridges Spring Security to AccessControlService. `check`: gets Authentication; if null or `principal !instanceof Long` → `AuthorizationDecision(false)` (anonymous denied → 401 via entry point). Else returns `AuthorizationDecision(accessControl.mayAccess(userId, request.getRequestURI()))`.
- Matches against `getRequestURI()` (full path incl. context, no query string).

### SecurityConfig (`@Configuration @EnableWebSecurity`)
- Single `SecurityFilterChain filterChain(HttpSecurity)`:
  - `csrf.disable()`
  - `cors(Customizer.withDefaults())` — uses the CorsConfigurationSource bean below.
  - `sessionCreationPolicy(STATELESS)`
  - `formLogin.disable()`, `httpBasic.disable()`
  - `exceptionHandling.authenticationEntryPoint(unauthorizedEntryPoint())`
  - `authorizeHttpRequests`: **permitAll list = exactly `"/api/v2/auth/login"` and `"/error"`**; `anyRequest().access(roleUrlPathManager)`.
  - `addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)`.
- CORS BEAN `corsConfigurationSource(@Value ${bodh.security.cors-allowed-origins} List<String>)`: allowedOrigins from config; allowedMethods = `GET,POST,PUT,PATCH,DELETE,OPTIONS`; allowedHeaders = `Authorization, Content-Type`; `allowCredentials(true)`; maxAge 3600; registered for `/**`. **CORS IS configured** (exact-origin list, credentials true — note allowCredentials+explicit origins, no wildcard).
- Entry point `unauthorizedEntryPoint()`: sets 401, `application/json`, body `{"error":"authentication required"}`.
- NOTE: `/api/v2/auth/me` is NOT in permitAll — requires a valid token AND passing the RBAC manager (needs a role whose urlPaths match `/api/v2/auth/**`; practitioner/respondent/admin all have it).

### SecurityCurrentUserResolver (`@Component implements domain.auditing.CurrentUserResolver`)
- Auditing bridge for createdBy/updatedBy. `currentUser()`: reads SecurityContext auth; if null or `principal !instanceof Long` → `Optional.empty()`; else `userRepository.findByIdAndDeletedAtIsNull(userId)`.
- Unauthenticated work (bootstrap, migrations) audits null.

### BootstrapDataRunner (`@Component implements CommandLineRunner`, `@Transactional run`)
- Idempotent first-run seeding. Injected `@Value`: `${bodh.security.bootstrap-admin-email}`, `...-dob`, `...-name`.
- Ensures 3 roles via `ensureRole(name, description, defaultPaths)` — only creates if `roleRepository.findByName` absent (admin edits never overwritten):
  - `UserService.ROLE_ADMIN` — "Full platform administration" — paths `{"/api/v2/**"}`.
  - `UserService.ROLE_PRACTITIONER` — "Authoring and assessment administration" — paths `{"/api/v2/auth/**","/api/v2/taxonomy/**","/api/v2/items/**","/api/v2/questionnaires/**","/api/v2/assessments/**","/api/v2/delivery/**","/api/v2/demographic-fields/**"}`. NOTE: practitioner does NOT get `/api/v2/users/**` or `/api/v2/organizations/**`.
  - `UserService.ROLE_RESPONDENT` — "Taking assessments via the portal" — paths `{"/api/v2/auth/**","/api/v2/delivery/**"}`.
- If `adminEmail` non-blank AND `!existsByEmailIgnoreCase(adminEmail)`: creates a `User` (email, name, dob parsed via `LocalDate.parse` if non-blank, `superAdmin=true`, `consent=true`), saves, then creates `UserRole` linking that user → admin role.

---

## CONTROLLERS — REST API CATALOG

### GlobalExceptionHandler (`@RestControllerAdvice`)
Maps domain service exceptions → HTTP, body `{"error": e.getMessage()}`:
- `NotFoundException` → 404
- `ConflictException` → 409
- `ValidationException` → 400
(No handler for generic exceptions; ResponseStatusException from AuthController handled by Spring default.)

---

### AuthController (`/api/v2/auth`)
DTO records:
- `LoginRequest(String email, LocalDate dob)`
- `LoginResponse(String token, Long userId, String email, String name, List<String> roles, boolean superAdmin)`

| Method+Path | Request | Response | Status | Service call | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/auth/login` | LoginRequest | LoginResponse | 200; 401 "invalid credentials" | `userRepository.findByEmailIgnoreCaseAndDeletedAtIsNull` | **PermitAll**. Credential = email + DOB. Null email → "". 401 if not found, or status≠ACTIVE, or dob null, or dob mismatch. Same message for all (no enumeration). Sets `lastLoginAt`. roles sorted alphabetically. `@Transactional`. |
| GET `/api/v2/auth/me` | — | LoginResponse (token=null) | 200; 401 | reads SecurityContext principal, `findByIdAndDeletedAtIsNull` | Requires auth. `@Transactional(readOnly)`. |

---

### UserController (`/api/v2/users`)
DTO records:
- `CreateUserRequest(String email, String name, LocalDate dob, String phone, String gender, boolean consent, List<String> roles)`
- `ProfileRequest(String name, String phone, String gender, LocalDate dob)`
- `StatusRequest(UserStatus status)`
- `UserDto(Long id, String email, String name, LocalDate dob, String phone, String gender, UserStatus status, boolean superAdmin, boolean consent, List<String> roles)` — `roles` = sorted role names.

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/users` | CreateUserRequest | UserDto | 201 | `users.createUser(...)` | |
| GET `/api/v2/users/{id}` | — | UserDto | 200 | `users.get(id)` | |
| GET `/api/v2/users` | query `role?`, `search?` | List<UserDto> | 200 | `users.byRole(role)` OR `userRepository.findByNameContainingIgnoreCaseAndDeletedAtIsNull(search)` OR `findByDeletedAtIsNull()` | role wins over search. **No pagination** (returns full list). |
| PUT `/api/v2/users/{id}` | ProfileRequest | UserDto | 200 | `users.updateProfile(id,name,phone,gender,dob)` | |
| PUT `/api/v2/users/{id}/status` | StatusRequest | UserDto | 200 | `users.setStatus(id,status)` | |
| POST `/api/v2/users/{id}/roles/{roleName}` | — | void | 201 | `users.assignRole(id,roleName)` | |
| DELETE `/api/v2/users/{id}/roles/{roleName}` | — | void | 204 | `users.revokeRole(id,roleName)` | |
| DELETE `/api/v2/users/{id}` | — | void | 204 | `users.binUser(id)` | soft-delete |
| POST `/api/v2/users/{id}/restore` | — | void | 200 | `users.restoreUser(id)` | |

---

### OrganizationController (`/api/v2/organizations`)
DTO records:
- `OrganizationRequest(String name, String website, String contactName, String contactEmail, String contactPhone, Boolean selfSignup)`
- `StatusRequest(OrganizationStatus status)`
- `GroupRequest(String name, String description, Long parentGroupId)`
- `MoveGroupRequest(Long parentGroupId)`
- `OrganizationDto(Long id, String name, String website, String contactName, String contactEmail, String contactPhone, OrganizationStatus status)`
- `MemberDto(Long id, Long userId, String joinedAt, String removedAt)` — timestamps `.toString()`; two `from` overloads (OrganizationMember using `getCreatedAt`, RespondentGroupMember using `getCreatedAt`). NOTE `joinedAt` maps from `createdAt`.
- `GroupDto(Long id, Long organizationId, String name, String description, Long parentGroupId)`

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/organizations` | OrganizationRequest | OrganizationDto | 201 | `organizations.create(org, selfSignup)` | Builds Organization from body; `selfSignup` via `Boolean.TRUE.equals`. |
| GET `/api/v2/organizations` | — | List<OrganizationDto> | 200 | `organizationRepository.findByDeletedAtIsNullOrderByNameAsc()` | No pagination. |
| GET `/api/v2/organizations/pending` | — | List<OrganizationDto> | 200 | `findByStatusAndDeletedAtIsNullOrderByCreatedAtDesc(PENDING)` | |
| GET `/api/v2/organizations/{id}` | — | OrganizationDto | 200 | `organizations.get(id)` | |
| POST `/api/v2/organizations/{id}/approve` | — | OrganizationDto | 200 | `organizations.approve(id)` | |
| PUT `/api/v2/organizations/{id}/status` | StatusRequest | OrganizationDto | 200 | `organizations.setStatus(id,status)` | |
| DELETE `/api/v2/organizations/{id}` | — | void | 204 | `organizations.bin(id)` | |
| POST `/api/v2/organizations/{id}/restore` | — | void | 200 | `organizations.restore(id)` | |
| POST `/api/v2/organizations/{id}/members/{userId}` | — | MemberDto | 201 | `organizations.addMember(id,userId)` | |
| DELETE `/api/v2/organizations/{id}/members/{userId}` | — | void | 204 | `organizations.removeMember(id,userId)` | |
| GET `/api/v2/organizations/{id}/members` | — | List<MemberDto> | 200 | `organizations.activeMembers(id)` | |
| GET `/api/v2/organizations/{id}/members/history` | — | List<MemberDto> | 200 | `organizations.membershipHistory(id)` | temporal history |
| POST `/api/v2/organizations/{id}/groups` | GroupRequest | GroupDto | 201 | `groups.create(id,name,description,parentGroupId)` | |
| GET `/api/v2/organizations/{id}/groups` | — | List<GroupDto> | 200 | `groups.rootsOf(id)` | returns ROOT groups only (tree roots) |
| PUT `/api/v2/organizations/groups/{groupId}` | GroupRequest | GroupDto | 200 | `groups.update(groupId,name,description)` | parentGroupId in body ignored here |
| PUT `/api/v2/organizations/groups/{groupId}/move` | MoveGroupRequest | GroupDto | 200 | `groups.move(groupId,parentGroupId)` | |
| DELETE `/api/v2/organizations/groups/{groupId}` | — | void | 204 | `groups.bin(groupId)` | |
| POST `/api/v2/organizations/groups/{groupId}/restore` | — | void | 200 | `groups.restore(groupId)` | |
| POST `/api/v2/organizations/groups/{groupId}/members/{userId}` | — | MemberDto | 201 | `groups.addMember(groupId,userId)` | |
| DELETE `/api/v2/organizations/groups/{groupId}/members/{userId}` | — | void | 204 | `groups.removeMember(groupId,userId)` | |
| GET `/api/v2/organizations/groups/{groupId}/members` | — | List<MemberDto> | 200 | `groups.activeMembers(groupId)` | |

QUIRK: group endpoints live under `/api/v2/organizations/groups/...` (flat, not nested under `{id}`) except create/list which are under `/{id}/groups`.

---

### TaxonomyController (`/api/v2/taxonomy`)
DTO records:
- `NameDescription(String name, String description)`
- `PlaceTraitRequest(Long mqId, Long traitId, Long parentPlacementId, Integer sortOrder)`
- `MoveRequest(Long parentPlacementId, Integer sortOrder)`
- `MqDto(Long id, String name, String description)`
- `TraitDto(Long id, String name, String description)`
- `PlacementNode(Long id, Long traitId, String traitName, int sortOrder, List<PlacementNode> children)` — recursive tree; filters `!c.isDeleted()` children.

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/taxonomy/mqs` | NameDescription | MqDto | 201 | `taxonomy.createMeasuredQuality(name,desc)` | |
| GET `/api/v2/taxonomy/mqs` | — | List<MqDto> | 200 | `mqRepository.findByDeletedAtIsNullOrderByNameAsc()` | |
| PUT `/api/v2/taxonomy/mqs/{id}` | NameDescription | MqDto | 200 | `taxonomy.updateMeasuredQuality(id,...)` | |
| DELETE `/api/v2/taxonomy/mqs/{id}` | — | void | 204 | `taxonomy.binMeasuredQuality(id)` | |
| POST `/api/v2/taxonomy/mqs/{id}/restore` | — | void | 200 | `taxonomy.restoreMeasuredQuality(id)` | |
| GET `/api/v2/taxonomy/mqs/{id}/tree` | — | List<PlacementNode> | 200 | `taxonomy.treeRoots(id)` | trait placement tree for an MQ |
| POST `/api/v2/taxonomy/traits` | NameDescription | TraitDto | 201 | `taxonomy.createTrait(...)` | |
| GET `/api/v2/taxonomy/traits` | query `search?` | List<TraitDto> | 200 | `findByDeletedAtIsNullOrderByNameAsc()` OR `findByNameContainingIgnoreCaseAndDeletedAtIsNull(search)` | |
| PUT `/api/v2/taxonomy/traits/{id}` | NameDescription | TraitDto | 200 | `taxonomy.updateTrait(...)` | |
| DELETE `/api/v2/taxonomy/traits/{id}` | — | void | 204 | `taxonomy.binTrait(id)` | |
| POST `/api/v2/taxonomy/traits/{id}/restore` | — | void | 200 | `taxonomy.restoreTrait(id)` | |
| GET `/api/v2/taxonomy/traits/{id}/where-used` | — | List<PlacementNode> | 200 | `taxonomy.whereUsed(id)` | |
| POST `/api/v2/taxonomy/placements` | PlaceTraitRequest | PlacementNode | 201 | `taxonomy.placeTrait(mqId,traitId,parentPlacementId,sortOrder??0)` | null sortOrder→0 |
| PUT `/api/v2/taxonomy/placements/{id}/move` | MoveRequest | PlacementNode | 200 | `taxonomy.movePlacement(id,parentPlacementId,sortOrder??0)` | |
| DELETE `/api/v2/taxonomy/placements/{id}` | — | void | 204 | `taxonomy.binPlacementSubtree(id)` | soft-delete subtree |
| POST `/api/v2/taxonomy/placements/{id}/restore` | — | void | 200 | `taxonomy.restorePlacementSubtree(id)` | |
| DELETE `/api/v2/taxonomy/placements/{id}/permanent` | — | void | 204 | `taxonomy.deletePlacementPermanently(id)` | hard delete |

---

### ItemBankController (`/api/v2/items`)
DTO records:
- `OptionRequest(String text, String mediaUrl, String mediaType)`
- `ItemRequest(ItemFormat format, String stem, String mediaUrl, String mediaType, List<OptionRequest> options, Set<String> languages)`
- `StatusRequest(ValidationStatus status)`
- `OptionDto(Long id, int sortOrder, String text, String mediaUrl, String mediaType)`
- `ItemDto(Long id, ItemFormat format, String stem, String mediaUrl, String mediaType, ValidationStatus validationStatus, Long previousItemId, List<OptionDto> options)`
- Wire-format records from service (imported): `ItemContent(ItemFormat format, String stem, String mediaUrl, String mediaType, List<OptionContent> options)`, `OptionContent(String text, String mediaUrl, String mediaType)`. Controller's `toContent()` maps ItemRequest→ItemContent (null options→empty list).

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/items` | ItemRequest | ItemDto | 201 | `itemBank.createItem(content, languages)` | |
| POST `/api/v2/items/{id}/edit` | ItemRequest | ItemDto | 201 | `itemBank.editAsNewVersion(id, content)` | **Copy-on-write**: returns NEW version, nothing repointed. |
| GET `/api/v2/items/{id}` | — | ItemDto | 200 | `itemBank.get(id)` | |
| GET `/api/v2/items` | query `search?`, `format?` (ItemFormat enum) | List<ItemDto> | 200 | `findByStemContainingIgnoreCaseAndDeletedAtIsNull` OR `findByFormatAndDeletedAtIsNull` OR `findByDeletedAtIsNull` | search wins over format. No pagination. |
| GET `/api/v2/items/{id}/successors` | — | List<ItemDto> | 200 | `itemBank.versionSuccessors(id)` | version chain |
| PUT `/api/v2/items/{id}/validation-status` | StatusRequest | ItemDto | 200 | `itemBank.setValidationStatus(id,status)` | |
| DELETE `/api/v2/items/{id}` | — | void | 204 | `itemBank.binItem(id)` | |
| POST `/api/v2/items/{id}/restore` | — | void | 200 | `itemBank.restoreItem(id)` | |

---

### QuestionnaireController (`/api/v2/questionnaires`)
DTO records:
- `QuestionnaireRequest(String name, String shortName, String category, String vertical, String description, Integer durationMinutes, Long organizationId)`
- `SectionRequest(String title, Integer sortOrder)`
- `AddItemRequest(Long itemId, Long sectionId, Integer sortOrder)`
- `MoveItemRequest(Long sectionId, Integer sortOrder)`
- `ReplaceItemRequest(Long newItemId)`
- `ScoresRequest(List<PlacementValue> scores)` — `PlacementValue(Long placementId, double value)` (imported from QuestionnaireAuthoringService).
- `OptionOrderRequest(List<Long> optionIds)`
- `DemographicFieldsRequest(List<Long> fieldIds)`
- `QuestionnaireDto(Long id, String name, String shortName, String category, String vertical, String description, Integer durationMinutes, Long organizationId)`
- `SectionDto(Long id, String title, int sortOrder)`
- `OptionUsageDto(Long id, Long optionId, int displayOrder)`
- `UsageDto(Long id, Long itemId, Long sectionId, int sortOrder, List<OptionUsageDto> options)`
- `ChangeLogDto(Long id, String changeType, String details, String changedAt)` — changeType = enum `.name()`, changedAt = `createdAt.toString()`.

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/questionnaires` | QuestionnaireRequest | QuestionnaireDto | 201 | `authoring.create(q)` | `apply()` resolves organizationId → Organization (404 if missing), null clears it. |
| PUT `/api/v2/questionnaires/{id}` | QuestionnaireRequest | QuestionnaireDto | 200 | `authoring.updateMetadata(id, q->apply(q,body))` | |
| GET `/api/v2/questionnaires` | — | List<QuestionnaireDto> | 200 | `questionnaireRepository.findByDeletedAtIsNullOrderByNameAsc()` | No pagination. |
| GET `/api/v2/questionnaires/{id}` | — | QuestionnaireDto | 200 | `authoring.get(id)` | |
| GET `/api/v2/questionnaires/{id}/items` | — | List<UsageDto> | 200 | `usageRepository.findByQuestionnaireIdOrderBySortOrderAsc(id)` | |
| GET `/api/v2/questionnaires/{id}/change-log` | — | List<ChangeLogDto> | 200 | `changeLogRepository.findByQuestionnaireIdOrderByCreatedAtDesc(id)` | |
| DELETE `/api/v2/questionnaires/{id}` | — | void | 204 | `authoring.bin(id)` | |
| POST `/api/v2/questionnaires/{id}/restore` | — | void | 200 | `authoring.restore(id)` | |
| POST `/api/v2/questionnaires/{id}/sections` | SectionRequest | SectionDto | 201 | `authoring.addSection(id,title,sortOrder??0)` | |
| PUT `/api/v2/questionnaires/sections/{sectionId}` | SectionRequest | SectionDto | 200 | `authoring.updateSection(sectionId,title,sortOrder??0)` | flat path |
| DELETE `/api/v2/questionnaires/sections/{sectionId}` | — | void | 204 | `authoring.deleteSection(sectionId)` | |
| POST `/api/v2/questionnaires/{id}/items` | AddItemRequest | UsageDto | 201 | `authoring.addItem(id,itemId,sectionId,sortOrder??0)` | |
| DELETE `/api/v2/questionnaires/usages/{usageId}` | — | void | 204 | `authoring.removeItem(usageId)` | |
| PUT `/api/v2/questionnaires/usages/{usageId}/move` | MoveItemRequest | UsageDto | 200 | `authoring.moveItem(usageId,sectionId,sortOrder??0)` | |
| PUT `/api/v2/questionnaires/usages/{usageId}/replace` | ReplaceItemRequest | UsageDto | 200 | `authoring.replaceItem(usageId,newItemId)` | explicit repoint to CoW version |
| PUT `/api/v2/questionnaires/usages/{usageId}/scores` | ScoresRequest | UsageDto | 200 | `authoring.setItemScores(usageId,scores)` | |
| PUT `/api/v2/questionnaires/option-usages/{optionUsageId}/scores` | ScoresRequest | OptionUsageDto | 200 | `authoring.setOptionScores(optionUsageId,scores)` | |
| PUT `/api/v2/questionnaires/usages/{usageId}/option-order` | OptionOrderRequest | UsageDto | 200 | `authoring.setOptionOrder(usageId,optionIds)` | |
| PUT `/api/v2/questionnaires/{id}/demographic-fields` | DemographicFieldsRequest | void | 200 | `authoring.setDemographicFields(id,fieldIds)` | |

---

### AssessmentController (`/api/v2/assessments`)
DTO records:
- `CreateAssessmentRequest(String name, Long questionnaireId, Boolean autoNext, Set<String> languages)`
- `StatusRequest(AssessmentStatus status)`
- `OrgAllotmentRequest(Long organizationId, Integer cap)`
- `GroupAllotmentRequest(Long groupId, Integer cap)`
- `RespondentAllotmentRequest(Long userId)`
- `CapRequest(Integer cap)`
- `AssessmentDto(Long id, String name, Long questionnaireId, AssessmentStatus status, boolean autoNext, Set<String> languages)`
- `AllotmentDto(Long id, String kind, Long targetId, Integer cap)` — `kind` ∈ `"organization"|"group"|"respondent"`; respondent allotments have `cap=null`.

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/assessments` | CreateAssessmentRequest | AssessmentDto | 201 | `assessments.create(name,questionnaireId,autoNext,languages)` | autoNext via `Boolean.TRUE.equals`. |
| GET `/api/v2/assessments` | — | List<AssessmentDto> | 200 | `assessments.listLive()` | No pagination. |
| GET `/api/v2/assessments/{id}` | — | AssessmentDto | 200 | `assessments.get(id)` | |
| PUT `/api/v2/assessments/{id}/status` | StatusRequest | AssessmentDto | 200 | `assessments.setStatus(id,status)` | |
| DELETE `/api/v2/assessments/{id}` | — | void | 204 | `assessments.bin(id)` | |
| POST `/api/v2/assessments/{id}/restore` | — | void | 200 | `assessments.restore(id)` | |
| GET `/api/v2/assessments/{id}/allotments` | — | List<AllotmentDto> | 200 | orgAllotments+groupAllotments+respondentAllotments `findByAssessmentId(id)` | merges 3 repos into one flat list |
| POST `/api/v2/assessments/{id}/allotments/organizations` | OrgAllotmentRequest | AllotmentDto | 201 | `assessments.allotToOrganization(id,orgId,cap)` | |
| PUT `/api/v2/assessments/{id}/allotments/organizations/{organizationId}/cap` | CapRequest | AllotmentDto | 200 | `assessments.updateOrganizationCap(id,orgId,cap)` | |
| POST `/api/v2/assessments/{id}/allotments/groups` | GroupAllotmentRequest | AllotmentDto | 201 | `assessments.allotToGroup(id,groupId,cap)` | |
| PUT `/api/v2/assessments/{id}/allotments/groups/{groupId}/cap` | CapRequest | AllotmentDto | 200 | `assessments.updateGroupCap(id,groupId,cap)` | |
| POST `/api/v2/assessments/{id}/allotments/respondents` | RespondentAllotmentRequest | AllotmentDto | 201 | `assessments.allotToRespondent(id,userId)` | cap always null |

NOTE: no DELETE for allotments; no cap-update for respondent allotments.

---

### DeliveryController (`/api/v2/delivery`)
DTO records:
- `ProvisionRequest(Long assessmentId, Long userId, String language)`
- `AnswerRequest(Long itemId, List<Selection> selections, String freeText)` — `Selection(Long optionId, Integer rankOrder)` (imported from DeliveryService).
- `SessionDto(Long id, Long assessmentId, Long userId, Long organizationId, Long groupId, String language, Integer liveAttemptNumber, AttemptStatus liveAttemptStatus)` — org/group nullable; liveAttempt fields null when no live attempt.
- `AttemptDto(Long id, int attemptNumber, AttemptStatus status, String startedAt, String completedAt)` — timestamps `.toString()` or null.
- `SelectionDto(Long optionId, Integer rankOrder)`
- `AnswerDto(Long id, Long itemId, String freeText, List<SelectionDto> selections)`
- `ResultDto(Long placementId, Long traitId, String traitName, Long measuredQualityId, double value)`

| Method+Path | Request | Response | Status | Service | Notes |
|---|---|---|---|---|---|
| POST `/api/v2/delivery/sessions` | ProvisionRequest | SessionDto | 201 | `delivery.provisionSession(assessmentId,userId,language)` | |
| GET `/api/v2/delivery/sessions/{id}` | — | SessionDto | 200 | `delivery.getSession(id)` | |
| POST `/api/v2/delivery/sessions/{id}/start` | — | AttemptDto | 200 | `delivery.startOrResume(id)` | start OR resume live attempt |
| GET `/api/v2/delivery/sessions/{id}/answers` | — | List<AnswerDto> | 200 | `delivery.answersOfLiveAttempt(id)` | partial answers |
| PUT `/api/v2/delivery/sessions/{id}/answers` | AnswerRequest | AnswerDto | 200 | `delivery.saveAnswer(id,itemId,selections,freeText)` | upsert single answer |
| POST `/api/v2/delivery/sessions/{id}/submit` | — | AttemptDto | 200 | `delivery.submit(id)` | server-side scoring, result frozen |
| GET `/api/v2/delivery/sessions/{id}/results` | — | List<ResultDto> | 200 | `delivery.resultsOfLiveAttempt(id)` | trait scores |
| POST `/api/v2/delivery/sessions/{id}/reset` | — | AttemptDto | 200 | `delivery.reset(id)` | admin: archives live attempt, spawns next; nothing wiped |

---

## application.yml (every property)
- `server.port: 8081` (legacy keeps 8080 during migration).
- `spring.mvc.log-request-details: true` — headers/params in DEBUG request logs.
- `spring.datasource.url: ${DB_URL:jdbc:mysql://localhost:3306/bodhassess_v2}`, `username: ${DB_USER:root}`, `password: ${DB_PASSWORD:}`.
- `spring.jpa.hibernate.ddl-auto: ${DDL_AUTO:none}` — Flyway owns schema, Hibernate never writes DDL.
- `spring.jpa.hibernate.naming.physical-strategy: PhysicalNamingStrategyStandardImpl` — respects explicit PascalCase `@Table`/`@Column` verbatim (no snake_case).
- `spring.jpa.open-in-view: true` — OSIV enabled (lazy loading in controllers works; DTO `from()` methods traverse lazy collections at serialization time).
- `spring.flyway.enabled: true`, `locations: classpath:db/migration`, `placeholders.legacyDb: ${LEGACY_DB:bodhassess}` (empty → V2 legacy data migration skips gracefully).
- `bodh.security.jwt-secret: ${JWT_SECRET:bodh-dev-only-secret-change-me-0123456789abcdef}` (HS256 needs ≥32 bytes; default dev only).
- `bodh.security.jwt-expiry-hours: ${JWT_EXPIRY_HOURS:12}`.
- `bodh.security.bootstrap-admin-email: ${BOOTSTRAP_ADMIN_EMAIL:}` (empty by default → no bootstrap admin), `-dob: ${BOOTSTRAP_ADMIN_DOB:}`, `-name: ${BOOTSTRAP_ADMIN_NAME:Platform Admin}`.
- `bodh.security.cors-allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5173}` — dev frontend origins by default.
- `logging.level.web: ${WEB_LOG_LEVEL:DEBUG}`, `logging.level.org.springframework.security: ${SECURITY_LOG_LEVEL:INFO}`.

## pom.xml (every dependency)
- Parent: `spring-boot-starter-parent 3.1.5`. Java 17. artifactId `bodhassess-api-v2` v1.0.0, jar.
- Deps: `spring-boot-starter-web`, `spring-boot-starter-data-jpa`, `spring-boot-starter-security`; `jjwt-api 0.11.5`, `jjwt-impl 0.11.5` (runtime), `jjwt-jackson 0.11.5` (runtime); `mysql-connector-j` (runtime); `flyway-core`, `flyway-mysql`; `spring-boot-starter-test` (test), `h2` (test); `spring-aspects` (for SchemaGenerationTest's `@Configurable` AuditingEntityListener).
- Build: `spring-boot-maven-plugin`.
- NOTE: this single module contains BOTH the v2 web layer AND the `domain` package (model/repo/service/migrations) — the domain module was folded in (per recent commit "fold bodhassess-domain into bodhassess-api-v2").

---

## SYNTHESIS

### Complete endpoint table (grouped by controller)
```
AUTH
POST   /api/v2/auth/login                    → login by email+DOB, returns JWT      [PERMIT-ALL]
GET    /api/v2/auth/me                        → current user profile (no token in resp)

USERS
POST   /api/v2/users                          → create user
GET    /api/v2/users/{id}                     → get user
GET    /api/v2/users                          → list (?role / ?search)
PUT    /api/v2/users/{id}                     → update profile
PUT    /api/v2/users/{id}/status              → set status
POST   /api/v2/users/{id}/roles/{roleName}    → assign role
DELETE /api/v2/users/{id}/roles/{roleName}    → revoke role
DELETE /api/v2/users/{id}                     → soft-delete
POST   /api/v2/users/{id}/restore             → restore

ORGANIZATIONS
POST   /api/v2/organizations                  → create
GET    /api/v2/organizations                  → list
GET    /api/v2/organizations/pending          → list pending
GET    /api/v2/organizations/{id}             → get
POST   /api/v2/organizations/{id}/approve     → approve
PUT    /api/v2/organizations/{id}/status      → set status
DELETE /api/v2/organizations/{id}             → soft-delete
POST   /api/v2/organizations/{id}/restore     → restore
POST   /api/v2/organizations/{id}/members/{userId}          → add member
DELETE /api/v2/organizations/{id}/members/{userId}          → remove member
GET    /api/v2/organizations/{id}/members                   → active members
GET    /api/v2/organizations/{id}/members/history           → membership history
POST   /api/v2/organizations/{id}/groups                    → create group
GET    /api/v2/organizations/{id}/groups                    → root groups
PUT    /api/v2/organizations/groups/{groupId}               → update group
PUT    /api/v2/organizations/groups/{groupId}/move          → move group
DELETE /api/v2/organizations/groups/{groupId}               → bin group
POST   /api/v2/organizations/groups/{groupId}/restore       → restore group
POST   /api/v2/organizations/groups/{groupId}/members/{userId}   → add group member
DELETE /api/v2/organizations/groups/{groupId}/members/{userId}   → remove group member
GET    /api/v2/organizations/groups/{groupId}/members            → group members

TAXONOMY
POST   /api/v2/taxonomy/mqs                    → create measured quality
GET    /api/v2/taxonomy/mqs                    → list MQs
PUT    /api/v2/taxonomy/mqs/{id}               → update MQ
DELETE /api/v2/taxonomy/mqs/{id}               → bin MQ
POST   /api/v2/taxonomy/mqs/{id}/restore       → restore MQ
GET    /api/v2/taxonomy/mqs/{id}/tree          → MQ trait tree
POST   /api/v2/taxonomy/traits                 → create trait
GET    /api/v2/taxonomy/traits                 → list traits (?search)
PUT    /api/v2/taxonomy/traits/{id}            → update trait
DELETE /api/v2/taxonomy/traits/{id}            → bin trait
POST   /api/v2/taxonomy/traits/{id}/restore    → restore trait
GET    /api/v2/taxonomy/traits/{id}/where-used → placements using trait
POST   /api/v2/taxonomy/placements             → place trait
PUT    /api/v2/taxonomy/placements/{id}/move   → move placement
DELETE /api/v2/taxonomy/placements/{id}        → bin subtree
POST   /api/v2/taxonomy/placements/{id}/restore→ restore subtree
DELETE /api/v2/taxonomy/placements/{id}/permanent → hard-delete

ITEMS
POST   /api/v2/items                           → create item
POST   /api/v2/items/{id}/edit                 → copy-on-write edit (new version)
GET    /api/v2/items/{id}                       → get
GET    /api/v2/items                            → list (?search / ?format)
GET    /api/v2/items/{id}/successors            → version successors
PUT    /api/v2/items/{id}/validation-status     → set validation status
DELETE /api/v2/items/{id}                       → bin
POST   /api/v2/items/{id}/restore               → restore

QUESTIONNAIRES
POST   /api/v2/questionnaires                    → create
PUT    /api/v2/questionnaires/{id}               → update metadata
GET    /api/v2/questionnaires                    → list
GET    /api/v2/questionnaires/{id}               → get
GET    /api/v2/questionnaires/{id}/items         → item usages
GET    /api/v2/questionnaires/{id}/change-log    → change log
DELETE /api/v2/questionnaires/{id}               → bin
POST   /api/v2/questionnaires/{id}/restore       → restore
POST   /api/v2/questionnaires/{id}/sections      → add section
PUT    /api/v2/questionnaires/sections/{sectionId}   → update section
DELETE /api/v2/questionnaires/sections/{sectionId}   → delete section
POST   /api/v2/questionnaires/{id}/items         → add item usage
DELETE /api/v2/questionnaires/usages/{usageId}   → remove usage
PUT    /api/v2/questionnaires/usages/{usageId}/move       → move usage
PUT    /api/v2/questionnaires/usages/{usageId}/replace    → repoint to CoW version
PUT    /api/v2/questionnaires/usages/{usageId}/scores     → set item scores
PUT    /api/v2/questionnaires/option-usages/{optionUsageId}/scores → set option scores
PUT    /api/v2/questionnaires/usages/{usageId}/option-order        → reorder options
PUT    /api/v2/questionnaires/{id}/demographic-fields             → set demographic fields

ASSESSMENTS
POST   /api/v2/assessments                       → create
GET    /api/v2/assessments                       → list live
GET    /api/v2/assessments/{id}                  → get
PUT    /api/v2/assessments/{id}/status           → set status
DELETE /api/v2/assessments/{id}                  → bin
POST   /api/v2/assessments/{id}/restore          → restore
GET    /api/v2/assessments/{id}/allotments       → list allotments (merged)
POST   /api/v2/assessments/{id}/allotments/organizations         → allot to org
PUT    /api/v2/assessments/{id}/allotments/organizations/{orgId}/cap → update org cap
POST   /api/v2/assessments/{id}/allotments/groups                → allot to group
PUT    /api/v2/assessments/{id}/allotments/groups/{groupId}/cap  → update group cap
POST   /api/v2/assessments/{id}/allotments/respondents           → allot to respondent

DELIVERY
POST   /api/v2/delivery/sessions                 → provision session
GET    /api/v2/delivery/sessions/{id}            → get session
POST   /api/v2/delivery/sessions/{id}/start      → start/resume attempt
GET    /api/v2/delivery/sessions/{id}/answers    → live attempt answers
PUT    /api/v2/delivery/sessions/{id}/answers    → save answer
POST   /api/v2/delivery/sessions/{id}/submit     → submit + score
GET    /api/v2/delivery/sessions/{id}/results    → trait results
POST   /api/v2/delivery/sessions/{id}/reset      → admin reset (archive+respawn)
```

### Auth model (5 lines)
1. Login = email + DOB (permanent credential, single identity for dashboard+portal); success mints a stateless HS256 JWT `{sub=userId, roles[], superAdmin}` valid `jwt-expiry-hours` (default 12h).
2. `JwtAuthFilter` turns a Bearer token into an `Authentication` whose principal is the bare `Long` userId (roles become `ROLE_*` authorities but authorities are NOT used for the actual decision).
3. Every request except `/api/v2/auth/login` and `/error` hits `RoleUrlPathAuthorizationManager` → `AccessControlService.mayAccess(userId, requestURI)`.
4. Decision (DB-read per request, no cache): user must exist, not soft-deleted, status ACTIVE; superAdmin (DB flag) bypasses everything; otherwise one of the user's roles' `urlPaths` (Ant patterns, admin-editable, seeded by BootstrapDataRunner) must match the URI.
5. Session STATELESS, CSRF disabled, form/basic disabled, anonymous → 401 JSON `{"error":"authentication required"}`; auditing createdBy/updatedBy resolved from the same JWT principal via `SecurityCurrentUserResolver`.

### Odd / missing / risks
- **NO pagination anywhere.** Every list endpoint (`GET /users`, `/organizations`, `/questionnaires`, `/items`, `/assessments`, `/taxonomy/*`, all `.../members`, `.../answers`, `.../results`, `.../change-log`) returns an unbounded `List<...>`. No Pageable, no limit/offset params. Only query params in the whole API are optional filters (`role`, `search`, `format`).
- **CORS IS configured** (contrary to a possible expectation): explicit origin list from `cors-allowed-origins`, `allowCredentials=true`, methods incl. PATCH/OPTIONS, headers `Authorization`+`Content-Type`. But NOTE: **no controller uses PATCH** — all partial updates use PUT (status, cap, move, scores). PATCH is allowed by CORS but unused.
- **Authorization is coarse, path-prefix only.** No ownership/tenant checks — any user whose role matches `/api/v2/organizations/**` can read/modify ANY organization's data (no per-org scoping). Practitioners are NOT granted `/api/v2/users/**` or `/api/v2/organizations/**` by default seed, so those are admin-only in practice.
- **JWT `superAdmin`/`roles` claims are decorative for authz** — the decision re-reads User+roles+superAdmin from DB every request, so a stale token still reflects live DB permissions (good), but it means DB hit on every request.
- **DTO naming inconsistency**: request records are named `*Request`/bare (`NameDescription`, `LoginRequest`, `OrganizationRequest`) while several nested wire records reuse names across controllers (`StatusRequest` exists in User/Organization/Assessment/ItemBank with different enum field types; `SelectionDto` vs service `Selection` are identical duplicates). `AllotmentDto` is built inline (no `from()` factory) and uses a stringly-typed `kind` discriminator (`"organization"/"group"/"respondent"`).
- **Timestamps serialized as raw `.toString()` strings** (OffsetDateTime/Instant) in MemberDto/AttemptDto/AnswerDto's parent/ChangeLogDto — not ISO-normalized via Jackson; frontend must parse whatever `.toString()` yields (ISO-8601 for OffsetDateTime).
- **No allotment deletion** endpoint and no respondent-cap update; respondent allotments always carry `cap=null`.
- **`open-in-view: true`** — DTO `from()` methods traverse lazy JPA collections (roles, options, children, selections) during serialization; relies on OSIV keeping the session open. Refactor risk if OSIV is ever disabled.
- **Group endpoints have inconsistent nesting**: create/list are `/{orgId}/groups`, but update/move/delete/restore/members are flat `/groups/{groupId}` (no org in path).
- `GET /api/v2/auth/me` requires passing the RBAC manager, so a user with zero matching role paths cannot even read their own profile despite having a valid token.
- Only exception mapping is for domain `NotFoundException/ConflictException/ValidationException`; `ResponseStatusException` (AuthController 401) handled by Spring defaults; no generic 500 handler/body shape.
