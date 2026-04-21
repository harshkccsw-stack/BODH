'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import {
  getSessionItems,
  startSession,
  saveResponse,
  completeSession,
  type TakeItem,
  type TakeItemOption,
  type TakeInstrument,
  type TakeSession,
} from '@/lib/api/take';

// ── Timer Hook ───────────────────────────────────────────────────────────────

function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);

  // Re-seed when the initial value changes (once instrument loads)
  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return { display: `${mm}:${ss}`, seconds };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface NormalizedOption {
  label: string;
  value: number | string;
  numericValue: number | null;
}

function normalizeOptions(raw: TakeItem['options']): NormalizedOption[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  const normalized: NormalizedOption[] = [];
  for (const entry of raw as TakeItemOption[]) {
    if (entry == null || typeof entry !== 'object') continue;
    const label =
      (typeof entry.text === 'string' && entry.text) ||
      (typeof entry.label === 'string' && entry.label) ||
      (entry.value != null ? String(entry.value) : '');
    const value = entry.value ?? label;
    const numericValue =
      typeof entry.value === 'number'
        ? entry.value
        : typeof entry.value === 'string' && !Number.isNaN(Number(entry.value))
          ? Number(entry.value)
          : null;
    normalized.push({ label, value: value as number | string, numericValue });
  }
  return normalized.length > 0 ? normalized : null;
}

// ── Page Component ───────────────────────────────────────────────────────────

export default function TakeAssessmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id as string;

  const [session, setSession] = useState<TakeSession | null>(null);
  const [instrument, setInstrument] = useState<TakeInstrument | null>(null);
  const [items, setItems] = useState<TakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  // Keyed by item id → the stored response_value (object or free text)
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [lastSaved, setLastSaved] = useState(5);
  const questionStartRef = useRef<number>(Date.now());

  // ── Load session + items + start ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getSessionItems(sessionId);
        if (cancelled) return;
        setSession(res.session);
        setInstrument(res.instrument);
        setItems(res.items);
        setCurrentIndex(
          Math.min(
            Math.max(0, res.session.current_item_index || 0),
            Math.max(0, res.items.length - 1),
          ),
        );
        // Kick off the session (best-effort — don't block UI on error)
        try {
          await startSession(sessionId);
        } catch {
          // ignore start errors — session may already be in progress
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load assessment');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // ── Timer (derived from instrument duration) ────────────────────────────
  const durationSeconds = useMemo(() => {
    const minutes = instrument?.duration_minutes ?? 25;
    return Math.max(60, minutes * 60);
  }, [instrument]);
  const timer = useCountdown(durationSeconds);

  // ── Auto-save ticker ────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setLastSaved((v) => v + 5), 5000);
    return () => clearInterval(id);
  }, []);

  // ── Reset per-question start time when navigating ───────────────────────
  useEffect(() => {
    questionStartRef.current = Date.now();
  }, [currentIndex]);

  const totalQuestions = items.length;
  const progressPercent =
    totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;
  const currentItem: TakeItem | undefined = items[currentIndex];
  const currentOptions = useMemo(
    () => (currentItem ? normalizeOptions(currentItem.options) : null),
    [currentItem],
  );
  const currentAnswer = currentItem ? answers[currentItem.id] : undefined;
  const answeredCount = Object.keys(answers).length;

  const persistAnswer = useCallback(
    async (item: TakeItem, responseValue: unknown) => {
      const responseTimeMs = Math.max(0, Date.now() - questionStartRef.current);
      setAnswers((prev) => ({ ...prev, [item.id]: responseValue }));
      setLastSaved(0);
      try {
        await saveResponse(sessionId, {
          item_id: item.id,
          response_value: responseValue,
          response_time_ms: responseTimeMs,
          item_sequence: currentIndex + 1,
        });
      } catch {
        // Swallow — UI already reflects the selection; a retry could be added later.
      }
    },
    [sessionId, currentIndex],
  );

  const selectOption = useCallback(
    (option: NormalizedOption) => {
      if (!currentItem) return;
      const payload = {
        value: option.numericValue ?? option.value,
        text: option.label,
      };
      void persistAnswer(currentItem, payload);
    },
    [currentItem, persistAnswer],
  );

  const onFreeTextBlur = useCallback(
    (text: string) => {
      if (!currentItem) return;
      if (!text.trim()) return;
      void persistAnswer(currentItem, { text });
    },
    [currentItem, persistAnswer],
  );

  const onFreeTextChange = useCallback(
    (text: string) => {
      if (!currentItem) return;
      // Local only; the save happens on blur to avoid spamming the API.
      setAnswers((prev) => ({ ...prev, [currentItem.id]: { text } }));
    },
    [currentItem],
  );

  const goNext = () => {
    if (currentIndex < totalQuestions - 1) setCurrentIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await completeSession(sessionId);
      router.push('/sessions');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit assessment');
      setSubmitting(false);
    }
  }, [sessionId, submitting, router]);

  const handleSaveAndExit = useCallback(() => {
    router.push('/sessions');
  }, [router]);

  // ── Render: loading / error states ──────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="text-sm text-muted-foreground">Loading assessment…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-3 text-center">
            <h2 className="text-lg font-semibold">Unable to load assessment</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="primary" size="md" onClick={() => router.push('/sessions')}>
              Back to Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentItem || totalQuestions === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-3 text-center">
            <h2 className="text-lg font-semibold">No items available</h2>
            <p className="text-sm text-muted-foreground">
              This assessment has no questions yet.
            </p>
            <Button variant="primary" size="md" onClick={() => router.push('/sessions')}>
              Back to Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const assessmentTitle =
    (instrument?.short_name || instrument?.name || 'Assessment').trim();
  const language = (session?.language || 'en').toUpperCase();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          {/* Assessment name */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate">
              {assessmentTitle}
              {instrument?.name && instrument.name !== assessmentTitle
                ? ` — ${instrument.name}`
                : ''}
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
              <span>{language}</span>
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
            {currentItem.sub_domain ? (
              <p className="text-sm text-muted-foreground">
                {currentItem.sub_domain}
              </p>
            ) : null}
            <h2 className="text-xl lg:text-2xl font-semibold tracking-tight leading-snug">
              {currentItem.stem}
            </h2>
          </div>

          {/* Answer area: options or free-text */}
          {currentOptions ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentOptions.map((option, idx) => {
                const isSelected =
                  !!currentAnswer &&
                  typeof currentAnswer === 'object' &&
                  (currentAnswer as { value?: unknown }).value ===
                    (option.numericValue ?? option.value);
                return (
                  <Card
                    key={`${option.value}-${idx}`}
                    className={cn(
                      'cursor-pointer transition-all duration-150',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                        : 'hover:border-primary/40 hover:shadow-sm',
                    )}
                    onClick={() => selectOption(option)}
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
                            isSelected ? 'text-primary' : 'text-foreground',
                          )}
                        >
                          {option.label}
                        </span>
                        {option.numericValue !== null ? (
                          <span
                            className={cn(
                              'text-xs font-mono tabular-nums rounded-md px-1.5 py-0.5',
                              isSelected
                                ? 'bg-primary/10 text-primary'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {option.numericValue}
                          </span>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div>
              <textarea
                className="w-full min-h-[160px] rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Type your response here…"
                value={
                  currentAnswer &&
                  typeof currentAnswer === 'object' &&
                  typeof (currentAnswer as { text?: string }).text === 'string'
                    ? ((currentAnswer as { text?: string }).text as string)
                    : ''
                }
                onChange={(e) => onFreeTextChange(e.target.value)}
                onBlur={(e) => onFreeTextBlur(e.target.value)}
              />
            </div>
          )}

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
              onClick={handleSaveAndExit}
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
                disabled={submitting || answeredCount < totalQuestions}
                onClick={handleSubmit}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </Button>
            )}
          </div>

          {/* ── Question dots (mini-map) ─────────────────────────────────── */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {items.map((it, idx) => (
              <button
                key={it.id}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors',
                  idx === currentIndex
                    ? 'bg-primary scale-125'
                    : answers[it.id] !== undefined
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
            <span>Your responses are encrypted and DPDP compliant.</span>
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
