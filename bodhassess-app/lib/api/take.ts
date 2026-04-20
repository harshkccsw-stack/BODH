const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

async function takeFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
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

export interface TakeSession {
  id: string;
  status: string;
  language: string;
  started_at: string | null;
  current_item_index: number;
  theta_estimate: number;
  time_limit_minutes: number | null;
}

export interface TakeInstrument {
  name: string;
  short_name: string;
  duration_minutes: number | null;
  is_adaptive: boolean;
}

export interface TakeItemOption {
  text?: string;
  label?: string;
  value?: number | string;
  is_correct?: boolean;
  [k: string]: unknown;
}

export interface TakeItem {
  id: string;
  sub_domain: string | null;
  format: string;
  stem: string;
  options: TakeItemOption[] | Record<string, unknown> | null;
  sequence_order: number | null;
  clinical_risk_flag: boolean;
}

export interface TakeItemsResponse {
  session: TakeSession;
  instrument: TakeInstrument;
  items: TakeItem[];
}

export interface StartSessionResponse {
  id: string;
  status: string;
  started_at?: string;
}

export interface SaveResponseRequest {
  item_id: string;
  response_value: unknown;
  response_time_ms?: number;
  item_sequence?: number;
}

export interface SaveResponseResponse {
  id: string;
  saved_at: string;
  is_risk_flagged: boolean;
}

export interface CompleteSessionResponse {
  id: string;
  status: string;
  completed_at?: string;
  response_count: number;
  raw_score: number | null;
}

// --- API Functions ---

export async function getSessionItems(sessionId: string): Promise<TakeItemsResponse> {
  return takeFetch<TakeItemsResponse>(`/sessions/${sessionId}/items`);
}

export async function startSession(sessionId: string): Promise<StartSessionResponse> {
  return takeFetch<StartSessionResponse>(`/sessions/${sessionId}/start`, {
    method: 'POST',
  });
}

export async function saveResponse(
  sessionId: string,
  req: SaveResponseRequest,
): Promise<SaveResponseResponse> {
  return takeFetch<SaveResponseResponse>(`/sessions/${sessionId}/responses`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function completeSession(sessionId: string): Promise<CompleteSessionResponse> {
  return takeFetch<CompleteSessionResponse>(`/sessions/${sessionId}/complete`, {
    method: 'POST',
  });
}
