// Thin wrapper over lib/api.ts. All reads/writes go to the Go backend
// (Postgres); there is no localStorage fallback.

import {
  respondentsApi, practitionersApi, groupsApi,
  qualitiesApi, verticalsApi,
  type Respondent as ApiRespondent,
  type Practitioner as ApiPractitioner,
  type Group as ApiGroup,
  type MQ as ApiMQ,
  type MQT as ApiMQT,
  type Vertical as ApiVertical,
} from './api';

// ---- Re-export types in the names the UI code uses ----
export type StoredRespondent = ApiRespondent;
export type StoredPractitioner = ApiPractitioner;
export type Group = ApiGroup;
export type MQ = ApiMQ;
export type MQT = ApiMQT;
export type Vertical = ApiVertical;

// Legacy shape used by a handful of pages (sessions list, reports, etc.)
export interface StoredSession {
  id: string;
  respondentId?: string;
  respondent: string;
  instrument: string;
  instrumentFullName?: string;
  vertical: string;
  language: string;
  status: string;
  score?: string;
  createdAt: string;
  answers?: Record<string, number>;
  mqtScores?: Record<string, number>;
  completedAt?: string;
}

export interface StoredInstrument {
  id: string;
  name: string;
  shortName?: string;
  vertical: string;
  category?: string;
  description?: string;
  duration?: number | string;
  tier?: string | number;
  languages?: string[];
  mqs?: any[];
  questions?: any[];
  createdAt?: string;
  isDemo?: boolean;
}

// ---- Built-in verticals (not persisted — implicit on every deployment) ----
export const BUILT_IN_VERTICALS: Vertical[] = [
  { id: 'v-clinical', code: 'CLINICAL', name: 'Clinical', description: 'Clinical psychology assessments' },
  { id: 'v-industrial', code: 'INDUSTRIAL', name: 'Industrial', description: 'Industrial & organisational psychology' },
  { id: 'v-counselling', code: 'COUNSELLING', name: 'Counselling', description: 'Counselling & child psychology' },
  { id: 'v-experiments', code: 'EXPERIMENTS', name: 'Experiments', description: 'Designed experimental paradigms' },
];

// ---- Respondents ----
export async function getRespondents(): Promise<StoredRespondent[]> {
  try {
    return await respondentsApi.list();
  } catch (e) {
    console.error('getRespondents failed:', e);
    return [];
  }
}
export async function createRespondent(r: StoredRespondent): Promise<StoredRespondent | null> {
  try { return await respondentsApi.create(r); } catch (e) { console.error(e); return null; }
}
export async function updateRespondent(id: string, r: Partial<StoredRespondent>): Promise<StoredRespondent | null> {
  try { return await respondentsApi.update(id, r); } catch (e) { console.error(e); return null; }
}
export async function deleteRespondent(id: string): Promise<boolean> {
  try { await respondentsApi.delete(id); return true; } catch (e) { console.error(e); return false; }
}

// ---- Practitioners ----
export async function getPractitioners(): Promise<StoredPractitioner[]> {
  try { return await practitionersApi.list(); } catch (e) { console.error(e); return []; }
}
export async function createPractitioner(p: StoredPractitioner): Promise<StoredPractitioner | null> {
  try { return await practitionersApi.create(p); } catch (e) { console.error(e); return null; }
}
export async function updatePractitioner(id: string, p: Partial<StoredPractitioner>): Promise<StoredPractitioner | null> {
  try { return await practitionersApi.update(id, p); } catch (e) { console.error(e); return null; }
}
export async function deletePractitioner(id: string): Promise<boolean> {
  try { await practitionersApi.delete(id); return true; } catch (e) { console.error(e); return false; }
}

// ---- Groups ----
export async function getGroups(): Promise<Group[]> {
  try { return await groupsApi.list(); } catch (e) { console.error(e); return []; }
}
export async function createGroup(g: Group): Promise<Group | null> {
  try { return await groupsApi.create(g); } catch (e) { console.error(e); return null; }
}
export async function updateGroup(id: string, g: Partial<Group>): Promise<Group | null> {
  try { return await groupsApi.update(id, g); } catch (e) { console.error(e); return null; }
}
export async function deleteGroup(id: string): Promise<boolean> {
  try { await groupsApi.delete(id); return true; } catch (e) { console.error(e); return false; }
}

export function getAllMembersRecursive(groupId: string, groups: Group[]): string[] {
  const visited = new Set<string>();
  const members = new Set<string>();
  const walk = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    g.memberIds.forEach((m) => members.add(m));
    groups.filter((c) => c.parentId === id).forEach((c) => walk(c.id));
  };
  walk(groupId);
  return [...members];
}

// ---- Measured Qualities ----
export async function getMQs(): Promise<MQ[]> {
  try { return await qualitiesApi.list(); } catch (e) { console.error(e); return []; }
}
export async function createMQ(m: MQ): Promise<MQ | null> {
  try { return await qualitiesApi.create(m); } catch (e) { console.error(e); return null; }
}
export async function updateMQ(id: string, m: Partial<MQ>): Promise<MQ | null> {
  try { return await qualitiesApi.update(id, m); } catch (e) { console.error(e); return null; }
}
export async function deleteMQ(id: string): Promise<boolean> {
  try { await qualitiesApi.delete(id); return true; } catch (e) { console.error(e); return false; }
}

// ---- Verticals (built-in + user-created from DB) ----
export async function getVerticals(): Promise<Vertical[]> {
  try {
    const custom = await verticalsApi.list();
    const seen = new Set(BUILT_IN_VERTICALS.map((v) => v.code));
    const extra = custom.filter((v) => !seen.has(v.code));
    return [...BUILT_IN_VERTICALS, ...extra];
  } catch {
    return BUILT_IN_VERTICALS;
  }
}
export async function createVertical(v: Vertical): Promise<Vertical | null> {
  try { return await verticalsApi.create(v); } catch (e) { console.error(e); return null; }
}

// ---- Helpers kept for compatibility with callers ----
export function countByVertical<T extends { vertical?: string }>(items: T[], vertical: string): number {
  const t = vertical.toLowerCase();
  return items.filter((i) => String(i.vertical || '').toLowerCase() === t).length;
}

export function getSessions(): StoredSession[] {
  // Sessions aren't yet migrated off the demo scaffolding — kept as a stub
  // so existing Report pages don't break. Replace with a sessionsApi.list()
  // once the sessions write-path is moved off localStorage.
  return [];
}

export function getInstruments(): StoredInstrument[] {
  // Mirrors above — preserved for callers that still read questionnaires
  // from local storage until that path is migrated.
  return [];
}

export interface GeneratedReport {
  id: string;
  sessionId: string;
  respondent: string;
  instrument: string;
  vertical: 'Clinical' | 'Industrial' | 'Counselling';
  format: 'PDF' | 'Interactive';
  status: 'Draft' | 'Approved' | 'Finalized';
  generatedAt: string;
  diagnosticCodes: string[];
  riskFlag: boolean;
  riskNote?: string;
  mqtScores?: Record<string, number>;
}

export function sessionsToReports(
  _sessions: StoredSession[],
  _opts?: { vertical?: 'Clinical' | 'Industrial' | 'Counselling' },
): GeneratedReport[] {
  return [];
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getSessionById(_id: string): StoredSession | null { return null; }

export const STORAGE_KEYS = {} as const;
