// Pure helpers for practitioner/admin auth. Lives in its own module (no JSX
// exports) so Vite Fast Refresh can hot-reload the Provider component without
// "incompatible exports" warnings.

import { config } from '@/lib/config';
import type { PractitionerMe } from '@/lib/api';

const TOKEN_KEY = config.practitionerAuthStorageKey;
const ADMIN_TOKEN_KEY = config.adminAuthStorageKey;

export const LOGIN_PATH = '/login';

// Paths that are always accessible (login, public marketing, the respondent
// portal which has its own auth, and the legacy register page). The
// dashboard guard skips authentication checks for these.
const PUBLIC_PREFIXES = ['/login', '/portal', '/register', '/select-vertical'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Match a pathname against one of the role.url_paths patterns.
//   "/*"           → matches everything
//   "/admin/*"     → matches "/admin", "/admin/foo", "/admin/foo/bar"
//   "/dashboard"   → exact match only
export function pathMatchesPattern(pathname: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === '/*' || pattern === '*') return true;
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2);
    return pathname === base || pathname.startsWith(base + '/');
  }
  return pathname === pattern;
}

export function canAccess(pathname: string, urlPaths: string[]): boolean {
  if (isPublicPath(pathname)) return true;
  return urlPaths.some((p) => pathMatchesPattern(pathname, p));
}

// ---- Token helpers (safe in SSR — guard window) -------------------------

export function getPractitionerToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setPractitionerToken(token: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearPractitionerToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
}

// Admin uses the same dashboard shell. Stored under a distinct key so we
// can support practitioner ↔ admin re-login without one stomping the other.
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

// Synthesize a PractitionerMe-shaped object for an admin so the rest of
// the dashboard (which is built around PractitionerMe) "just works".
// `url_paths: ['/*']` grants access to every route via canAccess().
export function adminAsPractitionerMe(username: string): PractitionerMe {
  return {
    id: username,
    name: 'Administrator',
    email: `${username}@admin.local`,
    roles: ['Admin'],
    verticals: [],
    status: 'Active',
    url_paths: ['/*'],
  };
}
