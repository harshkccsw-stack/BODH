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
  type MqtScorePayload,
  type MqtScoreView,
  type QuestionContentType,
  type QuestionPayload,
  type QuestionResponse,
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
}: {
  title: string;
  rows: ScoreRow[];
  choices: MqtChoice[];
  onChange: (rows: ScoreRow[]) => void;
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
              <input
                type="number"
                value={row.score}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, score: e.target.value } : r)))}
                title="Score"
                className="w-16 h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-primary"
              />
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

export interface QuestionForm {
  id: number | null;
  contentType: QuestionContentType;
  stem: string;
  mediaUrl: string;
  riskFlag: boolean;
  options: OptionForm[];
  mqtScores: ScoreRow[];
}

export const formFrom = (initial: QuestionResponse | null): QuestionForm =>
  initial == null
    ? {
        id: null,
        contentType: 'TEXT',
        stem: '',
        mediaUrl: '',
        riskFlag: false,
        // Four blank options by default — the common case. Blank rows are
        // dropped on save, so unwanted ones can just be left empty or removed.
        options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
        mqtScores: [],
      }
    : {
        id: initial.questionId,
        contentType: initial.contentType,
        stem: initial.stem,
        mediaUrl: initial.mediaUrl || '',
        riskFlag: initial.riskFlag,
        options: initial.options.map((o) => ({
          optionText: o.optionText || '',
          contentType: o.contentType,
          mediaUrl: o.mediaUrl || '',
          mqtScores: viewsToRows(o.mqtScores || []),
        })),
        mqtScores: viewsToRows(initial.mqtScores || []),
      };

/** Option rows that carry text or media, trimmed. Row order = display order. */
const liveOptions = (form: QuestionForm): OptionForm[] =>
  form.options
    .map((o) => ({ ...o, optionText: o.optionText.trim(), mediaUrl: o.mediaUrl.trim() }))
    .filter((o) => o.optionText || o.mediaUrl);

/** null when the form can be saved, otherwise the first problem found. */
export function validateQuestionForm(form: QuestionForm): string | null {
  if (!form.stem.trim()) return 'Question text is required';
  if (form.contentType !== 'TEXT' && !form.mediaUrl.trim()) {
    return `A ${form.contentType.toLowerCase()} question needs a media URL`;
  }
  const rows = liveOptions(form);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].contentType !== 'TEXT' && !rows[i].mediaUrl) {
      return `Option ${i + 1} is ${rows[i].contentType.toLowerCase()} — it needs a media URL`;
    }
  }
  return null;
}

/** Form → the wire payload. Validate first — this assumes a valid form. */
export function questionPayloadFrom(form: QuestionForm): QuestionPayload {
  const rows = liveOptions(form);
  return {
    contentType: form.contentType,
    stem: form.stem.trim(),
    mediaUrl: form.contentType === 'TEXT' ? null : form.mediaUrl.trim(),
    riskFlag: form.riskFlag,
    options: rows.map((o) => ({
      optionText: o.optionText || null,
      contentType: o.contentType,
      mediaUrl: o.contentType === 'TEXT' ? null : o.mediaUrl,
      mqtScores: rowsToPayload(o.mqtScores),
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

      {/* Question-level MQT scoring */}
      <div className="rounded-lg border border-border/70 p-3">
        <ScoreEditor
          title="Question → MQT scores"
          rows={form.mqtScores}
          choices={choices}
          onChange={(rows) => set({ mqtScores: rows })}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Options</label>
          <Button variant="outline" size="sm" onClick={addOption}>
            <Plus className="h-3 w-3" /> Add option
          </Button>
        </div>
        {form.options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No options yet — add the choices the respondent picks from.
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
                    placeholder={`Option ${i + 1} text${opt.contentType !== 'TEXT' ? ' (caption, optional)' : ''}`}
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
                  title={`Option ${i + 1} → MQT scores`}
                  rows={opt.mqtScores}
                  choices={choices}
                  onChange={(rows) => patchOption(i, { mqtScores: rows })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
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
