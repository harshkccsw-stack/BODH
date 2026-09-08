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

export const reportRulesApi = {
  getAll: async (): Promise<ReportRuleResponse[]> =>
    (await api.get(`${ROOT}/getAll`)).data,

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
