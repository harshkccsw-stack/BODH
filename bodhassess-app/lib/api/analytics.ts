const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

async function analyticsFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
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

export interface AnalyticsOverview {
  total_sessions: number;
  completed_sessions: number;
  in_progress: number;
  completion_rate: number;
  total_reports: number;
  total_respondents: number;
  total_instruments: number;
  risk_flagged_responses: number;
  avg_completion_minutes: number;
}

export interface SessionsByVerticalRow {
  vertical: string;
  total: number;
  completed: number;
}

export interface SessionsTimeseriesRow {
  day: string;
  total: number;
  completed: number;
}

interface Wrapped<T> {
  data: T;
}

// --- API Functions ---

export async function getAnalyticsOverview(vertical?: string): Promise<AnalyticsOverview> {
  const qs = vertical ? `?vertical=${encodeURIComponent(vertical)}` : '';
  const res = await analyticsFetch<Wrapped<AnalyticsOverview>>(`/analytics/overview${qs}`);
  return res.data;
}

export async function getSessionsByVertical(): Promise<SessionsByVerticalRow[]> {
  const res = await analyticsFetch<Wrapped<SessionsByVerticalRow[]>>(
    `/analytics/sessions-by-vertical`,
  );
  return res.data;
}

export async function getSessionsTimeseries(days: number = 30): Promise<SessionsTimeseriesRow[]> {
  const res = await analyticsFetch<Wrapped<SessionsTimeseriesRow[]>>(
    `/analytics/sessions-timeseries?days=${days}`,
  );
  return res.data;
}
