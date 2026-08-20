import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepShell } from '@/components/step-shell';

// Gate 1 — Terms & Conditions, authored per assessment in the dashboard and
// delivered as a small HTML subset (p/br/b/strong/i/em/u/ul/ol/li/h2/h3, no
// attributes — the API refuses to store anything else, which is what makes
// rendering it as markup here acceptable).
//
// Agreement takes two deliberate acts: read to the end, then tick the box.
// The checkbox stays disabled until the terms have been scrolled through, so
// "I have read" means something on a phone screen that shows six lines at a
// time as much as on a laptop.
export function TermsStep({
  title,
  subtitle,
  disclaimer,
  onAgree,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  disclaimer: string;
  onAgree: () => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [readToEnd, setReadToEnd] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const checkScroll = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    // Terms shorter than the box never scroll — there is nothing below the
    // fold to read, so the gate is already satisfied. Without this the
    // checkbox could never be enabled for short terms.
    const fitsWithoutScrolling = el.scrollHeight <= el.clientHeight + 1;
    // 8px of slack: fractional device pixels, zoom, and iOS momentum
    // scrolling routinely stop a hair short of the exact bottom.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 8;
    // Only ever latch ON — scrolling back up to re-read must not revoke it.
    if (fitsWithoutScrolling || atBottom) setReadToEnd(true);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = boxRef.current;
    if (!el) return;
    // Rotating a phone, a font finishing loading, or the keyboard opening all
    // reflow the box and can change whether it scrolls at all.
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkScroll, disclaimer]);

  return (
    <StepShell title={title} subtitle={subtitle}>
      <div>
        <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">Before you begin</p>
        <h2 className="text-xl font-semibold tracking-tight mt-1">Terms &amp; Conditions</h2>
      </div>

      <div className="relative">
        <div
          ref={boxRef}
          onScroll={checkScroll}
          tabIndex={0}
          className="rich-text max-h-[45dvh] overflow-y-auto overscroll-contain rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-h-[50dvh] sm:p-4"
          // Safe by construction: the server stores only the tag subset above
          // and rejects anything else, so no attributes and no scripts can
          // reach this string.
          dangerouslySetInnerHTML={{ __html: disclaimer }}
        />
        {!readToEnd && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2">
            <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-background shadow-sm">
              <ArrowDown className="h-3 w-3" />
              Scroll to read all the terms
            </span>
          </div>
        )}
      </div>

      <label
        className={
          readToEnd
            ? 'flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 cursor-pointer'
            : 'flex items-start gap-3 rounded-lg border border-border p-3 opacity-60 cursor-not-allowed'
        }
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={!readToEnd}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded accent-primary disabled:cursor-not-allowed"
        />
        <span className="text-sm">
          I have read and understood the terms above, and I agree to continue with this assessment.
          {!readToEnd && (
            <span className="block text-xs text-muted-foreground mt-0.5">
              Available once you have scrolled to the end of the terms.
            </span>
          )}
        </span>
      </label>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Button variant="outline" onClick={onCancel} className="h-11 w-full sm:h-8.5 sm:w-auto">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onAgree}
          disabled={!checked}
          className="h-11 w-full sm:h-8.5 sm:w-auto"
        >
          <Check className="h-4 w-4" />
          Agree &amp; Continue
        </Button>
      </div>
    </StepShell>
  );
}
