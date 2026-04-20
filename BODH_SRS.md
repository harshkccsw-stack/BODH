# BODH PSYCHOMETRIC PLATFORM — SOFTWARE REQUIREMENTS SPECIFICATION

**Version:** 2.0
**Status:** Current implementation (as of 2026-04-20)
**Supersedes:** SRS v1 (pre-implementation draft, archived as
`BodhAssess_SRS_v1.docx`)

This document describes the BodhAssess platform as built — functional
surface, data model, auth, and operational boundaries. If you're extending
the system, read this first, then [ARCHITECTURE.md](ARCHITECTURE.md) and
[API.md](API.md).

---

## 1. Product Overview

### 1.1 Purpose

BodhAssess is a multi-tenant psychometric assessment platform. Administrators
author questionnaires, assign them to respondents (individually or via
hierarchical groups), and review completed assessments. Respondents log in
through a dedicated portal and complete their assigned assessments.

### 1.2 Verticals

Four built-in verticals plus arbitrary user-created verticals:

- **Clinical** — depression / anxiety / trauma screening (PHQ-9, GAD-7, …)
- **Industrial** — personality / aptitude / behavioral (Big Five, HEXACO, SJTs)
- **Counselling** — age-normed developmental + school tools (SCAS, CDI-2, SDQ)
- **Experiments** — experimental paradigms (IAT, Stroop, N-Back)
- **Custom verticals** can be created from the Vertical dropdown on
  Create Questionnaire; they're stored in the `verticals` table.

### 1.3 Non-goals (explicit)

- No native mobile app. The web portal is responsive.
- No real IRT calibration pipeline yet — instruments expose a/b/c columns but
  the scoring engine uses MQ/MQT option scores, not IRT.
- No email/SMS invitation delivery. The session's `invitationSent` flag is
  captured but no message is sent; this is where WhatsApp / Twilio would plug
  in (`.env` has placeholders).
- No Keycloak SSO yet. Practitioner auth is not implemented — admin pages are
  currently unauthenticated. Respondent portal uses an opaque session token.

---

## 2. User Roles

| Role | Access | Auth |
|---|---|---|
| **Platform Admin** | Every admin page (no gating in-app yet) | Unauthenticated (local dev) |
| **Practitioner** | Assigned verticals + respondent list (UI scaffolding exists; gating TBD) | Unauthenticated (local dev) |
| **Respondent** | Only their own assigned sessions via portal | Login ID + DOB → opaque session token (7-day expiry) |

Respondent auth uses `portal_auth_sessions` in Postgres: login issues a UUID
token; every portal page calls `GET /respondents/me` with
`Authorization: Bearer <token>` to resolve the current user.

---

## 3. Functional Requirements

### 3.1 Administration

#### 3.1.1 Respondents — `/admin/respondents`
- List, add, delete respondents
- Required fields: `id` (auto-generated as `R-001`, `R-002`, …), name, email,
  DOB, consent status (`Granted` / `Pending` / `Withdrawn`)
- DOB acts as the portal-login password
- Dedupe by email (case-insensitive)

#### 3.1.2 Practitioners — `/admin/practitioners`
- List, add, delete
- Fields: id (auto `P-001`, …), name, email, role, vertical access, status
- Roles: Practitioner / Senior Practitioner / HR Professional / Researcher /
  Platform Admin

#### 3.1.3 Groups — `/admin/groups`
- Nested tree (arbitrary depth) via `parent_id` self-reference
- Each group holds `memberIds: string[]` (respondent IDs) directly and
  inherits descendants
- **Members** modal: searchable picker; save writes full member list
- **Assign** modal: pick ≥1 instrument; creates one `portal_session` per
  `(member, instrument)` pair, including descendants, via
  `POST /portal-sessions/bulk`
- Tree is search-filtered; ancestor nodes stay visible if a descendant matches

### 3.2 Question Bank

#### 3.2.1 Measured Qualities — `/qualities`
- 2-level hierarchy: MQ → MQT(s)
- Each MQ has name + description; each MQT has name only
- MQs are globally available when scoring options in Create Questionnaire

#### 3.2.2 Create Questionnaire — `/question-bank/create`
A 3-step wizard.

- **Step 1 — Instrument details:** name, short name, vertical (dropdown with
  search + inline create), category, duration, tier (T1–T5), languages, description
- **Step 2 — Add questions:**
  - Per-question: stem, format (MCQ / Rating Scale / Likert / SJT / Free Text /
    Image Choice / Ranking / Matrix), media (image / video / YouTube / audio),
    risk flag + rule
  - Per-option: text, optional media, per-MQT scores (dropdown picker;
    server enforces unique score per MQT within a question)
  - Actions: **Preview** (whole-questionnaire view, not one-at-a-time),
    **Copy from Questionnaire** (two-stage picker: instrument → questions),
    **Add Question**, **Publish**
- **Step 3 — Published:** success screen with links to library + session
  creation
- Edit mode: `/question-bank/create?edit=<name-or-id>` pre-loads an existing
  questionnaire (from `published_questionnaires`) and publishes an upsert so
  edits replace in place

#### 3.2.3 Item Explorer — `/question-bank`
- Flat view of every question across every questionnaire + seed mocks
- Filter by vertical / format / status / language + full-text search over
  stem, sub-domain, questionnaire name
- Per-row **Update** / **Delete** actions — persisted in
  `item_display_state` as JSONB overrides / `deleted=true` flags

### 3.3 Sessions

#### 3.3.1 List — `/sessions`
- Merge of live sessions (from Postgres) and frozen seed mocks
- Per-row action menu: **Update** / **Reset Assessment** / **Delete**
- Filters: search + status + vertical

#### 3.3.2 Create — `/sessions/create`
- Pick vertical, instrument, respondent, delivery language
- Optional: consent record ID (free text), proctoring toggle,
  **consent PDF upload** (PDF only, ≤ 2 MB, uploaded to `/api/v1/upload`)
- Pre-populates instrument via `?instrument=` query param (sent from library
  Start Session buttons)
- If the chosen instrument isn't in `published_questionnaires`, a
  5-item Likert-5 demo questionnaire is auto-seeded so the respondent
  can Launch the assessment end-to-end

#### 3.3.3 Batch Upload — `/sessions/batch`
- CSV-based bulk creation (scaffolded; parsing logic simplified for demo)

### 3.4 Instrument Library

- `/instruments` — combined view of built-in + user-published, with vertical
  filter sidebar (includes custom verticals)
- `/instruments/clinical` — clinical-only mocks merged with user-published
  Clinical questionnaires
- `/instruments/industrial` — same for Industrial
- `/instruments/counselling` — same for Counselling
- Per-card actions: **Start Session** (deep-links to `/sessions/create?instrument=…`)
  and **Edit** (opens metadata-edit modal + "Edit Questionnaire" button that
  jumps to Create Questionnaire in edit mode)
- Display overrides (name, category, duration, etc.) are stored per-card in
  the client-side override map and do not need to round-trip to the DB

### 3.5 Reports

- `/reports` — merge of completed sessions (derived via `sessionsToReports()`)
  and seed mock reports
- `/reports/clinical`, `/reports/industrial`, `/reports/counselling` — vertical-scoped
- Per-row: **View** (modal shows MQT totals + metadata) + **Download JSON**

### 3.6 Respondent Portal

- `/portal/login` — Login ID + DOB → `POST /api/v1/respondents/login` →
  stores opaque session token in `sessionStorage['bodhassess.auth.token']`
- `/portal/assessments` — list of assigned sessions (pending + completed)
- `/portal/take?id=<SESS-…>` — renders questions one at a time with media,
  progress bar, per-option selection. On submit computes MQT totals from
  the selected options and `PUT /portal-sessions/:id` with status=Completed
- `/portal/complete?id=<SESS-…>` — thank-you page with submission summary
- Every portal page resolves the token → respondent via
  `GET /respondents/me` (no respondent data cached client-side)

---

## 4. Data Model

See [DATABASE.md](DATABASE.md) for full schemas. Overview:

| Table | Purpose |
|---|---|
| `respondents` | Portal users |
| `practitioners` | Admin-side users |
| `respondent_groups` | Nested group hierarchy (self-FK) |
| `measured_qualities` | MQ + MQTs as JSONB |
| `verticals` | Custom user-created verticals |
| `published_questionnaires` | Full questionnaire (MQs + questions as JSONB) |
| `portal_sessions` | One row per (respondent, instrument) session |
| `portal_auth_sessions` | Portal login tokens (UUID, 7-day expiry) |
| `item_display_state` | Item Explorer overrides + soft-deletes |
| `instruments` + `items` | Legacy/first-draft schema; kept for compatibility |
| `sessions` + `responses` + `reports` | Legacy schema for future IRT / reporting |

---

## 5. Non-functional requirements

### 5.1 Data persistence
- Every piece of canonical data lives in Postgres.
- The only client-side persistence is `sessionStorage['bodhassess.auth.token']`
  — an opaque UUID that points to a DB row. No respondent / instrument /
  session data is cached client-side.

### 5.2 Languages
- Built-in: English, Hindi, Tamil, Bengali, Marathi, Telugu, Kannada,
  Malayalam, Gujarati, Punjabi, Odia (11 total).
- Selected at the instrument level (multiple allowed) and at the session level
  (single choice).

### 5.3 Security (current state + gaps)
- Respondent auth: token-based, server-validated, 7-day expiry (`portal_auth_sessions`).
- Practitioner / admin auth: **not yet implemented** — all admin endpoints
  currently open. Planned: Keycloak SSO (see `.env` placeholders).
- CORS: only `localhost:3000` and `localhost:3001` allowed by default.
- Consent PDF: validated server-side (PDF extension + 2 MB cap).

### 5.4 Compliance scaffolding
- DPDP Act 2023 surfaces: `/compliance/consent`, `/compliance/erasure`,
  `/compliance/audit`, `/compliance/portal`. These are UI scaffolding; the
  workflow wiring (DB-backed audit log, real erasure job) is pending.

---

## 6. Out-of-scope (for this release)

- Real-time proctoring (webcam / screen recording)
- Adaptive / CAT scoring logic (IRT parameters are stored but not used)
- Email / WhatsApp / SMS delivery of portal invitations
- Multi-tenant isolation at the database level (the `tenants` table exists;
  every handler currently runs global)
- Keycloak SSO for practitioners

---

## 7. Reference

- **REST API:** [API.md](API.md)
- **Postgres schema:** [DATABASE.md](DATABASE.md)
- **Architecture / data flow:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Developer onboarding:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Historical SRS / product specs** (pre-implementation, for context only):
  `BodhAssess_SRS_v1.docx`, `BodhAssess_Phase1_Specification_v1 (1).docx`
