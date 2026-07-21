import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Flag,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
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
import { questionnairesApi, type QuestionnaireResponse } from '../questionnaires/questionnairesApi';
import { qualitiesApi, type MQ, type MQT } from '../MeasuredQuality/qualitiesApi';

// IMAGE/VIDEO need a file upload, and there is no object storage yet (MySQL
// is no place for videos, and base64 images are not worth it either) — both
// stay disabled until object storage lands. URL covers externally hosted
// media meanwhile.
const CONTENT_TYPES: Array<{ value: QuestionContentType; label: string; icon: typeof Type; disabled?: boolean }> = [
  { value: 'TEXT', label: 'Text', icon: Type },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon, disabled: true },
  { value: 'VIDEO', label: 'Video', icon: Video, disabled: true },
  { value: 'URL', label: 'URL', icon: Link2 },
];

const contentMeta = (t: QuestionContentType) => CONTENT_TYPES.find((c) => c.value === t) ?? CONTENT_TYPES[0];

// ── MQT choices — the flattened tree, labels showing the full path ─────────
interface MqtChoice {
  id: number;
  label: string;
}

function flattenMqts(mqs: MQ[]): MqtChoice[] {
  const out: MqtChoice[] = [];
  const walk = (nodes: MQT[] | undefined, prefix: string) => {
    for (const n of nodes || []) {
      out.push({ id: Number(n.id), label: `${prefix} › ${n.name}` });
      walk(n.children, `${prefix} › ${n.name}`);
    }
  };
  for (const mq of mqs) walk(mq.mqts, mq.name);
  return out;
}

// ── Score rows (shared by the question and each option) ────────────────────
interface ScoreRow {
  mqtId: string; // '' until picked
  score: string; // input value; parsed on submit
}

const viewsToRows = (views: MqtScoreView[]): ScoreRow[] =>
  views.map((v) => ({ mqtId: String(v.measuredQualityTypeId), score: String(v.score) }));

const rowsToPayload = (rows: ScoreRow[]): MqtScorePayload[] => {
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
function ScoreEditor({
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

interface OptionForm {
  optionText: string;
  contentType: QuestionContentType;
  mediaUrl: string;
  mqtScores: ScoreRow[];
}

const emptyOption = (): OptionForm => ({ optionText: '', contentType: 'TEXT', mediaUrl: '', mqtScores: [] });

interface QuestionForm {
  id: number | null;
  contentType: QuestionContentType;
  stem: string;
  mediaUrl: string;
  riskFlag: boolean;
  options: OptionForm[];
  mqtScores: ScoreRow[];
}

const EMPTY_FORM: QuestionForm = {
  id: null,
  contentType: 'TEXT',
  stem: '',
  mediaUrl: '',
  riskFlag: false,
  options: [],
  mqtScores: [],
};

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<QuestionResponse[]>([]);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireResponse[]>([]);
  const [mqtChoices, setMqtChoices] = useState<MqtChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  // 'ALL', 'NONE' (unattached) or a questionnaireId as string.
  const [filterQid, setFilterQid] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<QuestionForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<QuestionResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const [qs, qn, mq] = await Promise.all([
        filterQid === 'ALL' || filterQid === 'NONE'
          ? questionApis.getAllQuestions()
          : questionApis.getQuestionsByQuestionnaireId(Number(filterQid)),
        questionnairesApi.getQuestionnaires(),
        qualitiesApi.getQualities(),
      ]);
      // 'NONE' = bank questions not attached to any questionnaire yet.
      setQuestions(filterQid === 'NONE' ? qs.data.filter((q) => q.questionnaireId == null) : qs.data);
      setQuestionnaires(qn.data);
      setMqtChoices(flattenMqts(
        qs && mq.data.map((m) => ({
          id: String(m.measuredQualityId),
          name: m.name,
          description: m.description || '',
          mqts: (m.mqts || []).map(function toMqt(n): MQT {
            return { id: String(n.measuredQualityTypeId), name: n.name, children: n.children?.map(toMqt) };
          }),
        })),
      ));
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load questions');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  // Re-fetch when the questionnaire filter changes.
  useEffect(() => { refresh(true); }, [filterQid]);

  const filtered = useMemo(() => {
    if (!search) return questions;
    const s = search.toLowerCase();
    return questions.filter(
      (q) =>
        q.stem.toLowerCase().includes(s) ||
        (q.questionnaireName || '').toLowerCase().includes(s) ||
        q.options.some((o) => (o.optionText || '').toLowerCase().includes(s)),
    );
  }, [questions, search]);

  const totalOptions = useMemo(() => questions.reduce((a, q) => a + q.options.length, 0), [questions]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, options: [emptyOption(), emptyOption()], mqtScores: [] });
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (q: QuestionResponse) => {
    setForm({
      id: q.questionId,
      contentType: q.contentType,
      stem: q.stem,
      mediaUrl: q.mediaUrl || '',
      riskFlag: q.riskFlag,
      options: q.options.map((o) => ({
        optionText: o.optionText || '',
        contentType: o.contentType,
        mediaUrl: o.mediaUrl || '',
        mqtScores: viewsToRows(o.mqtScores || []),
      })),
      mqtScores: viewsToRows(q.mqtScores || []),
    });
    setFormError('');
    setModalOpen(true);
  };

  // --- Option list editing ---
  const patchOption = (i: number, patch: Partial<OptionForm>) =>
    setForm((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const addOption = () => setForm((p) => ({ ...p, options: [...p.options, emptyOption()] }));
  const removeOption = (i: number) =>
    setForm((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }));
  const moveOption = (i: number, dir: -1 | 1) =>
    setForm((p) => {
      const next = [...p.options];
      const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, options: next };
    });

  const submit = async () => {
    const stem = form.stem.trim();
    if (!stem) { setFormError('Question text is required'); return; }
    if (form.contentType !== 'TEXT' && !form.mediaUrl.trim()) {
      setFormError(`A ${form.contentType.toLowerCase()} question needs a media URL`);
      return;
    }
    // Keep option rows that carry text or media; each non-TEXT option needs
    // its media URL. Row order is the display order.
    const rows = form.options
      .map((o) => ({ ...o, optionText: o.optionText.trim(), mediaUrl: o.mediaUrl.trim() }))
      .filter((o) => o.optionText || o.mediaUrl);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].contentType !== 'TEXT' && !rows[i].mediaUrl) {
        setFormError(`Option ${i + 1} is ${rows[i].contentType.toLowerCase()} — it needs a media URL`);
        return;
      }
    }
    const payload: QuestionPayload = {
      contentType: form.contentType,
      stem,
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
    setSaving(true);
    try {
      if (form.id != null) {
        await questionApis.updateQuestion(form.id, payload);
      } else {
        await questionApis.createQuestion(payload);
      }
      await refresh();
      setModalOpen(false);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError('');
    try {
      await questionApis.deleteQuestion(confirmDelete.questionId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Question Bank</span><span>/</span>
          <span className="text-foreground font-medium">Questions</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-primary" />
              Questions
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The question bank. Author each question with its options and its
              MQT scoring — question-level scores and per-option scores — in one
              place. Attaching questions to a questionnaire happens in
              questionnaire authoring.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Question
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Questions</p><p className="text-2xl font-semibold mt-1">{questions.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Options</p><p className="text-2xl font-semibold mt-1">{totalOptions}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Unattached</p><p className="text-2xl font-semibold mt-1">{questions.filter((q) => q.questionnaireId == null).length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search question text, options or questionnaire..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
          />
        </div>
        <select
          value={filterQid}
          onChange={(e) => setFilterQid(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
        >
          <option value="ALL">All questions</option>
          <option value="NONE">Unattached only</option>
          {questionnaires.map((qn) => (
            <option key={qn.questionnaireId} value={String(qn.questionnaireId)}>{qn.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading questions…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <HelpCircle className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {questions.length === 0 ? 'No questions yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {questions.length === 0
                ? 'Add your first question to start building the bank.'
                : 'Try a different search term or filter.'}
            </p>
            {questions.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Add your first question
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((q) => {
              const meta = contentMeta(q.contentType);
              const Icon = meta.icon;
              const optionScoreCount = q.options.reduce((a, o) => a + (o.mqtScores?.length || 0), 0);
              const scoreCount = (q.mqtScores?.length || 0) + optionScoreCount;
              return (
                <li
                  key={q.questionId}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => openEdit(q)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{q.stem}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="shrink-0">
                        {q.options.length} option{q.options.length !== 1 ? 's' : ''}
                      </span>
                      <span className={cn('inline-flex items-center gap-1 shrink-0', scoreCount === 0 && 'text-amber-600 dark:text-amber-500')}>
                        <Target className="h-3 w-3" />
                        {scoreCount === 0 ? 'not scored' : `${scoreCount} score${scoreCount !== 1 ? 's' : ''}`}
                      </span>
                      {q.options.length > 0 && (
                        <span className="truncate">
                          {q.options.slice(0, 4).map((o) => o.optionText || `[${o.contentType.toLowerCase()}]`).join(' · ')}{q.options.length > 4 ? ' …' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {q.riskFlag && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                        <Flag className="h-3 w-3" /> risk
                      </span>
                    )}
                    {q.questionnaireName ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground max-w-[180px] truncate">
                        {q.questionnaireName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground/70">
                        unattached
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      mode="icon"
                      onClick={(e) => { e.stopPropagation(); openEdit(q); }}
                      title="Edit question"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      mode="icon"
                      onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(q); }}
                      title="Delete question"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">{form.id != null ? 'Edit Question' : 'Add Question'}</CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
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
                        onClick={() => setForm({ ...form, contentType: t.value })}
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
                  onChange={(e) => setForm({ ...form, stem: e.target.value })}
                  placeholder="e.g., I enjoy meeting new people."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {form.contentType !== 'TEXT' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Media URL *</label>
                  <input
                    value={form.mediaUrl}
                    onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
                    placeholder="https://… (link to an image or video)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.riskFlag}
                  onChange={(e) => setForm({ ...form, riskFlag: e.target.checked })}
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
                  choices={mqtChoices}
                  onChange={(rows) => setForm((p) => ({ ...p, mqtScores: rows }))}
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
                          choices={mqtChoices}
                          onChange={(rows) => patchOption(i, { mqtScores: rows })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Add Question'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setConfirmDelete(null)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete Question
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
              <p className="text-sm">
                Remove this question, its {confirmDelete.options.length} option{confirmDelete.options.length !== 1 ? 's' : ''} and its MQT scores from the bank
                {confirmDelete.questionnaireName ? <> (currently attached to <strong>{confirmDelete.questionnaireName}</strong>)</> : null}?
                Questions that already have responses cannot be deleted.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="primary" onClick={doDelete} className="bg-red-600 hover:bg-red-700 text-white">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
