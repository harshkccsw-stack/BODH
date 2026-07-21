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

export const organizationApis = {
  getAllOrganizations,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getUnassignedPeople,
  assignPeople,
};
