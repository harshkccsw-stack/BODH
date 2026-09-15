import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CHANGE_LABELS,
  MATCH_LABELS,
  type BindingPreview,
} from '@/pages/Reports/itemBindingsApi';

/**
 * The review step for a workbook's item tab.
 *
 * Its whole job is to make one question answerable at a glance: **does every
 * item code point at the question the practitioner meant?** If `I1` binds to
 * the wrong question, every rule mentioning it is wrong in a way nobody reading
 * the finished report can see — so an unmatched item blocks the import, and a
 * close-but-not-identical match is drawn in amber rather than accepted quietly.
 *
 * The picker beside an unmatched row is the point of the whole screen. The
 * matcher is deliberately unwilling to guess; this is where a person resolves
 * what it would not.
 */
export function ReportItemBindingStep({
  preview,
  overrides,
  onOverride,
  busy,
  itemsSheetName,
}: {
  preview: BindingPreview;
  overrides: Record<string, number>;
  onOverride: (itemCode: string, questionId: number | null) => void;
  busy: boolean;
  itemsSheetName: string;
}) {
  const matched = preview.rows.filter((r) => r.questionId != null).length;
  const total = preview.rows.length;
  const fuzzy = preview.rows.filter((r) => r.matchMethod === 'FUZZY').length;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Item codes</h3>
        <span className="text-xs text-muted-foreground">
          from the {itemsSheetName} tab — what <code>I1</code> and <code>V3</code> mean in the
          rules
        </span>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <span
          className={cn(
            'ml-auto rounded-full border px-2 py-0.5 text-xs font-medium',
            matched === total
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700',
          )}
        >
          {matched} of {total} matched
        </span>
      </div>

      {fuzzy > 0 && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {fuzzy} item{fuzzy === 1 ? '' : 's'} matched on similar but not identical wording.
            Check {fuzzy === 1 ? 'it' : 'them'} — the statement is the only thing tying an item
            code to a question.
          </span>
        </div>
      )}

      {preview.removed.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This sheet no longer has {preview.removed.join(', ')}.{' '}
            {preview.removed.length === 1 ? 'That binding' : 'Those bindings'} will be deleted.
          </span>
        </div>
      )}

      <div className="divide-y rounded-md border">
        {preview.rows.map((row) => {
          const match = MATCH_LABELS[row.matchMethod];
          const change = CHANGE_LABELS[row.change];
          return (
            <div key={row.itemCode} className="space-y-1.5 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{row.itemCode}</span>
                {row.adminPosition != null && (
                  <span className="text-muted-foreground">#{row.adminPosition}</span>
                )}
                <span className={cn('rounded border px-1.5 py-0.5 font-medium', match.tone)}>
                  {match.label}
                </span>
                {change && (
                  <span className={cn('rounded border px-1.5 py-0.5 font-medium', change.tone)}>
                    {change.label}
                  </span>
                )}
                {row.reverseScored && (
                  <span className="rounded border bg-muted px-1.5 py-0.5">reverse</span>
                )}
                {!row.inComposite && (
                  <span className="rounded border bg-muted px-1.5 py-0.5">validity</span>
                )}
                {row.mqtPath && (
                  <span className="ml-auto text-muted-foreground">{row.mqtPath}</span>
                )}
              </div>

              <p className="text-muted-foreground">{row.statement}</p>

              {row.questionId != null ? (
                <p className="flex items-start gap-1.5 text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>
                    {row.questionTag && (
                      <span className="font-mono">{row.questionTag} </span>
                    )}
                    {row.questionStem}
                  </span>
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-red-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{row.note ?? 'No matching question.'}</span>
                </p>
              )}

              {row.note && row.questionId != null && (
                <p className="flex items-start gap-1.5 text-amber-800">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{row.note}</span>
                </p>
              )}

              {/*
                Offered on every row, not only unmatched ones: a FUZZY match is
                a suggestion, and the reviewer who spots a wrong one needs to
                correct it here rather than going back to edit the spreadsheet.
              */}
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-xs"
                value={overrides[row.itemCode] ?? row.questionId ?? ''}
                disabled={busy}
                onChange={(e) =>
                  onOverride(row.itemCode, e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Choose a question…</option>
                {preview.candidates.map((candidate) => (
                  <option key={candidate.questionId} value={candidate.questionId}>
                    {candidate.questionTag ? `${candidate.questionTag} — ` : ''}
                    {candidate.stem}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {preview.warnings.length > 0 && (
        <ul className="list-disc space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 pl-7 text-xs text-amber-900">
          {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
