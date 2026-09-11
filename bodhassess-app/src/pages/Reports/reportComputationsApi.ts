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
  /**
   * DIRECT or GENERATED — DERIVED from the pinned rules, never chosen. A
   * computation whose every rule is a formula runs in Java with no model; one
   * statement rule is enough to make it need generation.
   */
  mode: ComputationMode;
  /**
   * What still stands between this computation and a delivered report, in the
   * author's language. Empty means approve will succeed.
   */
  directBlockers: string[];
  sourcePrompt: string | null;
  respondentScope: RespondentScope;
  respondentIds: number[];
  rules: SelectedRule[];
  tagGuidance: TagGuidance[];
  prompt: PromptPreview | null;
  createdAt: string;
  updatedAt: string;
}

/** Matches ReportComputation's mode constants. */
export type ComputationMode = 'DIRECT' | 'GENERATED';

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

/**
 * Re-throw an axios error whose body is a Blob with its message readable.
 *
 * A `responseType: 'blob'` request gets its ERROR body as a Blob too, so
 * `e.response.data.message` is undefined and the page falls back to axios's
 * own "Request failed with status code 422" — throwing away a server message
 * that says exactly what went wrong. The endpoints below stream PDFs and ZIPs,
 * so every one of their failures arrives this way.
 */
const withReadableError = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (e: any) {
    const body = e?.response?.data;
    if (body instanceof Blob) {
      try {
        const parsed = JSON.parse(await body.text());
        if (parsed?.message) {
          const readable: any = new Error(parsed.message);
          readable.response = { ...e.response, data: parsed };
          throw readable;
        }
      } catch (parseFailure: any) {
        // A body that is not JSON tells us nothing the original did not.
        if (parseFailure?.message && parseFailure.message !== e.message) throw parseFailure;
      }
    }
    throw e;
  }
};

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

  /**
   * Approve a DIRECT computation for delivery — the gate `generate` requires.
   *
   * <p>Unlike markReady this one really is approval. It refuses (409) with the
   * first blocker as its message, which is the same list `directBlockers`
   * carries, so the screen can show what is missing before anyone presses it.
   */
  approve: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/approve/${id}`)).data,

  /**
   * One respondent's real report, for checking before approving.
   *
   * A blob URL and not a plain href, for the same reason the template preview
   * is one: the endpoint needs the Authorization header and an <iframe src>
   * cannot send it. The caller revokes the URL when done.
   */
  previewPdfUrl: async (id: number, attemptId: number): Promise<string> =>
    withReadableError(async () => {
      const res = await api.get(`${ROOT}/preview/${id}/${attemptId}.pdf`,
        { responseType: 'blob' });
      return URL.createObjectURL(res.data as Blob);
    }),

  /**
   * Every completed respondent's report, as a ZIP.
   *
   * `responseType: 'blob'` is load-bearing — without it axios decodes the
   * archive as UTF-8 text and the saved file is corrupt in a way that only
   * shows up when somebody tries to open it.
   */
  generate: async (id: number): Promise<{ blob: Blob; fileName: string; count: number; skipped: number }> =>
    withReadableError(async () => {
    const response = await api.post(`${ROOT}/generate/${id}`, null, { responseType: 'blob' });
    const disposition = String(response.headers['content-disposition'] || '');
    const match = disposition.match(/filename="?([^"]+)"?/);
    return {
      blob: response.data,
      fileName: match ? match[1] : `reports-${id}.zip`,
      count: Number(response.headers['x-report-count'] || 0),
      skipped: Number(response.headers['x-report-skipped'] || 0),
    };
  }),

  /**
   * Rename — allowed on an APPROVED computation, unlike `update`.
   *
   * The slug deliberately does not move: it is what every delivered batch's
   * values.json records, so changing it would orphan the audit trail from the
   * thing it describes.
   */
  rename: async (id: number, name: string): Promise<ReportComputationResponse> =>
    (await api.put(`${ROOT}/rename/${id}`, { name })).data,

  /**
   * Copy an approved computation to a DRAFT that can be changed.
   *
   * The pinned rule versions come across as they are, so the copy starts as an
   * exact restatement of what was approved and the first difference is the one
   * you make on purpose.
   */
  clone: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/clone/${id}`)).data,

  /**
   * Retire a computation. An APPROVED one must be archived before it can be
   * deleted — the pinned rule versions and template are the only record of
   * what any report issued from it was built from.
   */
  archive: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/archive/${id}`)).data,

  reopen: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/reopen/${id}`)).data,

  delete: async (id: number): Promise<void> => {
    await api.delete(`${ROOT}/delete/${id}`);
  },
};
