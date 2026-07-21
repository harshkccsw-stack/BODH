import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ClipboardCheck,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  assessmentsApi,
  type AssessmentPayload,
  type AssessmentResponse,
  type AssessmentStatus,
} from './assessmentApis';
import {
  questionnairesApi,
  type QuestionnaireResponse,
} from '../questionnaires/questionnairesApi';

const STATUSES: AssessmentStatus[] = ['ACTIVE', 'INACTIVE'];

interface AssessmentForm {
  id: number | null;
  name: string;
  questionnaireId: string; // '' = not picked yet; select values are strings
  status: AssessmentStatus;
  showTermsAndConditions: boolean;
  autoNext: boolean;
}

const EMPTY_FORM: AssessmentForm = {
  id: null,
  name: '',
  questionnaireId: '',
  status: 'INACTIVE',
  showTermsAndConditions: true,
  autoNext: false,
};

const statusChip = (s: AssessmentStatus) =>
  s === 'ACTIVE'
    ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400'
    : 'border-border bg-muted/40 text-muted-foreground';

export default function AssessmentLibraryPage() {
  const [items, setItems] = useState<AssessmentResponse[]>([]);
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  // 'ALL' or a questionnaireId as string.
  const [filterQid, setFilterQid] = useState('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AssessmentForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<AssessmentResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const [as, qn] = await Promise.all([
        assessmentsApi.getAllAssessments(),
        questionnairesApi.getQuestionnaires(),
      ]);
      setItems(as.data);
      setQuestionnaires(qn.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load assessments');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => { refresh(true); }, []);

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus !== 'ALL') list = list.filter((a) => a.status === filterStatus);
    if (filterQid !== 'ALL') list = list.filter((a) => a.questionnaireId === Number(filterQid));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(s) ||
          a.questionnaireName.toLowerCase().includes(s),
      );
    }
    return list;
  }, [items, filterStatus, filterQid, search]);

  const totalAttempts = useMemo(() => items.reduce((a, x) => a + x.respondentCount, 0), [items]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (a: AssessmentResponse) => {
    setForm({
      id: a.assessmentId,
      name: a.name,
      questionnaireId: String(a.questionnaireId),
      status: a.status,
      showTermsAndConditions: a.showTermsAndConditions,
      autoNext: a.autoNext,
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setFormError('Assessment name is required'); return; }
    if (!form.questionnaireId) { setFormError('Pick the questionnaire this assessment offers'); return; }
    const payload: AssessmentPayload = {
      name,
      questionnaireId: Number(form.questionnaireId),
      status: form.status,
      showTermsAndConditions: form.showTermsAndConditions,
      autoNext: form.autoNext,
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await assessmentsApi.updateAssessment(form.id, payload);
      } else {
        await assessmentsApi.createAssessment(payload);
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
      await assessmentsApi.deleteAssessment(confirmDelete.assessmentId);
      setConfirmDelete(null);
      await refresh();
    } catch (e: any) {
      setDeleteError(e?.response?.data?.message || e?.message || 'Failed to delete');
    }
  };

  const pickedQuestionnaire = questionnaires.find(
    (q) => String(q.questionnaireId) === form.questionnaireId,
  );

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Assessment Library</span><span>/</span>
          <span className="text-foreground font-medium">Assessments</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              Assessments
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              An assessment offers one questionnaire under a chosen
              configuration. The same questionnaire can back many assessments.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create Assessment
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Assessments</p><p className="text-2xl font-semibold mt-1">{items.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active</p><p className="text-2xl font-semibold mt-1">{items.filter((a) => a.status === 'ACTIVE').length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Respondent Attempts</p><p className="text-2xl font-semibold mt-1">{totalAttempts}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by assessment or questionnaire name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['ALL', ...STATUSES].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilterStatus(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filterStatus === s
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <select
          value={filterQid}
          onChange={(e) => setFilterQid(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:border-ring"
        >
          <option value="ALL">All questionnaires</option>
          {questionnaires.map((q) => (
            <option key={q.questionnaireId} value={q.questionnaireId}>{q.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading assessments…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <ClipboardCheck className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {items.length === 0 ? 'No assessments yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {items.length === 0
                ? 'Create your first assessment by picking a questionnaire and a configuration.'
                : 'Try a different search term or filter.'}
            </p>
            {items.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Create your first assessment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((a) => (
              <li
                key={a.assessmentId}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => openEdit(a)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium shrink-0', statusChip(a.status))}>
                      {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 truncate">
                      <BookOpen className="h-3 w-3 shrink-0" /> {a.questionnaireName}
                    </span>
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Users className="h-3 w-3" /> {a.respondentCount} attempt{a.respondentCount !== 1 ? 's' : ''}
                    </span>
                    {a.autoNext && (
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <Zap className="h-3 w-3" /> auto-next
                      </span>
                    )}
                    {a.showTermsAndConditions && <span className="shrink-0">T&amp;C shown</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openEdit(a); }}
                    title="Edit assessment"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(''); setConfirmDelete(a); }}
                    title="Delete assessment"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setModalOpen(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                {form.id != null ? 'Edit Assessment' : 'Create Assessment'}
              </CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Engineering Intake 2026 — Batch A"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Questionnaire</label>
                <select
                  value={form.questionnaireId}
                  onChange={(e) => setForm({ ...form, questionnaireId: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select a questionnaire…</option>
                  {questionnaires.map((q) => (
                    <option key={q.questionnaireId} value={q.questionnaireId}>
                      {q.name} ({q.questionCount} question{q.questionCount !== 1 ? 's' : ''})
                    </option>
                  ))}
                </select>
                {pickedQuestionnaire && pickedQuestionnaire.questionCount === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                    This questionnaire has no questions yet — respondents would see an empty assessment.
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <div className="flex gap-1.5 mt-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, status: s })}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        form.status === s
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Only active assessments can be allotted and taken.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.showTermsAndConditions}
                  onChange={(e) => setForm({ ...form, showTermsAndConditions: e.target.checked })}
                  className="rounded"
                />
                Show terms &amp; conditions before starting
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoNext}
                  onChange={(e) => setForm({ ...form, autoNext: e.target.checked })}
                  className="rounded"
                />
                Auto-advance to the next question after an option is selected
              </label>
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {form.id != null ? 'Save Changes' : 'Create Assessment'}
                </Button>
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
                Delete Assessment
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Remove <strong>{confirmDelete.name}</strong>? The{' '}
                <strong>{confirmDelete.questionnaireName}</strong> questionnaire it offers stays in the catalog.
              </p>
              {confirmDelete.respondentCount > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-500">
                  This assessment has {confirmDelete.respondentCount} respondent attempt{confirmDelete.respondentCount !== 1 ? 's' : ''} — it can't be deleted. Set it Inactive instead.
                </p>
              )}
              {deleteError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {deleteError}
                </div>
              )}
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
