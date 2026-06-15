// Slim, self-contained client for the shared Spring backend. Only the
// endpoints the respondent take-flow + registration actually use are here
// (a small subset of the admin app's lib/api.ts). The backend is unchanged.

import { config } from '@/config';

export const API_BASE = config.apiBase;

// The portal only ever holds a respondent token, under one key. Returning
// null is fine — the request goes out unauthenticated and the API answers
// 401 if the route needs auth.
function getActiveToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(config.authStorageKey);
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) || {}),
  };
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

// ---------- Auth (unified login) ----------
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
  // Unified identity login (email + dob). Returns a respondent JWT that works
  // across every endpoint the portal calls.
  login: (email: string, dob: string) =>
    jsonFetch<AuthLoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, dob }) }),
};

// ---------- Respondents ----------
export interface Respondent {
  id: string;
  name: string;
  email: string;
  phone?: string;
  dob?: string;
  consent?: 'Granted' | 'Withdrawn' | 'Pending' | string;
  accountType?: 'individual' | 'organization' | string;
  orgName?: string;
  orgWebsite?: string;
  companyId?: string;
}
export interface LoginResponse {
  token: string;
  respondent: Respondent;
}
export const respondentsApi = {
  // Token auto-attached from localStorage.
  me: () => jsonFetch<Respondent>('/respondents/me'),
  logout: () => jsonFetch<null>('/respondents/logout', { method: 'POST' }),
  // Public self-signup.
  create: (r: Respondent) => jsonFetch<Respondent>('/respondents', { method: 'POST', body: JSON.stringify(r) }),
  // Legacy respondent login (used by self-signup auto-sign-in).
  login: (identifier: string, dob: string) =>
    jsonFetch<LoginResponse>('/respondents/login', { method: 'POST', body: JSON.stringify({ identifier, dob }) }),
};

// ---------- Demographic fields (pre-assessment catalogue) ----------
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
  list: (activeOnly = false) =>
    jsonFetch<DemographicField[]>(`/demographic-fields${activeOnly ? '?active=true' : ''}`),
};

// ---------- Measured Qualities (MQ tree) + scoring shapes ----------
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
export interface MQTScore {
  name: string;
  score: number;
}

// ---------- Questionnaire content (PublishedQuestionnaire-shaped DTO) ----------
export interface QOptionScore {
  mqt_id: string;
  score: number;
}
export interface QOption {
  text: string;
  scores: QOptionScore[];
  media_url?: string;
  media_type?: string;
}
export interface Question {
  id: string;
  stem: string;
  format: string;
  media_url: string;
  media_type: string;
  options: QOption[];
  // Added to the total on any non-empty answer, regardless of option chosen.
  question_scores?: QOptionScore[];
}
export interface Questionnaire {
  id: string;
  name: string;
  shortName?: string;
  vertical?: string;
  category?: string;
  description?: string;
  duration?: number;
  languages?: string[];
  mqs: MQ[];
  questions: Question[];
  isDemo?: boolean;
  disclaimer?: string;
  instructions?: string;
  showInstructions?: boolean;
  demographicFieldKeys?: string[];
  createdAt?: string;
}
export const questionnairesApi = {
  get: (id: string) => jsonFetch<Questionnaire>(`/questionnaires/${encodeURIComponent(id)}`),
  getByName: (name: string) =>
    jsonFetch<Questionnaire>(`/questionnaires/by-name?name=${encodeURIComponent(name)}`),
};

// ---------- Assessment sessions (per-respondent instances) ----------
export interface Assessment {
  id: string;
  assessmentId?: string;
  name?: string;
  respondentId: string;
  respondent: string;
  respondentEmail?: string;
  instrument: string;
  instrumentFullName?: string;
  // Pinned questionnaire version — resolve content by this id when present.
  questionnaireVersionId?: string;
  vertical?: string;
  language?: string;
  status: string;
  score?: string;
  answers?: Record<string, number | string>;
  mqtScores?: Record<string, MQTScore | number>;
  groupId?: string;
  groupName?: string;
  entityId?: string;
  entityName?: string;
  // When true, the take flow shows a numbered question side-panel.
  showQuestionIndex?: boolean;
  createdAt?: string;
  completedAt?: string;
  startedAt?: string;
  demographics?: Record<string, unknown>;
}
// Name kept for parity with the admin app's call sites.
export type PortalSession = Assessment;

export const assessmentsApi = {
  list: (respondentId?: string) => {
    const qs = respondentId ? `?respondentId=${encodeURIComponent(respondentId)}` : '';
    return jsonFetch<Assessment[]>(`/assessments${qs}`);
  },
  get: (id: string) => jsonFetch<Assessment>(`/assessments/${encodeURIComponent(id)}`),
  update: (id: string, s: Partial<Assessment>) =>
    jsonFetch<Assessment>(`/assessments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(s) }),
  heartbeat: (id: string, body: { currentIndex: number; totalQuestions: number }) =>
    jsonFetch<void>(`/assessments/${encodeURIComponent(id)}/heartbeat`, { method: 'POST', body: JSON.stringify(body) }),
};
export const portalSessionsApi = assessmentsApi;

// ---------- Public registration tokens (admin invite links) ----------
export interface AssessmentToken {
  token: string;
  assessmentId: string;
  assessmentName?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  groupId?: string | null;
  groupName?: string | null;
  respondentId?: string | null;
  email?: string | null;
  maxUses?: number | null;
  usedCount?: number;
  expiresAt?: string | null;
  createdAt?: string;
  createdBy?: string;
  // "register" → show the form; "login" → known account, confirm DOB.
  kind?: 'register' | 'login';
  loginEmail?: string | null;
  sessionId?: string | null;
}
export interface PublicRegistrationRequest {
  name: string;
  email: string;
  phone?: string;
  dob: string; // ISO yyyy-MM-dd
  companyId?: string;
}
export interface PublicRegistrationResult {
  sessionId: string;
  respondentId: string;
  assessmentId: string;
  // RESPONDENT token minted by the server so the take flow opens signed-in.
  token: string;
}
export interface RegistrationCheckRequest {
  email?: string;
  phone?: string;
  companyId?: string;
  dob: string; // ISO yyyy-MM-dd
}
export const publicTokensApi = {
  resolve: (token: string) => jsonFetch<AssessmentToken>(`/public/tokens/${encodeURIComponent(token)}`),
  // One-shot: creates/reuses respondent, links to entity, creates session,
  // consumes token, returns a respondent token.
  register: (token: string, body: PublicRegistrationRequest) =>
    jsonFetch<PublicRegistrationResult>(`/public/tokens/${encodeURIComponent(token)}/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // Existing-account path: verify email+dob, link into entity/group, ensure
  // session, sign in.
  loginExisting: (token: string, body: { email: string; dob: string }) =>
    jsonFetch<PublicRegistrationResult>(`/public/tokens/${encodeURIComponent(token)}/login`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // { exists } so the form can prompt login instead of re-registering.
  registrationCheck: (body: RegistrationCheckRequest) =>
    jsonFetch<{ exists: boolean }>(`/public/tokens/registration-check`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
