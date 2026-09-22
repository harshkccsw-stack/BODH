import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Download,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MqtChoice } from './question-form-modal';
import { parseQuestionRows, QuestionPreview } from './question-bulk-upload';
import {
  buildImportPlan,
  defaultDecision,
  diffFacts,
  groupPathsByRoot,
  groupSheetSections,
  readingFacts,
  renameKeys,
  sectionInstructions,
  sectionIdsForRows,
  type FactChange,
  type PathGroup,
  type ReadingFacts,
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
  type SheetCsv,
  type SheetMappingResponse,
} from './questionImportApi';
import type { QuestionResponse } from './questionApis';
import {
  questionnairesApi,
  type SectionResponse,
} from '@/pages/questionnaires/questionnairesApi';

/**
 * The sectioned questionnaire an import is landing in. Absent for the bank
 * page and for flat questionnaires — both of which take questions with no
 * section at all.
 */
export interface AiSectionTarget {
  questionnaireId: number;
  /** Whether the questionnaire groups its questions at all. */
  hasSections: boolean;
  sections: { sectionId: number; name: string }[];
  /** Sections created here, so the page behind the modal can show them. */
  onSectionsCreated?: (created: SectionResponse[]) => void;
  /** Turn sections on for a flat questionnaire whose sheet names some. */
  enableSections?: () => Promise<void>;
}

/** What a sheet section name was pointed at. 'new' creates it, 'none' leaves the rows unplaced. */
type SectionChoice = string;

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
  questionnaire,
  notes,
}: {
  file: File;
  choices: MqtChoice[];
  onBack: () => void;
  onImported: (created: QuestionResponse[], sectionIds: (number | null)[]) => void | Promise<void>;
  /** True while the import transaction is in flight — the host disables its own escape hatch. */
  onBusyChange?: (busy: boolean) => void;
  /** The questionnaire being imported into, sectioned or not. Absent on the bank page. */
  questionnaire?: AiSectionTarget;
  /** What the uploader said about their sheet before it was read. */
  notes?: string;
}) {
  const [step, setStep] = useState<'mapping' | 'summary' | 'qualities' | 'sections' | 'review'>('mapping');
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
    promise: Promise<{ res: SheetMappingResponse; sheets: SheetCsv[]; grids: Record<string, string[][]> }>;
  } | null>(null);

  /**
   * The workbook as it was read, kept so a correction can be sent without
   * opening the file again — and so the grids survive a revision that moves
   * to a different tab.
   */
  const [workbook, setWorkbook] = useState<{ sheets: SheetCsv[]; grids: Record<string, string[][]> } | null>(null);

  /**
   * Take a reading. `keep` carries the quality decisions already made across
   * to every path the revision left alone — a correction about which column
   * holds the stem should not cost the author the choices they made about
   * their taxonomy.
   */
  /**
   * How the sheet is being read right now, and what the last correction
   * changed about it. Without this a re-read is a wall of text that may or
   * may not differ from the wall before it — the one question worth
   * answering is "did that do anything?".
   */
  const [facts, setFacts] = useState<ReadingFacts | null>(null);
  const [changes, setChanges] = useState<FactChange[] | null>(null);

  const applyMapping = (
    res: SheetMappingResponse,
    grids: Record<string, string[][]>,
    keep: boolean,
  ) => {
    const next = readingFacts(res);
    setChanges(keep && facts ? diffFacts(facts, next) : null);
    setFacts(next);
    setMapping(res);
    setRows(res.rows.map((r) => ({ ...r })));
    setSources(res.sources ?? []);
    setGrid(grids[res.sheet ?? ''] ?? []);
    setIdx(0);
    setDecisions((prev) => {
      const next: Record<string, PathDecision> = {};
      for (const p of res.paths) next[p.pathKey] = (keep ? prev[p.pathKey] : undefined) ?? defaultDecision(p);
      return next;
    });
  };

  useEffect(() => {
    if (inflight.current?.file !== file) {
      inflight.current = {
        file,
        promise: (async () => {
          const { sheets, grids } = await readWorkbookForImport(file);
          const res = await questionImportApi.mapSheet(sheets, file.name, notes);
          return { res: res.data, sheets, grids };
        })(),
      };
    }
    let cancelled = false;
    inflight.current.promise
      .then(({ res, sheets, grids }) => {
        if (cancelled) return;
        setWorkbook({ sheets, grids });
        applyMapping(res, grids, false);
        setStep('summary');
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.response?.data?.message || e?.message || 'Could not map this sheet');
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  /* ── corrections ────────────────────────────────────────────────────────
   * A wrong reading used to mean starting over: choose the file again and
   * hope. Instead the reading itself is sent back with what the reviewer says
   * about it, so the model revises a few dozen lines of spec rather than
   * re-deriving the sheet — the rows, the paths and the duplicate check are
   * recomputed from the workbook on the server either way.
   *
   * Every correction so far travels on every turn: they are one-liners, and
   * sending only the newest lets the model quietly undo an earlier one.
   */
  const [instructions, setInstructions] = useState<string[]>([]);
  const [instructionDraft, setInstructionDraft] = useState('');
  const [refining, setRefining] = useState(false);

  const refine = async () => {
    const text = instructionDraft.trim();
    if (!text || !workbook || !mapping) return;
    const all = [...instructions, text];
    setRefining(true);
    setError('');
    try {
      const res = await questionImportApi.refineSheet(
        workbook.sheets, file.name, notes, mapping.spec, all);
      applyMapping(res.data, workbook.grids, true);
      setInstructions(all);
      setInstructionDraft('');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not read the sheet again');
    } finally {
      setRefining(false);
    }
  };

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

  /*
   * Sections, when the sheet carries them and the target questionnaire uses
   * them. The mapper already has a `section` slot (SheetMappingSpec.ColumnMap)
   * and the parser already hands the raw cell back per row — all that was
   * missing is saying where each of the sheet's own names goes here.
   *
   * Grouped case-insensitively, exactly as the template upload's matchSections
   * compares them, so the two paths cannot disagree about what counts as the
   * same section. A sheet with no section column produces no groups at all
   * and no step: those questions arrive unplaced and the author sorts them
   * in Step 2, which is the only honest answer when the sheet never said.
   */
  const sheetSections = useMemo(() => groupSheetSections(parsed.sections), [parsed]);

  /*
   * A flat questionnaire whose sheet names sections is the case that used to
   * fail silently: the step never appeared and every section value was
   * dropped on the floor. It appears now, says so, and offers the switch.
   */
  const [sectionsOn, setSectionsOn] = useState(questionnaire?.hasSections ?? false);
  const [enabling, setEnabling] = useState(false);
  const sectionStep = questionnaire != null && sheetSections.length > 0;

  const enableSections = async () => {
    if (!questionnaire?.enableSections) return;
    setEnabling(true);
    setError('');
    try {
      await questionnaire.enableSections();
      setSectionsOn(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not turn sections on');
    } finally {
      setEnabling(false);
    }
  };
  const existingByName = useMemo(() => {
    const m = new Map<string, { sectionId: number; name: string }>();
    for (const sec of questionnaire?.sections ?? []) {
      const key = sec.name.trim().toLowerCase();
      // A duplicate name cannot be pointed at safely — leave the first.
      if (!m.has(key)) m.set(key, sec);
    }
    return m;
  }, [questionnaire]);

  // sheet section (lowercased) → 'id:<n>' | 'new' | 'none'.
  const [sectionChoice, setSectionChoice] = useState<Record<string, SectionChoice>>({});
  useEffect(() => {
    if (!sectionStep) return;
    setSectionChoice((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const s of sheetSections) {
        if (next[s.key] != null) continue;
        const hit = existingByName.get(s.key);
        next[s.key] = hit ? `id:${hit.sectionId}` : 'new';
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [sectionStep, sheetSections, existingByName]);

  /**
   * How many rows the reading covered — what the three tallies reconcile.
   * Taken from the spec's own range so it is the sheet's arithmetic, not
   * ours; falls back to what came out when the range is missing.
   */
  const rowsRead = useMemo(() => {
    const range = (mapping?.spec as { dataRows?: { from?: number; to?: number } } | undefined)?.dataRows;
    if (range?.from != null && range?.to != null) return Math.max(0, range.to - range.from + 1);
    return (mapping?.rows.length ?? 0) + (mapping?.skipped?.length ?? 0);
  }, [mapping]);

  const unusedColumns = mapping?.unusedColumns ?? [];
  /** Unused columns whose NAME suggests they carry the section — worth singling out. */
  const sectionLikeUnused = useMemo(
    () => unusedColumns.filter((c) => /\b(section|part|module|block)\b/i.test(c)),
    [unusedColumns],
  );
  /** Tabs of the workbook the reading never opened. The question sheet is the one it did. */
  const unusedSheets = useMemo(
    () => (workbook?.sheets ?? [])
      .map((sheet) => sheet.name)
      .filter((name) => name !== (mapping?.sheet ?? '')),
    [workbook, mapping],
  );

  /** Rows the sheet said nothing about — they land unassigned either way. */
  const unplacedRows = !sectionsOn
    ? 0
    : parsed.sections.filter((cell) => !(cell || '').trim()).length;

  /** Rows that will arrive in a section, for the line above the Create button. */
  const placedRows = !sectionsOn ? 0 : parsed.sections.filter((cell) => {
    const key = (cell || '').trim().toLowerCase();
    return key !== '' && (sectionChoice[key] ?? 'new') !== 'none';
  }).length;

  const unresolved = (mapping?.paths ?? []).filter((p) =>
    needsAttention(p, decisions[p.pathKey] ?? defaultDecision(p)));
  const ready = parsed.payloads.length > 0 && parsed.errors.length === 0 && unresolved.length === 0;

  /**
   * Turn the sheet's section names into ids of THIS questionnaire, creating
   * the ones the author chose to create.
   *
   * Runs BEFORE the questions are imported, deliberately: a section left over
   * from a failed import is empty, visible and one click to delete, whereas
   * questions that arrive with nowhere to go have to be re-placed by hand.
   * Names are matched the way the template upload matches them — trimmed and
   * case-insensitive.
   */
  const resolveSectionIds = async (): Promise<(number | null)[]> => {
    if (!questionnaire || !sectionsOn) return parsed.payloads.map(() => null);
    const idByKey = new Map<string, number>();
    const created: SectionResponse[] = [];
    // A workbook that keeps its section names on another tab usually keeps
    // their preambles there too — carry them onto the sections being created.
    const preambles = sectionInstructions(mapping?.spec);
    for (const s of sheetSections) {
      const choice = sectionChoice[s.key] ?? 'new';
      if (choice === 'none') continue;
      if (choice.startsWith('id:')) {
        idByKey.set(s.key, Number(choice.slice(3)));
        continue;
      }
      const res = await questionnairesApi.createQuestionnaireSection(
        questionnaire.questionnaireId,
        { name: s.value, instruction: preambles.get(s.key) ?? null },
      );
      created.push(res.data);
      idByKey.set(s.key, res.data.sectionId);
    }
    if (created.length > 0) questionnaire.onSectionsCreated?.(created);
    return sectionIdsForRows(parsed.sections, idByKey);
  };

  const submit = async () => {
    setSubmitting(true);
    onBusyChange?.(true);
    setError('');
    try {
      const sectionIds = await resolveSectionIds();
      const payload: QuestionImportPayload = {
        newQualities: plan.newQualities,
        newQualityTypes: plan.newQualityTypes,
        questions: parsed.payloads,
      };
      const res = await questionImportApi.importQuestions(payload);
      await onImported(res.data.questions, sectionIds);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Import failed');
    } finally {
      setSubmitting(false);
      onBusyChange?.(false);
    }
  };

  /**
   * The one way a path's key ever changes — re-anchoring it under the node the
   * resolver found (G1), and renaming a quality or type the sheet named badly.
   * Both are the same operation: ask the server what the NEW keys resolve to,
   * rewrite every score cell that carried an old one so the rows and the
   * resolver agree, and carry `sources`, `paths` and `decisions` across.
   *
   * Two paths can be rewritten onto one key — renaming "Drive (v2)" to "Drive"
   * when a "Drive" block already exists. They are merged, question counts
   * added: the author has said they were one quality all along. A rewritten
   * path always takes a FRESH default decision, because the choice that was
   * made was about a name that no longer exists — a rename that now matches
   * an existing type must not stay stuck on "create".
   */
  const [busyPaths, setBusyPaths] = useState<string | null>(null);
  const rewritePaths = async (changes: { from: string; to: string }[], busyKey: string) => {
    if (!mapping) return;
    const real = changes.filter((c) => c.from !== c.to);
    if (real.length === 0) return;
    const byFrom = new Map(real.map((c) => [c.from, c.to]));

    // Where every path lands, and with how many questions once merges are counted.
    const counts = new Map<string, number>();
    for (const p of mapping.paths) {
      const key = byFrom.get(p.pathKey) ?? p.pathKey;
      counts.set(key, (counts.get(key) ?? 0) + p.questionCount);
    }
    const wanted = [...new Set(byFrom.values())].map((key) => ({
      pathKey: key,
      questionCount: counts.get(key) ?? 0,
    }));

    setBusyPaths(busyKey);
    setError('');
    try {
      const res = await questionImportApi.resolvePaths(wanted);
      const resolved = new Map(res.data.map((p) => [p.pathKey, p]));
      if (resolved.size === 0) throw new Error('The server returned no resolution for the new path');

      setRows((prev) => prev.map((row) => real.reduce((r, c) => rewriteScoreCells(r, c.from, c.to), row)));
      setSources((prev) => prev.map((src) => {
        const to = byFrom.get(src.pathKey);
        return to ? { ...src, pathKey: to, path: to.split(SEP) } : src;
      }));
      setMapping((prev) => {
        if (!prev) return prev;
        const next: PathProposal[] = [];
        const seen = new Set<string>();
        for (const p of prev.paths) {
          const key = byFrom.get(p.pathKey) ?? p.pathKey;
          if (seen.has(key)) continue;
          seen.add(key);
          const proposal = resolved.get(key) ?? p;
          next.push({ ...proposal, questionCount: counts.get(key) ?? proposal.questionCount });
        }
        return { ...prev, paths: next };
      });
      setDecisions((prev) => {
        const next: Record<string, PathDecision> = {};
        for (const [key, decision] of Object.entries(prev)) {
          if (!byFrom.has(key)) next[key] = decision;
        }
        for (const p of res.data) next[p.pathKey] = defaultDecision(p);
        return next;
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not rewrite that quality');
    } finally {
      setBusyPaths(null);
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
        <StepBack label="Use the template instead" onClick={onBack} />
        <Box tone={mapping.confident ? 'primary' : 'amber'} icon={mapping.confident ? Sparkles : CircleHelp}>
          <p className="font-medium mb-1">
            {mapping.confident ? 'How I read your sheet' : 'How I read your sheet — not certain'}
          </p>
          <p>{mapping.summary}</p>
        </Box>

        {/* The arithmetic, before the prose. A wrong reading shows up in these
            three numbers long before anybody reads a stem. */}
        <div className="grid grid-cols-3 gap-2">
          <Tally n={rowsRead} label={rowsRead === 1 ? 'row read' : 'rows read'} />
          <Tally n={mapping.rows.length} label="questions made" tone="primary" />
          <Tally
            n={mapping.skipped?.length ?? 0}
            label="rows left out"
            tone={(mapping.skipped?.length ?? 0) > 0 ? 'amber' : 'muted'}
          />
        </div>

        {mapping.blockers.length > 0 && (
          <Box tone="red" icon={AlertTriangle}>
            <p className="font-medium mb-1">This sheet could not be read:</p>
            {mapping.blockers.slice(0, 10).map((b, i) => <p key={i}>• {b}</p>)}
          </Box>
        )}

        {(mapping.skipped?.length ?? 0) > 0 && (
          <Box tone="amber" icon={TriangleAlert}>
            <p className="font-medium mb-1">
              {mapping.skipped.length} row{mapping.skipped.length === 1 ? '' : 's'} could not
              become a question — everything else still imports
            </p>
            {mapping.skipped.slice(0, 8).map((sk) => (
              <p key={sk.row}>• Row {sk.row}: {sk.why.replace(/^Row \d+[:.]?\s*/, '')}</p>
            ))}
            {mapping.skipped.length > 8 && <p>…and {mapping.skipped.length - 8} more.</p>}
          </Box>
        )}

        {/* The specific miss worth naming: a column that looks like it says
            which section a question is in, which the reading did not use. It
            is the difference between a questionnaire with six parts and one
            long list, and it is fixable from the box below. */}
        {sectionLikeUnused.length > 0 && (
          <Box tone="amber" icon={TriangleAlert}>
            <p>
              <strong>{sectionLikeUnused.join(' · ')}</strong>{' '}
              {sectionLikeUnused.length === 1 ? 'was' : 'were'} not used. If that column says which
              section each question belongs to, say so below and read the sheet again — otherwise
              every question arrives in one flat list.
            </p>
          </Box>
        )}

        {(unusedColumns.length > 0 || unusedSheets.length > 0) && (
          <Box tone="muted" icon={CircleHelp}>
            <p className="font-medium mb-1 text-foreground">Not used by this import</p>
            {unusedColumns.length > 0 && (
              <p>Columns: {unusedColumns.join(' · ')}</p>
            )}
            {unusedSheets.length > 0 && (
              <p>Other tabs: {unusedSheets.join(' · ')}</p>
            )}
            <p className="opacity-80">
              Nothing from these reaches the question bank. If something there matters, say so
              below and read the sheet again — or put it in the template by hand.
            </p>
          </Box>
        )}

        {mapping.questions.length > 0 && (
          <Box tone="amber" icon={CircleHelp}>
            <p className="font-medium mb-1">Worth confirming:</p>
            {mapping.questions.map((q, i) => <p key={i}>• {q}</p>)}
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

        {changes != null && (
          changes.length === 0 ? (
            <Box tone="amber" icon={TriangleAlert}>
              <p>
                That correction changed nothing about how the sheet is read. Try naming the
                column or the rows outright — or use the template, which always works.
              </p>
            </Box>
          ) : (
            <Box tone="primary" icon={Check}>
              <p className="font-medium mb-1">What that changed</p>
              {changes.map((c) => (
                <p key={c.label}>
                  {c.label}: <span className="line-through opacity-70">{c.from}</span> → <strong>{c.to}</strong>
                </p>
              ))}
            </Box>
          )
        )}

        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            Not quite right? Say what to change
          </p>
          {instructions.length > 0 && (
            <ul className="space-y-0.5">
              {instructions.map((text, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[0.6875rem] text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={instructionDraft}
            onChange={(e) => setInstructionDraft(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder={'e.g. the question text is column C, not B · rows 80–92 are validity items '
              + '· "Domain" is the quality and "Construct" its type · the scale is 1–7, not 1–5'}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.625rem] text-muted-foreground">
              It corrects the reading it already has — your questions are copied from the sheet
              either way, never rewritten.
            </p>
            <Button variant="outline" size="sm" onClick={refine} disabled={refining || !instructionDraft.trim()}>
              {refining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Read it again
            </Button>
          </div>
        </div>

        {error && <Box tone="red" icon={AlertTriangle}>{error}</Box>}

        {/* Why the forward button is dead. It was disabled on an empty batch
            long before corrections existed, but a reader looking at a list of
            blockers should not have to infer the connection. */}
        {rows.length === 0 && (
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-500">
            This reading produced no questions, so there is nothing to continue with. Correct it
            above, or use the template.
          </p>
        )}

        <Footer
          onBack={onBack}
          backLabel="Use the template instead"
          next={() => setStep('qualities')}
          nextLabel="That's right — continue"
          nextDisabled={rows.length === 0 || refining}
          onDownload={rows.length > 0 ? downloadGenerated : undefined}
        />
      </div>
    );
  }

  /* ── 2. the qualities: what exists, what does not ──────────────────────── */

  if (step === 'qualities') {
    return (
      <div className="space-y-4">
        <StepBack label="How I read your sheet" onClick={() => setStep('summary')} />
        <p className="text-xs text-muted-foreground">
          Each question is scored against the quality its row names — one block per measured
          quality, its types beneath it. Rename anything the sheet worded badly: the name is
          re-checked against what you already have, so cleaning it up can turn a new quality
          into one you own.
        </p>
        <div className="space-y-2">
          {groupPathsByRoot(mapping.paths).map((group) => (
            <PathGroupBlock
              key={group.key}
              group={group}
              choices={choices}
              decisions={decisions}
              busy={busyPaths === group.key}
              onChange={(pathKey, d) => setDecisions((prev) => ({ ...prev, [pathKey]: d }))}
              onBulk={(mode) => setDecisions((prev) => {
                const next = { ...prev };
                for (const path of group.paths) {
                  // "Create" is not a legal answer for a path that already
                  // resolves, or one the resolver could not pin down — the
                  // bulk button must not set what a single row cannot.
                  if (mode === 'create'
                    && (path.fullyResolved || path.segments.some((sg) => sg.status === 'AMBIGUOUS'))) continue;
                  next[path.pathKey] = { mode, mqtId: prev[path.pathKey]?.mqtId };
                }
                return next;
              })}
              onReanchor={(root) => rewritePaths(
                group.paths
                  .filter((path) => root.suggestedPath)
                  .map((path) => ({ from: path.pathKey, to: reanchoredKey(path, root.suggestedPath!) })),
                group.key,
              )}
              onRename={(anchorKey, segmentIndex, name) => rewritePaths(
                renameKeys(mapping.paths, anchorKey, segmentIndex, name),
                group.key,
              )}
            />
          ))}
          {mapping.paths.length === 0 && (
            <p className="rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground italic">
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
          next={() => { setIdx(0); setStep(sectionStep ? 'sections' : 'review'); }}
          nextLabel={sectionStep ? 'Place the sections' : 'Review questions'}
          nextDisabled={unresolved.length > 0}
        />
      </div>
    );
  }

  /* ── 2b. the sheet's sections → this questionnaire's ───────────────────── */

  if (step === 'sections' && questionnaire) {
    return (
      <div className="space-y-4">
        <StepBack label="Qualities" onClick={() => setStep('qualities')} />
        {sectionsOn ? (
          <Box tone="primary" icon={Layers}>
            <p className="font-medium mb-1">This sheet names its own sections</p>
            <p>
              Say where each one belongs. A section you create here is added to the
              questionnaire straight away, before any question is imported.
            </p>
          </Box>
        ) : (
          <Box tone="amber" icon={TriangleAlert}>
            <p className="font-medium mb-1">
              This sheet groups its questions into {sheetSections.length} section
              {sheetSections.length === 1 ? '' : 's'} — this questionnaire does not use sections
            </p>
            <p>
              Turn them on and each group becomes a section of this questionnaire. Leave them off
              and the grouping is dropped: the questions still import, in one flat list.
            </p>
            {questionnaire.enableSections && (
              <Button variant="primary" className="mt-1" onClick={enableSections} disabled={enabling}>
                {enabling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                Turn sections on
              </Button>
            )}
          </Box>
        )}

        <div className={`rounded-lg border border-border divide-y divide-border ${sectionsOn ? '' : 'opacity-60'}`}>
          {sheetSections.map((s) => {
            const choice = sectionChoice[s.key] ?? 'new';
            const exists = existingByName.get(s.key);
            return (
              <div key={s.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.value}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {s.count} question{s.count === 1 ? '' : 's'} in the sheet
                  </p>
                </div>
                <select
                  value={sectionsOn ? choice : 'none'}
                  disabled={!sectionsOn}
                  onChange={(e) => setSectionChoice((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="h-8 max-w-[15rem] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary disabled:opacity-60"
                >
                  {/* Only offered when nothing here already carries the name —
                      two sections with one name would break the template
                      upload's by-name matching from then on. */}
                  {!exists && (
                    <option value="new">
                      Create section “{s.value}”
                      {sectionInstructions(mapping?.spec).has(s.key) ? ' (with its instruction)' : ''}
                    </option>
                  )}
                  {(questionnaire.sections ?? []).map((sec) => (
                    <option key={sec.sectionId} value={`id:${sec.sectionId}`}>{sec.name}</option>
                  ))}
                  <option value="none">Leave unassigned</option>
                </select>
              </div>
            );
          })}
        </div>

        {sectionsOn && unplacedRows > 0 && (
          <Box tone="amber" icon={TriangleAlert}>
            {unplacedRows} question{unplacedRows === 1 ? '' : 's'} name no section in the sheet.
            They arrive unassigned — place them in Step 2 before saving.
          </Box>
        )}
        {error && <Box tone="red" icon={AlertTriangle}>{error}</Box>}

        <Footer
          onBack={() => setStep('qualities')}
          next={() => { setIdx(0); setStep('review'); }}
          nextLabel="Review questions"
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
      <StepBack
        label={sectionStep ? 'Sections' : 'Qualities'}
        onClick={() => setStep(sectionStep ? 'sections' : 'qualities')}
      />
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

      {questionnaire && sectionsOn && (
        <Box tone="muted" icon={Layers}>
          <p>
            {placedRows > 0 && `${placedRows} of these go straight into their section. `}
            {parsed.payloads.length - placedRows > 0
              ? `${parsed.payloads.length - placedRows} arrive unassigned — place them in Step 2 before saving.`
              : 'Every question has a section.'}
          </p>
        </Box>
      )}
      {error && <Box tone="red" icon={AlertTriangle}>{error}</Box>}

      <div className="flex justify-between gap-2 pt-2 border-t border-border">
        <Button
          variant="outline"
          onClick={() => (idx === 0 ? setStep(sectionStep ? 'sections' : 'qualities') : setIdx(idx - 1))}
          disabled={submitting}
        >
          {idx === 0 ? 'Back' : 'Previous'}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadGenerated} disabled={submitting}>
            <Download className="h-3.5 w-3.5" /> Download sheet
          </Button>
          {/* Paging through 90 cards to reach the only button that imports is
              not review, it is a toll. The import is offered from the first
              card; Next stays the filled button while there is more to see,
              so looking through them remains the path of least resistance. */}
          {idx < parsed.payloads.length - 1 && (
            <Button variant="outline" onClick={submit} disabled={!ready || submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Import All Questions
            </Button>
          )}
          {idx < parsed.payloads.length - 1 ? (
            <Button variant="primary" onClick={() => setIdx(idx + 1)} disabled={submitting}>
              Next <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="primary" onClick={submit} disabled={!ready || submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Import {parsed.payloads.length} question{parsed.payloads.length === 1 ? '' : 's'}
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

/**
 * The way back, at the TOP of a step as well as the bottom. The qualities
 * step of a 90-item sheet is several screens long, and a Back that can only
 * be reached by scrolling past everything is not really a way back. Sticky,
 * so it stays put while the step scrolls under it.
 */
function StepBack({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="sticky -top-4 z-10 -mx-1 bg-card/95 px-1 py-2 backdrop-blur">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {label}
      </button>
    </div>
  );
}

/** One number of the reconciliation, big enough to read at a glance. */
function Tally({ n, label, tone = 'muted' }: { n: number; label: string; tone?: 'muted' | 'primary' | 'amber' }) {
  const colour = tone === 'primary' ? 'text-primary'
    : tone === 'amber' ? 'text-amber-600 dark:text-amber-500'
      : 'text-foreground';
  return (
    <div className="rounded-lg border border-border px-3 py-2 text-center">
      <p className={`text-lg font-semibold leading-tight ${colour}`}>{n}</p>
      <p className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

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

/**
 * One measured quality and every type the sheet named under it. The header
 * carries what belongs to the quality as a whole — its name, its total
 * question count, the re-anchor that would move all of it, and the two bulk
 * answers — and each row below answers for one type.
 */
export function PathGroupBlock({
  group,
  choices,
  decisions,
  busy,
  onChange,
  onBulk,
  onReanchor,
  onRename,
}: {
  group: PathGroup;
  choices: MqtChoice[];
  decisions: Record<string, PathDecision>;
  busy?: boolean;
  onChange: (pathKey: string, d: PathDecision) => void;
  onBulk: (mode: PathDecision['mode']) => void;
  /** Absent where there is nothing to re-anchor — the template upload. */
  onReanchor?: (root: PathSegment) => void;
  /**
   * Absent where the names are the author's own rather than the model's: on
   * the template path a wrong name is fixed in the sheet, not here.
   */
  onRename?: (anchorKey: string, segmentIndex: number, name: string) => void;
}) {
  const root = group.paths[0]?.segments[0];
  const marker = MARKERS[root?.status ?? 'CREATE'] ?? MARKERS.CREATE;
  // Any path of the group anchors a root rename — renameKeys walks the rest.
  const anchorKey = group.paths[0]?.pathKey ?? '';
  const status = root?.status === 'CREATE' ? 'new measured quality'
    : root?.status === 'AMBIGUOUS' ? 'more than one quality has this name'
      : root?.status === 'MATCHED_NORMALISED' ? 'matched loosely to one you have'
        : 'already in your taxonomy';
  const canCreateAny = group.paths.some((p) =>
    !p.fullyResolved && !p.segments.some((sg) => sg.status === 'AMBIGUOUS'));
  const typed = group.paths.filter((p) => p.segments.length > 1).length;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className={`font-mono font-bold ${marker.className}`}>{marker.mark}</span>
            {onRename ? (
              <EditableName
                value={root?.name ?? ''}
                disabled={busy}
                title="Rename this measured quality"
                className="font-medium"
                onSave={(name) => onRename(anchorKey, 0, name)}
              />
            ) : (
              <span className="font-medium break-words">{root?.name ?? ''}</span>
            )}
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            {status} · {group.questionCount} question{group.questionCount === 1 ? '' : 's'}
            {typed > 0 && ` · ${typed} type${typed === 1 ? '' : 's'}`}
          </p>
          {root?.note && <p className="text-[0.6875rem] text-muted-foreground">{root.note}</p>}
          {onReanchor && root?.status === 'CREATE' && root.suggestedMqtId != null && root.suggestedPath && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReanchor(root)}
              className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-0.5 text-[0.6875rem] font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
              Anchor {group.paths.length === 1 ? 'it' : `all ${group.paths.length}`} under {root.suggestedPath}
            </button>
          )}
        </div>
        {/* Bulk answers only where there is more than one thing to answer. */}
        {group.paths.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {canCreateAny && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onBulk('create')}
                className="rounded-lg border border-border px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:border-primary/40 disabled:opacity-40"
              >
                Create all
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onBulk('unmapped')}
              className="rounded-lg border border-border px-2 py-1 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:border-primary/40 disabled:opacity-40"
            >
              Leave all unmapped
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-border">
        {group.paths.map((path) => (
          <PathRow
            key={path.pathKey}
            path={path}
            choices={choices}
            busy={!!busy}
            decision={decisions[path.pathKey] ?? defaultDecision(path)}
            onChange={(d) => onChange(path.pathKey, d)}
            onRename={onRename && ((segmentIndex, name) => onRename(path.pathKey, segmentIndex, name))}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A name shown until it is clicked, an input after. Used for every quality
 * and type the sheet proposed: the model tends to carry the sheet's own
 * annotations into the name ("Adaptability (Evolution) — replaced scale"),
 * and that noise is both ugly in the taxonomy and the reason a good name
 * fails to match one you already have. Saving re-resolves the path, so a
 * cleaned-up name can turn a "create" into a match on the spot.
 */
function EditableName({
  value,
  onSave,
  disabled,
  title,
  className,
}: {
  value: string;
  onSave: (name: string) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== value) onSave(name);
  };

  if (!editing) {
    return (
      <span className={`inline-flex min-w-0 items-center gap-1 ${className ?? ''}`}>
        <span className="break-words">{value}</span>
        <button
          type="button"
          disabled={disabled}
          title={title ?? 'Rename'}
          onClick={() => { setDraft(value); setEditing(true); }}
          className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onBlur={commit}
        className="h-6 w-56 max-w-full rounded border border-border bg-background px-1.5 text-xs outline-none focus:border-primary"
      />
      {/* mousedown, not click: the input's blur would otherwise fire first and
          commit the edit before a cancel could be heard. */}
      <button
        type="button"
        title="Save"
        onMouseDown={(e) => { e.preventDefault(); commit(); }}
        className="shrink-0 text-primary"
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        type="button"
        title="Cancel"
        onMouseDown={(e) => { e.preventDefault(); setEditing(false); }}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function PathRow({
  path,
  choices,
  decision,
  onChange,
  onRename,
  busy,
}: {
  path: PathProposal;
  choices: MqtChoice[];
  decision: PathDecision;
  onChange: (d: PathDecision) => void;
  /** Rename segment i of this path. The block owns the root, so i is never 0 here. */
  onRename?: (segmentIndex: number, name: string) => void;
  busy: boolean;
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
          {/* The root belongs to the block around this row, which prints it
              once — repeating it per type is what made a six-type quality
              look like six qualities. A path that names no type at all still
              needs a line here, or its buttons would answer a blank. */}
          {path.segments.length === 1 && (
            <p className="text-xs text-muted-foreground">Scored against the quality itself</p>
          )}
          {path.segments.slice(1).map((segment, offset) => {
            const i = offset + 1;
            const marker = MARKERS[segment.status] ?? MARKERS.CREATE;
            return (
              <div key={i} className="text-xs" style={{ paddingLeft: `${offset * 14}px` }}>
                <span className={`font-mono font-bold mr-1.5 ${marker.className}`}>{marker.mark}</span>
                {onRename ? (
                  <EditableName
                    value={segment.name}
                    disabled={busy}
                    title="Rename this type"
                    className="font-medium"
                    onSave={(name) => onRename(i, name)}
                  />
                ) : (
                  <span className="font-medium break-words">{segment.name}</span>
                )}
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
                {/* G1 — the near miss gets its one click. The root's own
                    re-anchor lives on the block header, where it fixes every
                    type at once instead of offering the same repair per row. */}
                {segment.status === 'CREATE' && segment.suggestedMqtId != null && (
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
