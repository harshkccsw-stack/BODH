import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Lock,
  LogOut,
  Shield,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// ── PHQ-9 Questions ──────────────────────────────────────────────────────────

const PHQ9_STEM = 'Over the last 2 weeks, how often have you been bothered by:';

const questions = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading the newspaper or watching television',
  'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
  'Thoughts that you would be better off dead, or of hurting yourself in some way',
];

const answerOptions = [
  { label: 'Not at all', value: 0 },
  { label: 'Several days', value: 1 },
  { label: 'More than half the days', value: 2 },
  { label: 'Nearly every day', value: 3 },
];

// ── Timer Hook ───────────────────────────────────────────────────────────────

function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return { display: `${mm}:${ss}`, seconds };
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function TakeAssessmentPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    () => Array(questions.length).fill(null),
  );
  const [lastSaved, setLastSaved] = useState(5);

  const timer = useCountdown(25 * 60);
  const totalQuestions = questions.length;
  const progressPercent = ((currentIndex + 1) / totalQuestions) * 100;

  // Simulate auto-save ticker
  useEffect(() => {
    const id = setInterval(() => setLastSaved((v) => v + 5), 5000);
    return () => clearInterval(id);
  }, []);

  // Reset "last saved" whenever an answer changes
  useEffect(() => {
    setLastSaved(0);
    const id = setTimeout(() => setLastSaved(5), 5000);
    return () => clearTimeout(id);
  }, [answers]);

  const selectAnswer = useCallback(
    (value: number) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[currentIndex] = value;
        return next;
      });
    },
    [currentIndex],
  );

  const goNext = () => {
    if (currentIndex < totalQuestions - 1) setCurrentIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const selectedAnswer = answers[currentIndex];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          {/* Assessment name */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">
              PHQ-9 — Depression Screening
            </span>
          </div>

          {/* Timer + Language */}
          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex items-center gap-1.5 text-sm font-mono tabular-nums',
                timer.seconds < 300
                  ? 'text-destructive'
                  : 'text-muted-foreground',
              )}
            >
              <Clock className="h-4 w-4" />
              {timer.display}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>EN</span>
            </div>
          </div>
        </div>

        {/* Progress section */}
        <div className="mx-auto max-w-4xl px-5 pb-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Question {currentIndex + 1} of {totalQuestions}
            </span>
            <span>{Math.round(progressPercent)}% complete</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </header>

      {/* ── Question Area ──────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start justify-center px-5 py-8 lg:py-12">
        <div className="w-full max-w-2xl space-y-8">
          {/* Question text */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{PHQ9_STEM}</p>
            <h2 className="text-xl lg:text-2xl font-semibold tracking-tight leading-snug">
              {questions[currentIndex]}
            </h2>
          </div>

          {/* Answer option cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {answerOptions.map((option) => {
              const isSelected = selectedAnswer === option.value;
              return (
                <Card
                  key={option.value}
                  className={cn(
                    'cursor-pointer transition-all duration-150',
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                      : 'hover:border-primary/40 hover:shadow-sm',
                  )}
                  onClick={() => selectAnswer(option.value)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    {/* Radio indicator */}
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        isSelected
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30',
                      )}
                    >
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>

                    {/* Label + score */}
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          isSelected
                            ? 'text-primary'
                            : 'text-foreground',
                        )}
                      >
                        {option.label}
                      </span>
                      <span
                        className={cn(
                          'text-xs font-mono tabular-nums rounded-md px-1.5 py-0.5',
                          isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {option.value}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* ── Navigation ───────────────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="md"
              onClick={goPrev}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            <Button
              variant="ghost"
              size="md"
              mode="link"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Save & Exit
            </Button>

            {currentIndex < totalQuestions - 1 ? (
              <Button variant="primary" size="md" onClick={goNext}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="mono"
                size="md"
                disabled={answers.includes(null)}
              >
                Submit
              </Button>
            )}
          </div>

          {/* ── Question dots (mini-map) ─────────────────────────────────── */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors',
                  idx === currentIndex
                    ? 'bg-primary scale-125'
                    : answers[idx] !== null
                      ? 'bg-primary/40'
                      : 'bg-muted-foreground/20',
                )}
                aria-label={`Go to question ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </main>

      {/* ── Bottom Info Bar ─────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 py-3 flex items-center justify-between gap-4 flex-wrap text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>
              Your responses are encrypted and DPDP compliant.
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            <span>
              Auto-saved {lastSaved < 5 ? 'just now' : `${lastSaved} seconds ago`}.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
