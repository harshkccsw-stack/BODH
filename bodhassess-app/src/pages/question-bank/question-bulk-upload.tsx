import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Flag,
  Layers,
  Link2,
  Loader2,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  questionApis,
  type MqtScorePayload,
  type QuestionContentType,
  type QuestionOptionPayload,
  type QuestionPayload,
  type QuestionResponse,
} from './questionApis';
import { contentMeta, type MqtChoice } from './question-form-modal';

// ── Bulk XLSX upload — shared by the Questions page and the questionnaire
// wizard's Step 2 ───────────────────────────────────────────────────────────
// ONE template for both flows. One row per question. Headers (case/space-
// insensitive): stem*, type (TEXT/URL/IMAGE/VIDEO — default TEXT), mediaUrl
// (required for non-TEXT), risk (yes/true/1), section, scores,
// option1..optionN, option1Scores..optionNScores.
// Score cells: entries separated by |, each "mqtName:score" or "mqtId:score".
// The `section` column is used ONLY when uploading inside a sectioned
// questionnaire (it must name an EXISTING section there — uploads never
// create sections); the Questions page and flat questionnaires ignore it,
// which is what keeps the template consistent across both flows.
// Parsing happens entirely in the browser; the payload goes to
// /questions/bulk-create, which is all-or-nothing — so ANY row error blocks
// the whole upload rather than importing half a sheet.

/** "Extraversion:3 | 14:1" → payload entries, appending problems to errors. */
function parseScoreCell(raw: string, where: string, choices: MqtChoice[], errors: string[]): MqtScorePayload[] {
  const out: MqtScorePayload[] = [];
  for (const part of raw.split('|').map((p) => p.trim()).filter(Boolean)) {
    const sep = part.lastIndexOf(':');
    if (sep < 0) { errors.push(`${where}: "${part}" is not name:score`); continue; }
    const key = part.slice(0, sep).trim();
    const score = Number(part.slice(sep + 1).trim());
    if (!Number.isFinite(score)) { errors.push(`${where}: score in "${part}" is not a number`); continue; }
    let id: number | null = null;
    if (/^\d+$/.test(key)) {
      id = Number(key);
      if (!choices.some((c) => c.id === id)) { errors.push(`${where}: no MQT with id ${id}`); id = null; }
    } else {
      const matches = choices.filter((c) => c.name.toLowerCase() === key.toLowerCase());
      if (matches.length === 0) errors.push(`${where}: no MQT named "${key}"`);
      else if (matches.length > 1) errors.push(`${where}: "${key}" matches ${matches.length} MQTs — use the id instead`);
      else id = matches[0].id;
    }
    if (id != null) out.push({ measuredQualityTypeId: id, score: Math.trunc(score) });
  }
  return out;
}

export async function parseQuestionsXlsx(
  file: File,
  choices: MqtChoice[],
): Promise<{ payloads: QuestionPayload[]; sections: (string | null)[]; rowNos: number[]; errors: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  // Prefer the sheet named "questions" (the template ships an "mqts"
  // reference sheet beside it); fall back to the first sheet.
  const ws = wb.Sheets['questions'] || wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const payloads: QuestionPayload[] = [];
  // sections[i]/rowNos[i] belong to payloads[i] — the raw section cell
  // (matched or ignored by the caller depending on where the upload
  // happens) and the sheet row it came from, for error messages.
  const sections: (string | null)[] = [];
  const rowNos: number[] = [];
  const errors: string[] = [];

  rawRows.forEach((r, i) => {
    const rowNo = i + 2; // sheet row: 1 is the header
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      row[k.toLowerCase().replace(/[\s_-]/g, '')] = String(v ?? '').trim();
    }
    if (!Object.values(row).some(Boolean)) return; // fully blank row

    const stem = row.stem || '';
    if (!stem) { errors.push(`Row ${rowNo}: stem is required`); return; }
    const typeRaw = (row.type || 'TEXT').toUpperCase();
    if (!['TEXT', 'IMAGE', 'VIDEO', 'URL'].includes(typeRaw)) {
      errors.push(`Row ${rowNo}: type "${row.type}" is not TEXT/IMAGE/VIDEO/URL`);
      return;
    }
    const type = typeRaw as QuestionContentType;
    const mediaUrl = row.mediaurl || '';
    if (type !== 'TEXT' && !mediaUrl) {
      errors.push(`Row ${rowNo}: a ${type.toLowerCase()} question needs mediaUrl`);
      return;
    }
    const riskFlag = ['1', 'true', 'yes', 'y'].includes((row.risk || '').toLowerCase());
    const mqtScores = parseScoreCell(row.scores || '', `Row ${rowNo} scores`, choices, errors);

    const optionNums = Object.keys(row)
      .map((k) => k.match(/^option(\d+)$/))
      .filter((m): m is RegExpMatchArray => m != null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    const options: QuestionOptionPayload[] = [];
    for (const n of optionNums) {
      const text = row[`option${n}`] || '';
      if (!text) continue; // empty option cell — fine, sheet just has spare columns
      options.push({
        optionText: text,
        contentType: 'TEXT',
        mediaUrl: null,
        mqtScores: parseScoreCell(row[`option${n}scores`] || '', `Row ${rowNo} option${n}Scores`, choices, errors),
      });
    }

    payloads.push({
      contentType: type,
      stem,
      mediaUrl: type === 'TEXT' ? null : mediaUrl,
      riskFlag,
      options,
      mqtScores,
    });
    sections.push(row.section || null);
    rowNos.push(rowNo);
  });

  if (payloads.length === 0 && errors.length === 0) errors.push('No data rows found in the sheet');
  return { payloads, sections, rowNos, errors };
}

export async function downloadTemplate(choices: MqtChoice[]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet([
    {
      stem: 'I enjoy meeting new people.', type: 'TEXT', mediaUrl: '', risk: 'no',
      section: 'Part A',
      scores: 'MqtNameOrId:2 | MqtNameOrId:1',
      option1: 'Agree', option1Scores: 'MqtNameOrId:5', option2: 'Neutral', option2Scores: '',
      option3: 'Disagree', option3Scores: 'MqtNameOrId:0',
    },
    {
      stem: 'Which diagram shows the correct flow?', type: 'URL',
      mediaUrl: 'https://example.com/diagram.png', risk: 'yes',
      section: 'Part B', scores: '',
      option1: 'The first one', option1Scores: 'MqtNameOrId:3', option2: 'The second one', option2Scores: '',
      option3: '', option3Scores: '',
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
function QuestionPreview({
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
        {p.riskFlag && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            <Flag className="h-3 w-3" /> risk
          </span>
        )}
        {totalScores === 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="h-3 w-3" /> no MQT mapping anywhere
          </span>
        )}
      </div>
      <p className="text-sm font-medium">{p.stem}</p>
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
  hasSections: boolean;
  sections: { sectionId: number; name: string }[];
  onCreated: (created: QuestionResponse[], sectionIds: (number | null)[]) => Promise<void> | void;
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
  const [step, setStep] = useState<'pick' | 'review'>('pick');
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
    setParsing(true);
    try {
      const result = await parseQuestionsXlsx(file, choices);
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
            {step === 'pick' ? 'Upload Questions (XLSX)' : `Review — Question ${idx + 1} of ${payloads.length}`}
          </CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          {step === 'pick' ? (
            <>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p>One row per question. Columns: <code className="text-foreground">stem</code>* ·{' '}
                  <code className="text-foreground">type</code> (TEXT/URL) ·{' '}
                  <code className="text-foreground">mediaUrl</code> ·{' '}
                  <code className="text-foreground">risk</code> (yes/no) ·{' '}
                  <code className="text-foreground">section</code> ·{' '}
                  <code className="text-foreground">scores</code> ·{' '}
                  <code className="text-foreground">option1…N</code> ·{' '}
                  <code className="text-foreground">option1Scores…N</code></p>
                {sectioned ? (
                  <p><code className="text-foreground">section</code> must name an existing section of THIS
                    questionnaire (matched by name, case-insensitive) — create the sections in Step 2 first;
                    the upload never creates them.</p>
                ) : (
                  <p>The <code className="text-foreground">section</code> column is ignored here — it only
                    applies when uploading inside a sectioned questionnaire.</p>
                )}
                <p>Score cells: <code className="text-foreground">MqtName:score | MqtId:score</code> — names must be
                  unambiguous, otherwise use the id. The template&apos;s <code className="text-foreground">mqts</code> sheet
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
                    {' '}Review each one before creating.
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* progress bar across the batch */}
              <div className="h-1 rounded bg-muted">
                <div
                  className="h-1 rounded bg-primary transition-all"
                  style={{ width: `${((idx + 1) / payloads.length) * 100}%` }}
                />
              </div>
              <QuestionPreview p={payloads[idx]} choices={choices} sectionName={sectionNames[idx] ?? undefined} />
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
          )}
        </CardContent>
        <div className="flex justify-between gap-2 p-4 border-t border-border shrink-0">
          {step === 'pick' ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={() => { setIdx(0); setStep('review'); }} disabled={!ready}>
                Review {payloads.length > 0 ? payloads.length : ''} question{payloads.length !== 1 ? 's' : ''}
              </Button>
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
              {last ? (
                <Button variant="primary" onClick={submit} disabled={uploading}>
                  {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create {payloads.length} question{payloads.length !== 1 ? 's' : ''}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setIdx(idx + 1)}>
                  Next
                </Button>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
