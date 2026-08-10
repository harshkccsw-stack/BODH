import { api } from '@/lib/apiClient';

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
  return api.get<PractitionerResponse[]>(`/practitioners/getAll`);
}

function getPractitionerById(id: number) {
  return api.get<PractitionerResponse>(`/practitioners/getById/${id}`);
}

function createPractitioner(practitioner: PractitionerPayload) {
  return api.post<PractitionerResponse>(`/practitioners/create`, practitioner);
}

function updatePractitioner(id: number, practitioner: PractitionerPayload) {
  return api.put<PractitionerResponse>(`/practitioners/update/${id}`, practitioner);
}

function deletePractitioner(id: number) {
  return api.delete<void>(`/practitioners/delete/${id}`);
}

//superadmin flag on the practitioner's identity
function assignSuperAdmin(id: number) {
  return api.put<PractitionerResponse>(`/practitioners/assign-superadmin/${id}`);
}

/** 409 when this is the last superadmin left. */
function revokeSuperAdmin(id: number) {
  return api.put<PractitionerResponse>(`/practitioners/revoke-superadmin/${id}`);
}

//organization picker for the create/edit form
function getAllOrganizations() {
  return api.get<OrganizationResponse[]>(`/organizations/getAll`);
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
