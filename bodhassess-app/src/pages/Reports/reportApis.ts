import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export type AssessmentStatus = 'ACTIVE' | 'INACTIVE';

/** Matches ReportPageResponse<T> on the backend. */
export interface ReportPage<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

/** Matches ReportOrganizationOption on the backend. */
export interface OrganizationOption {
  organizationId: number;
  name: string;
}

/** Matches ReportAssessmentOption on the backend. */
export interface AssessmentOption {
  assessmentId: number;
  name: string;
  status: AssessmentStatus;
}

/**
 * Matches ReportRespondentRow on the backend. The tallies follow the
 * assessment filter: scoped to it when one is selected, across every
 * assessment the respondent holds otherwise. One assignment per
 * (respondent, assessment) pair, so these count assessments, not attempts.
 */
export interface RespondentRow {
  respondentUserId: number;
  serialId: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  organizationId: number | null;
  organizationName: string | null;
  assignedAssessments: number;
  completedAssessments: number;
}

export type AttemptStatus = 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';

/**
 * Matches ReportRespondentAssessmentRow on the backend — one assessment a
 * respondent holds, with how far the attempt got. answeredQuestions and
 * demographicResponses are what a reset wipes.
 */
export interface RespondentAssessmentRow {
  respondentAssessmentMappingId: number;
  assessmentId: number;
  assessmentName: string;
  assessmentStatus: AssessmentStatus;
  questionnaireId: number;
  questionnaireName: string;
  attemptStatus: AttemptStatus;
  isPersisted: boolean;
  answeredQuestions: number;
  totalQuestions: number;
  demographicResponses: number;
}

/** Matches ReportRespondentDetail on the backend — the info popup's payload. */
export interface RespondentDetail {
  respondentUserId: number;
  serialId: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  gender: string | null;
  consented: boolean;
  consentedAt: string | null;
  organizationId: number | null;
  organizationName: string | null;
  assessments: RespondentAssessmentRow[];
}

export interface PagedQuery {
  search?: string;
  page?: number;
  size?: number;
}

export interface RespondentQuery extends PagedQuery {
  /** undefined = all organizations */
  organizationId?: number;
  /** undefined = all assessments */
  assessmentId?: number;
}

// Dropdown data — paged + searchable by name (axios drops undefined params).
function getOrganizations(query: PagedQuery) {
  return axios.get<ReportPage<OrganizationOption>>(`${API_URL}/reports/getOrganizations`, { params: query });
}

function getAssessments(query: PagedQuery) {
  return axios.get<ReportPage<AssessmentOption>>(`${API_URL}/reports/getAssessments`, { params: query });
}

// The listing itself — org/assessment filters + name/email search, paged.
function getRespondents(query: RespondentQuery) {
  return axios.get<ReportPage<RespondentRow>>(`${API_URL}/reports/getRespondents`, { params: query });
}

// The info popup: profile + every assessment allotted to one respondent.
function getRespondentDetail(respondentUserId: number) {
  return axios.get<RespondentDetail>(`${API_URL}/reports/getRespondentDetail/${respondentUserId}`);
}

/**
 * Wipes the respondent's answers and demographic responses for that one
 * assessment and drops the allotment back to NOT_STARTED, so they take it
 * again from scratch. Destructive — confirm before calling.
 */
function resetAssessment(respondentAssessmentMappingId: number) {
  return axios.post<RespondentAssessmentRow>(
    `${API_URL}/reports/resetAssessment/${respondentAssessmentMappingId}`,
  );
}

export const reportApis = {
  getOrganizations,
  getAssessments,
  getRespondents,
  getRespondentDetail,
  resetAssessment,
};
