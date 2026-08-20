import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepShell } from '@/components/step-shell';
import type { PortalDemographicField } from '@/lib/api';

// Gate — Demographic details. Fields are the questionnaire's mapped form
// (sorted server-side). Values are keyed by demographicFieldId; persistence
// is delegated to onSubmit.
export function DemographicsStep({
  title,
  subtitle,
  fields,
  defaultValues,
  onSubmit,
  onCancel,
}: {
  title: string;
  subtitle?: string;
  fields: PortalDemographicField[];
  defaultValues: Record<string, string>;
  onSubmit: (clean: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const keyOf = (f: PortalDemographicField) => String(f.demographicFieldId);

  const handleChange = (f: PortalDemographicField, value: string) => {
    setValues((prev) => ({ ...prev, [keyOf(f)]: value }));
  };

  const submit = async () => {
    const missing = fields.filter((f) => f.required).filter((f) => !(values[keyOf(f)] || '').trim());
    if (missing.length > 0) {
      setError(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const clean: Record<string, string> = {};
      fields.forEach((f) => {
        const v = (values[keyOf(f)] || '').trim();
        if (v) clean[keyOf(f)] = v;
      });
      await onSubmit(clean);
    } catch (e: any) {
      setError(`Failed to save: ${e?.message || 'unknown error'}`);
      setSaving(false);
    }
  };

  // h-11 on the control itself: a 44px target is the minimum comfortable
  // tap size, and the base stylesheet already lifts the font to 16px on phone
  // widths so focusing one does not make iOS zoom the page.
  const inputClass =
    'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:h-auto sm:py-2';

  return (
    <StepShell title={title} subtitle={subtitle}>
      <div>
        <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-primary">About you</p>
        <h2 className="text-xl font-semibold tracking-tight mt-1">Demographic Details</h2>
        <p className="text-sm text-muted-foreground mt-1">
          We collect this once before the assessment so your results can be interpreted in context. All fields marked *
          are required.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          No demographic fields configured. Ask your administrator to add some in the Questionnaire Library.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const value = values[keyOf(f)] || '';
            return (
              <div key={f.demographicFieldId} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {f.label}
                  {f.required && ' *'}
                </label>
                {f.fieldType === 'DROPDOWN' ? (
                  <select value={value} onChange={(e) => handleChange(f, e.target.value)} className={inputClass}>
                    <option value="">Select…</option>
                    {f.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : f.fieldType === 'DATE' ? (
                  <input type="date" value={value} onChange={(e) => handleChange(f, e.target.value)} className={inputClass} />
                ) : f.fieldType === 'NUMBER' ? (
                  <input
                    type="number"
                    value={value}
                    placeholder={f.placeholder ?? undefined}
                    onChange={(e) => handleChange(f, e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <input
                    value={value}
                    placeholder={f.placeholder ?? undefined}
                    onChange={(e) => handleChange(f, e.target.value)}
                    className={inputClass}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <Button variant="outline" onClick={onCancel} className="h-11 w-full sm:h-8.5 sm:w-auto">
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={saving}
          className="h-11 w-full sm:h-8.5 sm:w-auto"
        >
          <Check className="h-4 w-4" />
          {saving ? 'Saving…' : 'Continue to Assessment'}
        </Button>
      </div>
    </StepShell>
  );
}
