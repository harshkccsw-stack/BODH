// Pure helpers for practitioner/admin auth. Lives in its own module (no JSX
// exports) so Vite Fast Refresh can hot-reload the Provider component without
// "incompatible exports" warnings.

import { config } from '@/lib/config';
import type { AuthUser, PractitionerMe } from '@/lib/authApis';

// One dashboard session token. Both super admins and practitioners now
// authenticate through /auth, so there is a single token slot.
const TOKEN_KEY = config.practitionerAuthStorageKey;

export const LOGIN_PATH = '/login';

// Paths that are always accessible (login, public marketing, the respondent
// portal which has its own auth, the legacy register page, and the entity
// member self-registration links under /entity/:id/register). The dashboard
// guard skips authentication checks for these.
const PUBLIC_PREFIXES = ['/login', '/portal', '/register', '/select-vertical', '/entity'];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

// Where a signed-in user lands, and where "you don't have access" sends them.
export const DASHBOARD_PATH = '/dashboard';
export const PERMISSION_ERROR_PATH = '/permission-error';

// Managing roles is not a grantable page — it is the thing that grants pages.
// Anyone holding /admin/* would otherwise inherit the ability to widen their
// own access, so these three are reserved for super admins no matter what a
// role says, and the page catalog never offers them.
//
// This is a navigation rule, not a security boundary: the API itself is still
// unauthenticated, so it only closes properly when the JWT filter lands.
export const SUPERADMIN_ONLY_PATHS = [
  '/admin/permissions',
  '/admin/role-groups',
  '/admin/assign-role-group',
  // The activity log records which respondents took which assessments, and
  // who looked at them — stricter than the rest of the dashboard by some
  // margin. The API enforces this independently, so this line controls the
  // sidebar and the route, not the data.
  '/admin/activity-log',
];

export function isSuperAdminOnlyPath(pathname: string): boolean {
  return SUPERADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
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

export function canAccess(
  pathname: string,
  urlPaths: string[],
  isSuperAdmin = false,
): boolean {
  if (isPublicPath(pathname)) return true;
  // The denial screen itself must never be deniable, or it redirects to
  // itself forever. Same reason /dashboard is always open: it is where the
  // "Return to dashboard" button goes, and the backend grants it to every
  // dashboard user anyway — this is the belt to that braces.
  if (pathname === PERMISSION_ERROR_PATH || pathname === DASHBOARD_PATH) return true;
  if (isSuperAdminOnlyPath(pathname)) return isSuperAdmin;
  if (isSuperAdmin) return true;
  return urlPaths.some((p) => pathMatchesPattern(pathname, p));
}

// ---- Token helpers (safe in SSR — guard window) -------------------------

export function getDashboardToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setDashboardToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearDashboardToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
}

// Adapt the unified /auth identity onto the PractitionerMe shape the dashboard
// is built around. url_paths arrives already resolved: the backend expands a
// super admin to ['/*'] and unions /dashboard into everyone else, so nothing
// is re-derived here.
export function authUserToPractitionerMe(user: AuthUser): PractitionerMe {
  return {
    id: user.id,
    serialId: user.serialId,
    name: user.name || (user.isSuperAdmin ? 'Administrator' : user.email),
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    roles: user.roles ?? (user.isSuperAdmin ? ['SUPER_ADMIN'] : []),
    verticals: [],
    status: 'Active',
    url_paths: user.url_paths ?? [],
  };
}
