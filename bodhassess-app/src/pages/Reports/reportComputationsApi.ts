import { api } from '@/lib/apiClient';

/**
 * Computation drafts — rules + template + respondents + guidance — and their
 * delivery: check, approve, preview one respondent, generate the batch.
 *
 * Scores never involve a model: `approve` and `generate` evaluate the pinned
 * formulae in Java. `markReady` remains the ceiling only for a computation that
 * pins a STATEMENT rule, because generating scoring code has no engine behind
 * it. The one outbound call on this path is NARRATIVE prose, written from
 * values the formulae already produced.
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

/**
 * Matches ReportComputationResponse.TagGuidance on the backend — one tag's
 * ANSWER on this computation.
 *
 * The template says only what shape a tag has. Which rule fills a VALUE tag
 * (`ruleSlug`) and what a NARRATIVE tag should say (`guidance`) is this
 * assessment's business and lives here, so one published template serves any
 * number of assessments.
 */
export interface TagGuidance {
  tag: string;
  guidance: string | null;
  /** VALUE tags: the pinned rule whose result prints here. */
  ruleSlug: string | null;
  /** Optional DecimalFormat pattern for a number. */
  format: string | null;
  /** Printed when the value is empty. */
  fallbackText: string | null;
  sortOrder: number;
}

/** Matches ReportTagAnswerRequest on the backend. */
export interface TagAnswerPayload {
  ruleSlug?: string | null;
  guidance?: string | null;
  format?: string | null;
  fallbackText?: string | null;
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
   * The CHEAP half of what stands between this computation and a delivered
   * report — template, bindings, pinned dependencies — without the cohort
   * evaluation. Empty means nothing cheap is wrong; only a clean `check()`
   * means approve will succeed. Null on the list, which computes nothing.
   */
  directBlockers: string[] | null;
  sourcePrompt: string | null;
  respondentScope: RespondentScope;
  respondentIds: number[];
  rules: SelectedRule[];
  tagGuidance: TagGuidance[];
  prompt: PromptPreview | null;
  /**
   * Template tags a model writes the prose for, in document order.
   *
   * Deliberately NOT folded into `mode`. The two say different things: `mode`
   * is about the NUMBERS (still DIRECT here — every score is a pinned formula),
   * this is about the TEXT. A report can have both, and one combined "uses AI"
   * flag would either imply the scores were generated or hide that any prose
   * was.
   */
  narrativeTags: string[];
  /** Whether a model is configured to write them. */
  narrativeAvailable: boolean;
  /** Who approved, when, over how many completed respondents. Null until approved. */
  approvedByUserId: number | null;
  approvedAt: string | null;
  approvedCohortSize: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Matches ReportDryRunResponse.RuleOutcome — one rule's result over the cohort. */
export interface CheckRuleOutcome {
  reportRuleId: number;
  slug: string;
  name: string;
  stage: string;
  definitionKind: 'EXPRESSION' | 'STATEMENT';
  resultType: string | null;
  population: boolean;
  status: 'EVALUATED' | 'NEEDS_GENERATION' | 'ERROR' | 'TOO_SMALL';
  error: string | null;
  summary: {
    count: number;
    nulls: number;
    min: number | null;
    max: number | null;
    mean: number | null;
    bands: Record<string, number>;
  } | null;
}

/**
 * Matches ReportCheckResponse on the backend: the full pre-approval check,
 * cohort evaluation included. Asked for on demand — after a change and before
 * approve — because the evaluation is the expensive half and no longer runs on
 * a plain read.
 */
export interface ReportCheckResponse {
  reportComputationId: number | null;
  blockers: string[];
  cohortSize: number;
  completed: number;
  minCohortSize: number;
  rules: CheckRuleOutcome[];
  notes: string[];
  ready: boolean;
}

/** Matches ReportRecipientResponse: one attempt in the cohort, and whether a batch writes it up. */
export interface ReportRecipient {
  attemptId: number;
  respondentUserId: number;
  name: string;
  serialId: string | null;
  status: 'NOT_STARTED' | 'ONGOING' | 'COMPLETED';
  recipient: boolean;
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
   * The full pre-approval check, cohort evaluation included.
   *
   * A POST because it does real work — every pinned rule over every
   * respondent. Call it after each change and before enabling approve; a plain
   * read no longer runs it.
   */
  check: async (id: number): Promise<ReportCheckResponse> =>
    (await api.post(`${ROOT}/check/${id}`)).data,

  /** The cohort, with who would actually receive a report — the preview picker. */
  recipients: async (id: number): Promise<ReportRecipient[]> =>
    (await api.get(`${ROOT}/recipients/${id}`)).data,

  /** One assessment's computations, newest first. Computes nothing per row. */
  getByAssessment: async (assessmentId: number): Promise<ReportComputationResponse[]> =>
    (await api.get(`${ROOT}/getByAssessment/${assessmentId}`)).data,

  /**
   * The one computation for an assessment and a template: found, or created
   * with every formula rule of the assessment pinned at its latest version.
   * The Layout step's first save.
   */
  forTemplate: async (payload: {
    assessmentId: number;
    reportTemplateId: number;
    organizationId?: number | null;
  }): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/forTemplate`, payload)).data,

  /** Re-pin the assessment's formula rules at their latest versions. DRAFT only. */
  repin: async (id: number): Promise<ReportComputationResponse> =>
    (await api.post(`${ROOT}/repin/${id}`)).data,

  /**
   * Answer one placeholder on this computation: the rule that fills a VALUE
   * tag, or the guidance a NARRATIVE tag is written from. CORE and LITERAL
   * tags are the template's and are refused here.
   */
  answerTag: async (
    id: number,
    tag: string,
    payload: TagAnswerPayload,
  ): Promise<ReportComputationResponse> =>
    (await api.put(`${ROOT}/answerTag/${id}/${encodeURIComponent(tag)}`, payload)).data,

  /**
   * One respondent's FINAL report, as a blob URL. Requires approval, unlike
   * `previewPdfUrl`, and refuses anyone the batch would skip. The caller
   * revokes the URL when done.
   */
  reportPdfUrl: async (id: number, attemptId: number): Promise<string> =>
    withReadableError(async () => {
      const res = await api.get(`${ROOT}/report/${id}/${attemptId}.pdf`,
        { responseType: 'blob' });
      return URL.createObjectURL(res.data as Blob);
    }),

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
   * Reports as a ZIP — every completed respondent's, or only the attempts
   * named in `attemptIds`. Who receives one is chosen HERE, at generation
   * time; the cohort the rules run over is the whole population either way,
   * so a percentile is the same number whoever is on the list.
   *
   * `responseType: 'blob'` is load-bearing — without it axios decodes the
   * archive as UTF-8 text and the saved file is corrupt in a way that only
   * shows up when somebody tries to open it.
   */
  generate: async (
    id: number,
    attemptIds?: number[],
  ): Promise<{ blob: Blob; fileName: string; count: number; skipped: number }> =>
    withReadableError(async () => {
    const response = await api.post(`${ROOT}/generate/${id}`,
      attemptIds && attemptIds.length ? { attemptIds } : null,
      { responseType: 'blob' });
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

  /**
   * Discard the prose a model wrote, so the next preview writes it again.
   *
   * Stored narrative is sticky on purpose — it is reused while the guidance and
   * the scores behind it are unchanged, which is what stops a re-issued report
   * contradicting the one already in somebody's hands. This is the escape hatch
   * for the one case that cannot detect: the wording is simply not good enough.
   * Costs one model call per respondent on the next run, so it is a deliberate
   * button and never automatic.
   */
  clearNarratives: async (id: number): Promise<{ cleared: number; message: string }> =>
    (await api.post(`${ROOT}/clearNarratives/${id}`)).data,

  delete: async (id: number): Promise<void> => {
    await api.delete(`${ROOT}/delete/${id}`);
  },
};
