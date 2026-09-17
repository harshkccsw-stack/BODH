import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleHelp,
  Download,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MqtChoice } from './question-form-modal';
import { parseQuestionRows, QuestionPreview } from './question-bulk-upload';
import {
  buildImportPlan,
  defaultDecision,
  needsAttention,
  pathResolver,
  reanchoredKey,
  rewriteScoreCells,
  SEP,
  type PathDecision,
} from './ai-import-plan';
import {
  questionImportApi,
  readWorkbookForImport,
  type PathProposal,
  type PathSegment,
  type QuestionImportPayload,
  type RowSource,
  type SheetMappingResponse,
} from './questionImportApi';
import type { QuestionResponse } from './questionApis';

// ── Mapping somebody else's sheet ───────────────────────────────────────────
// Reached only from the warning screen, only when a picked file has rows but
// no `stem` column, and only when the user presses the button — reading a file
// is free, calling the model is not.
//
// What comes back is rows of the ORDINARY questions template. Everything after
// that point goes through the same validator the manual upload uses, so the
// two paths cannot drift; the download hands out a file that re-enters through
// the same upload button.

/* ===================== the panel ===================== */

export function AiSheetImport({
  file,
  choices,
  onBack,
  onImported,
  onBusyChange,
}: {
  file: File;
  choices: MqtChoice[];
  onBack: () => void;
  onImported: (created: QuestionResponse[]) => void | Promise<void>;
  /** True while the import transaction is in flight — the host disables its own escape hatch. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [step, setStep] = useState<'mapping' | 'summary' | 'qualities' | 'review'>('mapping');
  const [error, setError] = useState('');
  const [mapping, setMapping] = useState<SheetMappingResponse | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  // Kept in step with `rows` through every removal, so "which sheet row was
  // this?" survives editing. Duplicates are keyed on the SOURCE ROW for the
  // same reason — an index into the original array goes stale the moment
  // anything is dropped.
  const [sources, setSources] = useState<RowSource[]>([]);
  const [decisions, setDecisions] = useState<Record<string, PathDecision>>({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ONE call per file. main.tsx runs the app in StrictMode, which mounts,
  // unmounts and remounts every component in development — an effect that
  // simply fires the request would bill OpenAI twice per sheet in dev. The
  // in-flight promise is held on a ref keyed by the file: the second mount
  // finds it and subscribes instead of starting another. A `live` flag alone
  // does not solve this; it only discards the second RESULT.
  const inflight = useRef<{
    file: File;
    promise: Promise<{ res: SheetMappingResponse; grids: Record<string, string[][]> }>;
  } | null>(null);

  useEffect(() => {
    if (inflight.current?.file !== file) {
      inflight.current = {
        file,
        promise: (async () => {
          const { sheets, grids } = await readWorkbookForImport(file);
          const res = await questionImportApi.mapSheet(sheets, file.name);
          return { res: res.data, grids };
        })(),
      };
    }
    let cancelled = false;
    inflight.current.promise
      .then(({ res, grids }) => {
        if (cancelled) return;
        setMapping(res);
        setRows(res.rows.map((r) => ({ ...r })));
        setSources(res.sources ?? []);
        setGrid(grids[res.sheet ?? ''] ?? []);
        const seeded: Record<string, PathDecision> = {};
        for (const p of res.paths) seeded[p.pathKey] = defaultDecision(p);
        setDecisions(seeded);
        setStep('summary');
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Could not map this sheet');
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Source row → the wording that was flagged. A row stays flagged only while
  // its stem still IS that wording: edit it into something new and the
  // "already in the bank" badge, which would then be false, goes away.
  const flaggedStems = useMemo(() => {
    const out = new Map<number, string>();
    for (const d of mapping?.duplicates ?? []) {
      out.set(d.sourceRow, (mapping?.rows[d.index]?.stem ?? '').trim());
    }
    return out;
  }, [mapping]);
  const isDuplicate = (i: number) =>
    flaggedStems.has(sources[i]?.sourceRow ?? -1)
    && flaggedStems.get(sources[i].sourceRow) === (rows[i]?.stem ?? '').trim();
  const duplicatesLeft = rows.filter((_, i) => isDuplicate(i)).length;

  const dropDuplicates = () => {
    const keep = rows.map((_, i) => !isDuplicate(i));
    setRows((prev) => prev.filter((_, i) => keep[i]));
    setSources((prev) => prev.filter((_, i) => keep[i]));
    setIdx(0);
  };

  const plan = useMemo(
    () => buildImportPlan(mapping?.paths ?? [], decisions),
    [mapping, decisions],
  );

  /** Choices plus the nodes about to be created, so the preview can name them. */
  const previewChoices = useMemo<MqtChoice[]>(() => {
    const pending: MqtChoice[] = [];
    plan.pendingNames.forEach((label, id) => {
      const name = label.split(SEP).pop() ?? label;
      pending.push({ id, name, label: `${label}  (new)` });
    });
    return [...choices, ...pending];
  }, [choices, plan]);

  const parsed = useMemo(
    () => parseQuestionRows(rows, previewChoices, pathResolver(plan, choices)),
    [rows, previewChoices, plan, choices],
  );

  const unresolved = (mapping?.paths ?? []).filter((p) =>
    needsAttention(p, decisions[p.pathKey] ?? defaultDecision(p)));
  const ready = parsed.payloads.length > 0 && parsed.errors.length === 0 && unresolved.length === 0;

  const submit = async () => {
    setSubmitting(true);
    onBusyChange?.(true);
    setError('');
    try {
      const payload: QuestionImportPayload = {
        newQualities: plan.newQualities,
        newQualityTypes: plan.newQualityTypes,
        questions: parsed.payloads,
      };
      const res = await questionImportApi.importQuestions(payload);
      await onImported(res.data.questions);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Import failed');
    } finally {
      setSubmitting(false);
      onBusyChange?.(false);
    }
  };

  /**
   * G1 — the sheet's top column named a TYPE, not a quality. Re-root the path
   * under the node the resolver found, then ask the server to resolve the new
   * key, and rewrite every score cell that carried the old one so the
   * resolver and the rows agree.
   */
  const [reanchoring, setReanchoring] = useState<string | null>(null);
  const reanchor = async (path: PathProposal, root: PathSegment) => {
    if (!root.suggestedPath || !mapping) return;
    const newKey = reanchoredKey(path, root.suggestedPath);
    setReanchoring(path.pathKey);
    setError('');
    try {
      const res = await questionImportApi.resolvePaths([{ pathKey: newKey, questionCount: path.questionCount }]);
      const replacement = res.data[0];
      if (!replacement) throw new Error('The server returned no resolution for the new path');
      setRows((prev) => prev.map((r) => rewriteScoreCells(r, path.pathKey, newKey)));
      setSources((prev) => prev.map((src) =>
        src.pathKey === path.pathKey ? { ...src, pathKey: newKey, path: newKey.split(SEP) } : src));
      setMapping((prev) => prev && ({
        ...prev,
        paths: prev.paths.map((p) => (p.pathKey === path.pathKey ? replacement : p)),
      }));
      setDecisions((prev) => {
        const next = { ...prev };
        delete next[path.pathKey];
        next[newKey] = defaultDecision(replacement);
        return next;
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not re-anchor the path');
    } finally {
      setReanchoring(null);
    }
  };

  const downloadGenerated = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'questions');
    // The same reference tab the template ships, so a sheet corrected in Excel
    // can have its score cells rewritten by name or id and still come back
    // through the ordinary upload.
    const mqtRows = choices.length > 0
      ? choices.map((c) => ({ mqtId: c.id, name: c.name, tree: c.label }))
      : [{ mqtId: '', name: 'No MQTs defined yet', tree: '' }];
    const ref = XLSX.utils.json_to_sheet(mqtRows);
    ref['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ref, 'mqts');
    XLSX.writeFile(wb, 'mapped-questions.xlsx');
  };

  /* ── mapping / failure ─────────────────────────────────────────────────── */

  if (step === 'mapping') {
    return (
      <div className="space-y-4">
        {error ? (
          <>
            <Box tone="red" icon={AlertTriangle}>{error}</Box>
            <p className="text-xs text-muted-foreground">
              The template route always works — go back and download it.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading “{file.name}” …
          </div>
        )}
        <Button variant="outline" onClick={onBack}>Back</Button>
      </div>
    );
  }

  if (!mapping) return null;

  /* ── 1. how I read your sheet ──────────────────────────────────────────── */

  if (step === 'summary') {
    return (
      <div className="space-y-4">
        <Box tone={mapping.confident ? 'primary' : 'amber'} icon={mapping.confident ? Sparkles : CircleHelp}>
          <p className="font-medium mb-1">
            {mapping.confident ? 'How I read your sheet' : 'How I read your sheet — not certain'}
          </p>
          <p>{mapping.summary}</p>
        </Box>

        {mapping.questions.length > 0 && (
          <Box tone="amber" icon={CircleHelp}>
            <p className="font-medium mb-1">Worth confirming:</p>
            {mapping.questions.map((q, i) => <p key={i}>• {q}</p>)}
          </Box>
        )}
        {mapping.blockers.length > 0 && (
          <Box tone="red" icon={AlertTriangle}>
            <p className="font-medium mb-1">This sheet could not be read:</p>
            {mapping.blockers.slice(0, 10).map((b, i) => <p key={i}>• {b}</p>)}
          </Box>
        )}
        {mapping.warnings.length > 0 && (
          <Box tone="amber" icon={TriangleAlert}>
            {mapping.warnings.slice(0, 6).map((w, i) => <p key={i}>• {w}</p>)}
          </Box>
        )}

        {duplicatesLeft > 0 && (
          <Box tone="amber" icon={TriangleAlert}>
            <p>
              {duplicatesLeft} of these {rows.length} questions {duplicatesLeft === 1 ? 'is' : 'are'}{' '}
              already in the question bank, word for word. Importing them again makes a second copy.
            </p>
            <button
              type="button"
              onClick={dropDuplicates}
              className="font-medium underline underline-offset-2"
            >
              Drop the {duplicatesLeft === 1 ? 'duplicate' : 'duplicates'} from this batch
            </button>
            <p className="opacity-80">
              Or keep them — a new instrument may reuse a standard item on purpose.
            </p>
          </Box>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              Your sheet, and what was made of it
            </p>
            {rows.slice(0, 3).map((row, i) => (
              <SideBySide
                key={i}
                source={grid[(sources[i]?.sourceRow ?? 0) - 1] ?? []}
                sourceRow={sources[i]?.sourceRow ?? 0}
                row={row}
                pathKey={sources[i]?.pathKey ?? ''}
                reverse={!!sources[i]?.reverseScored}
              />
            ))}
            {rows.length > 3 && (
              <p className="text-xs text-muted-foreground">…and {rows.length - 3} more.</p>
            )}
          </div>
        )}

        <Footer
          onBack={onBack}
          backLabel="Use the template instead"
          next={() => setStep('qualities')}
          nextLabel="That's right — continue"
          nextDisabled={rows.length === 0}
          onDownload={rows.length > 0 ? downloadGenerated : undefined}
        />
      </div>
    );
  }

  /* ── 2. the qualities: what exists, what does not ──────────────────────── */

  if (step === 'qualities') {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Each question is scored against the quality its row names. Ticked rows will be created.
        </p>
        <div className="rounded-lg border border-border divide-y divide-border">
          {mapping.paths.map((path) => (
            <PathRow
              key={path.pathKey}
              path={path}
              choices={choices}
              decision={decisions[path.pathKey] ?? defaultDecision(path)}
              onChange={(d) => setDecisions((prev) => ({ ...prev, [path.pathKey]: d }))}
              onReanchor={(root) => reanchor(path, root)}
              reanchoring={reanchoring === path.pathKey}
            />
          ))}
          {mapping.paths.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground italic">
              This sheet names no measured qualities, so the questions import unscored.
            </p>
          )}
        </div>

        <Box tone="muted" icon={Plus}>
          {plan.newQualities.length + plan.newQualityTypes.length === 0
            ? 'Nothing new will be created — every quality already exists.'
            : `${plan.newQualities.length} measured qualit${plan.newQualities.length === 1 ? 'y' : 'ies'} and ` +
              `${plan.newQualityTypes.length} type${plan.newQualityTypes.length === 1 ? '' : 's'} will be created, ` +
              'in the same step as the questions — if anything fails, none of it is kept.'}
        </Box>

        {unresolved.length > 0 && (
          <Box tone="amber" icon={TriangleAlert}>
            {unresolved.length} path{unresolved.length === 1 ? '' : 's'} still need a choice.
          </Box>
        )}
        {error && <Box tone="red" icon={AlertTriangle}>{error}</Box>}

        <Footer
          onBack={() => setStep('summary')}
          next={() => { setIdx(0); setStep('review'); }}
          nextLabel="Review questions"
          nextDisabled={unresolved.length > 0}
        />
      </div>
    );
  }

  /* ── 3. review, edit, approve ──────────────────────────────────────────── */

  const current = parsed.payloads[idx];
  const removeCurrent = () => {
    const next = rows.filter((_, i) => i !== idx);
    setRows(next);
    setSources((prev) => prev.filter((_, i) => i !== idx));
    if (idx >= next.length) setIdx(Math.max(0, next.length - 1));
  };
  const editCell = (key: string, value: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));

  return (
    <div className="space-y-4">
      <div className="h-1 rounded bg-muted">
        <div
          className="h-1 rounded bg-primary transition-all"
          style={{ width: `${((idx + 1) / Math.max(1, parsed.payloads.length)) * 100}%` }}
        />
      </div>

      {parsed.errors.length > 0 && (
        <Box tone="red" icon={AlertTriangle}>
          {parsed.errors.slice(0, 8).map((e, i) => <p key={i}>• {e}</p>)}
        </Box>
      )}

      {current && (
        <>
          <label className="block space-y-1">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
              Question text — from sheet row {sources[idx]?.sourceRow}
            </span>
            <textarea
              value={rows[idx]?.stem ?? ''}
              onChange={(e) => editCell('stem', e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          {isDuplicate(idx) && (
            <Box tone="amber" icon={TriangleAlert}>
              A question with this exact wording is already in the bank. Creating it makes a
              second copy — remove it below if that is not what you want.
            </Box>
          )}
          <QuestionPreview p={current} choices={previewChoices} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={removeCurrent}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
            >
              <Trash2 className="h-3 w-3" /> Remove this question from the batch
            </button>
          </div>
        </>
      )}

      {error && <Box tone="red" icon={AlertTriangle}>{error}</Box>}

      <div className="flex justify-between gap-2 pt-2 border-t border-border">
        <Button
          variant="outline"
          onClick={() => (idx === 0 ? setStep('qualities') : setIdx(idx - 1))}
          disabled={submitting}
        >
          {idx === 0 ? 'Back' : 'Previous'}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadGenerated} disabled={submitting}>
            <Download className="h-3.5 w-3.5" /> Download sheet
          </Button>
          {idx < parsed.payloads.length - 1 ? (
            <Button variant="primary" onClick={() => setIdx(idx + 1)}>
              Next <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={!ready || submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create {parsed.payloads.length} question{parsed.payloads.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== small pieces ===================== */

const TONES: Record<string, string> = {
  red: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 text-red-700 dark:text-red-400',
  amber: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 text-amber-700 dark:text-amber-500',
  primary: 'border-primary/30 bg-primary/5 text-foreground',
  muted: 'border-border bg-muted/30 text-muted-foreground',
};

function Box({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${TONES[tone]}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-1">{children}</div>
      </div>
    </div>
  );
}

function Footer({
  onBack,
  backLabel = 'Back',
  next,
  nextLabel,
  nextDisabled,
  onDownload,
}: {
  onBack: () => void;
  backLabel?: string;
  next: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  onDownload?: () => void;
}) {
  return (
    <div className="flex justify-between gap-2 pt-2 border-t border-border">
      <Button variant="outline" onClick={onBack}>{backLabel}</Button>
      <div className="flex gap-2">
        {onDownload && (
          <Button variant="outline" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" /> Download sheet
          </Button>
        )}
        <Button variant="primary" onClick={next} disabled={nextDisabled}>
          {nextLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * One sheet row beside what was made of it. This is the check that catches a
 * column read one to the left, and it does it faster than any amount of prose.
 */
function SideBySide({
  source,
  sourceRow,
  row,
  pathKey,
  reverse,
}: {
  source: string[];
  sourceRow: number;
  row: Record<string, string>;
  pathKey: string;
  reverse: boolean;
}) {
  const options = Object.keys(row)
    .filter((k) => /^option\d+$/.test(k) && row[k])
    .map((k) => row[k]);
  return (
    <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-border p-2">
      <div className="min-w-0">
        <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground mb-1">
          Sheet row {sourceRow}
        </p>
        <p className="text-[0.6875rem] text-muted-foreground break-words">
          {source.filter(Boolean).join('  |  ') || '—'}
        </p>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">Becomes</p>
        <p className="text-xs font-medium break-words">{row.stem}</p>
        <p className="text-[0.6875rem] text-muted-foreground break-words">
          {options.join(' · ') || 'no options'}
        </p>
        <p className="text-[0.6875rem] text-muted-foreground">
          {pathKey || 'no quality'}{reverse ? ' · scored in reverse' : ''}
        </p>
      </div>
    </div>
  );
}

const MARKERS: Record<string, { mark: string; className: string }> = {
  MATCHED: { mark: '✓', className: 'text-green-600 dark:text-green-500' },
  MATCHED_NORMALISED: { mark: '~', className: 'text-amber-600 dark:text-amber-500' },
  CREATE: { mark: '+', className: 'text-primary' },
  AMBIGUOUS: { mark: '?', className: 'text-red-600 dark:text-red-400' },
};

function PathRow({
  path,
  choices,
  decision,
  onChange,
  onReanchor,
  reanchoring,
}: {
  path: PathProposal;
  choices: MqtChoice[];
  decision: PathDecision;
  onChange: (d: PathDecision) => void;
  onReanchor: (root: PathSegment) => void;
  reanchoring: boolean;
}) {
  const attention = needsAttention(path, decision);
  // G4 — the matched quality's own types first. Sorted, not filtered: the
  // §5.1 row-four case is precisely one where the right answer sits under a
  // DIFFERENT quality, so hiding those would hide the correct pick.
  const root = path.segments[0];
  const mqName = root && (root.status === 'MATCHED' || root.status === 'MATCHED_NORMALISED') ? root.name : null;
  const under = mqName ? choices.filter((c) => c.label.startsWith(`${mqName}${SEP}`)) : [];
  const elsewhere = mqName ? choices.filter((c) => !c.label.startsWith(`${mqName}${SEP}`)) : choices;
  return (
    <div className="px-3 py-2.5 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          {path.segments.map((segment, i) => {
            const marker = MARKERS[segment.status] ?? MARKERS.CREATE;
            return (
              <div key={i} className="text-xs" style={{ paddingLeft: `${i * 14}px` }}>
                <span className={`font-mono font-bold mr-1.5 ${marker.className}`}>{marker.mark}</span>
                <span className="font-medium">{segment.name}</span>
                {segment.status === 'CREATE' && decision.mode === 'create' && (
                  <span className="ml-1.5 text-[0.6875rem] text-primary">will be created</span>
                )}
                {segment.status === 'MATCHED_NORMALISED' && (
                  <span className="ml-1.5 text-[0.6875rem] text-amber-600 dark:text-amber-500">
                    matched loosely
                  </span>
                )}
                {segment.note && (
                  <p className="text-[0.6875rem] text-muted-foreground mt-0.5">{segment.note}</p>
                )}
                {/* G1 — the two near misses each get their one click. */}
                {segment.status === 'CREATE' && segment.suggestedMqtId != null && i === 0 && (
                  <button
                    type="button"
                    disabled={reanchoring}
                    onClick={() => onReanchor(segment)}
                    className="mt-1 inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-[0.6875rem] font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
                  >
                    {reanchoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                    Anchor under {segment.suggestedPath}
                  </button>
                )}
                {segment.status === 'CREATE' && segment.suggestedMqtId != null && i > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange({ mode: 'existing', mqtId: segment.suggestedMqtId ?? undefined })}
                    className="mt-1 inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-[0.6875rem] font-medium text-primary hover:bg-primary/5"
                  >
                    <Check className="h-3 w-3" /> Use the one at {segment.suggestedPath}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <span className="text-[0.6875rem] text-muted-foreground shrink-0">
          {path.questionCount} question{path.questionCount === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {(['create', 'existing', 'unmapped'] as const).map((mode) => {
          const disabled = mode === 'create' && path.segments.some((s) => s.status === 'AMBIGUOUS');
          const label = mode === 'create' ? 'Create' : mode === 'existing' ? 'Use existing' : 'Leave unmapped';
          if (mode === 'create' && path.fullyResolved) return null;
          return (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ mode, mqtId: decision.mqtId })}
              className={[
                'rounded-lg border px-2 py-1 text-[0.6875rem] font-medium transition-colors',
                decision.mode === mode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40',
                disabled ? 'opacity-40 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {decision.mode === mode && <Check className="inline h-3 w-3 mr-1" />}
              {label}
            </button>
          );
        })}
        {decision.mode === 'existing' && (
          <select
            value={decision.mqtId ?? ''}
            onChange={(e) => onChange({ mode: 'existing', mqtId: e.target.value ? Number(e.target.value) : undefined })}
            className="rounded-lg border border-border bg-background px-2 py-1 text-[0.6875rem] max-w-full"
          >
            <option value="">Pick a measured quality type…</option>
            {under.length > 0 ? (
              <>
                <optgroup label={`Under ${mqName}`}>
                  {under.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </optgroup>
                <optgroup label="Everything else">
                  {elsewhere.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </optgroup>
              </>
            ) : (
              elsewhere.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)
            )}
          </select>
        )}
      </div>

      {attention && (
        <p className="text-[0.6875rem] text-amber-600 dark:text-amber-500">
          Pick one before continuing.
        </p>
      )}
    </div>
  );
}
