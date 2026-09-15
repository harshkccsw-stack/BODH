import { api } from '@/lib/apiClient';

/**
 * The item dictionary — what `I1` and `V3` mean on one assessment.
 *
 * Matches ReportItemBindingController on the backend
 * (/api/report-item-bindings). A binding is never evaluated and has no
 * versions: it is read when a rule is TRANSLATED, to turn an item code into a
 * column key.
 */

/** Relative, like the rest of the report engine — apiClient carries the base. */
const ROOT = '/report-item-bindings';

/** Matches ReportItemBinding's MATCH_* constants. */
export type MatchMethod = 'EXACT' | 'NORMALISED' | 'FUZZY' | 'MANUAL' | 'NONE';

/** Matches ItemBindingPreviewResponse's change constants. */
export type BindingChange = 'NEW' | 'REMATCHED' | 'FLAGS_CHANGED' | 'CHANGED' | 'UNCHANGED';

/** Matches ItemBindingPreviewResponse.Row on the backend. */
export interface BindingRow {
  sheetRow: number;
  itemCode: string;
  adminPosition: number | null;
  factor: string | null;
  construct: string | null;
  statement: string;
  reverseScored: boolean;
  inComposite: boolean;
  questionId: number | null;
  questionnaireQuestionId: number | null;
  questionTag: string | null;
  questionStem: string | null;
  mqId: number | null;
  mqName: string | null;
  mqtId: number | null;
  mqtPath: string | null;
  matchMethod: MatchMethod;
  note: string | null;
  change: BindingChange;
}

/** Matches ItemBindingPreviewResponse.QuestionOption on the backend. */
export interface QuestionOption {
  questionId: number;
  questionTag: string | null;
  sortOrder: number;
  stem: string;
}

/** Matches ItemBindingPreviewResponse on the backend. */
export interface BindingPreview {
  assessmentId: number;
  rows: BindingRow[];
  /** Codes this import would DELETE, because the sheet no longer has them. */
  removed: string[];
  candidates: QuestionOption[];
  warnings: string[];
  blocking: string[];
}

/** Matches ItemBindingResponse on the backend. */
export interface ItemBinding {
  reportItemBindingId: number;
  assessmentId: number;
  itemCode: string;
  adminPosition: number | null;
  factor: string | null;
  construct: string | null;
  statement: string;
  reverseScored: boolean;
  inComposite: boolean;
  questionId: number | null;
  questionTag: string | null;
  mqId: number | null;
  mqtId: number | null;
  matchMethod: MatchMethod;
}

/** How a match was made, for the reviewer. Ordered worst-first on purpose. */
export const MATCH_LABELS: Record<MatchMethod, { label: string; tone: string }> = {
  NONE: { label: 'Not matched', tone: 'border-red-200 bg-red-50 text-red-700' },
  FUZZY: { label: 'Close match', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  MANUAL: { label: 'Chosen by you', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  NORMALISED: { label: 'Matched', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  EXACT: { label: 'Matched', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

/**
 * What a re-import would do to a binding that already exists.
 *
 * `UNCHANGED` has no label because it is the silent case — most rows on most
 * re-imports, and labelling them buries the two that matter.
 */
export const CHANGE_LABELS: Record<BindingChange, { label: string; tone: string } | null> = {
  REMATCHED: {
    label: 'Now a different question',
    tone: 'border-red-200 bg-red-50 text-red-700',
  },
  FLAGS_CHANGED: {
    label: 'Scoring flags changed',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  NEW: { label: 'New', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  CHANGED: { label: 'Edited', tone: 'border-muted bg-muted text-muted-foreground' },
  UNCHANGED: null,
};

export const itemBindingsApi = {
  getByAssessment: async (assessmentId: number): Promise<ItemBinding[]> =>
    (await api.get(`${ROOT}/getByAssessment/${assessmentId}`)).data,

  preview: async (
    csv: string,
    assessmentId: number,
    questionOverrides?: Record<string, number>,
  ): Promise<BindingPreview> =>
    (await api.post(`${ROOT}/import/preview`, { csv, assessmentId, questionOverrides })).data,

  importSheet: async (
    csv: string,
    assessmentId: number,
    questionOverrides?: Record<string, number>,
  ): Promise<ItemBinding[]> =>
    (await api.post(`${ROOT}/import`, { csv, assessmentId, questionOverrides })).data,
};
