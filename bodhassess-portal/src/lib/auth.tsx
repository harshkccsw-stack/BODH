import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { config } from '@/config';
import { portalAuthApi, type PortalRespondent } from '@/lib/api';
import { identify } from '@/lib/analytics';
import { ScreenLoader } from '@/components/screen-loader';

type Status = 'loading' | 'authed' | 'anon';

interface AuthContextValue {
  user: PortalRespondent | null;
  status: Status;
  /** Re-read the token from localStorage and refetch the profile (including
   *  allotted assessments). Call after login stores a fresh token, or to
   *  pick up newly-allotted assessments. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalRespondent | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // Analytics is told who this is right here, not from an effect on `user`:
  // the caller's next event (login, sign_up) must already carry the id, and an
  // effect would only run after the render that follows.
  const refresh = useCallback(async () => {
    const token = localStorage.getItem(config.authStorageKey);
    if (!token) {
      setUser(null);
      setStatus('anon');
      identify(null);
      return;
    }
    try {
      const me = await portalAuthApi.me();
      setUser(me);
      setStatus('authed');
      identify(me);
    } catch {
      // Token invalid/expired.
      localStorage.removeItem(config.authStorageKey);
      setUser(null);
      setStatus('anon');
      identify(null);
    }
  }, []);

  // The token is a stateless JWT — there is nothing to revoke server-side,
  // so signing out is just dropping it.
  const signOut = useCallback(async () => {
    localStorage.removeItem(config.authStorageKey);
    setUser(null);
    setStatus('anon');
    identify(null);
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
