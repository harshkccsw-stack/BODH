import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export type PractitionerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type Vertical =
  | 'CLINICAL'
  | 'INDUSTRIAL'
  | 'COUNSELLING'
  | 'EXPERIMENTS'
  | 'WHITELABEL'
  | 'RESEARCH'
  | 'OTHER';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/**
 * Matches PractitionerRequest on the backend. One payload feeds two rows:
 * the User identity (email + dob — dob is the login credential) and the
 * PractitionerUser profile (name, phone, status, vertical, organization).
 */
export interface PractitionerPayload {
  /** Max 20 characters — DB column limit. */
  name: string;
  email: string;
  /** dd-MM-yyyy (wire format everywhere) — doubles as the login password. */
  dob: string;
  phone: string | null;
  /** Null defaults to ACTIVE on the backend. */
  practitionerStatus: PractitionerStatus | null;
  vertical: Vertical | null;
  organizationId: number | null;
}

/** Matches PractitionerResponse on the backend (User + profile flattened). */
export interface PractitionerResponse {
  practitionerUserId: number;
  userId: number;
  serialId: string | null;
  name: string;
  email: string;
  /** dd-MM-yyyy, same format the payload sends. */
  dob: string;
  phone: string | null;
  practitionerStatus: PractitionerStatus;
  vertical: Vertical | null;
  /** Lives on the User identity — bypasses all permission checks. */
  superAdmin: boolean;
  organizationId: number | null;
  organizationName: string | null;
}

/** Matches OrganizationResponse on the backend. */
export interface OrganizationResponse {
  organizationId: number;
  name: string;
  description: string | null;
}

//practitioner apis
function getAllPractitioners() {
  return axios.get<PractitionerResponse[]>(`${API_URL}/practitioners/getAll`);
}

function getPractitionerById(id: number) {
  return axios.get<PractitionerResponse>(`${API_URL}/practitioners/getById/${id}`);
}

function createPractitioner(practitioner: PractitionerPayload) {
  return axios.post<PractitionerResponse>(`${API_URL}/practitioners/create`, practitioner);
}

function updatePractitioner(id: number, practitioner: PractitionerPayload) {
  return axios.put<PractitionerResponse>(`${API_URL}/practitioners/update/${id}`, practitioner);
}

function deletePractitioner(id: number) {
  return axios.delete<void>(`${API_URL}/practitioners/delete/${id}`);
}

//superadmin flag on the practitioner's identity
function assignSuperAdmin(id: number) {
  return axios.put<PractitionerResponse>(`${API_URL}/practitioners/assign-superadmin/${id}`);
}

/** 409 when this is the last superadmin left. */
function revokeSuperAdmin(id: number) {
  return axios.put<PractitionerResponse>(`${API_URL}/practitioners/revoke-superadmin/${id}`);
}

//organization picker for the create/edit form
function getAllOrganizations() {
  return axios.get<OrganizationResponse[]>(`${API_URL}/organizations/getAll`);
}

export const practitionerApis = {
  getAllPractitioners,
  getPractitionerById,
  createPractitioner,
  updatePractitioner,
  deletePractitioner,
  assignSuperAdmin,
  revokeSuperAdmin,
  getAllOrganizations,
};
