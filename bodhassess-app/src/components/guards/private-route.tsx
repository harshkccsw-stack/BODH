import { useLocation, Outlet } from 'react-router';
import { ReactNode } from 'react';
import { ScreenLoader } from '@/components/screen-loader';
import { usePractitionerAuth } from '@/lib/practitioner-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { Layout1 } from '@/components/layouts/layout-1';

// PrivateRoute is the auth gate for practitioner-dashboard pages. It assumes
// PractitionerAuthProvider is mounted somewhere above (we mount it once in
// App.tsx so the same auth state is shared across navigations).
//
// Behaviour:
//   loading or unauthenticated → ScreenLoader (the provider handles the
//                                redirect to /login on its own)
//   authenticated but role lacks access to the current path → access denied
//                                screen (with sign-out)
//   authenticated and allowed   → render children (or <Outlet/>)
export function PrivateRoute({ children }: { children?: ReactNode }) {
  const auth = usePractitionerAuth();
  const { pathname } = useLocation();

  if (auth.status === 'loading' || auth.status === 'unauthenticated') {
    return <ScreenLoader />;
  }

  if (!auth.canAccess(pathname)) {
    return (
      <Layout1>
        <div className="p-8 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full">
            <CardContent className="p-6 text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/30">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Access denied</h2>
                <p className="text-sm text-muted-foreground">
                  Your role doesn't grant access to{' '}
                  <span className="font-mono">{pathname}</span>. Ask an
                  administrator to update your roles in Permissions.
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => auth.logout()}>
                  Sign out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout1>
    );
  }

  return <>{children ?? <Outlet />}</>;
}
