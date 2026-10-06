import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  distinctRefs,
  formulaSegments,
  statementSegments,
  type RefInfo,
  type RefResolver,
} from './formula-refs';

/**
 * A formula read back with names — `[mqt:14] + [mqtt:9]` shown as
 * "Internal Drive + Execution · whole branch".
 *
 * The formula itself is untouched: only the references become chips, so the
 * operators, numbers and cut points stay exactly as written and the line can
 * be checked against the sentence it came from. A key this assessment does
 * not have is a red chip. Renders nothing when the formula references
 * nothing, since there is nothing to explain.
 */
export function FormulaReadout({
  formula,
  resolve,
  compact = false,
  className,
}: {
  formula: string;
  resolve: RefResolver;
  /** Two lines at most, for a list row. */
  compact?: boolean;
  className?: string;
}) {
  const segments = formulaSegments(formula);
  if (!segments.some((s) => s.type === 'ref')) return null;
  return (
    <div
      className={cn(
        'text-xs leading-relaxed text-muted-foreground',
        compact && 'line-clamp-2',
        className,
      )}
    >
      <span className="mr-1.5 font-medium text-foreground/70">Reads as</span>
      {segments.map((s, i) =>
        s.type === 'text'
          // A list row has two lines to spend; a formula laid out over six
          // would spend them on indentation, so compact folds the layout.
          ? <span key={i} className={cn('font-mono text-[11px]', !compact && 'whitespace-pre-wrap')}>
              {compact ? s.text.replace(/\s+/g, ' ') : s.text}
            </span>
          : <RefChip key={i} info={resolve(s.key)} />,
      )}
    </div>
  );
}

/**
 * The references a plain-language rule makes, by name — and any that name
 * nothing on this assessment, which would otherwise reach the model as a key
 * it is told nothing about.
 */
export function StatementMentions({
  text,
  resolve,
  className,
}: {
  text: string;
  resolve: RefResolver;
  className?: string;
}) {
  const refs = distinctRefs(statementSegments(text)).map(resolve);
  if (refs.length === 0) return null;
  const unknown = refs.filter((r) => !r.known);
  return (
    <div className={cn('space-y-1 text-xs text-muted-foreground', className)}>
      <div className="leading-relaxed">
        <span className="mr-1.5 font-medium text-foreground/70">Mentions</span>
        {refs.map((r) => <RefChip key={r.key} info={r} showKey />)}
      </div>
      {unknown.length > 0 && (
        <div className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {unknown.length === 1 ? 'One reference does' : `${unknown.length} references do`} not
            match anything on this assessment. Pick it from the list rather than typing it.
          </span>
        </div>
      )}
    </div>
  );
}

function RefChip({ info, showKey = false }: { info: RefInfo; showKey?: boolean }) {
  return (
    <span
      title={info.title}
      className={cn(
        // One unit: a chip broken across a line reads as two things.
        'mx-0.5 inline-block whitespace-nowrap rounded px-1 py-px text-[11px] leading-snug ring-1 ring-inset',
        info.known
          ? 'bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900'
          : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
      )}
    >
      {info.known ? info.name : info.key}
      {info.known && info.qualifier && (
        <span className="ml-1 text-[10px] opacity-70">· {info.qualifier}</span>
      )}
      {!info.known && <span className="ml-1 text-[10px]">· not found</span>}
      {showKey && info.known && (
        <span className="ml-1 font-mono text-[10px] opacity-60">{info.key}</span>
      )}
    </span>
  );
}
