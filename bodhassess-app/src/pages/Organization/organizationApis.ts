import axios from 'axios';
import { config } from '@/lib/config';

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
  /** Logo as a base64 data URL ("data:image/png;base64,…"), or null to clear it. */
  logoBase64: string | null;
  /**
   * Initial catalog — only read on CREATE. The 3-step wizard leaves this null
   * and maps assessments in its own step (step 2 → assign-assessments), so
   * every step owns exactly one request; the modal is edit-only and also
   * sends null.
   */
  assessmentIds: number[] | null;
}

/** Matches OrganizationResponse on the backend (list shape with counts). */
export interface OrganizationResponse {
  organizationId: number;
  name: string;
  orgEmail: string | null;
  description: string | null;
  /** Logo as a base64 data URL, or null if none was uploaded. */
  logoBase64: string | null;
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
  /** Logo as a base64 data URL, or null if none was uploaded. */
  logoBase64: string | null;
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

//self-registration links (wizard step 3, "Registration links")
export type RegistrationLinkScope = 'ORGANIZATION' | 'ASSESSMENT';
export type RegistrationLinkStatus = 'ACTIVE' | 'INACTIVE';

/**
 * Matches RegistrationLinkResponse on the backend — the ADMIN view of a link,
 * with the lifecycle facts the public resolve endpoint withholds.
 *
 * Only the bare `token` comes back, never a URL: the portal's origin is a
 * deployment fact, so the dashboard composes it from VITE_PORTAL_URL (see
 * registrationLinkUrl below).
 */
export interface RegistrationLinkRef {
  registrationTokenId: number;
  token: string;
  scope: RegistrationLinkScope;
  /** Null on the org-wide link. */
  assessmentId: number | null;
  assessmentName: string | null;
  status: RegistrationLinkStatus;
  /** Null means unlimited. */
  maxUses: number | null;
  usedCount: number;
  /** ISO instant, or null when the link never expires. */
  expiresAt: string | null;
  createdAt: string;
}

/** Matches OrganizationRegistrationLinksResponse.AssessmentLink on the backend. */
export interface OrgAssessmentLinkRow {
  assessmentId: number;
  assessmentName: string;
  assessmentStatus: AssessmentStatus;
  /** Null until a link is generated for this catalog entry. */
  link: RegistrationLinkRef | null;
}

/**
 * Matches OrganizationRegistrationLinksResponse on the backend. Carries a row
 * per POSSIBLE link — including the ones not yet minted — so the page can
 * offer "Generate" without re-deriving the catalog.
 */
export interface OrganizationRegistrationLinks {
  organizationId: number;
  organizationName: string;
  /** Null until the org-wide link is generated. */
  organizationLink: RegistrationLinkRef | null;
  assessments: OrgAssessmentLinkRow[];
}

/** Matches RegistrationLinkRequest on the backend. */
export interface RegistrationLinkPayload {
  organizationId: number;
  /** Null mints the org-wide link; an id mints one for that catalog entry. */
  assessmentId: number | null;
  /** Null = unlimited. Not surfaced in the wizard yet. */
  maxUses: number | null;
  /** ISO instant, null = never expires. Not surfaced in the wizard yet. */
  expiresAt: string | null;
}

function getOrganizationRegistrationLinks(organizationId: number) {
  return axios.get<OrganizationRegistrationLinks>(
    `${API_URL}/registration-tokens/getByOrganization/${organizationId}`);
}

/** 409 if the target already has a link, 400 if the assessment is not mapped. */
function generateRegistrationLink(payload: RegistrationLinkPayload) {
  return axios.post<RegistrationLinkRef>(`${API_URL}/registration-tokens/generate`, payload);
}

/** New token string on the same row — the old URL stops working at once. */
function rotateRegistrationLink(registrationTokenId: number) {
  return axios.post<RegistrationLinkRef>(`${API_URL}/registration-tokens/rotate/${registrationTokenId}`);
}

/** Pause/resume without destroying the URL. */
function setRegistrationLinkStatus(registrationTokenId: number, status: RegistrationLinkStatus) {
  return axios.put<RegistrationLinkRef>(
    `${API_URL}/registration-tokens/setStatus/${registrationTokenId}`, { status });
}

function deleteRegistrationLink(registrationTokenId: number) {
  return axios.delete<void>(`${API_URL}/registration-tokens/delete/${registrationTokenId}`);
}

/**
 * The shareable URL. The backend deliberately never builds this — it does not
 * know where the portal is deployed — so the origin comes from config
 * (VITE_PORTAL_URL: https://portal.bodh.biz in production, the local portal
 * dev server otherwise).
 */
export function registrationLinkUrl(token: string): string {
  return `${config.portalUrl}/register/${token}`;
}

//creating brand-new respondents straight into an org (wizard step 3, "New" tab)
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

/**
 * Matches RespondentRequest on the backend. One payload feeds two rows: the
 * User identity (email + dob — dob is the portal login credential) and the
 * RespondentUser profile. organizationId is what drops the new person
 * straight into the org being built, so no follow-up assign call is needed.
 */
export interface OrgRespondentCreatePayload {
  name: string;
  email: string;
  /** dd-MM-yyyy — the wire format everywhere, and the login password. */
  dob: string;
  phone: string | null;
  /** Optional employer code, alphanumeric, unique within the organization. */
  employeeId: string | null;
  gender: Gender | null;
  isConsented: boolean;
  organizationId: number | null;
}

/** Slim view of RespondentResponse — all the wizard needs back. */
export interface CreatedRespondentRef {
  respondentUserId: number;
  serialId: string | null;
  name: string;
  email: string;
}

/** 409 on a duplicate email or an employee id already used in this org. */
function createRespondent(payload: OrgRespondentCreatePayload) {
  return axios.post<CreatedRespondentRef>(`${API_URL}/respondents/create`, payload);
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
  createRespondent,
  getOrganizationRegistrationLinks,
  generateRegistrationLink,
  rotateRegistrationLink,
  setRegistrationLinkStatus,
  deleteRegistrationLink,
};
