// Client-side override store for instrument library edits.
// Keyed by instrument shortName (preferred) or name. Applied on top of the
// hardcoded catalog on each library page so edits persist across reloads.

export interface InstrumentOverride {
  name?: string;
  shortName?: string;
  category?: string;
  duration?: string;
  items?: number;
  tier?: number;
  languages?: string[];
  normStatus?: string;
  description?: string;
  ageRange?: string;
  norms?: string;
  vertical?: string;
}

const KEY = 'bodhassess.instrumentOverrides';

export function loadOverrides(): Record<string, InstrumentOverride> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOverride(key: string, patch: InstrumentOverride): Record<string, InstrumentOverride> {
  const all = loadOverrides();
  all[key] = { ...(all[key] || {}), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  return all;
}

export function applyOverride<T extends { name: string; shortName?: string }>(
  inst: T,
  overrides: Record<string, InstrumentOverride>,
): T {
  const o = overrides[inst.shortName || inst.name] || overrides[inst.name];
  if (!o) return inst;
  return { ...inst, ...o } as T;
}

export function applyOverrideById<T extends { id: string }>(
  inst: T,
  overrides: Record<string, InstrumentOverride>,
): T {
  const o = overrides[inst.id];
  if (!o) return inst;
  return { ...inst, ...o } as T;
}
