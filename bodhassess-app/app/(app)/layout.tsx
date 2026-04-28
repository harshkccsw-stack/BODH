import { Layout1 } from '@/components/layouts/layout-1';
import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ScreenLoader } from '@/components/screen-loader';
import { PractitionerAuthProvider, usePractitionerAuth } from '@/lib/practitioner-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <PractitionerAuthProvider>
      <AuthGate>{children}</AuthGate>
    </PractitionerAuthProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const auth = usePractitionerAuth();
  const pathname = usePathname();

  // While we're resolving the token, or while the provider is in the middle
  // of redirecting an unauthenticated user to /login, just show the loader —
  // never flash dashboard chrome.
  if (auth.status === 'loading' || auth.status === 'unauthenticated') {
    return <ScreenLoader />;
  }

  // Authenticated but the role's url_paths don't permit this specific page.
  // Render the chrome (so they can navigate elsewhere) with a clear notice.
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
                  Your role doesn't grant access to <span className="font-mono">{pathname}</span>.
                  Ask an administrator to update your roles in Permissions.
                </p>
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => auth.logout()}>Sign out</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout1>
    );
  }

  return <Layout1>{children}</Layout1>;
}
