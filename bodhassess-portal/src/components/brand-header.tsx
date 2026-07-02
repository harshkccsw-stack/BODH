import type { ReactNode } from 'react';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

type MaxWidth = '3xl' | '5xl' | '6xl';
const widthClass: Record<MaxWidth, string> = {
  '3xl': 'max-w-3xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

// Consolidates the sticky brand header that was duplicated four times across
// the original take.tsx (terms / instructions / demographics / question gates).
export function BrandHeader({
  title,
  subtitle,
  right,
  progress,
  maxWidth = '3xl',
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** 0-100 — renders a progress bar under the header when provided. */
  progress?: number;
  maxWidth?: MaxWidth;
}) {
  return (
    <header className="border-b border-border bg-background sticky top-0 z-10">
      <div className={cn('mx-auto px-5 py-4 flex items-center justify-between gap-3', widthClass[maxWidth])}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {typeof progress === 'number' && (
        <div className="h-1 bg-muted">
          <div className="h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </header>
  );
}
