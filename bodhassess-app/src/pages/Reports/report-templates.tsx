import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileCode2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reportTemplatesApi,
  type ReportTemplateResponse,
  type TemplateStatus,
} from './reportTemplatesApi';
import { NewTemplateDialog, TemplateEditor } from './template-editor';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

const STATUS_STYLE: Record<TemplateStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

export default function ReportTemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  /**
   * Which template the editor is open on, by id.
   *
   * The editor itself lives in `template-editor.tsx` and loads the row it
   * needs, because Report Setup opens the same one — this page is the library
   * (find, create, delete), not the authoring surface.
   */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<ReportTemplateResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await reportTemplatesApi.getAll());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(errorText(e, 'Could not load report templates'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await reportTemplatesApi.delete(confirmDelete.reportTemplateId);
      setTemplates((prev) =>
        prev.filter((t) => t.reportTemplateId !== confirmDelete.reportTemplateId),
      );
      if (editingId === confirmDelete.reportTemplateId) setEditingId(null);
      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(errorText(e, 'Could not delete this template'));
    }
  };

  const published = templates.filter((t) => t.status === 'PUBLISHED').length;
  const openTags = templates.reduce((n, t) => n + (t.tagCount - t.boundCount), 0);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Reports</span><span>/</span>
          <span className="text-foreground font-medium">Report Templates</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <FileCode2 className="h-6 w-6 text-primary" />
              Report Templates
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              The layout a report is printed from. Write the HTML, mark the parts
              that change with <code className="text-xs">{'${placeholders}'}</code>, and
              answer each one. Respondent details and fixed text work today —
              scores and written interpretation arrive with the scoring engine.
            </p>
          </div>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Templates</p><p className="text-2xl font-semibold mt-1">{templates.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Published</p><p className="text-2xl font-semibold mt-1">{published}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Placeholders to answer</p><p className="text-2xl font-semibold mt-1">{openTags}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(INPUT_CLASS, 'pl-9')}
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading templates…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {templates.length === 0 ? 'No report templates yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {templates.length === 0
                ? 'A template is the page a report is printed on. Start from the sample layout and edit it.'
                : 'Try a different search term.'}
            </p>
            {templates.length === 0 && (
              <Button variant="primary" onClick={() => setCreating(true)} className="mt-4">
                <Plus className="h-4 w-4" /> Create your first template
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {filtered.map((t) => {
              const remaining = t.tagCount - t.boundCount;
              return (
                <div
                  key={t.reportTemplateId}
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => setEditingId(t.reportTemplateId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{t.name}</p>
                      <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[t.status])}>
                        {t.status.toLowerCase()}
                      </span>
                      <span className="text-[11px] text-muted-foreground">v{t.version}</span>
                    </div>
                    {t.description && (
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{t.description}</p>
                    )}
                  </div>

                  <div className="text-sm text-right shrink-0">
                    {t.tagCount === 0 ? (
                      <span className="text-muted-foreground">No placeholders</span>
                    ) : remaining === 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 justify-end">
                        <CheckCircle2 className="h-4 w-4" /> All {t.tagCount} answered
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        {t.boundCount} of {t.tagCount} answered
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); setEditingId(t.reportTemplateId); }}
                      aria-label={t.status === 'DRAFT' ? `Edit ${t.name}` : `Open ${t.name}`}
                      title={t.status === 'DRAFT' ? 'Edit' : 'Open (published — edit as a new version)'}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); setDeleteError(null); setConfirmDelete(t); }}
                      aria-label={`Delete ${t.name}`}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── the editor, shared with Report Setup ───────────────────────── */}
      {editingId !== null && (
        <TemplateEditor
          templateId={editingId}
          onChanged={(saved) => setTemplates((prev) => {
            // A new VERSION is a new row, so it is added rather than replaced —
            // the published original stays in the library beside it.
            const known = prev.some((t) => t.reportTemplateId === saved.reportTemplateId);
            return known
              ? prev.map((t) => (t.reportTemplateId === saved.reportTemplateId ? saved : t))
              : [saved, ...prev];
          })}
          onClosed={(last) => {
            setEditingId(null);
            // A new version changes which row the library should show as the
            // live one, and a publish changes the counts; both are cheap to
            // settle by re-reading the list once, on close.
            if (last) void load();
          }}
        />
      )}

      {creating && (
        <NewTemplateDialog
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            setTemplates((prev) => [created, ...prev]);
            setEditingId(created.reportTemplateId);
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Delete this template?</h2>
            <p className="text-sm text-muted-foreground mt-2">
              “{confirmDelete.name}” and its {confirmDelete.tagCount} placeholder
              {confirmDelete.tagCount === 1 ? '' : 's'} will be removed. This cannot be undone.
            </p>
            {deleteError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {deleteError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={doDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
