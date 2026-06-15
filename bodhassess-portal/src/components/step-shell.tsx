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
    <div className="flex-1 min-h-screen w-full bg-linear-to-b from-muted/30 via-background to-background">
      <BrandHeader title={title} subtitle={subtitle} />
      <main className="max-w-3xl mx-auto px-5 py-8">
        <Card>
          <CardContent className="p-6 space-y-5">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
