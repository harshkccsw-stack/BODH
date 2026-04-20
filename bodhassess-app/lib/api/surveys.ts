const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

async function surveyFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
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

export interface SurveyQuestion {
  text: string;
  type: string;
  [k: string]: unknown;
}

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  status: string;
  response_count: number;
  languages: string[];
  delivery_methods: string[];
  created_at: string;
}

export interface SurveyDetail extends Survey {
  tenant_id: string;
  created_by: string;
  questions: SurveyQuestion[] | unknown;
  updated_at: string;
}

export interface SurveyResponse {
  id: string;
  respondent_identifier: string | null;
  answers: unknown;
  submitted_at: string;
}

export interface CreateSurveyRequest {
  tenant_id?: string;
  created_by?: string;
  title: string;
  description?: string;
  questions?: SurveyQuestion[];
  languages?: string[];
  delivery_methods?: string[];
}

export interface CreateSurveyResponse {
  id: string;
  title: string;
  status: string;
}

export interface PublishSurveyResponse {
  id: string;
  status: string;
}

export interface SubmitResponseRequest {
  respondent_identifier?: string;
  answers: unknown[];
}

export interface SubmitResponseResponse {
  id: string;
  submitted_at: string;
}

interface ListEnvelope<T> {
  data: T[];
  total: number;
}

// --- API Functions ---

export async function listSurveys(status?: string): Promise<Survey[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await surveyFetch<ListEnvelope<Survey>>(`/surveys${qs}`);
  return res.data;
}

export async function createSurvey(req: CreateSurveyRequest): Promise<CreateSurveyResponse> {
  return surveyFetch<CreateSurveyResponse>('/surveys', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function getSurvey(id: string): Promise<SurveyDetail> {
  return surveyFetch<SurveyDetail>(`/surveys/${id}`);
}

export async function publishSurvey(id: string): Promise<PublishSurveyResponse> {
  return surveyFetch<PublishSurveyResponse>(`/surveys/${id}/publish`, {
    method: 'POST',
  });
}

export async function submitSurveyResponse(
  id: string,
  req: SubmitResponseRequest,
): Promise<SubmitResponseResponse> {
  return surveyFetch<SubmitResponseResponse>(`/surveys/${id}/responses`, {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function listSurveyResponses(id: string): Promise<SurveyResponse[]> {
  const res = await surveyFetch<ListEnvelope<SurveyResponse>>(`/surveys/${id}/responses`);
  return res.data;
}
