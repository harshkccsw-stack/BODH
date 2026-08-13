import { api } from '@/lib/apiClient';

export type AssessmentStatus = 'ACTIVE' | 'INACTIVE';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches AssessmentRequest on the backend. */
export interface AssessmentPayload {
  name: string;
  questionnaireId: number;
  showTermsAndConditions: boolean;
  /**
   * Consent body as HTML, limited to the tags the editor emits (p, br, b,
   * strong, i, em, u, ul, ol, li, h2, h3 — no attributes). The API rejects
   * anything else with a 400, and rejects an empty body while
   * showTermsAndConditions is on.
   */
  termsAndConditions: string;
  status: AssessmentStatus;
  autoNext: boolean;
  /** Show the portal question index/navigator during the attempt. */
  showQuestionIndex: boolean;
  /**
   * Availability window as 'YYYY-MM-DD' (what <input type="date"> emits and
   * what the backend parses into LocalDate). null = not set; send null to
   * clear a saved date. Metadata only — nothing gates on it, only status.
   */
  startDate: string | null;
  endDate: string | null;
}

/** Matches AssessmentResponse on the backend. */
export interface AssessmentResponse {
  assessmentId: number;
  name: string;
  questionnaireId: number;
  questionnaireName: string;
  showTermsAndConditions: boolean;
  /** Never null — the default body for assessments that never set one. */
  termsAndConditions: string;
  status: AssessmentStatus;
  autoNext: boolean;
  showQuestionIndex: boolean;
  startDate: string | null;
  endDate: string | null;
  respondentCount: number;
}

function getAllAssessments() {
  return api.get<AssessmentResponse[]>(`/assessments/getAll`);
}

function getAssessmentById(id: number) {
  return api.get<AssessmentResponse>(`/assessments/getById/${id}`);
}

/**
 * The consent text a new assessment starts with. Fetched rather than kept as
 * a constant here so the wording lives in exactly one place — the portal
 * falls back to the same server-side default.
 */
function getTermsTemplate() {
  return api.get<{ termsAndConditions: string }>(`/assessments/terms-template`);
}

function createAssessment(assessment: AssessmentPayload) {
  return api.post<AssessmentResponse>(`/assessments/create`, assessment);
}

function updateAssessment(id: number, assessment: AssessmentPayload) {
  return api.put<AssessmentResponse>(`/assessments/update/${id}`, assessment);
}

/** 409 when the assessment has respondent attempts — deactivate instead. */
function deleteAssessment(id: number) {
  return api.delete<void>(`/assessments/delete/${id}`);
}

export const assessmentsApi = {
  getAllAssessments,
  getAssessmentById,
  getTermsTemplate,
  createAssessment,
  updateAssessment,
  deleteAssessment,
};
