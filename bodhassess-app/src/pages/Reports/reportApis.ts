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
 * Matches ReportRespondentRow on the backend. The attempt tallies follow the
 * assessment filter: scoped to it when one is selected, across all
 * assessments otherwise.
 */
export interface RespondentRow {
  respondentUserId: number;
  serialId: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  organizationId: number | null;
  organizationName: string | null;
  totalAttempts: number;
  completedAttempts: number;
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

export const reportApis = {
  getOrganizations,
  getAssessments,
  getRespondents,
};
