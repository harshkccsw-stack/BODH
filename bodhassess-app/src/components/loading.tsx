import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Inline loading indicator for content areas that are waiting on an API
// response. Use inside a card/table/section body — distinct from ScreenLoader,
// which is the full-screen route/Suspense fallback.
export function Loading({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground', className)}>
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
