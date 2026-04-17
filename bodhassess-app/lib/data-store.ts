// Unified client-side data store for BodhAssess demo data.
// All BodhAssess pages read from these helpers so Respondents, Practitioners,
// Sessions, and Instruments stay consistent across the app.

export interface StoredRespondent {
  id: string;
  name: string;
  email: string;
  dob?: string;
  sessions?: number;
  lastAssessment?: string;
  consent?: 'Granted' | 'Withdrawn' | 'Pending';
}

export interface StoredPractitioner {
  id: string;
  name: string;
  email: string;
  role: string;
  verticals: string[];
  status: 'Active' | 'Inactive';
  lastLogin: string;
}

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

export const STORAGE_KEYS = {
  respondents: 'bodhassess.respondents',
  practitioners: 'bodhassess.practitioners',
  sessions: 'bodhassess.sessions',
  deletedSeedSessions: 'bodhassess.deletedSeedSessions',
  instruments: 'bodhassess.instruments',
  instrumentOverrides: 'bodhassess.instrumentOverrides',
  itemOverrides: 'bodhassess.itemOverrides',
  deletedItems: 'bodhassess.deletedItems',
} as const;

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getRespondents(): StoredRespondent[] {
  const list = read<StoredRespondent[]>(STORAGE_KEYS.respondents, []);
  return Array.isArray(list) ? list : [];
}

export function saveRespondents(list: StoredRespondent[]): void {
  write(STORAGE_KEYS.respondents, list);
}

export function getPractitioners(): StoredPractitioner[] {
  const list = read<StoredPractitioner[]>(STORAGE_KEYS.practitioners, []);
  return Array.isArray(list) ? list : [];
}

export function savePractitioners(list: StoredPractitioner[]): void {
  write(STORAGE_KEYS.practitioners, list);
}

export function getSessions(): StoredSession[] {
  const list = read<StoredSession[]>(STORAGE_KEYS.sessions, []);
  return Array.isArray(list) ? list : [];
}

export function getInstruments(): StoredInstrument[] {
  const list = read<StoredInstrument[]>(STORAGE_KEYS.instruments, []);
  return Array.isArray(list) ? list : [];
}

export function countByVertical<T extends { vertical?: string }>(items: T[], vertical: string): number {
  const target = vertical.toLowerCase();
  return items.filter((i) => String(i.vertical || '').toLowerCase() === target).length;
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

function normalizeVerticalLabel(v: unknown): 'Clinical' | 'Industrial' | 'Counselling' | null {
  const s = String(v || '').toLowerCase();
  if (s.startsWith('clin')) return 'Clinical';
  if (s.startsWith('indust')) return 'Industrial';
  if (s.startsWith('coun')) return 'Counselling';
  return null;
}

// Trigger a client-side download of any serialisable object as pretty JSON.
// Used by Reports pages for the row-level Download action.
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

export function getSessionById(id: string): StoredSession | null {
  return getSessions().find((s) => s.id === id) || null;
}

// Turn completed sessions into report rows so Reports pages surface
// assessments finished by respondents (live) alongside seed data.
export function sessionsToReports(
  sessions: StoredSession[],
  opts?: { vertical?: 'Clinical' | 'Industrial' | 'Counselling' },
): GeneratedReport[] {
  const startingIndex = 200;
  const filtered = sessions.filter((s) => s.status === 'Completed');
  return filtered
    .map((s, i) => {
      const vertical = normalizeVerticalLabel(s.vertical);
      if (!vertical) return null;
      if (opts?.vertical && vertical !== opts.vertical) return null;
      const hasRiskInScore = typeof s.score === 'string' && /risk|flag|sui/i.test(s.score);
      return {
        id: `RPT-${String(startingIndex + i + 1).padStart(4, '0')}`,
        sessionId: s.id,
        respondent: s.respondent,
        instrument: s.instrumentFullName || s.instrument,
        vertical,
        format: 'Interactive',
        status: 'Draft',
        generatedAt: (s.completedAt || s.createdAt || '').slice(0, 10),
        diagnosticCodes: [],
        riskFlag: hasRiskInScore,
        riskNote: hasRiskInScore ? (s.score || undefined) : undefined,
        mqtScores: s.mqtScores,
      } as GeneratedReport;
    })
    .filter((r): r is GeneratedReport => r !== null);
}
