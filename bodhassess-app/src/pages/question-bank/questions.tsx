import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Flag,
  Grid3x3,
  HelpCircle,
  ListChecks,
  Loader2,
  Pencil,
  PenLine,
  Plus,
  Search,
  Shuffle,
  SlidersHorizontal,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  questionApis,
  selectionLabel,
  DEFAULT_SCALE_FROM,
  DEFAULT_SCALE_TO,
  type QuestionResponse,
} from './questionApis';
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
import type { BlockedQuestion } from './questionApis';

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

  /*
   * Multi-select. Ids, not rows: the list is re-fetched after every write and
   * re-filtered as you type, and a selection of objects would quietly go
   * stale against both. Ids that leave the list stay selected but count for
   * nothing — `selectedHere` is what the toolbar acts on.
   */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkBlocked, setBulkBlocked] = useState<BlockedQuestion[]>([]);

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

  /** The selection as it applies to what is on screen right now. */
  const selectedHere = useMemo(
    () => filtered.filter((q) => selected.has(q.questionId)),
    [filtered, selected],
  );
  const allShownSelected = filtered.length > 0 && selectedHere.length === filtered.length;

  const toggleOne = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleAllShown = () => setSelected((prev) => {
    const next = new Set(prev);
    if (allShownSelected) filtered.forEach((q) => next.delete(q.questionId));
    else filtered.forEach((q) => next.add(q.questionId));
    return next;
  });

  const clearSelection = () => setSelected(new Set());

  /** Drop the ones the server refused, so the rest can go in one more click. */
  const dropBlockedFromSelection = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      bulkBlocked.forEach((b) => next.delete(b.questionId));
      return next;
    });
    setBulkBlocked([]);
    setBulkError('');
  };

  const doBulkDelete = async () => {
    if (selectedHere.length === 0) return;
    setBulkBusy(true);
    setBulkError('');
    setBulkBlocked([]);
    try {
      await questionApis.bulkDeleteQuestions(selectedHere.map((q) => q.questionId));
      setConfirmBulk(false);
      clearSelection();
      await refresh();
    } catch (e: any) {
      setBulkBlocked(e?.response?.data?.blocked ?? []);
      setBulkError(e?.response?.data?.message || e?.message || 'Failed to delete');
    } finally {
      setBulkBusy(false);
    }
  };

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
          {/* Select-all sits in the same column as the row checkboxes, and
              turns into the bulk bar once anything is picked. */}
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/30 px-4 py-2">
            <input
              type="checkbox"
              checked={allShownSelected}
              ref={(el) => { if (el) el.indeterminate = selectedHere.length > 0 && !allShownSelected; }}
              onChange={toggleAllShown}
              className="h-4 w-4 shrink-0 rounded"
              aria-label="Select every question shown"
            />
            <span className="text-xs text-muted-foreground">
              {selectedHere.length > 0
                ? `${selectedHere.length} selected`
                : `${filtered.length} question${filtered.length === 1 ? '' : 's'}`}
            </span>
            {selectedHere.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[0.6875rem] font-medium text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setBulkError(''); setBulkBlocked([]); setConfirmBulk(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-600" /> Delete {selectedHere.length}
                </Button>
              </div>
            )}
          </div>
          <ul className="divide-y divide-border">
            {filtered.map((q) => {
              const meta = contentMeta(q.contentType);
              const Icon = meta.icon;
              const optionScoreCount = q.options.reduce((a, o) => a + (o.mqtScores?.length || 0), 0);
              const scoreCount = (q.mqtScores?.length || 0) + optionScoreCount;
              return (
                <li
                  key={q.questionId}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer',
                    selected.has(q.questionId) ? 'bg-primary/5' : 'hover:bg-muted/40',
                  )}
                  onClick={() => openEdit(q)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(q.questionId)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleOne(q.questionId)}
                    className="h-4 w-4 shrink-0 rounded"
                    aria-label={`Select "${q.stem}"`}
                  />
                  {/* flex-1 is what stops the row spreading: without it the
                      stem claims only its own width, justify-between pushes
                      the badges to the far edge, and a question with six of
                      them takes the buttons off the screen. */}
                  <div className="min-w-0 flex-1">
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
                  {/* Badges give way — they wrap, then truncate — so the two
                      actions on the right are always reachable. */}
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
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
                        title={`Linear scale ${q.scaleFrom ?? DEFAULT_SCALE_FROM}—${q.scaleTo ?? DEFAULT_SCALE_TO}${q.scaleLowLabel || q.scaleHighLabel ? ` · ${q.scaleLowLabel ?? ''} → ${q.scaleHighLabel ?? ''}` : ''}`}
                      >
                        <SlidersHorizontal className="h-3 w-3" />
                        {q.scaleFrom ?? DEFAULT_SCALE_FROM}–{q.scaleTo ?? DEFAULT_SCALE_TO}
                      </span>
                    )}
                    {q.questionType === 'SHORT_ANSWER' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                        title="Short answer — respondents type their answer"
                      >
                        <PenLine className="h-3 w-3" /> text
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
                    {q.shuffleOptions && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
                        title="Options are delivered in a random order — different for each respondent. The order shown here is the authored one."
                      >
                        <Shuffle className="h-3 w-3" /> shuffled
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
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
          // A type created inside the form exists from that moment; the
          // picker has to know it without waiting for the next refresh.
          onCreateChoice={(c) => setMqtChoices((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))}
        />
      )}

      {/* Bulk delete confirmation. All-or-nothing, so the interesting screen
          is the second one: which questions stopped it, and one click to drop
          them from the selection and delete the rest. */}
      {confirmBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => !bulkBusy && setConfirmBulk(false)}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Delete {selectedHere.length} question{selectedHere.length === 1 ? '' : 's'}
              </CardTitle>
              <button onClick={() => setConfirmBulk(false)} disabled={bulkBusy} className="text-muted-foreground hover:text-foreground disabled:opacity-40"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              {bulkError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}
              {bulkBlocked.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {bulkBlocked.map((b) => {
                    const q = questions.find((x) => x.questionId === b.questionId);
                    return (
                      <p key={b.questionId} className="text-xs">
                        <span className="font-medium">{q ? q.stem : `Question ${b.questionId}`}</span>
                        <span className="text-muted-foreground"> — {b.message}</span>
                      </p>
                    );
                  })}
                </div>
              )}
              <p className="text-sm">
                {bulkBlocked.length > 0 ? (
                  <>Nothing was deleted. Drop those {bulkBlocked.length} from the selection to
                    delete the remaining {Math.max(0, selectedHere.length - bulkBlocked.length)}.</>
                ) : (
                  <>Remove {selectedHere.length} question{selectedHere.length === 1 ? '' : 's'} and
                    their options and MQT scores from the bank? A question that has responses, or
                    that sits in a questionnaire, cannot be deleted — if any of these do, none of
                    them are deleted and you will be told which.</>
                )}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmBulk(false)} disabled={bulkBusy}>Cancel</Button>
                {bulkBlocked.length > 0 ? (
                  <Button variant="primary" onClick={dropBlockedFromSelection} disabled={bulkBusy}>
                    Drop {bulkBlocked.length} and keep the rest selected
                  </Button>
                ) : (
                  <Button variant="primary" onClick={doBulkDelete} disabled={bulkBusy} className="bg-red-600 hover:bg-red-700 text-white">
                    <Trash2 className="h-3.5 w-3.5" /> {bulkBusy ? 'Deleting…' : `Delete ${selectedHere.length}`}
                  </Button>
                )}
              </div>
            </CardContent>
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
