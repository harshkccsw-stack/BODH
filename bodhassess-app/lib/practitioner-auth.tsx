'use client';

// Practitioner dashboard auth.
//
// Login (id + DOB) at /login mints an opaque token stored in localStorage.
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
import { authApi, type AuthUser, type PractitionerMe } from '@/lib/api';
import {
  LOGIN_PATH,
  authUserToPractitionerMe,
  canAccess,
  clearDashboardToken,
  getDashboardToken,
  isPublicPath,
  setDashboardToken,
} from '@/lib/practitioner-auth-utils';

// ---- Context ------------------------------------------------------------

type AuthState =
  | { status: 'loading'; me: null }
  | { status: 'authenticated'; me: PractitionerMe }
  | { status: 'unauthenticated'; me: null };

type AuthContextValue = AuthState & {
  logout: () => Promise<void>;
  canAccess: (pathname: string) => boolean;
  // Set state directly from a fresh /auth/login response. Used by the /login
  // page so it can soft-navigate via react-router instead of forcing a
  // full page reload to re-trigger auth resolution.
  login: (token: string, user: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function PractitionerAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<AuthState>({ status: 'loading', me: null });

  // Resolve token → /auth/me on mount. One unified identity call; the
  // response's url_paths drive canAccess() (super admin carries '/*').
  useEffect(() => {
    let cancelled = false;
    const token = getDashboardToken();

    if (!token) {
      setState({ status: 'unauthenticated', me: null });
      return;
    }

    (async () => {
      try {
        const user = await authApi.me(token);
        if (!cancelled) {
          setState({ status: 'authenticated', me: authUserToPractitionerMe(user) });
        }
      } catch {
        clearDashboardToken();
        if (!cancelled) setState({ status: 'unauthenticated', me: null });
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
    const token = getDashboardToken();
    clearDashboardToken();
    setState({ status: 'unauthenticated', me: null });
    if (token) {
      try { await authApi.logout(token); } catch { /* best effort */ }
    }
    router.replace(LOGIN_PATH);
  }, [router]);

  const login = useCallback((token: string, user: AuthUser) => {
    setDashboardToken(token);
    setState({ status: 'authenticated', me: authUserToPractitionerMe(user) });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    logout,
    login,
    canAccess: (p: string) =>
      state.status === 'authenticated' ? canAccess(p, state.me.url_paths) : isPublicPath(p),
  }), [state, logout, login]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function usePractitionerAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('usePractitionerAuth must be used inside PractitionerAuthProvider');
  return ctx;
}
