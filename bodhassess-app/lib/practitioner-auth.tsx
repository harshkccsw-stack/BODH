'use client';

// Practitioner dashboard auth.
//
// Login (id + DOB) at /login mints an opaque token stored in sessionStorage.
// PractitionerAuthProvider wraps the dashboard; on mount it exchanges the
// token for the practitioner record + the merged url_paths from every role
// they hold. Pages and the sidebar use canAccess() to gate visibility.
//
// Pure helpers (canAccess, token getters, isPublicPath, LOGIN_PATH, etc.)
// live in ./practitioner-auth-utils so this file only exports the
// Provider/hook — required for Vite Fast Refresh.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useRouter } from '@/src/lib/router-helpers';
import { adminApi, practitionersApi, type PractitionerMe } from '@/lib/api';
import {
  LOGIN_PATH,
  adminAsPractitionerMe,
  canAccess,
  clearAdminToken,
  clearPractitionerToken,
  getAdminToken,
  getPractitionerToken,
  isPublicPath,
  setAdminToken,
  setPractitionerToken,
} from '@/lib/practitioner-auth-utils';

// ---- Context ------------------------------------------------------------

type AuthState =
  | { status: 'loading'; me: null }
  | { status: 'authenticated'; me: PractitionerMe }
  | { status: 'unauthenticated'; me: null };

type AuthContextValue = AuthState & {
  logout: () => Promise<void>;
  canAccess: (pathname: string) => boolean;
  // Set state directly from a fresh login response. Used by the /login
  // page so it can soft-navigate via react-router instead of forcing a
  // full page reload to re-trigger auth resolution.
  loginAsPractitioner: (token: string, me: PractitionerMe) => void;
  loginAsAdmin: (token: string, username: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function PractitionerAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({ status: 'loading', me: null });

  // Resolve token → /me on mount. Tries practitioner first, then admin —
  // either path lands the user in the dashboard. Admin gets full url_paths
  // access so canAccess() returns true everywhere.
  useEffect(() => {
    let cancelled = false;
    const practitionerToken = getPractitionerToken();
    const adminToken = getAdminToken();

    if (!practitionerToken && !adminToken) {
      setState({ status: 'unauthenticated', me: null });
      return;
    }

    (async () => {
<<<<<<< HEAD
      try {
        const me = await practitionersApi.me(token);
        // Defensive gate: if an admin moved the account back to Pending or
        // Inactive after login, drop the session so the dashboard isn't
        // reachable with a stale token.
        if (me.status !== 'Active') {
          if (!cancelled) {
            clearPractitionerToken();
            setState({ status: 'unauthenticated', me: null });
          }
          return;
        }
        if (!cancelled) setState({ status: 'authenticated', me });
      } catch {
        if (!cancelled) {
=======
      if (practitionerToken) {
        try {
          const me = await practitionersApi.me(practitionerToken);
          if (!cancelled) setState({ status: 'authenticated', me });
          return;
        } catch {
>>>>>>> origin/harsh
          clearPractitionerToken();
        }
      }
      if (adminToken) {
        try {
          const info = await adminApi.me(adminToken);
          if (!cancelled) {
            setState({ status: 'authenticated', me: adminAsPractitionerMe(info.username) });
          }
          return;
        } catch {
          clearAdminToken();
        }
      }
      if (!cancelled) setState({ status: 'unauthenticated', me: null });
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
    const practitionerToken = getPractitionerToken();
    const adminToken = getAdminToken();
    clearPractitionerToken();
    clearAdminToken();
    setState({ status: 'unauthenticated', me: null });
    if (practitionerToken) {
      try { await practitionersApi.logout(practitionerToken); } catch { /* best effort */ }
    }
    if (adminToken) {
      try { await adminApi.logout(adminToken); } catch { /* best effort */ }
    }
    router.replace(LOGIN_PATH);
  }, [router]);

  const loginAsPractitioner = useCallback((token: string, me: PractitionerMe) => {
    clearAdminToken();
    setPractitionerToken(token);
    setState({ status: 'authenticated', me });
  }, []);

  const loginAsAdmin = useCallback((token: string, username: string) => {
    clearPractitionerToken();
    setAdminToken(token);
    setState({ status: 'authenticated', me: adminAsPractitionerMe(username) });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    logout,
    loginAsPractitioner,
    loginAsAdmin,
    canAccess: (p: string) =>
      state.status === 'authenticated' ? canAccess(p, state.me.url_paths) : isPublicPath(p),
  }), [state, logout, loginAsPractitioner, loginAsAdmin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePractitionerAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePractitionerAuth must be used inside PractitionerAuthProvider');
  return ctx;
}
