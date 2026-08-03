import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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
  return axios.get<AssessmentResponse[]>(`${API_URL}/assessments/getAll`);
}

function getAssessmentById(id: number) {
  return axios.get<AssessmentResponse>(`${API_URL}/assessments/getById/${id}`);
}

function createAssessment(assessment: AssessmentPayload) {
  return axios.post<AssessmentResponse>(`${API_URL}/assessments/create`, assessment);
}

function updateAssessment(id: number, assessment: AssessmentPayload) {
  return axios.put<AssessmentResponse>(`${API_URL}/assessments/update/${id}`, assessment);
}

/** 409 when the assessment has respondent attempts — deactivate instead. */
function deleteAssessment(id: number) {
  return axios.delete<void>(`${API_URL}/assessments/delete/${id}`);
}

export const assessmentsApi = {
  getAllAssessments,
  getAssessmentById,
  createAssessment,
  updateAssessment,
  deleteAssessment,
};
