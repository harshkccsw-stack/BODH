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

export type UserRole =
  | 'PLATFORM_ADMIN'
  | 'TENANT_ADMIN'
  | 'SENIOR_PRACTITIONER'
  | 'PRACTITIONER'
  | 'BODHLENS_VIEWER'
  | 'RESPONDENT'
  | 'BPAAS_CLIENT';

export type Vertical = 'CLINICAL' | 'INDUSTRIAL' | 'COUNSELLING' | 'EXPERIMENTS' | 'WHITELABEL';

export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'mr' | 'kn' | 'bn' | 'gu' | 'ml' | 'or' | 'pa';

export interface Practitioner {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  verticals: Vertical[];
  primary_language: LanguageCode;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
}

export interface Respondent {
  id: string;
  email: string;
  name: string;
  primary_language: LanguageCode;
  date_of_birth: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreatePractitionerRequest {
  tenant_id?: string;
  email: string;
  name: string;
  role?: UserRole;
  verticals?: Vertical[];
  primary_language?: LanguageCode;
}

export interface CreateRespondentRequest {
  tenant_id?: string;
  email: string;
  name: string;
  primary_language?: LanguageCode;
  date_of_birth?: string;
}

export interface CreateUserResponse {
  id: string;
  email: string;
  name: string;
  role?: UserRole;
}

export interface SetActiveResponse {
  id: string;
  is_active: boolean;
}

// --- Endpoints ---

export async function getPractitioners(): Promise<{ data: Practitioner[]; total: number }> {
  const res = await apiFetch<ApiListResponse<Practitioner[]>>('/admin/practitioners');
  return { data: res.data ?? [], total: res.total ?? 0 };
}

export async function createPractitioner(body: CreatePractitionerRequest): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>('/admin/practitioners', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getRespondents(): Promise<{ data: Respondent[]; total: number }> {
  const res = await apiFetch<ApiListResponse<Respondent[]>>('/admin/respondents');
  return { data: res.data ?? [], total: res.total ?? 0 };
}

export async function createRespondent(body: CreateRespondentRequest): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>('/admin/respondents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function setUserActive(id: string, isActive: boolean): Promise<SetActiveResponse> {
  return apiFetch<SetActiveResponse>(`/admin/users/${id}/set-active`, {
    method: 'POST',
    body: JSON.stringify({ is_active: isActive }),
  });
}
