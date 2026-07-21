import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Eye,
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
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePathname } from '@/lib/router-helpers';
import {
  questionnairesApi,
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

export default function AllQuestionnairesPage() {
  const navigate = useNavigate();
  const pathname = usePathname();
  const presetVertical = PATH_VERTICAL[pathname.split('/').filter(Boolean).pop() || ''] || null;

  const [items, setItems] = useState<QuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [filterVertical, setFilterVertical] = useState<string>('ALL');

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

  // Creation and editing share the same 3-step wizard (details → questions →
  // review) at /question-bank/create; edit mode loads via ?edit=<id>.
  const openCreate = () => navigate('/question-bank/create');
  const openEdit = (q: QuestionnaireResponse) => navigate(`/question-bank/create?edit=${q.questionnaireId}`);

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
                    onClick={(e) => { e.stopPropagation(); navigate(`/questionnaires/${q.questionnaireId}/preview`); }}
                    title="Preview questionnaire"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
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
                Remove <strong>{confirmDelete.name}</strong>? Its {confirmDelete.questionCount} attached question{confirmDelete.questionCount !== 1 ? 's' : ''} stay in the question bank, detached.
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
