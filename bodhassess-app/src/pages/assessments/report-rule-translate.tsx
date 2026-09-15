import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reportRulesApi,
  type ReportRuleResponse,
  type TranslationProposal,
  type TranslationResult,
} from '@/pages/Reports/reportRulesApi';

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
 */
export function ReportRuleTranslate({
  assessmentId,
  organizationId,
  rules,
  onClose,
  onApplied,
}: {
  assessmentId: number;
  organizationId?: number | null;
  rules: ReportRuleResponse[];
  onClose: () => void;
  onApplied: (count: number) => void;
}) {
  /** Only plain-language rules can be translated; formulae are already done. */
  const candidates = useMemo(
    () => rules.filter((r) => r.versions?.[0]?.definitionKind === 'STATEMENT'),
    [rules],
  );

  const [chosen, setChosen] = useState<Set<number>>(
    () => new Set(candidates.map((r) => r.reportRuleId)),
  );
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: number, into: Set<number>, set: (s: Set<number>) => void) => {
    const next = new Set(into);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set(next);
  };

  async function translate() {
    setError('');
    setBusy(true);
    try {
      const r = await reportRulesApi.aiTranslate(assessmentId, [...chosen], organizationId);
      setResult(r);
      // Pre-tick only what validated AND the model was sure of. Everything else
      // is a deliberate decision, not a default.
      setAccepted(new Set(
        r.proposals
          .filter((p) => p.ok && p.confident && (p.warnings ?? []).length === 0)
          .map((p) => p.reportRuleId),
      ));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Could not translate those rules.');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Save the accepted proposals, in the order the steps run.
   *
   * Order matters and is not cosmetic: a composite score can only be saved once
   * the factor scores it reads are formulae themselves. Saving out of order
   * would refuse perfectly good rules for depending on plain language.
   */
  async function apply() {
    if (!result) return;
    setError('');
    setBusy(true);
    const ordered = result.proposals
      .filter((p) => accepted.has(p.reportRuleId) && p.ok && p.expression)
      .sort((a, b) => stepOf(a) - stepOf(b));

    let done = 0;
    try {
      for (const p of ordered) {
        const rule = rules.find((r) => r.reportRuleId === p.reportRuleId);
        if (!rule) continue;
        await reportRulesApi.update(p.reportRuleId, {
          name: rule.name,
          definitionKind: 'EXPRESSION',
          expression: p.expression,
          statementText: null,
          assessmentId,
          organizationId,
          stage: rule.stage,
          stepOrder: rule.stepOrder,
          // The sheet's own words, kept. Once this is a formula the statement
          // text is gone, and this becomes the only record of what was asked
          // for — and the thing to re-translate from if the formula is wrong.
          notes: `${rule.versions?.[0]?.notes ?? ''}\n\nTranslated from: ${p.sourceText}`.trim(),
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

  const stepOf = (p: TranslationProposal) =>
    rules.find((r) => r.reportRuleId === p.reportRuleId)?.stepOrder ?? 0;

  const acceptable = result?.proposals.filter((p) => p.ok).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <Card className="w-full max-w-5xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Write formulae with AI</h2>
              <p className="text-sm text-muted-foreground">
                Proposals only. Every one is checked by the same validator that saving uses, and
                nothing is written until you accept it.
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
          {!result && (
            <>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Every rule on this assessment is already a formula. Import a workbook to add
                  plain-language rules.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    All of them are sent together, because workbook rules reference each other —
                    a composite score means nothing without the factor scores it adds up.
                  </p>
                  <div className="max-h-80 divide-y overflow-y-auto rounded-md border">
                    {candidates.map((r) => (
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
                          <div className="text-sm font-medium">{r.name}</div>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.versions?.[0]?.statementText}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── step 2: review ────────────────────────────────────────── */}
          {result && (
            <>
              <p className="text-xs text-muted-foreground">
                Answered by <b>{result.model}</b>. A tick means the formula <i>parses and every
                name in it resolves</i> — it does not mean the formula is right. Read it against
                the original. An amber card is a formula that is valid and cannot ever fire.
              </p>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                {result.proposals.map((p) => (
                  <div
                    key={p.reportRuleId}
                    className={cn(
                      'rounded-md border p-3',
                      !p.ok
                        ? 'border-red-200 bg-red-50/40'
                        : (p.warnings ?? []).length > 0
                          ? 'border-amber-300 bg-amber-50/50'
                          : 'border-green-200 bg-green-50/40',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        disabled={!p.ok}
                        checked={accepted.has(p.reportRuleId)}
                        onChange={() => toggle(p.reportRuleId, accepted, setAccepted)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{p.name}</span>
                          {!p.ok ? (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          ) : (p.warnings ?? []).length > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          {p.ok && (p.warnings ?? []).length > 0 && (
                            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                              never fires
                            </span>
                          )}
                          {p.ok && !p.confident && (p.warnings ?? []).length === 0 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                              check this one
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-muted-foreground">
                          <b>Sheet said:</b> {p.sourceText}
                        </p>

                        {p.expression ? (
                          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                            {p.expression}
                          </pre>
                        ) : (
                          <p className="mt-2 text-xs italic text-muted-foreground">
                            No formula proposed — this rule stays as plain text.
                          </p>
                        )}

                        {p.note && (
                          <p className="mt-1 text-xs text-blue-900">
                            <b>Note:</b> {p.note}
                          </p>
                        )}

                        {(p.warnings ?? []).length > 0 && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs font-medium text-amber-900">
                            {(p.warnings ?? []).map((w, i) => <li key={i}>{w}</li>)}
                          </ul>
                        )}

                        {!p.ok && p.errors.length > 0 && (
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-red-700">
                            {p.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-2">
            {result && (
              <span className="mr-auto text-sm text-muted-foreground">
                {acceptable} of {result.proposals.length} validated · {accepted.size} ticked
              </span>
            )}
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {!result ? (
              <Button onClick={translate} disabled={busy || chosen.size === 0}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Translate {chosen.size} rules
              </Button>
            ) : (
              <Button onClick={apply} disabled={busy || accepted.size === 0}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Accept {accepted.size}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
