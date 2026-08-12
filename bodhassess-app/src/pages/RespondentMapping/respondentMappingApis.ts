import { api } from '@/lib/apiClient';

export type AssessmentStatus = 'ACTIVE' | 'INACTIVE';
export type RespondentAssessmentStatus = 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/** Slim view of RespondentResponse — only what this page renders. */
export interface RespondentRef {
  respondentUserId: number;
  serialId: string | null;
  name: string;
  email: string;
  organizationId: number | null;
  organizationName: string | null;
}

/** Slim view of AssessmentResponse — only what the picker renders. */
export interface AssessmentRef {
  assessmentId: number;
  name: string;
  questionnaireName: string;
  status: AssessmentStatus;
}

/** Slim view of OrganizationResponse — feeds the audience dropdown. */
export interface OrganizationRef {
  organizationId: number;
  name: string;
  memberCount: number;
  assessmentCount: number;
}

/** Matches RespondentAssessmentResponse on the backend (one allotment row). */
export interface RespondentAssessmentResponse {
  respondentAssessmentMappingId: number;
  respondentUserId: number;
  respondentName: string;
  respondentEmail: string;
  serialId: string | null;
  organizationId: number | null;
  organizationName: string | null;
  assessmentId: number;
  assessmentName: string;
  assessmentStatus: RespondentAssessmentStatus;
  /** True once the submitted answers are committed to MySQL. */
  isPersisted: boolean;
}

/**
 * Matches RespondentAssessmentAssignRequest on the backend. All-or-nothing.
 * Respondents WITH an org may only receive that org's mapped assessments;
 * respondents WITHOUT one (this page's audience) are assigned directly.
 * One assignment per (respondent, assessment) pair — a repeat is a 409.
 */
export interface AssignAssessmentPayload {
  assessmentId: number;
  respondentUserIds: number[];
}

//respondents (filter organizationId == null client-side for this page)
function getAllRespondents() {
  return api.get<RespondentRef[]>(`/respondents/getAll`);
}

//assessment catalog for the picker
function getAllAssessments() {
  return api.get<AssessmentRef[]>(`/assessments/getAll`);
}

//audience dropdown + per-org mapped catalog (segregation)
function getAllOrganizations() {
  return api.get<OrganizationRef[]>(`/organizations/getAll`);
}

/** Only these are assignable to the org's members. */
function getOrganizationAssessments(organizationId: number) {
  return api.get<AssessmentRef[]>(`/organizations/getAssessments/${organizationId}`);
}

//assignments (allotment rows)
function getAllAssignments() {
  return api.get<RespondentAssessmentResponse[]>(`/respondent-assessments/getAll`);
}

function getAssignmentsByRespondentId(respondentUserId: number) {
  return api.get<RespondentAssessmentResponse[]>(`/respondent-assessments/getByRespondentId/${respondentUserId}`);
}

/** All-or-nothing: 400 unknown ids, 409 dup/inactive/org-rule violations. */
function assignAssessment(payload: AssignAssessmentPayload) {
  return api.post<RespondentAssessmentResponse[]>(`/respondent-assessments/assign`, payload);
}

/** NOT_STARTED and ONGOING allotments may be removed — COMPLETED is frozen (409). */
function deleteAssignment(id: number) {
  return api.delete<void>(`/respondent-assessments/delete/${id}`);
}

export const assessmentMappingApis = {
  getAllRespondents,
  getAllAssessments,
  getAllOrganizations,
  getOrganizationAssessments,
  getAllAssignments,
  getAssignmentsByRespondentId,
  assignAssessment,
  deleteAssignment,
};
