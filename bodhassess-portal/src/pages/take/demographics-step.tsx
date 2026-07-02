import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepShell } from '@/components/step-shell';
import { cn } from '@/lib/utils';
import type { DemographicField } from '@/lib/api';

// Gate — Demographic details. Fields are the active, per-questionnaire subset
// resolved by the orchestrator. Required-field validation; DOB auto-computes
// age when an `age` field is also present. Persistence is delegated to onSubmit.
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
  fields: DemographicField[];
  defaultValues: Record<string, string>;
  onSubmit: (clean: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(defaultValues);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (field: DemographicField, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field.fieldKey]: value };
      if (field.fieldKey === 'dob' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const today = new Date();
        const d = new Date(value);
        let a = today.getFullYear() - d.getFullYear();
        const m = today.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a--;
        if (a >= 0 && a < 130 && fields.some((f) => f.fieldKey === 'age')) {
          next.age = String(a);
        }
      }
      return next;
    });
  };

  const submit = async () => {
    const missing = fields.filter((f) => f.required).filter((f) => !(values[f.fieldKey] || '').trim());
    if (missing.length > 0) {
      setError(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const clean: Record<string, string> = {};
      fields.forEach((f) => {
        const v = (values[f.fieldKey] || '').trim();
        if (v) clean[f.fieldKey] = v;
      });
      await onSubmit(clean);
    } catch (e: any) {
      setError(`Failed to save: ${e?.message || 'unknown error'}`);
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map((f) => {
            const value = values[f.fieldKey] || '';
            const wide = f.type === 'textarea';
            return (
              <div key={f.id} className={cn('space-y-1.5', wide && 'md:col-span-2')}>
                <label className="text-sm font-medium">
                  {f.label}
                  {f.required && ' *'}
                </label>
                {f.type === 'select' ? (
                  <select value={value} onChange={(e) => handleChange(f, e.target.value)} className={inputClass}>
                    <option value="">Select…</option>
                    {f.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : f.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    value={value}
                    placeholder={f.placeholder}
                    onChange={(e) => handleChange(f, e.target.value)}
                    className={inputClass}
                  />
                ) : f.type === 'date' ? (
                  <input type="date" value={value} onChange={(e) => handleChange(f, e.target.value)} className={inputClass} />
                ) : f.type === 'number' ? (
                  <input
                    type="number"
                    value={value}
                    placeholder={f.placeholder}
                    onChange={(e) => handleChange(f, e.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <input
                    value={value}
                    placeholder={f.placeholder}
                    onChange={(e) => handleChange(f, e.target.value)}
                    className={inputClass}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={saving}>
          <Check className="h-4 w-4" />
          {saving ? 'Saving…' : 'Continue to Assessment'}
        </Button>
      </div>
    </StepShell>
  );
}
