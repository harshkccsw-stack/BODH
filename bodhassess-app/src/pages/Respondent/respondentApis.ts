import { api } from '@/lib/apiClient';

/**
 * Matches the Gender enum on the backend. PREFER_NOT_TO_SAY is a real stored
 * answer — the field is required on every form now, and this is how someone
 * declines. A null gender means the question predates that and was never put
 * to them, which is NOT the same thing.
 */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

// ── Wire shapes — mirror spring-social's DTOs 1:1 ──────────────────────────
/**
 * Matches RespondentRequest on the backend. One payload feeds two rows:
 * the User identity (email + dob — dob is the login credential) and the
 * RespondentUser profile (name, phone, gender, consent, organization).
 */
export interface RespondentPayload {
  name: string;
  email: string;
  /** dd-MM-yyyy (wire format everywhere) — doubles as the login password. */
  dob: string;
  /** Required — the backend rejects a blank or malformed one. */
  phone: string;
  /**
   * Optional employer code, unique per organization. Alphanumeric only —
   * the portal accepts it in place of the email at login, and the backend
   * tells the two apart by looking for '@'.
   */
  employeeId: string | null;
  /** Required — PREFER_NOT_TO_SAY is how a respondent declines. */
  gender: Gender;
  isConsented: boolean;
  organizationId: number | null;
}

/** Matches RespondentResponse on the backend (User + profile flattened). */
export interface RespondentResponse {
  respondentUserId: number;
  userId: number;
  serialId: string | null;
  name: string;
  email: string;
  /** dd-MM-yyyy, same format the payload sends. */
  dob: string;
  phone: string | null;
  employeeId: string | null;
  gender: Gender | null;
  isConsented: boolean;
  consentedAt: string | null;
  organizationId: number | null;
  organizationName: string | null;
}

/** Matches OrganizationResponse on the backend. */
export interface OrganizationResponse {
  organizationId: number;
  name: string;
  description: string | null;
}

//respondent apis
function getAllRespondents() {
  return api.get<RespondentResponse[]>(`/respondents/getAll`);
}

function getRespondentById(id: number) {
  return api.get<RespondentResponse>(`/respondents/getById/${id}`);
}

function createRespondent(respondent: RespondentPayload) {
  return api.post<RespondentResponse>(`/respondents/create`, respondent);
}

function updateRespondent(id: number, respondent: RespondentPayload) {
  return api.put<RespondentResponse>(`/respondents/update/${id}`, respondent);
}

function deleteRespondent(id: number) {
  return api.delete<void>(`/respondents/delete/${id}`);
}

//organization picker for the create/edit form
function getAllOrganizations() {
  return api.get<OrganizationResponse[]>(`/organizations/getAll`);
}

export const respondentApis = {
  getAllRespondents,
  getRespondentById,
  createRespondent,
  updateRespondent,
  deleteRespondent,
  getAllOrganizations,
};
