import { api } from '@/lib/apiClient';
import { config } from '@/lib/config';

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
   * The co-branding logo the portal shows in its header for the whole of an
   * assessment — a separate image from logoBase64, set and cleared
   * independently. Null means no co-branding, and the portal falls back to its
   * own mark.
   */
  coBrandLogoBase64: string | null;
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
  /** The portal's take-flow header logo, or null if none was uploaded. */
  coBrandLogoBase64: string | null;
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
  /** The portal's take-flow header logo, or null if none was uploaded. */
  coBrandLogoBase64: string | null;
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
  return api.get<OrganizationResponse[]>(`/organizations/getAll`);
}

/** Drill-in: the org plus its full staff and member lists. */
function getOrganizationById(id: number) {
  return api.get<OrganizationDetailResponse>(`/organizations/getById/${id}`);
}

function createOrganization(organization: OrganizationPayload) {
  return api.post<OrganizationResponse>(`/organizations/create`, organization);
}

function updateOrganization(id: number, organization: OrganizationPayload) {
  return api.put<OrganizationResponse>(`/organizations/update/${id}`, organization);
}

/** 409 while the org still has staff or members. */
function deleteOrganization(id: number) {
  return api.delete<void>(`/organizations/delete/${id}`);
}

//assign picker + bulk assign
function getUnassignedPeople() {
  return api.get<UnassignedPeopleResponse>(`/organizations/getUnassigned`);
}

/** All-or-nothing: 400 on unknown ids, 409 if someone got an org meanwhile. */
function assignPeople(id: number, payload: OrganizationAssignPayload) {
  return api.put<OrganizationDetailResponse>(`/organizations/assign/${id}`, payload);
}

/** Mirror of assign — 409 if someone in the batch is not in this org. */
function unassignPeople(id: number, payload: OrganizationAssignPayload) {
  return api.put<OrganizationDetailResponse>(`/organizations/unassign/${id}`, payload);
}

//assessment catalog (data segregation)
function getOrganizationAssessments(id: number) {
  return api.get<OrgAssessmentRef[]>(`/organizations/getAssessments/${id}`);
}

/** All-or-nothing: already-mapped → 409, unknown id → 400. */
function assignAssessments(id: number, assessmentIds: number[]) {
  return api.put<OrgAssessmentRef[]>(`/organizations/assign-assessments/${id}`, { assessmentIds });
}

/** 409 while org members hold attempt rows for that assessment. */
function unassignAssessments(id: number, assessmentIds: number[]) {
  return api.put<OrgAssessmentRef[]>(`/organizations/unassign-assessments/${id}`, { assessmentIds });
}

/** The full assessment catalog — feeds the mapping pickers. */
function getAllAssessments() {
  return api.get<AssessmentRef[]>(`/assessments/getAll`);
}

//assigning a mapped assessment to the org's members (attempt rows)
/** Who already holds an assessment — marks members in the assign picker. */
export interface AssessmentAssignmentRef {
  respondentAssessmentMappingId: number;
  respondentUserId: number;
  assessmentStatus: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
}

function getAssessmentAssignments(assessmentId: number) {
  return api.get<AssessmentAssignmentRef[]>(`/respondent-assessments/getByAssessmentId/${assessmentId}`);
}

/**
 * All-or-nothing. The backend enforces the segregation rule: an org member
 * may only receive assessments mapped to their org.
 */
function assignAssessmentToMembers(assessmentId: number, respondentUserIds: number[]) {
  return api.post<AssessmentAssignmentRef[]>(`/respondent-assessments/assign`, { assessmentId, respondentUserIds });
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
  return api.get<OrganizationRegistrationLinks>(`/registration-tokens/getByOrganization/${organizationId}`);
}

/** 409 if the target already has a link, 400 if the assessment is not mapped. */
function generateRegistrationLink(payload: RegistrationLinkPayload) {
  return api.post<RegistrationLinkRef>(`/registration-tokens/generate`, payload);
}

/** New token string on the same row — the old URL stops working at once. */
function rotateRegistrationLink(registrationTokenId: number) {
  return api.post<RegistrationLinkRef>(`/registration-tokens/rotate/${registrationTokenId}`);
}

/** Pause/resume without destroying the URL. */
function setRegistrationLinkStatus(registrationTokenId: number, status: RegistrationLinkStatus) {
  return api.put<RegistrationLinkRef>(`/registration-tokens/setStatus/${registrationTokenId}`, { status });
}

function deleteRegistrationLink(registrationTokenId: number) {
  return api.delete<void>(`/registration-tokens/delete/${registrationTokenId}`);
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
/**
 * Matches the Gender enum on the backend. PREFER_NOT_TO_SAY is a real stored
 * answer — the field is required on every form now, and this is how someone
 * declines. A null gender on a RESPONSE means the question predates that and
 * was never put to them, which is not the same thing.
 */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

/**
 * Matches RespondentRequest on the backend. One payload feeds two rows: the
 * User identity (email + dob — dob is the portal login credential) and the
 * RespondentUser profile. organizationId is what drops the new person
 * straight into the org being built, so no follow-up assign call is needed.
 */
export interface OrgRespondentCreatePayload {
  name: string;
  email: string;
  /**
   * dd-MM-yyyy — the wire format everywhere, and the login password. Bounded
   * by the backend to 01-01-1900 .. today.
   */
  dob: string;
  /** Dial code with the '+', e.g. "+91". Required since 2026-08-31. */
  phoneCountryCode: string;
  /** Exactly ten digits — no punctuation, no country code. Required. */
  phone: string;
  /** Optional employer code, alphanumeric, unique within the organization. */
  employeeId: string | null;
  /** Required — PREFER_NOT_TO_SAY is how a respondent declines. */
  gender: Gender;
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
  return api.post<CreatedRespondentRef>(`/respondents/create`, payload);
}

//bulk upload from a spreadsheet (wizard step 3, "Upload" tab)
/**
 * Matches BulkRespondentRequest.Row on the backend. Every field is a raw
 * string because the server parses and validates each one itself — that is
 * what turns a bad cell into "row 37: …" instead of one 400 for the whole
 * upload with no idea which line caused it.
 *
 * `row` is the line number in the admin's own spreadsheet, echoed back on
 * every issue so a report points at something they can actually find.
 */
export interface BulkRespondentRow {
  row: number;
  name: string;
  email: string;
  /** dd-MM-yyyy. Also the portal password. Bounded to 01-01-1900 .. today. */
  dob: string;
  /** Dial code column, '+' included. Required since 2026-08-31. */
  phoneCountryCode?: string;
  /** Exactly ten digits. Required. */
  phone?: string;
  employeeId?: string;
  /** MALE / FEMALE / OTHER, case-insensitive. Blank means unset. */
  gender?: string;
}

/** Matches BulkRespondentRequest on the backend. */
export interface BulkRespondentPayload {
  /** From the wizard, never a column — a sheet cannot choose the organization. */
  organizationId: number;
  rows: BulkRespondentRow[];
}

/** Matches BulkRespondentValidationResponse.Issue on the backend. */
export interface BulkRespondentIssue {
  row: number;
  field: string;
  message: string;
}

/** Matches BulkRespondentValidationResponse on the backend. */
export interface BulkRespondentReport {
  totalRows: number;
  validRows: number;
  /** EVERY problem, not just the first — that is the point of validating. */
  issues: BulkRespondentIssue[];
}

/** Matches RespondentResponse on the backend — what bulk-create returns. */
export interface CreatedRespondentDetail {
  respondentUserId: number;
  serialId: string | null;
  name: string;
  email: string;
  /** dd-MM-yyyy — the portal password, and what the credentials sheet needs. */
  dob: string;
  phone: string | null;
  employeeId: string | null;
  gender: Gender | null;
}

/**
 * Dry run — writes nothing and reports every problem. Worth the round trip
 * because it checks the two things the browser cannot: whether an email is
 * already taken, and whether an employee ID is already used in this org.
 */
function bulkValidateRespondents(payload: BulkRespondentPayload) {
  return api.post<BulkRespondentReport>(`/respondents/bulk-validate`, payload);
}

/**
 * Commit — all-or-nothing. Re-runs the same checks, so a 422 carries a
 * BulkRespondentReport and nothing was written; 201 returns the created
 * respondents, which is what the credentials download is built from.
 */
function bulkCreateRespondents(payload: BulkRespondentPayload) {
  return api.post<CreatedRespondentDetail[]>(`/respondents/bulk-create`, payload);
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
  bulkValidateRespondents,
  bulkCreateRespondents,
  getOrganizationRegistrationLinks,
  generateRegistrationLink,
  rotateRegistrationLink,
  setRegistrationLinkStatus,
  deleteRegistrationLink,
};
