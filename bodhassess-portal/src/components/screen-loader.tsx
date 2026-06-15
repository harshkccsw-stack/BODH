import { Brain } from 'lucide-react';

// Minimal Suspense / auth-check fallback. No logo asset dependency (the admin
// app's version pulled an SVG via toAbsoluteUrl); a branded spinner is enough.
export function ScreenLoader() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground animate-pulse">
        <Brain className="h-6 w-6" />
      </div>
      <div className="text-sm font-medium text-muted-foreground">Loading…</div>
    </div>
  );
}
