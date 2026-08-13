import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Flag,
  Grid3x3,
  HelpCircle,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { questionApis, selectionLabel, SCALE_FROM, SCALE_TO, type QuestionResponse } from './questionApis';
import { questionnairesApi, type QuestionnaireResponse } from '../questionnaires/questionnairesApi';
import { qualitiesApi } from '../MeasuredQuality/qualitiesApi';
// The create/edit form itself lives in question-form-modal.tsx so the
// questionnaire wizard's Step 2 renders the exact same modal.
import {
  QuestionFormModal,
  choicesFromQualities,
  contentMeta,
  type MqtChoice,
} from './question-form-modal';
// The XLSX upload (template, parser, review modal) lives in
// question-bulk-upload.tsx for the same reason — Step 2 uploads with the
// SAME template, additionally consuming the section column ignored here.
import { BulkUploadModal } from './question-bulk-upload';

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<QuestionResponse[]>([]);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireResponse[]>([]);
  const [mqtChoices, setMqtChoices] = useState<MqtChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  // 'ALL', 'NONE' (unattached) or a questionnaireId as string.
  const [filterQid, setFilterQid] = useState('ALL');

  // undefined = editor closed, null = creating, a question = editing it.
  const [editing, setEditing] = useState<QuestionResponse | null | undefined>(undefined);

  const [confirmDelete, setConfirmDelete] = useState<QuestionResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

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
      setQuestions(filterQid === 'NONE' ? qs.data.filter((q) => q.usedIn.length === 0) : qs.data);
      setQuestionnaires(qn.data);
      setMqtChoices(choicesFromQualities(mq.data));
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
        q.usedIn.some((u) => u.name.toLowerCase().includes(s)) ||
        q.options.some((o) => (o.optionText || '').toLowerCase().includes(s)),
    );
  }, [questions, search]);

  const totalOptions = useMemo(() => questions.reduce((a, q) => a + q.options.length, 0), [questions]);

  const openCreate = () => setEditing(null);
  const openEdit = (q: QuestionResponse) => setEditing(q);

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

  const onBulkDone = async () => {
    setUploadOpen(false);
    await refresh();
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
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4" />
              Upload XLSX
            </Button>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
          </div>
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
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Unattached</p><p className="text-2xl font-semibold mt-1">{questions.filter((q) => q.usedIn.length === 0).length}</p></CardContent></Card>
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
                    {/* A scale's options are the points 1—5, so the list line
                        above reads "5 options · 1 · 2 · 3 · 4 …" — true, but
                        it takes a badge to recognise it as a scale. */}
                    {q.questionType === 'LIKERT_GRID' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                        title={`Likert grid — ${q.rows.length} row${q.rows.length === 1 ? '' : 's'} rated on ${q.options.length} column${q.options.length === 1 ? '' : 's'}, one pick per row`}
                      >
                        <Grid3x3 className="h-3 w-3" />
                        {q.rows.length}×{q.options.length}
                      </span>
                    )}
                    {q.questionType === 'LINEAR_SCALE' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                        title={`Linear scale ${SCALE_FROM}—${SCALE_TO}${q.scaleLowLabel || q.scaleHighLabel ? ` · ${q.scaleLowLabel ?? ''} → ${q.scaleHighLabel ?? ''}` : ''}`}
                      >
                        <SlidersHorizontal className="h-3 w-3" />
                        {SCALE_FROM}–{SCALE_TO}
                      </span>
                    )}
                    {q.selectionRule && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                        title={selectionLabel(q.selectionRule, q.selectionCount, q.options.length)}
                      >
                        <ListChecks className="h-3 w-3" />
                        {q.selectionRule === 'EQUALS' ? '=' : q.selectionRule === 'MAX' ? '≤' : '≥'} {q.selectionCount}
                      </span>
                    )}
                    {q.riskFlag && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                        <Flag className="h-3 w-3" /> risk
                      </span>
                    )}
                    {q.usedIn.length > 0 ? (
                      <span
                        className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground max-w-[180px] truncate"
                        title={q.usedIn.map((u) => u.name).join(', ')}
                      >
                        {q.usedIn[0].name}{q.usedIn.length > 1 ? ` +${q.usedIn.length - 1}` : ''}
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

      {/* Create / edit modal — the shared form, identical in the wizard */}
      {editing !== undefined && (
        <QuestionFormModal
          initial={editing}
          choices={mqtChoices}
          onClose={() => setEditing(undefined)}
          onSaved={async () => { await refresh(); setEditing(undefined); }}
        />
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
                {confirmDelete.usedIn.length > 0 ? <> (currently used in <strong>{confirmDelete.usedIn.map((u) => u.name).join(', ')}</strong>)</> : null}?
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

      {/* Bulk XLSX upload — unmounts on close so its state resets each time */}
      {uploadOpen && (
        <BulkUploadModal choices={mqtChoices} onClose={() => setUploadOpen(false)} onDone={onBulkDone} />
      )}
    </div>
  );
}
