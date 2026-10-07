import { api } from '@/lib/apiClient';

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
  /**
   * COMPLETED attempts only (0 otherwise): optional questions left blank, so
   * "answered 8 of 10" on a finished attempt reads as finished.
   */
  skippedOptionalQuestions: number;
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

/**
 * Matches ExportSheetResponse.DemographicColumn on the backend. A CHECKLIST
 * is laid out one column per choice (`options`, then `otherOptionLabel`);
 * any field with a write-in adds a "(specified)" column after its own.
 */
export interface DemographicColumn {
  demographicFieldId: number;
  label: string;
  fieldType: 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKLIST';
  /** The field's options for DROPDOWN / CHECKLIST, in order; empty otherwise. */
  options: string[];
  /** The write-in "Other" choice, delivered last; null = none. */
  otherOptionLabel: string | null;
}

/**
 * Matches ExportSheetResponse.QuestionColumn on the backend. questionTag is the
 * header. A LIKERT_GRID contributes one column PER ROW, tagged <tag>_R<n> and
 * carrying questionRowId + rowText; both are null on every other type.
 */
export interface QuestionColumn {
  questionTag: string;
  questionId: number;
  stem: string;
  questionRowId: number | null;
  rowText: string | null;
}

/**
 * Matches ExportSheetResponse.ScoringKeyEntry on the backend — one scoring
 * edge, spelled out. optionText is null for a question-level score (it lands
 * once the question is answered, whatever was picked); rowText is null outside
 * a grid.
 */
export interface ScoringKeyEntry {
  questionTag: string;
  stem: string;
  rowText: string | null;
  optionText: string | null;
  measuredQualityTypeId: number;
  mqtPath: string;
  score: number;
}

/** Matches ExportSheetResponse.MqColumn on the backend. */
export interface MqColumn {
  measuredQualityId: number;
  name: string;
}

/**
 * Matches ExportSheetResponse.MqtColumn on the backend. `path` is the header
 * text — MQT names are deliberately not unique, so two bare names from
 * different branches would render as the same column. `hasChildren` says
 * whether a subtree total is worth its own column (on a leaf it equals the
 * node's own score).
 */
export interface MqtColumn {
  measuredQualityTypeId: number;
  measuredQualityId: number;
  mqName: string;
  name: string;
  path: string;
  depth: number;
  parentTypeId: number | null;
  hasChildren: boolean;
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
  /** Inactivity "focus" popups dismissed during the attempt. */
  popUpCount: number;
  /** demographicFieldId → value (JSON object keys arrive as strings). */
  demographics: Record<string, string>;
  /** CHECKLIST fieldId → its ticks in choice order. Absent = never answered. */
  demographicSelections: Record<string, string[]>;
  /** fieldId → what was typed for the field's write-in "Other". */
  demographicOtherTexts: Record<string, string>;
  /** questionTag → chosen option text ("A; B" when multi-select). */
  answers: Record<string, string>;
  /** measuredQualityTypeId → that node's own score (JSON object keys arrive as strings). */
  mqtScores: Record<string, number>;
  /** measuredQualityTypeId → own score + every descendant's. */
  mqtTotals: Record<string, number>;
  /** measuredQualityId → every node of that MQ. */
  mqScores: Record<string, number>;
}

/** Matches ExportSheetResponse on the backend. */
export interface ExportSheet {
  assessment: ExportAssessmentRef;
  /** Echoes the org filter that produced these rows; null = all organizations. */
  organizationId: number | null;
  demographicColumns: DemographicColumn[];
  questionColumns: QuestionColumn[];
  /** MQs this questionnaire measures; empty when nothing in it is scored. */
  mqColumns: MqColumn[];
  /** MQTs this questionnaire measures, MQ by MQ, depth-first in tree order. */
  mqtColumns: MqtColumn[];
  /** Every scoring edge behind the numbers, so a total can be audited. */
  scoringKey: ScoringKeyEntry[];
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
  return api.get<ReportPage<OrganizationOption>>(`/reports/getOrganizations`, { params: query });
}

export interface AssessmentOptionQuery extends PagedQuery {
  /** Only the assessments mapped into this org's catalog; undefined = all. */
  organizationId?: number;
}

function getAssessments(query: AssessmentOptionQuery) {
  return api.get<ReportPage<AssessmentOption>>(`/reports/getAssessments`, { params: query });
}

// The listing itself — org/assessment filters + name/email search, paged.
function getRespondents(query: RespondentQuery) {
  return api.get<ReportPage<RespondentRow>>(`/reports/getRespondents`, { params: query });
}

// The info popup: profile + every assessment allotted to one respondent.
function getRespondentDetail(respondentUserId: number) {
  return api.get<RespondentDetail>(`/reports/getRespondentDetail/${respondentUserId}`);
}

/**
 * Wipes the respondent's answers and demographic responses for that one
 * assessment and drops the allotment back to NOT_STARTED, so they take it
 * again from scratch. Destructive — confirm before calling.
 */
function resetAssessment(respondentAssessmentMappingId: number) {
  return api.post<RespondentAssessmentRow>(`/reports/resetAssessment/${respondentAssessmentMappingId}`);
}

/**
 * Raw-data sheet for one assessment — every COMPLETED respondent. Optional
 * organizationId scopes to that org's members; omit for all organizations.
 * 404 only when the assessment does not exist.
 */
function exportAssessment(assessmentId: number, organizationId?: number) {
  return api.get<ExportSheet>(`/reports/export/assessment/${assessmentId}`, {
    params: { organizationId }, // axios drops undefined
  });
}

/**
 * Raw-data sheet for one respondent on one assessment — a single row. 404 when
 * the respondent has no COMPLETED attempt for it.
 */
function exportRespondent(assessmentId: number, respondentUserId: number, organizationId?: number) {
  return api.get<ExportSheet>(`/reports/export/assessment/${assessmentId}/respondent/${respondentUserId}`,
    { params: { organizationId } },
  );
}

/** Score lookups arrive keyed by id, and JSON object keys are always strings. */
const scoreOf = (map: Record<string, number>, id: number): number => map?.[String(id)] ?? 0;

/**
 * The demographic block of the Raw Data matrix, as header + cell pairs.
 *
 * A CHECKLIST is ONE COLUMN PER CHOICE holding 1 if ticked and 0 if not — the
 * ticks are separate variables (like a grid's rows), and a joined
 * "Smartphone; Laptop" cell cannot be counted or pivoted. Blank, not 0, when
 * the respondent never answered the checklist, so "did not answer" stays
 * distinct from "ticked nothing". Any field with a write-in "Other" gets one
 * more column after its own: what the respondent typed.
 */
function demographicCells(columns: DemographicColumn[]): Array<{ header: string; cell: (r: ExportRow) => string | number }> {
  return columns.flatMap((c) => {
    const id = String(c.demographicFieldId);
    const own =
      c.fieldType === 'CHECKLIST'
        ? [...c.options, ...(c.otherOptionLabel ? [c.otherOptionLabel] : [])].map((choice) => ({
            header: `${c.label}: ${choice}`,
            cell: (r: ExportRow) => {
              const ticks = r.demographicSelections?.[id];
              return ticks ? (ticks.includes(choice) ? 1 : 0) : '';
            },
          }))
        : [{ header: c.label, cell: (r: ExportRow) => r.demographics[id] ?? '' }];
    const specified = c.otherOptionLabel
      ? [{ header: `${c.label} (specified)`, cell: (r: ExportRow) => r.demographicOtherTexts?.[id] ?? '' }]
      : [];
    return [...own, ...specified];
  });
}

/**
 * Turn an ExportSheet into an .xlsx and trigger the browser download. Parsed
 * in the browser (dynamic import so the ~400 KB xlsx lib is only fetched when
 * someone actually exports).
 *
 * Five sheets:
 * 1. "Raw Data"       — the matrix: respondent columns, one per demographic
 *                       label (one per choice on a checklist, plus a
 *                       "(specified)" column for a write-in "Other"), one per
 *                       questionTag, then the MQ/MQT scores.
 *                       One respondent stays ONE row, which is what a pivot
 *                       table or an SPSS import needs.
 * 2. "MQ-MQT Scores"  — the same numbers long-format, one row per respondent ×
 *                       MQT, which is the readable form for a single person.
 * 3. "MQ Totals"      — respondent × MQ, wide.
 * 4. "Questions"      — the tag → question-stem legend.
 * 5. "Scoring Key"    — every scoring edge, so any total can be audited back
 *                       to the option that produced it.
 *
 * Sheets 1-3 and 5 are skipped entirely when the questionnaire scores nothing.
 */
export async function downloadExportSheet(sheet: ExportSheet, fileName?: string): Promise<void> {
  const XLSX = await import('xlsx');

  const mqts = sheet.mqtColumns ?? [];
  const mqs = sheet.mqColumns ?? [];

  // Score columns for the wide sheet: every MQT's own score, a subtree total
  // beside it only where the node HAS children (on a leaf the two are the
  // same number), then one total per MQ.
  const scoreHeaders = [
    ...mqts.flatMap((m) => (m.hasChildren ? [m.path, `${m.path} (total)`] : [m.path])),
    ...mqs.map((mq) => `${mq.name} (MQ total)`),
  ];
  const scoreCells = (r: ExportRow): number[] => [
    ...mqts.flatMap((m) =>
      m.hasChildren
        ? [scoreOf(r.mqtScores, m.measuredQualityTypeId), scoreOf(r.mqtTotals, m.measuredQualityTypeId)]
        : [scoreOf(r.mqtScores, m.measuredQualityTypeId)]),
    ...mqs.map((mq) => scoreOf(r.mqScores, mq.measuredQualityId)),
  ];

  const demographics = demographicCells(sheet.demographicColumns);
  const header = [
    'Serial ID', 'Name', 'Email', 'Organization', 'Status', 'Pop-up Count',
    ...demographics.map((d) => d.header),
    ...sheet.questionColumns.map((c) => c.questionTag),
    ...scoreHeaders,
  ];
  const body = sheet.rows.map((r) => [
    r.serialId ?? '', r.name ?? '', r.email, r.organizationName ?? '', r.status, r.popUpCount ?? 0,
    ...demographics.map((d) => d.cell(r)),
    ...sheet.questionColumns.map((c) => r.answers[c.questionTag] ?? ''),
    ...scoreCells(r),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), 'Raw Data');

  if (mqts.length > 0) {
    // Long format — one row per respondent × MQT. "Own" is what that node
    // scored; "Subtree total" adds everything under it; "MQ total" is the
    // whole quality.
    const longRows = sheet.rows.flatMap((r) =>
      mqts.map((m) => [
        r.serialId ?? '', r.name ?? '', r.email, r.organizationName ?? '',
        m.mqName, m.path, m.name, m.depth,
        scoreOf(r.mqtScores, m.measuredQualityTypeId),
        scoreOf(r.mqtTotals, m.measuredQualityTypeId),
        scoreOf(r.mqScores, m.measuredQualityId),
      ]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Serial ID', 'Name', 'Email', 'Organization', 'MQ', 'MQT Path', 'MQT', 'Depth',
        'Own', 'Subtree Total', 'MQ Total'],
      ...longRows,
    ]), 'MQ-MQT Scores');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Serial ID', 'Name', 'Email', 'Organization', ...mqs.map((mq) => mq.name)],
      ...sheet.rows.map((r) => [
        r.serialId ?? '', r.name ?? '', r.email, r.organizationName ?? '',
        ...mqs.map((mq) => scoreOf(r.mqScores, mq.measuredQualityId)),
      ]),
    ]), 'MQ Totals');
  }

  // Legend so the tag columns are readable. Grid columns name their row too.
  const legend = [['Question Tag', 'Question', 'Grid Row'],
    ...sheet.questionColumns.map((c) => [c.questionTag, c.stem, c.rowText ?? ''])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(legend), 'Questions');

  const key = sheet.scoringKey ?? [];
  if (key.length > 0) {
    // "(any answer)" marks a question-level score: it lands once the question
    // is answered at all, whichever option was picked.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Question Tag', 'Question', 'Grid Row', 'Option', 'MQT Path', 'Score'],
      ...key.map((e) => [
        e.questionTag, e.stem, e.rowText ?? '', e.optionText ?? '(any answer)', e.mqtPath, e.score,
      ]),
    ]), 'Scoring Key');
  }

  XLSX.writeFile(wb, fileName ?? rawDataFileName([sheet.assessment.name || 'assessment']));
}

/**
 * "<part>-<part>-data-<yyyy-mm-dd>.xlsx". Blank parts are dropped. Each part
 * keeps its spaces, hyphens (serial ids are "USR-000042") and non-English
 * letters; only characters a filesystem rejects become a space, and each is
 * capped so a long org + assessment pair stays a legal name.
 */
export function rawDataFileName(parts: Array<string | null | undefined>): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 60).trim();
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const kept = parts.map((p) => clean(p ?? '')).filter(Boolean);
  return `${[...kept, 'data', date].join('-')}.xlsx`;
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
