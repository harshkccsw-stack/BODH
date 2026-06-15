import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandHeader } from '@/components/brand-header';
import { Media } from '@/components/media';
import { cn } from '@/lib/utils';
import { useHeartbeat } from '@/hooks/use-heartbeat';
import { useFirstAnswerPing } from '@/hooks/use-first-answer-ping';
import type { PortalSession, Questionnaire } from '@/lib/api';

export function QuestionRunner({
  instrument,
  session,
  title,
  subtitle,
  answers,
  setAnswers,
  onSubmit,
  submitting,
  alreadyStarted,
}: {
  instrument: Questionnaire;
  session: PortalSession;
  title: string;
  subtitle?: string;
  answers: Record<string, number | string>;
  setAnswers: (a: Record<string, number | string>) => void;
  onSubmit: () => void;
  submitting: boolean;
  alreadyStarted: boolean;
}) {
  const [index, setIndex] = useState(0);
  const total = instrument.questions.length;

  // Best-effort live-tracking + first-answer started_at stamp.
  useHeartbeat(session.id, index, total, !submitting);
  useFirstAnswerPing(session.id, answers, submitting, alreadyStarted);

  const q = instrument.questions[index];
  const progress = Math.round(((index + 1) / total) * 100);
  const isFreeText = String(q.format || '').toUpperCase().replace(/_/g, '') === 'FREETEXT';
  const selected = answers[q.id];
  const answered = isFreeText
    ? typeof selected === 'string' && selected.trim().length > 0
    : selected !== undefined;
  const isLast = index === total - 1;
  const showIndex = !!session.showQuestionIndex;

  const isQuestionAnswered = (qi: number): boolean => {
    const qq = instrument.questions[qi];
    if (!qq) return false;
    const a = answers[qq.id];
    if (a === undefined) return false;
    if (typeof a === 'string') return a.trim().length > 0;
    return true;
  };
  const answeredCount = instrument.questions.reduce((n, _, i) => n + (isQuestionAnswered(i) ? 1 : 0), 0);

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
                <div className="grid grid-cols-5 gap-1.5">
                  {instrument.questions.map((qq, qi) => {
                    const isCurrent = qi === index;
                    const isAnswered = isQuestionAnswered(qi);
                    return (
                      <button
                        key={qq.id}
                        type="button"
                        onClick={() => setIndex(qi)}
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
              <Media url={q.media_url} type={q.media_type} />

              {isFreeText ? (
                <div className="space-y-1.5">
                  <textarea
                    rows={7}
                    value={typeof selected === 'string' ? selected : ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Type your answer here…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm leading-relaxed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-y"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {typeof selected === 'string' ? selected.length : 0} characters
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const on = selected === oi;
                    return (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [q.id]: oi })}
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
                            <p className="text-sm">{opt.text || `Option ${oi + 1}`}</p>
                            <Media url={opt.media_url} type={opt.media_type} />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between mt-5">
            <Button variant="outline" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            {isLast ? (
              <Button variant="primary" onClick={onSubmit} disabled={!answered || submitting}>
                {submitting ? 'Submitting...' : 'Submit Assessment'}
                <Check className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setIndex(index + 1)} disabled={!answered}>
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
