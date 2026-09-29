import { api } from '@/lib/apiClient';
import type { QuestionPayload, QuestionResponse } from './questionApis';

// ── Mapping a sheet that is NOT our template ────────────────────────────────
// Two calls: /questions/ai/map-sheet turns a foreign workbook into rows of our
// own template (writing nothing), and /questions/import creates the questions
// together with any measured qualities they need, in one transaction.
//
// The template upload is untouched by all of this and remains the default —
// this path exists for sheets somebody else wrote, and its output is a file
// the ordinary upload already understands.

/** Matches SheetMappingRequest.SheetCsv on the backend. */
export interface SheetCsv {
  name: string;
  csv: string;
}

/** Matches SheetMappingResponse.PathSegment. */
export interface PathSegment {
  name: string;
  status: 'MATCHED' | 'MATCHED_NORMALISED' | 'CREATE' | 'AMBIGUOUS';
  mqId: number | null;
  mqtId: number | null;
  parentMqId: number | null;
  parentMqtId: number | null;
  note: string | null;
  /**
   * What the note is about, for a one-click action: the type to use instead
   * (a name found elsewhere), or the type to anchor under (a path the sheet
   * rooted too shallowly). Null when there is no note.
   */
  suggestedMqtId: number | null;
  suggestedPath: string | null;
}

/** Matches SheetMappingResponse.PathProposal. */
export interface PathProposal {
  pathKey: string;
  questionCount: number;
  fullyResolved: boolean;
  needsPick: boolean;
  segments: PathSegment[];
}

/** Matches SheetMappingResponse.RowSource — where one expanded row came from. */
export interface RowSource {
  sourceRow: number;
  path: string[];
  pathKey: string;
  externalId: string | null;
  reverseScored: boolean;
  /** The sheet flagged this item as outside every composite score. */
  excludedFromComposite: boolean;
}

/**
 * Matches SheetMappingResponse.DuplicateStem — a question whose wording is
 * already in the bank. A warning, never a blocker: a new instrument may
 * legitimately reuse a standard item.
 */
export interface DuplicateStem {
  index: number;
  sourceRow: number;
  existingQuestionId: number;
  method: 'EXACT' | 'NORMALISED';
}

/**
 * Matches SheetMappingResponse.SkippedRow — a row that was read but could not
 * become a question. Not a failure: the rest of the sheet still imports.
 */
export interface SkippedRow {
  row: number;
  why: string;
}

/** Matches SheetMappingResponse. `rows` are rows of the ordinary questions template. */
export interface SheetMappingResponse {
  ok: boolean;
  sheet: string | null;
  summary: string;
  spec: unknown;
  rows: Record<string, string>[];
  sources: RowSource[];
  paths: PathProposal[];
  duplicates: DuplicateStem[];
  warnings: string[];
  blockers: string[];
  /** Rows left out of the import, with the reason for each. */
  skipped: SkippedRow[];
  /** Headers of the question sheet that the reading never used. */
  unusedColumns: string[];
  confident: boolean;
  questions: string[];
  model: string;
}

/** Matches QuestionImportRequest.NewQuality — `ref` is NEGATIVE and unique. */
export interface NewQuality {
  ref: number;
  name: string;
  description?: string | null;
}

/**
 * Matches QuestionImportRequest.NewQualityType. Exactly ONE anchor:
 * qualityRef/qualityId for a root, parentTypeRef/parentTypeId for a child.
 */
export interface NewQualityType {
  ref: number;
  name: string;
  qualityRef?: number | null;
  qualityId?: number | null;
  parentTypeRef?: number | null;
  parentTypeId?: number | null;
}

/**
 * Matches QuestionImportRequest. A question's mqtScores may carry a NEGATIVE
 * measuredQualityTypeId, which refers to a `newQualityTypes` entry with that
 * ref. Identity ids are always positive, so the two cannot be confused.
 */
export interface QuestionImportPayload {
  newQualities: NewQuality[];
  newQualityTypes: NewQualityType[];
  questions: QuestionPayload[];
}

export interface QuestionImportResult {
  questions: QuestionResponse[];
  createdQualityIds: Record<string, number>;
  createdQualityTypeIds: Record<string, number>;
}

export const questionImportApi = {
  /** Asked before the AI route is offered, so an unconfigured install hides it. */
  available: async (): Promise<boolean> => {
    try {
      const res = await api.get<{ available: boolean }>('/questions/ai/available');
      return !!res.data?.available;
    } catch {
      // A server that cannot answer is a server that cannot map; the template
      // route is always there, so this fails quiet rather than loud.
      return false;
    }
  },

  /** `notes` is what the uploader typed about their own sheet — optional. */
  mapSheet: (sheets: SheetCsv[], fileName: string, notes?: string) =>
    api.post<SheetMappingResponse>('/questions/ai/map-sheet', { sheets, fileName, notes: notes || null }),

  /**
   * The same read, corrected. Sends the spec that came back last time plus
   * every correction so far, so the model revises a reading instead of
   * starting over — the rows, paths and duplicate check are recomputed from
   * the sheet on the server either way.
   */
  refineSheet: (
    sheets: SheetCsv[],
    fileName: string,
    notes: string | undefined,
    spec: unknown,
    instructions: string[],
  ) =>
    api.post<SheetMappingResponse>('/questions/ai/refine-sheet', {
      sheets, fileName, notes: notes || null, spec, instructions,
    }),

  importQuestions: (payload: QuestionImportPayload) =>
    api.post<QuestionImportResult>('/questions/import', payload),

  /**
   * Re-run the path rule on the server for keys the panel has rewritten. No
   * model, writes nothing. The rule lives in one place; the browser asks
   * rather than carrying a copy that would drift.
   */
  resolvePaths: (paths: { pathKey: string; questionCount: number }[]) =>
    api.post<PathProposal[]>('/questions/ai/resolve-paths', { paths }),
};

/**
 * Does ANY tab hold at least a header and one row? The fork in the upload
 * modal reads only the first tab, and a workbook whose first tab is a cover
 * sheet would otherwise be reported as empty — never offered the AI route
 * even though tab two is full of items.
 */
export async function workbookHasRows(file: File): Promise<boolean> {
  const { grids } = await readWorkbookForImport(file);
  return Object.values(grids).some(
    (grid) => grid.filter((row) => row.some((cell) => cell.trim() !== '')).length >= 2,
  );
}

export interface WorkbookForImport {
  /** What is SENT — one CSV per sheet. */
  sheets: SheetCsv[];
  /**
   * What is KEPT in the browser — each sheet as a grid, so the review panel can
   * show a real source row beside what was made of it. Never uploaded: the
   * comparison is local, and the sample is all the server needed.
   */
  grids: Record<string, string[][]>;
}

/** Every sheet in a workbook, as CSV and as a grid. Blank rows kept in both. */
export async function readWorkbookForImport(file: File): Promise<WorkbookForImport> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  const sheets: SheetCsv[] = [];
  const grids: Record<string, string[][]> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    sheets.push({
      name,
      // blankrows matters: a blank line is what ends the item table in a real
      // workbook, and the notes block below it is only recognisable by sitting
      // after one. Collapsing them would throw away the structure.
      csv: XLSX.utils.sheet_to_csv(ws, { FS: ',', blankrows: true }),
    });
    grids[name] = XLSX.utils
      .sheet_to_json<unknown[]>(ws, { header: 1, blankrows: true, defval: '' })
      .map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
  }
  return { sheets, grids };
}
