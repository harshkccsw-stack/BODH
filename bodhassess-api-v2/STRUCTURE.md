# bodhassess-api-v2 — package structure

Proposal for review. Nothing has been moved for this document; the "current"
notes describe what is on disk right now.

---

## 1. Where things stand

Files were moved into new top-level folders (`auth/`, `model/`, `repository/`,
`service/`, plus empty `config/` and `controller/`), but **`package`
declarations still point at the old locations**. 64 of 93 files disagree with
their directory, so the module cannot compile until they are rewritten.

Three structural problems on top of that:

**a. Two roots.** New folders live at `com/bodhpsychometric/`, while
`assessment`, `auditing`, `taxonomy`, `v2/security`, `v2/web` and the main
class are still under `com/bodhpsychometric/bodhassess/`. One of the two has
to win.

**b. Component scanning is aimed at the old root.** The main class says:

```java
@SpringBootApplication(scanBasePackages = "com.bodhpsychometric.bodhassess")
@EnableJpaRepositories(basePackages  = "com.bodhpsychometric.bodhassess.domain.repository")
@EntityScan(basePackages            = "com.bodhpsychometric.bodhassess.domain")
```

Everything now at `com.bodhpsychometric.*` falls outside all three. Once the
main class sits at the package root, all three annotations can be deleted —
Boot scans its own package downward by default.

**c. Files sitting in the wrong kind of package** — the thing you suspected:

| File | Is a | Currently in | Problem |
|---|---|---|---|
| `BaseEntity`, `SoftDeletableEntity` | `@MappedSuperclass` | `auth/base/` | Base classes for *every* entity, not auth |
| `OrganizationStatus` | enum | `auth/enums/` | Organization concern parked in auth |
| `DomainAuditingConfig` | `@Configuration` | `domain/auditing/` | Config class in a domain package |
| `AccessControlService` | `@Service` | `v2/security/` | Service in a security package |
| `CurrentUserResolver` | interface | `domain/auditing/` | Its only implementation lives in `v2/security/` |
| `NotFound`/`Conflict`/`ValidationException` | exceptions | `service/` | Thrown by services, translated by web — neither owns them |
| `GlobalExceptionHandler` | `@RestControllerAdvice` | `v2/web/` | Belongs with the exceptions it maps |
| `UserRoleRepository` | repository | `repository/` | `UserRole` entity is gone — orphaned |
| `verticals` | enum | `auth/enums/` | Lowercase type name; Java convention is `Vertical` |

---

## 2. Proposed structure

Base package `com.bodhpsychometric` — matching the folders you already
created. `bodhassess/` disappears entirely.

```
com/bodhpsychometric/
├── BodhAssessApplication.java        main class at the root: scanning just works
│
├── config/                           @Configuration only
│   ├── SecurityConfig.java
│   ├── AuditingConfig.java           (was DomainAuditingConfig)
│   └── BootstrapDataRunner.java      first-run seeding
│
├── security/                         authentication & authorisation plumbing
│   ├── JwtService.java
│   ├── JwtAuthFilter.java
│   ├── AccessControlService.java
│   ├── RoleUrlPathAuthorizationManager.java
│   ├── CurrentUserResolver.java      interface
│   └── SecurityCurrentUserResolver.java
│
├── controller/                       @RestController only
│   ├── AuthController.java
│   ├── PractitionerController.java
│   ├── RoleController.java
│   └── … (assessment, delivery, item, questionnaire, taxonomy, …)
│
├── service/                          @Service + collaborators
│   ├── UserService.java
│   ├── PractitionerService.java
│   ├── ItemBankService.java
│   ├── QuestionnaireAuthoringService.java
│   ├── ScoringService.java
│   ├── TaxonomyService.java
│   └── ChangeLogWriter.java
│
├── repository/                       Spring Data interfaces (flat, as now)
│   └── …Repository.java
│
├── exception/
│   ├── NotFoundException.java
│   ├── ConflictException.java
│   ├── ValidationException.java
│   └── GlobalExceptionHandler.java
│
└── model/                            all @Entity / @MappedSuperclass / enums
    ├── base/          BaseEntity, SoftDeletableEntity
    ├── auth/          User, Role, RoleGroup, PractitionerUser, RespondentUser
    │   └── enums/     Gender, PractitionerStatus, Vertical
    ├── people/        Organization, OrganizationMember, RespondentGroup, …
    │   └── enums/     OrganizationStatus
    ├── item/          Item, AnswerOption + ItemFormat, ValidationStatus
    ├── questionnaire/ Questionnaire, QuestionnaireItem, …
    ├── assessment/    Assessment, allotments, DemographicField, …
    ├── delivery/      AssessmentSession, AssessmentAttempt, SessionAnswer, …
    └── taxonomy/      MeasuredQuality, MeasuredQualityTrait, TraitPlacement
```

### Why this shape

- **Layer at the top, domain underneath.** `config` / `controller` / `service`
  / `repository` / `model` is the split you started; keeping entities grouped
  by domain *inside* `model/` preserves the grouping that already exists
  (`item`, `questionnaire`, `delivery`) instead of flattening 40 entities into
  one folder.
- **`auth/` becomes `model/auth/`.** Auth entities are entities; leaving them
  at the top level is what made `base/` and `enums/` end up under `auth/`.
- **Enums live beside the entities that use them**, so `OrganizationStatus`
  travels with `Organization` rather than sitting in auth.
- **`security/` separate from `config/`.** Only the `@Configuration` class is
  configuration; the filter, the JWT service and the access-control service
  are runtime collaborators.
- **`exception/` is its own package** because both services (throwers) and web
  (translator) depend on it — putting it in either creates a backwards
  dependency.

---

## 3. Moves this implies

| From | To | Files |
|---|---|---|
| `auth/` | `model/auth/` | 5 |
| `auth/base/` | `model/base/` | 2 |
| `auth/enums/` | `model/auth/enums/` (OrganizationStatus → `model/people/enums/`) | 4 |
| `model/{item,questionnaire,delivery}/` | unchanged (packages rewritten) | 20 |
| `bodhassess/domain/assessment/` | `model/assessment/` | 6 |
| `bodhassess/domain/taxonomy/` | `model/taxonomy/` | 3 |
| `bodhassess/domain/auditing/` | `config/` + `security/` | 2 |
| `bodhassess/v2/security/` | `security/` + `config/` | 7 |
| `bodhassess/v2/web/` | `controller/` + `exception/` | 11 |
| `bodhassess/v2/ApiV2Application` | `BodhAssessApplication` at root | 1 |
| `repository/`, `service/` | unchanged (packages rewritten) | 32 |

Every moved file needs its `package` line rewritten and every importer
updated — 93 files touched in total. It is mechanical and I would do it with
scripted edits, then prove it with a clean compile.

---

## 4. Decisions I need from you

1. **Root package** — `com.bodhpsychometric` (what you started, shown above)
   or `com.bodhpsychometric.bodhassess` (group + artifact, conventional, keeps
   room for sibling apps under the same group)?

2. **`model/` vs `entity/`** — `model` is what you created; some teams prefer
   `entity` since these are strictly JPA entities. Either is fine, but it
   should be decided before 40 files move.

3. **`verticals` → `Vertical`** — rename the type to follow Java convention
   while we are moving it? It is referenced in one place today.

4. **Orphans.** Several files reference classes that are now in your recycle
   bin — `UserRoleRepository` (entity gone) and the controllers whose services
   were moved out (`UserController`, `OrganizationController`,
   `DeliveryController`, `AssessmentController`). Should the refactor leave
   them where they are so you can rewrite them, or park them too?

---

## 5. What this does not touch

Flyway migrations, `application.yml`, and tests are unaffected by package
moves except for import lines. Table and column names are independent of Java
packages, so **no database change is implied by any of this**.
