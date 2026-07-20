I'll start by enumerating all files in the three target directories.
Let me read the files. I'll start with several in parallel, beginning with the question-bank files which are the most critical for authoring/scoring.
Continuing both large files.
Continuing create-questionnaire.tsx and reading the API/data-store libs that these pages depend on.
The api.ts and data-store.ts imports use `@/lib/` but aren't in src/lib. Let me find them and read the remaining question-bank files plus start the questionnaires directory.
Now the critical api.ts and data-store.ts libs, plus calibration.tsx.
Now data-store.ts and the two biggest questionnaires files.
Now versions.tsx, parents.tsx, and the instrument-overrides lib.
Now the vertical questionnaire pages and demographics.
Reading the remaining vertical pages plus the overrides lib.
Now the instrument-overrides lib and the reports directory.
Now the response-sheets (scoring display) and remaining report vertical pages, plus overrides/config.
Final batch: the three report vertical pages and the config.
Reading the final two report vertical pages.
I've read every file in scope plus the supporting libs (`lib/api.ts`, `lib/data-store.ts`, `lib/instrument-overrides.ts`, `lib/config.ts`). Here is the complete structured catalog.

---

# BODH FRONTEND — question-bank / questionnaires / reports

## GLOBAL FACTS
- **API base**: `lib/config.ts` → `config.apiBase = VITE_API_URL || 'http://localhost:4000/api/v1'`. All `jsonFetch` calls (in `lib/api.ts`) prepend this. So **every path below is under `/api/v1`** (legacy). No `/api/v2` calls exist anywhere in these pages.
- **Auth**: `jsonFetch` auto-attaches `Authorization: Bearer <token>` from `localStorage['bodhassess.practitioner.token'] || localStorage['bodhassess.auth.token']`.
- **Path alias**: `@/*` → repo root (`tsconfig.app.json`). So `@/lib/api` = `/lib/api.ts` (repo-root `lib/`, NOT `src/lib/`). `src/lib/` only has `router-helpers.tsx` (`useParams`).
- **Two parallel questionnaire models coexist**: (A) flat published blob at `/questionnaires` (shape `PublishedQuestionnaire`, the authoring output) + catalog mirror `/questionnaires-catalog`; (B) Git-style versioning `/questionnaire-records` (parents) + `.../versions` (drafts/commits). The **same editor** (`create-questionnaire.tsx`) serves both.

---

## FILE-BY-FILE

### `src/pages/question-bank/create-questionnaire.tsx` (3060 lines) — THE AUTHORING ENGINE
- **Export**: `default CreateAssessmentPage`. **Route**: `/question-bank/create` (also `?edit=<id|name|versionId>`, `?parentId=`, `?draftMode=1`).
- **Purpose**: 3-step wizard to create/edit a questionnaire with MQ/MQT scoring.
- **Core TS shapes** (exact):
  - `MediaType = 'none'|'image'|'video'|'youtube'|'audio'`
  - `MQT { id, name, children?: MQT[] }` (recursive tree); `MQ { id, name, mqts: MQT[] }`
  - `OptionMqtScore { mqt_id: string, score: number }`
  - `QuestionOption { text: string, scores: OptionMqtScore[], media_url?, media_type?: MediaType }`
  - `Coverage { mqs: string[], mqts: string[] }` (tagging only, NOT scored)
  - `Question { id, stem, format, media_url, media_type, options: QuestionOption[], question_scores: OptionMqtScore[], coverage: Coverage, clinical_risk_flag: boolean, risk_flag_rule: string, sectionId?, sectionTitle? }`
  - `FORMATS = ['MCQ','RATING_SCALE','LIKERT','SJT','FREE_TEXT','IMAGE_CHOICE','RANKING','MATRIX']`; options editor only renders for `MCQ|RATING_SCALE|LIKERT|SJT|IMAGE_CHOICE`. FREE_TEXT = no options, no scoring.
  - `TIERS T1..T5`; 11 `LANGUAGES` (en,hi,ta,te,mr,kn,bn,gu,ml,or,pa).
- **Scoring model** (critical): MQ = Measured Quality; MQTs form a recursive tree under it; **MQ root is never scored, only MQTs carry scores**. Two scoring scopes per question, both `Array<{mqt_id,score}>`: (1) `option.scores` credited when that option chosen; (2) `question_scores` credited on ANY answer regardless of option. `flattenMqtsForPicker` builds one row per MQT with breadcrumb path `"MQ > Parent > Leaf"`; single-trait-same-name-as-MQ collapses to MQ level ("Overall").
- **State/UI**: `step:1|2|3`. Step1 = metadata form (name, shortName, vertical [searchable dropdown + create-new-vertical modal], category, duration, tier, description, disclaimer, showInstructions/instructions, **demographicFieldKeys** multiselect, languages, isAdaptive, isFixed, useSections). Step2 = question builder: per-question accordion card with stem, MediaPicker (upload/youtube), risk flag+rule, question-level MQT score picker, Coverage picker (MQ chip + nested numbered MQT chips), per-option MQT score rows; sections grouping; sticky toolbar (Add Question/Section, Copy from Questionnaire, Import CSV/Excel, Preview); Coverage Map summary. Step3 = published confirmation.
- **react-query**: none (plain `useState`+`fetch`). **localStorage**: none directly (DraftBanner reads URL params).
- **API CALLS**:
  - `getMQs()` → **GET /qualities** (catalog of MQ trees; consumed: id,name,mqts).
  - `demographicFieldsApi.list(true)` → **GET /demographic-fields?active=true**.
  - edit mode: `questionnairesApi.getByName(editKey)` → **GET /questionnaires/by-name?name=**, fallback `questionnairesApi.get(editKey)` → **GET /questionnaires/{id}**.
  - `getVerticals()` → **GET /verticals** (+BUILT_IN merge); `questionnairesApi.list()` → **GET /questionnaires** (harvest orphan verticals + import library).
  - `verticalsApi.create(v)` → **POST /verticals** body `{id,code,name,description}`.
  - `uploadFile` → **POST /upload** (multipart FormData field `file`); response consumed: `{url, media_type}`.
  - Bulk CSV import: `qualitiesApi.create(mq)` → **POST /qualities**; `qualitiesApi.update(id,mq)` → **PUT /qualities/{id}** (auto-creates missing MQ/MQT levels).
  - **PUBLISH** (`handleSaveQuestions`), THREE writes:
    1. `questionnairesApi.upsert(payload)` → **POST /questionnaires**. Payload = full `PublishedQuestionnaire`: `{id,name,shortName,vertical,category,description,disclaimer,instructions,showInstructions,duration,tier,languages, mqs:[{id,name,mqts}], questions:[{id,stem,format,media_url,media_type,options:[{text,scores:[{mqt_id,score}],media_url,media_type}],question_scores:[{mqt_id,score}],coverage:{mqs,mqts},clinical_risk_flag,risk_flag_rule, sectionId?,sectionTitle?}], isDemo:false, demographicFieldKeys}`.
    2. raw `fetch` **POST /questionnaires-catalog** (backend-shape): `{id,name,short_name,vertical,category,description,duration_minutes,tier_required,languages,is_adaptive,is_fixed_sequence,uses_weighted_scoring:true, scoring_config:{model:'MQ_MQT', mqs:[{id,name,mqts}]}}`. Consumes response `.id` as `instrumentDbId`. **Non-fatal** (warning on failure).
    3. raw `fetch` **POST /questionnaires-catalog/{instrumentDbId}/items/bulk**: `{items:[{stem,format,media_url,media_type,options:[{text,scores:[{mqt_id,score}],media_url,media_type}], sub_domains: question_scores.map(s=>({domain:s.mqt_id, weight:s.score})), clinical_risk_flag,risk_flag_rule,sequence_order:idx+1,languages}]}`. **Non-fatal**. NOTE: `question_scores` mapped to `sub_domains{domain,weight}` here — different key names than the blob.
- **Bulk CSV/XLSX importer**: columns (case-insensitive): `stem`(req),`format`,`section`,`risk_flag`,`risk_rule`,`coverage_mqs`,`coverage_mqts`,`option1..option8`, and **numbered MQ scoring blocks** per scope: `{scope}_mq{n}/_mqt{n}/_submqt{n}/_subsubmqt{n}/_score{n}` where scope∈`question`|`option1..8`. Score lands on **deepest filled trait level**; missing MQ/MQT auto-created via qualities API. Legacy un-numbered block + `;`/`|` lists supported. Bare score w/ no MQ/MQT → falls back to first catalog MQT. `downloadBulkTemplate` emits sample CSV.
- **Import from questionnaire**: `questionnairesApi.list()` filtered to those with questions; clones selected questions (new uuids).
- **Nav**: back→`/questionnaires`; step3 → `/questionnaires`, `/assessments/create`.
- **DraftBanner** (bottom): reads `?draftMode=1&parentId=`; links to `/questionnaires/{parentId}/versions`. In draftMode the `?edit=` id is a **version id** and the POST /questionnaires upsert updates that draft row (server lock-guard allows DRAFT).
- **Quirks**: publish issues 3 writes but only #1 is fatal → catalog & items-table can silently lag (surfaced as warning text). `instIsAdaptive/instIsFixed` only sent to catalog write, not the blob.

### `src/pages/question-bank/item-explorer.tsx` (1467 lines)
- **Export**: `default QuestionBankPage`. **Route**: `/question-bank` (Item Explorer).
- **Purpose**: flatten every published questionnaire's questions into one browsable item table; inline edit / soft-delete.
- **Shapes**: `QuestionItem { id, subDomain, vertical, format:ItemFormat, irt:{a,b,c}, languages, status:ValidationStatus, riskFlag, stem, options?, normSets, lastCalibrated, sampleN, reliabilityAlpha, instrumentName?, instrumentShortName?, coverageMqs:string[], coverageMqts:string[] }`. `ItemFormat` = display labels ('MCQ','Rating Scale','Likert','SJT','Free Text','Image Choice','Ranking','Matrix'). `ValidationStatus` = Draft|Piloting|Calibrated|Validated|Deprecated.
- **`const ITEMS: QuestionItem[] = []`** — the "mock" seed pool is EMPTY. All rows come from live API.
- **Derived per-question**: `subDomain = "${shortName}:${mqtName}"` (mqtName = name of first option-score's mqt_id, else 'Custom'). **IRT a/b/c all hardcoded 0**; `status` always 'Draft'; `sampleN/reliabilityAlpha/normSets` all empty/0. So IRT/norms/calibration columns are cosmetic placeholders.
- **API CALLS**:
  - `questionnairesApi.list()` → **GET /questionnaires** (`loadUserItems`; skips `isDemo===true`; flattens `inst.questions`).
  - `itemDisplayApi.list()` → **GET /item-display** → `{itemId, override, deleted}[]`.
  - `verticalsApi.list()` → **GET /verticals**.
  - Update (display-only patch): `itemDisplayApi.upsertOverride(itemId, override)` → **POST /item-display/override** body `{itemId,override}`. Soft delete: `itemDisplayApi.markDeleted(id)` → **POST /item-display/{id}/delete**.
  - "Edit Question" (writes back to source): `questionnairesApi.getByName(target)` → **GET /questionnaires/by-name**; on save `questionnairesApi.get(id)` → **GET /questionnaires/{id}** then `questionnairesApi.upsert({...qn, questions})` → **POST /questionnaires**. Edits stem/format/risk/options(+scores)/coverage of one question inside its parent blob.
- **Header stat "100,000+ items, 18 formats, 11 languages"** = static marketing text; real counts computed from `allItems`.

### `src/pages/question-bank/norms.tsx` (264) — **STATIC MOCK, no API**. `normTables: NormTable[] = []` always empty → always shows "No norm tables available". Selectors (population/age/gender/education) are dead UI. `NormRow{rawScore,tScore,percentile,severity,ci95}`.

### `src/pages/question-bank/calibration.tsx` (268) — **STATIC MOCK, no API**. `calibrationJobs=[]`, `itemParams=[]`. 3PL formula display, "Run Calibration" button is inert. Hardcoded "RMSEA=0.028 / PHQ-9" cosmetic.

---

### `src/pages/questionnaires/all-questionnaires.tsx` (731)
- **Export**: `default QuestionnairesPage`. **Route**: `/questionnaires` (Library grid, verticals sidebar).
- **API**: `getQuestionnairesCatalog()` → **GET /questionnaires-catalog** (backend `Questionnaire` shape: `{id,name,short_name,vertical,category,item_count,duration_minutes,languages,tier_required,norm_status,is_published,...}`); `getVerticals()` → **GET /verticals**; delete → raw `fetch` **DELETE /questionnaires-catalog/{id}**.
- `getLocalQuestionnaires()` = data-store **DEAD STUB returns `[]`** (all "freshLocal" merging is inert). Edits persisted only to **localStorage `bodhassess.instrumentOverrides`** (never hit API).
- **Nav**: Create→`/question-bank/create`; "Open Versioned View"→`/questionnaires/parents`; Allot→`/assessments/create?questionnaire={shortName}`; Edit→`/question-bank/create?edit={id|name}`.

### `src/pages/questionnaires/parents.tsx` (285)
- **Export**: `default QuestionnaireParentsPage`. **Route**: `/questionnaires/parents` (versioned families list).
- **API**: `questionnaireRecordsApi.list()` → **GET /questionnaire-records** (`QuestionnaireParent{id,name,vertical,currentVersionId,currentVersionLabel,versionCount,draftCount,createdAt}`); `.create({name,vertical})` → **POST /questionnaire-records**; `.delete(id)` → **DELETE /questionnaire-records/{id}**.
- **Nav**: row→`/questionnaires/{id}/versions`.

### `src/pages/questionnaires/versions.tsx` (686)
- **Export**: `default QuestionnaireVersionsPage`. **Route**: `/questionnaires/:id/versions` (`useParams().id` = parentId). Git-style version history (tabs: Versions/Drafts/Audit).
- **API**:
  - `questionnaireRecordsApi.get(parentId)` → **GET /questionnaire-records/{id}** (returns `.versions[]` of `QuestionnaireVersionSummary{id,parentId,versionLabel,versionName,versionComments,status:'DRAFT'|'COMMITTED',branchedFromVersionId,committedAt,committedBy,isCurrent,inUseByAssessmentCount}`).
  - `auditApi.byTarget('questionnaire', parentId)` → **GET /audit/questionnaire/{id}**.
  - `questionnaireRecordsApi.setCurrentVersion(parentId, vId)` → **PATCH /questionnaire-records/{id}/current-version** body `{versionId}`.
  - `questionnaireVersionsApi.createDraft(parentId,{branchedFromVersionId,initialName})` → **POST /questionnaire-records/{pid}/versions/drafts**.
  - `.discardDraft(pid,vId)` → **DELETE /questionnaire-records/{pid}/versions/{vid}**.
  - `.commit(pid,vId,{bump:'MAJOR'|'MINOR',versionName,versionComments,setAsCurrent})` → **POST /questionnaire-records/{pid}/versions/{vid}/commit**.
  - CommitModal step1: `assessmentRecordsApi.listByQuestionnaire(parentId)` → **GET /assessment-records/by-questionnaire/{id}**; `.updateStatus(id,status)` → **PATCH /assessment-records/{id}/status** (ACTIVE/PAUSED/CLOSED/TEST).
- **Editor deep-link** for draft edit: `/question-bank/create?edit={versionId}&parentId={pid}&draftMode=1`. Preview link: `{origin}/preview/{versionId}` (copied to clipboard). Note: page never calls `questionnaireVersionsApi.editDraft/get` (those exist in api.ts, PATCH/GET `.../versions/{vid}`, but content edits route through the shared editor's POST /questionnaires instead).

### `src/pages/questionnaires/clinical.tsx` (384), `counselling.tsx` (322), `industrial.tsx` (293) — vertical library pages
- Routes `/questionnaires/clinical|counselling|industrial`. Each has local `const instruments=[]` (empty mock) + `loadUserQuestionnairesForVertical(V)` → `questionnairesApi.list(V)` → **GET /questionnaires?vertical=CLINICAL|COUNSELLING|INDUSTRIAL**. Consumes `{id,name,shortName,category,questions[],duration,languages,tier,description}`. Header stat numbers ("8","6","7"…) are **hardcoded literals**, not counts. Edits → localStorage overrides only (`saveOverride`, no API). Allot→`/assessments/create?questionnaire={name}`; Edit→`/question-bank/create?edit={key}`. (`clinical` keys overrides by shortName; `counselling`/`industrial` by `id`.)

### `src/pages/questionnaires/experimental.tsx` (225) — **STATIC MOCK, no API**. `paradigms=[]`. jsPsych paradigm cards; "Launch Paradigm"/"Sample Data" buttons inert. Stats hardcoded.

### `src/pages/questionnaires/demographics.tsx` (401)
- **Export**: `default DemographicFieldsPage`. **Route**: `/questionnaires/demographics` (catalog for portal pre-assessment form).
- **Shape**: `DemographicField { id, fieldKey, label, type:'text'|'number'|'date'|'select'|'textarea', required, placeholder?, options:string[], sortOrder, active }`.
- **API**: `demographicFieldsApi.list()` → **GET /demographic-fields**; `.upsert(field)` → **POST /demographic-fields** (also used for active-toggle & reorder swaps); `.delete(id)` → **DELETE /demographic-fields/{id}**. `fieldKey` derived via slugToCamel, immutable after create. These keys are what create-questionnaire's `demographicFieldKeys` references.

---

### `src/pages/reports/all-reports.tsx` (510) — **LIVE reports page**
- **Export**: `default ReportsPage`. **Route**: `/reports`.
- **API**: `assessmentsApi.list()` → **GET /assessments**. Filters `status.toLowerCase()==='completed'`. Consumes session fields: `id,respondent,name,instrumentFullName,instrument,vertical,completedAt,createdAt,respondentEmail,status,score,mqtScores,demographics`.
- `Report{id:'RPT-'+sessionId, sessionId, respondent, assessment, instrument, vertical, format:'Interactive'(always), status:'Draft'(always), generatedAt, generatedAtRaw}`.
- **Scoring display**: `readMqtScores(session.mqtScores)` (from api.ts; handles new id-keyed `{name,score}` AND legacy name-keyed `number`). View modal + XLSX export (lazy `xlsx`): Sheet1 summary, Sheet2 MQT Scores `[MQT ID,MQT Name,Score]`, Sheet3 Demographics.
- Format/Status filters + date inputs are decorative (status always Draft, format always Interactive). Pagination is fake (always page 1).

### `src/pages/reports/response-sheets.tsx` (800) — **LIVE, the real per-response + scoring recompute page**
- **Export**: `default ResponseSheetsPage`. **Route**: `/reports/response-sheets`.
- **API**: `assessmentsApi.list()` → **GET /assessments** (completed only). On row open, resolve questionnaire: `questionnairesApi.get(session.questionnaireVersionId)` → **GET /questionnaires/{id}** (pinned version), fallback `questionnairesApi.getByName(instrumentFullName|instrument)` → **GET /questionnaires/by-name?name=** (same resolution the take page uses).
- **SCORING LOGIC (mirrors portal)** — `responseMqtScores(question, answer, nameMap)`: if answered, `totals[mqt_id] += question.question_scores` **plus** (when `answer` is a number = option index) `question.options[answer].scores`. Returns `[{id,name,score}]`. `session.answers` keyed by `question.id` → `number`(option index) | `string`(free text). `session.mqtScores` keyed by mqt_id.
- `buildMqtNameMap` walks `q.mqs[].mqts[]` recursively (`children`) → `mqt_id→name`.
- Filters: entity (`session.entityId/entityName`) + assessment (`assessmentId` or `name:`+name) + search. Detail modal shows each question, the selected option (or free-text verbatim), the MQ/MQT points that response contributed, and session-level `mqtScores`. XLSX single + "Download All" (Report/MQT Scores/Responses sheets).

### `src/pages/reports/clinical.tsx` (374) & `industrial.tsx` (441) — **DEAD/EMPTY**
- Routes `/reports/clinical`, `/reports/industrial`. Both source data from `sessionsToReports(getSessions(), {vertical})` where **`getSessions()` and `sessionsToReports()` are data-store stubs that return `[]`** → these tables are **always empty**. `getSessionById()` → `null`. Download = `downloadJson` (client blob, no API). No live API calls at all. `industrial` invents `roleFitScore` (`55+avg*8` clamped 35–100) and competencies from mqtScores — but never runs (empty). `clinical` has diagnosticCodes/riskFlag fields, also never populated.

### `src/pages/reports/counselling.tsx` (451) — **MOCK + DEAD**
- Route `/reports/counselling`. Live path = same dead `sessionsToReports(getSessions())` stub (empty). BUT has **8 hardcoded mock reports `RPT-C001..C008`** (`reports[]` array with fake students Aarav/Ishita/…, SDQ/PHQ-A/CBCL/RCADS/Conners, severities) that ALWAYS render, merged after (nonexistent) live rows. `buildLiveCounsellingReports` derives severity from mqtScores sum (≥20 Abnormal, ≥12 Borderline) — inert. Download = downloadJson.

---

## SUPPORTING LIBS
- **`lib/api.ts`**: single typed client. Relevant exports used above: `qualitiesApi`(GET/POST/PUT/DELETE `/qualities`), `demographicFieldsApi`(`/demographic-fields`), `itemDisplayApi`(`/item-display[/override|/{id}/delete]`), `questionnairesApi`(list/listSummaries/get/getByName/upsert/delete on `/questionnaires`), `getQuestionnairesCatalog`(`/questionnaires-catalog`), `verticalsApi`(`/verticals`), `assessmentsApi`(`/assessments`…), `questionnaireRecordsApi`+`questionnaireVersionsApi`(`/questionnaire-records`), `assessmentRecordsApi`(`/assessment-records`), `auditApi`(`/audit`), `readMqtScores`. `PublishedQuestionnaire` is the canonical authoring/serving shape (see create-questionnaire payload).
- **`lib/data-store.ts`**: thin wrapper; **`getSessions()`/`getQuestionnaires()`/`sessionsToReports()`/`getSessionById()` are STUBS returning `[]`/`null`** — legacy scaffolding not migrated. `BUILT_IN_VERTICALS` = CLINICAL/INDUSTRIAL/COUNSELLING/EXPERIMENTS.
- **`lib/instrument-overrides.ts`**: client-only display overrides in localStorage `bodhassess.instrumentOverrides` (keyed by shortName/name or id). Never synced to backend.
- **`lib/config.ts`**: env config; `apiBase`, storage keys, `portalUrl`(default `localhost:3002`), `basePath`.

---

## SYNTHESIS

### (a) Questionnaire authoring flow (as UI implements it)
1. **MQ/MQT catalog is global** — defined on a separate `/qualities` page; the editor loads all MQ trees via GET /qualities. No per-questionnaire MQ selection.
2. **Step 1**: metadata + choose demographic field subset (keys from `/demographic-fields`) + toggle sections/adaptive/fixed. Verticals come from GET /verticals (+ built-ins + orphans harvested from existing questionnaires); new verticals POST /verticals first (persist-before-use to avoid orphans).
3. **Step 2**: add questions (manual, copy-from-questionnaire, or bulk CSV/XLSX). Each question: pick format, stem/media, **question_scores** (credited on any answer) and per-**option scores**, each an `{mqt_id, score}` against any MQT at any tree depth; plus **coverage** tags (MQ/MQT, non-scoring). Sections optional (denormalized `sectionId/sectionTitle` on each question). Bulk import can **auto-create** MQ/MQT tree nodes (POST /qualities, PUT /qualities/{id}) from numbered `_mq{n}/_mqt{n}/_submqt{n}/_subsubmqt{n}/_score{n}` columns.
4. **Publish** = 3 writes: (1 fatal) POST /questionnaires (the JSON blob = `published_questionnaires`); (2 non-fatal) POST /questionnaires-catalog with `scoring_config{model:'MQ_MQT', mqs}`; (3 non-fatal) POST /questionnaires-catalog/{id}/items/bulk where `question_scores`→`sub_domains{domain,weight}` and sequence_order per row.
5. **Editing** re-loads by id/name (GET /questionnaires[/by-name]) and re-POSTs the whole blob (upsert). **Versioning** is a parallel overlay: `/questionnaire-records` parents → drafts (POST .../versions/drafts) edited in the SAME editor (`?edit=<versionId>&draftMode=1`, which POSTs /questionnaires keyed by version id) → commit (POST .../commit, MAJOR/MINOR bump) → set-current (PATCH). Committed versions immutable; assessments pin `questionnaireVersionId`.

### (b) Report / scoring flow
- **Scoring is additive weighted sum per MQT**: on answer, `mqtScores[mqt_id] += question.question_scores[*] + selectedOption.scores[*]`. Free-text = no score. Computed server-side at submit; stored on the session as `Assessment.mqtScores` (new: id-keyed `{name,score}`; legacy: name-keyed number — `readMqtScores` normalizes). `Assessment.answers` = `{questionId: optionIndex|freeText}`.
- **Live reports**: `/reports` (all-reports) and `/reports/response-sheets` both pull GET /assessments, filter `status==='completed'`, and render `readMqtScores`. response-sheets additionally re-resolves the questionnaire (GET /questionnaires/{versionId} or /by-name) and **re-derives per-question MQ/MQT contribution client-side** (`responseMqtScores`, identical formula) for the responses sheet/detail view. Exports via client-side `xlsx`.
- **Vertical report pages are non-functional**: `/reports/clinical` and `/reports/industrial` render empty (dead `getSessions()` stub); `/reports/counselling` shows 8 hardcoded mock rows. `roleFitScore` (industrial), severity bands (counselling), diagnosticCodes/riskFlag (clinical) are **frontend-invented heuristics off mqtScores**, not backend concepts, and effectively never execute.

### (c) Complete API-call catalog (METHOD path — page — payload — response fields used)
```
GET  /qualities                                   — create-q, (item-explorer indirect) — — MQ[]{id,name,mqts(recursive)}
POST /qualities                                   — create-q bulk import — MQ{id,name,mqts} — created MQ
PUT  /qualities/{id}                              — create-q bulk import — Partial<MQ> — updated MQ
GET  /demographic-fields?active=true              — create-q Step1 — — DemographicField[]{id,fieldKey,label,type,required}
GET  /demographic-fields                          — demographics — — DemographicField[]
POST /demographic-fields                          — demographics (upsert/toggle/reorder) — DemographicField — field
DELETE /demographic-fields/{id}                   — demographics — — 204
GET  /questionnaires                              — item-explorer, create-q(import/orphans), — — PublishedQuestionnaire[] (id,name,shortName,vertical,category,questions,mqs,languages,isDemo,duration,tier)
GET  /questionnaires?vertical=CLINICAL|COUNSELLING|INDUSTRIAL — questionnaires/{vertical} — — PublishedQuestionnaire[]
GET  /questionnaires/{id}                         — create-q edit, item-explorer save, response-sheets — — PublishedQuestionnaire
GET  /questionnaires/by-name?name=                — create-q edit, item-explorer, response-sheets — — PublishedQuestionnaire
POST /questionnaires                              — create-q publish, item-explorer editQ — full PublishedQuestionnaire blob — echoed
POST /upload                                      — create-q MediaPicker — multipart file — {url,media_type}
POST /questionnaires-catalog                      — create-q publish (non-fatal) — backend-shape + scoring_config{model:'MQ_MQT',mqs} — {id}
POST /questionnaires-catalog/{id}/items/bulk      — create-q publish (non-fatal) — {items:[{stem,format,options,sub_domains:[{domain,weight}],clinical_risk_flag,risk_flag_rule,sequence_order,languages}]} — —
GET  /questionnaires-catalog                      — all-questionnaires — — Questionnaire[]{id,name,short_name,vertical,item_count,duration_minutes,languages,tier_required,norm_status}
DELETE /questionnaires-catalog/{id}               — all-questionnaires — — 204
GET  /verticals                                   — create-q, item-explorer, all-questionnaires — — Vertical[]{id,code,name,description}
POST /verticals                                   — create-q new-vertical — Vertical — created
GET  /item-display                                — item-explorer — — {itemId,override,deleted}[]
POST /item-display/override                       — item-explorer — {itemId,override} — row
POST /item-display/{id}/delete                    — item-explorer — — 204
GET  /questionnaire-records                       — parents — — QuestionnaireParent[]
POST /questionnaire-records                       — parents — {name,vertical} — parent (redirect to /versions)
DELETE /questionnaire-records/{id}                — parents — — 204
GET  /questionnaire-records/{id}                  — versions — — QuestionnaireParent{versions[]}
PATCH /questionnaire-records/{id}/current-version — versions — {versionId} — parent
POST /questionnaire-records/{pid}/versions/drafts — versions — {branchedFromVersionId,initialName} — versionSummary
POST /questionnaire-records/{pid}/versions/{vid}/commit — versions — {bump:'MAJOR'|'MINOR',versionName,versionComments,setAsCurrent} — versionSummary
DELETE /questionnaire-records/{pid}/versions/{vid}— versions (discard draft) — — 204
GET  /assessment-records/by-questionnaire/{id}    — versions CommitModal — — AssessmentRecord[]
PATCH /assessment-records/{id}/status             — versions CommitModal — {status} — record
GET  /audit/questionnaire/{id}                    — versions Audit tab — — AuditLogEntry[]
GET  /assessments                                 — reports/all-reports, reports/response-sheets — — Assessment[] (id,respondent,name,instrument[FullName],vertical,status,score,mqtScores,answers,demographics,completedAt,createdAt,respondentEmail,entityId,entityName,assessmentId,questionnaireVersionId)
```
(No `/api/v2` calls. api.ts also declares many unused-here endpoints: respondents, practitioners, auth, roles, groups, assessment-tokens, datasets, data-studio, analytics — not invoked by these pages.)

### (d) Frontend domain shapes (exact field lists) — canonical for backend comparison
- **PublishedQuestionnaire** (the authoring blob): `id, name, shortName?, vertical?, category?, description?, duration?, tier?, languages?[], mqs:[{id,name,mqts:MQT[]}], questions:[{id, stem, format, media_url, media_type, options:[{text, scores:[{mqt_id,score}], media_url?, media_type?}], question_scores?:[{mqt_id,score}], coverage?:{mqs:string[],mqts:string[]}, clinical_risk_flag, risk_flag_rule}], isDemo?, disclaimer?, instructions?, showInstructions?, demographicFieldKeys?[], createdAt?`. Plus (only in blob, not typed in api.ts) per-question `sectionId?, sectionTitle?`.
- **MQT** `{id,name,children?:MQT[]}` recursive; **MQ** `{id,name,description?,mqts:MQT[]}`.
- **Assessment/session** (scoring-relevant): `answers?: Record<questionId, number|string>`, `mqtScores?: Record<mqtId, {name,score}|number>`, `demographics?: Record<key,unknown>`, `questionnaireVersionId?`, `score?:string`, `status`.
- **Catalog Questionnaire** (backend-shape read): `{id,name,short_name,vertical,category,item_count,duration_minutes,languages[],tier_required,is_adaptive,is_fixed_sequence,norm_status,age_range,is_published,created_at}`.
- **Catalog write** adds `scoring_config{model:'MQ_MQT', mqs}`, `uses_weighted_scoring:true`; **items/bulk** uses `sub_domains:[{domain:mqtId, weight:score}]` (renamed from question_scores).

### (e) Odd / broken / mocked
- **Fully static/mock (no API, empty data)**: `question-bank/norms.tsx`, `question-bank/calibration.tsx`, `questionnaires/experimental.tsx`. Buttons (Run Calibration, Launch Paradigm) inert.
- **Dead-stub reports (always empty)**: `reports/clinical.tsx`, `reports/industrial.tsx` — depend on `getSessions()`/`sessionsToReports()` which return `[]`. `reports/counselling.tsx` = same dead live-path PLUS 8 hardcoded mock rows.
- **item-explorer**: IRT `a/b/c` hardcoded `0`, `status` always `Draft`, `sampleN/reliabilityAlpha/normSets` empty — the IRT/norm/calibration columns are placeholders. Header "100,000+ items" is marketing copy.
- **Vertical library pages** (clinical/counselling/industrial questionnaires): stat tiles are hardcoded literals, not real counts; edits persist only to localStorage, never backend.
- **`getLocalQuestionnaires()` in all-questionnaires** is inert (returns `[]`) yet still merged/deduped each render — dead code with focus/storage listeners that do nothing useful.
- **Publish fragility**: 3 sequential writes; only POST /questionnaires is fatal, so the catalog row and per-row items table can silently desync (surfaced as warning text). `question_scores` is stored under two different key names across the two writes (`question_scores` in blob vs `sub_domains{domain,weight}` in items/bulk) — a modeling mismatch to reconcile against the new backend.
- **Versioning vs blob overlap**: draft content edits go through POST /questionnaires keyed by version id (relying on a server DRAFT lock-guard), not the typed `questionnaireVersionsApi.editDraft` (PATCH) — that typed method is unused by the UI.
- **Scoring is plain additive weighted sums** (option.scores + question_scores per MQT); no IRT/theta/norm transform actually applied client-side despite the IRT/norms/calibration UI. Role-fit % and severity bands in report pages are ad-hoc frontend heuristics, not backend-provided.
