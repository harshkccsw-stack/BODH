I'll start by enumerating all files in the target directories.
I'll read all 21 files. Let me batch the reads efficiently, starting with the admin directory.
Let me continue with the next admin files.
Now the remaining admin files: live-tracking, permissions, practitioners, respondents, roles.
Now the roles file and then the settings, white-label, experiments, data-studio directories.
Now the white-label files.
Now the experiments builder/export and data-studio files.
Now the data-studio files.
I've read all 21 target files. Now I need to resolve the exact API method/URL/payload strings, which live in the imported client modules (`@/lib/api`, `@/lib/data-store`). Let me locate and read those.
The API layer is in `lib/api.ts` (49KB) and `lib/data-store.ts`. Let me read the config, data-store, and the api.ts file to extract exact endpoints for the functions my pages use.
Now the core: `lib/api.ts` (the exact endpoints). Let me read it in full.
I have everything needed. All 21 target files are read, plus the API client layer (`lib/api.ts`, `lib/data-store.ts`, `lib/config.ts`) that resolves every call to an exact METHOD + path. Here is the dense structured report.

---

# FILE-BY-FILE: admin / settings / white-label / experiments / data-studio

Base for ALL relative paths below: `API_BASE = config.apiBase` = env `VITE_API_URL` (default `http://localhost:4000/api/v1`). Every call goes through `jsonFetch()` in `lib/api.ts`, which auto-attaches `Authorization: Bearer <token>` from localStorage (`bodhassess.practitioner.token` then `bodhassess.auth.token`). All these are **/api/v1 (legacy)** endpoints — NONE of these pages call /api/v2.

---

## src/pages/admin/

### bulk-upload-modal.tsx
- **Purpose:** Modal (child of respondents.tsx) to bulk-import respondents from CSV/XLSX. Client-side parse+validate preview, then server insert.
- **Exports:** default `BulkUploadModal({ onClose, onImported, existingEmails: Set<string> })`. Not routed (component).
- **Deps:** `xlsx` (SheetJS 0.18, `cellDates:true`, UTC date accessors), `bulkCreateRespondents` + type `BulkRespondentResult` from `@/lib/data-store`.
- **UI:** Full-screen overlay `Card`. Phases: idle (drag/drop file input `.csv,.xlsx,.xls`) → parsing → preview (table: #, Name, Email, DOB, Consent, Status) → importing → done (Created/Skipped/Errors stat tiles + issues table: Row, Email, Reason).
- **Parsing rules:** MAX_FILE_BYTES 5MB, MAX_ROWS 1000, REQUIRED_HEADERS `['name','email','dob']`, consent optional default `Pending`, VALID_CONSENTS `Granted/Pending/Withdrawn`. Client validation is preview-only; server re-validates.
- **API call:** `bulkCreateRespondents(rows)` → `respondentsApi.bulk` → **POST `/respondents/bulk`**, payload `{ respondents: [{name,email,dob,consent}] }`. Response consumed: `{ created:number, skipped:number, errors:[{row,email,reason}], inserted:Respondent[] }` (uses created, skipped, errors[]).
- **Static asset:** `downloadTemplate()` fetches `/respondents-template.csv` (public file, not API).
- **Quirks:** Errors-count display = `max(errors.length - skipped, 0)`. DOB doubles as portal password (noted in UI). Server uses MySQL GET_LOCK for R-NNN id gen (per comment).

### data-grid.tsx
- **Purpose:** Spreadsheet view of assessment SESSIONS with editable cells + audit trail. Route: **`/admin/data-grid`** (breadcrumb "Data Grid").
- **Exports:** default `DataGridPage`.
- **Deps:** `DataGrid` from `@/src/components/data-grid/DataGrid`; `datasetsApi`, types `DatasetColumn/DatasetResponse/DatasetRow` from `@/lib/api`.
- **State:** `data: DatasetResponse|null`, loading, error, notice, search. No react-query, no localStorage.
- **UI:** header + breadcrumb "BodhAssess / Data Grid"; card with search input, Export CSV button (client-side blob → `sessions.csv`), Refresh; group-count chips (Core/Scores/Demographics via GROUP_LABELS). Client search filters rows across all columns.
- **API calls:**
  - `datasetsApi.sessions()` → **GET `/datasets/sessions`** (optional `?entityId=&questionnaireId=`, not passed here). Response: `{ view, columns: DatasetColumn[], rows: DatasetRow[], rowCount }`. Columns self-describing: `{key,label,type,group,editable,options}`; `editable==='field'` → editable columns.
  - `datasetsApi.patchSessionCells([{rowId,columnKey,newValue,rowUpdatedAt}])` → **PATCH `/datasets/sessions/cells`**, body is array of CellEdit. Response `{ applied, rows: DatasetRow[], errors: [{rowId,columnKey,message,conflict,currentUpdatedAt}] }`. Optimistic update; on `errors[0].conflict` shows "changed elsewhere" + refresh; replaces edited rows w/ server versions (fresh `_updatedAt`).
- **Domain:** sessions dataset, dynamic score/demographic columns.

### entity-drill-in.tsx
- **Purpose:** Detail view of one Entity Registration (company). Route: **`/admin/entity-registrations/:id`** (reads `params.id` via `@/src/lib/router-helpers` useParams). Back nav → `window.location.href='/admin/entity-registrations'`.
- **Exports:** default `EntityDrillInPage` + internal `MembersTab/AccessTab/Section/AllotmentsTab/AuditTab`.
- **UI:** header (companyName/name, contact email, Active/Inactive `Badge`, Refresh). Tabs: members | access | allotments | audit.
  - Members tab: table Name/Email/Phone from respondents filtered by `entity.member_ids`.
  - Access tab: badges of assigned assessment names (`entity.assessments` ids resolved via records `name||questionnaireName||id`).
  - Allotments tab: **placeholder only** — dead-ish; `void entityId; void assessmentAllotmentsApi;` — points admin to `/assessments` page. No call made.
  - Audit tab: sorted audit entries (action, createdAt, actorName/actorId, before/after JSON in `<details>`).
- **API calls (Promise.all in `load`):**
  - `entityRegistrationsApi.get(id)` → **GET `/entity-registrations/{id}`** → EntityRegistration (uses companyName,name,email,active,member_ids,assessments).
  - `respondentsApi.list()` → **GET `/respondents`** (catch→[]).
  - `auditApi.byTarget('entity', id)` → **GET `/audit/entity/{id}`** (catch→[]) → AuditLogEntry[].
  - `assessmentRecordsApi.list()` → **GET `/assessment-records`** (catch→[]) → AssessmentRecord[] (for name resolution).
- **Imports but does NOT call:** `assessmentAllotmentsApi` (void-referenced only).

### entity-registrations.tsx
- **Purpose:** Admin CRUD list of Entity Registrations (companies w/ contact person). Route: **`/admin/entity-registrations`**.
- **Exports:** default `AdminEntityRegistrationsPage`.
- **Deps:** `entityRegistrationsApi, respondentsApi, assessmentRecordsApi` + types from `@/lib/api`; `autoFormatDdmmyyyy, ddmmyyyyToIso` from `@/lib/helpers`; `config` (basePath) from `@/lib/config`.
- **UI:** table cols: Company(Entity)+id, Contact Person (name/email/phone), Active (toggle switch), Members (count badge), Access (assessment count badge), Member Link (copy button), Submitted (created_at), Actions (Members, Access, drill-in ChevronRight, Delete). Dialogs: Register Entity (companyName*, contact name*, email*, phone*, dob DD/MM/YYYY*); Members (search + checkbox list of respondents); Access/provision (search + checkbox list of assessmentRecords, requires entity active); Delete confirm.
- **memberLink(id):** builds `${origin}${config.basePath}/entity/{id}/register` (public self-register link, strips trailing slash).
- **API calls:**
  - `entityRegistrationsApi.list()` → **GET `/entity-registrations`**.
  - `respondentsApi.list()` → **GET `/respondents`** (catch→[]).
  - `assessmentRecordsApi.list()` → **GET `/assessment-records`** (catch→[]).
  - `entityRegistrationsApi.update(id, {active})` → **PATCH `/entity-registrations/{id}`** (optimistic toggle, rollback on fail).
  - `entityRegistrationsApi.create({name,companyName,email,phone,dob:iso})` → **POST `/entity-registrations`**. Handles "already registered" msg.
  - `entityRegistrationsApi.update(id, {member_ids:[]})` → **PATCH `/entity-registrations/{id}`** (save members).
  - `entityRegistrationsApi.update(id, {assessments:[]})` → **PATCH `/entity-registrations/{id}`** (save access; server reconciles allotments/sessions; handles "not active" error → prompts to activate). Uses response `updated.assessments`.
  - `entityRegistrationsApi.delete(id)` → **DELETE `/entity-registrations/{id}`**.
- **Domain:** entity = company; member_ids = linked respondents; assessments = assigned AssessmentRecord ids; active gate.

### groups.tsx
- **Purpose:** Nested respondent groups tree + bulk-assign questionnaires (creates sessions). Route: **`/admin/groups`**.
- **Exports:** default `GroupsPage`.
- **Deps:** from `@/lib/data-store`: `getGroups, createGroup, updateGroup, deleteGroup, getRespondents, getAllMembersRecursive`, types `Group, StoredRespondent`. From `@/lib/api`: `questionnairesApi, portalSessionsApi`, type `PublishedQuestionnaire`.
- **Local id gen:** `newGroupId()` = `grp-<rand>`. `normalizeVertical()` maps to Industrial/Counselling/Experiments/Clinical (default Clinical).
- **UI:** stat cards (Groups, Respondents assigned, Available questionnaires); search; recursive `GroupNode` tree (expand/collapse, direct+total member counts, subgroup/questionnaire counts). Dialogs: Group create/edit (name*, description, parentId); Members (checkbox respondent list); Assign questionnaires (checkbox list, shows N×members = sessions to create); Delete confirm.
- **API calls:**
  - `getGroups()` → `groupsApi.list()` → **GET `/groups`**.
  - `getRespondents()` → `respondentsApi.list()` → **GET `/respondents`**.
  - `questionnairesApi.list()` → **GET `/questionnaires`** → PublishedQuestionnaire[] (uses name, shortName, vertical, questions.length).
  - `createGroup({id,name,description,parentId,memberIds:[],assignedInstruments:[]})` → `groupsApi.create` → **POST `/groups`**.
  - `updateGroup(id, {...group, name/description | memberIds | assignedInstruments})` → `groupsApi.update` → **PUT `/groups/{id}`**.
  - `deleteGroup(id)` → **DELETE `/groups/{id}`**.
  - **Assign flow:** builds session objects client-side (id `SESS-<rand>`, respondentId, respondent, respondentEmail, instrument, instrumentFullName, vertical, language:'English', status:'Active', score:'--', groupId, groupName), then `portalSessionsApi.bulk(newSessions)` = `assessmentsApi.bulk` → **POST `/assessments/bulk`**, body `{ assessments: [...] }`. Response used: `{created, errors:[{reason}]}`. Then updates group.assignedInstruments.
- **Domain:** groups (self-referential parentId tree), memberIds (respondents), assignedInstruments (questionnaire names).

### live-tracking.tsx
- **Purpose:** Real-time monitor of respondents progressing through an assessment (5s polling). Route: **`/admin/live-tracking`**.
- **Exports:** default `LiveTrackingPage`.
- **Deps:** `liveTrackingApi`, types `LiveAssessmentSummary, LiveSessionRow, LiveStatus` from `@/lib/api`. `POLL_MS = 5000`.
- **UI:** assessment `Select` dropdown (label = instrumentFullName||instrument + groupName + "activeNow live / totalSessions total"); stat cards Total/Live/Idle/Completed/Not started; participants table (Respondent+email, Status badge, Question `currentIndex+1/totalQuestions`, Progress bar `percentComplete`, Last seen relative, Started). `selectorKey = instrument::groupId`.
- **API calls (both polled every 5s):**
  - `liveTrackingApi.listAssessments()` → **GET `/admin/live-tracking/assessments`** → LiveAssessmentSummary[] `{instrument,instrumentFullName,groupId,groupName,totalSessions,completed,activeNow,notStarted}`.
  - `liveTrackingApi.listSessions(instrument, groupId?)` → **GET `/admin/live-tracking/assessments/sessions?instrument=..&groupId=..`** → LiveSessionRow[] `{sessionId,respondentId,respondentName,respondentEmail,sessionStatus,liveStatus,currentIndex,totalQuestions,percentComplete,lastSeen,startedAt,completedAt}`. In-flight guard via `useRef`.
- **Quirk:** heartbeats arrive every 5s; rows go idle after 15s silence (server-side; note in UI).

### permissions.tsx
- **Purpose:** REAL role CRUD (DB-backed). Route: likely **`/admin/permissions`** (breadcrumb "Admin / Permissions"). NOTE: distinct from roles.tsx (static).
- **Exports:** default `PermissionsPage`.
- **Deps:** `getRoles, createRole, updateRole, deleteRole`, type `Role` from `@/lib/data-store`.
- **UI:** roles table (Role Name+description, URL Path chips, Edit/Delete). Modal form: name*, description, pathsText (comma/newline list of `/paths`, must start with `/`, `/*` wildcard). Delete confirm.
- **Role id gen:** `ROLE-<SLUG>` (dedup with `-2`, `-3`…).
- **API calls:**
  - `getRoles()` → `rolesApi.list()` → **GET `/roles`** → Role[] `{id,name,description,url_paths}`.
  - `createRole({id,name,description,url_paths})` → **POST `/roles`**.
  - `updateRole(id,{name,description,url_paths})` → **PUT `/roles/{id}`**.
  - `deleteRole(id)` → **DELETE `/roles/{id}`**.
- **Domain:** Role = page-access bundle (url_paths gate sidebar/routes).

### practitioners.tsx
- **Purpose:** Practitioner (clinician/HR user) CRUD. Route: **`/admin/practitioners`**.
- **Exports:** default `PractitionersPage`.
- **Deps:** `getPractitioners, createPractitioner, updatePractitioner, deletePractitioner, getRoles`, types `StoredPractitioner, Role` from `@/lib/data-store`; date helpers.
- **Consts:** `VERTICALS = ['Clinical','Industrial','Counselling','Experiments','White-Label']` (hardcoded).
- **UI:** stat cards (Total/active, Most Recent Login from `practitioners[0]`); table ID/Name/Email/Roles/Vertical Access/Status/Last Login/Actions. Modal form: name*, email*, phone, dob(DD/MM/YYYY→iso, used as login password), status Active/Inactive, roles* (toggle chips from roles list, incl. "Practitioner" default), verticals* (toggle chips). Delete confirm.
- **Practitioner id gen:** `P-NNN` (max existing +1).
- **API calls:**
  - `getPractitioners()` → `practitionersApi.list()` → **GET `/practitioners`** → Practitioner[] `{id,name,email,phone,roles[],verticals[],status,last_login,dob}`.
  - `getRoles()` → **GET `/roles`** (for role chips).
  - `createPractitioner({id,name,email,phone,dob,roles,verticals,status,last_login})` → **POST `/practitioners`**.
  - `updatePractitioner(id,{...})` → **PUT `/practitioners/{id}`**.
  - `deletePractitioner(id)` → **DELETE `/practitioners/{id}`**.
- **Quirk:** email uniqueness checked client-side. last_login set client-side on create.

### respondents.tsx
- **Purpose:** Respondent CRUD + overdue-assignment notifications + bulk upload. Route: **`/admin/respondents`**.
- **Exports:** default `RespondentsPage`.
- **Deps:** `assessmentsApi, API_BASE`, type `Assessment` from `@/lib/api`; `config` from `@/lib/config`; `createRespondent, deleteRespondent, getRespondents, updateRespondent`, type `StoredRespondent` from `@/lib/data-store`; date helpers; local `BulkUploadModal`.
- **UI:** header w/ Notifications bell (overdue buckets `24-48h`, `48h+` computed from assessments' createdAt vs now, non-completed), Bulk Upload, Add Respondent. Stat cards (Total+consent, Assessments Completed = Σ sessions_count, Consent Granted %). Table: Login ID, Name, Email, DOB(password), Sessions, Consent badge, Time to start (startedAt-createdAt of latest assignment) / "not started · waiting Xd", Overdue badge, Edit/Delete. Filter chip by overdue bucket. Add/Edit modal (name*, email*, phone, dob DD/MM/YYYY*, consent Granted/Pending/Withdrawn); on create shows credentials panel (Portal URL `${config.portalUrl}/portal/login`, email, phone, DOB password, ref id) + "Open Portal". Delete confirm.
- **Respondent id gen:** `R-NNN`.
- **API calls:**
  - `getRespondents()` → **GET `/respondents`**.
  - `assessmentsApi.list()` → **GET `/assessments`** (catch→[]) → Assessment[] (uses respondentId, createdAt, startedAt, status). Drives overdue buckets & time-to-start.
  - `createRespondent({id,name,email,phone,dob:iso,consent,sessions_count:0,last_assessment:'—'})` → **POST `/respondents`**.
  - `updateRespondent(id,{name,email,phone,dob,consent})` → **PUT `/respondents/{id}`**.
  - `deleteRespondent(id)` → **DELETE `/respondents/{id}`**.
  - Bulk via child → **POST `/respondents/bulk`**.
- **Domain:** respondent = assessee; DOB is portal login password; consent tri-state.

### roles.tsx
- **Purpose:** STATIC role/permission matrix display. Route: likely **`/admin/roles`** (breadcrumb "Admin / Permissions"). **100% hardcoded `roles` array, NO API, NO state.**
- **Exports:** default `RolesPage`.
- **Data (mock):** 6 roles — Platform Admin, Tenant Admin, Senior Practitioner, Practitioner, BodhLens Viewer, Respondent — each with 8 boolean permissions (Manage Tenants/Users, View All Data, Configure Branding, Manage API Keys, View Audit Logs, Process Erasure, Manage Questionnaires). Pure presentational grid.
- **Note:** Redundant/overlaps with permissions.tsx (real one). Dead-ish mock page.

---

## src/pages/settings/

### tenant.tsx
- **Purpose:** Organization settings form. Route: **`/settings/tenant`** (breadcrumb "Settings / Organization"). **Fully static — no state, no API, no submit handler.** `<Button>Save Settings</Button>` is inert.
- **Fields (static/default):** Tenant Name (default "Apollo Hospital"), Logo upload dropzone, Default Vertical select (Clinical/Industrial/Counselling & Child/Designing Experiments/White-Label), Default Language (English/Hindi/Marathi/Tamil/Telugu/Kannada/Bengali), Timezone (Asia/Kolkata default…). All mock.

### integrations.tsx
- **Purpose:** Third-party integrations dashboard. Route: **`/settings/integrations`**. **Fully static mock — no API.**
- **Data (mock):** Keycloak SSO (Connected, "Realm: bodhassess | Users synced: 1,570"), Gupshup WhatsApp (Connected), Twilio SMS (Connected, "$234.50"), Claude API (Connected, "Model: claude-sonnet-4-20250514 | Queries today: 89"), DigitalOcean (Disconnected). Stat tiles "4 of 5", "261 API Calls Today". Configure buttons inert.

### tiers.tsx
- **Purpose:** Subscription tier config display. Route: **`/settings/tiers`**. **Fully static mock — no API.**
- **Data (mock):** T1 Free / T2 Starter / T3 Professional / T4 Enterprise / T5 White-Label, each with feature list + active toggle (T5 inactive). Toggles are non-interactive divs.

---

## src/pages/white-label/

### tenants.tsx
- **Purpose:** White-label tenant management. Route: **`/white-label/tenants`**. **Local-state only, NO API** — new tenants added to in-memory `useState` array; lost on reload.
- **Exports:** default `TenantsPage`. Interface `Tenant {name,domain,vertical,tier,users,status,created}`.
- **Data (mock seed):** St. Mary's School, Apollo Hospital, Infosys L&D, MindMetrics Consulting.
- **UI:** Add Tenant form (name*, subdomain* → `{sub}.bodhassess.in`, vertical, tier T1-T5 w/ descriptions, contactName, contactEmail; "What happens next" DPDP/Keycloak note). Stat cards (Total Tenants, Total Users, DPDP Status "Compliant"). Table Name/Domain/Vertical/Tier/Users/Status/Created. `handleSubmit` just prepends to local array.

### branding.tsx
- **Purpose:** Branding config + login preview. Route: **`/white-label/branding`**. **Fully static — no state, no API.** Save button inert. Inputs use `defaultValue` (Primary #2563EB, Secondary #475569, font Inter, sender "BodhAssess", domain "assess.yourdomain.com").

### api.tsx
- **Purpose:** BPaaS API keys + endpoint reference. Route: **`/white-label/api`** (breadcrumb "White-Label / BPaaS API"). **Fully static mock — no API calls, no state.**
- **Data (mock):** apiKeys (Production/Staging/Legacy w/ masked keys, statuses Active/Revoked); stats (Requests Today 2,847 etc); **documented endpoints (reference text only, not invoked):** `POST /api/v1/proctoring/sessions`, `GET /api/v1/proctoring/trust-report`, `POST /api/v1/assessments/deliver`, `GET /api/v1/assessments/:id/results`. Generate/Copy/Configure buttons inert.

---

## src/pages/experiments/

### paradigms.tsx
- **Purpose:** Experimental paradigm library (reference cards). Route: **`/experiments/paradigms`** (breadcrumb "Designing Experiments / Paradigm Library"). **Fully static mock — no API.**
- **Data (mock):** 8 paradigms (IAT, Dot Probe, Stroop, Go/No-Go, N-Back, Affective Priming, Visual Search, Delay Discounting) each `{measures, clinicalUse, industrialUse, scoringAlgorithm, outputMetric, color}`. Stat cards (8 paradigms, 24+ clinical, 16+ industrial).

### builder.tsx
- **Purpose:** 4-step experiment builder wizard. Route: **`/experiments/builder`**. **Local-state only, NO API** — nothing persisted; "Launch Experiment"/"Preview Trial" buttons inert.
- **State:** `currentStep`, `selectedParadigm`, `config {trialCount:60, blockCount:3, stimulusDuration:500, interTrialInterval:1000, randomizationType}`.
- **Steps:** 1 Select Paradigm (6 cards: IAT/Dot Probe/Stroop/Go-NoGo/N-Back/Delay Discounting) → 2 Configure Stimuli (static selects) → 3 Set Parameters (numeric inputs, est. duration calc) → 4 Preview & Launch. "jsPsych-powered" badge. All mock.

### export.tsx
- **Purpose:** Trial-data export config UI. Route: **`/experiments/export`** (breadcrumb "Designing Experiments / Trial Data Export"). **Fully mock — no API**, Export/Download buttons inert.
- **Mock data:** experiments EXP-001..005, participants P-001..006, formats CSV/JSON/SPSS, include options (raw_rt/accuracy/trial_metadata/stimulus_info), previewColumns (participant_id,trial_number,block,condition,stimulus,…,rt_ms,timestamp), recentExports DL-001..005.
- **State:** selectedExperiment, selectedParticipants[], selectedFormat, selectedIncludes[] (local toggles only).

---

## src/pages/data-studio/

### index.tsx (Data Studio home)
- **Purpose:** Workbook gallery (list/create/edit/delete). Route: **`/data-studio`**. Cards link to **`/data-studio/wb/{id}`**.
- **Exports:** default `DataStudioHome` + `WorkbookFormDialog`, `DeleteWorkbookDialog`.
- **Deps:** `dataStudioApi`, type `Workbook` from `@/lib/api`; `react-router` Link; ui Dialog.
- **UI:** grid of workbook cards (name, access badge `owner/admin/editor/viewer`, description, `sheets.length` sheets, `shares.length` shared; edit/delete only for OWNER/ADMIN). New workbook dialog (name, description). Delete confirm dialog.
- **API calls:**
  - `dataStudioApi.listWorkbooks()` → **GET `/workbooks`** → Workbook[] `{id:number,name,description,ownerId,access,sheets[],dashboards[],shares[]}`.
  - `dataStudioApi.createWorkbook({name,description?})` → **POST `/workbooks`**.
  - `dataStudioApi.updateWorkbook(id,{name,description})` → **PUT `/workbooks/{id}`**.
  - `dataStudioApi.deleteWorkbook(id)` → **DELETE `/workbooks/{id}`**.
- **Domain:** Workbook access = OWNER/EDITOR/VIEWER/ADMIN/NONE.

### workbook.tsx (single workbook)
- **Purpose:** Workbook detail — sheets & dashboards tabs, create sheet/dashboard, share. Route: **`/data-studio/wb/:wid`** (reads `wid` via react-router useParams, `Number(wid)`). NOTE: index links `/data-studio/wb/{id}` — route param must be `:wid`.
- **Exports:** default `WorkbookPage` + `CreateSheetDialog`, `AssessmentPicker`, `CreateDashboardDialog`, `ShareDialog`.
- **Deps:** `assessmentRecordsApi, dataStudioApi`, types `AssessmentRecord, Dashboard, DerivedColumn, Sheet, Workbook`; child components `SheetView` (`@/src/components/data-studio/SheetView`), `DashboardView` (`.../DashboardView`).
- **Perms:** canEdit = OWNER/EDITOR/ADMIN; canManage = OWNER/ADMIN.
- **UI:** header (name, access badge, Share button); Sheets/Dashboards mode toggle; sheet tabs + New sheet; dashboard tabs + New dashboard; renders `SheetView`/`DashboardView`. CreateSheetDialog: `AssessmentPicker` (searchable dropdown, shows `sessionsCount` resp.), sheet name defaults to assessment name. ShareDialog: add by expert userId + role EDITOR/VIEWER, list/remove shares.
- **API calls:**
  - `dataStudioApi.getWorkbook(id)` → **GET `/workbooks/{id}`** (tolerates missing sheets/dashboards/shares via `??= []`).
  - `assessmentRecordsApi.list()` → **GET `/assessment-records`** (CreateSheetDialog; uses id, name, questionnaireName, sessionsCount).
  - `dataStudioApi.createSheet(workbookId,{name, sourceFilters:{assessmentId}})` → **POST `/workbooks/{workbookId}/sheets`** → Sheet.
  - `dataStudioApi.createDashboard(workbookId,{name})` → **POST `/workbooks/{workbookId}/dashboards`** → Dashboard.
  - `dataStudioApi.addShare(workbookId,{sharedWithUserId,role})` → **POST `/workbooks/{id}/shares`** → WorkbookShare.
  - `dataStudioApi.removeShare(workbookId,userId)` → **DELETE `/workbooks/{id}/shares/{userId}`**.
  - (Sheet cell/column edits + dashboard widgets handled inside SheetView/DashboardView — OUT OF SCOPE files; see catalog for the endpoints they'd hit: `/sheets/{id}/data`, `/sheets/{id}/columns`, `/sheets/{id}/validate-expr`, `/dashboards/{id}/widgets`, `/widgets/{id}`, `/analytics/query`.)
- **Domain:** Workbook→Sheets(sourceView 'sessions', sourceFilters {assessmentId}, derivedColumns)→Dashboards(widgets CHART/KPI/TABLE/PIVOT/TEXT). Derived columns eval CLIENT|SERVER.

---

# SYNTHESIS

## (a) What each page area does
- **admin/** — Core operational console. Manages the identity/assignment graph: **respondents** (assessees; DOB=portal password), **practitioners** (staff users w/ roles+verticals), **entity-registrations** (companies with contact person, member respondents, assigned assessments, active gate, drill-in with members/access/audit tabs), **groups** (nested respondent trees → bulk questionnaire→session assignment), **permissions** (real DB role/url_path CRUD), **roles** (static permission-matrix mock — redundant), **live-tracking** (5s-polled real-time session progress), **data-grid** (editable spreadsheet over sessions dataset with audited cell edits). bulk-upload-modal is the CSV/XLSX respondent importer.
- **settings/** — All three (tenant, integrations, tiers) are **static mock** display pages; no persistence.
- **white-label/** — tenants (in-memory only), branding (static), api (static BPaaS key/endpoint reference). No backend wiring.
- **experiments/** — paradigms/builder/export are **entirely mock** (jsPsych-themed UI scaffolding); no API, nothing persists.
- **data-studio/** — The one genuinely new, fully backend-wired feature area besides admin: workbooks → sheets (live over `/datasets/sessions` filtered by assessmentId) → derived columns → dashboards/widgets, with sharing/RBAC. Numeric ids (not string R-/P- ids).

## (b) Complete API-call catalog (from these files' own code; all under /api/v1)
| METHOD path | Page(s) | Payload | Response fields used |
|---|---|---|---|
| POST `/respondents/bulk` | bulk-upload-modal (via respondents) | `{respondents:[{name,email,dob,consent}]}` | created, skipped, errors[{row,email,reason}] |
| GET `/respondents` | respondents, groups, entity-registrations, entity-drill-in | — | id,name,email,phone,dob,consent,sessions_count |
| POST `/respondents` | respondents | `{id,name,email,phone,dob,consent,sessions_count,last_assessment}` | (created ok) |
| PUT `/respondents/{id}` | respondents | `{name,email,phone,dob,consent}` | (ok) |
| DELETE `/respondents/{id}` | respondents | — | — |
| GET `/assessments` | respondents | — | respondentId,createdAt,startedAt,status |
| POST `/assessments/bulk` | groups | `{assessments:[session objs]}` | created, errors[{reason}] |
| GET `/practitioners` | practitioners | — | id,name,email,phone,roles,verticals,status,last_login |
| POST `/practitioners` | practitioners | full Practitioner | ok |
| PUT `/practitioners/{id}` | practitioners | partial | ok |
| DELETE `/practitioners/{id}` | practitioners | — | — |
| GET `/roles` | permissions, practitioners | — | id,name,description,url_paths |
| POST `/roles` | permissions | `{id,name,description,url_paths}` | ok |
| PUT `/roles/{id}` | permissions | `{name,description,url_paths}` | ok |
| DELETE `/roles/{id}` | permissions | — | — |
| GET `/groups` | groups | — | id,name,parentId,memberIds,assignedInstruments |
| POST `/groups` | groups | full Group | ok |
| PUT `/groups/{id}` | groups | partial | ok |
| DELETE `/groups/{id}` | groups | — | — |
| GET `/questionnaires` | groups | — | id,name,shortName,vertical,questions[] |
| GET `/entity-registrations` | entity-registrations | — | id,companyName,name,email,phone,active,member_ids,assessments,created_at |
| GET `/entity-registrations/{id}` | entity-drill-in | — | companyName,name,email,active,member_ids,assessments |
| POST `/entity-registrations` | entity-registrations | `{name,companyName,email,phone,dob}` | created row |
| PATCH `/entity-registrations/{id}` | entity-registrations | `{active}` \| `{member_ids}` \| `{assessments}` | updated.assessments |
| DELETE `/entity-registrations/{id}` | entity-registrations | — | — |
| GET `/assessment-records` | entity-registrations, entity-drill-in, data-studio/workbook | — | id,name,questionnaireName,vertical,status,sessionsCount |
| GET `/audit/{targetType}/{targetId}` (=`/audit/entity/{id}`) | entity-drill-in | — | id,action,createdAt,actorName,actorId,before,after |
| GET `/admin/live-tracking/assessments` | live-tracking | — | instrument,instrumentFullName,groupId,groupName,totalSessions,completed,activeNow,notStarted |
| GET `/admin/live-tracking/assessments/sessions?instrument=&groupId=` | live-tracking | — | sessionId,respondentName,respondentEmail,liveStatus,currentIndex,totalQuestions,percentComplete,lastSeen,startedAt |
| GET `/datasets/sessions` | data-grid | (opt entityId,questionnaireId) | view,columns[{key,label,type,group,editable,options}],rows[{rowId,_updatedAt,…}],rowCount |
| PATCH `/datasets/sessions/cells` | data-grid | `[{rowId,columnKey,newValue,rowUpdatedAt}]` | applied,rows[],errors[{rowId,columnKey,message,conflict,currentUpdatedAt}] |
| GET `/workbooks` | data-studio/index | — | id,name,description,ownerId,access,sheets,dashboards,shares |
| POST `/workbooks` | data-studio/index | `{name,description?}` | Workbook |
| PUT `/workbooks/{id}` | data-studio/index | `{name?,description?}` | Workbook |
| DELETE `/workbooks/{id}` | data-studio/index | — | — |
| GET `/workbooks/{id}` | data-studio/workbook | — | full Workbook (sheets/dashboards/shares) |
| POST `/workbooks/{id}/sheets` | data-studio/workbook | `{name,sourceFilters:{assessmentId}}` | Sheet |
| POST `/workbooks/{id}/dashboards` | data-studio/workbook | `{name}` | Dashboard |
| POST `/workbooks/{id}/shares` | data-studio/workbook | `{sharedWithUserId,role}` | WorkbookShare |
| DELETE `/workbooks/{id}/shares/{userId}` | data-studio/workbook | — | — |

Non-API asset fetches: `/respondents-template.csv` (bulk modal), `${config.portalUrl}/portal/login` (respondents credentials panel).

## (c) Domain objects (as frontend types)
- **Respondent** `{id 'R-NNN', name, email, phone?, dob?, consent 'Granted|Withdrawn|Pending', sessions_count?, last_assessment?, accountType?, orgName?, orgWebsite?, companyId?}`. DOB = portal password.
- **Practitioner** `{id 'P-NNN', name, email, phone?, roles:string[], verticals:string[], status 'Active|Inactive', last_login?, dob?}`.
- **Role** `{id 'ROLE-SLUG', name, description?, url_paths:string[]}` (page-access bundle).
- **Group** `{id 'grp-xxx', name, description?, parentId:string|null, memberIds:string[], assignedInstruments:string[], createdAt?}` (self-referential tree).
- **EntityRegistration** `{id, name(contact), companyName, email, phone?, dob, active?, member_ids?:string[], verticals?, platform_modules?, assessments?:string[], created_at?}`. Entity = company; contact person fields on same row.
- **AssessmentRecord** (first-class assessment) `{id, name, questionnaireId, questionnaireVersionId?, questionnaireName?, vertical?, language?, status 'ACTIVE|CLOSED|PAUSED|TEST', autoNext?, entityCount/groupCount/respondentCount/sessionsCount/completedCount}`.
- **Assessment** (per-respondent SESSION; alias PortalSession) `{id, assessmentId?, respondentId, respondent, instrument, instrumentFullName?, vertical, language, status, score?, answers?, mqtScores?, groupId?, groupName?, entityId?, createdAt?, startedAt?, completedAt?, showQuestionIndex?, demographics?}`.
- **LiveAssessmentSummary / LiveSessionRow** — live-tracking projections (liveStatus: not_started|live|idle|completed).
- **Dataset** `{view, columns:DatasetColumn[], rows:DatasetRow[], rowCount}`; DatasetColumn.group core|scores|demographics|derived|dimension|measure; editable none|field|answer|override.
- **Data Studio:** Workbook(numeric id, access OWNER/EDITOR/VIEWER/ADMIN/NONE) → Sheet(sourceView 'sessions', sourceFilters {assessmentId}, derivedColumns DerivedColumn{colKey,label,expr,evalTarget CLIENT|SERVER,resultType}) → Dashboard → Widget(CHART/KPI/TABLE/PIVOT/TEXT). WorkbookShare{sharedWithUserId,role}.
- **Verticals** appear in two hardcoded forms: data-store BUILT_IN `Clinical/Industrial/Counselling/Experiments`; practitioners.tsx adds `White-Label`; settings/tenant uses long labels `Clinical Psychology` etc. — inconsistent naming across UI.

## (d) Odd / broken / mocked
- **Entirely static mock (no API, no persistence):** settings/tenant, settings/integrations, settings/tiers, white-label/branding, white-label/api, experiments/paradigms, experiments/builder, experiments/export, admin/roles. white-label/tenants persists only to in-memory useState (lost on reload).
- **Two competing "permissions" pages:** admin/roles.tsx (static 6-role matrix mock) vs admin/permissions.tsx (real `/roles` CRUD) — both breadcrumb "Admin / Permissions". Redundant; roles.tsx is dead mock.
- **entity-drill-in Allotments tab** is a hardcoded placeholder; `assessmentAllotmentsApi` imported but only `void`-referenced (dead import) — real allotments live on `/assessments` page.
- **integrations.tsx** hardcodes `Model: claude-sonnet-4-20250514` and fabricated counts.
- **data-studio route param mismatch risk:** index links `/data-studio/wb/{id}` but workbook.tsx reads `useParams().wid` — route must be declared `:wid` or it breaks.
- **groups.tsx** builds session objects client-side with `Math.random()` ids (`SESS-XXXXXX`) and posts to `/assessments/bulk` — older/legacy session-creation path (uses `portalSessionsApi` alias), separate from the newer AssessmentRecord/allotment model.
- **data-store.ts stubs:** `getSessions()`, `getQuestionnaires()`, `sessionsToReports()`, `getSessionById()` all return empty/null — sessions/reports not yet migrated off demo scaffolding (comments say localStorage path abandoned).
- **No react-query anywhere** in these pages — all manual `useState`+`useEffect`+`refresh()`. No localStorage reads/writes in these pages except indirectly via `getActiveToken()` in the API layer (`bodhassess.practitioner.token`/`bodhassess.auth.token`).
- **All calls target /api/v1 (legacy)**; the /api/v2 backend is NOT referenced by any file in scope. white-label/api.tsx only *documents* v1 proctoring/deliver/results endpoints as reference text (never invoked).
