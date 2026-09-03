import { api } from '@/lib/apiClient';

/**
 * Computation drafts — rules + template + respondents + guidance, assembled
 * into a prompt that is ready to send.
 *
 * There is deliberately NO generate call: no AI provider has been chosen, so
 * the backend has no such endpoint and makes no outbound request anywhere.
 * `markReady` is the ceiling.
 *
 * Matches ReportComputationController on the backend.
 */

export type ComputationStatus =
  | 'DRAFT'
  | 'READY_FOR_GENERATION'
  | 'GENERATED'
  | 'APPROVED'
  | 'ARCHIVED';

export type RespondentScope = 'ALL_COMPLETED' | 'SELECTED';

/** Matches ReportComputationResponse.SelectedRule on the backend. */
export interface SelectedRule {
  reportRuleVersionId: number;
  reportRuleId: number;
  name: string;
  slug: string;
  version: number;
  definitionKind: 'EXPRESSION' | 'STATEMENT';
  resultType: string | null;
  population: boolean;
  referencedKeys: string[];
  sortOrder: number;
}

/** Matches ReportComputationResponse.TagGuidance on the backend. */
export interface TagGuidance {
  tag: string;
  guidance: string | null;
  sortOrder: number;
}

/**
 * Matches ReportComputationResponse.PromptPreview on the backend.
 *
 * `declaredKeys` is the exact set of columns the generated code will be allowed
 * to read — the sandbox is handed only these and has no database access at all.
 */
export interface PromptPreview {
  ready: boolean;
  text: string;
  declaredKeys: string[];
  expectedTags: string[];
  blockers: string[];
  warnings: string[];
}

/** Matches ReportComputationResponse on the backend. */
export interface ReportComputationResponse {
  reportComputationId: number;
  name: string;
  slug: string;
  description: string | null;
  assessmentId: number;
  organizationId: number | null;
  reportTemplateId: number | null;
  templateName: string | null;
  status: ComputationStatus;
  sourcePrompt: string | null;
  respondentScope: RespondentScope;
  respondentIds: number[];
  rules: SelectedRule[];
  tagGuidance: TagGuidance[];
  prompt: PromptPreview | null;
  createdAt: string;
  updatedAt: string;
}

/** Matches ReportComputationRequest on the backend. */
export interface ReportComputationPayload {
  name: string;
  slug?: string | null;
  description?: string | null;
  assessmentId: number;
  organizationId?: number | null;
  reportTemplateId?: number | null;
  sourcePrompt?: string | null;
  respondentScope?: RespondentScope;
  respondentIds?: number[];
  ruleVersionIds?: number[];
  tagGuidance?: Array<{ tag: string; guidance: string }>;
}

const ROOT = '/report-computations';

export const reportComputationsApi = {
  getAll: async (): Promise<ReportComputationResponse[]> =>
    (await api.get(`${ROOT}/getAll`)).data,

  /** One draft, with the assembled prompt and whatever still blocks it. */
  getById: async (id: number): Promise<ReportComputationResponse> =>
    (await api.get(`${ROOT}/getById/${id}`)).data,

  create: async (payload: ReportComputationPayload): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/create`, payload)).data,

  update: async (
    id: number,
    payload: ReportComputationPayload,
  ): Promise<ReportComputationResponse> =>
    (await api.put(`${ROOT}/update/${id}`, payload)).data,

  /**
   * Mark the draft complete. This is NOT approval — the mandatory human review
   * of generated output happens after generation and is a separate gate.
   */
  markReady: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/markReady/${id}`)).data,

  reopen: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/reopen/${id}`)).data,

  delete: async (id: number): Promise<void> => {
    await api.delete(`${ROOT}/delete/${id}`);
  },
};
