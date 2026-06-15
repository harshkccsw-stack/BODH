import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepShell } from '@/components/step-shell';

// Gate 1 — Terms & Conditions (the questionnaire's disclaimer). Requires an
// explicit checkbox before continuing.
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
  return (
    <StepShell title={title} subtitle={subtitle}>
      <div>
        <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">Before you begin</p>
        <h2 className="text-xl font-semibold tracking-tight mt-1">Terms &amp; Conditions</h2>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-4 whitespace-pre-wrap text-sm leading-relaxed max-h-[50vh] overflow-y-auto">
        {disclaimer}
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 rounded"
        />
        <span className="text-sm">
          I have read and understood the terms above, and I agree to continue with this assessment.
        </span>
      </label>
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onAgree} disabled={!checked}>
          <Check className="h-4 w-4" />
          Agree &amp; Continue
        </Button>
      </div>
    </StepShell>
  );
}
