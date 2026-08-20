import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BrandHeader } from '@/components/brand-header';

// Shared chrome for the take-flow gate screens (terms / demographics /
// instructions). Each step only supplies its body + footer buttons as children.
export function StepShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    // min-h-dvh, not min-h-screen: 100vh on a mobile browser includes the
    // retracting address bar, so a screen sized to it is always a little taller
    // than what is actually visible.
    <div className="flex-1 min-h-dvh w-full bg-linear-to-b from-muted/30 via-background to-background">
      <BrandHeader title={title} subtitle={subtitle} />
      <main className="max-w-3xl mx-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-8">
        <Card>
          <CardContent className="p-4 sm:p-6 space-y-5">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
