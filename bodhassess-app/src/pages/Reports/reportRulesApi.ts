import { api } from '@/lib/apiClient';

/**
 * The rules library — named, reusable scoring and interpretation logic that
 * computations reference by name.
 *
 * Matches ReportRuleController on the backend (/api/report-rules).
 */

/** Matches ReportRuleVersion's kind constants. */
export type DefinitionKind = 'EXPRESSION' | 'STATEMENT';

/** Matches ReportRuleVersion's result-type constants. */
export type RuleResultType = 'NUMBER' | 'TERM' | 'TEXT';

/**
 * Matches ReportColumnCatalog.ReportColumn on the backend.
 *
 * `key` is the identifier a formula uses (mqt:14). `label` is the MQT's full
 * path — MQT names are deliberately NOT unique in this product, so never treat
 * the label as an identity.
 */
export interface ReportColumn {
  key: string;
  label: string;
  type: string;
  group: 'core' | 'demographics' | 'answers' | 'scores' | string;
}

/** Matches DsExprResponse on the backend. Never an error status. */
export interface ExprCheck {
  ok: boolean;
  evalTarget: 'CLIENT' | 'SERVER';
  resultType: string | null;
  errors: string[];
  referencedColumns: string[];
  functions: string[];
  /**
   * Valid, and still suspect — a band cut no respondent can reach, above all.
   * Never blocks a save: `ok` stays true. Older responses may omit it, so
   * always read it as `warnings ?? []`.
   */
  warnings?: string[];
}

/**
 * Which authoring step a rule is filed under. Matches ReportRule's stage
 * constants, in pipeline order.
 *
 * The psychometrician's workbook has seven steps; only five hold rules. Step 0
 * (data capture) is the platform — answers already exist per attempt. Step 2
 * (reverse scoring) is authored upstream as reversed option scores, because
 * MqtScoringService sums OptionMqtScore and reversing at report time would make
 * mqt: mean one thing in a sheet and another in a report.
 */
export type RuleStage = 'VALIDITY' | 'SCORE' | 'BAND' | 'PROFILE' | 'EDGE';

export const RULE_STAGES: Array<{
  key: RuleStage; step: string; label: string; hint: string;
}> = [
  { key: 'VALIDITY', step: 'Step 1', label: 'Validity checks',
    hint: 'Run before any scoring. Flags and hard fails.' },
  { key: 'SCORE', step: 'Step 3', label: 'Score computation',
    hint: 'Factor and composite scores from the MQ/MQT columns.' },
  { key: 'BAND', step: 'Step 4', label: 'Interpretation bands',
    hint: 'Cut points that turn a score into a named band.' },
  { key: 'PROFILE', step: 'Step 5', label: 'Profile interpretation',
    hint: 'Cross-factor rules that produce report text.' },
  { key: 'EDGE', step: 'Edge cases', label: 'Edge cases',
    hint: 'Retakes, ties at a boundary, norm updates.' },
];

/** Matches ReportRuleResponse.RuleVersion on the backend. */
export interface RuleVersion {
  reportRuleVersionId: number;
  version: number;
  definitionKind: DefinitionKind;
  expression: string | null;
  statementText: string | null;
  resultType: RuleResultType | null;
  referencedKeys: string[];
  /** Slugs of the other rules this one consumes — the DAG's direct edges. */
  referencedRuleSlugs: string[];
  population: boolean;
  validatedAssessmentId: number | null;
  notes: string | null;
  createdAt: string;
}

/** Matches ReportRuleResponse on the backend. */
export interface ReportRuleResponse {
  reportRuleId: number;
  name: string;
  slug: string;
  description: string | null;
  assessmentId: number | null;
  stage: RuleStage;
  stepOrder: number;
  status: 'ACTIVE' | 'ARCHIVED';
  latestVersion: number;
  latest: RuleVersion | null;
  versions: RuleVersion[];
  createdAt: string;
  updatedAt: string;
}

/** Matches ReportRuleRequest on the backend. */
export interface ReportRulePayload {
  name: string;
  slug?: string | null;
  description?: string | null;
  definitionKind: DefinitionKind;
  expression?: string | null;
  statementText?: string | null;
  resultType?: RuleResultType | null;
  assessmentId?: number | null;
  organizationId?: number | null;
  stage?: RuleStage | null;
  stepOrder?: number | null;
  notes?: string | null;
}

/**
 * Matches ReportRulePortabilityResponse. Three verdicts, not two.
 *
 * SHAPE_MISMATCH is the one worth reading: every column resolves, but a
 * referenced trait is scored by a different number of questions here, so its
 * range moved and any cut point in the rule now means something else. Nothing
 * else in the system notices that.
 */
export type PortabilityVerdict = 'PORTABLE' | 'BLOCKED' | 'SHAPE_MISMATCH';

export interface RulePortability {
  reportRuleId: number;
  name: string;
  slug: string;
  stage: RuleStage;
  stepOrder: number;
  definitionKind: DefinitionKind | null;
  homeAssessmentId: number | null;
  validatedAssessmentId: number | null;
  population: boolean;
  verdict: PortabilityVerdict;
  missingKeys: string[];
  warnings: string[];
  dependencySlugs: string[];
}

/** Matches ReportDryRunResponse.Summary. */
export interface DryRunSummary {
  count: number;
  /** Never fold this into zero — "no value" and "a score of zero" differ. */
  nulls: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  bands: Record<string, number>;
}

/** Matches ReportDryRunResponse.RuleOutcome. */
export interface DryRunOutcome {
  reportRuleId: number;
  slug: string;
  name: string;
  stage: RuleStage;
  definitionKind: DefinitionKind;
  resultType: RuleResultType | null;
  population: boolean;
  status: 'EVALUATED' | 'NEEDS_GENERATION' | 'ERROR';
  error: string | null;
  summary: DryRunSummary | null;
}

/** Matches ReportDryRunResponse. */
export interface DryRunResult {
  assessmentId: number;
  respondentCount: number;
  rowsReturned: number;
  rules: DryRunOutcome[];
  rows: Array<{ rowId: unknown; label: string; values: Record<string, unknown> }>;
  notes: string[];
}

const ROOT = '/report-rules';

/* ===================== workbook import ===================== */

/** Matches ScoringSheetPreviewResponse.DraftRule on the backend. */
export interface DraftRule {
  sheetRow: number;
  code: string;
  name: string;
  slug: string;
  stage: RuleStage;
  stepOrder: number;
  logicText: string;
  /** The name this rule assigns to, when it states one. A grouping HINT. */
  writesTo: string | null;
  nameTaken: boolean;
}

/**
 * Rules competing to fill one placeholder — 4.1/4.2/4.3 all setting `band`.
 *
 * `ruleNames` is in SHEET order, which is the priority order: FIRST() answers
 * with the earliest candidate that produced text.
 */
export interface SelectionGroup {
  writesTo: string;
  stage: RuleStage;
  ruleNames: string[];
}

/** Matches ScoringSheetPreviewResponse on the backend. */
export interface SheetPreview {
  rules: DraftRule[];
  warnings: string[];
  /** Non-empty means the import cannot run. */
  blocking: string[];
  groups: SelectionGroup[];
}

/**
 * Reading a workbook is in `workbookSheets.ts`, not here.
 *
 * It has no `@/` imports on purpose, which is what lets the tab-picking rules
 * be transpiled and run against the real workbook outside the browser — the
 * only verification available in a project with no test runner. See
 * `readWorkbook` there.
 */

/* ===================== AI translation ===================== */

/** Matches RuleTranslationResponse.Proposal on the backend. */
export interface TranslationProposal {
  reportRuleId: number;
  name: string;
  sourceText: string;
  expression: string | null;
  resultType: string | null;
  /** The VALIDATOR's verdict, not the model's. Only `ok` may be applied. */
  ok: boolean;
  /** The model's own judgement. False means "parses, but check the meaning". */
  confident: boolean;
  errors: string[];
  note: string | null;
  /**
   * What the validator found suspect in a formula it nonetheless accepted.
   * A proposal with warnings is never marked `confident`, so the tick and the
   * warning cannot appear together.
   */
  warnings?: string[];
}

/** Matches RuleTranslationResponse on the backend. */
export interface TranslationResult {
  model: string;
  proposals: TranslationProposal[];
}

/**
 * A worked example of the sheet this importer reads, as .xlsx.
 *
 * Filled in rather than blank on purpose. A psychometrician handed an empty
 * grid has to guess what "column C" wants; handed a sheet that already states
 * a validity check, a reverse-scored transform, three factor scores, a band
 * and two competing profile notes, they can replace the text and keep the
 * shape. Every structural rule the parser relies on — headings alone on their
 * row, a blank row between sections, the assignment written as `name = ...` —
 * is demonstrated at least once here rather than only described.
 *
 * Written as an array of arrays, NOT json_to_sheet: this sheet has no header
 * row. Its first column holds a step heading on one line and a rule code on
 * the next, which is a shape a header-keyed converter cannot express.
 */
export async function downloadSheetTemplate() {
  const XLSX = await import('xlsx');

  const rows: string[][] = [
    ['STEP 1 — VALIDITY CHECKS (run BEFORE any scoring)', '', ''],
    ['1.1', 'Infrequency check',
      "IF V3 <= 3 THEN protocol_status = 'INVALID'. Do not compute any scores. " +
      "Message: 'Response pattern suggests careless responding. Please retake.'"],
    ['1.2', 'Straight-lining',
      "IF all 15 raw responses are identical THEN protocol_status = 'INVALID'. Same handling as 1.1."],
    ['', '', ''],

    ['STEP 2 — REVERSE SCORING', '', ''],
    ['2.1', 'Transform',
      "FOR each item WHERE Reverse_Scored = 'Y' (I3, I6, I11): scored_value = 6 - raw_value. " +
      'All other scored items: scored_value = raw_value.'],
    ['', '', ''],

    ['STEP 3 — SCORE COMPUTATION', '', ''],
    ['3.1', 'Internal Drive', 'ID_score = I1 + I2 + I3(rev) + I4. Range 4-20.'],
    ['3.2', 'Sustained Tenacity', 'ST_score = I5 + I6(rev) + I7 + I8. Range 4-20.'],
    ['3.3', 'Adaptive Execution', 'AE_score = I9 + I10 + I11(rev) + I12. Range 4-20.'],
    ['3.4', 'Composite', 'AD_composite = ID_score + ST_score + AE_score. Range 12-60.'],
    ['', '', ''],

    ['STEP 4 — INTERPRETATION BANDS', '', ''],
    ['4.1', 'High', "IF AD_composite >= 48 THEN band = 'High Drive'."],
    ['4.2', 'Moderate', "IF 34 <= AD_composite <= 47 THEN band = 'Moderate Drive'."],
    ['4.3', 'Developing', "IF AD_composite <= 33 THEN band = 'Developing Drive'."],
    ['', '', ''],

    ['STEP 5 — PROFILE INTERPRETATION RULES', '', ''],
    ['5.1', "Believes, doesn't act",
      "IF ID_score >= 15 AND AE_score <= 11 THEN profile_note = " +
      "'High belief, low execution - needs accountability structures.'"],
    ['5.2', "Starts, doesn't finish",
      "IF ID_score >= 15 AND ST_score <= 11 THEN profile_note = " +
      "'Strong start, weak follow-through - needs milestone commitments.'"],
    ['', '', ''],

    ['EDGE CASES', '', ''],
    ['E1', 'Ties at band boundaries',
      'Band cutoffs are inclusive as written (>= and <=); no rounding needed.'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 96 }];

  const guide = XLSX.utils.aoa_to_sheet([
    ['How to fill in the Scoring Logic sheet'],
    [''],
    ['Column A', 'The step heading, OR a rule code like 3.1 / E1.'],
    ['Column B', "The rule's short name. Leave blank on a heading row."],
    ['Column C', 'The rule itself, in your own words. Leave blank on a heading row.'],
    [''],
    ['A row is read as a HEADING when columns B and C are both empty.'],
    ['A row with nothing in any column is a separator and is ignored.'],
    ['Everything else is read as one rule.'],
    [''],
    ['Which step a heading means is read from its WORDS, not its number, so'],
    ['"STEP 3 — SCORE COMPUTATION" and "SCORING" both file under Score computation.'],
    ['Recognised: VALIDITY, DATA CAPTURE, REVERSE, SCORING, COMPUTATION, BAND,'],
    ['INTERPRETATION, PROFILE, EDGE.'],
    [''],
    ['Write the output as "name = value" (e.g. band = \'High Drive\'). Rules that'],
    ['set the SAME name are treated as competing for one placeholder — 4.1, 4.2'],
    ['and 4.3 above all set "band" — and the importer will tell you so, because'],
    ['more than one can match the same respondent and you have to say which wins.'],
    [''],
    ['Order matters inside a step: it becomes the priority order.'],
    [''],
    ['Nothing imported can run until it is turned into a formula. Importing is'],
    ['always safe — the worst case is a rule filed under the wrong step.'],
  ]);
  guide['!cols'] = [{ wch: 14 }, { wch: 86 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scoring Logic');
  XLSX.utils.book_append_sheet(wb, guide, 'How to fill this in');
  XLSX.writeFile(wb, 'scoring-logic-template.xlsx');
}

export const reportRulesApi = {

  getAll: async (): Promise<ReportRuleResponse[]> =>
    (await api.get(`${ROOT}/getAll`)).data,

  /** Whether AI translation is configured, asked before the button is drawn. */
  aiAvailable: async (): Promise<boolean> =>
    (await api.get(`${ROOT}/ai/available`)).data?.available === true,

  /**
   * Propose formulae for plain-language rules. Saves NOTHING.
   *
   * Sent as a batch because workbook rules reference each other — a composite
   * score is meaningless without the factor scores it adds up — so translating
   * one at a time would hand the model a sentence with half its vocabulary
   * missing.
   */
  aiTranslate: async (
    assessmentId: number,
    ruleIds: number[],
    organizationId?: number | null,
  ): Promise<TranslationResult> =>
    (await api.post(`${ROOT}/ai/translate`, { assessmentId, ruleIds, organizationId })).data,

  /** What a workbook WOULD create. Writes nothing. */
  importPreview: async (
    csv: string,
    assessmentId: number | null,
    organizationId?: number | null,
  ): Promise<SheetPreview> =>
    (await api.post(`${ROOT}/import/preview`, { csv, assessmentId, organizationId })).data,

  /** Creates every rule in the sheet, or none of them. */
  importSheet: async (
    csv: string,
    assessmentId: number | null,
    organizationId?: number | null,
  ): Promise<ReportRuleResponse[]> =>
    (await api.post(`${ROOT}/import`, { csv, assessmentId, organizationId })).data,

  getById: async (id: number): Promise<ReportRuleResponse> =>
    (await api.get(`${ROOT}/getById/${id}`)).data,

  /**
   * The MQ/MQT picker's source — LIVE, and for one specific assessment.
   *
   * Never cache this across assessments. Score columns come from the questions
   * actually placed in the questionnaire, so different assessments expose
   * different MQ/MQT sets; a stale list is how a rule ends up looking valid and
   * scoring every respondent null on the wrong assessment.
   */
  columns: async (assessmentId: number, organizationId?: number | null): Promise<ReportColumn[]> =>
    (await api.get(`${ROOT}/columns/getByAssessment/${assessmentId}`, {
      params: organizationId ? { organizationId } : undefined,
    })).data,

  /**
   * Live formula check. Answers 200 with errors[] even when broken.
   *
   * `reportRuleId` is the rule being EDITED, when there is one. Without it the
   * checker cannot tell `[rule:self]` from a legitimate dependency, and the
   * live answer would disagree with what saving does.
   */
  validateExpression: async (
    expression: string,
    assessmentId: number | null,
    organizationId?: number | null,
    reportRuleId?: number | null,
  ): Promise<ExprCheck> =>
    (await api.post(`${ROOT}/validate-expression`, {
      expression,
      assessmentId,
      organizationId,
      reportRuleId,
    })).data,

  canRunOn: async (id: number, assessmentId: number): Promise<{ canRun: boolean }> =>
    (await api.get(`${ROOT}/canRunOn/${id}`, { params: { assessmentId } })).data,

  /**
   * Every library rule judged against one assessment.
   *
   * Recomputed on every call by design — an assessment's columns change when
   * questions are unplaced, so a verdict cached in the browser says "portable"
   * about a rule that stopped being portable an hour ago.
   */
  portability: async (
    assessmentId: number,
    organizationId?: number | null,
  ): Promise<RulePortability[]> =>
    (await api.get(`${ROOT}/portability/getByAssessment/${assessmentId}`, {
      params: organizationId ? { organizationId } : undefined,
    })).data,

  /**
   * Run the rules over real respondents — no AI, no sandbox.
   *
   * NOT the delivery path. Reports come from generated Python executed in the
   * sandbox; this evaluates the expression grammar in Java. Two implementations
   * on purpose, which is what makes this an oracle for the generated code
   * later — and why nothing here can approve anything.
   */
  dryRun: async (payload: {
    assessmentId: number;
    organizationId?: number | null;
    ruleIds?: number[];
    rowLimit?: number;
  }): Promise<DryRunResult> =>
    (await api.post(`${ROOT}/dry-run`, payload)).data,

  create: async (payload: ReportRulePayload): Promise<ReportRuleResponse> =>
    (await api.post(`${ROOT}/create`, payload)).data,

  /** Saving writes a NEW immutable version; the previous one stays readable. */
  update: async (id: number, payload: ReportRulePayload): Promise<ReportRuleResponse> =>
    (await api.put(`${ROOT}/update/${id}`, payload)).data,

  archive: async (id: number): Promise<ReportRuleResponse> =>
    (await api.post(`${ROOT}/archive/${id}`)).data,

  delete: async (id: number): Promise<void> => {
    await api.delete(`${ROOT}/delete/${id}`);
  },
};

/** The column families, for grouping the picker. Mirrors DataStudioDatasetService. */
export const COLUMN_GROUPS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'scores', label: 'MQ / MQT scores', hint: 'What most rules are built from' },
  { key: 'demographics', label: 'Demographics', hint: 'Age band, education, role…' },
  { key: 'answers', label: 'Individual answers', hint: 'One column per question' },
  { key: 'core', label: 'Attempt facts', hint: 'Completion, organization' },
];
