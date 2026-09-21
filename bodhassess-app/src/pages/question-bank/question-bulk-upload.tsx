import { useEffect, useState } from 'react';
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
  type MqtScorePayload,
  type QuestionPayload,
  type QuestionResponse,
} from './questionApis';
import { contentMeta, type MqtChoice } from './question-form-modal';
import { looksLikeOurTemplate, parseQuestionRows } from './question-sheet-rules';
import type { ParsedQuestions } from './question-sheet-rules';

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
import type { SectionResponse } from '@/pages/questionnaires/questionnairesApi';
import { questionImportApi, workbookHasRows } from './questionImportApi';

// ── Bulk XLSX upload — shared by the Questions page and the questionnaire
// wizard's Step 2 ───────────────────────────────────────────────────────────
// ONE template for both flows. One row per question. Headers (case/space-
// insensitive): stem*, type (TEXT/URL/IMAGE/VIDEO — default TEXT), mediaUrl
// (required for non-TEXT), risk (yes/true/1), shuffle (yes/true/1 — deliver
// the options in a random order), selectRule (blank/min/max/equals),
// selectCount (the n that rule applies to), section, scores,
// option1..optionN, option1Scores..optionNScores.
// Score cells: entries separated by |, each "mqtName:score" or "mqtId:score".
// The `section` column is used ONLY when uploading inside a sectioned
// questionnaire (it must name an EXISTING section there — uploads never
// create sections); the Questions page and flat questionnaires ignore it,
// which is what keeps the template consistent across both flows.
// Parsing happens entirely in the browser; the payload goes to
// /questions/bulk-create, which is all-or-nothing — so ANY row error blocks
// the whole upload rather than importing half a sheet.

/**
 * The workbook's rows, untouched. Split out from the parser so the AI import
 * path can look at a sheet BEFORE deciding what it is — see
 * `looksLikeOurTemplate`.
 */
export async function readQuestionSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  // Prefer the sheet named "questions" (the template ships an "mqts"
  // reference sheet beside it); fall back to the first sheet.
  const ws = wb.Sheets['questions'] || wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
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
      selectRule: '', selectCount: '',
      section: 'Part A',
      scores: 'MqtNameOrId:2 | MqtNameOrId:0.5',
      option1: 'Agree', option1Description: '', option1Scores: 'MqtNameOrId:5',
      option2: 'Neutral', option2Description: '', option2Scores: '',
      option3: 'Disagree', option3Description: '', option3Scores: 'MqtNameOrId:0',
    },
    {
      stem: 'Which diagram shows the correct flow?', description: '', type: 'URL',
      mediaUrl: 'https://example.com/diagram.png', risk: 'yes', shuffle: 'no',
      selectRule: '', selectCount: '',
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
      section: 'Part B', scores: '',
      option1: 'I plan ahead', option1Description: 'Lists, calendars, that sort of thing.',
      option1Scores: 'MqtNameOrId:1',
      option2: 'I improvise', option2Description: '', option2Scores: 'MqtNameOrId:2',
      option3: 'I do both', option3Description: '', option3Scores: 'MqtNameOrId:3',
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
                  <p className="text-xs">{o.optionText || <span className="italic text-muted-foreground">[{o.contentType.toLowerCase()} only]</span>}</p>
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
 * Questionnaire mode (wizard Step 2). Each row's `section` cell must name an
 * EXISTING section of the questionnaire — create sections there first, the
 * upload never creates them. On submit the created bank questions come back
 * through onCreated with their matched sectionIds (all null on flat
 * questionnaires, where the section column is ignored like on the Questions
 * page) so the wizard can auto-select them into the mapping.
 */
export interface QuestionnaireUploadTarget {
  questionnaireId: number;
  hasSections: boolean;
  sections: { sectionId: number; name: string }[];
  onCreated: (created: QuestionResponse[], sectionIds: (number | null)[]) => Promise<void> | void;
  /** Sections the AI route created on its way in, so the page can show them. */
  onSectionsCreated?: (created: SectionResponse[]) => void;
  /**
   * Turn sections ON for this questionnaire. Offered when a foreign sheet
   * turns out to name sections and the questionnaire does not have them —
   * the alternative is dropping that part of the author's work in silence.
   */
  enableSections?: () => Promise<void>;
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
  // Both are reachable ONLY from a file that has rows and no `stem` column —
  // the template path never passes through either.
  const [step, setStep] = useState<'pick' | 'fork' | 'ai' | 'review'>('pick');
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
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [payloads, setPayloads] = useState<QuestionPayload[]>([]);
  // Parallel to payloads: the matched section per question (questionnaire
  // mode with sections), else null throughout.
  const [sectionIds, setSectionIds] = useState<(number | null)[]>([]);
  const [sectionNames, setSectionNames] = useState<(string | null)[]>([]);
  const [ignoredSections, setIgnoredSections] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const sectioned = questionnaire != null && questionnaire.hasSections;

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

  /**
   * Trim + case-insensitive match against the questionnaire's sections.
   * Missing or ambiguous names are hard errors — the fix is to add/rename
   * sections in Step 2 and re-upload, never to guess.
   */
  const matchSections = (raw: (string | null)[], rowNos: number[], errs: string[]) => {
    const ids: (number | null)[] = [];
    const names: (string | null)[] = [];
    raw.forEach((cell, i) => {
      const rowNo = `Row ${rowNos[i]}`;
      const name = (cell || '').trim();
      if (!name) {
        errs.push(`${rowNo}: section is required — this questionnaire uses sections`);
        ids.push(null); names.push(null);
        return;
      }
      const matches = questionnaire!.sections.filter((s) => s.name.trim().toLowerCase() === name.toLowerCase());
      if (matches.length === 0) {
        errs.push(`${rowNo}: no section named "${name}" in this questionnaire — create it first, then re-upload`);
        ids.push(null); names.push(null);
      } else if (matches.length > 1) {
        errs.push(`${rowNo}: "${name}" matches ${matches.length} sections — rename one so names are unique`);
        ids.push(null); names.push(null);
      } else {
        ids.push(matches[0].sectionId);
        names.push(matches[0].name);
      }
    });
    return { ids, names };
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setUploadError('');
    setPayloads([]);
    setSectionIds([]);
    setSectionNames([]);
    setIgnoredSections(false);
    setErrors([]);
    setStep('pick');
    setIdx(0);
    setForeignFile(null);
    setParsing(true);
    try {
      const rawRows = await readQuestionSheet(file);
      // The fork. NOT a failed parse — a sheet of ours with bad rows is fixed
      // in the sheet, and routing it through the model would turn a fixable
      // typo into a re-interpretation. Only rows with no `stem` column at all
      // are a foreign format. An empty file is neither, and falls through to
      // the ordinary "no data rows" error.
      // A first tab with NO rows is not proof of an empty workbook — a cover
      // sheet in front of the items is common — so before calling it empty,
      // ask whether any other tab has rows. Only then does it fork.
      if (!looksLikeOurTemplate(rawRows) && (rawRows.length > 0 || (await workbookHasRows(file)))) {
        setForeignFile(file);
        setStep('fork');
        return;
      }
      const result = parseQuestionRows(rawRows, choices);
      const errs = [...result.errors];
      if (sectioned) {
        const { ids, names } = matchSections(result.sections, result.rowNos, errs);
        setSectionIds(ids);
        setSectionNames(names);
      } else {
        setSectionIds(result.payloads.map(() => null));
        setSectionNames(result.payloads.map(() => null));
        setIgnoredSections(result.sections.some((s) => !!s));
      }
      setPayloads(result.payloads);
      setErrors(errs);
    } catch (e: any) {
      setErrors([e?.message || 'Could not read this file — is it a valid .xlsx?']);
    } finally {
      setParsing(false);
    }
  };

  const removeCurrent = () => {
    const drop = (arr: any[]) => arr.filter((_, i) => i !== idx);
    const next = drop(payloads);
    setPayloads(next);
    setSectionIds(drop(sectionIds));
    setSectionNames(drop(sectionNames));
    if (next.length === 0) {
      setStep('pick');
      setIdx(0);
    } else if (idx >= next.length) {
      setIdx(next.length - 1);
    }
  };

  const submit = async () => {
    setUploading(true);
    setUploadError('');
    try {
      // bulk-create returns the created questions IN REQUEST ORDER, so
      // sectionIds[i] still belongs to created[i].
      const res = await questionApis.bulkCreateQuestions(payloads);
      if (questionnaire) await questionnaire.onCreated(res.data, sectionIds);
      else await onDone?.();
    } catch (e: any) {
      setUploadError(e?.response?.data?.message || e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const ready = payloads.length > 0 && errors.length === 0 && !parsing;
  const last = idx === payloads.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <Card className="w-full max-w-xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            {step === 'pick' ? 'Upload Questions (XLSX)'
              : step === 'fork' ? 'This is not our template'
              : step === 'ai' ? 'Mapping your sheet'
              : `Review — Question ${idx + 1} of ${payloads.length}`}
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          {step === 'fork' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-500 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{fileName}</strong> has rows but no <code>stem</code> column, so it is
                  not the questions template. Nothing has been read from it beyond its column names.
                </span>
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
                  <p className="text-xs text-muted-foreground">Not configured on this server.</p>
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
                {sectioned ? (
                  <p><code className="text-foreground">section</code> must name an existing section of THIS
                    questionnaire (matched by name, case-insensitive) — create the sections in Step 2 first;
                    the upload never creates them.</p>
                ) : (
                  <p>The <code className="text-foreground">section</code> column is ignored here — it only
                    applies when uploading inside a sectioned questionnaire.</p>
                )}
                <p>Score cells: <code className="text-foreground">MqtName:score | MqtId:score</code> — names must be
                  unambiguous, otherwise use the id or the full tree path
                  (<code className="text-foreground">Internal Drive › Self-Efficacy:3</code>, exactly as the{' '}
                  <code className="text-foreground">mqts</code> sheet&apos;s <code className="text-foreground">tree</code>{' '}
                  column prints it). Scores may be decimal
                  (<code className="text-foreground">0.25</code>, <code className="text-foreground">0.5</code>), kept to two
                  places. The template&apos;s <code className="text-foreground">mqts</code> sheet
                  lists every MQT with its exact name, id and tree position.</p>
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

              {!parsing && errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 space-y-1 max-h-44 overflow-y-auto">
                  <p className="font-medium">Fix these in the sheet and re-upload — nothing was imported:</p>
                  {errors.slice(0, 25).map((err, i) => <p key={i}>• {err}</p>)}
                  {errors.length > 25 && <p>…and {errors.length - 25} more</p>}
                </div>
              )}

              {!parsing && ready && (
                <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-400 flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    {payloads.length} question{payloads.length !== 1 ? 's' : ''} parsed —{' '}
                    {payloads.reduce((a, p) => a + p.options.length, 0)} options,{' '}
                    {payloads.reduce((a, p) => a + p.mqtScores.length + p.options.reduce((b, o) => b + o.mqtScores.length, 0), 0)} MQT scores
                    {sectioned && `, across ${new Set(sectionIds).size} section${new Set(sectionIds).size !== 1 ? 's' : ''}`}.
                    {ignoredSections && ' The section column was ignored — this questionnaire has no sections.'}
                    {' '}Review them one by one, or import the lot.
                  </span>
                </div>
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
              {payloads[idx] && (
                <QuestionPreview p={payloads[idx]} choices={choices} sectionName={sectionNames[idx] ?? undefined} />
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
              {uploadError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
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
          ) : step === 'pick' ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <div className="flex gap-2">
                {/* A sheet that parsed clean needs no card-by-card walk unless
                    its author wants one — every row error already blocked the
                    upload before this point. */}
                {ready && (
                  <Button variant="outline" onClick={submit} disabled={uploading}>
                    {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Import All Questions
                  </Button>
                )}
                <Button variant="primary" onClick={() => { setIdx(0); setStep('review'); }} disabled={!ready}>
                  Review {payloads.length > 0 ? payloads.length : ''} question{payloads.length !== 1 ? 's' : ''}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => (idx === 0 ? setStep('pick') : setIdx(idx - 1))}
                disabled={uploading}
              >
                {idx === 0 ? 'Back to file' : 'Back'}
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
