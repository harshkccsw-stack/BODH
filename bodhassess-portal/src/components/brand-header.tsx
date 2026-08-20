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
    // pt-[env(safe-area-inset-top)]: on a notched phone in landscape the sticky
    // header would otherwise sit under the status bar / camera cutout.
    <header className="border-b border-border bg-background sticky top-0 z-20 pt-[env(safe-area-inset-top)]">
      <div
        className={cn(
          'mx-auto px-4 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-2 sm:gap-3',
          widthClass[maxWidth],
        )}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Brain className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title}</p>
            {/* Hidden on phones: it is the respondent's own name plus the
                assessment title, both already known to them, and on a 360px
                screen it is what squeezes the meta slot on the right into two
                cramped lines. */}
            {subtitle && <p className="hidden sm:block text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
        </div>
        {/* shrink-0: the meta slot (question counter, Sign out) keeps its width
            and the title truncates instead — the counter is what a respondent
            needs on a phone, the assessment name they already know. */}
        {right && <div className="shrink-0 flex items-center justify-end">{right}</div>}
      </div>
      {typeof progress === 'number' && (
        <div className="h-1 bg-muted">
          <div className="h-1 bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </header>
  );
}
