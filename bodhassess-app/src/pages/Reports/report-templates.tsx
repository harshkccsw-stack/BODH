import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Circle,
  FileCode2,
  FileText,
  Loader2,
  Pencil,
  Lock,
  Plus,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  IMPLEMENTED_BINDERS,
  reportTemplatesApi,
  STARTER_HTML,
  type BinderType,
  type ReportTemplateResponse,
  type TagBinding,
  type TemplateStatus,
} from './reportTemplatesApi';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

const STATUS_STYLE: Record<TemplateStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

/** What each binder type means, in the author's language. */
const BINDER_LABEL: Record<BinderType, string> = {
  UNBOUND: 'Not answered yet',
  CORE: 'A respondent detail',
  LITERAL: 'Fixed text',
  VALUE: 'A score (needs the scoring engine)',
  NARRATIVE: 'Written interpretation (needs the scoring engine)',
  TABLE: 'A table of scores (needs the scoring engine)',
  CHART: 'A chart (needs the scoring engine)',
};

export default function ReportTemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplateResponse[]>([]);
  const [coreFields, setCoreFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // The open template, with its HTML and tag checklist.
  const [open, setOpen] = useState<ReportTemplateResponse | null>(null);
  const [editorHtml, setEditorHtml] = useState('');
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<ReportTemplateResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, fields] = await Promise.all([
        reportTemplatesApi.getAll(),
        reportTemplatesApi.coreFields(),
      ]);
      setTemplates(list);
      setCoreFields(fields);
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

  // Blob URLs leak until revoked, and a preview is regenerated on every save.
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  const openTemplate = async (id: number) => {
    setActionError(null);
    try {
      const full = await reportTemplatesApi.getById(id);
      applyOpen(full);
    } catch (e: any) {
      setLoadError(errorText(e, 'Could not open that template'));
    }
  };

  const applyOpen = (full: ReportTemplateResponse) => {
    setOpen(full);
    setEditorHtml(full.html ?? '');
    setEditorName(full.name);
    setEditorDescription(full.description ?? '');
  };

  const createTemplate = async () => {
    setActionError(null);
    setSaving(true);
    try {
      const created = await reportTemplatesApi.create({
        name: `Untitled report ${templates.length + 1}`,
        html: STARTER_HTML,
      });
      setTemplates((prev) => [created, ...prev]);
      applyOpen(created);
    } catch (e: any) {
      setLoadError(errorText(e, 'Could not create the template'));
    } finally {
      setSaving(false);
    }
  };

  /** Saving re-parses the HTML server-side; the tag checklist comes back changed. */
  const saveTemplate = async () => {
    if (!open) return;
    setActionError(null);
    setSaving(true);
    try {
      const saved = await reportTemplatesApi.update(open.reportTemplateId, {
        name: editorName.trim(),
        description: editorDescription.trim() || null,
        html: editorHtml,
      });
      applyOpen(saved);
      setTemplates((prev) =>
        prev.map((t) => (t.reportTemplateId === saved.reportTemplateId ? saved : t)),
      );
    } catch (e: any) {
      setActionError(errorText(e, 'Could not save the template'));
    } finally {
      setSaving(false);
    }
  };

  const bindTag = async (tag: string, payload: Parameters<typeof reportTemplatesApi.bindTag>[2]) => {
    if (!open) return;
    setActionError(null);
    try {
      const saved = await reportTemplatesApi.bindTag(open.reportTemplateId, tag, payload);
      applyOpen(saved);
      setTemplates((prev) =>
        prev.map((t) => (t.reportTemplateId === saved.reportTemplateId ? saved : t)),
      );
    } catch (e: any) {
      setActionError(errorText(e, 'Could not save that answer'));
    }
  };

  /**
   * The only way to change a published template: copy it to a new DRAFT
   * version. The published original stays exactly as it was.
   */
  const openNewVersion = async () => {
    if (!open) return;
    setActionError(null);
    setSaving(true);
    try {
      const draft = await reportTemplatesApi.newVersion(open.reportTemplateId);
      applyOpen(draft);
      setTemplates((prev) => [draft, ...prev]);
    } catch (e: any) {
      setActionError(errorText(e, 'Could not open a new version'));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!open) return;
    setActionError(null);
    setSaving(true);
    try {
      const saved = await reportTemplatesApi.publish(open.reportTemplateId);
      applyOpen(saved);
      setTemplates((prev) =>
        prev.map((t) => (t.reportTemplateId === saved.reportTemplateId ? saved : t)),
      );
    } catch (e: any) {
      setActionError(errorText(e, 'Could not publish this template'));
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!open) return;
    setActionError(null);
    setPreviewing(true);
    try {
      const url = await reportTemplatesApi.previewPdfUrl(open.reportTemplateId);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (e: any) {
      setActionError(errorText(e, 'Could not render a preview'));
    } finally {
      setPreviewing(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await reportTemplatesApi.delete(confirmDelete.reportTemplateId);
      setTemplates((prev) =>
        prev.filter((t) => t.reportTemplateId !== confirmDelete.reportTemplateId),
      );
      if (open?.reportTemplateId === confirmDelete.reportTemplateId) setOpen(null);
      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(errorText(e, 'Could not delete this template'));
    }
  };

  const published = templates.filter((t) => t.status === 'PUBLISHED').length;
  const openTags = templates.reduce((n, t) => n + (t.tagCount - t.boundCount), 0);
  const readOnly = open?.status !== 'DRAFT';

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
          <Button variant="primary" onClick={createTemplate} disabled={saving}>
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
              <Button variant="primary" onClick={createTemplate} className="mt-4">
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
                  onClick={() => void openTemplate(t.reportTemplateId)}
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
                      onClick={(e) => { e.stopPropagation(); void openTemplate(t.reportTemplateId); }}
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

      {/* ── editor ─────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-6xl my-6">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div className="min-w-0 flex-1">
                <input
                  className={cn(INPUT_CLASS, 'font-medium text-base h-10')}
                  value={editorName}
                  disabled={readOnly}
                  onChange={(e) => setEditorName(e.target.value)}
                  aria-label="Template name"
                />
                <input
                  className={cn(INPUT_CLASS, 'mt-2')}
                  placeholder="Short description (optional)"
                  value={editorDescription}
                  disabled={readOnly}
                  onChange={(e) => setEditorDescription(e.target.value)}
                  aria-label="Template description"
                />
              </div>
              <button
                type="button"
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                onClick={() => setOpen(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {readOnly && (
              <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
                <Lock className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="flex-1">
                  This template is {open.status.toLowerCase()} and cannot be edited —
                  reports already produced from it must keep meaning what they said.
                  {open.status === 'PUBLISHED' && ' Open a new version to make changes; your answers come with it.'}
                </span>
                {open.status === 'PUBLISHED' && (
                  <Button variant="outline" size="sm" onClick={openNewVersion} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Edit as new version
                  </Button>
                )}
              </div>
            )}

            {actionError && (
              <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {actionError}
              </div>
            )}

            {open.lint.length > 0 && (
              <div className="mx-6 mt-4 space-y-2">
                {open.lint.map((f) => (
                  <div
                    key={f.rule}
                    className={cn(
                      'rounded-lg border px-4 py-3 text-sm flex gap-2',
                      f.severity === 'ERROR'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'
                        : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
                    )}
                  >
                    {f.severity === 'ERROR'
                      ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      : <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span>{f.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Template HTML</p>
                  {!readOnly && (
                    <Button variant="outline" size="sm" onClick={saveTemplate} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save &amp; re-read placeholders
                    </Button>
                  )}
                </div>
                <textarea
                  className="w-full h-[420px] rounded-md border border-input bg-background p-3 font-mono text-xs leading-relaxed focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                  value={editorHtml}
                  disabled={readOnly}
                  onChange={(e) => setEditorHtml(e.target.value)}
                  spellCheck={false}
                  aria-label="Template HTML"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Saving re-reads the HTML: new placeholders appear in the checklist,
                  removed ones disappear, and answers you already gave are kept.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">
                    Placeholders — {open.boundCount} of {open.tagCount} answered
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={preview} disabled={previewing}>
                      {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Preview
                    </Button>
                    {open.status === 'DRAFT' && (
                      <Button variant="primary" size="sm" onClick={publish} disabled={saving}>
                        <Send className="h-4 w-4" /> Publish
                      </Button>
                    )}
                  </div>
                </div>

                <div className="border rounded-md divide-y max-h-[420px] overflow-y-auto">
                  {open.bindings.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground text-center">
                      No placeholders in this template yet. Add{' '}
                      <code className="text-xs">{'${something}'}</code> to the HTML and save.
                    </p>
                  ) : (
                    open.bindings.map((b) => (
                      <TagRow
                        key={b.tag}
                        binding={b}
                        coreFields={coreFields}
                        readOnly={readOnly}
                        onSave={(payload) => void bindTag(b.tag, payload)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {previewUrl && (
              <div className="px-6 pb-6">
                <p className="text-sm font-medium mb-2">Preview (sample respondent)</p>
                <iframe
                  title="Report preview"
                  src={previewUrl}
                  className="w-full h-[560px] rounded-md border bg-white"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── delete confirm ─────────────────────────────────────────────── */}
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

/** One row of the checklist: a placeholder and the answer to "what fills this?". */
function TagRow({
  binding,
  coreFields,
  readOnly,
  onSave,
}: {
  binding: TagBinding;
  coreFields: Record<string, string>;
  readOnly: boolean;
  onSave: (payload: {
    binderType: BinderType;
    coreField?: string | null;
    literalText?: string | null;
    fallbackText?: string | null;
  }) => void;
}) {
  const [type, setType] = useState<BinderType>(binding.binderType);
  const [coreField, setCoreField] = useState(binding.coreField ?? '');
  const [literalText, setLiteralText] = useState(binding.literalText ?? '');

  // The server is the source of truth — a save returns the whole template.
  useEffect(() => {
    setType(binding.binderType);
    setCoreField(binding.coreField ?? '');
    setLiteralText(binding.literalText ?? '');
  }, [binding]);

  const dirty =
    type !== binding.binderType ||
    coreField !== (binding.coreField ?? '') ||
    literalText !== (binding.literalText ?? '');

  const canSave =
    dirty &&
    (type === 'CORE' ? coreField !== '' : type === 'LITERAL' ? literalText.trim() !== '' : false);

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        {binding.bound
          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
          {'${' + binding.tag + '}'}
        </code>
        {!binding.bound && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">needs an answer</span>
        )}
      </div>

      {!readOnly && (
        <div className="mt-2 pl-6 space-y-2">
          <select
            className={INPUT_CLASS}
            value={type}
            onChange={(e) => setType(e.target.value as BinderType)}
            aria-label={`What fills ${binding.tag}`}
          >
            <option value="UNBOUND" disabled>{BINDER_LABEL.UNBOUND}</option>
            {IMPLEMENTED_BINDERS.map((b) => (
              <option key={b} value={b}>{BINDER_LABEL[b]}</option>
            ))}
            {(['VALUE', 'NARRATIVE', 'TABLE', 'CHART'] as BinderType[]).map((b) => (
              <option key={b} value={b} disabled>{BINDER_LABEL[b]}</option>
            ))}
          </select>

          {type === 'CORE' && (
            <select
              className={INPUT_CLASS}
              value={coreField}
              onChange={(e) => setCoreField(e.target.value)}
              aria-label="Which respondent detail"
            >
              <option value="">Choose a detail…</option>
              {Object.entries(coreFields).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {type === 'LITERAL' && (
            <textarea
              className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              rows={2}
              placeholder="The text this placeholder should print"
              value={literalText}
              onChange={(e) => setLiteralText(e.target.value)}
              aria-label="Fixed text"
            />
          )}

          {dirty && (
            <Button
              size="sm"
              variant="primary"
              disabled={!canSave}
              onClick={() =>
                onSave({
                  binderType: type,
                  coreField: type === 'CORE' ? coreField : null,
                  literalText: type === 'LITERAL' ? literalText : null,
                })
              }
            >
              Save answer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
