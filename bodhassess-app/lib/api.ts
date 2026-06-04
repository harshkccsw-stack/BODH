// Single typed client for the Spring Boot backend. Every page goes through
// these functions — no localStorage fallback. If the API is down, pages
// surface the error to the caller so they can render a retry/empty state.

import { config } from './config';

export const API_BASE = config.apiBase;

// Pick the most appropriate stored token in priority order:
//   1. Dashboard (super admin / practitioner — unified /auth token)
//   2. Respondent (portal)
// Returning null is fine — the call goes out unauthenticated and the
// API returns 401 if the route requires auth.
function getActiveToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    localStorage.getItem(config.practitionerAuthStorageKey) ||
    localStorage.getItem(config.authStorageKey) ||
    null
  );
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) || {}),
  };
  // Auto-attach the active session token unless the caller already set one.
  if (!headers.Authorization) {
    const token = getActiveToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[API ${res.status}] ${path}: ${text}`);
  }
  if (res.status === 204) return null as T;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null as T;
  return res.json();
}

// ---------- Health ----------
export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  database: boolean;
  time: string;
}
export async function getHealth(): Promise<HealthStatus> {
  return jsonFetch<HealthStatus>('/health');
}

// ---------- Respondents ----------
export interface Respondent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  dob?: string;
  consent?: 'Granted' | 'Withdrawn' | 'Pending' | string;
  sessions_count?: number;
  last_assessment?: string;
  accountType?: 'individual' | 'organization' | string;
  orgName?: string;
  orgWebsite?: string;
  // Optional company identification number; used in registration dedup.
  companyId?: string;
}
export interface LoginResponse {
  token: string;
  respondent: Respondent;
}

export interface BulkRespondentRow {
  name: string;
  email: string;
  dob: string;
  consent?: 'Granted' | 'Pending' | 'Withdrawn' | string;
}

export interface BulkRespondentError {
  row: number;
  email?: string;
  reason: string;
}

export interface BulkRespondentResult {
  created: number;
  skipped: number;
  errors: BulkRespondentError[];
  inserted: Respondent[];
}

// Public self-signup table; admin-side list/delete only.
export interface EntityRegistration {
  id?: string;
  name: string;
  companyName?: string;
  email: string;
  phone?: string;
  dob: string;
  sessions_count?: number;
  last_assessment?: string;
  accountType?: string;
  orgName?: string;
  orgWebsite?: string;
  // Admin-controlled gate. Defaults to false until an admin approves the
  // self-signup; only active entities can receive assessment allotments.
  active?: boolean;
  // Linked respondent ids — the entity's members. Sessions get created
  // for each member when the entity is allotted to an Assessment.
  member_ids?: string[];
  created_at?: string;
}

// PATCH-style admin update — only the fields the dashboard wants to
// change. Cap management moved to AssessmentEntityAllotment.cap.
export interface EntityRegistrationUpdate {
  active?: boolean;
  member_ids?: string[];
}

export const entityRegistrationsApi = {
  list: () => jsonFetch<EntityRegistration[]>('/entity-registrations'),
  get: (id: string) => jsonFetch<EntityRegistration>(`/entity-registrations/${encodeURIComponent(id)}`),
  create: (e: EntityRegistration) =>
    jsonFetch<EntityRegistration>('/entity-registrations', { method: 'POST', body: JSON.stringify(e) }),
  update: (id: string, patch: EntityRegistrationUpdate) =>
    jsonFetch<EntityRegistration>(`/entity-registrations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  delete: (id: string) =>
    jsonFetch<null>(`/entity-registrations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const respondentsApi = {
  list: () => jsonFetch<Respondent[]>('/respondents'),
  get: (id: string) => jsonFetch<Respondent>(`/respondents/${encodeURIComponent(id)}`),
  create: (r: Respondent) => jsonFetch<Respondent>('/respondents', { method: 'POST', body: JSON.stringify(r) }),
  update: (id: string, r: Partial<Respondent>) => jsonFetch<Respondent>(`/respondents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(r) }),
  delete: (id: string) => jsonFetch<null>(`/respondents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bulk: (rows: BulkRespondentRow[]) =>
    jsonFetch<BulkRespondentResult>('/respondents/bulk', {
      method: 'POST',
      body: JSON.stringify({ respondents: rows }),
    }),
  login: (identifier: string, dob: string) => jsonFetch<LoginResponse>('/respondents/login', { method: 'POST', body: JSON.stringify({ identifier, dob }) }),
  me: (token: string) => jsonFetch<Respondent>('/respondents/me', { headers: { Authorization: `Bearer ${token}` } }),
  logout: (token: string) => jsonFetch<null>('/respondents/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
};

// ---------- Practitioners ----------
export interface Practitioner {
  id: string;
  name: string;
  email: string;
  phone?: string;
  roles: string[];
  verticals: string[];
  status: 'Active' | 'Inactive' | string;
  last_login?: string;
  dob?: string;
}
// /me returns the practitioner plus the merged url_paths from every role they
// hold. The dashboard uses url_paths to gate page access and trim the sidebar.
export interface PractitionerMe extends Practitioner {
  url_paths: string[];
}
// Unified login over the single app_users identity table. Both login pages
// (dashboard + assessment portal) call this; the response's isSuperAdmin
// decides which surface the caller routes to. roles/url_paths carry the RBAC
// the dashboard uses to gate routes — so /auth/me is the only identity call.
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  isSuperAdmin: boolean;
  entityIds?: string[];
  roles?: string[];
  url_paths?: string[];
}
export interface AuthLoginResponse {
  token: string;
  user: AuthUser;
}
export const authApi = {
  login: (email: string, dob: string) =>
    jsonFetch<AuthLoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, dob }) }),
  me: (token: string) =>
    jsonFetch<AuthUser>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
  logout: (token: string) =>
    jsonFetch<null>('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
};

export const practitionersApi = {
  list: () => jsonFetch<Practitioner[]>('/practitioners'),
  get: (id: string) => jsonFetch<Practitioner>(`/practitioners/${encodeURIComponent(id)}`),
  create: (p: Practitioner) => jsonFetch<Practitioner>('/practitioners', { method: 'POST', body: JSON.stringify(p) }),
  update: (id: string, p: Partial<Practitioner>) => jsonFetch<Practitioner>(`/practitioners/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(p) }),
  delete: (id: string) => jsonFetch<null>(`/practitioners/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Auth (login/me/logout) is unified under authApi → /auth. These CRUD
  // methods are the practitioner-management surface only.
};

// ---------- Roles (page-access bundles) ----------
export interface Role {
  id: string;
  name: string;
  description?: string;
  url_paths: string[];
}
export const rolesApi = {
  list: () => jsonFetch<Role[]>('/roles'),
  get: (id: string) => jsonFetch<Role>(`/roles/${encodeURIComponent(id)}`),
  create: (r: Role) => jsonFetch<Role>('/roles', { method: 'POST', body: JSON.stringify(r) }),
  update: (id: string, r: Partial<Role>) => jsonFetch<Role>(`/roles/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(r) }),
  delete: (id: string) => jsonFetch<null>(`/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ---------- Groups ----------
export interface Group {
  id: string;
  name: string;
  description?: string;
  parentId: string | null;
  memberIds: string[];
  assignedInstruments: string[];
  createdAt?: string;
}
export const groupsApi = {
  list: () => jsonFetch<Group[]>('/groups'),
  get: (id: string) => jsonFetch<Group>(`/groups/${encodeURIComponent(id)}`),
  create: (g: Group) => jsonFetch<Group>('/groups', { method: 'POST', body: JSON.stringify(g) }),
  update: (id: string, g: Partial<Group>) => jsonFetch<Group>(`/groups/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(g) }),
  delete: (id: string) => jsonFetch<null>(`/groups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ---------- Measured Qualities ----------
// MQTs form a tree. `mqts` on the MQ are the top-level children of the MQ
// root (the MQ itself is never scored against). Each MQT can have its own
// `children` recursively. Existing flat data parses unchanged because
// `children` is optional.
export interface MQT {
  id: string;
  name: string;
  children?: MQT[];
}
export interface MQ {
  id: string;
  name: string;
  description?: string;
  mqts: MQT[];
}

// Per-MQT scoring result on a completed assessment. Keyed by MQT id on the
// session so labels survive even if the MQ tree is later renamed/restructured.
export interface MQTScore {
  name: string;
  score: number;
}

// Reader for `Assessment.mqtScores` that handles both the new shape (id-keyed
// `{name, score}`) and the legacy shape (name-keyed `number`). Returns rows
// in iteration order.
export function readMqtScores(
  scores?: Record<string, MQTScore | number>,
): Array<{ key: string; name: string; score: number }> {
  if (!scores) return [];
  return Object.entries(scores).map(([key, v]) => {
    if (typeof v === 'number') return { key, name: key, score: v };
    return { key, name: v.name || key, score: Number(v.score) || 0 };
  });
}
export const qualitiesApi = {
  list: () => jsonFetch<MQ[]>('/qualities'),
  get: (id: string) => jsonFetch<MQ>(`/qualities/${encodeURIComponent(id)}`),
  create: (m: MQ) => jsonFetch<MQ>('/qualities', { method: 'POST', body: JSON.stringify(m) }),
  update: (id: string, m: Partial<MQ>) => jsonFetch<MQ>(`/qualities/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(m) }),
  delete: (id: string) => jsonFetch<null>(`/qualities/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ---------- Demographic Fields (catalogue for portal pre-assessment form) ----------
export interface DemographicField {
  id: string;
  fieldKey: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  required: boolean;
  placeholder?: string;
  options: string[];
  sortOrder: number;
  active: boolean;
}
export const demographicFieldsApi = {
  list: (activeOnly = false) => jsonFetch<DemographicField[]>(
    `/demographic-fields${activeOnly ? '?active=true' : ''}`,
  ),
  upsert: (f: DemographicField) => jsonFetch<DemographicField>('/demographic-fields', {
    method: 'POST',
    body: JSON.stringify(f),
  }),
  delete: (id: string) => jsonFetch<null>(`/demographic-fields/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ---------- Item Display State (Item Explorer overrides + soft-deletes) ----------
export interface ItemDisplayRow {
  itemId: string;
  override?: Record<string, any>;
  deleted: boolean;
}
export const itemDisplayApi = {
  list: () => jsonFetch<ItemDisplayRow[]>('/item-display'),
  upsertOverride: (itemId: string, override: Record<string, any>) =>
    jsonFetch<ItemDisplayRow>('/item-display/override', {
      method: 'POST',
      body: JSON.stringify({ itemId, override }),
    }),
  markDeleted: (itemId: string) =>
    jsonFetch<null>(`/item-display/${encodeURIComponent(itemId)}/delete`, { method: 'POST' }),
  clear: (itemId: string) =>
    jsonFetch<null>(`/item-display/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
};

// ---------- Published Questionnaires (frontend-shape) ----------
export interface PublishedQuestionnaire {
  id: string;
  name: string;
  shortName?: string;
  vertical?: string;
  category?: string;
  description?: string;
  duration?: number;
  tier?: string;
  languages?: string[];
  mqs: Array<{ id: string; name: string; mqts: MQT[] }>;
  questions: Array<{
    id: string;
    stem: string;
    format: string;
    media_url: string;
    media_type: string;
    options: Array<{ text: string; scores: Array<{ mqt_id: string; score: number }>; media_url?: string; media_type?: string }>;
    question_scores?: Array<{ mqt_id: string; score: number }>;
    // MQ/MQT coverage tags — which qualities/traits this question measures.
    // Independent of scoring; used for filtering and coverage reporting.
    coverage?: { mqs: string[]; mqts: string[] };
    clinical_risk_flag: boolean;
    risk_flag_rule: string;
  }>;
  isDemo?: boolean;
  disclaimer?: string;
  instructions?: string;
  showInstructions?: boolean;
  demographicFieldKeys?: string[];
  createdAt?: string;
}
// Lightweight projection returned by /questionnaires/summaries — only the
// fields the assessment-create dropdown actually renders.
export interface QuestionnaireSummary {
  id: string;
  name: string;
  shortName?: string;
  vertical?: string;
  category?: string;
  duration?: number;
  itemCount: number;
}
export const questionnairesApi = {
  list: (vertical?: string) => {
    const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
    return jsonFetch<PublishedQuestionnaire[]>(`/questionnaires${qs}`);
  },
  listSummaries: (vertical?: string) => {
    const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
    return jsonFetch<QuestionnaireSummary[]>(`/questionnaires/summaries${qs}`);
  },
  get: (id: string) => jsonFetch<PublishedQuestionnaire>(`/questionnaires/${encodeURIComponent(id)}`),
  getByName: (name: string) => jsonFetch<PublishedQuestionnaire>(`/questionnaires/by-name?name=${encodeURIComponent(name)}`),
  upsert: (q: PublishedQuestionnaire) => jsonFetch<PublishedQuestionnaire>('/questionnaires', { method: 'POST', body: JSON.stringify(q) }),
  delete: (id: string) => jsonFetch<null>(`/questionnaires/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ---------- Questionnaires (backend-shape) ----------
export interface Questionnaire {
  id: string;
  name: string;
  short_name: string | null;
  vertical: string;
  category: string | null;
  item_count: number;
  duration_minutes: number | null;
  languages: string[];
  tier_required: string;
  is_adaptive: boolean;
  is_fixed_sequence: boolean;
  norm_status: string;
  age_range: string | null;
  is_published: boolean;
  created_at: string;
}
export async function getQuestionnairesCatalog(vertical?: string): Promise<Questionnaire[]> {
  const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
  const list = await jsonFetch<Questionnaire[] | { data?: Questionnaire[] }>(`/questionnaires-catalog${qs}`);
  // The older Go handler returns a plain array; tolerate either shape.
  return Array.isArray(list) ? list : (list?.data || []);
}

// ---------- Sessions (backend-shape) ----------
export interface Session {
  id: string;
  vertical: string;
  language: string;
  status: string;
  is_proctored: boolean;
  trust_score: number | null;
  theta_estimate: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  respondent_name: string;
  instrument_name: string | null;
}

// ---------- Assessments (simple frontend-shape) ----------
export interface Assessment {
  id: string;
  // Group key: every session created in a single admin bulk allotment
  // shares this id, so the UI can collapse N sessions into one assessment
  // row. Older rows (created before this column existed) may be null.
  assessmentId?: string;
  name?: string;
  respondentId: string;
  respondent: string;
  respondentEmail?: string;
  instrument: string;
  instrumentFullName?: string;
  vertical?: string;
  language?: string;
  status: string;
  score?: string;
  answers?: Record<string, number | string>;
  // Keyed by MQT id, value carries the resolved name + total. Legacy rows
  // may be `Record<string, number>` keyed by name — readers handle both
  // shapes via `readMqtScores`.
  mqtScores?: Record<string, MQTScore | number>;
  groupId?: string;
  groupName?: string;
  // When the session was generated from an entity allotment, the entity
  // is recorded here so per-(entity, assessment) cap counts can include
  // it.
  entityId?: string;
  entityName?: string;
  consentId?: string;
  proctoring?: boolean;
  invitationSent?: boolean;
  // Per-allotment override: when true the respondent sees a numbered
  // side-panel during the take-assessment flow with attempted questions
  // highlighted. Off by default.
  showQuestionIndex?: boolean;
  createdAt?: string;
  completedAt?: string;
  // Set on the server the first time the respondent submits a non-empty
  // answer. Drives the time-to-start metric and the 24h/48h overdue buckets
  // on the respondents dashboard.
  startedAt?: string;
  // Captured pre-assessment from the demographic-fields catalogue. Free-form
  // since the field set is configurable at runtime.
  demographics?: Record<string, unknown>;
}
// Backwards-compatible alias so existing imports keep working.
export type PortalSession = Assessment;

// Bulk-create response shape from /assessments/bulk. The `errors` array
// lists per-row failures (validation, duplicate id, DB errors) so callers
// can surface them instead of treating any non-error response as success.
export interface BulkAssessmentError {
  row: number;
  id?: string;
  reason: string;
}
export interface BulkAssessmentResult {
  created: number;
  errors?: BulkAssessmentError[];
}

// Slim projection used by list views (dashboard's Recent Assessments,
// All Assessments) so the heavy answers/mqtScores/demographics collections
// aren't fetched just to render a row.
export interface AssessmentSummary {
  id: string;
  assessmentId?: string;
  name?: string;
  respondentName?: string;
  instrument?: string;
  vertical?: string;
  status?: string;
  score?: string;
  createdAt?: string;
  completedAt?: string;
}

// One row per assessmentId — what /assessments/groups returns. Drives the
// grouped All Assessments table view.
export interface AssessmentGroup {
  assessmentId: string;
  name?: string;
  instrument?: string;
  instrumentFullName?: string;
  vertical?: string;
  language?: string;
  createdAt?: string;
  respondentCount: number;
  completedCount: number;
  activeCount: number;
  pendingReviewCount: number;
}

export const assessmentsApi = {
  list: (respondentId?: string) => {
    const qs = respondentId ? `?respondentId=${encodeURIComponent(respondentId)}` : '';
    return jsonFetch<Assessment[]>(`/assessments${qs}`);
  },
  listSummaries: (opts: { respondentId?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (opts.respondentId) qs.set('respondentId', opts.respondentId);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const q = qs.toString();
    return jsonFetch<AssessmentSummary[]>(`/assessments/summaries${q ? '?' + q : ''}`);
  },
  // Grouped: one row per assessmentId with aggregate counts.
  listGroups: () => jsonFetch<AssessmentGroup[]>('/assessments/groups'),
  // All sessions (respondent rows) for a single assessmentId.
  listByAssessment: (assessmentId: string) =>
    jsonFetch<AssessmentSummary[]>(`/assessments/by-assessment?assessmentId=${encodeURIComponent(assessmentId)}`),
  get: (id: string) => jsonFetch<Assessment>(`/assessments/${encodeURIComponent(id)}`),
  create: (s: Assessment) => jsonFetch<Assessment>('/assessments', { method: 'POST', body: JSON.stringify(s) }),
  bulk: (assessments: Assessment[]) => jsonFetch<BulkAssessmentResult>('/assessments/bulk', { method: 'POST', body: JSON.stringify({ assessments }) }),
  update: (id: string, s: Partial<Assessment>) => jsonFetch<Assessment>(`/assessments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(s) }),
  delete: (id: string) => jsonFetch<null>(`/assessments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  heartbeat: (id: string, body: { currentIndex: number; totalQuestions: number }) =>
    jsonFetch<void>(`/assessments/${encodeURIComponent(id)}/heartbeat`, { method: 'POST', body: JSON.stringify(body) }),
};
// Backwards-compatible alias.
export const portalSessionsApi = assessmentsApi;

// ---------- Admin live tracking ----------
export interface LiveAssessmentSummary {
  instrument: string;
  instrumentFullName?: string;
  groupId?: string | null;
  groupName?: string | null;
  totalSessions: number;
  completed: number;
  activeNow: number;
  notStarted: number;
}

export type LiveStatus = 'not_started' | 'live' | 'idle' | 'completed';

export interface LiveSessionRow {
  sessionId: string;
  respondentId: string;
  respondentName: string;
  respondentEmail?: string;
  sessionStatus: string;
  liveStatus: LiveStatus;
  currentIndex?: number;
  totalQuestions?: number;
  percentComplete?: number;
  lastSeen?: string;
  startedAt?: string;
  completedAt?: string;
}

export const liveTrackingApi = {
  listAssessments: () => jsonFetch<LiveAssessmentSummary[]>('/admin/live-tracking/assessments'),
  listSessions: (instrument: string, groupId?: string | null) => {
    const params = new URLSearchParams({ instrument });
    if (groupId) params.set('groupId', groupId);
    return jsonFetch<LiveSessionRow[]>(`/admin/live-tracking/assessments/sessions?${params.toString()}`);
  },
};

// ---------- Verticals ----------
export interface Vertical {
  id: string;
  code: string;
  name: string;
  description?: string;
}
export const verticalsApi = {
  list: () => jsonFetch<Vertical[]>('/verticals'),
  create: (v: Vertical) => jsonFetch<Vertical>('/verticals', { method: 'POST', body: JSON.stringify(v) }),
  delete: (id: string) => jsonFetch<null>(`/verticals/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ====================================================================
// First-class Assessment + Allotments + Tokens + Audit log
//
// These sit on top of /api/v1/assessment-records. The legacy /assessments
// surface (which actually represents per-respondent SESSIONS) keeps
// working for the take/edit flows. New Assessment-centric pages use the
// types below.
// ====================================================================

export type AssessmentStatus = 'ACTIVE' | 'CLOSED' | 'PAUSED';

// One row per allotment of (Assessment, Entity), with the per-pair cap.
// cap = null means unlimited. sessionsCount lets the UI show used/total
// at a glance in the Allotees popup.
export interface AssessmentEntityAllotment {
  assessmentId: string;
  entityId: string;
  entityName?: string;
  cap?: number | null;
  sessionsCount?: number;
  completedCount?: number;
  createdAt?: string;
}

export interface AssessmentGroupAllotment {
  assessmentId: string;
  groupId: string;
  groupName?: string;
  memberCount?: number;
  createdAt?: string;
}

export interface AssessmentRespondentAllotment {
  assessmentId: string;
  respondentId: string;
  respondentName?: string;
  respondentEmail?: string;
  createdAt?: string;
}

// Aggregate shape returned by GET /assessment-records/{id}/allotments —
// the All Assessments "Allotees" popup renders directly from this.
export interface AssessmentAllotees {
  assessmentId: string;
  entities: AssessmentEntityAllotment[];
  groups: AssessmentGroupAllotment[];
  respondents: AssessmentRespondentAllotment[];
}

// First-class Assessment — the reusable allotment of a Questionnaire to
// a set of Allotees. NOT to be confused with the existing `Assessment`
// interface above, which is the per-respondent session shape kept for
// take/edit compatibility.
export interface AssessmentRecord {
  id: string;
  name: string;
  questionnaireId: string;             // parent (questionnaire family)
  questionnaireVersionId?: string;     // the specific committed version this assessment is pinned to
  questionnaireName?: string;
  vertical?: string;
  language?: string;
  status: AssessmentStatus;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  // Aggregate counts the list endpoint fills in.
  entityCount?: number;
  groupCount?: number;
  respondentCount?: number;
  sessionsCount?: number;
  completedCount?: number;
  // Initial-allotment payload used by the one-shot create form. Empty
  // on read except when the caller is the edit/create page.
  entityAllotments?: AssessmentEntityAllotment[];
  groupAllotments?: string[];
  respondentAllotments?: string[];
}

export const assessmentRecordsApi = {
  list: () => jsonFetch<AssessmentRecord[]>('/assessment-records'),
  get: (id: string) => jsonFetch<AssessmentRecord>(`/assessment-records/${encodeURIComponent(id)}`),
  create: (a: Partial<AssessmentRecord>) =>
    jsonFetch<AssessmentRecord>('/assessment-records', { method: 'POST', body: JSON.stringify(a) }),
  update: (id: string, a: Partial<AssessmentRecord>) =>
    jsonFetch<AssessmentRecord>(`/assessment-records/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(a) }),
  updateStatus: (id: string, status: AssessmentStatus) =>
    jsonFetch<AssessmentRecord>(`/assessment-records/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  delete: (id: string) => jsonFetch<null>(`/assessment-records/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  audit: (id: string) => jsonFetch<AuditLogEntry[]>(`/assessment-records/${encodeURIComponent(id)}/audit`),
};

export const assessmentAllotmentsApi = {
  // Aggregated view drives the Allotees popup.
  list: (assessmentId: string) =>
    jsonFetch<AssessmentAllotees>(`/assessment-records/${encodeURIComponent(assessmentId)}/allotments`),

  // Entities — only allotee type with a cap.
  addEntity: (assessmentId: string, entityId: string, cap?: number | null) =>
    jsonFetch<AssessmentEntityAllotment>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/entities`,
      { method: 'POST', body: JSON.stringify({ entityId, cap }) },
    ),
  updateEntityCap: (assessmentId: string, entityId: string, cap: number | null) =>
    jsonFetch<AssessmentEntityAllotment>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/entities/${encodeURIComponent(entityId)}`,
      { method: 'PATCH', body: JSON.stringify({ cap }) },
    ),
  removeEntity: (assessmentId: string, entityId: string) =>
    jsonFetch<null>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/entities/${encodeURIComponent(entityId)}`,
      { method: 'DELETE' },
    ),

  // Groups
  addGroup: (assessmentId: string, groupId: string) =>
    jsonFetch<AssessmentGroupAllotment>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/groups`,
      { method: 'POST', body: JSON.stringify({ groupId }) },
    ),
  removeGroup: (assessmentId: string, groupId: string) =>
    jsonFetch<null>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/groups/${encodeURIComponent(groupId)}`,
      { method: 'DELETE' },
    ),

  // Individual respondents
  addRespondent: (assessmentId: string, respondentId: string) =>
    jsonFetch<AssessmentRespondentAllotment>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/respondents`,
      { method: 'POST', body: JSON.stringify({ respondentId }) },
    ),
  removeRespondent: (assessmentId: string, respondentId: string) =>
    jsonFetch<null>(
      `/assessment-records/${encodeURIComponent(assessmentId)}/allotments/respondents/${encodeURIComponent(respondentId)}`,
      { method: 'DELETE' },
    ),
};

// Registration tokens. Admin issues / lists / revokes; the /register
// page reaches the public resolve + consume endpoints anonymously.
export interface AssessmentToken {
  token: string;
  assessmentId: string;
  // Display names, populated by the public resolve() endpoint only.
  assessmentName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  respondentId?: string | null;
  maxUses?: number | null;
  usedCount?: number;
  expiresAt?: string | null;
  createdAt?: string;
  createdBy?: string;
}
export interface IssueTokenRequest {
  assessmentId: string;
  entityId?: string | null;
  groupId?: string | null;
  respondentId?: string | null;
  maxUses?: number | null;
  expiresAt?: string | null;
}
export const assessmentTokensApi = {
  issue: (req: IssueTokenRequest) =>
    jsonFetch<AssessmentToken>('/assessment-tokens', { method: 'POST', body: JSON.stringify(req) }),
  listForAssessment: (assessmentId: string) =>
    jsonFetch<AssessmentToken[]>(`/assessment-tokens/by-assessment/${encodeURIComponent(assessmentId)}`),
  revoke: (token: string) =>
    jsonFetch<null>(`/assessment-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }),
};

// Public-side token endpoints — called from /register. Permitted without
// auth in SecurityConfig.
export interface PublicRegistrationRequest {
  name: string;
  email: string;
  phone?: string;
  dob: string;  // ISO yyyy-MM-dd
  companyId?: string;
}
export interface PublicRegistrationResult {
  sessionId: string;
  respondentId: string;
  assessmentId: string;
  // RESPONDENT auth token — store it so the portal take flow opens without
  // a second login.
  token: string;
}
// Pre-registration dedup check — dob plus any one of email/phone/companyId.
export interface RegistrationCheckRequest {
  email?: string;
  phone?: string;
  companyId?: string;
  dob: string;  // ISO yyyy-MM-dd
}
export const publicTokensApi = {
  resolve: (token: string) =>
    jsonFetch<AssessmentToken>(`/public/tokens/${encodeURIComponent(token)}`),
  consume: (token: string) =>
    jsonFetch<AssessmentToken>(`/public/tokens/${encodeURIComponent(token)}/consume`, { method: 'POST' }),
  // One-shot: creates/reuses respondent, links to entity, creates session,
  // consumes token. The SPA only needs to call this — the rest of the
  // multi-step dance lives on the server.
  register: (token: string, body: PublicRegistrationRequest) =>
    jsonFetch<PublicRegistrationResult>(`/public/tokens/${encodeURIComponent(token)}/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Returns { exists } so the page can prompt login instead of re-registering.
  registrationCheck: (body: RegistrationCheckRequest) =>
    jsonFetch<{ exists: boolean }>(`/public/tokens/registration-check`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Absolute URL of the QR PNG for a token's registration link. `base` is the
  // front-end origin so the encoded link points at this host. Used as an
  // <img>/download src — the endpoint streams image/png.
  qrUrl: (token: string, base: string) =>
    `${API_BASE}/public/tokens/${encodeURIComponent(token)}/qr?base=${encodeURIComponent(base)}`,
};

// Append-only audit log. Surfaced as tabs on the entity drill-in and
// assessment edit pages.
export interface AuditLogEntry {
  id: number;
  actorId?: string;
  actorName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: string;   // JSON string snapshot of fields before the change
  after?: string;    // JSON string snapshot after
  createdAt?: string;
}
export const auditApi = {
  recent: () => jsonFetch<AuditLogEntry[]>('/audit'),
  byTarget: (targetType: string, targetId: string) =>
    jsonFetch<AuditLogEntry[]>(`/audit/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`),
};

// ====================================================================
// Git-style questionnaire versioning
//
// Parents live at /questionnaire-records (one row per questionnaire
// family — PHQ-9, GAD-7, …). Each parent has many versions; only
// COMMITTED versions can be allotted to an assessment. Drafts are
// editable; committing freezes the content and bumps semver.
//
// Frontend split:
//   - questionnaireRecordsApi → parents (Question Bank list, set-current)
//   - questionnaireVersionsApi → versions (drafts, commits, history)
// ====================================================================

export type QuestionnaireVersionStatus = 'DRAFT' | 'COMMITTED';

export interface QuestionnaireVersionSummary {
  id: string;
  parentId: string;
  versionMajor?: number;
  versionMinor?: number;
  versionLabel?: string;
  versionName?: string;
  versionComments?: string;
  status: QuestionnaireVersionStatus;
  branchedFromVersionId?: string;
  committedAt?: string;
  committedBy?: string;
  isCurrent?: boolean;
  inUseByAssessmentCount?: number;
}

export interface QuestionnaireParent {
  id: string;
  name: string;
  vertical?: string;
  currentVersionId?: string;
  currentVersionLabel?: string;
  createdAt?: string;
  createdBy?: string;
  versionCount?: number;
  draftCount?: number;
  // Populated on the detail endpoint, empty on list.
  versions?: QuestionnaireVersionSummary[];
}

export interface CreateDraftRequest {
  // null → blank draft. Otherwise must be a COMMITTED version id under
  // the same parent — the new draft starts as a clone.
  branchedFromVersionId?: string | null;
  initialName?: string;
}

export interface CommitVersionRequest {
  // 'MAJOR' or 'MINOR' (case-insensitive on the wire).
  bump: 'MAJOR' | 'MINOR';
  versionName?: string;
  versionComments?: string;
  // True → freshly-committed version also becomes the parent's current
  // pointer. Typical default for the edit-and-ship flow.
  setAsCurrent?: boolean;
}

export const questionnaireRecordsApi = {
  // Parents
  list: () => jsonFetch<QuestionnaireParent[]>('/questionnaire-records'),
  get: (id: string) => jsonFetch<QuestionnaireParent>(`/questionnaire-records/${encodeURIComponent(id)}`),
  create: (body: Partial<QuestionnaireParent>) =>
    jsonFetch<QuestionnaireParent>('/questionnaire-records', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<QuestionnaireParent>) =>
    jsonFetch<QuestionnaireParent>(`/questionnaire-records/${encodeURIComponent(id)}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  delete: (id: string) =>
    jsonFetch<null>(`/questionnaire-records/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setCurrentVersion: (id: string, versionId: string) =>
    jsonFetch<QuestionnaireParent>(`/questionnaire-records/${encodeURIComponent(id)}/current-version`, {
      method: 'PATCH', body: JSON.stringify({ versionId }),
    }),
  audit: (id: string) =>
    jsonFetch<AuditLogEntry[]>(`/questionnaire-records/${encodeURIComponent(id)}/audit`),
};

export const questionnaireVersionsApi = {
  // Versions under a parent. committedOnly → exclude drafts (used by
  // the assessment-create version picker).
  list: (parentId: string, committedOnly?: boolean) => {
    const qs = committedOnly ? '?committedOnly=true' : '';
    return jsonFetch<QuestionnaireVersionSummary[]>(
      `/questionnaire-records/${encodeURIComponent(parentId)}/versions${qs}`,
    );
  },
  // Full content of one version — uses the existing PublishedQuestionnaire-shaped DTO.
  get: (parentId: string, versionId: string) =>
    jsonFetch<PublishedQuestionnaire>(
      `/questionnaire-records/${encodeURIComponent(parentId)}/versions/${encodeURIComponent(versionId)}`,
    ),
  // Create a draft. branchedFromVersionId optional.
  createDraft: (parentId: string, body: CreateDraftRequest) =>
    jsonFetch<QuestionnaireVersionSummary>(
      `/questionnaire-records/${encodeURIComponent(parentId)}/versions/drafts`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  // PATCH a DRAFT's content. COMMITTED versions are immutable; the
  // backend rejects with a 400.
  editDraft: (parentId: string, versionId: string, body: Partial<PublishedQuestionnaire>) =>
    jsonFetch<PublishedQuestionnaire>(
      `/questionnaire-records/${encodeURIComponent(parentId)}/versions/${encodeURIComponent(versionId)}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  // Promote a draft to COMMITTED with the chosen bump + metadata.
  commit: (parentId: string, versionId: string, body: CommitVersionRequest) =>
    jsonFetch<QuestionnaireVersionSummary>(
      `/questionnaire-records/${encodeURIComponent(parentId)}/versions/${encodeURIComponent(versionId)}/commit`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  discardDraft: (parentId: string, versionId: string) =>
    jsonFetch<null>(
      `/questionnaire-records/${encodeURIComponent(parentId)}/versions/${encodeURIComponent(versionId)}`,
      { method: 'DELETE' },
    ),
};

// --- Data grid (datasets) -------------------------------------------------
// Self-describing grid views. The backend declares its own columns, so dynamic
// score / demographic columns need no frontend changes. See docs/data-grid-spec.md.
export type DatasetColumn = {
  key: string;
  label: string;
  type: 'string' | 'number' | 'datetime' | 'enum';
  group: 'core' | 'scores' | 'demographics';
  editable: 'none' | 'field' | 'answer' | 'override';
  options?: string[];
};

export type DatasetRow = Record<string, unknown> & {
  rowId: string;
  _updatedAt?: string | null;
};

export type DatasetResponse = {
  view: string;
  columns: DatasetColumn[];
  rows: DatasetRow[];
  rowCount: number;
};

export type CellEdit = {
  rowId: string;
  columnKey: string;
  oldValue?: unknown;
  newValue: unknown;
  rowUpdatedAt?: string | null;
};

export type CellEditError = {
  rowId: string;
  columnKey: string | null;
  message: string;
  conflict: boolean;
  currentUpdatedAt?: string | null;
};

export type DatasetEditResponse = {
  applied: number;
  rows: DatasetRow[];
  errors: CellEditError[];
};

export const datasetsApi = {
  // Sessions/Results view: one row per assessment session.
  sessions: (params?: { entityId?: string; questionnaireId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.entityId) qs.set('entityId', params.entityId);
    if (params?.questionnaireId) qs.set('questionnaireId', params.questionnaireId);
    const s = qs.toString();
    return jsonFetch<DatasetResponse>(`/datasets/sessions${s ? `?${s}` : ''}`);
  },
  // Batch-apply audited cell edits to the sessions view.
  patchSessionCells: (edits: CellEdit[]) =>
    jsonFetch<DatasetEditResponse>('/datasets/sessions/cells', {
      method: 'PATCH',
      body: JSON.stringify(edits),
    }),
};

// --- Data Studio (workbooks / sheets / derived columns) -------------------
// Persisted spreadsheet definitions layered on top of the live dataset views.
// Data is never copied — a sheet re-pulls live rows via datasetsApi and
// computes derived columns (CLIENT in-browser, SERVER on the backend).
export type DsAccess = 'OWNER' | 'EDITOR' | 'VIEWER' | 'ADMIN' | 'NONE';

export type DerivedColumn = {
  id?: number;
  colKey: string;
  label: string;
  expr: string;
  evalTarget: 'CLIENT' | 'SERVER';
  resultType: 'number' | 'string' | 'boolean' | 'datetime';
  format?: string | null;
  sortOrder?: number | null;
};

export type Sheet = {
  id: number;
  workbookId: number;
  name: string;
  sourceView: string;
  sourceFilters: Record<string, unknown>;
  grain: string;
  displayState: Record<string, unknown>;
  sortOrder?: number | null;
  derivedColumns: DerivedColumn[];
  createdAt?: string;
  updatedAt?: string;
};

export type WorkbookShare = {
  id: number;
  sharedWithUserId: string;
  role: 'EDITOR' | 'VIEWER';
  grantedBy: string;
  createdAt?: string;
};

export type Workbook = {
  id: number;
  name: string;
  description?: string | null;
  ownerId: string;
  access: DsAccess;
  sheets: Sheet[];
  shares: WorkbookShare[];
  createdAt?: string;
  updatedAt?: string;
};

export type ValidateExprResult = {
  ok: boolean;
  evalTarget: 'CLIENT' | 'SERVER';
  resultType: 'number' | 'string' | 'boolean' | 'datetime';
  errors: string[];
  referencedColumns: string[];
  functions: string[];
};

export const dataStudioApi = {
  listWorkbooks: () => jsonFetch<Workbook[]>('/workbooks'),
  createWorkbook: (body: { name: string; description?: string }) =>
    jsonFetch<Workbook>('/workbooks', { method: 'POST', body: JSON.stringify(body) }),
  getWorkbook: (id: number) => jsonFetch<Workbook>(`/workbooks/${id}`),
  updateWorkbook: (id: number, body: { name?: string; description?: string }) =>
    jsonFetch<Workbook>(`/workbooks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteWorkbook: (id: number) => jsonFetch<null>(`/workbooks/${id}`, { method: 'DELETE' }),

  addShare: (id: number, body: { sharedWithUserId: string; role: 'EDITOR' | 'VIEWER' }) =>
    jsonFetch<WorkbookShare>(`/workbooks/${id}/shares`, { method: 'POST', body: JSON.stringify(body) }),
  removeShare: (id: number, userId: string) =>
    jsonFetch<null>(`/workbooks/${id}/shares/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  createSheet: (
    workbookId: number,
    body: { name: string; sourceView?: string; sourceFilters?: Record<string, unknown>; grain?: string },
  ) => jsonFetch<Sheet>(`/workbooks/${workbookId}/sheets`, { method: 'POST', body: JSON.stringify(body) }),
  getSheet: (id: number) => jsonFetch<Sheet>(`/sheets/${id}`),
  updateSheet: (
    id: number,
    body: { name?: string; sourceFilters?: Record<string, unknown>; displayState?: Record<string, unknown>; sortOrder?: number },
  ) => jsonFetch<Sheet>(`/sheets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSheet: (id: number) => jsonFetch<null>(`/sheets/${id}`, { method: 'DELETE' }),

  validateExpr: (sheetId: number, expr: string) =>
    jsonFetch<ValidateExprResult>(`/sheets/${sheetId}/validate-expr`, {
      method: 'POST',
      body: JSON.stringify({ expr }),
    }),
  addColumn: (
    sheetId: number,
    body: { label: string; expr: string; evalTarget?: string; format?: string },
  ) => jsonFetch<DerivedColumn>(`/sheets/${sheetId}/columns`, { method: 'POST', body: JSON.stringify(body) }),
  updateColumn: (
    sheetId: number,
    colKey: string,
    body: { label: string; expr: string; evalTarget?: string; format?: string },
  ) =>
    jsonFetch<DerivedColumn>(`/sheets/${sheetId}/columns/${encodeURIComponent(colKey)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteColumn: (sheetId: number, colKey: string) =>
    jsonFetch<null>(`/sheets/${sheetId}/columns/${encodeURIComponent(colKey)}`, { method: 'DELETE' }),
};
