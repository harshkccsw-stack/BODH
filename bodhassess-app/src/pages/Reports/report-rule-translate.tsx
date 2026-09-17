import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  MessageSquareReply,
  Sparkles,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  COLUMN_GROUPS,
  hasStatementHistory,
  reportRulesApi,
  type DraftExpression,
  type DryRunResult,
  type ExprCheck,
  type ReportColumn,
  type ReportRuleResponse,
  type TranslationProposal,
  type TranslationResult,
} from './reportRulesApi';

/**
 * Turn imported plain-language rules into formulae, with a human deciding.
 *
 * Nothing here saves on the model's say-so. Every proposal has already failed
 * or passed the SAME validator the save path runs, so the green tick is the
 * parser's verdict and not the model's opinion of its own work — and accepting
 * one is an ordinary rule update, which checks it again.
 *
 * The source text sits beside every proposal because that is the only thing a
 * reviewer can actually check a formula against. A proposal that parses and
 * means the wrong thing is the failure this screen exists to catch; one that
 * does not parse was already caught before it got here.
 *
 * Three things a reviewer can do with a wrong proposal, in the order they pay
 * back:
 *
 * 1. EDIT it. The formula box is live: the same validator the Rules editor
 *    uses runs as you type, and other proposals in the batch count as formulae
 *    (`pendingExpressionSlugs`), so a composite may read a factor score before
 *    either is saved. Accept saves what is in the box, not what the model said.
 * 2. RE-ASK with a hint. One rule, the reviewer's own words — "the composite is
 *    [rule:ad-composite], not [mq:7]" — and the batch's other drafts sent as
 *    context so the vocabulary stays whole. The model sees its previous
 *    attempt and is told to change only what was named.
 * 3. TRY it on respondents. The drafts run over the real cohort without being
 *    saved; the histogram is what shows a band cut written backwards, and a
 *    range that does not match the sheet's stated 4–20 is what shows the
 *    wrong column.
 */

/** A proposal as the reviewer is holding it: the model's answer plus their edits. */
interface Draft {
  ruleId: number;
  slug: string;
  name: string;
  sourceText: string;
  /** Whether this rule is already a formula and is being re-translated. */
  retranslation: boolean;
  /** What the reviewer has in the box — starts as the model's expression. */
  expression: string;
  /** The model's own words about this proposal. */
  note: string | null;
  confident: boolean;
  /** The validator's verdict on what is in the box now. Null = not checked yet. */
  check: ExprCheck | null;
  checking: boolean;
  /** The reviewer's line for a re-ask. */
  hint: string;
  /** Hints that were actually SENT, kept for the notes on accept. */
  hintsUsed: string[];
  reasking: boolean;
  reaskError: string;
}

const proposalToDraft = (
  p: TranslationProposal,
  rule: ReportRuleResponse | undefined,
  previous?: Draft,
): Draft => ({
  ruleId: p.reportRuleId,
  slug: rule?.slug ?? String(p.reportRuleId),
  name: p.name,
  sourceText: p.sourceText,
  retranslation: rule?.latest?.definitionKind === 'EXPRESSION',
  expression: p.expression ?? '',
  note: p.note,
  confident: p.confident,
  // The validator already ran on the server; carry its verdict so the card
  // does not flash "unchecked" before the live check catches up.
  check: {
    ok: p.ok,
    evalTarget: 'SERVER',
    resultType: p.resultType,
    errors: p.errors ?? [],
    referencedColumns: [],
    functions: [],
    warnings: p.warnings ?? [],
  },
  checking: false,
  hint: '',
  hintsUsed: previous?.hintsUsed ?? [],
  reasking: false,
  reaskError: '',
});

export function ReportRuleTranslate({
  assessmentId,
  organizationId,
  rules,
  columns,
  initialRuleIds,
  onClose,
  onApplied,
}: {
  assessmentId: number;
  organizationId?: number | null;
  rules: ReportRuleResponse[];
  /** The assessment's columns, for the insert rail. */
  columns: ReportColumn[];
  /**
   * Empty: the batch screen, pick from every candidate. One or more ids: skip
   * the picker and translate exactly those — the per-rule button.
   */
  initialRuleIds: number[];
  onClose: () => void;
  onApplied: (count: number) => void;
}) {
  /**
   * What can be translated: plain-language rules, and formulae that came from
   * sheet text (some version carries a statement). The second kind is a
   * RE-translation, which writes a new version on accept.
   */
  const candidates = useMemo(
    () => rules.filter((r) =>
      r.latest?.definitionKind === 'STATEMENT' || hasStatementHistory(r)),
    [rules],
  );
  const ruleById = useMemo(() => {
    const out = new Map<number, ReportRuleResponse>();
    rules.forEach((r) => out.set(r.reportRuleId, r));
    return out;
  }, [rules]);

  const [chosen, setChosen] = useState<Set<number>>(() => new Set(
    initialRuleIds.length
      ? initialRuleIds
      : candidates.filter((r) => r.latest?.definitionKind === 'STATEMENT')
        .map((r) => r.reportRuleId),
  ));
  const [model, setModel] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [trial, setTrial] = useState<DryRunResult | null>(null);
  const [trying, setTrying] = useState(false);
  const [trialError, setTrialError] = useState('');

  const toggle = (id: number, into: Set<number>, set: (s: Set<number>) => void) => {
    const next = new Set(into);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set(next);
  };

  /** Pre-tick only what validated AND the model was sure of. */
  const defaultTicks = (list: Draft[]) => new Set(
    list
      .filter((d) => d.check?.ok && d.confident && (d.check?.warnings ?? []).length === 0)
      .map((d) => d.ruleId),
  );

  const translate = useCallback(async (ids: number[]) => {
    setError('');
    setBusy(true);
    try {
      const r: TranslationResult = await reportRulesApi.aiTranslate(
        assessmentId, ids, organizationId);
      setModel(r.model);
      const list = r.proposals.map((p) => proposalToDraft(p, ruleById.get(p.reportRuleId)));
      setDrafts(list);
      setAccepted(defaultTicks(list));
      setTrial(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not translate those rules.');
    } finally {
      setBusy(false);
    }
  }, [assessmentId, organizationId, ruleById]);

  // The per-rule button skips the picker: there is exactly one thing to ask.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (initialRuleIds.length && !autoStarted.current) {
      autoStarted.current = true;
      void translate(initialRuleIds);
    }
  }, [initialRuleIds, translate]);

  /** The batch's current formulae, by slug — what a validation or a re-ask may read. */
  const contextOf = (list: Draft[], except?: number): DraftExpression[] =>
    list
      .filter((d) => d.ruleId !== except && d.expression.trim() !== '')
      .map((d) => ({ slug: d.slug, expression: d.expression }));

  const patch = (ruleId: number, change: Partial<Draft>) =>
    setDrafts((list) => list?.map((d) => (d.ruleId === ruleId ? { ...d, ...change } : d)) ?? list);

  /**
   * Live validation of an edited box, debounced. The other proposals' slugs
   * ride along as pending formulae so a composite that reads a factor score
   * checks out before either is saved — the save order handles the rest.
   */
  const edit = (ruleId: number, expression: string) => {
    patch(ruleId, { expression, checking: true });
    // Editing changes what the histogram would say, so it no longer says it.
    setTrial(null);
  };
  const editedKey = drafts?.map((d) => `${d.ruleId}:${d.expression}`).join('|') ?? '';
  useEffect(() => {
    if (!drafts) return;
    const pending = drafts.filter((d) => d.checking);
    if (!pending.length) return;
    const handle = window.setTimeout(() => {
      pending.forEach((d) => {
        if (!d.expression.trim()) {
          patch(d.ruleId, { checking: false, check: null });
          return;
        }
        reportRulesApi
          .validateExpression(
            d.expression, assessmentId, organizationId, d.ruleId,
            contextOf(drafts, d.ruleId).map((c) => c.slug))
          .then((check) => patch(d.ruleId, { check, checking: false }))
          .catch(() => patch(d.ruleId, { check: null, checking: false }));
      });
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedKey]);

  /**
   * Re-ask ONE rule with the reviewer's words. The rest of the batch goes as
   * context so the model references the drafts rather than rebuilding them,
   * and the answer replaces only this card.
   */
  const reask = async (d: Draft) => {
    if (!drafts) return;
    patch(d.ruleId, { reasking: true, reaskError: '' });
    try {
      const hint = d.hint.trim();
      const r = await reportRulesApi.aiTranslate(
        assessmentId, [d.ruleId], organizationId,
        hint ? { [d.ruleId]: hint } : undefined,
        contextOf(drafts, d.ruleId));
      setModel(r.model);
      const p = r.proposals.find((x) => x.reportRuleId === d.ruleId);
      if (!p) throw new Error('The model answered nothing for this rule.');
      const next = proposalToDraft(p, ruleById.get(d.ruleId), d);
      next.hintsUsed = hint ? [...d.hintsUsed, hint] : d.hintsUsed;
      setDrafts((list) => list?.map((x) => (x.ruleId === d.ruleId ? next : x)) ?? list);
      setAccepted((set) => {
        const out = new Set(set);
        if (next.check?.ok && next.confident && !(next.check?.warnings ?? []).length) out.add(d.ruleId);
        else out.delete(d.ruleId);
        return out;
      });
      setTrial(null);
    } catch (e: any) {
      patch(d.ruleId, {
        reasking: false,
        reaskError: e?.response?.data?.message || e?.message || 'The re-ask failed.',
      });
    }
  };

  /**
   * Run every draft over the real cohort, saving nothing. One call for the
   * batch, because drafts read each other: a band evaluated without the
   * composite it cuts has no value at all.
   */
  const tryOnRespondents = async () => {
    if (!drafts) return;
    const list = contextOf(drafts);
    if (!list.length) return;
    setTrying(true);
    setTrialError('');
    try {
      setTrial(await reportRulesApi.evaluateDraft({
        assessmentId, organizationId, drafts: list, rowLimit: 8,
      }));
    } catch (e: any) {
      setTrialError(e?.response?.data?.message || e?.message || 'Could not run the drafts.');
    } finally {
      setTrying(false);
    }
  };
  const trialBySlug = useMemo(() => {
    const out = new Map<string, DryRunResult['rules'][number]>();
    trial?.rules.forEach((o) => out.set(o.slug, o));
    return out;
  }, [trial]);

  /**
   * Save the accepted drafts, in the order the steps run.
   *
   * Order matters and is not cosmetic: a composite score can only be saved once
   * the factor scores it reads are formulae themselves. Saving out of order
   * would refuse perfectly good rules for depending on plain language.
   */
  async function apply() {
    if (!drafts) return;
    setError('');
    setBusy(true);
    const ordered = drafts
      .filter((d) => accepted.has(d.ruleId) && d.check?.ok && d.expression.trim())
      .sort((a, b) => stepOf(a.ruleId) - stepOf(b.ruleId));

    let done = 0;
    try {
      for (const d of ordered) {
        const rule = ruleById.get(d.ruleId);
        if (!rule) continue;
        // Provenance, in order: sheet said, model proposed, reviewer said. Once
        // this is a formula the statement text is gone from the latest
        // version, and the notes are the only record of what was asked for —
        // and the thing to re-translate from if the formula is wrong.
        const provenance = [
          `Translated from: ${d.sourceText}`,
          `Model: ${model}`,
          ...d.hintsUsed.map((h) => `Reviewer said: ${h}`),
        ].join('\n');
        const previousNotes = (rule.latest?.notes ?? '')
          .split('\n')
          .filter((line) => !/^(Translated from|Model|Reviewer said):/.test(line))
          .join('\n')
          .trim();
        await reportRulesApi.update(d.ruleId, {
          name: rule.name,
          definitionKind: 'EXPRESSION',
          expression: d.expression.trim(),
          statementText: null,
          assessmentId,
          organizationId,
          stage: rule.stage,
          stepOrder: rule.stepOrder,
          notes: `${previousNotes}\n\n${provenance}`.trim(),
        });
        done += 1;
      }
      onApplied(done);
    } catch (e: any) {
      setError(
        `${done} of ${ordered.length} saved, then: ` +
        (e?.response?.data?.message || e?.message || 'the save was refused.'),
      );
    } finally {
      setBusy(false);
    }
  }

  const stepOf = (ruleId: number) => ruleById.get(ruleId)?.stepOrder ?? 0;

  const acceptable = drafts?.filter((d) => d.check?.ok && d.expression.trim()).length ?? 0;
  const single = initialRuleIds.length === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <Card className="w-full max-w-5xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {single ? 'Write this formula with AI' : 'Write formulae with AI'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Proposals only. Every one is checked by the same validator that saving uses, and
                nothing is written until you accept it. Edit a formula, re-ask with a hint, or
                try it on real respondents first.
              </p>
            </div>
            <Button variant="ghost" size="sm" mode="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* ── step 1: choose ────────────────────────────────────────── */}
          {!drafts && !busy && !single && (
            <>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every rule on this assessment is already a formula, and none came from sheet
                  text. Import a workbook to add plain-language rules.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Send them together where they reference each other — a composite score means
                    nothing without the factor scores it adds up. Formulae that came from sheet
                    text are listed too; ticking one re-translates it from that text.
                  </p>
                  <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                    {candidates.map((r) => {
                      const formula = r.latest?.definitionKind === 'EXPRESSION';
                      const text = formula
                        ? [...(r.versions ?? [])].reverse()
                            .find((v) => v.statementText?.trim())?.statementText
                        : r.latest?.statementText;
                      return (
                        <label
                          key={r.reportRuleId}
                          className="flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={chosen.has(r.reportRuleId)}
                            onChange={() => toggle(r.reportRuleId, chosen, setChosen)}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {r.name}
                              {formula && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                                  re-translate
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{text}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {busy && !drafts && (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Asking the model…
            </div>
          )}

          {/* ── step 2: review ────────────────────────────────────────── */}
          {drafts && (
            <>
              <p className="text-xs text-muted-foreground">
                Answered by <b>{model}</b>. A tick means the formula <i>parses and every name in
                it resolves</i> — it does not mean the formula is right. Read it against the
                original. An amber card is a formula that is valid and cannot ever fire.
              </p>

              {trialError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {trialError}
                </div>
              )}
              {trial && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
                  Tried over {trial.respondentCount} completed respondent
                  {trial.respondentCount === 1 ? '' : 's'}, nothing saved. Each card below shows
                  what its formula computed.
                  {trial.notes.map((n) => <span key={n} className="block">{n}</span>)}
                </div>
              )}

              <div className="max-h-[32rem] space-y-2 overflow-y-auto">
                {drafts.map((d) => (
                  <DraftCard
                    key={d.ruleId}
                    draft={d}
                    ticked={accepted.has(d.ruleId)}
                    onTick={() => toggle(d.ruleId, accepted, setAccepted)}
                    onEdit={(v) => edit(d.ruleId, v)}
                    onHint={(v) => patch(d.ruleId, { hint: v })}
                    onReask={() => void reask(d)}
                    columns={columns}
                    others={drafts.filter((x) => x.ruleId !== d.ruleId)}
                    savedFormulae={rules.filter((r) =>
                      r.latest?.definitionKind === 'EXPRESSION'
                      && !drafts.some((x) => x.ruleId === r.reportRuleId))}
                    outcome={trialBySlug.get(d.slug) ?? null}
                    rows={trial?.rows ?? []}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {drafts && (
              <span className="mr-auto text-sm text-muted-foreground">
                {acceptable} of {drafts.length} validated · {accepted.size} ticked
              </span>
            )}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {!drafts ? (
              !single && (
                <Button onClick={() => void translate([...chosen])} disabled={busy || chosen.size === 0}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Translate {chosen.size} rule{chosen.size === 1 ? '' : 's'}
                </Button>
              )
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={tryOnRespondents}
                  disabled={trying || busy || acceptable === 0}
                  title="Run every draft over the real cohort without saving anything"
                >
                  {trying ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  Try on respondents
                </Button>
                <Button onClick={apply} disabled={busy || accepted.size === 0}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Accept {accepted.size}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** One proposal: the sheet text, the editable formula, the verdict, and the three buttons. */
function DraftCard({
  draft: d,
  ticked,
  onTick,
  onEdit,
  onHint,
  onReask,
  columns,
  others,
  savedFormulae,
  outcome,
  rows,
}: {
  draft: Draft;
  ticked: boolean;
  onTick: () => void;
  onEdit: (expression: string) => void;
  onHint: (hint: string) => void;
  onReask: () => void;
  columns: ReportColumn[];
  others: Draft[];
  savedFormulae: ReportRuleResponse[];
  outcome: DryRunResult['rules'][number] | null;
  rows: DryRunResult['rows'];
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [asking, setAsking] = useState(false);
  const ok = !!d.check?.ok && d.expression.trim() !== '';
  const warnings = d.check?.warnings ?? [];

  /** Insert at the caret, so nobody types an identifier from memory. */
  const insert = (token: string) => {
    const el = ref.current;
    const at = el ? el.selectionStart : d.expression.length;
    onEdit(d.expression.slice(0, at) + token + d.expression.slice(at));
    window.requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = at + token.length;
      }
    });
  };

  return (
    <div
      className={cn(
        'rounded-md border p-3',
        !d.expression.trim() || !d.check
          ? 'border-border'
          : !ok
            ? 'border-red-200 bg-red-50/40'
            : warnings.length > 0
              ? 'border-amber-300 bg-amber-50/50'
              : 'border-green-200 bg-green-50/40',
      )}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          disabled={!ok}
          checked={ticked}
          onChange={onTick}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{d.name}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{d.slug}</code>
            {d.retranslation && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                re-translation
              </span>
            )}
            {d.checking ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : !d.expression.trim() ? null : !ok ? (
              <AlertTriangle className="h-4 w-4 text-red-600" />
            ) : warnings.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            )}
            {ok && warnings.length > 0 && (
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                never fires
              </span>
            )}
            {ok && !d.confident && warnings.length === 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                check this one
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            <b>Sheet said:</b> {d.sourceText}
          </p>

          {/* The formula, editable. What is saved is what is in this box. */}
          <div className="flex flex-wrap items-start gap-2">
            <textarea
              ref={ref}
              className="min-w-0 flex-1 rounded-md border border-input bg-background p-2 font-mono text-xs"
              rows={2}
              value={d.expression}
              onChange={(e) => onEdit(e.target.value)}
              placeholder="No formula proposed — write one, or re-ask with a hint."
              aria-label={`Formula for ${d.name}`}
            />
            <select
              className="h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-xs"
              value=""
              onChange={(e) => { if (e.target.value) insert(e.target.value); }}
              aria-label="Insert a column or rule"
              title="Insert a column or another rule at the cursor"
            >
              <option value="">Insert…</option>
              {(others.length > 0 || savedFormulae.length > 0) && (
                <optgroup label="Other rules">
                  {others.map((o) => (
                    <option key={o.slug} value={`[rule:${o.slug}]`}>{o.name} (draft)</option>
                  ))}
                  {savedFormulae.map((r) => (
                    <option key={r.slug} value={`[rule:${r.slug}]`}>{r.name}</option>
                  ))}
                </optgroup>
              )}
              {COLUMN_GROUPS.map((g) => {
                const items = columns.filter((c) => c.group === g.key);
                if (!items.length) return null;
                return (
                  <optgroup key={g.key} label={g.label}>
                    {items.map((c) => (
                      <option key={c.key} value={`[${c.key}]`}>{c.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {d.note && (
            <p className="text-xs text-blue-900">
              <b>Model’s note:</b> {d.note}
            </p>
          )}
          {ok && d.check?.resultType && warnings.length === 0 && (
            <p className="text-[11px] text-emerald-800">
              Checks out — returns {d.check.resultType}.
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs font-medium text-amber-900">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
          {!ok && d.expression.trim() && d.check && d.check.errors.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700">
              {d.check.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {d.hintsUsed.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Re-asked with: {d.hintsUsed.map((h) => `“${h}”`).join(' · ')}
            </p>
          )}

          {/* What it computes, once tried. The histogram is the check the
              formula cannot give you: a band cut written backwards is
              invisible in the text and obvious here. */}
          {outcome && (
            <div className="rounded-md border bg-background p-2 text-[11px]">
              {outcome.status === 'ERROR' && (
                <span className="text-red-700">{outcome.error}</span>
              )}
              {outcome.status === 'TOO_SMALL' && (
                <span className="text-amber-700">
                  Cohort-relative, and the cohort is too small for a norm — nothing computed.
                </span>
              )}
              {outcome.summary && (
                <div className="flex flex-wrap gap-3 text-muted-foreground">
                  {outcome.summary.min !== null && (
                    <span>
                      min {fmt(outcome.summary.min)} · max {fmt(outcome.summary.max)} · mean{' '}
                      {fmt(outcome.summary.mean)}
                    </span>
                  )}
                  {Object.entries(outcome.summary.bands).map(([band, n]) => (
                    <span key={band} className="rounded bg-muted px-1.5 py-0.5">{band}: {n}</span>
                  ))}
                  <span className={cn(outcome.summary.nulls > 0 && 'font-medium text-amber-700')}>
                    {outcome.summary.nulls} without a value
                  </span>
                </div>
              )}
              {rows.length > 0 && outcome.status === 'EVALUATED' && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                  {rows.map((row, i) => (
                    <span key={i}>
                      {row.label}: <b className="text-foreground">
                        {row.values[outcome.slug] === null || row.values[outcome.slug] === undefined
                          ? '—' : String(row.values[outcome.slug])}
                      </b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Re-ask, with the reviewer's words. */}
          {d.reaskError && (
            <p className="text-xs text-red-700">{d.reaskError}</p>
          )}
          {asking ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="What should change? e.g. “the composite is [rule:ad-composite], not [mq:7]” or “the band starts at 34”"
                value={d.hint}
                onChange={(e) => onHint(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !d.reasking) onReask(); }}
                aria-label={`Hint for ${d.name}`}
              />
              <Button size="sm" onClick={onReask} disabled={d.reasking}>
                {d.reasking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Re-ask
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={d.reasking}>
                Cancel
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground hover:no-underline"
              onClick={() => setAsking(true)}
              disabled={d.reasking}
            >
              <MessageSquareReply className="h-3.5 w-3.5" />
              Re-ask with a hint
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const fmt = (v: number | null) =>
  v === null ? '—' : (Number.isInteger(v) ? String(v) : v.toFixed(2));
