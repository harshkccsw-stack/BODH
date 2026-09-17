import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Copy,
  Loader2,
  Pencil,
  Play,
  Plus,
  Sigma,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  COLUMN_GROUPS,
  RULE_STAGES,
  hasStatementHistory,
  reportRulesApi,
  type DefinitionKind,
  type DryRunResult,
  type ExprCheck,
  type ReportColumn,
  type ReportRuleResponse,
  type RulePortability,
  type RuleStage,
} from './reportRulesApi';
import { ReportRuleImport } from './report-rule-import';
import { ReportRuleTranslate } from './report-rule-translate';

/**
 * The Rules step of Report Setup — the scoring pipeline for ONE assessment.
 *
 * The psychometrician's workbook states scoring as an ordered sequence of
 * steps, each consuming the previous one's output. This is that sequence, and
 * the rules filed under each step are the same `report_rule` rows the library
 * page edits — the steps are filing, not a second kind of rule.
 *
 * Deliberately resumable and not a create-once wizard. A scoring spec is a
 * living document: the workbook itself says the provisional bands get replaced
 * with percentile norms after the pilot. You must be able to land on step 4 a
 * month later and change three numbers, which a wizard would make into a
 * re-run of everything before it.
 *
 * Rendered INSIDE `report-setup.tsx`, which owns the assessment picker and the
 * page header — this component is the step, not the page. It used to be the
 * page behind the assessment library's hover icon; that route now redirects
 * here.
 */

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

/**
 * The two workbook steps that hold no rules, shown so the pipeline reads whole.
 *
 * Both are real steps that are simply already handled elsewhere, and saying so
 * is the point: an author who cannot see step 2 will eventually write `6 - raw`
 * into a scoring rule, which double-reverses every item the question bank
 * already reversed.
 */
const INFORMATIONAL: Array<{
  id: string; step: string; label: string; body: string[];
}> = [
  {
    id: 'CAPTURE',
    step: 'Step 0',
    label: 'Data capture',
    body: [
      'Nothing to author. Raw responses are already stored per attempt, and every rule below reads them through this assessment’s MQ/MQT columns.',
      'The workbook’s completion check is the platform’s own: only COMPLETED attempts are scored, so a partial protocol never reaches a rule.',
      'The workbook’s speed check cannot run yet — an attempt carries no start or finish time, so total completion time is not in the database. It needs a column before that rule can exist.',
    ],
  },
  {
    id: 'REVERSE',
    step: 'Step 2',
    label: 'Reverse scoring',
    body: [
      'Authored in the question bank, not here. A reverse-keyed item carries reversed option scores — 5,4,3,2,1 instead of 1,2,3,4,5 — so picking “2” is worth 4 by construction.',
      'Do NOT write 6 - raw into a scoring rule. Scores are summed from the options a respondent picked, so a reverse applied here would be applied twice, and mqt: would mean one thing in a Data Studio sheet and another in a report.',
    ],
  },
];

interface RuleForm {
  id: number | null;
  name: string;
  description: string;
  stage: RuleStage;
  definitionKind: DefinitionKind;
  expression: string;
  statementText: string;
  notes: string;
}

const emptyForm = (stage: RuleStage): RuleForm => ({
  id: null,
  name: '',
  description: '',
  stage,
  definitionKind: 'EXPRESSION',
  expression: '',
  statementText: '',
  notes: '',
});

export function ReportRulesStep({
  assessmentId,
  onRulesChanged,
}: {
  assessmentId: number;
  /**
   * Told after every write, so the page can refresh what the Layout step shows
   * — a rule saved here is what a placeholder there gets pointed at.
   */
  onRulesChanged?: () => void;
}) {
  const [rules, setRules] = useState<ReportRuleResponse[]>([]);
  const [portability, setPortability] = useState<RulePortability[]>([]);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [active, setActive] = useState<string>('SCORE');
  const [form, setForm] = useState<RuleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [check, setCheck] = useState<ExprCheck | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReportRuleResponse | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');

  const expressionRef = useRef<HTMLTextAreaElement | null>(null);

  // Asked once, so an install with no key never draws a button that fails when
  // pressed. A failure here simply leaves the feature hidden.
  useEffect(() => {
    reportRulesApi.aiAvailable().then(setAiReady).catch(() => setAiReady(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [all, ports, cols] = await Promise.all([
        reportRulesApi.getAll(),
        reportRulesApi.portability(assessmentId),
        reportRulesApi.columns(assessmentId),
      ]);
      setRules(all);
      setPortability(ports);
      setColumns(cols);
    } catch (e: any) {
      setError(errorText(e, 'Could not load this assessment’s rules'));
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  /** Reload after a write, and tell the page — the Layout step reads these rules too. */
  const reload = useCallback(async () => {
    await load();
    onRulesChanged?.();
  }, [load, onRulesChanged]);

  useEffect(() => {
    if (Number.isFinite(assessmentId)) load();
  }, [assessmentId, load]);

  /** Rules homed on THIS assessment, filed by step. */
  const byStage = useMemo(() => {
    const out: Record<string, ReportRuleResponse[]> = {};
    RULE_STAGES.forEach((s) => { out[s.key] = []; });
    rules
      .filter((r) => r.assessmentId === assessmentId && r.status === 'ACTIVE')
      .forEach((r) => { (out[r.stage] ??= []).push(r); });
    Object.values(out).forEach((list) =>
      list.sort((a, b) => a.stepOrder - b.stepOrder || a.name.localeCompare(b.name)));
    return out;
  }, [rules, assessmentId]);

  const verdictBySlug = useMemo(() => {
    const out: Record<string, RulePortability> = {};
    portability.forEach((p) => { out[p.slug] = p; });
    return out;
  }, [portability]);

  /** Library rules NOT homed here, with their verdict — the adoption list. */
  const adoptable = useMemo(
    () => portability
      .filter((p) => p.homeAssessmentId !== assessmentId)
      .sort((a, b) => a.verdict.localeCompare(b.verdict) || a.name.localeCompare(b.name)),
    [portability, assessmentId],
  );

  const groupedColumns = useMemo(() => {
    const out: Array<{ key: string; label: string; hint: string; items: ReportColumn[] }> = [];
    COLUMN_GROUPS.forEach((g) => {
      const items = columns.filter((c) => c.group === g.key);
      if (items.length) out.push({ ...g, items });
    });
    return out;
  }, [columns]);

  // Live formula checking, debounced. 200 with errors[] is the normal answer,
  // so a half-typed formula never flashes an error status.
  useEffect(() => {
    if (!form || form.definitionKind !== 'EXPRESSION' || !form.expression.trim()) {
      setCheck(null);
      return;
    }
    const handle = window.setTimeout(() => {
      reportRulesApi
        .validateExpression(form.expression, assessmentId, null, form.id)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [form?.expression, form?.definitionKind, form?.id, assessmentId]);

  const openCreate = (stage: RuleStage) => {
    setFormError('');
    setCheck(null);
    setForm(emptyForm(stage));
  };

  const openEdit = (rule: ReportRuleResponse) => {
    setFormError('');
    setCheck(null);
    setForm({
      id: rule.reportRuleId,
      name: rule.name,
      description: rule.description ?? '',
      stage: rule.stage,
      definitionKind: rule.latest?.definitionKind ?? 'EXPRESSION',
      expression: rule.latest?.expression ?? '',
      statementText: rule.latest?.statementText ?? '',
      notes: rule.latest?.notes ?? '',
    });
  };

  /** Insert at the caret, so nobody types an identifier from memory. */
  const insert = (token: string) => {
    setForm((f) => {
      if (!f) return f;
      const el = expressionRef.current;
      const at = el ? el.selectionStart : f.expression.length;
      const next = f.expression.slice(0, at) + token + f.expression.slice(at);
      window.requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.selectionStart = el.selectionEnd = at + token.length;
        }
      });
      return { ...f, expression: next };
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        stage: form.stage,
        stepOrder: form.id ? undefined : (byStage[form.stage]?.length ?? 0) + 1,
        definitionKind: form.definitionKind,
        expression: form.definitionKind === 'EXPRESSION' ? form.expression : null,
        statementText: form.definitionKind === 'STATEMENT' ? form.statementText : null,
        assessmentId,
        notes: form.notes.trim() || null,
      };
      if (form.id) await reportRulesApi.update(form.id, payload);
      else await reportRulesApi.create(payload);
      setForm(null);
      await reload();
    } catch (e: any) {
      setFormError(errorText(e, 'Could not save this rule'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await reportRulesApi.delete(confirmDelete.reportRuleId);
      setConfirmDelete(null);
      await reload();
    } catch (e: any) {
      setDeleteError(errorText(e, 'Could not delete this rule'));
    }
  };

  const run = async () => {
    setRunning(true);
    setRunError('');
    try {
      setDryRun(await reportRulesApi.dryRun({ assessmentId }));
    } catch (e: any) {
      setRunError(errorText(e, 'Could not run the rules'));
    } finally {
      setRunning(false);
    }
  };

  const [importing, setImporting] = useState(false);
  /**
   * Which rules the translate screen opens on. Null: closed. Empty: the batch
   * screen, choose from every plain-language rule. One id: that rule alone,
   * straight to the proposal — the per-card Translate / Re-translate button.
   */
  const [translating, setTranslating] = useState<number[] | null>(null);
  const [aiReady, setAiReady] = useState(false);

  /**
   * Adopt a library rule by copying it here, dependencies included.
   *
   * A copy and not a shared reference, per the authoring plan: editing a
   * shared rule would write a new version for every adopter at once, and a
   * band cut tuned for one instrument would move under another. The backend
   * rewrites every [rule:…] the copy reads to point at the copied dependency,
   * and refuses the whole thing if any column is missing here.
   */
  const [adoptingId, setAdoptingId] = useState<number | null>(null);
  const adopt = async (p: RulePortability) => {
    setAdoptingId(p.reportRuleId);
    setNotice('');
    setError('');
    try {
      const copied = await reportRulesApi.fork(p.reportRuleId, assessmentId);
      setNotice(`Copied ${copied.length} rule${copied.length === 1 ? '' : 's'} onto this `
        + `assessment: ${copied.map((r) => r.name).join(', ')}.`);
      await reload();
    } catch (e: any) {
      setError(errorText(e, `Could not copy “${p.name}” here`));
    } finally {
      setAdoptingId(null);
    }
  };

  const stageMeta = RULE_STAGES.find((s) => s.key === active);
  const informational = INFORMATIONAL.find((s) => s.id === active);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading report setup…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── step header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Rules</h2>
          <p className="text-sm text-muted-foreground">
            The scoring pipeline, step by step. Every rule here is what a placeholder on
            the Layout step can print.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" /> Import workbook
          </Button>
          {aiReady && (
            <Button variant="outline" onClick={() => setTranslating([])}>
              <Sparkles className="h-4 w-4" /> Write formulae with AI
            </Button>
          )}
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run over respondents
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button className="text-green-700 hover:text-green-900" onClick={() => setNotice('')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {columns.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This assessment exposes no MQ/MQT columns — nothing has been placed in its
          questionnaire, so there is nothing for a formula to read yet.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        {/* ── the pipeline rail ───────────────────────────────────────── */}
        <Card className="h-fit">
          <CardContent className="p-2">
            <RailItem
              meta={INFORMATIONAL[0]}
              active={active === 'CAPTURE'}
              onClick={() => setActive('CAPTURE')}
            />
            <RailRule
              stage={RULE_STAGES[0]}
              count={byStage.VALIDITY?.length ?? 0}
              active={active === 'VALIDITY'}
              onClick={() => setActive('VALIDITY')}
            />
            <RailItem
              meta={INFORMATIONAL[1]}
              active={active === 'REVERSE'}
              onClick={() => setActive('REVERSE')}
            />
            {RULE_STAGES.slice(1).map((s) => (
              <RailRule
                key={s.key}
                stage={s}
                count={byStage[s.key]?.length ?? 0}
                active={active === s.key}
                onClick={() => setActive(s.key)}
              />
            ))}
          </CardContent>
        </Card>

        {/* ── the step ────────────────────────────────────────────────── */}
        {/* min-w-0 is load-bearing: a grid item is min-width:auto by default,
            so this 1fr track would size to its WIDEST child. One wide table
            then pushed the whole page sideways instead of scrolling inside its
            own box. Every horizontal scroller below depends on this. */}
        <div className="min-w-0 space-y-5">
          {informational && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {informational.step}
                  </div>
                  <h2 className="text-lg font-semibold">{informational.label}</h2>
                </div>
                {informational.body.map((line, i) => (
                  <p key={i} className="text-sm text-muted-foreground">{line}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {stageMeta && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {stageMeta.step}
                    </div>
                    <h2 className="text-lg font-semibold">{stageMeta.label}</h2>
                    <p className="text-sm text-muted-foreground">{stageMeta.hint}</p>
                  </div>
                  <Button size="sm" onClick={() => openCreate(stageMeta.key)}>
                    <Plus className="h-4 w-4" /> Add rule
                  </Button>
                </div>

                {stageMeta.key === 'BAND' && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                    <b>Cut points are exclusive at the bottom.</b>{' '}
                    <code>NORMBAND(x, 34, 'Developing', 48, 'Moderate', 'High')</code> reads as
                    “below 34 Developing, below 48 Moderate, otherwise High”. A workbook written as
                    “≤ 33 / 34–47 / ≥ 48” therefore uses <b>34 and 48</b>, not 33 and 47 — writing
                    the lower number puts everyone on the boundary in the wrong band, silently.
                  </div>
                )}

                {stageMeta.key === 'PROFILE' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <b>More than one profile rule can fire for the same respondent.</b> Someone
                    scoring high on drive but low on both execution and tenacity matches “believes,
                    doesn’t act” <i>and</i> “starts, doesn’t finish”. If the template has one
                    profile placeholder, pick the winner explicitly with{' '}
                    <code>FIRST([rule:a], [rule:b], 'No distinctive profile')</code> — it answers
                    with the first rule that produced text, so <b>argument order is priority</b>.
                    Leave them separate only if the report is meant to show every match.
                  </div>
                )}

                {(byStage[stageMeta.key]?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No rules filed under this step yet.
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {byStage[stageMeta.key].map((rule) => {
                      const verdict = verdictBySlug[rule.slug];
                      return (
                        <div key={rule.reportRuleId} className="flex items-start gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">{rule.name}</span>
                              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                                {rule.slug}
                              </code>
                              <span className="text-[11px] text-muted-foreground">
                                v{rule.latestVersion}
                              </span>
                              {rule.latest?.population && (
                                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[11px] text-purple-800">
                                  cohort-relative
                                </span>
                              )}
                            </div>
                            {rule.latest?.definitionKind === 'EXPRESSION' ? (
                              <code className="mt-1 block truncate text-xs text-muted-foreground">
                                {rule.latest.expression}
                              </code>
                            ) : (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {rule.latest?.statementText}
                              </p>
                            )}
                            {!!rule.latest?.referencedRuleSlugs?.length && (
                              <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                reads
                                {rule.latest.referencedRuleSlugs.map((s) => (
                                  <code key={s} className="rounded bg-muted px-1 py-0.5">{s}</code>
                                ))}
                              </div>
                            )}
                            {verdict && verdict.verdict !== 'PORTABLE' && (
                              <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                <span>
                                  {verdict.missingKeys.length
                                    ? `Missing here: ${verdict.missingKeys.join(', ')}`
                                    : verdict.warnings.join(' ')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {/* One rule at a time, straight to the proposal.
                                A plain-language rule gets "Translate"; a
                                formula that came from sheet text gets
                                "Re-translate", which reads that text again
                                and writes a new version on accept. */}
                            {aiReady && rule.latest?.definitionKind === 'STATEMENT' && (
                              <Button variant="ghost" size="sm" mode="icon"
                                title="Write this rule's formula with AI"
                                onClick={() => setTranslating([rule.reportRuleId])}>
                                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                              </Button>
                            )}
                            {aiReady && rule.latest?.definitionKind === 'EXPRESSION'
                              && hasStatementHistory(rule) && (
                              <Button variant="ghost" size="sm" mode="icon"
                                title="Re-translate from the sheet text this formula came from"
                                onClick={() => setTranslating([rule.reportRuleId])}>
                                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" mode="icon"
                              title="Edit rule" onClick={() => openEdit(rule)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" mode="icon"
                              title="Delete rule"
                              onClick={() => { setDeleteError(''); setConfirmDelete(rule); }}>
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── adoption from the library ──────────────────────────────── */}
          {stageMeta && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">From the library</h3>
                  <p className="text-xs text-muted-foreground">
                    Rules written for other assessments. A rule travels when every column it
                    names exists here — including the columns of the rules it reads. Copying
                    one brings its dependencies with it and gives you your own version to
                    edit; the original is untouched.
                  </p>
                </div>
                {adoptable.filter((p) => p.stage === stageMeta.key).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nothing else in the library is filed under this step.
                  </p>
                ) : (
                  <div className="divide-y rounded-md border">
                    {adoptable
                      .filter((p) => p.stage === stageMeta.key)
                      .map((p) => (
                        <div key={p.reportRuleId} className="p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <VerdictBadge verdict={p.verdict} />
                            <span className="font-medium">{p.name}</span>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              {p.slug}
                            </code>
                            <button
                              type="button"
                              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-60"
                              onClick={() => adopt(p)}
                              disabled={adoptingId !== null || p.verdict === 'BLOCKED'}
                              title={p.verdict === 'BLOCKED'
                                ? 'This assessment does not score every column the rule reads'
                                : p.verdict === 'SHAPE_MISMATCH'
                                  ? 'Copies here — check the cut points afterwards, the ranges differ'
                                  : 'Copy this rule and what it reads onto this assessment'}
                            >
                              {adoptingId === p.reportRuleId
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Copy className="h-3.5 w-3.5" />}
                              Copy here
                            </button>
                          </div>
                          {!!p.dependencySlugs.length && (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              Adopting this also brings: {p.dependencySlugs.join(', ')}
                            </div>
                          )}
                          {p.missingKeys.map((k) => (
                            <div key={k} className="mt-1 text-[11px] text-red-700">
                              This assessment does not score <code>{k}</code>.
                            </div>
                          ))}
                          {p.warnings.map((w) => (
                            <div key={w} className="mt-1 text-[11px] text-amber-700">{w}</div>
                          ))}
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── dry run ────────────────────────────────────────────────── */}
          {(dryRun || runError) && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">What the rules compute</h3>
                    <p className="text-xs text-muted-foreground">
                      Evaluated here and now over {dryRun?.respondentCount ?? 0} completed
                      attempt{dryRun?.respondentCount === 1 ? '' : 's'}.{' '}
                      <b>This is not the delivery path</b> — real reports come from generated code
                      run in the sandbox. Use this to check the rules, never to sign them off.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" mode="icon"
                    title="Close" onClick={() => { setDryRun(null); setRunError(''); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {runError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {runError}
                  </div>
                )}
                {dryRun?.notes.map((n) => (
                  <div key={n} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {n}
                  </div>
                ))}

                {dryRun && (
                  <>
                    <div className="divide-y rounded-md border">
                      {dryRun.rules.map((o) => (
                        <div key={o.reportRuleId} className="p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusDot status={o.status} />
                            <span className="font-medium">{o.name}</span>
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              {o.slug}
                            </code>
                          </div>
                          {o.error && (
                            <div className="mt-1 text-xs text-red-700">{o.error}</div>
                          )}
                          {o.status === 'NEEDS_GENERATION' && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              A plain-language rule. Nothing here can compute it — it is realised
                              by generated code, which is not built yet.
                            </div>
                          )}
                          {o.status === 'TOO_SMALL' && (
                            <div className="mt-1 text-xs text-amber-700">
                              Cohort-relative, and too few respondents have completed for a
                              norm to mean anything. It computes nothing until the cohort is
                              large enough.
                            </div>
                          )}
                          {o.summary && (
                            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                              {o.summary.min !== null && (
                                <span>min {fmt(o.summary.min)} · max {fmt(o.summary.max)} · mean {fmt(o.summary.mean)}</span>
                              )}
                              {Object.entries(o.summary.bands).map(([band, n]) => (
                                <span key={band} className="rounded bg-muted px-1.5 py-0.5">
                                  {band}: {n}
                                </span>
                              ))}
                              {/* Never folded into zero: "no value" and "a score
                                  of zero" are different answers, and only one of
                                  them is a defect. */}
                              <span className={cn(o.summary.nulls > 0 && 'text-amber-700 font-medium')}>
                                {o.summary.nulls} without a value
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* One rule per column, so this table is as wide as the
                        workbook is long — it is MEANT to scroll. What it must
                        not do is scroll the page: the box is what moves, and
                        the respondent stays pinned so a value is never read
                        against the wrong person. */}
                    {dryRun.rows.length > 0 && (
                      <div className="max-h-[60vh] overflow-auto rounded-md border">
                        <table className="w-max min-w-full text-xs">
                          <thead className="sticky top-0 z-20 bg-background shadow-[inset_0_-1px_0_var(--color-border)]">
                            <tr>
                              <th className="sticky left-0 z-30 bg-background p-2 text-left font-medium shadow-[inset_-1px_0_0_var(--color-border)]">
                                Respondent
                              </th>
                              {dryRun.rules.map((o) => (
                                <th key={o.slug} className="p-2 text-left font-medium whitespace-nowrap">
                                  {o.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {dryRun.rows.map((row, i) => (
                              <tr key={i} className="bg-background">
                                <td className="sticky left-0 z-10 bg-background p-2 whitespace-nowrap shadow-[inset_-1px_0_0_var(--color-border)]">
                                  {row.label}
                                </td>
                                {dryRun.rules.map((o) => (
                                  <td key={o.slug} className="p-2 whitespace-nowrap">
                                    {row.values[o.slug] === null || row.values[o.slug] === undefined
                                      ? <span className="text-muted-foreground">—</span>
                                      : String(row.values[o.slug])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Outside the scroller on purpose: "you are not seeing
                        everyone" is the one line that must not scroll away. */}
                    {dryRun.rows.length > 0 && dryRun.respondentCount > dryRun.rowsReturned && (
                      <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                        Showing {dryRun.rowsReturned} of {dryRun.respondentCount}. The
                        summaries above cover every respondent.
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── the editor ───────────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
          <Card className="w-full max-w-3xl">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {form.id ? 'Edit rule' : 'New rule'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {RULE_STAGES.find((s) => s.key === form.stage)?.step} ·{' '}
                    {RULE_STAGES.find((s) => s.key === form.stage)?.label}
                    {form.id && ' · saving writes a new version; the old one stays readable'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" mode="icon" onClick={() => setForm(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium">Name</span>
                  <input
                    className={INPUT_CLASS}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Internal Drive"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Step</span>
                  <select
                    className={INPUT_CLASS}
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value as RuleStage })}
                  >
                    {RULE_STAGES.map((s) => (
                      <option key={s.key} value={s.key}>{s.step} — {s.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex gap-2">
                {(['EXPRESSION', 'STATEMENT'] as DefinitionKind[]).map((k) => (
                  <button
                    key={k}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs',
                      form.definitionKind === k
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'text-muted-foreground',
                    )}
                    onClick={() => setForm({ ...form, definitionKind: k })}
                  >
                    {k === 'EXPRESSION' ? 'Formula' : 'Plain language'}
                  </button>
                ))}
              </div>

              {form.definitionKind === 'EXPRESSION' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_260px]">
                  <div className="space-y-2">
                    <textarea
                      ref={expressionRef}
                      className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm"
                      rows={5}
                      value={form.expression}
                      onChange={(e) => setForm({ ...form, expression: e.target.value })}
                      placeholder="[mqt:14] + [mqt:15]"
                    />
                    {check && (
                      <div className={cn(
                        'rounded-md border p-2 text-xs',
                        !check.ok
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : (check.warnings ?? []).length > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-900'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800',
                      )}>
                        {!check.ok ? (
                          check.errors.join(' ')
                        ) : (check.warnings ?? []).length > 0 ? (
                          // Valid, and it cannot ever fire. Said plainly rather
                          // than as a tick with a footnote: "checks out" is what
                          // a reader takes away, and here it would be the wrong
                          // thing to take away.
                          <span className="inline-flex items-start gap-1">
                            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                            <span>{(check.warnings ?? []).join(' ')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Checks out — returns{' '}
                            {check.resultType}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Columns are inserted by click, never typed from memory —
                      MQT names are not unique, so the key is the only identity. */}
                  <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border p-2">
                    {byStage && (
                      <div>
                        <div className="text-[11px] font-medium text-muted-foreground">
                          Other rules
                        </div>
                        <p className="mb-1 text-[10px] text-muted-foreground">
                          This is how a step reads the step before it.
                        </p>
                        {rules
                          .filter((r) => r.assessmentId === assessmentId
                            && r.status === 'ACTIVE'
                            && r.reportRuleId !== form.id
                            && r.latest?.definitionKind === 'EXPRESSION')
                          .map((r) => (
                            <button
                              key={r.reportRuleId}
                              className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] hover:bg-muted"
                              // The slug, not the name, is what a formula reads,
                              // and the two differ often enough that guessing it
                              // from the name is how an author ends up with an
                              // unresolvable reference. Clicking inserts it;
                              // hovering shows it.
                              title={`[rule:${r.slug}]`}
                              onClick={() => insert(`[rule:${r.slug}]`)}
                            >
                              <Sigma className="mr-1 inline h-3 w-3" />{r.name}
                            </button>
                          ))}
                      </div>
                    )}
                    {groupedColumns.map((g) => (
                      <div key={g.key}>
                        <div className="text-[11px] font-medium text-muted-foreground">
                          {g.label}
                        </div>
                        {g.items.map((c) => (
                          <button
                            key={c.key}
                            className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] hover:bg-muted"
                            title={c.key}
                            onClick={() => insert(`[${c.key}]`)}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <textarea
                  className="w-full rounded-md border border-input bg-background p-3 text-sm"
                  rows={5}
                  value={form.statementText}
                  onChange={(e) => setForm({ ...form, statementText: e.target.value })}
                  placeholder="Write the rule exactly as the psychometrician stated it. It reaches the model unparaphrased."
                />
              )}

              <label className="space-y-1 block">
                <span className="text-xs font-medium">
                  Notes
                  {form.stage === 'BAND' && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      — for a band, record where these cut points came from and the n they were
                      derived from. In a year it is the only thing that makes them defensible.
                    </span>
                  )}
                </span>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-3 text-sm"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {form.id ? 'Save new version' : 'Create rule'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {importing && (
        <ReportRuleImport
          assessmentId={assessmentId}
          onClose={() => setImporting(false)}
          onImported={(count) => {
            setImporting(false);
            setError('');
            void reload();
            setNotice(`Imported ${count} rules. They are plain text until you write formulae.`);
          }}
        />
      )}

      {translating && (
        <ReportRuleTranslate
          assessmentId={assessmentId}
          rules={rules.filter((r) => r.assessmentId === assessmentId && r.status === 'ACTIVE')}
          columns={columns}
          initialRuleIds={translating}
          onClose={() => setTranslating(null)}
          onApplied={(count) => {
            setTranslating(null);
            setError('');
            void reload();
            setNotice(`${count} rules are now formulae. Run them over respondents to check.`);
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <Card className="w-full max-w-md">
            <CardContent className="p-5 space-y-3">
              <h2 className="text-lg font-semibold">Delete “{confirmDelete.name}”?</h2>
              <p className="text-sm text-muted-foreground">
                Refused if any computation pins a version of it — those versions have to stay
                readable to explain reports already issued.
              </p>
              {deleteError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {deleteError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                <Button variant="destructive" onClick={doDelete}>Delete</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

const fmt = (v: number | null) =>
  v === null ? '—' : (Number.isInteger(v) ? String(v) : v.toFixed(2));

function RailItem({ meta, active, onClick }: {
  meta: { step: string; label: string }; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
        active ? 'bg-muted font-medium' : 'hover:bg-muted/50',
      )}
    >
      <CircleDashed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-[11px] text-muted-foreground">{meta.step}</span>
        <span className="block truncate">{meta.label}</span>
      </span>
    </button>
  );
}

function RailRule({ stage, count, active, onClick }: {
  stage: { key: string; step: string; label: string };
  count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm',
        active ? 'bg-muted font-medium' : 'hover:bg-muted/50',
      )}
    >
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-[11px] text-muted-foreground">{stage.step}</span>
        <span className="block truncate">{stage.label}</span>
      </span>
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {count}
      </span>
    </button>
  );
}

function VerdictBadge({ verdict }: { verdict: RulePortability['verdict'] }) {
  const map = {
    PORTABLE: ['Fits here', 'bg-emerald-100 text-emerald-800'],
    BLOCKED: ['Cannot run here', 'bg-red-100 text-red-800'],
    SHAPE_MISMATCH: ['Different range here', 'bg-amber-100 text-amber-900'],
  } as const;
  const [label, cls] = map[verdict];
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px]', cls)}>{label}</span>;
}

export function StatusDot({ status }: {
  status: 'EVALUATED' | 'NEEDS_GENERATION' | 'ERROR' | 'TOO_SMALL';
}) {
  if (status === 'EVALUATED') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === 'ERROR') return <AlertTriangle className="h-3.5 w-3.5 text-red-600" />;
  if (status === 'TOO_SMALL') return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
  return <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />;
}

export const fmtNumber = (v: number | null) =>
  v === null ? '—' : (Number.isInteger(v) ? String(v) : v.toFixed(2));
