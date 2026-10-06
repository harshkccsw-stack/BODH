// The router's errorElement — what shows instead of React Router's built-in
// "Unexpected Application Error! 💿 Hey developer" screen.
//
// A missing page chunk (stale tab after a new build) is not a real error: it
// reloads once to pick up the new files and shows a loader meanwhile. Anything
// else gets a plain message with Reload / Go to dashboard, and the technical
// detail tucked away for whoever is debugging.

import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { AlertTriangle, LayoutDashboard, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScreenLoader } from '@/components/screen-loader';
import { isChunkLoadError, reloadForNewChunks } from '@/lib/chunk-reload';

const BASE = (import.meta.env.VITE_BASE_PATH || '/').replace(/\/$/, '');

export function RouteError() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);
  // Decided once on mount: true while a reload is on its way.
  const [reloading] = useState(() => chunkError && reloadForNewChunks());

  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  if (reloading) return <ScreenLoader />;

  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error ? error.message : String(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-5">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">
              {chunkError ? 'This page could not be loaded' : 'Something went wrong'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {chunkError
                ? 'The app was probably updated while this tab was open. Reloading usually fixes it.'
                : 'An unexpected error stopped this page. Reload to try again, or go back to the dashboard.'}
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => { window.location.href = `${BASE}/dashboard`; }}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              <RotateCcw className="h-4 w-4" /> Reload
            </Button>
          </div>
          <details className="text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono">{detail}</pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
