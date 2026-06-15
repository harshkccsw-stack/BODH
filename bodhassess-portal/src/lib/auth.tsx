import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { config } from '@/config';
import { respondentsApi, type Respondent } from '@/lib/api';
import { ScreenLoader } from '@/components/screen-loader';

type Status = 'loading' | 'authed' | 'anon';

interface AuthContextValue {
  user: Respondent | null;
  status: Status;
  /** Re-read the token from localStorage and refetch the profile. Call after
   *  login/registration stores a fresh token. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Respondent | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(config.authStorageKey);
    if (!token) {
      setUser(null);
      setStatus('anon');
      return;
    }
    try {
      const me = await respondentsApi.me();
      setUser(me);
      setStatus('authed');
    } catch {
      // Token invalid/expired.
      localStorage.removeItem(config.authStorageKey);
      setUser(null);
      setStatus('anon');
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await respondentsApi.logout();
    } catch {
      /* best-effort */
    }
    localStorage.removeItem(config.authStorageKey);
    setUser(null);
    setStatus('anon');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, status, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Route guard. While the initial /me check is in flight, show the loader; once
// resolved, bounce anonymous visitors to login. Replaces the localStorage
// check-and-redirect that was copy-pasted into every portal page.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <ScreenLoader />;
  if (status === 'anon') return <Navigate to="/portal/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
