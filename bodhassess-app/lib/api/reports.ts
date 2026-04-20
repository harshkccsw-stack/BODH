const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

interface ApiListResponse<T> {
  data: T;
  total?: number;
  error?: string;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error: ${res.status}`);
  }

  return res.json();
}

// --- Types ---

export interface ReportScores {
  raw?: number;
  t_score?: number;
  item_count?: number;
  percentile?: number;
  subscales?: Record<string, number>;
  [key: string]: unknown;
}

export interface ReportRiskIndicators {
  flagged_count?: number;
  [key: string]: unknown;
}

export interface ReportNarrativeSections {
  summary?: string;
  [key: string]: unknown;
}

export type ReportStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'FINALIZED';

export interface ReportListItem {
  id: string;
  session_id: string;
  vertical: string;
  report_type: string;
  status: ReportStatus;
  scores: ReportScores | null;
  norm_group: string | null;
  diagnostic_codes: string[];
  created_at: string;
  respondent_name: string;
  instrument_short: string | null;
  instrument_name: string;
}

export interface ReportDetail extends ReportListItem {
  risk_indicators: ReportRiskIndicators | null;
  narrative_sections: ReportNarrativeSections | null;
  reviewed_at: string | null;
  finalized_at: string | null;
}

export interface GenerateReportResponse {
  id: string;
  session_id: string;
  status: ReportStatus;
  scores: ReportScores;
}

export interface ReportListParams {
  vertical?: string;
  status?: string;
  session_id?: string;
}

// --- Endpoints ---

export async function getReports(params?: ReportListParams): Promise<{ data: ReportListItem[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.vertical) query.set('vertical', params.vertical);
  if (params?.status) query.set('status', params.status);
  if (params?.session_id) query.set('session_id', params.session_id);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch<ApiListResponse<ReportListItem[]>>(`/reports${qs}`);
  return { data: res.data ?? [], total: res.total ?? 0 };
}

export async function getReport(id: string): Promise<ReportDetail> {
  return apiFetch<ReportDetail>(`/reports/${id}`);
}

export async function generateReport(sessionId: string): Promise<GenerateReportResponse> {
  return apiFetch<GenerateReportResponse>('/reports/generate', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}
