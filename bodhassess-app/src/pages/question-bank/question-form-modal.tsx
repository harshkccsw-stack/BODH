import { useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Flag,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  Shuffle,
  Target,
  Type,
  Video,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  questionApis,
  QUESTION_TYPES,
  SCALE_FROM,
  SCALE_TO,
  type MqtScorePayload,
  type MqtScoreView,
  type QuestionContentType,
  type QuestionPayload,
  type QuestionResponse,
  type QuestionType,
  type SelectionRule,
} from './questionApis';
import { type MQ, type MQT, type MeasuredQualityResponse } from '../MeasuredQuality/qualitiesApi';

// The ONE create/edit form for bank questions. The Questions page renders it
// as a modal; the questionnaire wizard's Step 2 renders the same fields
// (QuestionFormFields) inline on the page, so authoring a question is
// identical everywhere.

// IMAGE/VIDEO need a file upload, and there is no object storage yet (MySQL
// is no place for videos, and base64 images are not worth it either) — both
// stay disabled until object storage lands. URL covers externally hosted
// media meanwhile.
export const CONTENT_TYPES: Array<{ value: QuestionContentType; label: string; icon: typeof Type; disabled?: boolean }> = [
  { value: 'TEXT', label: 'Text', icon: Type },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon, disabled: true },
  { value: 'VIDEO', label: 'Video', icon: Video, disabled: true },
  { value: 'URL', label: 'URL', icon: Link2 },
];

export const contentMeta = (t: QuestionContentType) => CONTENT_TYPES.find((c) => c.value === t) ?? CONTENT_TYPES[0];

// ── MQT choices — the flattened tree, labels showing the full path ─────────
export interface MqtChoice {
  id: number;
  label: string;
  name: string; // bare node name — what the XLSX scores column matches on
}

export function flattenMqts(mqs: MQ[]): MqtChoice[] {
  const out: MqtChoice[] = [];
  const walk = (nodes: MQT[] | undefined, prefix: string) => {
    for (const n of nodes || []) {
      out.push({ id: Number(n.id), label: `${prefix} › ${n.name}`, name: n.name });
      walk(n.children, `${prefix} › ${n.name}`);
    }
  };
  for (const mq of mqs) walk(mq.mqts, mq.name);
  return out;
}

/** getQualities() wire response → the flattened picker choices. */
export function choicesFromQualities(data: MeasuredQualityResponse[]): MqtChoice[] {
  return flattenMqts(
    data.map((m) => ({
      id: String(m.measuredQualityId),
      name: m.name,
      description: m.description || '',
      mqts: (m.mqts || []).map(function toMqt(n): MQT {
        return { id: String(n.measuredQualityTypeId), name: n.name, children: n.children?.map(toMqt) };
      }),
    })),
  );
}

// ── Score rows (shared by the question and each option) ────────────────────
export interface ScoreRow {
  mqtId: string; // '' until picked
  score: string; // input value; parsed on submit
}

export const viewsToRows = (views: MqtScoreView[]): ScoreRow[] =>
  views.map((v) => ({ mqtId: String(v.measuredQualityTypeId), score: String(v.score) }));

export const rowsToPayload = (rows: ScoreRow[]): MqtScorePayload[] => {
  const seen = new Map<number, number>();
  for (const r of rows) {
    if (!r.mqtId) continue;
    seen.set(Number(r.mqtId), Number(r.score) || 0);
  }
  return Array.from(seen.entries()).map(([measuredQualityTypeId, score]) => ({ measuredQualityTypeId, score }));
};

/**
 * Compact per-scope score editor: pick an MQT, give it a score. Shows what
 * is mapped and what is still left so authoring gaps are visible.
 */
export function ScoreEditor({
  title,
  rows,
  choices,
  onChange,
  hideScore = false,
}: {
  title: string;
  rows: ScoreRow[];
  choices: MqtChoice[];
  onChange: (rows: ScoreRow[]) => void;
  /**
   * Drops the number input, leaving a pure MQT nomination. Used by the linear
   * scale, where the point the respondent picks is the score and a number
   * here would be a second, contradictory answer to "how much".
   */
  hideScore?: boolean;
}) {
  const mapped = new Set(rows.filter((r) => r.mqtId).map((r) => r.mqtId));
  const remaining = choices.filter((c) => !mapped.has(String(c.id)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium inline-flex items-center gap-1">
          <Target className="h-3 w-3 text-primary" />
          {title}
          <span className="text-muted-foreground font-normal">
            — {mapped.size} of {choices.length} MQT{choices.length !== 1 ? 's' : ''} mapped
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => onChange([...rows, { mqtId: '', score: '1' }])}>
          <Plus className="h-3 w-3" /> Map MQT
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={row.mqtId}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, mqtId: e.target.value } : r)))}
                className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-primary"
              >
                <option value="">— pick an MQT —</option>
                {choices.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.label}{mapped.has(String(c.id)) && String(c.id) !== row.mqtId ? ' (mapped)' : ''}
                  </option>
                ))}
              </select>
              {!hideScore && (
                <input
                  type="number"
                  value={row.score}
                  onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, score: e.target.value } : r)))}
                  title="Score"
                  className="w-16 h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-primary"
                />
              )}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-red-500 p-1"
                title="Remove mapping"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining.length > 0 && (
        <p className="text-[0.6875rem] text-muted-foreground truncate" title={remaining.map((r) => r.label).join(', ')}>
          Left: {remaining.slice(0, 3).map((r) => r.label).join(', ')}{remaining.length > 3 ? ` +${remaining.length - 3} more` : ''}
        </p>
      )}
    </div>
  );
}

// ── Form model ─────────────────────────────────────────────────────────────

export interface OptionForm {
  optionText: string;
  contentType: QuestionContentType;
  mediaUrl: string;
  mqtScores: ScoreRow[];
}

export const emptyOption = (): OptionForm => ({ optionText: '', contentType: 'TEXT', mediaUrl: '', mqtScores: [] });

/**
 * One row of a LIKERT_GRID. `mqts` reuses ScoreRow so the row editor can be
 * the same ScoreEditor everything else uses — its score field is hidden, and
 * only the ids are sent, because a row nominates rather than scores.
 */
export interface RowForm {
  rowText: string;
  mqts: ScoreRow[];
}

export const emptyRow = (): RowForm => ({ rowText: '', mqts: [] });

export interface QuestionForm {
  id: number | null;
  contentType: QuestionContentType;
  questionType: QuestionType;
  stem: string;
  mediaUrl: string;
  riskFlag: boolean;
  /** '' = single choice. The count is a string so the input can be emptied. */
  selectionRule: SelectionRule | '';
  selectionCount: string;
  /**
   * MCQ only — randomise the order the options are DELIVERED in. Never sent
   * for a scale or a grid (both are ordered, and the backend 400s on it).
   */
  shuffleOptions: boolean;
  /** LINEAR_SCALE only — captions under the first and last point. */
  scaleLowLabel: string;
  scaleHighLabel: string;
  /** MCQ options — and, on a LIKERT_GRID, its shared columns. */
  options: OptionForm[];
  /** LIKERT_GRID only — the statements. */
  rows: RowForm[];
  mqtScores: ScoreRow[];
}

export const formFrom = (initial: QuestionResponse | null): QuestionForm =>
  initial == null
    ? {
        id: null,
        contentType: 'TEXT',
        questionType: 'MCQ',
        stem: '',
        mediaUrl: '',
        riskFlag: false,
        selectionRule: '',
        selectionCount: '',
        shuffleOptions: false,
        scaleLowLabel: '',
        scaleHighLabel: '',
        // Four blank options by default — the common case. Blank rows are
        // dropped on save, so unwanted ones can just be left empty or removed.
        options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
        rows: [emptyRow(), emptyRow()],
        mqtScores: [],
      }
    : {
        id: initial.questionId,
        contentType: initial.contentType,
        // Questions saved before the type existed come back as MCQ; ?? keeps
        // a response from an older backend meaning the same thing.
        questionType: initial.questionType ?? 'MCQ',
        stem: initial.stem,
        mediaUrl: initial.mediaUrl || '',
        riskFlag: initial.riskFlag,
        selectionRule: initial.selectionRule ?? '',
        selectionCount: initial.selectionCount == null ? '' : String(initial.selectionCount),
        // ?? false so a response from an older backend still opens the form.
        shuffleOptions: initial.shuffleOptions ?? false,
        scaleLowLabel: initial.scaleLowLabel || '',
        scaleHighLabel: initial.scaleHighLabel || '',
        options: initial.options.map((o) => ({
          optionText: o.optionText || '',
          contentType: o.contentType,
          mediaUrl: o.mediaUrl || '',
          mqtScores: viewsToRows(o.mqtScores || []),
        })),
        // A row's MQTs arrive without scores; ScoreRow needs one, and the
        // editor hides the field, so the placeholder is never shown or sent.
        rows: (initial.rows || []).map((r) => ({
          rowText: r.rowText || '',
          mqts: r.mqts.map((m) => ({ mqtId: String(m.measuredQualityTypeId), score: '1' })),
        })),
        mqtScores: viewsToRows(initial.mqtScores || []),
      };

/** Option rows that carry text or media, trimmed. Row order = display order. */
const liveOptions = (form: QuestionForm): OptionForm[] =>
  form.options
    .map((o) => ({ ...o, optionText: o.optionText.trim(), mediaUrl: o.mediaUrl.trim() }))
    .filter((o) => o.optionText || o.mediaUrl);

/**
 * The points a linear scale is made of. The backend GENERATES these on save
 * (they are not authored, and the payload's option list is ignored) — this is
 * the same list, for anything that has to SHOW a scale before it is saved:
 * the preview, and the "n options" summary on the questionnaire editor.
 */
export const scalePoints = (): OptionForm[] =>
  Array.from({ length: SCALE_TO - SCALE_FROM + 1 }, (_, i) => ({
    ...emptyOption(),
    optionText: String(SCALE_FROM + i),
  }));

/** What the respondent will actually be shown, whoever wrote it. */
export const effectiveOptions = (form: QuestionForm): OptionForm[] =>
  form.questionType === 'LINEAR_SCALE' ? scalePoints() : liveOptions(form);

/**
 * Rows that will actually be stored, trimmed. Matches sanitizedRows on the
 * backend: a row survives on text OR a nomination, so trailing blank inputs
 * cost nothing.
 */
export const liveRows = (form: QuestionForm): RowForm[] =>
  form.questionType !== 'LIKERT_GRID'
    ? []
    : form.rows
        .map((r) => ({ ...r, rowText: r.rowText.trim(), mqts: r.mqts.filter((m) => m.mqtId) }))
        .filter((r) => r.rowText || r.mqts.length > 0);

/**
 * (column, MQT) pairs a grid is missing: every MQT any row names has to be
 * scored on every column, or a rating on that row is worth nothing. A
 * WARNING, not an error — a half-scored grid is a legitimate draft, and the
 * backend does not refuse it either.
 */
export function gridScoringGaps(form: QuestionForm): number {
  if (form.questionType !== 'LIKERT_GRID') return 0;
  const needed = new Set(liveRows(form).flatMap((r) => r.mqts.map((m) => m.mqtId)));
  if (needed.size === 0) return 0;
  return liveOptions(form).reduce((gaps, column) => {
    const scored = new Set(column.mqtScores.filter((s) => s.mqtId).map((s) => s.mqtId));
    return gaps + [...needed].filter((id) => !scored.has(id)).length;
  }, 0);
}

/** null when the form can be saved, otherwise the first problem found. */
export function validateQuestionForm(form: QuestionForm): string | null {
  if (!form.stem.trim()) return 'Question text is required';
  if (form.contentType !== 'TEXT' && !form.mediaUrl.trim()) {
    return `A ${form.contentType.toLowerCase()} question needs a media URL`;
  }
  // A scale has no authored options and no selection rule — its points are
  // generated and it is one pick by definition — so the option rules below
  // have nothing to check. Only the two labels are its own.
  if (form.questionType === 'LINEAR_SCALE') {
    if (form.scaleLowLabel.trim().length > 100 || form.scaleHighLabel.trim().length > 100) {
      return 'Scale labels are at most 100 characters';
    }
    return null;
  }
  const rows = liveOptions(form);
  const noun = form.questionType === 'LIKERT_GRID' ? 'Column' : 'Option';
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].contentType !== 'TEXT' && !rows[i].mediaUrl) {
      return `${noun} ${i + 1} is ${rows[i].contentType.toLowerCase()} — it needs a media URL`;
    }
  }
  // Mirrors validateType on the backend, so a grid's shape problems show
  // inline instead of coming back as a 400.
  if (form.questionType === 'LIKERT_GRID') {
    if (liveRows(form).length === 0) return 'A grid needs at least one row';
    if (rows.length < 2) return 'A grid needs at least two columns';
    return null;
  }
  // Mirrors QuestionController.validateSelection, against the same option
  // list the backend will count (blank rows already dropped), so the problem
  // is reported inline instead of coming back as a 400.
  if (form.selectionRule) {
    const n = Number(form.selectionCount);
    if (!form.selectionCount.trim() || !Number.isInteger(n) || n < 1) {
      return 'How many options must be a whole number of at least 1';
    }
    if (n > rows.length) {
      return `This question has ${rows.length} option${rows.length === 1 ? '' : 's'} — ${n} cannot be selected`;
    }
  }
  return null;
}

/** Form → the wire payload. Validate first — this assumes a valid form. */
export function questionPayloadFrom(form: QuestionForm): QuestionPayload {
  const scale = form.questionType === 'LINEAR_SCALE';
  const grid = form.questionType === 'LIKERT_GRID';
  // A scale's options are generated by the backend, and it takes one answer:
  // sending either would be refused. Cleared HERE as well as in the type
  // switch, so a form that reached this point some other way still saves.
  const rows = scale ? [] : liveOptions(form);
  return {
    contentType: form.contentType,
    questionType: form.questionType,
    stem: form.stem.trim(),
    mediaUrl: form.contentType === 'TEXT' ? null : form.mediaUrl.trim(),
    riskFlag: form.riskFlag,
    // Never send a count without a rule — the backend 400s on the pair, and
    // a stale count left behind by switching back to single choice is the
    // only way that happens.
    // A grid is one pick per row for now, so it sends no rule either.
    selectionRule: scale || grid ? null : form.selectionRule || null,
    selectionCount: !scale && !grid && form.selectionRule ? Number(form.selectionCount) : null,
    // A scale's points and a grid's columns are ordered — the backend refuses
    // the flag on both, so it is cleared here as well as in the type switch.
    shuffleOptions: !scale && !grid && form.shuffleOptions,
    scaleLowLabel: scale ? form.scaleLowLabel.trim() || null : null,
    scaleHighLabel: scale ? form.scaleHighLabel.trim() || null : null,
    options: rows.map((o) => ({
      optionText: o.optionText || null,
      contentType: o.contentType,
      mediaUrl: o.contentType === 'TEXT' ? null : o.mediaUrl,
      mqtScores: rowsToPayload(o.mqtScores),
    })),
    // Ids only: a row nominates its MQTs, the columns carry the numbers.
    rows: liveRows(form).map((r) => ({
      rowText: r.rowText || null,
      measuredQualityTypeIds: r.mqts.map((m) => Number(m.mqtId)),
    })),
    mqtScores: rowsToPayload(form.mqtScores),
  };
}

/**
 * Every field of a bank question — stem type, text, media URL, risk flag,
 * question-level MQT scores and the option list with per-option scores.
 * Fully controlled: it never saves anything, the host decides when to write.
 */
export function QuestionFormFields({
  form,
  onChange,
  choices,
}: {
  form: QuestionForm;
  onChange: (next: QuestionForm) => void;
  choices: MqtChoice[];
}) {
  const set = (patch: Partial<QuestionForm>) => onChange({ ...form, ...patch });
  const isScale = form.questionType === 'LINEAR_SCALE';
  const isGrid = form.questionType === 'LIKERT_GRID';
  const scoringGaps = gridScoringGaps(form);
  // Options that will actually be stored — what the selection count is
  // validated against, here and on the backend.
  const liveCount = liveOptions(form).length;
  const selectionHint = `${form.selectionCount || '?'} of ${liveCount}`;
  const patchOption = (i: number, patch: Partial<OptionForm>) =>
    set({ options: form.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const addOption = () => set({ options: [...form.options, emptyOption()] });
  const removeOption = (i: number) => set({ options: form.options.filter((_, j) => j !== i) });
  const moveOption = (i: number, dir: -1 | 1) => {
    const next = [...form.options];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ options: next });
  };
  const patchRow = (i: number, patch: Partial<RowForm>) =>
    set({ rows: form.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRow = () => set({ rows: [...form.rows, emptyRow()] });
  const removeRow = (i: number) => set({ rows: form.rows.filter((_, j) => j !== i) });
  const moveRow = (i: number, dir: -1 | 1) => {
    const next = [...form.rows];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ rows: next });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Stem type *</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONTENT_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                disabled={t.disabled}
                onClick={() => set({ contentType: t.value })}
                title={t.disabled ? 'File upload needs object storage — coming later' : undefined}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                  form.contentType === t.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                  t.disabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          Image & video need a file upload — disabled until object storage
          is set up. Use URL for externally hosted media.
        </p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Question text *</label>
        <textarea
          rows={2}
          value={form.stem}
          onChange={(e) => set({ stem: e.target.value })}
          placeholder="e.g., I enjoy meeting new people."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      {form.contentType !== 'TEXT' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Media URL *</label>
          <input
            value={form.mediaUrl}
            onChange={(e) => set({ mediaUrl: e.target.value })}
            placeholder="https://… (link to an image or video)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.riskFlag}
          onChange={(e) => set({ riskFlag: e.target.checked })}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span className="font-medium inline-flex items-center gap-1">
          <Flag className="h-3.5 w-3.5 text-red-500" /> Risk flag
        </span>
        <span className="text-muted-foreground">— responses to this question are surfaced for risk review</span>
      </label>

      {/* What SHAPE the question is. Sits above the scoring and option
          editors because it decides which of them are shown at all. */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Question type *</label>
        <select
          value={form.questionType}
          onChange={(e) => {
            const questionType = e.target.value as QuestionType;
            // A scale is one pick and has no authored options, so leaving MCQ
            // clears the rule with it — the same reason the rule dropdown
            // clears its count. The option rows are LEFT ALONE so switching
            // back and forth does not throw away what was typed.
            set({
              questionType,
              ...(questionType === 'LINEAR_SCALE' ? { selectionRule: '' as const, selectionCount: '' } : {}),
              // Shuffling belongs to an MCQ: a scale's points and a grid's
              // columns are ordered, so leaving MCQ drops the flag rather
              // than sending one the backend would refuse.
              ...(questionType === 'MCQ' ? {} : { shuffleOptions: false }),
            });
          }}
          className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <p className="text-[0.6875rem] text-muted-foreground">
          {QUESTION_TYPES.find((t) => t.value === form.questionType)?.hint}
        </p>
      </div>

      {/* Question-level MQT scoring */}
      <div className="rounded-lg border border-border/70 p-3">
        <ScoreEditor
          title={isScale ? 'Question → MQT mapping' : 'Question → MQT scores'}
          rows={form.mqtScores}
          choices={choices}
          onChange={(rows) => set({ mqtScores: rows })}
          hideScore={isScale}
        />
        {isScale && (
          <p className="text-[0.6875rem] text-muted-foreground mt-1.5">
            No number to enter — the point the respondent picks IS the score for
            every MQT mapped here ({SCALE_FROM} scores {SCALE_FROM}, {SCALE_TO} scores {SCALE_TO}).
          </p>
        )}
      </div>

      {isScale ? (
        /* A scale is authored as two captions: the points themselves are
           fixed 1—5 and generated on save, so there is nothing to type. */
        <div className="rounded-lg border border-border/70 p-3 space-y-2">
          <label className="text-sm font-medium">Scale labels</label>
          <div className="flex items-center gap-2">
            <span className="w-4 text-xs text-muted-foreground shrink-0">{SCALE_FROM}</span>
            <input
              value={form.scaleLowLabel}
              onChange={(e) => set({ scaleLowLabel: e.target.value })}
              maxLength={100}
              placeholder="Label for the low end (optional) — e.g. Strongly disagree"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 text-xs text-muted-foreground shrink-0">{SCALE_TO}</span>
            <input
              value={form.scaleHighLabel}
              onChange={(e) => set({ scaleHighLabel: e.target.value })}
              maxLength={100}
              placeholder="Label for the high end (optional) — e.g. Strongly agree"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
            <p className="text-[0.6875rem] text-muted-foreground mb-2">Respondents will see</p>
            <div className="flex items-end justify-between gap-2">
              <span className="text-xs text-muted-foreground max-w-[30%] truncate">{form.scaleLowLabel}</span>
              <div className="flex items-end gap-4">
                {scalePoints().map((p) => (
                  <div key={p.optionText} className="flex flex-col items-center gap-1">
                    <span className="h-4 w-4 rounded-full border border-border bg-background" />
                    <span className="text-[0.6875rem] text-muted-foreground">{p.optionText}</span>
                  </div>
                ))}
              </div>
              <span className="text-xs text-muted-foreground max-w-[30%] truncate text-right">{form.scaleHighLabel}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
      {isGrid && (
        /* Rows are the statements. Each names the MQTs it measures — a pure
           nomination, which is why the score field is hidden: the number
           comes from the column the respondent picks. */
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Rows (statements)</label>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3 w-3" /> Add row
            </Button>
          </div>
          {form.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No rows yet — add the statements respondents rate.
            </p>
          ) : (
            <div className="space-y-2">
              {form.rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-border/70 p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <input
                      value={row.rowText}
                      onChange={(e) => patchRow(i, { rowText: e.target.value })}
                      placeholder={`Row ${i + 1} — e.g. I plan my week ahead`}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveRow(i, 1)} disabled={i === form.rows.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-500 p-1" title="Remove row">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ScoreEditor
                    title={`Row ${i + 1} measures`}
                    rows={row.mqts}
                    choices={choices}
                    onChange={(mqts) => patchRow(i, { mqts })}
                    hideScore
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-[0.6875rem] text-muted-foreground">
            One pick per row, and every row must be answered. Rows lock once
            anyone has responded; which MQTs they measure never does.
          </p>
        </div>
      )}

      {!isGrid && (
      /* How many options the respondent may pick. Sits directly above the
          option list because it changes what that list means. */
      <div className="rounded-lg border border-border/70 p-3 space-y-1.5">
        <label className="text-sm font-medium">How many options can be selected</label>
        <div className="flex items-center gap-2">
          <select
            value={form.selectionRule}
            onChange={(e) => {
              const rule = e.target.value as SelectionRule | '';
              // Leaving multi-select clears the count with it, so the payload
              // can never carry one without a rule.
              set({ selectionRule: rule, selectionCount: rule ? form.selectionCount || '2' : '' });
            }}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Single choice — one option</option>
            <option value="MAX">Max — up to</option>
            <option value="MIN">Min — at least</option>
            <option value="EQUALS">Equals — exactly</option>
          </select>
          {form.selectionRule && (
            <>
              <input
                type="number"
                min={1}
                max={liveCount}
                value={form.selectionCount}
                onChange={(e) => set({ selectionCount: e.target.value })}
                className="h-9 w-20 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs text-muted-foreground">
                of {liveCount} option{liveCount === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          {form.selectionRule
            ? `Respondents tick checkboxes and must pick ${
                form.selectionRule === 'EQUALS'
                  ? `exactly ${selectionHint}`
                  : form.selectionRule === 'MAX'
                    ? `between 1 and ${selectionHint}`
                    : `at least ${selectionHint}`
              }. Locked once anyone has answered.`
            : 'Respondents pick one option, as radio buttons.'}
        </p>
      </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{isGrid ? 'Columns (the rating scale)' : 'Options'}</label>
          <div className="flex items-center gap-2">
            {/* Shuffle sits beside Add option because it is about this list.
                Hidden on a grid — those columns are one shared rating scale
                and reordering them would scramble the scale itself. */}
            {!isGrid && (
              <button
                type="button"
                role="switch"
                aria-checked={form.shuffleOptions}
                onClick={() => set({ shuffleOptions: !form.shuffleOptions })}
                title={
                  form.shuffleOptions
                    ? 'Each respondent sees these options in a different order'
                    : 'Every respondent sees these options in the order below'
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 h-8 text-xs font-medium transition-colors',
                  form.shuffleOptions
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <Shuffle className="h-3 w-3" />
                Shuffle
                <span
                  className={cn(
                    'ml-0.5 h-4 w-7 rounded-full p-0.5 transition-colors',
                    form.shuffleOptions ? 'bg-primary' : 'bg-border',
                  )}
                >
                  <span
                    className={cn(
                      'block h-3 w-3 rounded-full bg-white transition-transform',
                      form.shuffleOptions && 'translate-x-3',
                    )}
                  />
                </span>
              </button>
            )}
            <Button variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-3 w-3" /> Add {isGrid ? 'column' : 'option'}
            </Button>
          </div>
        </div>
        {!isGrid && form.shuffleOptions && (
          <p className="text-[0.6875rem] text-muted-foreground">
            Options are delivered in a random order — different for each respondent, and
            fixed for the whole of their attempt. The order below stays the authored one:
            it is what previews, exports and the scoring key use.
          </p>
        )}
        {isGrid && scoringGaps > 0 && (
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-500 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {scoringGaps} (column → MQT) score{scoringGaps === 1 ? '' : 's'} still missing — every MQT a
            row measures needs a score on every column, or a rating on that row is worth nothing.
          </p>
        )}
        {form.options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {isGrid
              ? 'No columns yet — add the rating scale respondents pick from.'
              : 'No options yet — add the choices the respondent picks from.'}
          </p>
        ) : (
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="rounded-lg border border-border/70 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <select
                    value={opt.contentType}
                    onChange={(e) => patchOption(i, { contentType: e.target.value as QuestionContentType })}
                    className="h-8 rounded-md border border-border bg-background px-1.5 text-xs focus:outline-none focus:border-primary"
                    title="Option type"
                  >
                    {CONTENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value} disabled={t.disabled && opt.contentType !== t.value}>
                        {t.label}{t.disabled ? ' (soon)' : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    value={opt.optionText}
                    onChange={(e) => patchOption(i, { optionText: e.target.value })}
                    placeholder={`${isGrid ? 'Column' : 'Option'} ${i + 1} text${opt.contentType !== 'TEXT' ? ' (caption, optional)' : ''}`}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveOption(i, 1)} disabled={i === form.options.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeOption(i)} className="text-muted-foreground hover:text-red-500 p-1" title="Remove option">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {opt.contentType !== 'TEXT' && (
                  <input
                    value={opt.mediaUrl}
                    onChange={(e) => patchOption(i, { mediaUrl: e.target.value })}
                    placeholder="https://… (link to an image or video)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                )}
                <ScoreEditor
                  title={`${isGrid ? 'Column' : 'Option'} ${i + 1} → MQT scores`}
                  rows={opt.mqtScores}
                  choices={choices}
                  onChange={(rows) => patchOption(i, { mqtScores: rows })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

/**
 * Create/edit modal for a bank question. Mount it to open (state resets on
 * every mount): `{open && <QuestionFormModal … />}`. Saves to the bank itself
 * and hands the saved question to onSaved — closing is the parent's call.
 */
export function QuestionFormModal({
  initial,
  choices,
  onClose,
  onSaved,
}: {
  /** null = create a new bank question; an existing question = edit it. */
  initial: QuestionResponse | null;
  choices: MqtChoice[];
  onClose: () => void;
  onSaved: (saved: QuestionResponse) => void | Promise<void>;
}) {
  const [form, setForm] = useState<QuestionForm>(() => formFrom(initial));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const problem = validateQuestionForm(form);
    if (problem) { setFormError(problem); return; }
    const payload = questionPayloadFrom(form);
    setSaving(true);
    try {
      const res = form.id != null
        ? await questionApis.updateQuestion(form.id, payload)
        : await questionApis.createQuestion(payload);
      await onSaved(res.data);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
          <CardTitle className="text-base">{form.id != null ? 'Edit Question' : 'Add Question'}</CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <QuestionFormFields form={form} onChange={setForm} choices={choices} />
        </CardContent>
        <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {form.id != null ? 'Save' : 'Add Question'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
