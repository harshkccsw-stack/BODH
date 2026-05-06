// Single typed client for the Spring Boot backend. Every page goes through
// these functions — no localStorage fallback. If the API is down, pages
// surface the error to the caller so they can render a retry/empty state.

import { config } from './config';

export const API_BASE = config.apiBase;

// Pick the most appropriate stored token in priority order:
//   1. Practitioner (dashboard)
//   2. Admin       (dashboard)
//   3. Respondent  (portal)
// Returning null is fine — the call goes out unauthenticated and the
// API returns 401 if the route requires auth.
function getActiveToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    sessionStorage.getItem(config.practitionerAuthStorageKey) ||
    sessionStorage.getItem(config.adminAuthStorageKey) ||
    sessionStorage.getItem(config.authStorageKey) ||
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
  login: (id: string, dob: string) => jsonFetch<LoginResponse>('/respondents/login', { method: 'POST', body: JSON.stringify({ id, dob }) }),
  me: (token: string) => jsonFetch<Respondent>('/respondents/me', { headers: { Authorization: `Bearer ${token}` } }),
  logout: (token: string) => jsonFetch<null>('/respondents/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
};

// ---------- Practitioners ----------
export interface Practitioner {
  id: string;
  name: string;
  email: string;
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
export interface PractitionerLoginResponse {
  token: string;
  practitioner: PractitionerMe;
}
// ---------- Admin (single env-driven account) ----------
// Different shape from practitioners: username + password, no DOB. The
// backend issues a JWT carrying userType=ADMIN with full url_paths access.
export interface AdminInfo {
  username: string;
  role: string; // always "ADMIN"
}
export interface AdminLoginResponse {
  token: string;
  admin: AdminInfo;
}
export const adminApi = {
  login: (username: string, password: string) =>
    jsonFetch<AdminLoginResponse>('/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: (token: string) =>
    jsonFetch<AdminInfo>('/admin/me', { headers: { Authorization: `Bearer ${token}` } }),
  logout: (token: string) =>
    jsonFetch<null>('/admin/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
};

export const practitionersApi = {
  list: () => jsonFetch<Practitioner[]>('/practitioners'),
  get: (id: string) => jsonFetch<Practitioner>(`/practitioners/${encodeURIComponent(id)}`),
  create: (p: Practitioner) => jsonFetch<Practitioner>('/practitioners', { method: 'POST', body: JSON.stringify(p) }),
  update: (id: string, p: Partial<Practitioner>) => jsonFetch<Practitioner>(`/practitioners/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(p) }),
  delete: (id: string) => jsonFetch<null>(`/practitioners/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  login: (id: string, dob: string) =>
    jsonFetch<PractitionerLoginResponse>('/practitioners/login', { method: 'POST', body: JSON.stringify({ id, dob }) }),
  me: (token: string) =>
    jsonFetch<PractitionerMe>('/practitioners/me', { headers: { Authorization: `Bearer ${token}` } }),
  logout: (token: string) =>
    jsonFetch<null>('/practitioners/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
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
export interface MQT { id: string; name: string; }
export interface MQ {
  id: string;
  name: string;
  description?: string;
  mqts: MQT[];
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
  mqs: Array<{ id: string; name: string; mqts: Array<{ id: string; name: string }> }>;
  questions: Array<{
    id: string;
    stem: string;
    format: string;
    media_url: string;
    media_type: string;
    options: Array<{ text: string; scores: Array<{ mqt_id: string; score: number }>; media_url?: string; media_type?: string }>;
    clinical_risk_flag: boolean;
    risk_flag_rule: string;
  }>;
  isDemo?: boolean;
  disclaimer?: string;
  demographicFieldKeys?: string[];
  createdAt?: string;
}
export const questionnairesApi = {
  list: (vertical?: string) => {
    const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
    return jsonFetch<PublishedQuestionnaire[]>(`/questionnaires${qs}`);
  },
  get: (id: string) => jsonFetch<PublishedQuestionnaire>(`/questionnaires/${encodeURIComponent(id)}`),
  getByName: (name: string) => jsonFetch<PublishedQuestionnaire>(`/questionnaires/by-name?name=${encodeURIComponent(name)}`),
  upsert: (q: PublishedQuestionnaire) => jsonFetch<PublishedQuestionnaire>('/questionnaires', { method: 'POST', body: JSON.stringify(q) }),
  delete: (id: string) => jsonFetch<null>(`/questionnaires/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ---------- Instruments (backend-shape) ----------
export interface Instrument {
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
export async function getInstruments(vertical?: string): Promise<Instrument[]> {
  const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
  const list = await jsonFetch<Instrument[] | { data?: Instrument[] }>(`/questionnaires-catalog${qs}`);
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
  mqtScores?: Record<string, number>;
  groupId?: string;
  groupName?: string;
  consentId?: string;
  proctoring?: boolean;
  invitationSent?: boolean;
  createdAt?: string;
  completedAt?: string;
}
// Backwards-compatible alias so existing imports keep working.
export type PortalSession = Assessment;

export const assessmentsApi = {
  list: (respondentId?: string) => {
    const qs = respondentId ? `?respondentId=${encodeURIComponent(respondentId)}` : '';
    return jsonFetch<Assessment[]>(`/assessments${qs}`);
  },
  get: (id: string) => jsonFetch<Assessment>(`/assessments/${encodeURIComponent(id)}`),
  create: (s: Assessment) => jsonFetch<Assessment>('/assessments', { method: 'POST', body: JSON.stringify(s) }),
  bulk: (assessments: Assessment[]) => jsonFetch<{ created: number }>('/assessments/bulk', { method: 'POST', body: JSON.stringify({ assessments }) }),
  update: (id: string, s: Partial<Assessment>) => jsonFetch<Assessment>(`/assessments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(s) }),
  delete: (id: string) => jsonFetch<null>(`/assessments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
// Backwards-compatible alias.
export const portalSessionsApi = assessmentsApi;

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
