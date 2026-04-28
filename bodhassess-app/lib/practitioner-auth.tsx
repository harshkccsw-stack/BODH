'use client';

// Practitioner dashboard auth.
//
// Login (id + DOB) at /login mints an opaque token stored in sessionStorage.
// PractitionerAuthProvider wraps the dashboard; on mount it exchanges the
// token for the practitioner record + the merged url_paths from every role
// they hold. Pages and the sidebar use canAccess() to gate visibility.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { practitionersApi, type PractitionerMe } from '@/lib/api';
import { config } from '@/lib/config';

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

// ---- Context ------------------------------------------------------------

type AuthState =
  | { status: 'loading'; me: null }
  | { status: 'authenticated'; me: PractitionerMe }
  | { status: 'unauthenticated'; me: null };

type AuthContextValue = AuthState & {
  logout: () => Promise<void>;
  canAccess: (pathname: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function PractitionerAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({ status: 'loading', me: null });

  // Resolve token → /me on mount and whenever the route changes between
  // login ↔ dashboard (so we re-auth after a fresh login without a reload).
  useEffect(() => {
    let cancelled = false;
    const token = getPractitionerToken();
    if (!token) {
      setState({ status: 'unauthenticated', me: null });
      return;
    }
    (async () => {
      try {
        const me = await practitionersApi.me(token);
        if (!cancelled) setState({ status: 'authenticated', me });
      } catch {
        if (!cancelled) {
          clearPractitionerToken();
          setState({ status: 'unauthenticated', me: null });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Redirect unauthenticated users hitting a private dashboard route to
  // /login, and forward authenticated users away from /login back into the
  // app. Public paths (portal, register) are left alone.
  useEffect(() => {
    if (state.status === 'loading') return;
    if (isPublicPath(pathname)) {
      if (state.status === 'authenticated' && pathname === LOGIN_PATH) {
        router.replace('/dashboard');
      }
      return;
    }
    if (state.status === 'unauthenticated') {
      router.replace(LOGIN_PATH);
    }
  }, [state.status, pathname, router]);

  const logout = useCallback(async () => {
    const token = getPractitionerToken();
    clearPractitionerToken();
    setState({ status: 'unauthenticated', me: null });
    if (token) {
      try { await practitionersApi.logout(token); } catch { /* best effort */ }
    }
    router.replace(LOGIN_PATH);
  }, [router]);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    logout,
    canAccess: (p: string) =>
      state.status === 'authenticated' ? canAccess(p, state.me.url_paths) : isPublicPath(p),
  }), [state, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePractitionerAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePractitionerAuth must be used inside PractitionerAuthProvider');
  return ctx;
}
