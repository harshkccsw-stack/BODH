import { api } from '@/lib/apiClient';

// The Dashboard home page's reads, against spring-social's real endpoints.
// It used to go through lib/api.ts — the OLD v2 client — whose /respondents,
// /practitioners, /questionnaires-catalog, /assessments/summaries and /health
// do not exist here: five 404s in the activity log on every visit, and empty
// cards (2026-10-05). Only the fields the page renders are typed.

/** Backend Vertical enum — practitioner and questionnaire both carry one. */
export type Vertical =
  | 'CLINICAL' | 'INDUSTRIAL' | 'COUNSELLING' | 'EXPERIMENTS' | 'WHITELABEL' | 'RESEARCH' | 'OTHER';

/** Slim view of RespondentResponse on the backend. */
export interface DashboardRespondent {
  respondentUserId: number;
}

/** Slim view of PractitionerResponse on the backend. */
export interface DashboardPractitioner {
  practitionerUserId: number;
  vertical: Vertical | null;
}

/** Slim view of QuestionnaireResponse on the backend. */
export interface DashboardQuestionnaire {
  questionnaireId: number;
  vertical: Vertical | null;
}

/** Slim view of AssessmentResponse on the backend. */
export interface DashboardAssessment {
  assessmentId: number;
  questionnaireId: number;
}

/** Slim view of RespondentAssessmentResponse on the backend — one allotment. */
export interface DashboardAllotment {
  respondentAssessmentMappingId: number;
  assessmentId: number;
  assessmentName: string;
  assessmentStatus: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
}

function getRespondents() {
  return api.get<DashboardRespondent[]>('/respondents/getAll');
}

function getPractitioners() {
  return api.get<DashboardPractitioner[]>('/practitioners/getAll');
}

function getQuestionnaires() {
  return api.get<DashboardQuestionnaire[]>('/questionnaire/getAll');
}

function getAssessments() {
  return api.get<DashboardAssessment[]>('/assessments/getAll');
}

function getAllotments() {
  return api.get<DashboardAllotment[]>('/respondent-assessments/getAll');
}

export const dashboardApis = {
  getRespondents,
  getPractitioners,
  getQuestionnaires,
  getAssessments,
  getAllotments,
};
