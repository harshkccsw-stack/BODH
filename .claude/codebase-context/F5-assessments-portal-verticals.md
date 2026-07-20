I'll start by enumerating all files in the target directories.
Let me check file sizes to plan reading.
Now I'll read the files in batches. Starting with the assessments directory.
Now the remaining assessments files.
Now the remaining assessments files.
Now the portal files, which are critical for the respondent flow.
Now the rest of the portal files.
Now the industrial pages.
Now the counselling pages.
Now the compliance and clinical pages.
Now the clinical pages.
I've read all 29 target files. To produce the exact API method+path catalog, I need the API client definitions since the pages call wrapper methods. Let me locate and read the relevant api definitions.
I have everything needed, including the full API client. Let me quickly confirm the exact route strings from the router to make the report accurate.
I have read all 29 target files in full, plus `lib/api.ts`, `lib/config.ts`, and the route table. Below is the complete structured catalog.

---

# GLOBAL CONTEXT

- **API base**: `config.apiBase` = `VITE_API_URL` default `http://localhost:4000/api/v1`. **Every** call in these pages hits `/api/v1`. There is **ZERO reference to `/api/v2`** in any of these pages or in `lib/api.ts`. All API wrappers live in `/home/babayaga/Projects/bodh/bodhassess-app/lib/api.ts` (paths below are relative to `/api/v1`).
- **Auth**: `jsonFetch` auto-attaches `Authorization: Bearer <token>` picking `practitionerAuthStorageKey` → `authStorageKey` (respondent). Errors thrown as `Error("[API <status>] <path>: <body>")`.
- **Portal origin**: `config.portalUrl` = `VITE_PORTAL_URL` default `http://localhost:3002`. Respondent links/QRs are built against this.
- **authStorageKey** = `bodhassess.auth.token` (respondent token in localStorage).
- **CRITICAL ROUTING FACT** (`src/router.tsx`): the respondent portal pages (`portal/login`, `portal/assessments`, `portal/take`, `portal/complete`) are **commented out / MOVED to a standalone `bodhassess-portal` app served at portal.bodh.biz**. In THIS admin app only `/preview/:versionId` (portal/preview.tsx) is still routed. So the four portal/*.tsx files below are the (now-relocated) reference implementation; in-app redirects to `/portal/*` fall through the catch-all to `/dashboard`.
- **Two distinct "assessment" domain objects**:
  - `AssessmentRecord` (`/assessment-records`) = first-class reusable allotment of a questionnaire *version* to allotees (the "new" model; create/edit/all-assessments/invite pages use this).
  - `Assessment` aka `PortalSession` (`/assessments`) = per-respondent **SESSION** (legacy surface; take/respondents/browse/portal pages use this). `portalSessionsApi === assessmentsApi`.

---

# FILE-BY-FILE

## src/pages/assessments/

### all-assessments.tsx — route `/assessments`
Purpose: master list of AssessmentRecords, one row each; filter by search/entity/status/sort; per-row status change, allotees popup, delete, dropdown nav. Default export `AllAssessmentsPage`.
- State (all `useState`, no react-query): `rows: AssessmentRecord[]`, `entities`, `entityFilter`, `entityAssessmentIds: Set|null`, `allotteesOpen/allotteesData`, `confirmDelete`, `savingStatusId`. Client-side filter+sort (`created-desc/asc`, `name-asc/desc`, `sessions-desc`).
- UI: filter Card (search input, Entity Select, Status Select ACTIVE/CLOSED/PAUSED/TEST, Sort Select); table cols Name(+id)/Questionnaire/Vertical/Allotees(button→popup)/Sessions(sessionsCount·completedCount)/Status(inline Select)/Created/Actions(dropdown). Allotees modal lists entities(sessionsCount/cap), groups, respondents. Delete confirm modal.
- API calls:
  - `GET /assessment-records` (`assessmentRecordsApi.list`) — consumes id,name,questionnaireName,vertical,status,sessionsCount,completedCount,createdAt,entityCount,groupCount,respondentCount.
  - `GET /entity-registrations` (`entityRegistrationsApi.list`) — filtered `.active && .id`; fields companyName,name,id.
  - `GET /assessment-records/by-entity/{entityId}` (`.listByEntity`) — returns AssessmentRecord[]; only ids used.
  - `GET /assessment-records/{id}/allotments` (`assessmentAllotmentsApi.list`) → AssessmentAllotees {entities[],groups[],respondents[]}.
  - `PATCH /assessment-records/{id}/status` body `{status}` (`.updateStatus`) → updated record.
  - `DELETE /assessment-records/{id}` (`.delete`).
- Nav: `window.location.href` → `/assessments/create`, `/assessments/edit/{id}`, `/assessments/{id}/respondents`, `/assessments/{id}/invite`, `/assessments/{id}/copy-link`.
- Quirks: `void CopyIcon;` no-op to prevent tree-shake; comment says CopyIcon import is dead.

### create-assessment.tsx — route `/assessments/create`
Purpose: one-shot create AssessmentRecord + initial allotments. Export `CreateAssessmentPage`.
- Form fields: `name`, `pickedQuestionnaire`, `pickedVersion`, `language` (11 Indian langs), `autoNext` (Switch). Allotment pickers: entities (with per-entity numeric `cap`, blank=∞), groups (Set), respondents (Set, sliced to 200).
- State: `questionnaires: QuestionnaireParent[]`, `versions: QuestionnaireVersionSummary[]`, `entityAllotments: AssessmentEntityAllotment[]`, `groupAllotments/respondentAllotments: Set<string>`, search filters per picker. `availableQuestionnaires` = those with `versionCount>0`.
- API calls:
  - `GET /questionnaire-records` (`questionnaireRecordsApi.list`) — id,name,vertical,versionCount,currentVersionId.
  - `GET /entity-registrations` (filtered active) — id,companyName,name,email,member_ids.
  - `GET /groups` (`groupsApi.list`) — id,name,description,memberIds.
  - `GET /respondents` (`respondentsApi.list`) — id,name,email.
  - `GET /questionnaire-records/{parentId}/versions?committedOnly=true` (`questionnaireVersionsApi.list(id,true)`) — id,versionLabel,versionName; defaults version picker to parent.currentVersionId.
  - `POST /assessment-records` (`assessmentRecordsApi.create`) body `{name, questionnaireId, questionnaireVersionId, questionnaireName, vertical, language, status:'ACTIVE', autoNext, entityAllotments, groupAllotments:[], respondentAllotments:[]}` → returns `{id}`; navigates to `/assessments/edit/{id}`.
- Validation: name, questionnaire, version, and ≥1 allotee required. Vertical inherited from questionnaire. Version is permanently pinned.

### edit-assessment.tsx — route `/assessments/edit/:id`
Purpose: tabbed editor (details / allotees / audit). Export `EditAssessmentPage`. Uses `useParams` from `@/src/lib/router-helpers`.
- Details tab: name, language, autoNext → save. Status Select in header.
- Allotees tab: three `AllotmentList`s with `+ Add` `PickerDialog` (entity picker has cap step). Entity rows have inline cap `Input` (onBlur commits).
- Audit tab: `AuditTab` renders AuditLogEntry[] (action badge, actor, before/after JSON in `<details>`).
- API calls (parallel load via Promise.all):
  - `GET /assessment-records/{id}` (`.get`).
  - `GET /assessment-records/{id}/allotments` (`.list`).
  - `GET /audit/assessment/{id}` (`auditApi.byTarget('assessment', id)`) — path `/audit/{targetType}/{targetId}`; `.catch([])`.
  - `GET /entity-registrations` (active), `GET /groups`, `GET /respondents`.
  - `PUT /assessment-records/{id}` body `{name,language,autoNext}` (`.update`).
  - `PATCH /assessment-records/{id}/status` (`.updateStatus`).
  - Allotment mutations (each followed by re-`list`):
    - `POST /assessment-records/{id}/allotments/entities` body `{entityId,cap}` (`addEntity`).
    - `PATCH /assessment-records/{id}/allotments/entities/{entityId}` body `{cap}` (`updateEntityCap`).
    - `DELETE /assessment-records/{id}/allotments/entities/{entityId}` (`removeEntity`).
    - `POST /assessment-records/{id}/allotments/groups` body `{groupId}` (`addGroup`).
    - `DELETE /assessment-records/{id}/allotments/groups/{groupId}` (`removeGroup`).
    - `POST /assessment-records/{id}/allotments/respondents` body `{respondentId}` (`addRespondent`).
    - `DELETE /assessment-records/{id}/allotments/respondents/{respondentId}` (`removeRespondent`).

### invite-or-copy.tsx — routes `/assessments/:id/invite` AND `/assessments/:id/copy-link`
Purpose: issue/list/revoke registration tokens (invite links + QR) for an assessment's allotees + standalone email. Export `InviteOrCopyPage`. `mode` derived from URL suffix (`/invite` vs copy).
- UI: cards for Entities (each expandable to per-member checkboxes), Groups, Individual respondents (all multi-select), Standalone email input. Each section `+ Add` opens `PickerDialog` (allots existing-but-not-yet-allotted target). "Generated links" list with Copy / QR modal / Delete. Standalone confirm modal. QR modal shows `<img>` + Download.
- Link URL shape: `urlFor(t)` = `${config.portalUrl}/portal/register?token=<token>` (all tokens open the portal register page which branches register vs login).
- API calls:
  - `GET /assessment-records/{id}` (`.get`), `GET /assessment-records/{id}/allotments` (`.list`).
  - `GET /entity-registrations`, `GET /groups`, `GET /respondents`.
  - `GET /assessment-tokens/by-assessment/{id}` (`assessmentTokensApi.listForAssessment`) — pre-loads saved tokens; fields token,kind,entityId,groupId,respondentId,email.
  - `POST /assessment-tokens` (`assessmentTokensApi.issue`) body `IssueTokenRequest {assessmentId, entityId?, groupId?, respondentId?, email?, maxUses?}` → AssessmentToken {token,kind}. Called per: entity-wide (`{assessmentId,entityId}`), entity→member (`{assessmentId,entityId,respondentId,maxUses:1}`), group (`{assessmentId,groupId}`), individual respondent (`{assessmentId,respondentId,maxUses:1}`), standalone (`{assessmentId,email,maxUses:1}`).
  - `DELETE /assessment-tokens/{token}` (`.revoke`) on delete-link.
  - Allot-existing (via PickerDialog): `POST .../allotments/entities|groups|respondents` (same as edit page).
  - QR: `publicTokensApi.qrUrl(token, portalUrl)` = **`GET /public/tokens/{token}/qr?base=<portalUrl>`** (streams image/png) — used as `<img src>` and fetched-as-blob for download.
- Quirks: "Send Invitation" delivery is a **stub** — system email is config-gated; "send" just copies link to clipboard. token kind badge: `login` (existing account) vs `register`.

### assessment-respondents.tsx — route `/assessments/:assessmentId/respondents`
Purpose: list all SESSIONS for one assessmentId; view/reset each respondent's attempt. Export `AssessmentRespondentsPage`.
- UI: header meta card (from `rows[0]`: instrument, vertical, total, status counts). Table cols Session ID/Respondent/Status(Active|Completed|Pending Review)/Score/Created/View Response/Reset. Reset confirm modal.
- API calls:
  - `GET /assessments/by-assessment?assessmentId={id}` (`assessmentsApi.listByAssessment`) → AssessmentSummary[] {id,respondentName,status,score,createdAt,instrument,vertical,name}.
  - `POST /assessments/{id}/reset` (`assessmentsApi.reset`) — wipes attempt.
- Nav: View Response → `/assessments/{sessionId}/take`.

### browse-assessments.tsx — route `/assessments/respondents` (literal, "Browse")
Purpose: grouped view, one row per assessmentId (bulk-create group key) with aggregate counts. Export `BrowseAssessmentsPage`.
- API: `GET /assessments/groups` (`assessmentsApi.listGroups`) → AssessmentGroup[] {assessmentId,name,instrument,instrumentFullName,vertical,language,createdAt,respondentCount,completedCount,activeCount,pendingReviewCount}.
- Nav: row → `/assessments/{assessmentId}/respondents`.
- Note (in-UI): older assessments without a group id won't appear.

### batch-upload.tsx — route `/assessments/batch`
Purpose: CSV batch upload UI. Export `BatchUploadPage`. **MOCK/SCAFFOLD** — `const rows: PreviewRow[] = []` with comment "Real CSV parsing + API wiring is not implemented yet". No file input, no API. Upload progress is a fake `setInterval` timer; "done" summary hardcodes 5 created / 5 invitations / 0 errors. Download-template button inert.

### take-assessment.tsx — route `/assessments/:id/take` (minimal layout)
Purpose: practitioner "view response/preview" entry. Export `PreviewTakeAssessment`. **Just a redirect** — `window.location.replace('/portal/take?id={id}')` (or `/portal/assessments` if no id). No API. Comment: previously had hardcoded PHQ-9 mock, now routes through the real portal take flow. **NOTE: `/portal/take` is un-routed in this app → falls through to `/dashboard`; effectively broken here.**

---

## src/pages/portal/ (relocated to standalone portal app; only preview still routed here)

### login.tsx — (route commented out) `/portal/login`
Purpose: respondent sign-in (email/phone + DOB as password). Export `PortalLoginPage`.
- DOB entered DD/MM/YYYY (`autoFormatDdmmyyyy`), converted via `ddmmyyyyToIso`.
- API: `POST /auth/login` body `{email: identifier, dob: isoDob}` (`authApi.login`) → `{token, user}`. Stores `res.token` in localStorage under `authStorageKey`. On success → `/portal/assessments`.
- Quirk: uses the **unified `/auth`** identity (super-admin can sign in here too) but stores token under the *respondent* key; other portal pages resolve identity via `/respondents/me`.

### assessments.tsx — (route commented out) `/portal/assessments`
Purpose: respondent dashboard listing assigned sessions. Export `PortalAssessmentsPage`.
- API:
  - `GET /respondents/me` (Bearer token) (`respondentsApi.me`) → Respondent {id,name}. On failure clears token → `/portal/login`.
  - `GET /assessments?respondentId={me.id}` (`portalSessionsApi.list`) → Assessment[] (sessions).
  - `POST /respondents/logout` (Bearer) (`respondentsApi.logout`) on sign-out.
- UI: Pending vs Completed split. `hasStarted(s)` = answers+demographics keys > 0 → "Resume" vs "Launch". Stat tiles Pending/Completed.
- Nav: card → `/portal/take?id={session.id}`.

### take.tsx — (route commented out) `/portal/take?id=<sessionId>` — THE respondent answering flow (752 lines)
Purpose: gated take-assessment flow. Export `PortalTakePage`. Local interfaces MQ/MQT/QOption/Question/StoredQuestionnaire.
- Flow gates (in order): auth check → load session → **disclaimer** (if questionnaire.disclaimer, checkbox+Agree) → **instructions** (if showInstructions) → **demographics** (unless session already has them) → **questions** → submit → complete.
- State: `user`, `session`, `instrument`(StoredQuestionnaire), `index`, `answers: Record<qid, number|string>` (number=option index, string=free-text), demographics map, `demoFieldCatalog`.
- API calls:
  - `GET /demographic-fields?active=true` (`demographicFieldsApi.list(true)`).
  - `GET /respondents/me` (Bearer from localStorage `authStorageKey`) — redirect to `/portal/login` if missing/invalid.
  - `GET /assessments/{sid}` (`portalSessionsApi.get`, `sid` from `?id=`) → session; guards `s.respondentId===u.id` and `s.status!=='Completed'`.
  - Questionnaire content resolution: prefers `GET /questionnaires/{s.questionnaireVersionId}` (`questionnairesApi.get`, resolves by version id → PublishedQuestionnaire); falls back to `GET /questionnaires/by-name?name={instrumentFullName|instrument}` (`questionnairesApi.getByName`).
  - **Heartbeat**: `POST /assessments/{id}/heartbeat` body `{currentIndex, totalQuestions}` (`portalSessionsApi.heartbeat`) every 5s (feeds admin Live Tracking). Best-effort.
  - **Partial save on first answer**: `PUT /assessments/{id}` body `{answers}` (`.update`) once when first non-empty answer recorded (stamps started_at server-side).
  - **Demographics save**: `PUT /assessments/{id}` body `{demographics: clean}`.
  - **Submit**: `PUT /assessments/{id}` body `{status:'Completed', score:<summary string>, answers, mqtScores: Record<mqtId,{name,score}>, completedAt: ISO}`. Then → `/portal/complete?id={id}`.
- Scoring (client-side): walks MQT tree (`walkMqts`), sums per-option `scores[]` and question-level `question_scores[]` into per-MQT totals; only MQTs actually scored are persisted; no parent roll-ups. Empty free-text treated as unanswered.
- UI details: progress bar, optional numbered question side-panel (`session.showQuestionIndex`), Media component (image/video/youtube/audio), FREE_TEXT vs option buttons, Next disabled until answered, auto-advance flag referenced in create/edit but Next is manual here.

### complete.tsx — (route commented out) `/portal/complete?id=<sessionId>`
Purpose: thank-you screen. Export `PortalCompletePage`.
- API: `GET /respondents/me` (name only), `GET /assessments/{sid}` (`.get`) — shows instrumentFullName, id, completedAt.
- Nav: → `/portal/assessments`.

### preview.tsx — route `/preview/:versionId` (PUBLIC, no auth — STILL ROUTED here)
Purpose: public questionnaire test-walkthrough; nothing persisted. Export `PreviewQuestionnairePage`.
- API: `GET /questionnaires/{versionId}` (`questionnairesApi.get`) → resolves any version row by id.
- UI: amber "Preview mode — responses not saved" banner; local-only `answers`; last button disabled "End of preview". Same Media/free-text/option rendering as take.tsx but no scoring/session.

---

## src/pages/industrial/ — ALL STATIC SCAFFOLDS (no API calls, no imports from lib/api)

- **ai-adaptability.tsx** (`/industrial/ai-adaptability`): marketing page for "AI Adaptability Index (AAI)" — hardcoded `dimensions[]` (7 items). Buttons "Launch Assessment"/"View Pilot Results" inert.
- **cohorts.tsx** (`/industrial/cohorts`): `const cohorts: Cohort[] = []` — empty-state only; candidate table/ranking UI never renders. Buttons inert.
- **competency.tsx** (`/industrial/competency`): `const frameworks: Framework[] = []` — empty-state only.
- **proctoring.tsx** (`/industrial/proctoring`): `activeSessions=[]`, `completedSessions=[]` — empty-state; TrustScore/face-detection/gaze UI never renders. Live indicator is decorative.

---

## src/pages/counselling/ — STATIC MOCKS (hardcoded arrays, no API)

- **consent.tsx** (`/counselling/consent`): 8 hardcoded `consentRecords` (student/parent/consentType/status/method). DPDP Act 2023 notice. "Send Consent Request" inert.
- **developmental.tsx** (`/counselling/developmental`): 3 hardcoded `studentProfiles` with domains/milestones; `ageBandComparison` mock averages. Student selector + progress bars + milestone timeline + SVG-ish comparison. State: `selectedStudentId`.
- **multi-informant.tsx** (`/counselling/multi-informant`): 5 hardcoded `sessions` (self/parent/teacher report status + triangulation Convergent/Divergent/Pending).
- **students.tsx** (`/counselling/students`): 8 hardcoded `students`; client-side search/ageBand/school filters (state only, no API).

---

## src/pages/compliance/ — STATIC MOCKS (no API)

- **audit.tsx** (`/compliance/audit`): 8 hardcoded `logs`; search input & Filter button inert. (NB: real audit API `auditApi.recent()`=`GET /audit` exists but is NOT used here.)
- **consent.tsx** (`/compliance/consent`): 6 hardcoded consent `records` (DPDP tracking).
- **erasure.tsx** (`/compliance/erasure`): 5 hardcoded erasure `requests` + hardcoded stats.
- **portal.tsx** (`/compliance/portal`): "Data Principal Portal" — hardcoded profile (Arjun Patel) + 4 action cards (view/download/erase/withdraw, all inert) + 3 hardcoded activity rows.

---

## src/pages/clinical/ — STATIC SCAFFOLDS/MOCKS (no API)

- **clients.tsx** (`/clinical/clients`): `const clients: Client[] = []` — empty. Has "Add Client" form (name/dob/language) whose Save just closes the form (no persistence). Search + risk-filter state only.
- **mse-upload.tsx** (`/clinical/mse-upload`): "Tier 5 Premium". `simulateUpload` = fake setTimeout state machine (uploading→analyzing→complete). `extractedFindings`/`recommendedBattery` empty — comment "AI extraction is not yet implemented". "Approve Battery & Create Assessments" button inert.
- **risk-alerts.tsx** (`/clinical/risk-alerts`): `activeAlerts=[]`, `alertHistory=[]`. Acknowledge/Refer/Dismiss mutate local state only.
- **tracking.tsx** (`/clinical/tracking`): `clients=[]`, `phq9Data=[]` — empty-state; hand-rolled SVG PHQ-9 trajectory chart + severity zones + administration table only render if data present (never does).

---

# SYNTHESIS

### (a) Assessment lifecycle as the UI implements it
1. **Author questionnaire** elsewhere (question-bank / questionnaire-records) → commit a **version**.
2. **Create AssessmentRecord** (`/assessments/create`): pick questionnaire + committed version (pinned immutably), language, autoNext, and initial allotments (entities w/ caps, groups, individuals). `POST /assessment-records`.
3. **Manage** (`/assessments` list + `/assessments/edit/:id`): change status (ACTIVE/CLOSED/PAUSED/TEST), edit name/lang/autoNext, add/remove allotments, view audit.
4. **Invite/Distribute** (`/assessments/:id/invite|copy-link`): issue `assessment-tokens` per allotee/member/standalone-email → portal register/login links + QR PNG. Sessions get provisioned server-side from allotments; delivery/email is a stub (copy-to-clipboard).
5. **Respondent takes** (portal app): register/login via token → session created → answer → submit → session becomes `Completed` with score summary + per-MQT scores.
6. **Monitor** (`/assessments/:id/respondents` and `/assessments/respondents` browse): per-session status/score; **Reset** wipes an attempt (`POST /assessments/{id}/reset`). Live progress via heartbeat feeds admin Live Tracking. Delete removes record+allotments (sessions preserved).

### (b) Respondent portal flow (step-by-step, from portal/*.tsx — now in the standalone portal app)
1. **Token link** `${portalUrl}/portal/register?token=…` → register-with-token page (register vs login by token kind) → issues respondent token, creates session.
2. **Login** `/portal/login`: email/phone + DOB(DD/MM/YYYY→ISO) → `POST /auth/login` → store token (`authStorageKey`) → `/portal/assessments`.
3. **Dashboard** `/portal/assessments`: `GET /respondents/me` + `GET /assessments?respondentId=` → Pending/Completed; Launch/Resume → `/portal/take?id=`.
4. **Take** `/portal/take`: auth → `GET /assessments/{id}` (ownership+not-completed guards) → resolve content by pinned version id (`GET /questionnaires/{versionId}`) or by name → gates: **disclaimer → instructions → demographics(`GET /demographic-fields?active=true`, saved via `PUT /assessments/{id} {demographics}`) → questions**. Heartbeat every 5s; partial-save on first answer; **submit** `PUT /assessments/{id} {status:'Completed', score, answers, mqtScores, completedAt}`.
5. **Complete** `/portal/complete?id=`: thank-you + summary → back to dashboard.

### (c) COMPLETE API-CALL CATALOG (METHOD path — page(s) — payload — response fields used)
- `GET /assessment-records` — all-assessments — — id,name,questionnaireName,vertical,status,sessionsCount,completedCount,createdAt,entityCount,groupCount,respondentCount
- `GET /assessment-records/by-entity/{entityId}` — all-assessments — — id (Set)
- `GET /assessment-records/{id}` — edit, invite — — full AssessmentRecord (name,questionnaireName,vertical,status,language,autoNext)
- `POST /assessment-records` — create — {name,questionnaireId,questionnaireVersionId,questionnaireName,vertical,language,status,autoNext,entityAllotments,groupAllotments,respondentAllotments} — id
- `PUT /assessment-records/{id}` — edit — {name,language,autoNext} — updated record
- `PATCH /assessment-records/{id}/status` — all-assessments, edit — {status} — updated record
- `DELETE /assessment-records/{id}` — all-assessments — —
- `GET /assessment-records/{id}/allotments` — all-assessments, edit, invite — — {entities[{entityId,entityName,cap,sessionsCount}],groups[{groupId,groupName}],respondents[{respondentId,respondentName,respondentEmail}]}
- `POST /assessment-records/{id}/allotments/entities` — edit, invite — {entityId,cap} —
- `PATCH /assessment-records/{id}/allotments/entities/{entityId}` — edit — {cap} —
- `DELETE /assessment-records/{id}/allotments/entities/{entityId}` — edit — —
- `POST /assessment-records/{id}/allotments/groups` — edit, invite — {groupId} —
- `DELETE /assessment-records/{id}/allotments/groups/{groupId}` — edit — —
- `POST /assessment-records/{id}/allotments/respondents` — edit, invite — {respondentId} —
- `DELETE /assessment-records/{id}/allotments/respondents/{respondentId}` — edit — —
- `POST /assessment-tokens` — invite — {assessmentId,entityId?,groupId?,respondentId?,email?,maxUses?} — token,kind
- `GET /assessment-tokens/by-assessment/{id}` — invite — — token,kind,entityId,groupId,respondentId,email
- `DELETE /assessment-tokens/{token}` — invite — —
- `GET /public/tokens/{token}/qr?base={portalUrl}` — invite (`<img>`/blob) — — image/png
- `GET /questionnaire-records` — create — — id,name,vertical,versionCount,currentVersionId
- `GET /questionnaire-records/{parentId}/versions?committedOnly=true` — create — — id,versionLabel,versionName
- `GET /entity-registrations` — all-assessments, create, edit, invite — — id,companyName,name,email,active,member_ids
- `GET /groups` — create, edit, invite — — id,name,description,memberIds
- `GET /respondents` — create, edit, invite — — id,name,email
- `GET /assessments/by-assessment?assessmentId={id}` — assessment-respondents — — id,respondentName,status,score,createdAt,instrument,vertical,name
- `POST /assessments/{id}/reset` — assessment-respondents — —
- `GET /assessments/groups` — browse-assessments — — assessmentId,name,instrument,instrumentFullName,vertical,language,createdAt,respondentCount,completedCount,activeCount,pendingReviewCount
- `GET /audit/assessment/{id}` — edit (AuditTab) — — id,action,actorId,actorName,before,after,createdAt
- `POST /auth/login` — portal/login — {email,dob} — token,user
- `GET /respondents/me` (Bearer) — portal/assessments, take, complete — — id,name
- `POST /respondents/logout` (Bearer) — portal/assessments — —
- `GET /assessments?respondentId={id}` — portal/assessments — — Assessment[] (session list)
- `GET /assessments/{id}` — portal/take, complete — — session (respondentId,status,instrument,instrumentFullName,questionnaireVersionId,demographics,showQuestionIndex,completedAt,name,language,answers)
- `PUT /assessments/{id}` — portal/take — {answers} | {demographics} | {status,score,answers,mqtScores,completedAt} —
- `POST /assessments/{id}/heartbeat` — portal/take — {currentIndex,totalQuestions} —
- `GET /demographic-fields?active=true` — portal/take — — id,fieldKey,label,type,required,placeholder,options
- `GET /questionnaires/{id}` — portal/take, portal/preview — — PublishedQuestionnaire (mqs,questions,disclaimer,instructions,showInstructions,demographicFieldKeys)
- `GET /questionnaires/by-name?name={name}` — portal/take (fallback) — — PublishedQuestionnaire

(Public token endpoints `POST /public/tokens/{token}/register|login|consume`, `GET /public/tokens/{token}`, `POST /public/tokens/registration-check`, and `publicEntityApi` exist in lib/api but are consumed by `register-with-token.tsx` / `entity-member-register.tsx`, NOT by the pages in scope.)

### (d) Frontend domain shapes (from lib/api.ts)
- **AssessmentRecord**: id,name,questionnaireId,questionnaireVersionId,questionnaireVersionLabel,questionnaireName,vertical,language,status(ACTIVE|CLOSED|PAUSED|TEST),autoNext,createdAt/By,updatedAt, counts(entity/group/respondent/sessions/completed), initial-allotment arrays.
- **AssessmentAllotees**: {assessmentId, entities:AssessmentEntityAllotment[], groups:AssessmentGroupAllotment[], respondents:AssessmentRespondentAllotment[]}. Entity allotment carries `cap` (null=∞), sessionsCount, completedCount.
- **Assessment/PortalSession** (session): id,assessmentId(group key),name,respondentId,respondent,respondentEmail,instrument,instrumentFullName,questionnaireVersionId,vertical,language,status,score,answers(Record<qid,number|string>),mqtScores(Record<mqtId,{name,score}|number>),groupId/Name,entityId/Name,showQuestionIndex,createdAt,completedAt,startedAt,demographics.
- **AssessmentToken**: token,assessmentId,entityId,groupId,respondentId,email,maxUses,usedCount,expiresAt,kind('register'|'login'),loginEmail,sessionId.
- **PublishedQuestionnaire**: id,name,shortName,vertical,mqs[{id,name,mqts(tree)}],questions[{id,stem,format,media_url,media_type,options[{text,scores[{mqt_id,score}],media…}],question_scores,coverage,clinical_risk_flag,risk_flag_rule}],disclaimer,instructions,showInstructions,demographicFieldKeys.
- **DemographicField**: id,fieldKey,label,type(text|number|date|select|textarea),required,placeholder,options[],sortOrder,active.
- **EntityRegistration**: id,name,companyName,email,dob,active,member_ids[],verticals[],platform_modules[],assessments[].
- **AuditLogEntry**: id,actorId,actorName,action,targetType,targetId,before,after(JSON strings),createdAt.

### (e) Odd / broken / mocked
- **/api/v2 is not referenced anywhere** in these pages or lib/api.ts — 100% of calls are `/api/v1`.
- **All 12 industrial+counselling+compliance+clinical pages are static** (hardcoded arrays or empty `[]` scaffolds). Industrial & clinical use empty arrays (pure empty-states, feature stubs); counselling & compliance use hardcoded demo data. No API wiring on any of them. All their action buttons (Send Consent, Create Cohort/Framework, Launch Assessment, Approve Battery, Add Client save, data-principal actions, audit search/filter) are inert.
- **batch-upload.tsx**: entirely faked (no CSV parse, no file input, timer-driven progress, hardcoded "5 created" result).
- **clinical/mse-upload.tsx**: AI extraction faked via setTimeout; findings empty.
- **compliance/audit.tsx** ignores the real `GET /audit` endpoint that exists in the client.
- **Portal pages relocated**: `portal/login|assessments|take|complete` routes are commented out (moved to standalone portal app). In THIS app, redirects to `/portal/*` (from take-assessment.tsx, login.tsx) fall through to `/dashboard` — so `/assessments/:id/take` "View Response" is effectively broken here.
- **Token cross-wiring**: portal login uses unified `/auth/login` but stores under the respondent key and identity is later resolved via `/respondents/me` (two identity surfaces).
- **all-assessments.tsx**: `void CopyIcon;` dead-code guard against tree-shaking an unused import.
- **Scoring** in take.tsx intentionally computes no parent-MQT roll-ups; empty free-text is not credited.
