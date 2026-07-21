import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/**
 * Matches OrganizationRequest on the backend. Membership is NOT set here —
 * staff (practitioners) and members (respondents) attach through the
 * organization picker on their own pages.
 */
export interface OrganizationPayload {
  name: string;
  orgEmail: string | null;
  description: string | null;
  /** Initial catalog — only read on CREATE; null on edit (catalog is managed via the map modal). */
  assessmentIds: number[] | null;
}

/** Matches OrganizationResponse on the backend (list shape with counts). */
export interface OrganizationResponse {
  organizationId: number;
  name: string;
  orgEmail: string | null;
  description: string | null;
  /** Practitioners in the org — the authority side. */
  staffCount: number;
  /** Respondents in the org — the assessed side. */
  memberCount: number;
  /** Assessments mapped into the org's catalog. */
  assessmentCount: number;
}

/** Matches OrganizationDetailResponse.StaffRef on the backend. */
export interface OrgStaffRef {
  practitionerUserId: number;
  serialId: string | null;
  name: string;
  email: string;
  practitionerStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

/** Matches OrganizationDetailResponse.MemberRef on the backend. */
export interface OrgMemberRef {
  respondentUserId: number;
  serialId: string | null;
  name: string;
  email: string;
  isConsented: boolean;
}

/** Matches OrganizationDetailResponse on the backend (drill-in shape). */
export interface OrganizationDetailResponse {
  organizationId: number;
  name: string;
  orgEmail: string | null;
  description: string | null;
  staff: OrgStaffRef[];
  members: OrgMemberRef[];
}

/** Matches UnassignedPeopleResponse on the backend (assign-picker lists). */
export interface UnassignedPeopleResponse {
  practitioners: OrgStaffRef[];
  respondents: OrgMemberRef[];
}

/** Matches OrganizationAssignRequest on the backend. All-or-nothing. */
export interface OrganizationAssignPayload {
  practitionerIds: number[];
  respondentIds: number[];
}

export type AssessmentStatus = 'ACTIVE' | 'INACTIVE';

/** Matches OrganizationAssessmentResponse on the backend (catalog entry). */
export interface OrgAssessmentRef {
  assessmentId: number;
  name: string;
  questionnaireId: number;
  questionnaireName: string;
  status: AssessmentStatus;
  /** Attempt rows held by THIS org's members. */
  assignedMemberCount: number;
}

/** Slim view of /api/assessments/getAll for the mapping pickers. */
export interface AssessmentRef {
  assessmentId: number;
  name: string;
  questionnaireName: string;
  status: AssessmentStatus;
}

//organization apis
function getAllOrganizations() {
  return axios.get<OrganizationResponse[]>(`${API_URL}/organizations/getAll`);
}

/** Drill-in: the org plus its full staff and member lists. */
function getOrganizationById(id: number) {
  return axios.get<OrganizationDetailResponse>(`${API_URL}/organizations/getById/${id}`);
}

function createOrganization(organization: OrganizationPayload) {
  return axios.post<OrganizationResponse>(`${API_URL}/organizations/create`, organization);
}

function updateOrganization(id: number, organization: OrganizationPayload) {
  return axios.put<OrganizationResponse>(`${API_URL}/organizations/update/${id}`, organization);
}

/** 409 while the org still has staff or members. */
function deleteOrganization(id: number) {
  return axios.delete<void>(`${API_URL}/organizations/delete/${id}`);
}

//assign picker + bulk assign
function getUnassignedPeople() {
  return axios.get<UnassignedPeopleResponse>(`${API_URL}/organizations/getUnassigned`);
}

/** All-or-nothing: 400 on unknown ids, 409 if someone got an org meanwhile. */
function assignPeople(id: number, payload: OrganizationAssignPayload) {
  return axios.put<OrganizationDetailResponse>(`${API_URL}/organizations/assign/${id}`, payload);
}

/** Mirror of assign — 409 if someone in the batch is not in this org. */
function unassignPeople(id: number, payload: OrganizationAssignPayload) {
  return axios.put<OrganizationDetailResponse>(`${API_URL}/organizations/unassign/${id}`, payload);
}

//assessment catalog (data segregation)
function getOrganizationAssessments(id: number) {
  return axios.get<OrgAssessmentRef[]>(`${API_URL}/organizations/getAssessments/${id}`);
}

/** All-or-nothing: already-mapped → 409, unknown id → 400. */
function assignAssessments(id: number, assessmentIds: number[]) {
  return axios.put<OrgAssessmentRef[]>(`${API_URL}/organizations/assign-assessments/${id}`, { assessmentIds });
}

/** 409 while org members hold attempt rows for that assessment. */
function unassignAssessments(id: number, assessmentIds: number[]) {
  return axios.put<OrgAssessmentRef[]>(`${API_URL}/organizations/unassign-assessments/${id}`, { assessmentIds });
}

/** The full assessment catalog — feeds the mapping pickers. */
function getAllAssessments() {
  return axios.get<AssessmentRef[]>(`${API_URL}/assessments/getAll`);
}

//assigning a mapped assessment to the org's members (attempt rows)
/** Who already holds an assessment — marks members in the assign picker. */
export interface AssessmentAssignmentRef {
  respondentAssessmentMappingId: number;
  respondentUserId: number;
  assessmentStatus: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
}

function getAssessmentAssignments(assessmentId: number) {
  return axios.get<AssessmentAssignmentRef[]>(
    `${API_URL}/respondent-assessments/getByAssessmentId/${assessmentId}`);
}

/**
 * All-or-nothing. The backend enforces the segregation rule: an org member
 * may only receive assessments mapped to their org.
 */
function assignAssessmentToMembers(assessmentId: number, respondentUserIds: number[]) {
  return axios.post<AssessmentAssignmentRef[]>(
    `${API_URL}/respondent-assessments/assign`, { assessmentId, respondentUserIds });
}

export const organizationApis = {
  getAllOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getUnassignedPeople,
  assignPeople,
  unassignPeople,
  getOrganizationAssessments,
  assignAssessments,
  unassignAssessments,
  getAllAssessments,
  getAssessmentAssignments,
  assignAssessmentToMembers,
};
