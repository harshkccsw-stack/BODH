import { Check, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepShell } from '@/components/step-shell';
import { RichText } from '@/lib/rich-text';

// Gate (general instructions) — informational, no checkbox.
export function InstructionsStep({
  title,
  subtitle,
  instructions,
  onContinue,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  instructions: string;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <StepShell title={title} subtitle={subtitle}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">Before you begin</p>
          <h2 className="text-xl font-semibold tracking-tight">Instructions</h2>
        </div>
      </div>
      {/* Authored in the dashboard's rich-text editor, so bold, lists and
          headings render as written. Instructions saved before that editor
          existed are plain prose — RichText escapes those and keeps their
          line breaks, which is what this box used to do with
          whitespace-pre-wrap. */}
      <RichText
        value={instructions}
        className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed max-h-[60vh] overflow-y-auto"
      />
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onContinue}>
          <Check className="h-4 w-4" />
          Continue
        </Button>
      </div>
    </StepShell>
  );
}
