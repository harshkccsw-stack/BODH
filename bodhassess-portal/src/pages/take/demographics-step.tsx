import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepShell } from '@/components/step-shell';
import type { PortalDemographicEntry, PortalDemographicField } from '@/lib/api';

/** The server's cap on a write-in "Other" answer (demographic_response.other_text). */
const OTHER_TEXT_MAX = 255;

/** Every pickable choice in display order: the options, then the write-in last. */
const choicesOf = (f: PortalDemographicField) => [...f.options, ...(f.otherOptionLabel ? [f.otherOptionLabel] : [])];

// Gate — Demographic details. Fields are the questionnaire's mapped form
// (sorted server-side). Values are keyed by demographicFieldId; persistence
// is delegated to onSubmit.
//
// A DROPDOWN picks one value and a CHECKLIST ticks any number; either may
// carry a write-in "Other" choice, which shows a text box once picked and
// cannot be submitted with that box empty (the server refuses it too).
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
  onSubmit: (entries: PortalDemographicEntry[]) => Promise<void>;
  onCancel: () => void;
}) {
  // Single-value fields, checklist ticks, and write-in text — each keyed by field.
  const [values, setValues] = useState<Record<string, string>>(defaultValues);
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const keyOf = (f: PortalDemographicField) => String(f.demographicFieldId);

  const handleChange = (f: PortalDemographicField, value: string) => {
    setValues((prev) => ({ ...prev, [keyOf(f)]: value }));
  };

  const toggleTick = (f: PortalDemographicField, choice: string) => {
    setTicks((prev) => {
      const current = prev[keyOf(f)] ?? [];
      return {
        ...prev,
        [keyOf(f)]: current.includes(choice) ? current.filter((c) => c !== choice) : [...current, choice],
      };
    });
  };

  const otherPicked = (f: PortalDemographicField) =>
    f.otherOptionLabel != null &&
    (f.fieldType === 'CHECKLIST'
      ? (ticks[keyOf(f)] ?? []).includes(f.otherOptionLabel)
      : values[keyOf(f)] === f.otherOptionLabel);

  const answered = (f: PortalDemographicField) =>
    f.fieldType === 'CHECKLIST' ? (ticks[keyOf(f)] ?? []).length > 0 : !!(values[keyOf(f)] || '').trim();

  const submit = async () => {
    const missing = fields.filter((f) => f.required && !answered(f));
    if (missing.length > 0) {
      setError(`Please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    const unspecified = fields.filter((f) => otherPicked(f) && !(otherTexts[keyOf(f)] || '').trim());
    if (unspecified.length > 0) {
      setError(`Please specify your answer for: ${unspecified.map((f) => f.label).join(', ')}`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const entries: PortalDemographicEntry[] = [];
      fields.forEach((f) => {
        const otherText = otherPicked(f) ? otherTexts[keyOf(f)].trim() : undefined;
        if (f.fieldType === 'CHECKLIST') {
          // Choice order, not tick order — the server stores them that way anyway.
          const picked = choicesOf(f).filter((c) => (ticks[keyOf(f)] ?? []).includes(c));
          if (picked.length > 0) entries.push({ demographicFieldId: f.demographicFieldId, values: picked, otherText });
        } else {
          const v = (values[keyOf(f)] || '').trim();
          if (v) entries.push({ demographicFieldId: f.demographicFieldId, value: v, otherText });
        }
      });
      await onSubmit(entries);
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

  // A dropdown's write-in box, under the select once its Other choice is
  // picked (a checklist draws its own, inline). The field's own placeholder
  // is its hint — a choice field has no other use for one.
  const otherBox = (f: PortalDemographicField) =>
    otherPicked(f) && (
      <input
        value={otherTexts[keyOf(f)] ?? ''}
        onChange={(e) => setOtherTexts((prev) => ({ ...prev, [keyOf(f)]: e.target.value }))}
        maxLength={OTHER_TEXT_MAX}
        placeholder={f.placeholder || 'Please specify'}
        aria-label={`${f.label}: ${f.otherOptionLabel}`}
        autoFocus
        className={inputClass}
      />
    );

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
            if (f.fieldType === 'CHECKLIST') {
              // Google-Forms style: one plain row per choice, stacked, no tile
              // around each — a square marker (square = tick any number; a
              // circle would read as pick-one) beside its label. Full width so
              // a tall list never sits beside a lone input in the other column.
              const ticked = ticks[keyOf(f)] ?? [];
              const marker = (on: boolean) => (
                <span
                  aria-hidden
                  className={
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors ' +
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 ' +
                    (on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/60')
                  }
                >
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              );
              return (
                <fieldset key={f.demographicFieldId} className="space-y-1.5 sm:col-span-2">
                  <legend className="text-sm font-medium">
                    {f.label}
                    {f.required && ' *'}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">Select all that apply</span>
                  </legend>
                  <div className="pt-1">
                    {f.options.map((choice) => {
                      const on = ticked.includes(choice);
                      return (
                        // min-h-11: a 44px tap target on phones; tighter on desktop.
                        <label key={choice} className="flex min-h-11 cursor-pointer items-center gap-3 sm:min-h-9">
                          <input type="checkbox" checked={on} onChange={() => toggleTick(f, choice)} className="peer sr-only" />
                          {marker(on)}
                          <span className="text-sm">{choice}</span>
                        </label>
                      );
                    })}
                    {f.otherOptionLabel && (() => {
                      // The write-in row, the way the question runner draws its
                      // "Other…": label and an ALWAYS-VISIBLE underline box on
                      // one line. The box is outside the label, so typing never
                      // toggles the tick; focusing it ticks Other, the way
                      // typing into Google's "Other" does.
                      const label = f.otherOptionLabel;
                      const on = ticked.includes(label);
                      return (
                        <div className="flex min-h-11 items-center gap-3 sm:min-h-9">
                          <label className="flex shrink-0 cursor-pointer items-center gap-3">
                            <input type="checkbox" checked={on} onChange={() => toggleTick(f, label)} className="peer sr-only" />
                            {marker(on)}
                            <span className="text-sm">{label}</span>
                          </label>
                          <input
                            value={otherTexts[keyOf(f)] ?? ''}
                            onFocus={() => {
                              if (!on) toggleTick(f, label);
                            }}
                            onChange={(e) => setOtherTexts((prev) => ({ ...prev, [keyOf(f)]: e.target.value }))}
                            maxLength={OTHER_TEXT_MAX}
                            placeholder={f.placeholder || 'Please specify'}
                            aria-label={`${f.label}: ${label}`}
                            /* Underline only, like Google's and the runner's. */
                            className="min-w-0 flex-1 border-0 border-b border-border bg-transparent px-1 pb-1 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
                          />
                        </div>
                      );
                    })()}
                  </div>
                </fieldset>
              );
            }
            return (
              <div key={f.demographicFieldId} className="space-y-1.5">
                <label className="text-sm font-medium">
                  {f.label}
                  {f.required && ' *'}
                </label>
                {f.fieldType === 'DROPDOWN' ? (
                  <>
                    <select value={value} onChange={(e) => handleChange(f, e.target.value)} className={inputClass}>
                      <option value="">Select…</option>
                      {choicesOf(f).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    {otherBox(f)}
                  </>
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
