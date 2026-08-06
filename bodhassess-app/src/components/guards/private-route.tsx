import { useLocation, Navigate, Outlet } from 'react-router';
import { ReactNode } from 'react';
import { ScreenLoader } from '@/components/screen-loader';
import { usePractitionerAuth } from '@/lib/practitioner-auth';
import { PERMISSION_ERROR_PATH } from '@/lib/practitioner-auth-utils';

// PrivateRoute is the auth gate for practitioner-dashboard pages. It assumes
// PractitionerAuthProvider is mounted somewhere above (we mount it once in
// App.tsx so the same auth state is shared across navigations).
//
// Behaviour:
//   loading or unauthenticated → ScreenLoader (the provider handles the
//                                redirect to /login on its own)
//   authenticated but the role group lacks this path → /permission-error,
//                                carrying the attempted path so the page can
//                                name it. Replace, not push, so Back does not
//                                bounce straight into the denial again.
//   authenticated and allowed   → render children (or <Outlet/>)
export function PrivateRoute({ children }: { children?: ReactNode }) {
  const auth = usePractitionerAuth();
  const { pathname } = useLocation();

  if (auth.status === 'loading' || auth.status === 'unauthenticated') {
    return <ScreenLoader />;
  }

  if (!auth.canAccess(pathname)) {
    return <Navigate to={`${PERMISSION_ERROR_PATH}?from=${encodeURIComponent(pathname)}`} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
