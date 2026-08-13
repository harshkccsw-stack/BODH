import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandHeader } from '@/components/brand-header';
import { Media, mediaTypeFor } from '@/components/media';
import { cn } from '@/lib/utils';
import { answerKey, type PortalAssessmentDetail, type PortalQuestion } from '@/lib/api';

// Answers are keyed by SLOT — answerKey(questionId) for an ordinary question,
// answerKey(questionId, rowId) for one row of a grid — and hold every selected
// optionId. Single choice is just a slot whose cap is 1, and a grid is a
// question with one slot per row, so one code path covers all three types.
//
// How many a slot takes comes from the server as minSelections /
// maxSelections (already resolved from its rule), and EVERY gate below reads
// those two numbers — never the rule directly. That is what keeps this screen
// and the submit validator from ever disagreeing.

/** "Select exactly 2" — the instruction, worded from the rule the author picked. */
function selectionHint(q: PortalQuestion): string | null {
  if (q.selectionRule == null || q.selectionCount == null) return null;
  const n = q.selectionCount;
  const s = n === 1 ? '' : 's';
  if (q.selectionRule === 'EQUALS') return `Select exactly ${n} option${s}`;
  if (q.selectionRule === 'MAX') return `Select up to ${n} option${s}`;
  return `Select at least ${n} option${s}`;
}

export function QuestionRunner({
  detail,
  title,
  subtitle,
  answers,
  setAnswers,
  onSubmit,
  submitting,
  submitError,
  onFocusPopup,
}: {
  detail: PortalAssessmentDetail;
  title: string;
  subtitle?: string;
  answers: Record<string, number[]>;
  setAnswers: (a: Record<string, number[]>) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError?: string;
  /** Called once each time the inactivity popup is dismissed (OKAY). */
  onFocusPopup: () => void;
}) {
  const [index, setIndex] = useState(0);
  const questions = detail.questions;
  const total = questions.length;

  const q = questions[index];
  const progress = Math.round(((index + 1) / total) * 100);
  const isScale = q.questionType === 'LINEAR_SCALE';
  const isGrid = q.questionType === 'LIKERT_GRID';
  // Every slot this question must fill: one per grid row, otherwise one for
  // the question itself. Mirrors slotsOf() in PortalAssessmentService.
  const slotsOf = (qq: PortalQuestion): string[] =>
    qq.questionType === 'LIKERT_GRID'
      ? qq.rows.map((r) => answerKey(qq.questionId, r.questionRowId))
      : [answerKey(qq.questionId)];
  const picked = (slot: string): number[] => answers[slot] ?? [];
  const slotSatisfied = (qq: PortalQuestion, slot: string): boolean => {
    const n = (answers[slot] ?? []).length;
    return n >= qq.minSelections && n <= qq.maxSelections;
  };

  // The non-grid slot, for the code paths that only ever see one.
  const selected = picked(answerKey(q.questionId));
  const multi = q.maxSelections > 1;
  const hint = isGrid ? null : selectionHint(q);
  // "Answered" means the rule is SATISFIED for EVERY slot, not merely
  // touched — anything looser and the navigator would show a green tick on a
  // question the server is about to reject, and a half-filled grid would sail
  // past Next.
  const answered = slotsOf(q).every((slot) => slotSatisfied(q, slot));
  const atCap = selected.length >= q.maxSelections;
  const isLast = index === total - 1;
  // Per-assessment setting: advance to the next question automatically a beat
  // after an option is picked (never an auto-submit on the last question).
  const autoNext = detail.autoNext;

  // Pending auto-advance timer. Cleared on any manual navigation, on a fresh
  // selection, and on unmount so it can never fire against a stale question.
  const advanceTimer = useRef<number | null>(null);
  const clearAdvance = () => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };
  useEffect(() => clearAdvance, []);

  // ── Inactivity "focus" popup ────────────────────────────────────────────
  // If the respondent doesn't interact for 30s, a popup nudges them to focus;
  // dismissing it (OKAY) bumps the attempt's popup count (persisted at submit)
  // and restarts the countdown. Any activity resets the countdown. The timer
  // only runs on this questions screen — the gate steps are separate pages —
  // and pauses while the browser tab is hidden (leaving the tab isn't counted).
  const INACTIVITY_MS = 30_000;
  const [showFocusModal, setShowFocusModal] = useState(false);
  const focusTimer = useRef<number | null>(null);
  // Ref mirror of the modal state so timer/visibility callbacks read it without
  // being re-created — while the popup is up, activity must NOT reset anything.
  const modalOpenRef = useRef(false);

  const clearFocusTimer = () => {
    if (focusTimer.current !== null) {
      window.clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }
  };
  const armFocusTimer = () => {
    clearFocusTimer();
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      modalOpenRef.current = true;
      setShowFocusModal(true);
    }, INACTIVITY_MS);
  };
  // Any respondent activity restarts the countdown — unless the popup is up,
  // when the only way forward is the OKAY button.
  const noteActivity = () => {
    if (modalOpenRef.current) return;
    armFocusTimer();
  };
  const dismissFocusPopup = () => {
    modalOpenRef.current = false;
    setShowFocusModal(false);
    onFocusPopup();
    armFocusTimer();
  };

  useEffect(() => {
    armFocusTimer();
    const onVisibility = () => {
      if (document.hidden) {
        clearFocusTimer();
      } else if (!modalOpenRef.current) {
        armFocusTimer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearFocusTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flashes when a tick is refused for being over the cap; cleared on any
  // successful change and on leaving the question.
  const [capWarning, setCapWarning] = useState(false);

  const goTo = (qi: number) => {
    clearAdvance();
    setCapWarning(false);
    setIndex(Math.max(0, Math.min(total - 1, qi)));
  };

  const selectOption = (optionId: number, questionRowId?: number) => {
    const slot = answerKey(q.questionId, questionRowId);
    const selected = picked(slot);
    const atCap = selected.length >= q.maxSelections;
    const on = selected.includes(optionId);
    let next: number[];
    if (on) {
      next = selected.filter((id) => id !== optionId);
    } else if (q.maxSelections === 1) {
      // Cap of 1 — single choice and "max 1" alike — replaces, like a radio.
      next = [optionId];
    } else if (atCap) {
      // Past the cap the tick is BLOCKED, never swapped for an earlier one:
      // silently dropping a selection they made produces an answer set the
      // respondent never intended and nothing downstream can detect.
      setCapWarning(true);
      return;
    } else {
      next = [...selected, optionId];
    }
    setCapWarning(false);
    const updated = { ...answers, [slot]: next };
    setAnswers(updated);
    // Auto-advance only on a selection that COMPLETES the question and cannot
    // grow — single choice, or EQUALS on its last tick. Under MIN/MAX there is
    // no such signal, and advancing would slide the page away mid-selection.
    // On a grid that means EVERY row is settled, not just the one just ticked.
    const settled = slotsOf(q).every((s) => {
      const n = (updated[s] ?? []).length;
      return n === q.minSelections && n === q.maxSelections;
    });
    if (!autoNext || isLast || !settled) return;
    clearAdvance();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      setIndex((i) => Math.min(total - 1, i + 1));
    }, 350);
  };

  const isQuestionAnswered = (qi: number): boolean => {
    const qq = questions[qi];
    if (qq === undefined) return false;
    return slotsOf(qq).every((slot) => slotSatisfied(qq, slot));
  };
  const answeredCount = questions.reduce((n, _, i) => n + (isQuestionAnswered(i) ? 1 : 0), 0);

  // Group questions into ordered sections (preserving first-appearance order),
  // keeping each question's absolute index so navigation still works. Flat
  // questionnaires collapse to a single untitled group.
  const sectionNames = new Map(detail.sections.map((s) => [s.sectionId, s.name]));
  const sections: { key: string; title: string | null; indices: number[] }[] = [];
  const sectionByKey = new Map<string, number>();
  questions.forEach((qq, qi) => {
    const key = qq.sectionId !== null ? String(qq.sectionId) : '__none__';
    let pos = sectionByKey.get(key);
    if (pos === undefined) {
      pos = sections.length;
      sectionByKey.set(key, pos);
      sections.push({
        key,
        title: qq.sectionId !== null ? sectionNames.get(qq.sectionId)?.trim() || null : null,
        indices: [],
      });
    }
    sections[pos].indices.push(qi);
  });
  const hasSections = sections.some((s) => s.title);
  // The question index panel lets respondents see their progress and jump
  // between questions. Per-assessment toggle (create/edit form); defaults on.
  const showIndex = detail.showQuestionIndex;

  return (
    <div
      className="flex-1 min-h-screen w-full bg-muted/20"
      onPointerDown={noteActivity}
      onKeyDown={noteActivity}
    >
      <BrandHeader
        title={title}
        subtitle={subtitle}
        maxWidth={showIndex ? '6xl' : '3xl'}
        progress={progress}
        right={<div className="text-xs text-muted-foreground shrink-0">Question {index + 1} of {total}</div>}
      />

      <div
        className={cn(
          'mx-auto px-5 py-8',
          showIndex ? 'max-w-6xl grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6' : 'max-w-3xl',
        )}
      >
        {showIndex && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Questions</p>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {answeredCount}/{total}
                  </span>
                </div>
                <div className="space-y-3">
                  {sections.map((sec) => {
                    const secAnswered = sec.indices.reduce((n, qi) => n + (isQuestionAnswered(qi) ? 1 : 0), 0);
                    return (
                      <div key={sec.key}>
                        {hasSections && (
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[0.6875rem] font-semibold text-foreground truncate pr-2">
                              {sec.title || 'Other'}
                            </p>
                            <span className="text-[0.625rem] text-muted-foreground shrink-0">
                              {secAnswered}/{sec.indices.length}
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-5 gap-1.5">
                          {sec.indices.map((qi) => {
                            const qq = questions[qi];
                            const isCurrent = qi === index;
                            const isAnswered = isQuestionAnswered(qi);
                            return (
                              <button
                                key={qq.questionId}
                                type="button"
                                onClick={() => goTo(qi)}
                                title={`Question ${qi + 1}${isAnswered ? ' — answered' : ''}`}
                                className={cn(
                                  'h-8 w-full rounded-md text-xs font-medium border transition-colors',
                                  isCurrent
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : isAnswered
                                      ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                                      : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                                )}
                              >
                                {qi + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-[0.6875rem] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-primary" /> Current
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-green-500/20 border border-green-500/40" /> Answered
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm border border-border bg-background" /> Not answered
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        )}

        <main>
          <Card>
            <CardContent className="p-6 space-y-5">
              {q.stem && <p className="text-base font-medium leading-relaxed">{q.stem}</p>}
              <Media url={q.mediaUrl ?? undefined} type={mediaTypeFor(q.contentType, q.mediaUrl)} />

              {isGrid && (
                /* Every row is mandatory, so the count is the thing to show:
                   on a long grid an unrated row is easy to scroll past. */
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium',
                    answered
                      ? 'border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400'
                      : 'border-primary/30 bg-primary/5 text-primary',
                  )}
                >
                  <span>Pick one for every row</span>
                  <span className="shrink-0 text-muted-foreground">
                    {q.rows.filter((r) => slotSatisfied(q, answerKey(q.questionId, r.questionRowId))).length}
                    {' of '}{q.rows.length} rated
                  </span>
                </div>
              )}

              {hint && (
                <div
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                    capWarning
                      ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
                      : 'border-primary/30 bg-primary/5 text-primary',
                  )}
                >
                  <span>{capWarning ? `${hint} — untick one to change your answer` : hint}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {selected.length} selected
                  </span>
                </div>
              )}

              {isGrid ? (
                /* Rows x shared columns, one pick per row. Every row is
                   mandatory, so an unanswered one is marked rather than left
                   to be discovered by the Next button. On a narrow screen the
                   table scrolls sideways instead of wrapping — a Likert row
                   is only readable in scale order. */
                <div className="overflow-x-auto -mx-2 px-2">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-card text-left pb-2 pr-3 font-normal text-xs text-muted-foreground">
                          &nbsp;
                        </th>
                        {q.options.map((opt, oi) => (
                          <th
                            key={opt.optionId}
                            className="px-2 pb-2 text-center align-bottom font-medium text-xs text-muted-foreground whitespace-nowrap"
                          >
                            {opt.optionText || `Option ${oi + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {q.rows.map((row, ri) => {
                        const slot = answerKey(q.questionId, row.questionRowId);
                        const rowPicked = picked(slot);
                        const rowDone = slotSatisfied(q, slot);
                        return (
                          <tr key={row.questionRowId}>
                            <td
                              className={cn(
                                'sticky left-0 z-10 bg-card border-t border-border py-3 pr-3 align-middle',
                                !rowDone && 'text-foreground',
                              )}
                            >
                              <span className="flex items-start gap-2">
                                <span className="text-xs text-muted-foreground mt-0.5 shrink-0">{ri + 1}.</span>
                                <span className="text-sm">{row.rowText}</span>
                              </span>
                            </td>
                            {q.options.map((opt) => {
                              const on = rowPicked.includes(opt.optionId);
                              return (
                                <td key={opt.optionId} className="border-t border-border px-2 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => selectOption(opt.optionId, row.questionRowId)}
                                    aria-label={`${row.rowText ?? `Row ${ri + 1}`}: ${opt.optionText ?? ''}`}
                                    aria-pressed={on}
                                    className={cn(
                                      'inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
                                      on
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-border hover:border-primary/60',
                                    )}
                                  >
                                    {on && <Check className="h-3.5 w-3.5" />}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : isScale ? (
                /* A linear scale is the same cap-1 question in a different
                   shape: one row of points between the two end labels. It
                   goes through selectOption like everything else, so nothing
                   about answering or submitting differs. */
                <div className="space-y-3">
                  <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
                    {q.options.map((opt, oi) => {
                      const on = selected.includes(opt.optionId);
                      return (
                        <button
                          key={opt.optionId}
                          type="button"
                          onClick={() => selectOption(opt.optionId)}
                          className={cn(
                            'flex-1 min-w-14 flex flex-col items-center gap-2 rounded-lg border px-2 py-3 transition-colors',
                            on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full border',
                              on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                            )}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className={cn('text-sm', on ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                            {opt.optionText || oi + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {(q.scaleLowLabel || q.scaleHighLabel) && (
                    <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                      <span className="max-w-[45%]">{q.scaleLowLabel}</span>
                      <span className="max-w-[45%] text-right">{q.scaleHighLabel}</span>
                    </div>
                  )}
                </div>
              ) : (
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const on = selected.includes(opt.optionId);
                  return (
                    <button
                      key={opt.optionId}
                      type="button"
                      onClick={() => selectOption(opt.optionId)}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-colors',
                        on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                        // At the cap the unticked options are visibly inert —
                        // the tick is refused, so it must not look available.
                        multi && atCap && !on && 'opacity-60',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border',
                            multi ? 'rounded' : 'rounded-full',
                            on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <div className="flex-1 space-y-2">
                          <p className="text-sm">{opt.optionText || `Option ${oi + 1}`}</p>
                          <Media url={opt.mediaUrl ?? undefined} type={mediaTypeFor(opt.contentType, opt.mediaUrl)} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </CardContent>
          </Card>

          {submitError && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between mt-5">
            <Button variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            {isLast ? (
              <Button variant="primary" onClick={onSubmit} disabled={!answered || submitting}>
                {submitting ? 'Submitting...' : 'Submit Assessment'}
                <Check className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => goTo(index + 1)} disabled={!answered}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </main>
      </div>

      {showFocusModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-sm">
            <CardContent className="p-6 space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Focus on your assessment</h2>
                <p className="text-sm text-muted-foreground">
                  You've been inactive for a little while. Tap OKAY to continue.
                </p>
              </div>
              <Button variant="primary" className="w-full" onClick={dismissFocusPopup}>
                OKAY
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
