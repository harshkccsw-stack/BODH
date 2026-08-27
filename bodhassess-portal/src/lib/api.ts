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

// Failed request. `message` keeps the legacy "[API 401] ..." shape older
// catch sites regex against; new code should branch on `status` and show
// `serverMessage` (the backend's {"message": ...} body) to the user.
export class ApiError extends Error {
  readonly status: number;
  readonly serverMessage: string;

  constructor(status: number, path: string, serverMessage: string) {
    super(`[API ${status}] ${path}: ${serverMessage}`);
    this.status = status;
    this.serverMessage = serverMessage;
  }
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
    let serverMessage = text;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.message === 'string') serverMessage = parsed.message;
    } catch {
      /* non-JSON error body — keep the raw text */
    }
    throw new ApiError(res.status, path, serverMessage);
  }
  if (res.status === 204) return null as T;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null as T;
  return res.json();
}

// ---------- Portal auth (spring-social /api/portal) ----------
// One allotted assessment. Matches RespondentAssessmentResponse on the
// backend — one row per (respondent, assessment) pair, no re-attempts.
export interface AllottedAssessment {
  respondentAssessmentMappingId: number;
  respondentUserId: number;
  respondentName: string;
  respondentEmail: string;
  serialId: string;
  organizationId: number | null;
  organizationName: string | null;
  assessmentId: number;
  assessmentName: string;
  assessmentStatus: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
  /** True once the submitted answers are committed to MySQL. */
  isPersisted: boolean;
  /**
   * The submission is staged in Redis but not digested into MySQL yet —
   * status still reads ONGOING, but the assessment is finished for the
   * respondent. The dashboard shows "being processed" and offers no button.
   */
  submissionPending: boolean;
}
// The signed-in respondent + their allotted assessments. Matches
// PortalAuthResponse on the backend.
export interface PortalRespondent {
  userId: number;
  respondentUserId: number;
  serialId: string;
  email: string;
  /** Optional employer code — null unless an admin set one. Also a login identifier. */
  employeeId: string | null;
  name: string;
  isConsented: boolean;
  organizationId: number | null;
  organizationName: string | null;
  /**
   * The organization's co-branding logo — an inline base64 data URL, bindable
   * straight to an <img src>. Delivered with the session rather than with each
   * assessment because it belongs to the respondent's organization, not to any
   * one assessment. Null for an unaffiliated respondent or an organization
   * that uploaded none, and BrandHeader falls back to the portal's own mark.
   */
  organizationCoBrandLogoBase64: string | null;
  allottedAssessments: AllottedAssessment[];
}
// Matches PortalLoginResponse on the backend.
export interface PortalLoginResult {
  token: string;
  respondent: PortalRespondent;
}
export const portalAuthApi = {
  // dob is the password; the identifier is either the email or the
  // respondent's employee id (the backend splits on '@', which employee ids
  // can never contain). Only accounts holding a respondent profile get in
  // (403 otherwise).
  login: (identifier: string, dob: string) =>
    jsonFetch<PortalLoginResult>('/portal/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, dob }),
    }),
  // Session restore: bearer token in, respondent + allotted assessments out.
  me: () => jsonFetch<PortalRespondent>('/portal/me'),
};

// ---------- Portal assessment delivery (take-flow read side) ----------
// What a stem or option is made of. Matches ContentType on the backend.
export type PortalContentType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'URL';

// Matches PortalAssessmentDetailResponse.PortalOption on the backend.
export interface PortalOption {
  optionId: number;
  optionText: string | null;
  /**
   * The author's help text under this option's label — "about once a month".
   * Null when they set none, which is every option authored before the field
   * existed and most options after it.
   */
  description: string | null;
  contentType: PortalContentType;
  mediaUrl: string | null;
  sortOrder: number;
}
// How many options may be picked. Matches SelectionRule on the backend.
export type PortalSelectionRule = 'MIN' | 'MAX' | 'EQUALS';
// What shape the question is. Matches QuestionType on the backend — RENDERING
// only: a LINEAR_SCALE is an ordinary cap-1 question whose options are the
// points 1—5, so every gate still reads min/maxSelections.
export type PortalQuestionType = 'MCQ' | 'LINEAR_SCALE' | 'LIKERT_GRID' | 'SHORT_ANSWER' | 'PARAGRAPH';
// Matches PortalAssessmentDetailResponse.PortalQuestion on the backend.
export interface PortalQuestion {
  questionId: number;
  sectionId: number | null;
  sortOrder: number;
  contentType: PortalContentType;
  questionType: PortalQuestionType;
  stem: string | null;
  /**
   * The author's help text under the stem — "answer for the last two weeks".
   * Null when they set none.
   */
  description: string | null;
  mediaUrl: string | null;
  /** Null on single-choice questions — the rule the respondent is shown. */
  selectionRule: PortalSelectionRule | null;
  selectionCount: number | null;
  /**
   * The same rule already resolved to a floor and a cap by the server's
   * SelectionBounds. Gate on THESE, not on the rule: the portal and the
   * submit validator then cannot disagree about what a rule means. Single
   * choice is 1/1.
   */
  minSelections: number;
  maxSelections: number;
  /**
   * LINEAR_SCALE only — the ends of the slider. Render the TRACK from these,
   * not from options.length: a 0—100 scale is a slider, never a hundred
   * buttons. The value the respondent lands on maps back to the option whose
   * text is that number, which is what gets submitted.
   */
  scaleFrom: number | null;
  scaleTo: number | null;
  /** LINEAR_SCALE only — captions for the first and last point. */
  scaleLowLabel: string | null;
  scaleHighLabel: string | null;
  /**
   * LIKERT_GRID only — the statements rated against `options`, which are that
   * grid's shared columns. Empty on every other type, and min/maxSelections
   * apply PER ROW when it is not.
   */
  rows: PortalRow[];
  options: PortalOption[];
}
// Matches PortalAssessmentDetailResponse.PortalRow on the backend.
export interface PortalRow {
  questionRowId: number;
  rowText: string | null;
  sortOrder: number;
}
// Matches PortalAssessmentDetailResponse.PortalSection on the backend.
export interface PortalSection {
  sectionId: number;
  name: string;
  instruction: string | null;
}
// Matches PortalAssessmentDetailResponse.PortalDemographicField on the backend.
export interface PortalDemographicField {
  demographicFieldId: number;
  label: string;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN';
  placeholder: string | null;
  options: string[];
  required: boolean;
  sortOrder: number;
}
// Matches PortalAssessmentDetailResponse on the backend. Deliberately carries
// no scoring data — the server never sends it to respondents.
export interface PortalAssessmentDetail {
  respondentAssessmentMappingId: number;
  assessmentStatus: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
  isPersisted: boolean;
  assessmentId: number;
  assessmentName: string;
  showTermsAndConditions: boolean;
  /**
   * The consent body to render, as a small HTML subset the server restricts
   * to p/br/b/strong/i/em/u/ul/ol/li/h2/h3 with no attributes. Never null —
   * assessments without their own text get the server's default.
   */
  termsAndConditions: string;
  autoNext: boolean;
  showQuestionIndex: boolean;
  /**
   * Arms the attention timer: each inactivity popup carries its own
   * ATTENTION_BUDGET_MS countdown, and letting one run out abandons the
   * attempt (see question-runner.tsx). The deadline itself lives in the
   * portal — the backend only stores whether it applies.
   */
  attentionTimer: boolean;
  /**
   * Arms partial-answer saving: the runner snapshots all marked answers to
   * the progress endpoint on section change (and every few questions on a
   * sectionless paper), and a resumed ONGOING attempt arrives with
   * `savedAnswers` to backfill.
   */
  savePartialAnswers: boolean;
  questionnaireId: number;
  questionnaireName: string;
  description: string | null;
  durationMinutes: number | null;
  generalInstruction: string | null;
  hasSections: boolean;
  demographicFields: PortalDemographicField[];
  sections: PortalSection[];
  questions: PortalQuestion[];
  /**
   * The attempt's Redis partial-answer snapshot, in submit-entry shape —
   * null when there is none (fresh attempt, toggle off, or Redis away), in
   * which case the runner starts from question 1 exactly as before.
   */
  savedAnswers: PortalAnswerEntry[] | null;
}
// Matches PortalBeginRequest.DemographicEntry on the backend.
export interface PortalDemographicEntry {
  demographicFieldId: number;
  value: string;
}
// Matches PortalSubmitRequest.AnswerEntry on the backend.
export interface PortalAnswerEntry {
  questionId: number;
  /** Null on a SHORT_ANSWER, which is answered by answerText instead. */
  optionId: number | null;
  /** SHORT_ANSWER only — the mirror image of optionId. */
  answerText?: string;
  /**
   * Which grid ROW this rating answers. Null on every other question type —
   * the submit validator refuses a grid answer without one, and a row on a
   * question that has none.
   */
  questionRowId: number | null;
}

/**
 * How the take flow keys its answers: one entry per ANSWERABLE SLOT, which is
 * the question itself, or one row of a grid. `${questionId}` or
 * `${questionId}:${rowId}` — one shape, so every gate in the runner and the
 * payload builder read the same map.
 */
export const answerKey = (questionId: number, questionRowId?: number | null): string =>
  questionRowId == null ? String(questionId) : `${questionId}:${questionRowId}`;

/** Splits an answerKey back into the ids the submit payload needs. */
export const parseAnswerKey = (key: string): { questionId: number; questionRowId: number | null } => {
  const [questionId, questionRowId] = key.split(':');
  return {
    questionId: Number(questionId),
    questionRowId: questionRowId === undefined ? null : Number(questionRowId),
  };
};
// Matches PortalAttemptStatusResponse on the backend. isPersisted is the
// durability fact check — true once the answers reached MySQL.
export interface PortalAttemptStatus {
  respondentAssessmentMappingId: number;
  assessmentStatus: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
  isPersisted: boolean;
  /**
   * True when the submission was staged in Redis and MySQL will catch up via
   * the digest — the 200 is still a completed submission as far as the
   * respondent is concerned.
   */
  submissionPending: boolean;
}
export const portalAssessmentsApi = {
  // The id is the allotment (respondentAssessmentMappingId), not the Assessment.
  get: (mappingId: number | string) =>
    jsonFetch<PortalAssessmentDetail>(`/portal/assessments/getById/${encodeURIComponent(mappingId)}`),
  // Starts the attempt: stores the demographic form (replace-all), records
  // consent, flips NOT_STARTED → ONGOING. Idempotent while un-completed.
  begin: (mappingId: number | string, demographics: PortalDemographicEntry[]) =>
    jsonFetch<PortalAttemptStatus>(`/portal/assessments/begin/${encodeURIComponent(mappingId)}`, {
      method: 'POST',
      body: JSON.stringify({ demographics }),
    }),
  // Stops an in-flight attempt and hands it back unstarted (→ NOT_STARTED),
  // so the list offers "Launch Assessment" again instead of "Resume". What
  // the attention timer calls when its budget runs out; nothing is deleted,
  // because answers are only written at submit. 409 once COMPLETED.
  abandon: (mappingId: number | string) =>
    jsonFetch<PortalAttemptStatus>(`/portal/assessments/abandon/${encodeURIComponent(mappingId)}`, {
      method: 'POST',
    }),
  // Live-position ping for the admin tracking page: every ~10s and on every
  // question change while on the questions screen. Redis-only server side and
  // fire-and-forget here — a dropped ping just reads as a moment of silence.
  heartbeat: (
    mappingId: number | string,
    beat: { currentQuestion: number; answeredCount: number; totalQuestions: number },
  ) =>
    jsonFetch<null>(`/portal/assessments/heartbeat/${encodeURIComponent(mappingId)}`, {
      method: 'POST',
      body: JSON.stringify(beat),
    }),
  // Partial-answer snapshot: the FULL set of answers marked so far, replacing
  // the previous snapshot in Redis. Fire-and-forget from the runner — a
  // failure (or saved=false) costs a future backfill, never data.
  saveProgress: (mappingId: number | string, answers: PortalAnswerEntry[]) =>
    jsonFetch<{ saved: boolean; answerCount: number }>(
      `/portal/assessments/progress/${encodeURIComponent(mappingId)}`,
      { method: 'PUT', body: JSON.stringify({ answers }) },
    ),
  // The once-and-for-all submission: every answer at once. Redis-staged (the
  // digest lands it in MySQL moments later — submissionPending=true) or, with
  // Redis away, written synchronously as before (→ COMPLETED immediately).
  // popUpCount is the attempt-level inactivity-popup tally (defaults to 0).
  submit: (mappingId: number | string, answers: PortalAnswerEntry[], popUpCount = 0) =>
    jsonFetch<PortalAttemptStatus>(`/portal/assessments/submit/${encodeURIComponent(mappingId)}`, {
      method: 'POST',
      body: JSON.stringify({ answers, popUpCount }),
    }),
};

// ---------- Self-registration links (public /register/{token}) ----------
// Which of the token row's two targets was set. ASSESSMENT fixes the
// assessment; ORGANIZATION lets the respondent pick from the org's catalog.
export type RegistrationTokenScope = 'ORGANIZATION' | 'ASSESSMENT';

// Matches RegistrationTokenDetailResponse on the backend. The assessment
// fields are set on an ASSESSMENT link (show it chosen and locked) and null on
// an ORGANIZATION link, which grants no assessment at all — the respondent is
// only joining the organization, and an administrator assigns afterwards.
export interface RegistrationTokenDetail {
  token: string;
  scope: RegistrationTokenScope;
  organizationId: number;
  organizationName: string;
  /** Inline base64 data URL, bindable straight to an <img src>. Null if unset. */
  organizationLogoBase64: string | null;
  assessmentId: number | null;
  assessmentName: string | null;
}
/**
 * Matches the Gender enum on the backend. PREFER_NOT_TO_SAY is a real stored
 * answer, not an absent one — the field is required, and this is the way to
 * decline it.
 */
export type RegistrationGender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

// Matches RegistrationSubmitRequest on the backend. No organizationId — the
// token decides that, and a body must not be able to pick one.
export interface RegistrationSubmitPayload {
  name: string;
  email: string;
  /** ISO yyyy-MM-dd, same as the login endpoint. Also the sign-in password. */
  dob: string;
  /** Required — the backend rejects a blank or malformed one. */
  phone: string;
  /** Required — PREFER_NOT_TO_SAY is how someone declines. */
  gender: RegistrationGender;
  employeeId?: string;
  // No assessmentId: the link decides. An ASSESSMENT link fixes the
  // assessment, an ORGANIZATION link grants none.
}

// Matches PortalRegistrationResponse on the backend — /portal/login's
// {token, respondent} plus where to go next.
export interface RegistrationResult extends PortalLoginResult {
  /**
   * The allotment to open on an ASSESSMENT link, so the portal can go
   * straight into it. Null on an ORGANIZATION link — nothing was granted, so
   * the respondent lands on the dashboard.
   */
  respondentAssessmentMappingId: number | null;
}
export const registrationTokensApi = {
  // Public — the token in the path is the credential. 404 covers unknown,
  // revoked, expired and used-up alike (deliberately indistinguishable); 409
  // means the link is real but its assessments are not open right now.
  getByToken: (token: string) =>
    jsonFetch<RegistrationTokenDetail>(
      `/registration-tokens/getByToken/${encodeURIComponent(token)}`,
    ),
  // Registers AND signs in: the reply carries the same {token, respondent}
  // pair as /portal/login, so the caller stores the bearer and is
  // authenticated. 409 means an account already exists (or a race lost);
  // 403 a disabled account.
  register: (token: string, body: RegistrationSubmitPayload) =>
    jsonFetch<RegistrationResult>(`/portal/register/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ---------- Auth (LEGACY unified login — old v2 backend only) ----------
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
  // Old unified identity login — still referenced by the registration flow,
  // which has not been rewired to spring-social yet.
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
  // Optional grouping — present when the questionnaire was authored with
  // sections. Drives the section-wise breakdown in the question index panel.
  sectionId?: string;
  sectionTitle?: string;
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
  // When true, selecting an option auto-advances to the next question.
  autoNext?: boolean;
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
