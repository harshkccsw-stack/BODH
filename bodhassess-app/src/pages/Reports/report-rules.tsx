import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sigma,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reportApis, type AssessmentOption } from './reportApis';
import {
  COLUMN_GROUPS,
  reportRulesApi,
  type DefinitionKind,
  type ExprCheck,
  type ReportColumn,
  type ReportRuleResponse,
  type RuleResultType,
} from './reportRulesApi';

const errorText = (e: any, fallback: string) =>
  e?.response?.data?.message || e?.message || fallback;

const INPUT_CLASS =
  'w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 transition-shadow';

interface RuleForm {
  id: number | null;
  name: string;
  description: string;
  definitionKind: DefinitionKind;
  expression: string;
  statementText: string;
  resultType: RuleResultType;
  assessmentId: number | null;
  notes: string;
}

const emptyForm = (): RuleForm => ({
  id: null,
  name: '',
  description: '',
  definitionKind: 'EXPRESSION',
  expression: '',
  statementText: '',
  resultType: 'NUMBER',
  assessmentId: null,
  notes: '',
});

export default function ReportRulesPage() {
  const [rules, setRules] = useState<ReportRuleResponse[]>([]);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState<RuleForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // The live, per-assessment column list. Reloaded whenever the assessment
  // changes — never cached across assessments.
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnSearch, setColumnSearch] = useState('');

  const [check, setCheck] = useState<ExprCheck | null>(null);
  const exprRef = useRef<HTMLTextAreaElement | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<ReportRuleResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, assessmentPage] = await Promise.all([
        reportRulesApi.getAll(),
        reportApis.getAssessments({ page: 0, size: 100 }),
      ]);
      setRules(list);
      setAssessments(assessmentPage.data.items ?? []);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(errorText(e, 'Could not load the rules library'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── the live column list ────────────────────────────────────────────────
  // Different assessments expose different MQ/MQT sets, so this is fetched per
  // assessment and cleared the moment the choice changes. A list held over from
  // another assessment is exactly how a rule ends up valid-looking and wrong.
  useEffect(() => {
    const assessmentId = form?.assessmentId ?? null;
    if (!assessmentId) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    setColumnsLoading(true);
    setColumns([]);
    reportRulesApi
      .columns(assessmentId)
      .then((cols) => {
        if (!cancelled) setColumns(cols);
      })
      .catch((e: any) => {
        if (!cancelled) setFormError(errorText(e, 'Could not load this assessment’s columns'));
      })
      .finally(() => {
        if (!cancelled) setColumnsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form?.assessmentId]);

  // Live formula checking, debounced.
  useEffect(() => {
    if (!form || form.definitionKind !== 'EXPRESSION' || !form.expression.trim()) {
      setCheck(null);
      return;
    }
    const handle = window.setTimeout(() => {
      reportRulesApi
        .validateExpression(form.expression, form.assessmentId)
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [form?.expression, form?.definitionKind, form?.assessmentId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q),
    );
  }, [rules, search]);

  const groupedColumns = useMemo(() => {
    const q = columnSearch.trim().toLowerCase();
    const matching = q
      ? columns.filter(
          (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
        )
      : columns;
    return COLUMN_GROUPS.map((g) => ({
      ...g,
      columns: matching.filter((c) => c.group === g.key),
    })).filter((g) => g.columns.length > 0);
  }, [columns, columnSearch]);

  const openCreate = () => {
    setFormError(null);
    setCheck(null);
    setColumnSearch('');
    setForm(emptyForm());
  };

  const openEdit = (rule: ReportRuleResponse) => {
    setFormError(null);
    setCheck(null);
    setColumnSearch('');
    const latest = rule.latest;
    setForm({
      id: rule.reportRuleId,
      name: rule.name,
      description: rule.description ?? '',
      definitionKind: latest?.definitionKind ?? 'EXPRESSION',
      expression: latest?.expression ?? '',
      statementText: latest?.statementText ?? '',
      resultType: (latest?.resultType as RuleResultType) ?? 'NUMBER',
      assessmentId: latest?.validatedAssessmentId ?? rule.assessmentId ?? null,
      notes: latest?.notes ?? '',
    });
  };

  /** Insert a column key at the cursor, so nobody types an identifier by hand. */
  const insertColumn = (key: string) => {
    if (!form) return;
    const token = `[${key}]`;
    const el = exprRef.current;
    if (!el) {
      setForm({ ...form, expression: form.expression + token });
      return;
    }
    const start = el.selectionStart ?? form.expression.length;
    const end = el.selectionEnd ?? start;
    const next = form.expression.slice(0, start) + token + form.expression.slice(end);
    setForm({ ...form, expression: next });
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = async () => {
    if (!form) return;
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        definitionKind: form.definitionKind,
        expression: form.definitionKind === 'EXPRESSION' ? form.expression : null,
        statementText: form.definitionKind === 'STATEMENT' ? form.statementText : null,
        resultType: form.resultType,
        assessmentId: form.assessmentId,
        notes: form.notes.trim() || null,
      };
      const saved = form.id
        ? await reportRulesApi.update(form.id, payload)
        : await reportRulesApi.create(payload);
      setRules((prev) =>
        form.id
          ? prev.map((r) => (r.reportRuleId === saved.reportRuleId ? saved : r))
          : [saved, ...prev],
      );
      setForm(null);
    } catch (e: any) {
      setFormError(errorText(e, 'Could not save this rule'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      await reportRulesApi.delete(confirmDelete.reportRuleId);
      setRules((prev) => prev.filter((r) => r.reportRuleId !== confirmDelete.reportRuleId));
      setConfirmDelete(null);
    } catch (e: any) {
      setDeleteError(errorText(e, 'Could not delete this rule'));
    }
  };

  const formulaRules = rules.filter((r) => r.latest?.definitionKind === 'EXPRESSION').length;
  const cohortRules = rules.filter((r) => r.latest?.population).length;

  const canSave =
    !!form &&
    form.name.trim() !== '' &&
    (form.definitionKind === 'STATEMENT'
      ? form.statementText.trim() !== ''
      : form.expression.trim() !== '' && form.assessmentId !== null && check?.ok === true);

  return (
    <div className="p-5 lg:p-7.5 space-y-7">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span>BodhAssess</span><span>/</span><span>Reports</span><span>/</span>
          <span className="text-foreground font-medium">Report Rules</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Sigma className="h-6 w-6 text-primary" />
              Report Rules
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Named, reusable scoring and interpretation logic. Write a rule once
              here — as a formula over real MQ/MQT scores, or in plain language —
              and reference it by name from any report computation.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Rule
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Rules</p><p className="text-2xl font-semibold mt-1">{rules.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Formulas</p><p className="text-2xl font-semibold mt-1">{formulaRules}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Compare to cohort</p><p className="text-2xl font-semibold mt-1">{cohortRules}</p></CardContent></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search rules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(INPUT_CLASS, 'pl-9')}
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-14 flex flex-col items-center justify-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground mt-3">Loading rules…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-14 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Sigma className="h-7 w-7 text-muted-foreground/60" />
            </div>
            <p className="text-base font-semibold">
              {rules.length === 0 ? 'No rules yet' : 'No matches'}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              {rules.length === 0
                ? 'A rule is one named piece of scoring or interpretation logic — “Extraversion composite”, “Risk caveat”.'
                : 'Try a different search term.'}
            </p>
            {rules.length === 0 && (
              <Button variant="primary" onClick={openCreate} className="mt-4">
                <Plus className="h-4 w-4" /> Write your first rule
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {filtered.map((r) => (
              <div
                key={r.reportRuleId}
                className="group flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors cursor-pointer"
                onClick={() => openEdit(r)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{r.name}</p>
                    <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {r.slug}
                    </code>
                    <span className="text-[11px] text-muted-foreground">v{r.latestVersion}</span>
                    {r.latest?.definitionKind === 'STATEMENT' ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400 flex items-center gap-1">
                        <FileText className="h-3 w-3" /> plain language
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 flex items-center gap-1">
                        <Calculator className="h-3 w-3" /> formula
                      </span>
                    )}
                    {r.latest?.population && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 flex items-center gap-1">
                        <Users className="h-3 w-3" /> cohort
                      </span>
                    )}
                  </div>
                  {r.latest?.definitionKind === 'EXPRESSION' ? (
                    <code className="text-xs text-muted-foreground font-mono block truncate mt-1">
                      {r.latest.expression}
                    </code>
                  ) : (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {r.latest?.statementText}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    onClick={(e) => { e.stopPropagation(); openEdit(r); }}
                    aria-label={`Edit ${r.name}`}
                    title={`Edit — saves as version ${r.latestVersion + 1}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-muted-foreground hover:text-red-600"
                    onClick={(e) => { e.stopPropagation(); setDeleteError(null); setConfirmDelete(r); }}
                    aria-label={`Delete ${r.name}`}
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

      {/* ── editor ─────────────────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-5xl my-6">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">
                {form.id ? 'Edit rule' : 'New rule'}
              </h2>
              <button
                type="button"
                className="p-2 rounded-md hover:bg-muted text-muted-foreground"
                onClick={() => setForm(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {form.id && (
              <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                Saving creates version {(rules.find((r) => r.reportRuleId === form.id)?.latestVersion ?? 0) + 1}.
                Earlier versions stay readable, so reports already built on them keep meaning what they said.
              </div>
            )}

            {formError && (
              <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {formError}
              </div>
            )}

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Name</label>
                  <input
                    className={INPUT_CLASS}
                    placeholder="Extraversion composite"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">What it produces</label>
                  <select
                    className={INPUT_CLASS}
                    value={form.resultType}
                    onChange={(e) => setForm({ ...form, resultType: e.target.value as RuleResultType })}
                  >
                    <option value="NUMBER">A number</option>
                    <option value="TERM">A band or label</option>
                    <option value="TEXT">A paragraph of text</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <input
                  className={INPUT_CLASS}
                  placeholder="What this rule measures, for the library"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">How is it defined?</label>
                <div className="flex gap-2">
                  {(['EXPRESSION', 'STATEMENT'] as DefinitionKind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setForm({ ...form, definitionKind: k })}
                      className={cn(
                        'flex-1 rounded-md border px-4 py-3 text-left transition-colors',
                        form.definitionKind === k
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:bg-muted/50',
                      )}
                    >
                      <span className="flex items-center gap-2 font-medium text-sm">
                        {k === 'EXPRESSION' ? <Calculator className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                        {k === 'EXPRESSION' ? 'A formula' : 'Plain language'}
                      </span>
                      <span className="text-xs text-muted-foreground mt-1 block">
                        {k === 'EXPRESSION'
                          ? 'Maths over real MQ/MQT scores, checked as you type'
                          : 'For the rules that are not pure maths'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {form.definitionKind === 'EXPRESSION' ? (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Which assessment is this written against?
                    </label>
                    <select
                      className={INPUT_CLASS}
                      value={form.assessmentId ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, assessmentId: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value="">Choose an assessment…</option>
                      {assessments.map((a) => (
                        <option key={a.assessmentId} value={a.assessmentId}>{a.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Different assessments score different MQ/MQTs. The formula is checked
                      against this one’s actual columns, so it cannot reference something
                      that does not exist.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Formula</label>
                      <textarea
                        ref={exprRef}
                        className="w-full h-32 rounded-md border border-input bg-background p-3 font-mono text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                        placeholder="ROUND(([mqt:14] + [mqt:15]) / 2 * 20, 1)"
                        value={form.expression}
                        onChange={(e) => setForm({ ...form, expression: e.target.value })}
                        spellCheck={false}
                      />
                      {check && (
                        <div
                          className={cn(
                            'mt-2 rounded-md border px-3 py-2 text-xs',
                            check.ok
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400',
                          )}
                        >
                          {check.ok ? (
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Valid — reads {check.referencedColumns.length} column
                              {check.referencedColumns.length === 1 ? '' : 's'}
                              {check.evalTarget === 'SERVER' && ', and compares against the whole cohort'}
                            </span>
                          ) : (
                            <ul className="space-y-1">
                              {check.errors.map((err, i) => (
                                <li key={i} className="flex gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                  {err}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-1.5 block">
                        Available columns {columns.length > 0 && `(${columns.length})`}
                      </label>
                      {!form.assessmentId ? (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          Choose an assessment to see the MQ/MQT columns it scores.
                        </div>
                      ) : columnsLoading ? (
                        <div className="rounded-md border p-6 flex justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : columns.length === 0 ? (
                        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                          This assessment exposes no columns — nothing has been placed in its
                          questionnaire yet.
                        </div>
                      ) : (
                        <>
                          <input
                            className={cn(INPUT_CLASS, 'mb-2')}
                            placeholder="Filter columns…"
                            value={columnSearch}
                            onChange={(e) => setColumnSearch(e.target.value)}
                          />
                          <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                            {groupedColumns.map((g) => (
                              <div key={g.key} className="p-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-1 pb-1">
                                  {g.label}
                                </p>
                                {g.columns.map((c) => (
                                  <button
                                    key={c.key}
                                    type="button"
                                    onClick={() => insertColumn(c.key)}
                                    className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-sm flex items-baseline gap-2"
                                  >
                                    <span className="truncate flex-1">{c.label}</span>
                                    <code className="text-[11px] font-mono text-muted-foreground shrink-0">
                                      {c.key}
                                    </code>
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            Click a column to insert it — no need to remember identifiers.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="text-sm font-medium mb-1.5 block">The rule, in your own words</label>
                  <textarea
                    className="w-full h-40 rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                    placeholder={'If the Extraversion composite is 70 or above, describe the respondent as preferring group settings…'}
                    value={form.statementText}
                    onChange={(e) => setForm({ ...form, statementText: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Write every condition and every text variant out in full. This reaches the
                    model exactly as you type it — nothing paraphrases it.
                  </p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-1.5 block">Notes (optional)</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/30"
                  rows={2}
                  placeholder="Anything a colleague should know — rounding, edge cases, where it came from"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={!canSave || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {form.id ? 'Save new version' : 'Create rule'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── delete confirm ─────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Delete this rule?</h2>
            <p className="text-sm text-muted-foreground mt-2">
              “{confirmDelete.name}” and all {confirmDelete.versions.length} of its versions
              will be removed. This cannot be undone.
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
