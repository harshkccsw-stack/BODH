import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Eye,
  FileCode2,
  FileText,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { assessmentsApi, type AssessmentResponse } from '@/pages/assessments/assessmentApis';
import { reportRulesApi, type ReportRuleResponse } from './reportRulesApi';
import {
  reportComputationsApi,
  type ReportCheckResponse,
  type ReportComputationResponse,
  type ReportRecipient,
  type TagGuidance,
} from './reportComputationsApi';
import {
  reportTemplatesApi,
  type ReportTemplateResponse,
  type TagBinding,
} from './reportTemplatesApi';
import { NewTemplateDialog, TemplateEditor } from './template-editor';
import { ReportRulesStep, StatusDot, fmtNumber } from './report-setup-rules';

/**
 * Report Setup — ONE flow for getting an assessment from answers to an
 * approved report, for the psychometrician.
 *
 * Three steps under one assessment, picked first:
 *
 *   Rules    — the scoring pipeline (import, translate, dry run).
 *   Layout   — a published template, and what fills each of its placeholders.
 *              The template says only a tag's SHAPE; which rule prints there
 *              is answered here, on this assessment's computation.
 *   Check    — the cohort check, a real respondent's PDF, and approve.
 *
 * The picker lists every assessment WHATEVER its status — an instrument is
 * set up before it is activated. Generating reports lives on its own page
 * (Generate Reports), because that is done by a different person, many times,
 * and must not require walking these steps again.
 *
 * Deliberately resumable: the step is in the URL, so a norm change a month
 * later lands straight on Rules.
 */

type Step = 'rules' | 'layout' | 'check';

const STEPS: Array<{ key: Step; label: string; hint: string }> = [
  { key: 'rules', label: 'Rules', hint: 'The scoring pipeline' },
  { key: 'layout', label: 'Layout', hint: 'Template and what fills it' },
  { key: 'check', label: 'Check & approve', hint: 'Run, preview, sign off' },
];

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
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
  INACTIVE: 'bg-muted text-muted-foreground',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'draft',
  READY_FOR_GENERATION: 'ready',
  GENERATED: 'generated',
  APPROVED: 'approved',
  ARCHIVED: 'archived',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PUBLISHED: 'published',
};

const Badge = ({ status }: { status: string }) => (
  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLE[status] ?? 'bg-muted')}>
    {STATUS_LABEL[status] ?? status.toLowerCase()}
  </span>
);

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;

export default function ReportSetupPage() {
  const { assessmentId: idParam } = useParams();
  const assessmentId = idParam ? Number(idParam) : null;
  return assessmentId && Number.isFinite(assessmentId)
    ? <SetupForAssessment assessmentId={assessmentId} />
    : <AssessmentPicker />;
}

/* ═══════════════════════ the picker ═══════════════════════ */

function AssessmentPicker() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<AssessmentResponse[]>([]);
  const [computations, setComputations] = useState<ReportComputationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([
          assessmentsApi.getAllAssessments(),
          // The list computes nothing per row, so this is one cheap read for
          // "which assessments already have a setup, and is it approved".
          reportComputationsApi.getAll().catch(() => [] as ReportComputationResponse[]),
        ]);
        setAssessments(a.data);
        setComputations(c);
      } catch (e: any) {
        setError(errorText(e, 'Could not load the assessments'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byAssessment = useMemo(() => {
    const out: Record<number, { setups: number; approved: number }> = {};
    computations.filter((c) => c.status !== 'ARCHIVED').forEach((c) => {
      const row = (out[c.assessmentId] ??= { setups: 0, approved: 0 });
      row.setups += 1;
      if (c.status === 'APPROVED') row.approved += 1;
    });
    return out;
  }, [computations]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assessments
      .filter((a) => !q || a.name.toLowerCase().includes(q)
        || a.questionnaireName.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assessments, search]);

  return (
    <div className="p-5 lg:p-7.5 space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span>BodhAssess</span><span>/</span><span>Reports</span><span>/</span>
          <span className="font-medium text-foreground">Report Setup</span>
        </div>
        <h1 className="text-xl font-semibold">Report setup</h1>
        <p className="text-sm text-muted-foreground">
          Pick the assessment to set up. Every assessment is listed, active or not — an
          instrument is set up before it goes live.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={cn(INPUT_CLASS, 'pl-9')}
          placeholder="Search by assessment or questionnaire…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading assessments…
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {assessments.length === 0
            ? 'No assessments yet. Create one in the Assessment Library first.'
            : 'Nothing matches that search.'}
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {shown.map((a) => {
            const s = byAssessment[a.assessmentId];
            return (
              <button
                key={a.assessmentId}
                type="button"
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                onClick={() => navigate(`/reports/setup/${a.assessmentId}`)}
              >
                <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{a.name}</span>
                    <Badge status={a.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {a.questionnaireName} · {a.respondentCount} allotted
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {s
                    ? <>
                        {s.setups} setup{s.setups === 1 ? '' : 's'}
                        {s.approved > 0 && (
                          <span className="ml-1 text-emerald-700">· {s.approved} approved</span>
                        )}
                      </>
                    : 'not set up'}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ one assessment ═══════════════════════ */

function SetupForAssessment({ assessmentId }: { assessmentId: number }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = (STEPS.some((s) => s.key === params.get('step'))
    ? params.get('step') : 'rules') as Step;
  const setStep = (s: Step) => {
    const next = new URLSearchParams(params);
    next.set('step', s);
    setParams(next, { replace: true });
  };

  const [assessment, setAssessment] = useState<AssessmentResponse | null>(null);
  const [computations, setComputations] = useState<ReportComputationResponse[]>([]);
  const [templates, setTemplates] = useState<ReportTemplateResponse[]>([]);
  const [rules, setRules] = useState<ReportRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const all = await reportRulesApi.getAll();
      setRules(all.filter((r) => r.assessmentId === assessmentId && r.status === 'ACTIVE'));
    } catch {
      /* the rules step shows its own error */
    }
  }, [assessmentId]);

  const loadTemplates = useCallback(async () => {
    setTemplates(await reportTemplatesApi.getAll());
  }, []);

  const loadComputations = useCallback(async () => {
    const list = (await reportComputationsApi.getByAssessment(assessmentId))
      .filter((c) => c.status !== 'ARCHIVED');
    setComputations(list);
    setSelectedId((current) =>
      current && list.some((c) => c.reportComputationId === current)
        ? current
        : (list[0]?.reportComputationId ?? null));
    return list;
  }, [assessmentId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const a = await assessmentsApi.getAssessmentById(assessmentId);
        setAssessment(a.data);
        await Promise.all([loadTemplates(), loadComputations(), loadRules()]);
      } catch (e: any) {
        setError(errorText(e, 'Could not load this assessment'));
      } finally {
        setLoading(false);
      }
    })();
  }, [assessmentId, loadTemplates, loadComputations, loadRules]);

  const selected = computations.find((c) => c.reportComputationId === selectedId) ?? null;

  /** Replace one computation in the list — the answer to every write. */
  const put = (c: ReportComputationResponse) => {
    setComputations((list) => {
      const rest = list.filter((x) => x.reportComputationId !== c.reportComputationId);
      return c.status === 'ARCHIVED' ? rest : [c, ...rest];
    });
    setSelectedId(c.status === 'ARCHIVED' ? null : c.reportComputationId);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading report setup…
      </div>
    );
  }

  return (
    <div className="p-5 lg:p-7.5 space-y-5">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
          <span>Reports</span><span>/</span>
          <button className="hover:text-foreground" onClick={() => navigate('/reports/setup')}>
            Report Setup
          </button>
          <span>/</span>
          <span className="font-medium text-foreground">
            {assessment?.name ?? `Assessment ${assessmentId}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{assessment?.name ?? `Assessment ${assessmentId}`}</h1>
          {assessment && <Badge status={assessment.status} />}
          <button
            className="text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
            onClick={() => navigate('/reports/setup')}
          >
            Change assessment
          </button>
        </div>
        {assessment && (
          <p className="text-sm text-muted-foreground">
            {assessment.questionnaireName} · {assessment.respondentCount} allotted
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── the step rail ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(s.key)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm',
              step === s.key ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/50',
            )}
          >
            <span className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
              step === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              {i + 1}
            </span>
            <span>
              <span className="block">{s.label}</span>
              <span className="block text-[11px] font-normal text-muted-foreground">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {step === 'rules' && (
        <ReportRulesStep assessmentId={assessmentId} onRulesChanged={() => void loadRules()} />
      )}

      {step !== 'rules' && (
        <ComputationStrip
          assessmentId={assessmentId}
          computations={computations}
          templates={templates}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreated={put}
          onTemplatesChanged={() => void loadTemplates()}
        />
      )}

      {step === 'layout' && selected && (
        <LayoutStep
          computation={selected}
          template={templates.find((t) => t.reportTemplateId === selected.reportTemplateId) ?? null}
          templates={templates}
          rules={rules}
          onChanged={put}
          onTemplatesChanged={() => void loadTemplates()}
        />
      )}

      {step === 'check' && selected && (
        <CheckStep
          computation={selected}
          onChanged={put}
          onRefresh={() => void loadComputations()}
        />
      )}
    </div>
  );
}

/* ═══════════════════════ computation strip ═══════════════════════ */

/**
 * One tab per (assessment, template) — the computations of this assessment —
 * plus an "Add template" picker. Shared by the Layout and Check steps so both
 * talk about the same thing.
 */
function ComputationStrip({
  assessmentId,
  computations,
  templates,
  selectedId,
  onSelect,
  onCreated,
  onTemplatesChanged,
}: {
  assessmentId: number;
  computations: ReportComputationResponse[];
  templates: ReportTemplateResponse[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreated: (c: ReportComputationResponse) => void;
  onTemplatesChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  /**
   * Writing a template from HERE, rather than sending the author to the
   * Templates page and back. `naming` collects the name, `authoring` holds the
   * template being written; when the editor closes on a PUBLISHED template it
   * is attached to this assessment straight away, which is the whole reason
   * somebody was making one.
   */
  const [naming, setNaming] = useState(false);
  const [authoring, setAuthoring] = useState<number | null>(null);

  /** Published templates with no live computation here yet. */
  const addable = templates.filter((t) =>
    t.status === 'PUBLISHED'
    && !computations.some((c) => c.reportTemplateId === t.reportTemplateId));
  /** Templates somebody started and has not published — offered back, not lost. */
  const drafts = templates.filter((t) => t.status === 'DRAFT');

  const add = async (templateId: number) => {
    setAdding(true);
    setError('');
    try {
      onCreated(await reportComputationsApi.forTemplate({ assessmentId, reportTemplateId: templateId }));
    } catch (e: any) {
      setError(errorText(e, 'Could not start a report on that template'));
    } finally {
      setAdding(false);
    }
  };

  /**
   * The editor closed. A template only becomes usable here once it is
   * published — a draft cannot be approved against — so that is the moment it
   * is attached, and anything still a draft is simply left in the library for
   * the author to come back to.
   */
  const afterAuthoring = async (last: ReportTemplateResponse | null) => {
    setAuthoring(null);
    onTemplatesChanged();
    if (last?.status === 'PUBLISHED'
        && !computations.some((c) => c.reportTemplateId === last.reportTemplateId)) {
      await add(last.reportTemplateId);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {computations.map((c) => (
          <button
            key={c.reportComputationId}
            type="button"
            onClick={() => onSelect(c.reportComputationId)}
            className={cn(
              'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
              selectedId === c.reportComputationId ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/50',
            )}
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            {c.templateName ?? c.name}
            <Badge status={c.status} />
          </button>
        ))}
        <select
          className="h-8.5 rounded-md border border-input bg-background px-2 text-sm"
          value=""
          disabled={adding || addable.length === 0}
          onChange={(e) => { if (e.target.value) void add(Number(e.target.value)); }}
          aria-label="Add a report template"
          title={addable.length === 0
            ? 'Every published template already has a report here. Write a new one to add another.'
            : 'Start a report on a published template'}
        >
          <option value="">{adding ? 'Adding…' : computations.length ? '+ Add template…' : 'Choose a template…'}</option>
          {addable.map((t) => (
            <option key={t.reportTemplateId} value={t.reportTemplateId}>
              {t.name} · v{t.version} · {t.tagCount} placeholder{t.tagCount === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setNaming(true)} disabled={adding}>
          <Plus className="h-3.5 w-3.5" /> New template
        </Button>
        {drafts.length > 0 && (
          <select
            className="h-8.5 rounded-md border border-input bg-background px-2 text-sm"
            value=""
            onChange={(e) => { if (e.target.value) setAuthoring(Number(e.target.value)); }}
            aria-label="Finish a draft template"
            title="A template you started but have not published"
          >
            <option value="">Finish a draft…</option>
            {drafts.map((t) => (
              <option key={t.reportTemplateId} value={t.reportTemplateId}>
                {t.name} · v{t.version}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="text-xs text-red-700">{error}</div>}
      {computations.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No report yet for this assessment. Choose a published template above, or write one
          here — a report is one template filled with this assessment’s rules.
          {templates.filter((t) => t.status === 'PUBLISHED').length === 0 && (
            <span className="mt-1 block">
              Nothing is published yet. <b>New template</b> opens the layout editor on a
              starter page; publishing it brings you straight back here.
            </span>
          )}
        </div>
      )}

      {naming && (
        <NewTemplateDialog
          onClose={() => setNaming(false)}
          onCreated={(created) => {
            setNaming(false);
            onTemplatesChanged();
            setAuthoring(created.reportTemplateId);
          }}
        />
      )}
      {authoring !== null && (
        <TemplateEditor templateId={authoring} onClosed={(last) => void afterAuthoring(last)} />
      )}
    </div>
  );
}

/* ═══════════════════════ layout step ═══════════════════════ */

function LayoutStep({
  computation: c,
  template: summary,
  templates,
  rules,
  onChanged,
  onTemplatesChanged,
}: {
  computation: ReportComputationResponse;
  template: ReportTemplateResponse | null;
  templates: ReportTemplateResponse[];
  rules: ReportRuleResponse[];
  onChanged: (c: ReportComputationResponse) => void;
  onTemplatesChanged: () => void;
}) {
  const [template, setTemplate] = useState<ReportTemplateResponse | null>(null);
  const [error, setError] = useState('');
  const [busyTag, setBusyTag] = useState<string | null>(null);
  const [repinning, setRepinning] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [reloadTemplate, setReloadTemplate] = useState(0);

  // The listing carries no bindings; the detail does.
  useEffect(() => {
    if (!c.reportTemplateId) { setTemplate(null); return; }
    let live = true;
    reportTemplatesApi.getById(c.reportTemplateId)
      .then((t) => { if (live) setTemplate(t); })
      .catch((e) => { if (live) setError(errorText(e, 'Could not load the template')); });
    return () => { live = false; };
  }, [c.reportTemplateId, reloadTemplate]);

  /**
   * A newer PUBLISHED version of this template, if there is one.
   *
   * `newVersion` writes a new template row rather than editing in place, which
   * is what keeps an issued report explicable — and it means a setup does not
   * follow its template forward on its own. This is the button that moves it,
   * and the answers come across with it (the server copies them from the
   * newest earlier version of the same template family).
   */
  const newerVersion = useMemo(() => {
    if (!summary) return null;
    return templates
      .filter((t) => t.status === 'PUBLISHED'
        && t.name.toLowerCase() === summary.name.toLowerCase()
        && t.version > summary.version)
      .sort((a, b) => b.version - a.version)[0] ?? null;
  }, [templates, summary]);

  const useNewerVersion = async () => {
    if (!newerVersion) return;
    setSwitching(true);
    setError('');
    try {
      onChanged(await reportComputationsApi.forTemplate({
        assessmentId: c.assessmentId,
        reportTemplateId: newerVersion.reportTemplateId,
      }));
    } catch (e: any) {
      setError(errorText(e, 'Could not move this report to the newer version'));
    } finally {
      setSwitching(false);
    }
  };

  const frozen = c.status === 'APPROVED';
  const answers = useMemo(() => {
    const out: Record<string, TagGuidance> = {};
    c.tagGuidance.forEach((g) => { out[g.tag] = g; });
    return out;
  }, [c.tagGuidance]);

  /** Rules pinned at something older than their latest version. */
  const stale = useMemo(() => c.rules.filter((pinned) => {
    const latest = rules.find((r) => r.reportRuleId === pinned.reportRuleId);
    return latest && latest.latestVersion > pinned.version;
  }), [c.rules, rules]);
  /** Formula rules of the assessment that are not pinned at all. */
  const unpinned = useMemo(() => rules.filter((r) =>
    r.latest?.definitionKind === 'EXPRESSION'
    && !c.rules.some((p) => p.reportRuleId === r.reportRuleId)), [c.rules, rules]);

  const answer = async (tag: string, payload: Parameters<typeof reportComputationsApi.answerTag>[2]) => {
    setBusyTag(tag);
    setError('');
    try {
      onChanged(await reportComputationsApi.answerTag(c.reportComputationId, tag, payload));
    } catch (e: any) {
      setError(errorText(e, `Could not answer \${${tag}}`));
    } finally {
      setBusyTag(null);
    }
  };

  const repin = async () => {
    setRepinning(true);
    setError('');
    try {
      onChanged(await reportComputationsApi.repin(c.reportComputationId));
    } catch (e: any) {
      setError(errorText(e, 'Could not re-pin the rules'));
    } finally {
      setRepinning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
      <Card className="min-w-0">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Layout</h2>
              <p className="text-sm text-muted-foreground">
                {template ? <>Template <b>{template.name}</b> v{template.version}</> : 'Loading the template…'}
                {template && <> · <Badge status={template.status} /></>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {frozen ? (
                <span className="text-xs text-muted-foreground">
                  Approved: frozen. Clone it on the Check step to change anything.
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingTemplate(true)}
                  disabled={!c.reportTemplateId}
                  title="Open the layout editor — the HTML, its placeholders, preview and publish"
                >
                  <FileCode2 className="h-3.5 w-3.5" /> Edit template
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {template && template.status !== 'PUBLISHED' && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
              <span className="flex-1">
                This template is a draft, so nothing can be approved from it yet. Publish it in
                the layout editor; the answers below stay as they are.
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditingTemplate(true)}>
                <FileCode2 className="h-3.5 w-3.5" /> Open the editor
              </Button>
            </div>
          )}

          {newerVersion && !frozen && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
              <span className="flex-1">
                <b>Version {newerVersion.version} of this template is published.</b> This report is
                on version {summary?.version}. Moving brings your placeholder answers across; the
                report on this version stays as it is.
              </span>
              <Button variant="outline" size="sm" onClick={useNewerVersion} disabled={switching}>
                {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                Use v{newerVersion.version}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Everything the template prints. Headings and respondent details are answered on the
            template itself. A <b>value</b> is filled by one of the rules pinned on the right; a{' '}
            <b>paragraph</b> is written by AI from those values, under your instructions.
          </p>

          {!template ? null : template.bindings.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              This template has no placeholders.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {template.bindings.map((b) => (
                <PlaceholderRow
                  key={b.tag}
                  binding={b}
                  answer={answers[b.tag] ?? null}
                  pinned={c.rules}
                  frozen={frozen}
                  busy={busyTag === b.tag}
                  narrativeAvailable={c.narrativeAvailable}
                  onAnswer={(payload) => void answer(b.tag, payload)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── pinned rules ───────────────────────────────────────────────── */}
      <Card className="h-fit">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Pinned rules</h3>
              <p className="text-xs text-muted-foreground">
                The exact versions this report computes with. Improving a rule later never changes
                what an approved report meant.
              </p>
            </div>
            {!frozen && (
              <Button variant="outline" size="sm" onClick={repin} disabled={repinning}
                title="Pin every formula rule of this assessment at its latest version">
                {repinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Re-pin
              </Button>
            )}
          </div>

          {(stale.length > 0 || unpinned.length > 0) && !frozen && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
              {stale.length > 0 && (
                <span className="block">
                  {stale.length} rule{stale.length === 1 ? ' has' : 's have'} a newer version than
                  the one pinned: {stale.map((r) => r.name).join(', ')}.
                </span>
              )}
              {unpinned.length > 0 && (
                <span className="block">
                  Not pinned yet: {unpinned.map((r) => r.name).join(', ')}.
                </span>
              )}
              <span className="block">Re-pin to bring them in.</span>
            </div>
          )}

          {c.rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing pinned. Write formula rules on the Rules step, then re-pin.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {[...c.rules].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => (
                <div key={r.reportRuleVersionId} className="p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sigma className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">v{r.version}</span>
                    {r.definitionKind === 'STATEMENT' && (
                      <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">plain language</span>
                    )}
                    {r.population && (
                      <span className="rounded bg-purple-100 px-1 text-[10px] text-purple-800">cohort-relative</span>
                    )}
                  </div>
                  <code className="block truncate text-[11px] text-muted-foreground">{r.slug}</code>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editingTemplate && c.reportTemplateId && (
        <TemplateEditor
          templateId={c.reportTemplateId}
          onClosed={() => {
            setEditingTemplate(false);
            // The HTML may have gained or lost placeholders, and publishing
            // changes what the Check step will allow — so re-read both the
            // template and the library, which is where a NEW version appears.
            setReloadTemplate((n) => n + 1);
            onTemplatesChanged();
          }}
        />
      )}
    </div>
  );
}

/** One placeholder and the answer to "what fills this?" on THIS computation. */
function PlaceholderRow({
  binding: b,
  answer,
  pinned,
  frozen,
  busy,
  narrativeAvailable,
  onAnswer,
}: {
  binding: TagBinding;
  answer: TagGuidance | null;
  pinned: ReportComputationResponse['rules'];
  frozen: boolean;
  busy: boolean;
  narrativeAvailable: boolean;
  onAnswer: (payload: { ruleSlug?: string | null; guidance?: string | null; format?: string | null; fallbackText?: string | null }) => void;
}) {
  const isValue = b.binderType === 'VALUE' || b.binderType === 'COMPUTED';
  const isNarrative = b.binderType === 'NARRATIVE';
  const [ruleSlug, setRuleSlug] = useState(answer?.ruleSlug ?? '');
  const [format, setFormat] = useState(answer?.format ?? b.format ?? '');
  const [fallback, setFallback] = useState(answer?.fallbackText ?? b.fallbackText ?? '');
  const [guidance, setGuidance] = useState(answer?.guidance ?? '');

  // The server is the source of truth — every save returns the whole computation.
  useEffect(() => {
    setRuleSlug(answer?.ruleSlug ?? '');
    setFormat(answer?.format ?? b.format ?? '');
    setFallback(answer?.fallbackText ?? b.fallbackText ?? '');
    setGuidance(answer?.guidance ?? '');
  }, [answer, b.format, b.fallbackText]);

  const dirty = isValue
    ? ruleSlug !== (answer?.ruleSlug ?? '') || format !== (answer?.format ?? b.format ?? '')
      || fallback !== (answer?.fallbackText ?? b.fallbackText ?? '')
    : isNarrative
      ? guidance !== (answer?.guidance ?? '') || fallback !== (answer?.fallbackText ?? b.fallbackText ?? '')
      : false;

  const done = isValue ? !!answer?.ruleSlug : isNarrative ? !!answer?.guidance?.trim() : b.bound;
  const pinnedRule = pinned.find((r) => r.slug === (answer?.ruleSlug ?? ''));
  const dangling = isValue && !!answer?.ruleSlug && !pinnedRule;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        {done && !dangling
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{'${' + b.tag + '}'}</code>
            <span className="text-[11px] text-muted-foreground">
              {b.binderType === 'CORE' ? 'respondent detail'
                : b.binderType === 'LITERAL' ? 'fixed text'
                : isValue ? 'a value'
                : isNarrative ? 'a paragraph, written by AI'
                : b.binderType === 'UNBOUND' ? 'unanswered on the template'
                : b.binderType.toLowerCase()}
            </span>
          </div>

          {b.binderType === 'CORE' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {b.coreField ?? 'not chosen'} — filled from the database.
            </p>
          )}
          {b.binderType === 'LITERAL' && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              “{b.literalText ?? ''}”
            </p>
          )}
          {b.binderType === 'UNBOUND' && (
            <p className="mt-1 text-xs text-amber-700">
              The template has not said what this is. Answer it on the Report Templates page.
            </p>
          )}
          {(b.binderType === 'TABLE' || b.binderType === 'CHART') && (
            <p className="mt-1 text-xs text-amber-700">
              Tables and charts need the scoring engine and cannot be delivered yet.
            </p>
          )}

          {isValue && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_1fr]">
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                value={ruleSlug}
                disabled={frozen || busy}
                onChange={(e) => setRuleSlug(e.target.value)}
                aria-label={`Which rule fills ${b.tag}`}
              >
                <option value="">Choose a rule…</option>
                {pinned.filter((r) => r.definitionKind === 'EXPRESSION').map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name} v{r.version}{r.resultType ? ` · ${r.resultType.toLowerCase()}` : ''}
                  </option>
                ))}
                {dangling && <option value={answer!.ruleSlug!}>{answer!.ruleSlug} (not pinned)</option>}
              </select>
              <input
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="Format, e.g. 0.0"
                value={format}
                disabled={frozen || busy}
                onChange={(e) => setFormat(e.target.value)}
                title="A number format, e.g. 0.0 or #,##0"
                aria-label={`Number format for ${b.tag}`}
              />
              <input
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="If empty, print…"
                value={fallback}
                disabled={frozen || busy}
                onChange={(e) => setFallback(e.target.value)}
                aria-label={`Fallback text for ${b.tag}`}
              />
            </div>
          )}
          {dangling && (
            <p className="mt-1 text-[11px] text-amber-700">
              Points at <code>{answer?.ruleSlug}</code>, which this report does not pin — it would
              print blank. Re-pin, or choose another rule.
            </p>
          )}
          {isValue && pinned.filter((r) => r.definitionKind === 'EXPRESSION').length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              No formula rule is pinned yet. Write one on the Rules step and re-pin.
            </p>
          )}

          {isNarrative && (
            <div className="mt-2 space-y-2">
              <textarea
                className="w-full rounded-md border border-input bg-background p-2 text-xs focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                rows={2}
                placeholder="What this paragraph should say, which scores it should draw on, and what to do when one is missing. Passed to the model word for word."
                value={guidance}
                disabled={frozen || busy}
                onChange={(e) => setGuidance(e.target.value)}
                aria-label={`What ${b.tag} should say`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  placeholder="If nothing can be written, print…"
                  value={fallback}
                  disabled={frozen || busy}
                  onChange={(e) => setFallback(e.target.value)}
                  aria-label={`Fallback text for ${b.tag}`}
                />
                <span className="inline-flex items-center gap-1 text-[11px] text-violet-800">
                  <Sparkles className="h-3 w-3" />
                  {narrativeAvailable ? 'written by AI from the computed values' : 'no model configured on the server'}
                </span>
              </div>
              {!guidance.trim() && (
                <p className="text-[11px] text-amber-600">
                  With no instructions the model will simply summarise whichever scores look
                  relevant. Saying what you want is most of the difference between a useful
                  paragraph and a vague one.
                </p>
              )}
            </div>
          )}
        </div>

        {(isValue || isNarrative) && !frozen && dirty && (
          <Button
            size="sm"
            className="shrink-0"
            disabled={busy || (isValue && !ruleSlug)}
            onClick={() => onAnswer(isValue
              ? { ruleSlug, format: format.trim() || null, fallbackText: fallback.trim() || null }
              : { guidance: guidance.trim() || null, fallbackText: fallback.trim() || null })}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ check & approve ═══════════════════════ */

function CheckStep({
  computation: c,
  onChanged,
  onRefresh,
}: {
  computation: ReportComputationResponse;
  onChanged: (c: ReportComputationResponse) => void;
  onRefresh: () => void;
}) {
  const [check, setCheck] = useState<ReportCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [previewAttempt, setPreviewAttempt] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError('');
    try {
      setCheck(await reportComputationsApi.check(c.reportComputationId));
    } catch (e: any) {
      setCheck(null);
      setError(errorText(e, 'Could not check this report'));
    } finally {
      setChecking(false);
    }
  }, [c.reportComputationId]);

  // A fresh computation is checked once on arrival, and again after every
  // change — the check is what says a report will actually come out, and
  // approve stays disabled until it has said so.
  useEffect(() => {
    setCheck(null);
    void runCheck();
    reportComputationsApi.recipients(c.reportComputationId)
      .then((list) => {
        setRecipients(list);
        setPreviewAttempt((cur) =>
          cur && list.some((r) => r.attemptId === cur && r.recipient)
            ? cur : (list.find((r) => r.recipient)?.attemptId ?? null));
      })
      .catch(() => setRecipients([]));
  }, [c.reportComputationId, c.updatedAt, runCheck]);

  const act = async (what: string, call: () => Promise<ReportComputationResponse>, done?: string) => {
    setBusy(what);
    setError('');
    setNote('');
    try {
      onChanged(await call());
      if (done) setNote(done);
    } catch (e: any) {
      setError(errorText(e, `Could not ${what} this report`));
    } finally {
      setBusy(null);
    }
  };

  const previewOne = async () => {
    if (!previewAttempt) return;
    setPreviewing(true);
    setError('');
    try {
      const url = await reportComputationsApi.previewPdfUrl(c.reportComputationId, previewAttempt);
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      setError(errorText(e, 'Could not render that respondent’s report'));
    } finally {
      setPreviewing(false);
    }
  };

  const doDelete = async () => {
    setBusy('delete');
    setError('');
    try {
      await reportComputationsApi.delete(c.reportComputationId);
      setConfirmDelete(false);
      onRefresh();
    } catch (e: any) {
      setError(errorText(e, 'Could not delete this report'));
    } finally {
      setBusy(null);
    }
  };

  const approved = c.status === 'APPROVED';
  const completed = recipients.filter((r) => r.status === 'COMPLETED');

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Check &amp; approve</h2>
              <p className="text-sm text-muted-foreground">
                Every pinned rule over every respondent, then one real report to read, then sign off.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={runCheck} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Re-check
              </Button>
              {!approved ? (
                <Button
                  onClick={() => act('approve', () => reportComputationsApi.approve(c.reportComputationId),
                    'Approved. Generate reports from the Generate Reports page.')}
                  disabled={busy !== null || !check?.ready}
                  title={!check ? 'Run the check first' : !check.ready ? 'Something still blocks it — see below' : 'Approve for delivery'}
                >
                  {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Approve
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => act('clone', () => reportComputationsApi.clone(c.reportComputationId),
                    'Cloned to a new draft. The approved one is untouched.')}
                  disabled={busy !== null}
                  title="Copy to a draft you can change; the approved one stays as it is"
                >
                  {busy === 'clone' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  Clone to edit
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {note && (
            <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{note}</span>
              <button className="text-green-700 hover:text-green-900" onClick={() => setNote('')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {approved && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <b>Approved</b>
              {c.approvedAt && <> on {shortDate(c.approvedAt)}</>}
              {c.approvedByUserId != null && <> by user #{c.approvedByUserId}</>}
              {c.approvedCohortSize != null && <> over {c.approvedCohortSize} completed respondents</>}
              . The rules, template and answers are frozen; every report generated from this says the
              same thing. Clone it to change anything.
            </div>
          )}

          {/* ── the verdict ───────────────────────────────────────────── */}
          {checking && !check ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Evaluating every rule over the cohort…
            </div>
          ) : check ? (
            <>
              <div className={cn(
                'rounded-md border p-3 text-sm',
                check.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900',
              )}>
                <div className="flex items-center gap-2 font-medium">
                  {check.ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {check.ready ? 'Ready to approve' : 'Not ready yet'}
                  <span className="ml-auto text-xs font-normal">
                    {check.completed} of {check.cohortSize} completed · minimum for norms {check.minCohortSize}
                  </span>
                </div>
                {check.blockers.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                    {check.blockers.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
                {check.notes.map((n) => (
                  <p key={n} className="mt-1 text-xs">{n}</p>
                ))}
              </div>

              {check.rules.length > 0 && (
                <div className="divide-y rounded-md border">
                  {check.rules.map((o) => (
                    <div key={o.slug} className="p-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusDot status={o.status} />
                        <span className="font-medium">{o.name}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{o.slug}</code>
                        {o.population && (
                          <span className="rounded bg-purple-100 px-1 text-[10px] text-purple-800">cohort-relative</span>
                        )}
                      </div>
                      {o.error && <div className="mt-1 text-xs text-red-700">{o.error}</div>}
                      {o.status === 'TOO_SMALL' && (
                        <div className="mt-1 text-xs text-amber-700">
                          Too few completed respondents for a norm. Nothing computed until the
                          cohort reaches {check.minCohortSize}.
                        </div>
                      )}
                      {o.status === 'NEEDS_GENERATION' && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          A plain-language rule — nothing can compute it. Write its formula on the Rules step.
                        </div>
                      )}
                      {o.summary && (
                        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          {o.summary.min !== null && (
                            <span>min {fmtNumber(o.summary.min)} · max {fmtNumber(o.summary.max)} · mean {fmtNumber(o.summary.mean)}</span>
                          )}
                          {Object.entries(o.summary.bands).map(([band, n]) => (
                            <span key={band} className="rounded bg-muted px-1.5 py-0.5">{band}: {n}</span>
                          ))}
                          <span className={cn(o.summary.nulls > 0 && 'font-medium text-amber-700')}>
                            {o.summary.nulls} without a value
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {/* ── read one before approving ─────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Read one real report first:</span>
            <select
              className="h-8 min-w-[14rem] rounded-md border border-input bg-background px-2 text-xs"
              value={previewAttempt ?? ''}
              onChange={(e) => setPreviewAttempt(e.target.value ? Number(e.target.value) : null)}
              disabled={completed.length === 0}
              aria-label="Which respondent to preview"
            >
              {completed.length === 0
                ? <option value="">Nobody has completed this assessment yet</option>
                : completed.map((r) => (
                  <option key={r.attemptId} value={r.attemptId}>
                    {r.name}{r.serialId ? ` (${r.serialId})` : ''}
                  </option>
                ))}
            </select>
            <Button variant="outline" size="sm" onClick={previewOne} disabled={previewing || !previewAttempt}>
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
              Preview PDF
            </Button>
            {c.narrativeTags.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                title="Discard the AI prose so the next preview writes it again. One model call per respondent next time."
                onClick={async () => {
                  setBusy('clear');
                  setError('');
                  try {
                    const { message } = await reportComputationsApi.clearNarratives(c.reportComputationId);
                    setNote(message);
                  } catch (e: any) {
                    setError(errorText(e, 'Could not clear the generated text'));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Sparkles className="h-3.5 w-3.5" /> Rewrite AI text
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── housekeeping ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          onClick={() => act('archive', () => reportComputationsApi.archive(c.reportComputationId),
            'Archived. It no longer appears here or on the Generate page.')}
          title="Retire this report. An approved one must be archived before it can be deleted."
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </Button>
        {!approved && (
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5 text-red-600" /> Delete
          </Button>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Pin className="h-3 w-3" /> {c.rules.length} rule{c.rules.length === 1 ? '' : 's'} pinned · {c.slug}
        </span>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <Card className="w-full max-w-md">
            <CardContent className="p-5 space-y-3">
              <h2 className="text-lg font-semibold">Delete this report setup?</h2>
              <p className="text-sm text-muted-foreground">
                The placeholder answers and pinned versions for <b>{c.templateName ?? c.name}</b> on
                this assessment are removed. The rules and the template stay.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button variant="destructive" onClick={doDelete} disabled={busy === 'delete'}>
                  {busy === 'delete' && <Loader2 className="h-4 w-4 animate-spin" />} Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
