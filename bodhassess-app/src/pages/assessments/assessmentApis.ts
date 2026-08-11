import { api } from '@/lib/apiClient';

export type AssessmentStatus = 'ACTIVE' | 'INACTIVE';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Matches AssessmentRequest on the backend. */
export interface AssessmentPayload {
  name: string;
  questionnaireId: number;
  showTermsAndConditions: boolean;
  status: AssessmentStatus;
  autoNext: boolean;
  /** Show the portal question index/navigator during the attempt. */
  showQuestionIndex: boolean;
}

/** Matches AssessmentResponse on the backend. */
export interface AssessmentResponse {
  assessmentId: number;
  name: string;
  questionnaireId: number;
  questionnaireName: string;
  showTermsAndConditions: boolean;
  status: AssessmentStatus;
  autoNext: boolean;
  showQuestionIndex: boolean;
  respondentCount: number;
}

function getAllAssessments() {
  return api.get<AssessmentResponse[]>(`/assessments/getAll`);
}

function getAssessmentById(id: number) {
  return api.get<AssessmentResponse>(`/assessments/getById/${id}`);
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
  createAssessment,
  updateAssessment,
  deleteAssessment,
};
