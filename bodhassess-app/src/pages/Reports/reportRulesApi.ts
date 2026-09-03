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

/** Matches ReportRuleResponse.RuleVersion on the backend. */
export interface RuleVersion {
  reportRuleVersionId: number;
  version: number;
  definitionKind: DefinitionKind;
  expression: string | null;
  statementText: string | null;
  resultType: RuleResultType | null;
  referencedKeys: string[];
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
  notes?: string | null;
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

  /** Live formula check. Answers 200 with errors[] even when broken. */
  validateExpression: async (
    expression: string,
    assessmentId: number | null,
    organizationId?: number | null,
  ): Promise<ExprCheck> =>
    (await api.post(`${ROOT}/validate-expression`, {
      expression,
      assessmentId,
      organizationId,
    })).data,

  canRunOn: async (id: number, assessmentId: number): Promise<{ canRun: boolean }> =>
    (await api.get(`${ROOT}/canRunOn/${id}`, { params: { assessmentId } })).data,

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
