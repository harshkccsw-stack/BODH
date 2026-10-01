import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Flag,
  Layers,
  Link2,
  ListChecks,
  Loader2,
  Shuffle,
  Sparkles,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  questionApis,
  selectionLabel,
  type BatchProblem,
  type ExistingStem,
  type MqtScorePayload,
  type QuestionPayload,
  type QuestionResponse,
} from './questionApis';
import { contentMeta, type MqtChoice } from './question-form-modal';
import {
  classifySectionCell,
  collectingResolver,
  groupRowErrors,
  hasOptionColumns,
  LEADING_ITEM_NUMBER,
  looksLikeOurTemplate,
  parseQuestionRows,
  placeRow,
  planAwareResolver,
  sectionCellsAbove,
  stripItemNumber,
  unresolvedCounts,
  warningsForRow,
} from './question-sheet-rules';
import type {
  BlankSectionChoice,
  NameSectionChoice,
  ParsedQuestions,
  RowPlacement,
  SectionRef,
} from './question-sheet-rules';
import {
  buildImportPlan,
  canCreate,
  defaultDecision,
  groupPathsByRoot,
  groupSheetSections,
  needsAttention,
  type ImportPlan,
  type PathDecision,
} from './ai-import-plan';
import { PathGroupBlock } from './ai-sheet-import';
import type { PathProposal } from './questionImportApi';

// The rules themselves live in question-sheet-rules.ts (pure, testable); they
// are re-exported here so nothing that imported them from this file changes.
export {
  looksLikeOurTemplate,
  mqtKeyResolver,
  parseQuestionRows,
  PATH_MARK,
} from './question-sheet-rules';
export type { MqtKeyResolver, ParsedQuestions } from './question-sheet-rules';
import { AiSheetImport } from './ai-sheet-import';
import { questionnairesApi, type SectionResponse } from '@/pages/questionnaires/questionnairesApi';
import { questionImportApi, workbookHasRows } from './questionImportApi';

// ── Bulk XLSX upload — shared by the Questions page and the questionnaire
// wizard's Step 2 ───────────────────────────────────────────────────────────
// ONE template for both flows. One row per question. Headers (case/space-
// insensitive): stem*, type (TEXT/URL/IMAGE/VIDEO — default TEXT), mediaUrl
// (required for non-TEXT), risk (yes/true/1), shuffle (yes/true/1 — deliver
// the options in a random order), selectRule (blank/min/max/equals),
// selectCount (the n that rule applies to), section, scores,
// option1..optionN, option1Scores..optionNScores.
// Score cells: entries separated by | or ",", each "mqtName:score" or
// "mqtId:score"; decimals take a dot.
// The `section` column is used ONLY when uploading inside a sectioned
// questionnaire, where it names a section there. A blank or unknown name is
// not an error — a sections step asks what to do with those rows. The
// Questions page and flat questionnaires ignore the column, which is what
// keeps the template consistent across both flows.
// Parsing happens entirely in the browser; the payload goes to
// /questions/bulk-create, which is all-or-nothing — so ANY row error blocks
// the whole upload rather than importing half a sheet.

/** One tab of a workbook, read for the template upload. */
export interface QuestionWorkbook {
  rows: Record<string, unknown>[];
  /** The tab the rows came from — "questions" when there is one, else the first. */
  sheetName: string;
  /** Other tabs whose header row also has a `stem` column. Nobody reads them. */
  otherStemTabs: string[];
}

export async function readQuestionWorkbook(file: File): Promise<QuestionWorkbook> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  // Prefer the sheet named "questions" (the template ships an "mqts"
  // reference sheet beside it); fall back to the first sheet.
  const sheetName = wb.Sheets['questions'] ? 'questions' : wb.SheetNames[0] ?? '';
  const ws = wb.Sheets[sheetName];
  const rows = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }) : [];
  // Said out loud because only one tab is ever read: a workbook with its
  // questions split over two tabs would otherwise lose one of them silently.
  const otherStemTabs = wb.SheetNames.filter((name) => {
    if (name === sheetName) return false;
    const header = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false })[0] ?? [];
    return header.some((cell) => String(cell ?? '').toLowerCase().replace(/[\s_-]/g, '') === 'stem');
  });
  return { rows, sheetName, otherStemTabs };
}

/**
 * The workbook's rows, untouched. Split out from the parser so the AI import
 * path can look at a sheet BEFORE deciding what it is — see
 * `looksLikeOurTemplate`.
 */
export async function readQuestionSheet(file: File): Promise<Record<string, unknown>[]> {
  return (await readQuestionWorkbook(file)).rows;
}

/** Read + parse, the template upload's entry point. Unchanged signature. */
export async function parseQuestionsXlsx(
  file: File,
  choices: MqtChoice[],
): Promise<ParsedQuestions> {
  return parseQuestionRows(await readQuestionSheet(file), choices);
}

export async function downloadTemplate(choices: MqtChoice[]) {
  const XLSX = await import('xlsx');
  // Column order is the key order below. Three rows so every selection state
  // is demonstrated in the file itself: single choice (both cells blank),
  // "up to n", and "exactly n".
  const ws = XLSX.utils.json_to_sheet([
    {
      stem: 'I enjoy meeting new people.',
      description: 'Answer for how things have been over the last two weeks.',
      type: 'TEXT', mediaUrl: '', risk: 'no', shuffle: 'no',
      selectRule: '', selectCount: '', otherOption: '',
      section: 'Part A',
      scores: 'MqtNameOrId:2 | MqtNameOrId:0.5',
      option1: 'Agree', option1Description: '', option1Scores: 'MqtNameOrId:5',
      option2: 'Neutral', option2Description: '', option2Scores: '',
      option3: 'Disagree', option3Description: '', option3Scores: 'MqtNameOrId:0',
    },
    {
      stem: 'Which diagram shows the correct flow?', description: '', type: 'URL',
      mediaUrl: 'https://example.com/diagram.png', risk: 'yes', shuffle: 'no',
      selectRule: '', selectCount: '', otherOption: '',
      section: 'Part B', scores: '',
      option1: 'The first one', option1Description: '', option1Scores: 'MqtNameOrId:3',
      option2: 'The second one', option2Description: '', option2Scores: '',
      option3: '', option3Description: '', option3Scores: '',
    },
    {
      stem: 'Which of these apply to you? Pick up to two.', description: '',
      type: 'TEXT', mediaUrl: '', risk: 'no',
      shuffle: 'yes',
      selectRule: 'max', selectCount: 2,
      // option3 is the "Other…" row: respondents who pick it type their own
      // answer. Its label and scores are option3's own cells.
      otherOption: 3,
      section: 'Part B', scores: '',
      option1: 'I plan ahead', option1Description: 'Lists, calendars, that sort of thing.',
      option1Scores: 'MqtNameOrId:1',
      option2: 'I improvise', option2Description: '', option2Scores: 'MqtNameOrId:2',
      option3: 'Other', option3Description: 'Tell us in your own words.', option3Scores: 'MqtNameOrId:0',
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'questions');

  // Reference sheet: every MQT with its exact name, id and where it sits in
  // the tree — what the scores columns match against.
  const mqtRows = choices.length > 0
    ? choices.map((c) => ({ mqtId: c.id, name: c.name, tree: c.label }))
    : [{ mqtId: '', name: 'No MQTs defined yet — add them on the Measured Qualities page', tree: '' }];
  const mqtSheet = XLSX.utils.json_to_sheet(mqtRows);
  mqtSheet['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, mqtSheet, 'mqts');

  XLSX.writeFile(wb, 'questions-template.xlsx');
}

/** What the server refused, one line per problem — shown wherever Import was pressed. */
function UploadErrorBox({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="space-y-1 max-h-44 overflow-y-auto">
        {lines.length === 1 ? (
          <p>{lines[0]}</p>
        ) : (
          <>
            <p className="font-medium">Nothing was imported — the server refused these:</p>
            {lines.map((line, i) => <p key={i}>• {line}</p>)}
          </>
        )}
      </div>
    </div>
  );
}

/** Scores the parser skipped rather than guessed at. Amber: the import still goes ahead. */
function SkippedScoresBox({ lines }: { lines: string[] }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="space-y-1 max-h-44 overflow-y-auto">
        <p className="font-medium">Imports, but check these scores afterwards:</p>
        {lines.map((line, i) => <p key={i}>• {line}</p>)}
      </div>
    </div>
  );
}

function ScoreChips({ scores, choices }: { scores: MqtScorePayload[]; choices: MqtChoice[] }) {
  if (scores.length === 0) {
    return <span className="text-xs text-muted-foreground italic">no scores</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {scores.map((s, i) => {
        const c = choices.find((x) => x.id === s.measuredQualityTypeId);
        return (
          <span
            key={i}
            title={c?.label || `MQT #${s.measuredQualityTypeId}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[0.6875rem] font-medium"
          >
            <Target className="h-2.5 w-2.5" />
            {c?.name ?? `#${s.measuredQualityTypeId}`}: {s.score}
          </span>
        );
      })}
    </span>
  );
}

/** One parsed question, rendered for the pre-submit review step. */
export function QuestionPreview({
  p,
  choices,
  sectionName,
}: {
  p: QuestionPayload;
  choices: MqtChoice[];
  /** Matched questionnaire section — only set in sectioned questionnaire uploads. */
  sectionName?: string;
}) {
  const meta = contentMeta(p.contentType);
  const Icon = meta.icon;
  const totalScores = p.mqtScores.length + p.options.reduce((a, o) => a + o.mqtScores.length, 0);
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {sectionName && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <Layers className="h-3 w-3" /> {sectionName}
          </span>
        )}
        {p.selectionRule && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary">
            <ListChecks className="h-3 w-3" />
            {selectionLabel(p.selectionRule, p.selectionCount, p.options.length)}
          </span>
        )}
        {p.shuffleOptions && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
            title="Options are delivered in a random order — different for each respondent. Listed below in the authored order."
          >
            <Shuffle className="h-3 w-3" /> shuffled
          </span>
        )}
        {p.riskFlag && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            <Flag className="h-3 w-3" /> risk
          </span>
        )}
        {p.selectionRule && p.options.length < 2 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="h-3 w-3" /> multi-select with one option
          </span>
        )}
        {totalScores === 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="h-3 w-3" /> no MQT mapping anywhere
          </span>
        )}
      </div>
      <p className="text-sm font-medium">{p.stem}</p>
      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
      {p.mediaUrl && (
        <p className="text-xs text-muted-foreground break-all">
          <Link2 className="inline h-3 w-3 mr-1" />{p.mediaUrl}
        </p>
      )}
      <div className="text-xs space-y-1">
        <span className="font-medium text-muted-foreground uppercase tracking-wider text-[0.6875rem]">Question scores: </span>
        <ScoreChips scores={p.mqtScores} choices={choices} />
      </div>
      <div className="space-y-1.5">
        <p className="font-medium text-muted-foreground uppercase tracking-wider text-[0.6875rem]">
          {p.options.length} option{p.options.length !== 1 ? 's' : ''}
        </p>
        {p.options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No options — is that intended?</p>
        ) : (
          <ul className="space-y-1">
            {p.options.map((o, i) => (
              <li key={i} className="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs">
                    {o.optionText || <span className="italic text-muted-foreground">[{o.contentType.toLowerCase()} only]</span>}
                    {o.contentType === 'FREE_TEXT' && (
                      <span className="ml-1.5 rounded-full border border-primary/30 bg-primary/5 px-1.5 text-[0.625rem] font-medium text-primary">
                        types own answer
                      </span>
                    )}
                  </p>
                  {o.description && (
                    <p className="text-[0.6875rem] text-muted-foreground">{o.description}</p>
                  )}
                  <ScoreChips scores={o.mqtScores} choices={choices} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Questionnaire mode (wizard Step 2). Each row's `section` cell is matched to
 * one of the questionnaire's sections by name. A blank or unknown name is not
 * an error: the sections step asks what should happen to those rows —
 * unassigned (the default; the wizard's Unassigned group), an existing
 * section, a section created for the name, or the name of the row above —
 * and, when NO row names a section, whether to turn the questionnaire's
 * sections off instead. On submit the created bank questions come back
 * through onCreated with their sectionIds (all null on flat questionnaires,
 * where the section column is ignored like on the Questions page) so the
 * wizard can auto-select them into the mapping.
 */
export interface QuestionnaireUploadTarget {
  questionnaireId: number;
  hasSections: boolean;
  sections: { sectionId: number; name: string }[];
  onCreated: (created: QuestionResponse[], sectionIds: (number | null)[]) => Promise<void> | void;
  /** Sections an upload created on its way in, so the page can show them. */
  onSectionsCreated?: (created: SectionResponse[]) => void;
  /**
   * Turn sections ON for this questionnaire. Offered when a foreign sheet
   * turns out to name sections and the questionnaire does not have them —
   * the alternative is dropping that part of the author's work in silence.
   */
  enableSections?: () => Promise<void>;
  /**
   * Turn sections OFF — the same switch as unticking Step 2's "Organize into sections", which
   * deletes the sections and leaves one numbered list. Offered when a sheet
   * names no section at all inside a sectioned questionnaire.
   */
  disableSections?: () => Promise<void>;
}

/** Per parsed question: its sheet row, its section cell, and the nearest non-blank one above it. */
interface RowMeta {
  rowNo: number;
  cell: string | null;
  above: string | null;
}

export function BulkUploadModal({
  choices,
  onClose,
  onDone,
  questionnaire,
}: {
  choices: MqtChoice[];
  onClose: () => void;
  /** Bank mode (Questions page): called after a successful import. */
  onDone?: () => Promise<void> | void;
  /** Present = questionnaire mode; absent = bank mode. */
  questionnaire?: QuestionnaireUploadTarget;
}) {
  // 'fork' is the warning screen a foreign sheet lands on; 'ai' is the mapper.
  // Both are reachable from a file that has rows and no `stem` column, and
  // from one more place: a `stem` sheet with no option columns at all, whose
  // answers are somewhere only the mapper can look for them.
  const [step, setStep] = useState<'pick' | 'fork' | 'ai' | 'qualities' | 'sections' | 'review'>('pick');
  const [foreignFile, setForeignFile] = useState<File | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  // True while the AI panel is writing. "Choose another file" must not be
  // available then: abandoning a transaction mid-flight is fine for the
  // server, but the user would never see whether it landed.
  const [aiBusy, setAiBusy] = useState(false);
  // What the uploader tells the model about their own sheet, before it reads.
  // Typed on the fork screen and kept for the whole conversation — every
  // correction the panel sends carries it too.
  const [aiNotes, setAiNotes] = useState('');
  const [idx, setIdx] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [payloads, setPayloads] = useState<QuestionPayload[]>([]);
  // Parallel to payloads. Kept per ROW rather than as resolved section ids, so
  // the sections step can change its mind and dropping a question in review
  // cannot change what "fill down" gave the rows below it.
  const [rowMeta, setRowMeta] = useState<RowMeta[]>([]);
  const [ignoredSections, setIgnoredSections] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  // Scores skipped rather than guessed — the questions still import.
  const [warnings, setWarnings] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  // What the workbook looked like beyond its rows — all warnings, none blocks.
  const [sheetName, setSheetName] = useState('');
  const [otherStemTabs, setOtherStemTabs] = useState<string[]>([]);
  const [unknownColumns, setUnknownColumns] = useState<string[]>([]);
  const [noOptionColumns, setNoOptionColumns] = useState(false);
  // Stems the bank already holds, by sheet row — re-uploading a sheet would
  // otherwise make a second, independent copy of every question.
  const [existingByRow, setExistingByRow] = useState<Map<number, ExistingStem>>(new Map());
  // Offered, never assumed: a stem's leading "1." is removed only if asked.
  const [stripNumbers, setStripNumbers] = useState(false);
  // The sections step's answers. Unassigned unless somebody says otherwise.
  const [blankChoice, setBlankChoice] = useState<BlankSectionChoice>('none');
  const [nameChoice, setNameChoice] = useState<Record<string, NameSectionChoice>>({});
  // Bumped per file, so a lookup still in flight for the last one is dropped.
  const fileGeneration = useRef(0);

  /*
   * Qualities the sheet names that the bank does not have.
   *
   * <p>They used to end the upload — "no MQT named X" — which meant a sheet
   * bringing its own constructs could not be imported until somebody typed
   * the taxonomy in by hand. The first parse collects them instead, the
   * server resolves them against the live taxonomy (no model, no cost), and
   * this step is where a person says create / use existing / leave unmapped.
   * Everything then goes to /questions/import, which creates the taxonomy and
   * the questions in one transaction or neither.
   */
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [proposals, setProposals] = useState<PathProposal[]>([]);
  const [decisions, setDecisions] = useState<Record<string, PathDecision>>({});

  const sectioned = questionnaire != null && questionnaire.hasSections;
  const sectionRefs = useMemo<SectionRef[]>(() => questionnaire?.sections ?? [], [questionnaire]);

  const plan = useMemo<ImportPlan>(
    () => buildImportPlan(proposals, decisions),
    [proposals, decisions],
  );
  /** Choices plus what is about to be created, so the preview can name them. */
  const previewChoices = useMemo<MqtChoice[]>(() => {
    const pending: MqtChoice[] = [];
    plan.pendingNames.forEach((label, id) => {
      pending.push({ id, name: label.split(' › ').pop() ?? label, label: `${label}  (new)` });
    });
    return [...choices, ...pending];
  }, [choices, plan]);
  const unresolvedLeft = proposals.filter((p) =>
    needsAttention(p, decisions[p.pathKey] ?? defaultDecision(p)));

  /* ── sections ─────────────────────────────────────────────────────────── */

  const cellKinds = useMemo(
    () => (sectioned ? rowMeta.map((m) => classifySectionCell(m.cell, sectionRefs)) : []),
    [sectioned, rowMeta, sectionRefs],
  );
  const blankRows = cellKinds.filter((c) => c.kind === 'blank').length;
  /** No row names a section — the one case where turning sections off is offered. */
  const allBlank = sectioned && payloads.length > 0 && blankRows === payloads.length;
  /** Names the questionnaire does not have, each with how many rows carry it. */
  const unknownNames = useMemo(
    () => groupSheetSections(rowMeta.filter((_, i) => cellKinds[i]?.kind === 'unknown').map((m) => m.cell)),
    [rowMeta, cellKinds],
  );
  const sectionStep = sectioned && (blankRows > 0 || unknownNames.length > 0);
  const placements = useMemo<RowPlacement[]>(
    () => rowMeta.map((m) => (sectioned ? placeRow(m.cell, m.above, sectionRefs, blankChoice, nameChoice) : null)),
    [rowMeta, sectioned, sectionRefs, blankChoice, nameChoice],
  );
  const turningOff = allBlank && blankChoice === 'off';
  const placedCount = turningOff ? 0 : placements.filter((p) => p != null).length;
  const creatingKeys = new Set(placements.flatMap((p) => (p != null && 'createKey' in p ? [p.createKey] : [])));

  /** What the review card says about one question's section. */
  const sectionLabelOf = (i: number): string | undefined => {
    if (!sectioned) return undefined;
    if (turningOff) return 'No sections (turning them off)';
    const p = placements[i];
    if (p == null) return 'Unassigned — place it in Step 2';
    if ('sectionId' in p) return sectionRefs.find((s) => s.sectionId === p.sectionId)?.name;
    return `${unknownNames.find((n) => n.key === p.createKey)?.value ?? p.createKey} (new section)`;
  };

  /* ── leading item numbers ─────────────────────────────────────────────── */

  const numbered = payloads.filter((p) => LEADING_ITEM_NUMBER.test(p.stem)).length;
  // Offered when numbering is the sheet's habit, not when one stem happens to
  // open with "3)" — that one is more likely content than a label.
  const offerStrip = numbered > 0 && numbered * 2 >= payloads.length;
  const outgoing = (p: QuestionPayload): QuestionPayload =>
    (stripNumbers ? { ...p, stem: stripItemNumber(p.stem) } : p);

  // Asked before the route is offered: an install with no key shows the
  // template alone rather than a button that fails when pressed.
  useEffect(() => {
    let live = true;
    questionImportApi.available().then((ok) => { if (live) setAiAvailable(ok); });
    return () => { live = false; };
  }, []);

  // Sections are no longer a reason to withhold the route. The mapper has a
  // `section` slot of its own, so a foreign sheet that names its parts gets
  // them mapped onto this questionnaire's sections (creating the missing ones)
  // in a step of the AI panel; a sheet that names none imports unassigned and
  // the author places the questions in Step 2. What a sectioned upload must
  // never do is guess.
  const aiOffered = aiAvailable;

  /** Duplicate stems, asked once per file. A lookup that fails is a missing warning, not an error. */
  const lookUpExisting = (result: ParsedQuestions, generation: number) => {
    if (result.payloads.length === 0) return;
    questionApis.findExistingStems(result.payloads.map((p) => p.stem))
      .then((res) => {
        if (generation !== fileGeneration.current) return;
        const byRow = new Map<number, ExistingStem>();
        for (const hit of res.data) byRow.set(result.rowNos[hit.index], hit);
        setExistingByRow(byRow);
      })
      .catch(() => { /* the import itself does not depend on this */ });
  };

  const pickFile = async (picked: File | undefined) => {
    if (!picked) return;
    const generation = ++fileGeneration.current;
    setFile(picked);
    setFileName(picked.name);
    setUploadErrors([]);
    setPayloads([]);
    setRowMeta([]);
    setIgnoredSections(false);
    setErrors([]);
    setWarnings([]);
    setRawRows([]);
    setProposals([]);
    setDecisions({});
    setSheetName('');
    setOtherStemTabs([]);
    setUnknownColumns([]);
    setNoOptionColumns(false);
    setExistingByRow(new Map());
    setStripNumbers(false);
    setBlankChoice('none');
    setNameChoice({});
    setStep('pick');
    setIdx(0);
    setForeignFile(null);
    setParsing(true);
    try {
      const book = await readQuestionWorkbook(picked);
      const rawRows = book.rows;
      // The fork. NOT a failed parse — a sheet of ours with bad rows is fixed
      // in the sheet, and routing it through the model would turn a fixable
      // typo into a re-interpretation. Only rows with no `stem` column at all
      // are a foreign format. An empty file is neither, and falls through to
      // the ordinary "no data rows" error.
      // A first tab with NO rows is not proof of an empty workbook — a cover
      // sheet in front of the items is common — so before calling it empty,
      // ask whether any other tab has rows. Only then does it fork.
      if (!looksLikeOurTemplate(rawRows) && (rawRows.length > 0 || (await workbookHasRows(picked)))) {
        setForeignFile(picked);
        setStep('fork');
        return;
      }
      setSheetName(book.sheetName);
      setOtherStemTabs(book.otherStemTabs);
      setNoOptionColumns(rawRows.length > 0 && !hasOptionColumns(rawRows));
      setRawRows(rawRows);
      // Pass one collects the qualities this bank has never heard of; the
      // rows are parsed again once somebody has said what to do with them.
      const unknown = new Map<string, Set<number>>();
      const { result } = applyParse(rawRows, collectingResolver(choices, unknown));
      lookUpExisting(result, generation);
      const wanted = unresolvedCounts(unknown);
      if (wanted.length === 0) {
        setProposals([]);
        setDecisions({});
        return;
      }
      const resolved = await questionImportApi.resolvePaths(wanted);
      setProposals(resolved.data);
      const seeded: Record<string, PathDecision> = {};
      for (const p of resolved.data) seeded[p.pathKey] = defaultDecision(p);
      setDecisions(seeded);
    } catch (e: any) {
      setErrors([e?.message || 'Could not read this file — is it a valid .xlsx?']);
    } finally {
      setParsing(false);
    }
  };

  /**
   * Rows → payloads, with whatever resolver this pass calls for, and the
   * section cells that go with them. One place, so the collecting pass and
   * the decided pass cannot drift.
   */
  const applyParse = (rows: Record<string, unknown>[], resolve: ReturnType<typeof collectingResolver>) => {
    const result = parseQuestionRows(rows, choices, resolve);
    const errs = [...result.errors];
    const above = sectionCellsAbove(result.sections);
    setRowMeta(result.rowNos.map((rowNo, i) => ({ rowNo, cell: result.sections[i], above: above[i] })));
    if (sectioned) {
      // The one section problem that stays an error: two sections share the
      // name, and nothing says which was meant. The fix is in Step 2.
      result.sections.forEach((cell, i) => {
        const kind = classifySectionCell(cell, sectionRefs);
        if (kind.kind === 'ambiguous') {
          errs.push(`Row ${result.rowNos[i]}: "${kind.value}" matches ${kind.count} sections of this `
            + 'questionnaire — rename one of them in Step 2 so the names are unique');
        }
      });
    } else {
      setIgnoredSections(result.sections.some((s) => !!(s || '').trim()));
    }
    setPayloads(result.payloads);
    setUnknownColumns(result.unknownColumns);
    setWarnings(result.warnings);
    setErrors(errs);
    return { result, errs };
  };

  /** Whether these cells leave anything for the sections step to decide. */
  const needsSectionStep = (cells: (string | null)[]) =>
    sectioned && cells.some((cell) => {
      const kind = classifySectionCell(cell, sectionRefs).kind;
      return kind === 'blank' || kind === 'unknown';
    });

  /** Leaving the qualities step: re-read the rows now that the names mean something. */
  const applyDecisions = () => {
    const { result, errs } = applyParse(rawRows, planAwareResolver(choices, plan.keyToId));
    // Back to the file screen if the second pass found something new — that
    // is where the error list is shown, and where the fix is.
    if (errs.length > 0) {
      setStep('pick');
      return;
    }
    setIdx(0);
    setStep(needsSectionStep(result.sections) ? 'sections' : 'review');
  };

  const removeCurrent = () => {
    const drop = <T,>(arr: T[]) => arr.filter((_, i) => i !== idx);
    const next = drop(payloads);
    setPayloads(next);
    setRowMeta(drop(rowMeta));
    if (next.length === 0) {
      setStep('pick');
      setIdx(0);
    } else if (idx >= next.length) {
      setIdx(next.length - 1);
    }
  };

  /**
   * A refused import, as lines to show. The server names EVERY refused
   * question by its position in the payload; this turns each into the sheet
   * row the author can find, grouped like the parse errors are.
   */
  const refusalLines = (e: any): string[] => {
    const problems: BatchProblem[] | undefined = e?.response?.data?.problems;
    if (Array.isArray(problems) && problems.length > 0) {
      return groupRowErrors(problems.map((p) => {
        const rowNo = rowMeta[p.index]?.rowNo;
        return rowNo != null ? `Row ${rowNo}: ${p.message}` : `Question ${p.index + 1}: ${p.message}`;
      }));
    }
    return [e?.response?.data?.message || e?.message || 'Upload failed'];
  };

  const submit = async () => {
    setUploading(true);
    setUploadErrors([]);
    try {
      // Sections first, as the AI route does them: turned off, or created for
      // the names the author chose to create. A section left behind by an
      // import that then fails is empty, visible and one click to delete —
      // and on a retry its name now matches, so it is not created twice.
      let sectionIds: (number | null)[] = payloads.map(() => null);
      if (questionnaire && sectioned) {
        if (turningOff) {
          await questionnaire.disableSections?.();
        } else {
          const idByKey = new Map<string, number>();
          const made: SectionResponse[] = [];
          for (const name of unknownNames) {
            if (!creatingKeys.has(name.key)) continue;
            const res = await questionnairesApi.createQuestionnaireSection(questionnaire.questionnaireId, {
              name: name.value,
              instruction: null,
              showInstructionOnEachQuestion: false,
            });
            made.push(res.data);
            idByKey.set(name.key, res.data.sectionId);
          }
          if (made.length > 0) questionnaire.onSectionsCreated?.(made);
          sectionIds = placements.map((p) =>
            (p == null ? null : 'sectionId' in p ? p.sectionId : idByKey.get(p.createKey) ?? null));
        }
      }
      const questions = payloads.map(outgoing);
      // Both endpoints return the created questions IN REQUEST ORDER, so
      // sectionIds[i] still belongs to created[i].
      const creating = plan.newQualities.length + plan.newQualityTypes.length > 0;
      const created = creating
        // One transaction: the qualities the sheet named and the questions
        // that score against them, or neither.
        ? (await questionImportApi.importQuestions({
          newQualities: plan.newQualities,
          newQualityTypes: plan.newQualityTypes,
          questions,
        })).data.questions
        : (await questionApis.bulkCreateQuestions(questions)).data;
      if (questionnaire) await questionnaire.onCreated(created, sectionIds);
      else await onDone?.();
    } catch (e: any) {
      setUploadErrors(refusalLines(e));
    } finally {
      setUploading(false);
    }
  };

  const ready = payloads.length > 0 && errors.length === 0 && !parsing;
  const last = idx === payloads.length - 1;
  const shownErrors = groupRowErrors(errors);
  const existingCount = rowMeta.filter((m) => existingByRow.has(m.rowNo)).length;
  const currentExisting = rowMeta[idx] ? existingByRow.get(rowMeta[idx].rowNo) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            {step === 'pick' ? 'Upload Questions (XLSX)'
              : step === 'fork' ? 'This is not our template'
              : step === 'ai' ? 'Mapping your sheet'
              : step === 'qualities' ? 'Qualities this sheet names'
              : step === 'sections' ? 'Sections for these questions'
              : `Review — Question ${idx + 1} of ${payloads.length}`}
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          {step === 'fork' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {noOptionColumns ? (
                  // Reached from the file screen's suggestion, not the fork.
                  <span>
                    <strong>{fileName}</strong> has a <code>stem</code> column but no{' '}
                    <code>option1</code>, <code>option2</code>… columns, so the template cannot find
                    its answers. Nothing has been imported.
                  </span>
                ) : (
                  <span>
                    <strong>{fileName}</strong> has rows but no <code>stem</code> column, so it is
                    not the questions template. Nothing has been read from it beyond its column names.
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <p className="text-sm font-medium">Use the template</p>
                <p className="text-xs text-muted-foreground">
                  Download it, copy your questions across, and upload it here. Always works,
                  costs nothing, and needs no connection to anything.
                </p>
                <button
                  type="button"
                  onClick={() => downloadTemplate(choices)}
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs pt-0.5"
                >
                  <Download className="h-3 w-3" /> Download template
                </button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Map it with AI
                </p>
                {aiOffered ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Your sheet is read into the template for you. You see how it was read,
                      can edit it, and can download it before anything is created.
                      {sectioned && ' If it names sections of its own, you say where each one goes; '
                        + 'anything it does not place arrives unassigned.'}
                    </p>
                    <label className="block space-y-1 pt-1">
                      <span className="text-[0.6875rem] font-medium text-foreground">
                        Anything that would help it read the sheet? (optional)
                      </span>
                      <textarea
                        value={aiNotes}
                        onChange={(e) => setAiNotes(e.target.value.slice(0, 2000))}
                        rows={2}
                        placeholder={'e.g. the answer scale is in the note under the table · '
                          + 'column D is the reverse-scoring flag · ignore the first three rows · '
                          + '"Domain" is the quality and "Construct" its type'}
                        className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </label>
                    {/* Consent happens HERE and nowhere else — this screen is the
                        only point at which anything leaves the building, so it
                        says what would, before the button is pressed. */}
                    <p className="text-[0.6875rem] text-muted-foreground">
                      This sends a sample of your sheet — its column names, about ten rows, any
                      notes in it and whatever you typed above — to OpenAI. No respondent data is
                      involved.
                    </p>
                    <Button
                      variant="primary"
                      className="mt-1"
                      onClick={() => setStep('ai')}
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Map it with AI
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    AI mapping isn&apos;t set up on this server — it needs an OpenAI API key, which
                    an administrator adds to the server&apos;s settings. Until then, copy your
                    questions into the template above.
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'ai' && foreignFile && (
            <AiSheetImport
              file={foreignFile}
              choices={choices}
              onBusyChange={setAiBusy}
              onBack={() => setStep('fork')}
              notes={aiNotes.trim() || undefined}
              // Every questionnaire target goes through, sectioned or not: a
              // flat one still has to be TOLD that its sheet names sections,
              // and offered the switch, rather than dropping them quietly.
              // Only the bank page (no questionnaire at all) opts out.
              questionnaire={questionnaire
                ? {
                  questionnaireId: questionnaire.questionnaireId,
                  hasSections: questionnaire.hasSections,
                  sections: questionnaire.sections,
                  onSectionsCreated: questionnaire.onSectionsCreated,
                  enableSections: questionnaire.enableSections,
                }
                : undefined}
              onImported={async (created, sectionIds) => {
                if (questionnaire) await questionnaire.onCreated(created, sectionIds);
                else await onDone?.();
              }}
            />
          )}

          {step === 'qualities' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
                <p className="font-medium">
                  {proposals.length} quality name{proposals.length === 1 ? '' : 's'} in this sheet
                  {proposals.length === 1 ? ' is' : ' are'} not a type you already score against
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Scores attach to a measured quality type. For each name: create it, use a type you
                  already have, or leave it unmapped — its scores are then dropped and those questions
                  import unscored. Names marked ? need a choice. Nothing is created until you press the
                  last button.
                </p>
              </div>

              {groupPathsByRoot(proposals).map((group) => (
                <PathGroupBlock
                  key={group.key}
                  group={group}
                  choices={choices}
                  decisions={decisions}
                  onChange={(pathKey, d) => setDecisions((prev) => ({ ...prev, [pathKey]: d }))}
                  onBulk={(mode) => setDecisions((prev) => {
                    const next = { ...prev };
                    for (const path of group.paths) {
                      if (mode === 'create' && !canCreate(path)) continue;
                      next[path.pathKey] = { mode, mqtId: prev[path.pathKey]?.mqtId };
                    }
                    return next;
                  })}
                />
              ))}

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {plan.newQualities.length + plan.newQualityTypes.length === 0
                  ? 'Nothing new will be created.'
                  : `${plan.newQualities.length} measured qualit${plan.newQualities.length === 1 ? 'y' : 'ies'} and `
                    + `${plan.newQualityTypes.length} type${plan.newQualityTypes.length === 1 ? '' : 's'} `
                    + 'will be created, in the same step as the questions — if anything fails, none of it is kept.'}
              </div>

              {unresolvedLeft.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
                  {unresolvedLeft.length} still need{unresolvedLeft.length === 1 ? 's' : ''} a choice.
                </div>
              )}
            </div>
          )}

          {step === 'sections' && questionnaire && (
            <div className="space-y-3">
              {allBlank ? (
                <>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
                    <p className="font-medium flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      This sheet has no sections, but this questionnaire does
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      None of its {payloads.length} row{payloads.length === 1 ? '' : 's'} fills in
                      the <code>section</code> column. Choose what happens to them — nothing is
                      imported or changed until the last button.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border divide-y divide-border text-xs">
                    <label className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="blank-sections"
                        className="mt-0.5"
                        checked={blankChoice === 'none'}
                        onChange={() => setBlankChoice('none')}
                      />
                      <span>
                        <span className="font-medium text-foreground">Leave them unassigned</span>
                        <span className="block text-muted-foreground">
                          They arrive in Step 2&apos;s Unassigned group, and you place each one in a
                          section before saving.
                        </span>
                      </span>
                    </label>
                    <label className={`flex items-start gap-2.5 px-3 py-2.5 ${sectionRefs.length === 0 ? 'opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="blank-sections"
                        className="mt-0.5"
                        disabled={sectionRefs.length === 0}
                        checked={blankChoice.startsWith('id:')}
                        onChange={() => setBlankChoice(`id:${sectionRefs[0].sectionId}`)}
                      />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="font-medium text-foreground">Put all of them in one section</span>
                        {sectionRefs.length === 0 ? (
                          <span className="block text-muted-foreground">This questionnaire has no sections yet.</span>
                        ) : (
                          <select
                            value={blankChoice.startsWith('id:') ? blankChoice : `id:${sectionRefs[0].sectionId}`}
                            onChange={(e) => setBlankChoice(e.target.value as BlankSectionChoice)}
                            className="block h-8 max-w-[15rem] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                          >
                            {sectionRefs.map((sec) => (
                              <option key={sec.sectionId} value={`id:${sec.sectionId}`}>{sec.name}</option>
                            ))}
                          </select>
                        )}
                      </span>
                    </label>
                    {questionnaire.disableSections && (
                      <label className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="blank-sections"
                          className="mt-0.5"
                          checked={blankChoice === 'off'}
                          onChange={() => setBlankChoice('off')}
                        />
                        <span>
                          <span className="font-medium text-foreground">Turn sections off for this questionnaire</span>
                          <span className="block text-muted-foreground">
                            {sectionRefs.length > 0
                              ? `Its ${sectionRefs.length} section${sectionRefs.length === 1 ? ' is' : 's are'} deleted, with any section instructions. `
                              : ''}
                            Every question — these and any already here — becomes one list, numbered
                            in order. Refused once a respondent has started an assessment that uses it.
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {unknownNames.length > 0 && (
                    <>
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
                        <p className="font-medium flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          {unknownNames.length} section name{unknownNames.length === 1 ? ' in this sheet is' : 's in this sheet are'}{' '}
                          not in this questionnaire
                        </p>
                        <p className="text-muted-foreground mt-0.5">
                          Create the section, put its questions in one you already have, or leave them
                          unassigned to place in Step 2. A section you create is added when you import.
                        </p>
                      </div>
                      <div className="rounded-lg border border-border divide-y divide-border">
                        {unknownNames.map((name) => (
                          <div key={name.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{name.value}</p>
                              <p className="text-[0.6875rem] text-muted-foreground">
                                {name.count} question{name.count === 1 ? '' : 's'} in the sheet
                              </p>
                            </div>
                            <select
                              value={nameChoice[name.key] ?? 'none'}
                              onChange={(e) => setNameChoice((prev) => ({ ...prev, [name.key]: e.target.value as NameSectionChoice }))}
                              className="h-8 max-w-[15rem] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
                            >
                              <option value="none">Leave unassigned</option>
                              <option value="new">Create section “{name.value}”</option>
                              {sectionRefs.map((sec) => (
                                <option key={sec.sectionId} value={`id:${sec.sectionId}`}>Put in “{sec.name}”</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {blankRows > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-500 space-y-2">
                      <div>
                        <p className="font-medium">
                          {blankRows} question{blankRows === 1 ? ' leaves' : 's leave'} the section column blank
                        </p>
                        <p className="mt-0.5">
                          Often a merged cell: the section is written once, on the first row of its group.
                        </p>
                      </div>
                      <select
                        value={blankChoice === 'off' ? 'none' : blankChoice}
                        onChange={(e) => setBlankChoice(e.target.value as BlankSectionChoice)}
                        className="h-8 max-w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                      >
                        <option value="none">Leave them unassigned</option>
                        <option value="fill">Fill down — use the section of the row above</option>
                        {sectionRefs.map((sec) => (
                          <option key={sec.sectionId} value={`id:${sec.sectionId}`}>Put them all in “{sec.name}”</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {turningOff
                  ? `Sections will be turned off, then ${payloads.length} question${payloads.length === 1 ? '' : 's'} imported into one list.`
                  : `${placedCount} of ${payloads.length} question${payloads.length === 1 ? '' : 's'} go into a section`
                    + (payloads.length - placedCount > 0
                      ? ` · ${payloads.length - placedCount} arrive unassigned — place them in Step 2 before saving`
                      : '')
                    + (creatingKeys.size > 0
                      ? ` · ${creatingKeys.size} new section${creatingKeys.size === 1 ? '' : 's'} will be created`
                      : '')
                    + '.'}
              </div>
            </div>
          )}

          {step === 'pick' ? (
            <>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>One row per question. Columns: <code className="text-foreground">stem</code>* ·{' '}
                  <code className="text-foreground">description</code> ·{' '}
                  <code className="text-foreground">type</code> (TEXT/URL) ·{' '}
                  <code className="text-foreground">mediaUrl</code> ·{' '}
                  <code className="text-foreground">risk</code> (yes/no) ·{' '}
                  <code className="text-foreground">selectRule</code> ·{' '}
                  <code className="text-foreground">selectCount</code> ·{' '}
                  <code className="text-foreground">otherOption</code> ·{' '}
                  <code className="text-foreground">section</code> ·{' '}
                  <code className="text-foreground">scores</code> ·{' '}
                  <code className="text-foreground">option1…N</code> ·{' '}
                  <code className="text-foreground">option1Description…N</code> ·{' '}
                  <code className="text-foreground">option1Scores…N</code></p>
                <p><code className="text-foreground">description</code> and{' '}
                  <code className="text-foreground">option1Description…N</code> are optional help text,
                  shown under the question and under that option while answering. Leave them blank for none.</p>
                <p>Leave <code className="text-foreground">selectRule</code> blank for a single-choice
                  question. Otherwise <code className="text-foreground">min</code>,{' '}
                  <code className="text-foreground">max</code> or <code className="text-foreground">equals</code>{' '}
                  with a <code className="text-foreground">selectCount</code> — how many of that row&apos;s
                  options the respondent picks. The count cannot exceed the options on the row.</p>
                <p><code className="text-foreground">otherOption</code> is the number of the option that is the
                  &ldquo;Other&rdquo; row — respondents who pick it type their own answer. Leave it blank for
                  none; at most one per question. Its label and scores are that option&apos;s own cells.</p>
                {sectioned ? (
                  <p><code className="text-foreground">section</code> names a section of THIS questionnaire
                    (matched by name, case-insensitive). A blank or unknown name is not an error — before
                    anything is imported you choose: leave those questions unassigned, put them in a
                    section, create the section, or fill down from the row above.</p>
                ) : (
                  <p>The <code className="text-foreground">section</code> column is ignored here — it only
                    applies when uploading inside a sectioned questionnaire.</p>
                )}
                <p>Score cells: <code className="text-foreground">MqtName:score | MqtId:score</code> — a comma
                  works as well as <code className="text-foreground">|</code>{' '}
                  (<code className="text-foreground">Habitual:4, Impulsive:2</code> is two scores). Names must be
                  unambiguous, otherwise use the id or the full tree path
                  (<code className="text-foreground">Internal Drive › Self-Efficacy:3</code>, exactly as the{' '}
                  <code className="text-foreground">mqts</code> sheet&apos;s <code className="text-foreground">tree</code>{' '}
                  column prints it). Scores may be decimal, written with a dot
                  (<code className="text-foreground">0.25</code>, <code className="text-foreground">0.5</code>), kept to two
                  places. The template&apos;s <code className="text-foreground">mqts</code> sheet
                  lists every MQT with its exact name, id and tree position.</p>
                <p>Every question needs at least one option.</p>
                <button type="button" onClick={() => downloadTemplate(choices)} className="inline-flex items-center gap-1 text-primary hover:underline font-medium">
                  <Download className="h-3 w-3" /> Download template
                </button>
              </div>

              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm font-medium">{fileName || 'Choose an .xlsx file'}</span>
                <span className="text-xs text-muted-foreground">The file is parsed in your browser — nothing is saved until you confirm.</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>

              {parsing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Parsing…
                </div>
              )}

              {!parsing && sheetName && (
                <p className="text-[0.6875rem] text-muted-foreground">
                  Read from the “{sheetName}” tab{fileName ? ` of ${fileName}` : ''}.
                </p>
              )}

              {!parsing && otherStemTabs.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {otherStemTabs.map((t) => `“${t}”`).join(', ')} also {otherStemTabs.length === 1 ? 'has' : 'have'} a{' '}
                    <code>stem</code> column and {otherStemTabs.length === 1 ? 'was' : 'were'} not read — only one tab
                    is uploaded at a time (the one called “questions”, else the first). Upload the other tab as
                    its own file to import it too.
                  </span>
                </div>
              )}

              {/* Before the errors: when this is true, every row's "no options"
                  error has one cause, and this box says what it is. */}
              {!parsing && noOptionColumns && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-500 space-y-1.5">
                  <p className="font-medium">
                    This sheet has no <code>option1</code>, <code>option2</code>… columns, so none of its
                    questions has answers to choose from.
                  </p>
                  {aiOffered ? (
                    <>
                      <p>
                        If the answers are in columns with other names, the AI route can read them.
                        Or rename those columns to <code>option1</code>, <code>option2</code>… and upload again.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setForeignFile(file); setStep('fork'); }}
                        disabled={!file}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Map it with AI instead
                      </Button>
                    </>
                  ) : (
                    <p>
                      Rename the answer columns to <code>option1</code>, <code>option2</code>… and upload again.
                      (AI mapping, which can read other layouts, isn&apos;t set up on this server — it needs an
                      OpenAI API key.)
                    </p>
                  )}
                </div>
              )}

              {!parsing && errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 space-y-1 max-h-44 overflow-y-auto">
                  <p className="font-medium">Fix these in the sheet and re-upload — nothing was imported:</p>
                  {shownErrors.slice(0, 25).map((err, i) => <p key={i}>• {err}</p>)}
                  {shownErrors.length > 25 && <p>…and {shownErrors.length - 25} more</p>}
                </div>
              )}

              {!parsing && unknownColumns.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Not recognised, so ignored: <strong>{unknownColumns.join(' · ')}</strong>. If one of these
                    was meant to be a template column — <code>option1</code>, <code>option1Scores</code>,{' '}
                    <code>scores</code>… — fix its header and upload again.
                  </span>
                </div>
              )}

              {!parsing && uploadErrors.length > 0 && (
                <UploadErrorBox lines={uploadErrors} />
              )}

              {!parsing && ready && (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {payloads.length} question{payloads.length !== 1 ? 's' : ''} parsed —{' '}
                    {payloads.reduce((a, p) => a + p.options.length, 0)} options,{' '}
                    {payloads.reduce((a, p) => a + p.mqtScores.length + p.options.reduce((b, o) => b + o.mqtScores.length, 0), 0)} MQT scores.
                    {sectionStep && ' Some rows need a section choice — that is the next step.'}
                    {ignoredSections && ' The section column was ignored — this questionnaire has no sections.'}
                    {' '}Review them one by one, or import the lot.
                  </span>
                </div>
              )}

              {!parsing && ready && warnings.length > 0 && (
                <SkippedScoresBox lines={groupRowErrors(warnings)} />
              )}

              {!parsing && ready && existingCount > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {existingCount === payloads.length ? 'All' : existingCount} of these {payloads.length} question
                    {payloads.length === 1 ? ' is' : 's are'} already in the question bank. Importing adds a second,
                    separate copy of each — fine for a standard item reused on purpose, but if this sheet was
                    uploaded before, remove them in the review.
                  </span>
                </div>
              )}

              {!parsing && ready && offerStrip && (
                <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded"
                    checked={stripNumbers}
                    onChange={(e) => setStripNumbers(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">
                      Remove the numbers from the start of {numbered} question{numbered === 1 ? '' : 's'}
                    </span>
                    <span className="block text-muted-foreground">
                      e.g. “{payloads.find((p) => LEADING_ITEM_NUMBER.test(p.stem))?.stem.slice(0, 40)}…” —
                      the portal numbers questions itself, so these would show twice.
                    </span>
                  </span>
                </label>
              )}
            </>
          ) : step === 'review' ? (
            <>
              {/* progress bar across the batch */}
              <div className="h-1 rounded bg-muted">
                <div
                  className="h-1 rounded bg-primary transition-all"
                  style={{ width: `${((idx + 1) / payloads.length) * 100}%` }}
                />
              </div>
              {currentExisting && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Already in the question bank as question #{currentExisting.existingQuestionId}
                    {currentExisting.method === 'NORMALISED' ? ' (same words, different punctuation or numbering)' : ''}.
                    Importing makes a second copy.
                  </span>
                </div>
              )}
              {warningsForRow(warnings, rowMeta[idx]?.rowNo).length > 0 && (
                <SkippedScoresBox lines={warningsForRow(warnings, rowMeta[idx]?.rowNo)} />
              )}
              {payloads[idx] && (
                <QuestionPreview p={outgoing(payloads[idx])} choices={previewChoices} sectionName={sectionLabelOf(idx)} />
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={removeCurrent}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
                  title="Drop this question from the batch (the sheet is not changed)"
                >
                  <Trash2 className="h-3 w-3" /> Remove this question from the batch
                </button>
              </div>
              {uploadErrors.length > 0 && <UploadErrorBox lines={uploadErrors} />}
            </>
          ) : null}
        </CardContent>
        <div className="flex justify-between gap-2 p-4 border-t border-border shrink-0">
          {step === 'fork' || step === 'ai' ? (
            <Button
              variant="outline"
              disabled={aiBusy}
              onClick={() => { setStep('pick'); setForeignFile(null); }}
            >
              Choose another file
            </Button>
          ) : step === 'qualities' ? (
            <>
              <Button variant="outline" onClick={() => setStep('pick')} disabled={uploading}>
                Back to file
              </Button>
              <Button variant="primary" onClick={applyDecisions} disabled={unresolvedLeft.length > 0}>
                {sectionStep ? 'Choose sections' : `Review ${payloads.length} question${payloads.length !== 1 ? 's' : ''}`}
              </Button>
            </>
          ) : step === 'sections' ? (
            <>
              <Button variant="outline" onClick={() => setStep(proposals.length > 0 ? 'qualities' : 'pick')}>
                {proposals.length > 0 ? 'Back to qualities' : 'Back to file'}
              </Button>
              <Button variant="primary" onClick={() => { setIdx(0); setStep('review'); }}>
                Review {payloads.length} question{payloads.length !== 1 ? 's' : ''}
              </Button>
            </>
          ) : step === 'pick' ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <div className="flex gap-2">
                {/* A sheet that parsed clean needs no card-by-card walk unless
                    its author wants one — every row error already blocked the
                    upload before this point. */}
                {/* Hidden while qualities are waiting on a decision: importing
                    from here would use the collecting pass, in which those
                    scores resolved to nothing. Hidden while sections are too:
                    the defaults are safe, but the author has not seen them. */}
                {ready && proposals.length === 0 && !sectionStep && (
                  <Button variant="outline" onClick={submit} disabled={uploading}>
                    {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Import All Questions
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => {
                    if (proposals.length > 0) setStep('qualities');
                    else if (sectionStep) setStep('sections');
                    else { setIdx(0); setStep('review'); }
                  }}
                  disabled={!ready}
                >
                  {proposals.length > 0
                    ? `Review ${proposals.length} new qualit${proposals.length === 1 ? 'y' : 'ies'}`
                    : sectionStep
                      ? 'Choose sections'
                      : `Review ${payloads.length > 0 ? payloads.length : ''} question${payloads.length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (idx > 0) { setIdx(idx - 1); return; }
                  setStep(sectionStep ? 'sections' : proposals.length > 0 ? 'qualities' : 'pick');
                }}
                disabled={uploading}
              >
                {idx === 0
                  ? (sectionStep ? 'Back to sections' : proposals.length > 0 ? 'Back to qualities' : 'Back to file')
                  : 'Back'}
              </Button>
              <div className="flex gap-2">
                {!last && (
                  <Button variant="outline" onClick={submit} disabled={uploading}>
                    {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Import All Questions
                  </Button>
                )}
                {last ? (
                  <Button variant="primary" onClick={submit} disabled={uploading}>
                    {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Import {payloads.length} question{payloads.length !== 1 ? 's' : ''}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setIdx(idx + 1)} disabled={uploading}>
                    Next
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
