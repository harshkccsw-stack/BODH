import { api } from '@/lib/apiClient';

/**
 * Data Studio's api file.
 *
 * Everything here mirrors the backend DTOs one-to-one — same field names, same
 * shapes — so a change on either side shows up as a type error rather than as
 * a silently blank column. That is why the ids are `dsWorkbookId` and
 * `dsSheetId` rather than a tidied-up `id`: a translation layer here would be
 * one more place for the two sides to drift apart without anything failing.
 *
 * The old Data Studio spoke to the previous Spring codebase through
 * `lib/api.ts` (`/api/v1`, no Authorization header). This goes through the
 * shared `apiClient`, which attaches the dashboard bearer — Data Studio needs
 * it, because every workbook is owned by a specific user and an anonymous
 * call is answered 401 rather than served.
 */

/* ------------------------------------------------------------------ */
/* Shared grid envelope                                                */
/* ------------------------------------------------------------------ */

/**
 * Matches DsDatasetResponse.Column on the backend.
 *
 * The backend declares its own columns, which is the whole point: an
 * assessment that measures six new traits gains six columns here with no
 * frontend change at all.
 *
 * `key` carries its family as a prefix — `core:`, `demo:`, `ans:`, `mqt:` (a
 * trait's own score), `mqtt:` (that trait plus its subtree), `mq:` (a measured
 * quality's total), `calc:` (a computed column) — which is what keeps a
 * demographic field called "Age" from colliding with a trait called "Age".
 */
export interface DsDatasetColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'datetime' | 'enum';
  group:
    | 'core'
    | 'demographics'
    | 'answers'
    | 'scores'
    | 'derived'
    | 'dimension'
    | 'measure';
  options?: string[] | null;
}

/** One row. `rowId` is the allotment id — a row IS one respondent's attempt. */
export type DsDatasetRow = Record<string, unknown> & { rowId: number };

/** Matches DsDatasetResponse on the backend. */
export interface DsDataset {
  view: string;
  columns: DsDatasetColumn[];
  rows: DsDatasetRow[];
  rowCount: number;
}

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

/** The caller's rights on a workbook, computed per request by the backend. */
export type DsAccess = 'ADMIN' | 'OWNER' | 'EDITOR' | 'VIEWER' | 'NONE';

/** Matches DsColumnResponse on the backend. */
export interface DsDerivedColumn {
  dsDerivedColumnId: number;
  /** Stable identity other formulas reference. Never changes on a rename. */
  colKey: string;
  label: string;
  expr: string;
  /** Where the formula COULD run cheaply — the server computes it either way. */
  evalTarget: 'CLIENT' | 'SERVER';
  resultType: 'number' | 'string' | 'boolean';
  format?: string | null;
  sortOrder: number;
}

/**
 * Matches DsSheetResponse on the backend. `sourceFilters` is the binding:
 * `{ assessmentId }`, optionally with `organizationId` to narrow to one org.
 */
export interface DsSheet {
  dsSheetId: number;
  dsWorkbookId: number;
  name: string;
  sourceView: string;
  sourceFilters: Record<string, unknown>;
  grain: string;
  displayState: Record<string, unknown>;
  sortOrder: number;
  derivedColumns: DsDerivedColumn[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Matches DsShareResponse on the backend. */
export interface DsShare {
  dsWorkbookShareId: number;
  sharedWithUserId: number;
  sharedWithEmail: string;
  role: 'EDITOR' | 'VIEWER';
  grantedByUserId: number;
  createdAt?: string | null;
}

export type DsWidgetType = 'CHART' | 'KPI' | 'TABLE' | 'PIVOT' | 'TEXT';

/** Matches DsWidgetResponse on the backend. `config` is ours to shape. */
export interface DsWidget {
  dsWidgetId: number;
  dsDashboardId: number;
  type: DsWidgetType;
  dsSheetId?: number | null;
  config: Record<string, unknown>;
  posX?: number | null;
  posY?: number | null;
  w?: number | null;
  h?: number | null;
  sortOrder: number;
}

/** Matches DsDashboardResponse on the backend. */
export interface DsDashboard {
  dsDashboardId: number;
  dsWorkbookId: number;
  name: string;
  layout: Record<string, unknown>;
  sortOrder: number;
  widgets: DsWidget[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Matches DsWorkbookResponse on the backend. The gallery listing sends empty
 * child arrays and relies on the counts; `getWorkbook` fills them in.
 */
export interface DsWorkbook {
  dsWorkbookId: number;
  name: string;
  description?: string | null;
  ownerUserId: number;
  ownerEmail: string;
  access: DsAccess;
  sheetCount: number;
  dashboardCount: number;
  sheets: DsSheet[];
  dashboards: DsDashboard[];
  shares: DsShare[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Matches DsExprResponse on the backend. Never an error — see `errors`. */
export interface DsExprResult {
  ok: boolean;
  evalTarget: 'CLIENT' | 'SERVER';
  resultType: 'number' | 'string' | 'boolean';
  errors: string[];
  referencedColumns: string[];
  functions: string[];
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

/**
 * Matches DsQueryRequest.Measure. `count` counts rows in the group including
 * blanks; `countv` counts only the rows that produced a number — on this
 * dataset the two differ by exactly the unfinished attempts.
 */
export interface DsMeasure {
  expr: string;
  agg?: 'sum' | 'avg' | 'count' | 'countv' | 'min' | 'max' | 'median' | 'p25' | 'p50' | 'p75';
  label?: string;
}

/** Matches DsQueryRequest.Filter. */
export interface DsFilter {
  colKey: string;
  op: '=' | '!=' | '<' | '<=' | '>' | '>=' | 'contains';
  value: unknown;
}

/**
 * Matches DsQueryRequest.
 *
 * Pass `dsSheetId` wherever possible: querying a SHEET means its computed
 * columns exist, so a chart can group by or measure a formula the analyst
 * wrote. `sourceFilters` alone queries the raw dataset, where those columns
 * do not exist.
 */
export interface DsQuery {
  dsSheetId?: number;
  sourceFilters?: Record<string, unknown>;
  dimensions?: string[];
  measures: DsMeasure[];
  filters?: DsFilter[];
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Assessment picker                                                   */
/* ------------------------------------------------------------------ */

/**
 * The subset of AssessmentResponse the "new sheet" picker needs. A sheet is
 * bound to exactly one assessment, so this is the first thing the dialog asks
 * for.
 */
export interface DsAssessmentOption {
  assessmentId: number;
  name: string;
  questionnaireName: string;
  respondentCount: number;
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

const BASE = '/data-studio';

export const dataStudioApis = {
  // ── Workbooks ──────────────────────────────────────────────────────
  listWorkbooks: async (): Promise<DsWorkbook[]> =>
    (await api.get<DsWorkbook[]>(`${BASE}/workbooks/getAll`)).data,

  getWorkbook: async (id: number): Promise<DsWorkbook> =>
    (await api.get<DsWorkbook>(`${BASE}/workbooks/getById/${id}`)).data,

  createWorkbook: async (body: { name: string; description?: string }): Promise<DsWorkbook> =>
    (await api.post<DsWorkbook>(`${BASE}/workbooks/create`, body)).data,

  updateWorkbook: async (
    id: number,
    body: { name: string; description?: string },
  ): Promise<DsWorkbook> =>
    (await api.put<DsWorkbook>(`${BASE}/workbooks/update/${id}`, body)).data,

  deleteWorkbook: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/workbooks/delete/${id}`);
  },

  // ── Sharing (owner only) ───────────────────────────────────────────
  // The same call grants and re-roles: "share with X as VIEWER" means the
  // same thing whether or not X is already an EDITOR.
  addShare: async (
    id: number,
    body: { sharedWithUserId: number; role: 'EDITOR' | 'VIEWER' },
  ): Promise<DsShare> =>
    (await api.post<DsShare>(`${BASE}/workbooks/${id}/shares/create`, body)).data,

  removeShare: async (id: number, sharedWithUserId: number): Promise<void> => {
    await api.delete(`${BASE}/workbooks/${id}/shares/delete/${sharedWithUserId}`);
  },

  // ── Sheets ─────────────────────────────────────────────────────────
  createSheet: async (
    workbookId: number,
    body: { name: string; sourceFilters: Record<string, unknown> },
  ): Promise<DsSheet> =>
    (await api.post<DsSheet>(`${BASE}/sheets/create/${workbookId}`, body)).data,

  getSheet: async (id: number): Promise<DsSheet> =>
    (await api.get<DsSheet>(`${BASE}/sheets/getById/${id}`)).data,

  /** Live rows with every computed column already evaluated server-side. */
  getSheetData: async (id: number): Promise<DsDataset> =>
    (await api.get<DsDataset>(`${BASE}/sheets/getData/${id}`)).data,

  updateSheet: async (
    id: number,
    body: {
      name?: string;
      sourceFilters?: Record<string, unknown>;
      displayState?: Record<string, unknown>;
      sortOrder?: number;
    },
  ): Promise<DsSheet> => (await api.put<DsSheet>(`${BASE}/sheets/update/${id}`, body)).data,

  /** 409 while a dashboard widget still binds to this sheet. */
  deleteSheet: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/sheets/delete/${id}`);
  },

  // ── Computed columns ───────────────────────────────────────────────
  validateExpr: async (sheetId: number, expr: string): Promise<DsExprResult> =>
    (await api.post<DsExprResult>(`${BASE}/sheets/${sheetId}/validate-expr`, { expr })).data,

  addColumn: async (
    sheetId: number,
    body: { label: string; expr: string; evalTarget?: string; format?: string },
  ): Promise<DsDerivedColumn> =>
    (await api.post<DsDerivedColumn>(`${BASE}/sheets/${sheetId}/columns/create`, body)).data,

  /** Edits label / formula / format. The colKey never changes. */
  updateColumn: async (
    sheetId: number,
    colKey: string,
    body: { label: string; expr: string; evalTarget?: string; format?: string },
  ): Promise<DsDerivedColumn> =>
    (
      await api.put<DsDerivedColumn>(`${BASE}/sheets/${sheetId}/columns/update`, body, {
        params: { colKey },
      })
    ).data,

  deleteColumn: async (sheetId: number, colKey: string): Promise<void> => {
    await api.delete(`${BASE}/sheets/${sheetId}/columns/delete`, { params: { colKey } });
  },

  // ── Dashboards + widgets ───────────────────────────────────────────
  createDashboard: async (workbookId: number, body: { name: string }): Promise<DsDashboard> =>
    (await api.post<DsDashboard>(`${BASE}/dashboards/create/${workbookId}`, body)).data,

  getDashboard: async (id: number): Promise<DsDashboard> =>
    (await api.get<DsDashboard>(`${BASE}/dashboards/getById/${id}`)).data,

  updateDashboard: async (
    id: number,
    body: { name?: string; layout?: Record<string, unknown> },
  ): Promise<DsDashboard> =>
    (await api.put<DsDashboard>(`${BASE}/dashboards/update/${id}`, body)).data,

  deleteDashboard: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/dashboards/delete/${id}`);
  },

  addWidget: async (
    dashboardId: number,
    body: {
      type: DsWidgetType;
      dsSheetId?: number | null;
      config?: Record<string, unknown>;
      w?: number;
      sortOrder?: number;
    },
  ): Promise<DsWidget> => {
    // The REQUEST field is `sheetId` while the RESPONSE field is `dsSheetId`
    // — the one place the two sides differ. Translated here, and `dsSheetId`
    // is destructured out rather than spread, so nothing unknown is sent.
    const { dsSheetId, ...rest } = body;
    return (
      await api.post<DsWidget>(`${BASE}/dashboards/${dashboardId}/widgets/create`, {
        ...rest,
        sheetId: dsSheetId ?? null,
      })
    ).data;
  },

  updateWidget: async (
    id: number,
    body: {
      dsSheetId?: number | null;
      config?: Record<string, unknown>;
      w?: number;
      h?: number;
      sortOrder?: number;
    },
  ): Promise<DsWidget> => {
    // Every omitted field means "leave it alone" on the backend, so a resize
    // must not accidentally carry a null sheetId and unbind the tile.
    const { dsSheetId, ...rest } = body;
    return (
      await api.put<DsWidget>(`${BASE}/widgets/update/${id}`, {
        ...rest,
        ...(dsSheetId == null ? {} : { sheetId: dsSheetId }),
      })
    ).data;
  },

  deleteWidget: async (id: number): Promise<void> => {
    await api.delete(`${BASE}/widgets/delete/${id}`);
  },

  // ── Reads that are not about a saved definition ────────────────────
  /** Grouped aggregation — every KPI, chart and pivot is one of these. */
  query: async (body: DsQuery): Promise<DsDataset> =>
    (await api.post<DsDataset>(`${BASE}/query`, body)).data,

  /** The raw grid for one assessment, before any sheet exists. */
  getDataset: async (assessmentId: number, organizationId?: number): Promise<DsDataset> =>
    (
      await api.get<DsDataset>(`${BASE}/dataset/${assessmentId}`, {
        params: organizationId == null ? undefined : { organizationId },
      })
    ).data,

  /** The "new sheet" dialog's assessment picker. */
  listAssessments: async (): Promise<DsAssessmentOption[]> =>
    (await api.get<DsAssessmentOption[]>('/assessments/getAll')).data,
};

/**
 * The one way this section reads an error.
 *
 * Axios puts the useful text in `response.data.message` (every backend error
 * body is `{"message": ...}`); `error.message` is "Request failed with status
 * code 409", which tells a user nothing. Reaching for `e instanceof Error`
 * first — as the pre-axios version of these pages did — hits that useless
 * string every time.
 */
export function dsError(e: unknown, fallback: string): string {
  const withResponse = e as { response?: { data?: { message?: string } }; message?: string };
  return withResponse?.response?.data?.message || withResponse?.message || fallback;
}
