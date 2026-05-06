import { Navigate, Outlet } from 'react-router';
import { ReactNode } from 'react';
import { usePractitionerAuth } from '@/lib/practitioner-auth';

// PublicRoute is for pages that ONLY make sense when the user is *not* signed
// in (login, register). Once authenticated, users are bounced to the
// dashboard so they don't land on login by mistake.
export function PublicRoute({ children }: { children?: ReactNode }) {
  const auth = usePractitionerAuth();

  if (auth.status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
