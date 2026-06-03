// Pure helpers for practitioner/admin auth. Lives in its own module (no JSX
// exports) so Vite Fast Refresh can hot-reload the Provider component without
// "incompatible exports" warnings.

import { config } from '@/lib/config';
import type { AuthUser, PractitionerMe } from '@/lib/api';

// One dashboard session token. Both super admins and practitioners now
// authenticate through /auth, so there is a single token slot.
const TOKEN_KEY = config.practitionerAuthStorageKey;

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

export function getDashboardToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setDashboardToken(token: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearDashboardToken() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
}

// Adapt the unified /auth identity onto the PractitionerMe shape the dashboard
// is built around. RBAC (roles + url_paths) comes straight from /auth; a super
// admin carries `url_paths: ['/*']` which grants every route via canAccess().
export function authUserToPractitionerMe(user: AuthUser): PractitionerMe {
  return {
    id: user.id,
    name: user.name || (user.isSuperAdmin ? 'Administrator' : user.email),
    email: user.email,
    roles: user.roles ?? (user.isSuperAdmin ? ['SUPER_ADMIN'] : []),
    verticals: [],
    status: 'Active',
    url_paths: user.url_paths ?? (user.isSuperAdmin ? ['/*'] : []),
  };
}
