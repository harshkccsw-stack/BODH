import axios from 'axios';

// import.meta.env, not process.env — process does not exist in the browser
// bundle Vite produces.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

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
  phone: string | null;
  gender: Gender | null;
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
  return axios.get<RespondentResponse[]>(`${API_URL}/respondents/getAll`);
}

function getRespondentById(id: number) {
  return axios.get<RespondentResponse>(`${API_URL}/respondents/getById/${id}`);
}

function createRespondent(respondent: RespondentPayload) {
  return axios.post<RespondentResponse>(`${API_URL}/respondents/create`, respondent);
}

function updateRespondent(id: number, respondent: RespondentPayload) {
  return axios.put<RespondentResponse>(`${API_URL}/respondents/update/${id}`, respondent);
}

function deleteRespondent(id: number) {
  return axios.delete<void>(`${API_URL}/respondents/delete/${id}`);
}

//organization picker for the create/edit form
function getAllOrganizations() {
  return axios.get<OrganizationResponse[]>(`${API_URL}/organizations/getAll`);
}

export const respondentApis = {
  getAllRespondents,
  getRespondentById,
  createRespondent,
  updateRespondent,
  deleteRespondent,
  getAllOrganizations,
};
