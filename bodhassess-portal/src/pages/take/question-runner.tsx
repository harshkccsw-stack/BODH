import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandHeader } from '@/components/brand-header';
import { Media, mediaTypeFor } from '@/components/media';
import { cn } from '@/lib/utils';
import type { PortalAssessmentDetail } from '@/lib/api';

// Answers are keyed by questionId and hold the selected optionId — the shape
// the answer-saving endpoint will take verbatim later.
export function QuestionRunner({
  detail,
  title,
  subtitle,
  answers,
  setAnswers,
  onSubmit,
  submitting,
  submitError,
}: {
  detail: PortalAssessmentDetail;
  title: string;
  subtitle?: string;
  answers: Record<number, number>;
  setAnswers: (a: Record<number, number>) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError?: string;
}) {
  const [index, setIndex] = useState(0);
  const questions = detail.questions;
  const total = questions.length;

  const q = questions[index];
  const progress = Math.round(((index + 1) / total) * 100);
  const selected = answers[q.questionId];
  const answered = selected !== undefined;
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

  const goTo = (qi: number) => {
    clearAdvance();
    setIndex(Math.max(0, Math.min(total - 1, qi)));
  };

  const selectOption = (optionId: number) => {
    setAnswers({ ...answers, [q.questionId]: optionId });
    if (!autoNext || isLast) return;
    clearAdvance();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      setIndex((i) => Math.min(total - 1, i + 1));
    }, 350);
  };

  const isQuestionAnswered = (qi: number): boolean => {
    const qq = questions[qi];
    return qq !== undefined && answers[qq.questionId] !== undefined;
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
  // The question index panel is always shown so respondents can see their
  // progress and jump between questions.
  const showIndex = true;

  return (
    <div className="flex-1 min-h-screen w-full bg-muted/20">
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

              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const on = selected === opt.optionId;
                  return (
                    <button
                      key={opt.optionId}
                      type="button"
                      onClick={() => selectOption(opt.optionId)}
                      className={cn(
                        'w-full text-left rounded-lg border p-4 transition-colors',
                        on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
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
    </div>
  );
}
