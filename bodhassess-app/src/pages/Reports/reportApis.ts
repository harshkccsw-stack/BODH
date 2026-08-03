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
 * Matches ReportRespondentRow on the backend. The tallies follow the
 * assessment filter: scoped to it when one is selected, across every
 * assessment the respondent holds otherwise. One assignment per
 * (respondent, assessment) pair, so these count assessments, not attempts.
 */
export interface RespondentRow {
  respondentUserId: number;
  serialId: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  organizationId: number | null;
  organizationName: string | null;
  assignedAssessments: number;
  completedAssessments: number;
}

export type AttemptStatus = 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';

/**
 * Matches ReportRespondentAssessmentRow on the backend — one assessment a
 * respondent holds, with how far the attempt got. answeredQuestions and
 * demographicResponses are what a reset wipes.
 */
export interface RespondentAssessmentRow {
  respondentAssessmentMappingId: number;
  assessmentId: number;
  assessmentName: string;
  assessmentStatus: AssessmentStatus;
  questionnaireId: number;
  questionnaireName: string;
  attemptStatus: AttemptStatus;
  isPersisted: boolean;
  answeredQuestions: number;
  totalQuestions: number;
  demographicResponses: number;
}

/** Matches ReportRespondentDetail on the backend — the info popup's payload. */
export interface RespondentDetail {
  respondentUserId: number;
  serialId: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  gender: string | null;
  consented: boolean;
  consentedAt: string | null;
  organizationId: number | null;
  organizationName: string | null;
  assessments: RespondentAssessmentRow[];
}

// ── Raw-data export ─────────────────────────────────────────────────────────
// Mirrors ExportSheetResponse on the backend: column definitions plus one row
// per COMPLETED respondent. Cells are looked up by key — demographics by
// demographicFieldId, answers by questionTag — so a missing key is a blank cell.

/** Matches ExportSheetResponse.ExportAssessmentRef on the backend. */
export interface ExportAssessmentRef {
  assessmentId: number;
  name: string;
  questionnaireId: number;
  questionnaireName: string;
}

/** Matches ExportSheetResponse.DemographicColumn on the backend. */
export interface DemographicColumn {
  demographicFieldId: number;
  label: string;
}

/** Matches ExportSheetResponse.QuestionColumn on the backend. questionTag is the header. */
export interface QuestionColumn {
  questionTag: string;
  questionId: number;
  stem: string;
}

/** Matches ExportSheetResponse.ExportRow on the backend. */
export interface ExportRow {
  respondentUserId: number;
  serialId: string | null;
  name: string | null;
  email: string;
  organizationId: number | null;
  organizationName: string | null;
  status: AttemptStatus;
  /** demographicFieldId → value (JSON object keys arrive as strings). */
  demographics: Record<string, string>;
  /** questionTag → chosen option text ("A; B" when multi-select). */
  answers: Record<string, string>;
}

/** Matches ExportSheetResponse on the backend. */
export interface ExportSheet {
  assessment: ExportAssessmentRef;
  /** Echoes the org filter that produced these rows; null = all organizations. */
  organizationId: number | null;
  demographicColumns: DemographicColumn[];
  questionColumns: QuestionColumn[];
  rows: ExportRow[];
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

// The info popup: profile + every assessment allotted to one respondent.
function getRespondentDetail(respondentUserId: number) {
  return axios.get<RespondentDetail>(`${API_URL}/reports/getRespondentDetail/${respondentUserId}`);
}

/**
 * Wipes the respondent's answers and demographic responses for that one
 * assessment and drops the allotment back to NOT_STARTED, so they take it
 * again from scratch. Destructive — confirm before calling.
 */
function resetAssessment(respondentAssessmentMappingId: number) {
  return axios.post<RespondentAssessmentRow>(
    `${API_URL}/reports/resetAssessment/${respondentAssessmentMappingId}`,
  );
}

/**
 * Raw-data sheet for one assessment — every COMPLETED respondent. Optional
 * organizationId scopes to that org's members; omit for all organizations.
 * 404 only when the assessment does not exist.
 */
function exportAssessment(assessmentId: number, organizationId?: number) {
  return axios.get<ExportSheet>(`${API_URL}/reports/export/assessment/${assessmentId}`, {
    params: { organizationId }, // axios drops undefined
  });
}

/**
 * Raw-data sheet for one respondent on one assessment — a single row. 404 when
 * the respondent has no COMPLETED attempt for it.
 */
function exportRespondent(assessmentId: number, respondentUserId: number, organizationId?: number) {
  return axios.get<ExportSheet>(
    `${API_URL}/reports/export/assessment/${assessmentId}/respondent/${respondentUserId}`,
    { params: { organizationId } },
  );
}

/**
 * Turn an ExportSheet into an .xlsx and trigger the browser download. Parsed
 * in the browser (dynamic import so the ~400 KB xlsx lib is only fetched when
 * someone actually exports). Sheet 1 "Raw Data" is the matrix — respondent
 * columns, then one column per demographic label, then one per questionTag;
 * Sheet 2 "Questions" is the tag → question-stem legend for reading the tags.
 */
export async function downloadExportSheet(sheet: ExportSheet): Promise<void> {
  const XLSX = await import('xlsx');

  const header = [
    'Serial ID', 'Name', 'Email', 'Organization', 'Status',
    ...sheet.demographicColumns.map((c) => c.label),
    ...sheet.questionColumns.map((c) => c.questionTag),
  ];
  const body = sheet.rows.map((r) => [
    r.serialId ?? '', r.name ?? '', r.email, r.organizationName ?? '', r.status,
    ...sheet.demographicColumns.map((c) => r.demographics[String(c.demographicFieldId)] ?? ''),
    ...sheet.questionColumns.map((c) => r.answers[c.questionTag] ?? ''),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), 'Raw Data');

  // Legend so the tag columns are readable.
  const legend = [['Question Tag', 'Question'],
    ...sheet.questionColumns.map((c) => [c.questionTag, c.stem])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(legend), 'Questions');

  const safeName = (sheet.assessment.name || 'assessment').replace(/[^\w-]+/g, '_').slice(0, 60);
  XLSX.writeFile(wb, `${safeName}_raw_data.xlsx`);
}

export const reportApis = {
  getOrganizations,
  getAssessments,
  getRespondents,
  getRespondentDetail,
  resetAssessment,
  exportAssessment,
  exportRespondent,
};
