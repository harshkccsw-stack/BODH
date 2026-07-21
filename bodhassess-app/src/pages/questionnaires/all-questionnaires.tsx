import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  FileText,
  Layers,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname } from '@/lib/router-helpers';
import {
  questionnairesApi,
  type QuestionnairePayload,
  type QuestionnaireResponse,
} from './questionnairesApi';

// Known verticals (mirrors the backend enum used for practitioners); the
// column itself is a free label, so unknown values from data still render.
const VERTICALS = ['CLINICAL', 'INDUSTRIAL', 'COUNSELLING', 'EXPERIMENTS', 'WHITELABEL', 'RESEARCH', 'OTHER'];

// Vertical-preset routes render this same page filtered — the old
// per-vertical catalog pages are retired.
const PATH_VERTICAL: Record<string, string> = {
  clinical: 'CLINICAL',
  industrial: 'INDUSTRIAL',
  counselling: 'COUNSELLING',
  experimental: 'EXPERIMENTS',
};

interface QForm {
  id: number | null;
  name: string;
  shortName: string;
  category: string;
  vertical: string;
  description: string;
  durationMinutes: string; // input value; parsed on submit
  generalInstruction: string;
  hasSections: boolean;
}

const EMPTY_FORM: QForm = {
  id: null,
  name: '',
  shortName: '',
  category: '',
  vertical: '',
  description: '',
  durationMinutes: '',
  generalInstruction: '',
  hasSections: false,
};

export default function AllQuestionnairesPage() {
  const pathname = usePathname();
  const presetVertical = PATH_VERTICAL[pathname.split('/').filter(Boolean).pop() || ''] || null;

  const [items, setItems] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterVertical, setFilterVertical] = useState<string>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<QForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<QuestionnaireResponse | null>(null);

  const refresh = async (showLoading = false) => {
    setLoadError('');
    if (showLoading) setLoading(true);
    try {
      const res = await questionnairesApi.getQuestionnaires();
      setItems(res.data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load questionnaires');
    } finally {
      if (showLoading) setLoading(false);
    }
  };
  useEffect(() => { refresh(true); }, []);

  const activeVertical = presetVertical ?? (filterVertical === 'ALL' ? null : filterVertical);

  const filtered = useMemo(() => {
    let list = items;
    if (activeVertical) {
      list = list.filter((q) => (q.vertical || '').toUpperCase() === activeVertical);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) =>
          q.name.toLowerCase().includes(s) ||
          (q.shortName || '').toLowerCase().includes(s) ||
          (q.category || '').toLowerCase().includes(s),
      );
    }
    return list;
  }, [items, activeVertical, search]);

  const totalQuestions = useMemo(() => items.reduce((a, q) => a + q.questionCount, 0), [items]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, vertical: presetVertical || '' });
    setFormError('');
    setModalOpen(true);
  };
  const openEdit = (q: QuestionnaireResponse) => {
    setForm({
      id: q.questionnaireId,
      name: q.name,
      shortName: q.shortName || '',
      category: q.category || '',
      vertical: q.vertical || '',
      description: q.description || '',
      durationMinutes: q.durationMinutes == null ? '' : String(q.durationMinutes),
      generalInstruction: q.generalInstruction || '',
      hasSections: q.hasSections,
    });
    setFormError('');
    setModalOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) { setFormError('Name is required'); return; }
    const duration = form.durationMinutes.trim() === '' ? null : Number(form.durationMinutes);
    if (duration != null && (!Number.isInteger(duration) || duration < 0)) {
      setFormError('Duration must be a whole number of minutes');
      return;
    }
    // Payload mirrors the backend's QuestionnaireRequest 1:1.
    const payload: QuestionnairePayload = {
      name,
      shortName: form.shortName.trim() || null,
      category: form.category.trim() || null,
      vertical: form.vertical || null,
      description: form.description.trim() || null,
      durationMinutes: duration,
      generalInstruction: form.generalInstruction.trim() || null,
      hasSections: form.hasSections,
    };
    setSaving(true);
    try {
      if (form.id != null) {
        await questionnairesApi.updateQuestionnaire(form.id, payload);
      } else {
        await questionnairesApi.createQuestionnaire(payload);
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
    await questionnairesApi.deleteQuestionnaire(confirmDelete.questionnaireId);
    setConfirmDelete(null);
    await refresh();
  };

  const title = presetVertical
    ? `${presetVertical.charAt(0)}${presetVertical.slice(1).toLowerCase()} Questionnaires`
    : 'Questionnaires';

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span>
          <span className="text-foreground font-medium">{title}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ListChecks className="h-6 w-6 text-primary" />
              {title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The live catalog of instruments. Each questionnaire is a single
              entry edited in place — no drafts, no version history.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Create Questionnaire
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError} — is the API running?
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Questionnaires</p><p className="text-2xl font-semibold mt-1">{items.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Questions</p><p className="text-2xl font-semibold mt-1">{totalQuestions}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Sectioned</p><p className="text-2xl font-semibold mt-1">{items.filter((q) => q.hasSections).length}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, short name or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow"
          />
        </div>
        {!presetVertical && (
          <div className="flex flex-wrap gap-1.5">
            {['ALL', ...VERTICALS].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilterVertical(v)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filterVertical === v
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'ALL' ? 'All' : v.charAt(0) + v.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading questionnaires…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {items.length === 0 ? 'No questionnaires yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {items.length === 0
                ? 'Create your first questionnaire to start building the catalog.'
                : 'Try a different search term or vertical.'}
            </p>
            {items.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Create your first questionnaire
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filtered.map((q) => (
              <li
                key={q.questionnaireId}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => openEdit(q)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{q.name}</p>
                    {q.shortName && (
                      <span className="inline-flex items-center rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground shrink-0">
                        {q.shortName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    {q.category && <span className="truncate">{q.category}</span>}
                    {q.durationMinutes != null && (
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" /> {q.durationMinutes} min
                      </span>
                    )}
                    <span className="shrink-0">{q.questionCount} question{q.questionCount !== 1 ? 's' : ''}</span>
                    {q.hasSections && (
                      <span className="inline-flex items-center gap-1 shrink-0">
                        <Layers className="h-3 w-3" /> sectioned
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {q.vertical && (
                    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium">
                      {q.vertical.charAt(0) + q.vertical.slice(1).toLowerCase()}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); openEdit(q); }}
                    title="Edit questionnaire"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    mode="icon"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(q); }}
                    title="Delete questionnaire"
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
          <Card className="w-full max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
              <CardTitle className="text-base">
                {form.id != null ? 'Edit Questionnaire' : 'Create Questionnaire'}
              </CardTitle>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4 overflow-y-auto">
              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g., Big Five Personality Inventory"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Short name</label>
                  <input
                    value={form.shortName}
                    onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                    placeholder="e.g., BFI-44"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g., Personality"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Vertical</label>
                  <select
                    value={form.vertical}
                    onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">— none —</option>
                    {VERTICALS.map((v) => (
                      <option key={v} value={v}>{v.charAt(0) + v.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Duration (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.durationMinutes}
                    onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                    placeholder="e.g., 30"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional — what does this instrument measure?"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-sm font-medium">General instruction</label>
                  <textarea
                    rows={2}
                    value={form.generalInstruction}
                    onChange={(e) => setForm({ ...form, generalInstruction: e.target.value })}
                    placeholder="Optional — shown to the respondent before the questions"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm sm:col-span-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.hasSections}
                    onChange={(e) => setForm({ ...form, hasSections: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="font-medium">Has sections</span>
                  <span className="text-muted-foreground">— questions are grouped under named sections</span>
                </label>
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {form.id != null ? 'Save' : 'Create'}
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
                Delete Questionnaire
              </CardTitle>
              <button onClick={() => setConfirmDelete(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Remove <strong>{confirmDelete.name}</strong>? Its {confirmDelete.questionCount} question{confirmDelete.questionCount !== 1 ? 's' : ''} (and their options) will be deleted with it.
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
