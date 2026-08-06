'use client';

// Where PrivateRoute sends anyone who opens a page their group does not
// grant. Rendered inside the dashboard chrome, so the sidebar still shows
// what they CAN reach.
//
// The attempted path arrives as ?from= — worth showing, because the usual
// cause is a stale bookmark or a link pasted by a colleague with wider
// access, and seeing the path is what makes that obvious.

import { ShieldAlert, LayoutDashboard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'react-router';
import { useRouter } from '@/lib/router-helpers';
import { DASHBOARD_PATH } from '@/lib/practitioner-auth-utils';

export default function PermissionErrorPage() {
  const router = useRouter();
  const [params] = useSearchParams();
  const from = params.get('from');

  return (
    <div className="p-8 flex items-center justify-center min-h-[70vh]">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-5">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
            <p className="text-sm text-muted-foreground">
              {from ? (
                <>
                  Your role group does not include{' '}
                  <span className="font-mono text-foreground">{from}</span>.
                </>
              ) : (
                'Your role group does not include this page.'
              )}{' '}
              Ask an administrator to update your access.
            </p>
          </div>
          <Button variant="primary" onClick={() => router.replace(DASHBOARD_PATH)}>
            <LayoutDashboard className="h-4 w-4" /> Return to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
