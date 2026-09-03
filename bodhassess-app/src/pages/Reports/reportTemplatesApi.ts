import { api } from '@/lib/apiClient';

/**
 * Report templates — the HTML layout a report is rendered from, and the
 * checklist of ${tag} placeholders inside it.
 *
 * Rooted at /api/report-templates and deliberately NOT under /api/reports,
 * which the respondent-listing and XLSX-export endpoints already own.
 */

/** Matches ReportTemplate's status constants on the backend. */
export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * Matches ReportTagBinding's type constants. UNBOUND / CORE / LITERAL work
 * today; the rest need the scoring engine and the backend refuses them with
 * an explanation, so the UI shows them disabled rather than hiding them.
 */
export type BinderType =
  | 'UNBOUND'
  | 'CORE'
  | 'LITERAL'
  | 'VALUE'
  | 'NARRATIVE'
  | 'TABLE'
  | 'CHART';

export const IMPLEMENTED_BINDERS: BinderType[] = ['CORE', 'LITERAL'];

/** Matches ReportTemplateResponse.TagBinding on the backend. */
export interface TagBinding {
  reportTagBindingId: number | null;
  tag: string;
  binderType: BinderType;
  coreField: string | null;
  literalText: string | null;
  format: string | null;
  fallbackText: string | null;
  authorNote: string | null;
  sortOrder: number;
  bound: boolean;
}

/** Matches ReportTemplateResponse.LintFinding on the backend. */
export interface LintFinding {
  severity: 'ERROR' | 'WARN';
  rule: string;
  message: string;
}

/**
 * Matches ReportTemplateResponse on the backend. `html` is null in the
 * library listing — twenty templates each carrying a base64 logo is megabytes
 * of payload nothing on that screen reads.
 */
export interface ReportTemplateResponse {
  reportTemplateId: number;
  name: string;
  description: string | null;
  html: string | null;
  status: TemplateStatus;
  version: number;
  organizationId: number | null;
  tagCount: number;
  boundCount: number;
  publishable: boolean;
  bindings: TagBinding[];
  lint: LintFinding[];
  createdAt: string;
  updatedAt: string;
}

/** Matches ReportTemplateRequest on the backend. */
export interface ReportTemplatePayload {
  name: string;
  description?: string | null;
  html: string;
  organizationId?: number | null;
}

/** Matches ReportTagBindingRequest on the backend. */
export interface TagBindingPayload {
  binderType: BinderType;
  coreField?: string | null;
  literalText?: string | null;
  format?: string | null;
  fallbackText?: string | null;
  authorNote?: string | null;
}

const ROOT = '/report-templates';

export const reportTemplatesApi = {
  getAll: async (): Promise<ReportTemplateResponse[]> =>
    (await api.get(`${ROOT}/getAll`)).data,

  getById: async (id: number): Promise<ReportTemplateResponse> =>
    (await api.get(`${ROOT}/getById/${id}`)).data,

  /**
   * The CORE dropdown, as `key -> label`. Served by the backend so this list
   * can never drift from the validator that refuses an unknown key.
   */
  coreFields: async (): Promise<Record<string, string>> =>
    (await api.get(`${ROOT}/coreFields`)).data,

  create: async (payload: ReportTemplatePayload): Promise<ReportTemplateResponse> =>
    (await api.post(`${ROOT}/create`, payload)).data,

  update: async (id: number, payload: ReportTemplatePayload): Promise<ReportTemplateResponse> =>
    (await api.put(`${ROOT}/update/${id}`, payload)).data,

  /** Answer one tag. The tag is addressed, never created — the HTML owns it. */
  bindTag: async (
    id: number,
    tag: string,
    payload: TagBindingPayload,
  ): Promise<ReportTemplateResponse> =>
    (await api.put(`${ROOT}/bindTag/${id}/${encodeURIComponent(tag)}`, payload)).data,

  /** Refuses unanswered tags and any lint ERROR, both as a 409. */
  publish: async (id: number): Promise<ReportTemplateResponse> =>
    (await api.post(`${ROOT}/publish/${id}`)).data,

  /**
   * Edit a published template: copies it to a new DRAFT version, carrying the
   * tag answers across. A published template is frozen so reports already
   * delivered from it keep meaning what they said, so this is the only way to
   * change one.
   */
  newVersion: async (id: number): Promise<ReportTemplateResponse> =>
    (await api.post(`${ROOT}/newVersion/${id}`)).data,

  delete: async (id: number): Promise<void> => {
    await api.delete(`${ROOT}/delete/${id}`);
  },

  /**
   * Preview PDF as a blob URL. Goes through the api client rather than a bare
   * <iframe src> because the endpoint needs the Authorization header, which an
   * iframe cannot send. The caller must revokeObjectURL when done.
   */
  previewPdfUrl: async (id: number): Promise<string> => {
    const res = await api.get(`${ROOT}/preview/${id}.pdf`, { responseType: 'blob' });
    return URL.createObjectURL(res.data as Blob);
  },

  previewHtml: async (id: number): Promise<string> =>
    (await api.get(`${ROOT}/preview/${id}.html`, { responseType: 'text' })).data,
};

/** The starter a new template opens with. */
export const STARTER_HTML = `<html>
<head>
<meta charset="utf-8"/>
<style>
  /* CSS 2.1 only — no flexbox, no grid, no JavaScript. */
  @page {
    size: A4;
    margin: 18mm 15mm 20mm 15mm;
    /* A margin box does NOT inherit body's font. Without this the page
       number renders in an unembedded font. */
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Noto Sans Devanagari"; font-size: 8pt; color: #888;
    }
  }
  body { font-family: "Noto Sans Devanagari"; font-size: 10pt; color: #222; }
  h1 { font-size: 15pt; color: #2b5c8a; margin: 0 0 4px; }
  h2 { font-size: 12pt; color: #2b5c8a; border-bottom: 1px solid #d5dde5;
       padding-bottom: 3px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  td { padding: 4px 6px; border: 1px solid #cfd9e3; }
  td.k { color: #666; width: 38%; }
</style>
</head>
<body>

  <h1>\${reportTitle}</h1>

  <h2>Respondent</h2>
  <table>
    <tr><td class="k">Name</td><td>\${respondentName}</td></tr>
    <tr><td class="k">Date of birth</td><td>\${dateOfBirth}</td></tr>
    <tr><td class="k">Organization</td><td>\${organization}</td></tr>
    <tr><td class="k">Report date</td><td>\${reportDate}</td></tr>
  </table>

  <h2>Notes</h2>
  <p>\${disclaimer}</p>

</body>
</html>
`;
