import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Cpu,
  Info,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reportApis, type AssessmentOption } from './reportApis';
import { reportRulesApi, type ReportRuleResponse } from './reportRulesApi';
import {
  reportComputationsApi,
  type ReportComputationResponse,
  type RespondentScope,
} from './reportComputationsApi';
import { reportTemplatesApi, type ReportTemplateResponse } from './reportTemplatesApi';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400',
  READY_FOR_GENERATION: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400',
  GENERATED: 'bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
  ARCHIVED: 'bg-muted text-muted-foreground',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'draft',
  READY_FOR_GENERATION: 'ready to send',
  GENERATED: 'generated',
  APPROVED: 'approved',
  ARCHIVED: 'archived',
};

export default function ReportComputationsPage() {
  const [items, setItems] = useState<ReportComputationResponse[]>([]);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [rules, setRules] = useState<ReportRuleResponse[]>([]);
  const [templates, setTemplates] = useState<ReportTemplateResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState<ReportComputationResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Draft form state.
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<RespondentScope>('ALL_COMPLETED');
  const [respondentIdsText, setRespondentIdsText] = useState('');
  const [selectedRuleVersions, setSelectedRuleVersions] = useState<number[]>([]);
  const [tagGuidance, setTagGuidance] = useState<Record<string, string>>({});

  const [confirmDelete, setConfirmDelete] = useState<ReportComputationResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, assessmentPage, ruleList, templateList] = await Promise.all([
        reportComputationsApi.getAll(),
        reportApis.getAssessments({ page: 0, size: 100 }),
        reportRulesApi.getAll(),
        reportTemplatesApi.getAll(),
      ]);
      setItems(list);
      setAssessments(assessmentPage.data.items ?? []);
      setRules(ruleList);
      setTemplates(templateList);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(errorText(e, 'Could not load computations'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyToForm = (c: ReportComputationResponse) => {
    setOpen(c);
    setName(c.name);
    setDescription(c.description ?? '');
    setAssessmentId(c.assessmentId);
    setTemplateId(c.reportTemplateId);
    setPrompt(c.sourcePrompt ?? '');
    setScope(c.respondentScope);
    setRespondentIdsText(c.respondentIds.join(', '));
    setSelectedRuleVersions(c.rules.map((r) => r.reportRuleVersionId));
    const guidance: Record<string, string> = {};
    c.tagGuidance.forEach((g) => { guidance[g.tag] = g.guidance ?? ''; });
    setTagGuidance(guidance);
    setActionError(null);
  };

  const startNew = () => {
    setOpen({
      reportComputationId: 0,
      name: '',
      slug: '',
      description: null,
      assessmentId: 0,
      organizationId: null,
      reportTemplateId: null,
      templateName: null,
      status: 'DRAFT',
      sourcePrompt: null,
      respondentScope: 'ALL_COMPLETED',
      respondentIds: [],
      rules: [],
      tagGuidance: [],
      prompt: null,
      createdAt: '',
      updatedAt: '',
    });
    setName('');
    setDescription('');
    setAssessmentId(null);
    setTemplateId(null);
    setPrompt('');
    setScope('ALL_COMPLETED');
    setRespondentIdsText('');
    setSelectedRuleVersions([]);
    setTagGuidance({});
    setActionError(null);
  };

  const openExisting = async (id: number) => {
    try {
      applyToForm(await reportComputationsApi.getById(id));
    } catch (e: any) {
      setLoadError(errorText(e, 'Could not open that computation'));
    }
  };

  const chosenTemplate = useMemo(
    () => templates.find((t) => t.reportTemplateId === templateId) ?? null,
    [templates, templateId],
  );

  /** The tags the guidance grid offers — straight from the chosen template. */
  const templateTags = useMemo(
    () => (chosenTemplate?.bindings ?? []).map((b) => b.tag),
    [chosenTemplate],
  );

  const payload = () => ({
    name: name.trim(),
    description: description.trim() || null,
    assessmentId: assessmentId ?? 0,
    reportTemplateId: templateId,
    sourcePrompt: prompt.trim() || null,
    respondentScope: scope,
    respondentIds:
      scope === 'SELECTED'
        ? respondentIdsText
            .split(/[,\s]+/)
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [],
    ruleVersionIds: selectedRuleVersions,
    tagGuidance: Object.entries(tagGuidance)
      .filter(([, v]) => v.trim() !== '')
      .map(([tag, guidance]) => ({ tag, guidance: guidance.trim() })),
  });

  const save = async () => {
    if (!open) return;
    setActionError(null);
    setSaving(true);
    try {
      const saved = open.reportComputationId
        ? await reportComputationsApi.update(open.reportComputationId, payload())
        : await reportComputationsApi.create(payload());
      applyToForm(saved);
      setItems((prev) =>
        open.reportComputationId
          ? prev.map((c) =>
              c.reportComputationId === saved.reportComputationId ? saved : c,
            )
          : [saved, ...prev],
      );
    } catch (e: any) {
      setActionError(errorText(e, 'Could not save this computation'));
    } finally {
      setSaving(false);
    }
  };

  const markReady = async () => {
    if (!open?.reportComputationId) return;
    setActionError(null);
    setSaving(true);
    try {
      const saved = await reportComputationsApi.markReady(open.reportComputationId);
      applyToForm(saved);
      setItems((prev) =>
        prev.map((c) => (c.reportComputationId === saved.reportComputationId ? saved : c)),
      );
    } catch (e: any) {
      setActionError(errorText(e, 'Could not mark this ready'));
    } finally {
      setSaving(false);
    }
  };

  const copyPrompt = async () => {
    if (!open?.prompt?.text) return;
    try {
      await navigator.clipboard.writeText(open.prompt.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('Could not copy — select the text and copy it manually.');
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await reportComputationsApi.delete(confirmDelete.reportComputationId);
      setItems((prev) =>
        prev.filter((c) => c.reportComputationId !== confirmDelete.reportComputationId),
      );
      if (open?.reportComputationId === confirmDelete.reportComputationId) setOpen(null);
      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(errorText(e, 'Could not delete this computation'));
    }
  };

  const toggleRule = (versionId: number) =>
    setSelectedRuleVersions((prev) =>
      prev.includes(versionId) ? prev.filter((v) => v !== versionId) : [...prev, versionId],
    );

  const ready = items.filter((c) => c.status === 'READY_FOR_GENERATION').length;

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Reports</span><span>/</span>
          <span className="text-foreground font-medium">Report Computations</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" />
              Report Computations
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Choose the rules, the report template and the respondents, then write
              what you want the report to say. That assembles the full instruction
              set — which you can read in full before anything is sent anywhere.
            </p>
          </div>
          <Button variant="primary" onClick={startNew}>
            <Plus className="h-4 w-4" />
            New Computation
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          No AI provider has been chosen yet, so nothing here is sent anywhere. This
          screen assembles the instructions and stops. Generated code will later run
          in an isolated sandbox with no database access, and a person must review and
          approve the output before any real respondent’s report is produced.
        </span>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Computations</p><p className="text-2xl font-semibold mt-1">{items.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Ready to send</p><p className="text-2xl font-semibold mt-1">{ready}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Rules in library</p><p className="text-2xl font-semibold mt-1">{rules.length}</p></CardContent></Card>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading…</p>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Cpu className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">No computations yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              A computation ties your rules to one report template for one assessment.
            </p>
            <Button variant="primary" onClick={startNew} className="mt-4">
              <Plus className="h-4 w-4" /> Start one
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {items.map((c) => (
              <div
                key={c.reportComputationId}
                className="group flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => void openExisting(c.reportComputationId)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{c.name}</p>
                    <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[c.status])}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {c.rules.length} rule{c.rules.length === 1 ? '' : 's'}
                    {c.templateName ? ` · ${c.templateName}` : ' · no template yet'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); void openExisting(c.reportComputationId); }}
                    aria-label={`Edit ${c.name}`}
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(null); setConfirmDelete(c); }}
                    aria-label={`Delete ${c.name}`}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── the assembly screen ────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-6xl my-6">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">
                {open.reportComputationId ? open.name || 'Computation' : 'New computation'}
              </h2>
              <button
                type="button"
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                onClick={() => setOpen(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {actionError && (
              <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {actionError}
              </div>
            )}

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Name</label>
                  <input
                    className={INPUT_CLASS}
                    placeholder="Counselling report scoring"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Assessment</label>
                  <select
                    className={INPUT_CLASS}
                    value={assessmentId ?? ''}
                    onChange={(e) => setAssessmentId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Choose an assessment…</option>
                    {assessments.map((a) => (
                      <option key={a.assessmentId} value={a.assessmentId}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Report template</label>
                <select
                  className={INPUT_CLASS}
                  value={templateId ?? ''}
                  onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Choose a template…</option>
                  {templates.map((t) => (
                    <option key={t.reportTemplateId} value={t.reportTemplateId}>
                      {t.name} ({t.tagCount} placeholder{t.tagCount === 1 ? '' : 's'})
                    </option>
                  ))}
                </select>
              </div>

              {/* rules */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Rules ({selectedRuleVersions.length} selected)
                </label>
                {rules.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    The rules library is empty. Write some rules first.
                  </div>
                ) : (
                  <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                    {rules.map((r) => {
                      const versionId = r.latest?.reportRuleVersionId;
                      if (!versionId) return null;
                      const on = selectedRuleVersions.includes(versionId);
                      return (
                        <button
                          key={r.reportRuleId}
                          type="button"
                          onClick={() => toggleRule(versionId)}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex items-start gap-3"
                        >
                          <span
                            className={cn(
                              'mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0',
                              on ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{r.name}</span>
                              <code className="text-[11px] font-mono text-muted-foreground">{r.slug}</code>
                              <span className="text-[11px] text-muted-foreground">v{r.latestVersion}</span>
                            </span>
                            <span className="text-xs text-muted-foreground block truncate mt-0.5">
                              {r.latest?.definitionKind === 'EXPRESSION'
                                ? r.latest.expression
                                : r.latest?.statementText}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">
                  The exact version you pick is pinned, so improving a rule later never
                  changes what an approved report meant.
                </p>
              </div>

              {/* respondents */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Respondents</label>
                <div className="flex gap-2 mb-2">
                  {(['ALL_COMPLETED', 'SELECTED'] as RespondentScope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScope(s)}
                      className={cn(
                        'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                        scope === s ? 'border-primary bg-primary/5 font-medium' : 'border-input hover:bg-muted/50',
                      )}
                    >
                      {s === 'ALL_COMPLETED' ? 'Every completed attempt' : 'Specific respondents'}
                    </button>
                  ))}
                </div>
                {scope === 'SELECTED' && (
                  <input
                    className={INPUT_CLASS}
                    placeholder="Respondent ids, comma separated — e.g. 12, 47, 103"
                    value={respondentIdsText}
                    onChange={(e) => setRespondentIdsText(e.target.value)}
                  />
                )}
              </div>

              {/* guidance */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Guidance prompt</label>
                <textarea
                  className="w-full h-32 rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                  placeholder="Describe what the report should say and how the rules feed it. This is passed on word for word."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              {templateTags.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Per-placeholder guidance (optional)
                  </label>
                  <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                    {templateTags.map((tag) => (
                      <div key={tag} className="p-3">
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                          {'${' + tag + '}'}
                        </code>
                        <input
                          className={cn(INPUT_CLASS, 'mt-2')}
                          placeholder="Which rules fill this, and how it should read"
                          value={tagGuidance[tag] ?? ''}
                          onChange={(e) => setTagGuidance({ ...tagGuidance, [tag]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* assembled prompt */}
              {open.prompt && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      Assembled instructions {open.prompt.ready ? '' : '(incomplete)'}
                    </label>
                    <Button variant="outline" size="sm" onClick={copyPrompt}>
                      {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>

                  {open.prompt.blockers.length > 0 && (
                    <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-400">
                      <p className="font-medium flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="h-4 w-4" /> Still needed
                      </p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {open.prompt.blockers.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  )}

                  {open.prompt.warnings.map((w, i) => (
                    <div key={i} className="mb-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-2 text-sm text-blue-800 dark:text-blue-300">
                      {w}
                    </div>
                  ))}

                  {open.prompt.declaredKeys.length > 0 && (
                    <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-400">
                      <p className="font-medium flex items-center gap-1.5 mb-1">
                        <ShieldCheck className="h-4 w-4" /> Data the generated code may read
                      </p>
                      <p className="text-xs">
                        Only these {open.prompt.declaredKeys.length} column
                        {open.prompt.declaredKeys.length === 1 ? '' : 's'} are handed to the
                        sandbox. It has no database access and no other route to anything.
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {open.prompt.declaredKeys.map((k) => (
                          <code key={k} className="text-[11px] font-mono bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded">
                            {k}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  <pre className="w-full max-h-96 overflow-auto rounded-md border border-input bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                    {open.prompt.text}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-6 py-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {open.status === 'READY_FOR_GENERATION' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Ready to send. Nothing has been sent — no provider is configured.
                  </>
                ) : (
                  'Saving keeps this as a draft.'
                )}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(null)}>Close</Button>
                <Button
                  variant="outline"
                  onClick={save}
                  disabled={saving || !name.trim() || !assessmentId}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save draft
                </Button>
                {!!open.reportComputationId && open.status === 'DRAFT' && (
                  <Button
                    variant="primary"
                    onClick={markReady}
                    disabled={saving || !open.prompt?.ready}
                  >
                    Mark ready
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Delete this computation?</h2>
            <p className="text-sm text-muted-foreground mt-2">
              “{confirmDelete.name}” will be removed. The rules it referenced are not
              affected — they belong to the library.
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
