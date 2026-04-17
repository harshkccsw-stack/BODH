const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

interface ApiResponse<T> {
  data: T;
  total?: number;
  error?: string;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
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

// --- Instruments ---
export interface Instrument {
  id: string;
  name: string;
  short_name: string | null;
  vertical: string;
  category: string | null;
  item_count: number;
  duration_minutes: number | null;
  languages: string[];
  tier_required: string;
  is_adaptive: boolean;
  is_fixed_sequence: boolean;
  norm_status: string;
  age_range: string | null;
  is_published: boolean;
  created_at: string;
}

export async function getInstruments(vertical?: string): Promise<Instrument[]> {
  const query = vertical ? `?vertical=${vertical}` : '';
  const res = await apiFetch<Instrument[]>(`/instruments${query}`);
  return res.data;
}

export async function getInstrument(id: string): Promise<Instrument> {
  const res = await apiFetch<Instrument>(`/instruments/${id}`);
  return res as unknown as Instrument;
}

// --- Sessions ---
export interface Session {
  id: string;
  vertical: string;
  language: string;
  status: string;
  is_proctored: boolean;
  trust_score: number | null;
  theta_estimate: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  respondent_name: string;
  instrument_name: string | null;
}

export async function getSessions(params?: { vertical?: string; status?: string }): Promise<Session[]> {
  const query = new URLSearchParams();
  if (params?.vertical) query.set('vertical', params.vertical);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await apiFetch<Session[]>(`/sessions${qs}`);
  return res.data;
}

export interface CreateSessionRequest {
  tenant_id: string;
  practitioner_id: string;
  respondent_id: string;
  instrument_id: string;
  consent_id: string;
  vertical: string;
  language: string;
  is_proctored: boolean;
}

export async function createSession(req: CreateSessionRequest): Promise<{ id: string; status: string; message: string }> {
  const res = await apiFetch<{ id: string; status: string; message: string }>('/sessions', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return res as unknown as { id: string; status: string; message: string };
}

// --- Health ---
export interface HealthStatus {
  status: string;
  service: string;
  version: string;
  database: boolean;
  time: string;
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await apiFetch<HealthStatus>('/health');
  return res as unknown as HealthStatus;
}
