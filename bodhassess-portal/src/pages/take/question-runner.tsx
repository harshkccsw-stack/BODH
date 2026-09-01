import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Timer,
  TimerOff,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BrandHeader } from '@/components/brand-header';
import { Media, mediaTypeFor } from '@/components/media';
import { cn } from '@/lib/utils';
import { RichText, isBlankRichText } from '@/lib/rich-text';
import { answerKey, portalAssessmentsApi, type PortalAssessmentDetail, type PortalQuestion } from '@/lib/api';

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

/** "9:47" — the attention budget as the popup shows it, never negative. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The linear-scale widget: a real <input type="range">, so dragging, tapping,
 * arrow keys and screen readers all work without re-implementing any of them.
 *
 * The range comes from scaleFrom/scaleTo, and the value maps back to the
 * generated option whose text is that number — the question is still an
 * ordinary cap-1 pick underneath.
 *
 * UNSET is a real state here, not a zero: the thumb is hidden until the
 * respondent interacts, because a thumb resting at the midpoint makes a
 * skipped question look answered and quietly records a number nobody chose.
 */
function ScaleSlider({
  question,
  selectedOptionId,
  onPick,
}: {
  question: PortalQuestion;
  selectedOptionId: number | undefined;
  onPick: (optionId: number) => void;
}) {
  const points = question.options;
  const valueOf = (text: string | null) => Number(text);
  // Fall back to the option numbers themselves for a scale saved before the
  // range was stored (null there has always meant 1—5).
  const min = question.scaleFrom ?? valueOf(points[0]?.optionText ?? '1');
  const max = question.scaleTo ?? valueOf(points[points.length - 1]?.optionText ?? '5');

  const idByValue = new Map(points.map((o) => [valueOf(o.optionText), o.optionId]));
  const selectedValue = selectedOptionId == null
    ? null
    : valueOf(points.find((o) => o.optionId === selectedOptionId)?.optionText ?? null);
  const unset = selectedValue == null || Number.isNaN(selectedValue);

  const pick = (value: number) => {
    const optionId = idByValue.get(value);
    if (optionId !== undefined) onPick(optionId);
  };

  // Every point gets a label on a short scale; on a long one they thin out to
  // about a dozen, always keeping both ends.
  const step = Math.max(1, Math.ceil((max - min + 1) / 11));
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);

  return (
    <div className="space-y-3">
      {(question.scaleLowLabel || question.scaleHighLabel) && (
        <div className="flex items-start justify-between gap-2 sm:gap-3 text-[0.6875rem] sm:text-xs text-muted-foreground">
          <span className="max-w-[45%]">{question.scaleLowLabel}</span>
          <span className="max-w-[45%] text-right">{question.scaleHighLabel}</span>
        </div>
      )}

      <div className="px-1">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={unset ? min : selectedValue}
          onChange={(e) => pick(Number(e.target.value))}
          onKeyDown={(e) => {
            // From unset, the browser's own arrow handling would move off a
            // value that was never chosen — and at the minimum it would do
            // nothing at all. First key press lands on the low end instead.
            if (!unset) return;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              pick(e.key === 'End' ? max : min);
            }
          }}
          aria-valuetext={unset ? 'Not answered' : String(selectedValue)}
          className={cn(
            // h-6: the drawn track is unchanged, the area a thumb can grab is
            // the full height of it.
            'h-6 w-full cursor-pointer accent-primary',
            // Hidden rather than absent, so the track still measures and the
            // control keeps its keyboard focus.
            unset && '[&::-webkit-slider-thumb]:invisible [&::-moz-range-thumb]:invisible',
          )}
        />
        {/* A 0—100 scale prints eleven ticks, and on a 360px screen those only
            fit at the smaller size. */}
        <div className="mt-1 flex items-center justify-between text-[0.625rem] sm:text-[0.6875rem] text-muted-foreground">
          {ticks.map((t) => (
            <span key={t} className={cn('tabular-nums', !unset && t === selectedValue && 'font-semibold text-primary')}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {unset ? 'Drag the slider to answer' : <>You chose <span className="font-semibold text-primary">{selectedValue}</span></>}
      </p>
    </div>
  );
}

/**
 * The pending question after `from`, wrapping back to the earliest one behind
 * it — a blank left behind must stay reachable, and in fix-up mode "forward"
 * means "still unanswered", not "the next index". Null when nothing else is
 * pending.
 */
function nextPendingFrom(from: number, pending: number[]): number | null {
  return pending.find((qi) => qi > from) ?? pending.find((qi) => qi < from) ?? null;
}

export function QuestionRunner({
  detail,
  title,
  subtitle,
  answers,
  setAnswers,
  textAnswers,
  setTextAnswers,
  initialIndex = 0,
  onPartialSave,
  onSubmit,
  submitting,
  submitError,
  onFocusPopup,
  onAttentionTimeout,
  onRestart,
  attentionResetError,
}: {
  detail: PortalAssessmentDetail;
  title: string;
  subtitle?: string;
  answers: Record<string, number[]>;
  setAnswers: (a: Record<string, number[]>) => void;
  /** SHORT_ANSWER payloads, keyed the same way — see take.tsx. */
  textAnswers: Record<string, string>;
  setTextAnswers: (a: Record<string, string>) => void;
  /** Where to open — the first unanswered question on a resumed attempt. */
  initialIndex?: number;
  /**
   * Snapshot every answer marked so far (take.tsx PUTs it to the progress
   * endpoint). Fired on section change — and every few answers when the
   * paper has no sections to change between. Absent when the assessment's
   * savePartialAnswers toggle is off, which disables both triggers.
   */
  onPartialSave?: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError?: string;
  /** Called once each time the inactivity popup is dismissed (Resume). */
  onFocusPopup: () => void;
  /**
   * Called ONCE, when the attention budget runs out — the attempt is over and
   * has to be handed back unstarted (take.tsx posts the abandon call).
   */
  onAttentionTimeout: () => void;
  /** Leave the stopped attempt — back to the respondent's dashboard. */
  onRestart: () => void;
  /** Set when the abandon call failed, shown inside the stopped modal. */
  attentionResetError?: string;
}) {
  const questions = detail.questions;
  const startAt = Math.max(0, Math.min(questions.length - 1, initialIndex));
  const [index, setIndex] = useState(startAt);
  const total = questions.length;
  // Absolute indices the respondent has actually landed on. Leaving one
  // unanswered is what makes it a SKIP rather than a question not reached yet
  // — the navigator marks the two differently, so this has to be tracked.
  const [visited, setVisited] = useState<Set<number>>(() => new Set([startAt]));
  // Cleanup mode: forward has had to jump BACKWARDS at least once, so the
  // paper is no longer being read in order. Raised further down, where the
  // wrap is detected; from then on EVERY unanswered question is marked,
  // visited or not, and the pending banner names them.
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => {
    setVisited((seen) => (seen.has(index) ? seen : new Set(seen).add(index)));
  }, [index]);

  const q = questions[index];
  const progress = Math.round(((index + 1) / total) * 100);
  const isScale = q.questionType === 'LINEAR_SCALE';
  // Columns for the phone-only stacked grid below. Up to five points sit on one
  // line; beyond that they split over two balanced lines rather than shrinking
  // every label past reading.
  const gridColumns = q.options.length <= 5 ? Math.max(1, q.options.length) : Math.ceil(q.options.length / 2);
  // The same points folded onto two lines on a phone-width screen — but only
  // when the labels need it. Five columns give each point about 48px of text at
  // 390px: enough for "Agree" or a number, not for "Sometimes", which would
  // have to break mid-word. Short scales therefore stay one line at every
  // width. Read by .scale-grid in styles.css.
  const longestOptionLabel = q.options.reduce((n, o) => Math.max(n, (o.optionText ?? '').length), 0);
  const gridColumnsNarrow =
    gridColumns <= 3 || longestOptionLabel <= 6 ? gridColumns : Math.ceil(gridColumns / 2);
  const isGrid = q.questionType === 'LIKERT_GRID';
  const isText = q.questionType === 'SHORT_ANSWER';
  // Every slot this question must fill: one per grid row, otherwise one for
  // the question itself. Mirrors slotsOf() in PortalAssessmentService.
  const slotsOf = (qq: PortalQuestion): string[] =>
    qq.questionType === 'LIKERT_GRID'
      ? qq.rows.map((r) => answerKey(qq.questionId, r.questionRowId))
      : [answerKey(qq.questionId)];
  const picked = (slot: string): number[] => answers[slot] ?? [];
  // The answer maps are parameters defaulting to live state: the auto-advance
  // timer has to judge the answer the tap JUST produced, which the render's
  // `answers` does not know about yet. Every other caller passes nothing.
  const slotSatisfied = (
    qq: PortalQuestion,
    slot: string,
    a: Record<string, number[]> = answers,
    t: Record<string, string> = textAnswers,
  ): boolean => {
    // Free text has nothing to count: min/maxSelections arrive as 1/1 like
    // any single choice, and against zero options that would reject every
    // possible answer. Non-blank IS the rule, exactly as on the server.
    if (qq.questionType === 'SHORT_ANSWER') {
      return (t[slot] ?? '').trim().length > 0;
    }
    const n = (a[slot] ?? []).length;
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
  // If the respondent doesn't interact for 2 minutes, a popup nudges them to
  // focus; dismissing it (Resume) bumps the attempt's popup count (persisted at
  // submit) and restarts the countdown. Any activity resets it. The timer
  // only runs on this questions screen — the gate steps are separate pages —
  // but it does NOT pause while the browser tab is hidden: switching away is
  // itself a lapse in attention, so the countdown carries on and the popup is
  // there (or fires) whether or not anyone is looking. Returning to the tab
  // does not reset it either; only real interaction does.
  const INACTIVITY_MS = 2 * 60_000;
  const [showFocusModal, setShowFocusModal] = useState(false);
  const focusTimer = useRef<number | null>(null);
  // When the armed countdown is due. Browsers throttle timers in a hidden tab,
  // so the setTimeout alone can run late (or not at all, if the tab is frozen);
  // this lets the visibility handler see a countdown that already elapsed and
  // fire the popup on return. Same reason the attention clock below is
  // deadline-based rather than a decrementing tally.
  const focusDeadline = useRef<number | null>(null);
  // Ref mirror of the modal state so timer/visibility callbacks read it without
  // being re-created — while the popup is up, activity must NOT reset anything.
  const modalOpenRef = useRef(false);

  // ── Attention timer (per-assessment) ────────────────────────────────────
  // With attentionTimer on, the popup carries a deadline: ten minutes to
  // answer it. The clock runs ONLY while the popup is on screen, and EVERY
  // popup starts a fresh ten — dismissing it does not bank the remainder, so
  // nothing accumulates across the attempt. Sitting out one full countdown is
  // the only way to reach zero, and reaching it stops the attempt, resets it
  // to NOT_STARTED, and sends the respondent back to start over.
  //
  // So this catches a respondent who WALKED AWAY, not one who is merely
  // distracted: there is deliberately no ceiling on how many popups an
  // attempt may collect. What records that is popUpCount — tallied here,
  // persisted at submit, and read by the practitioner afterwards.
  //
  // The countdown is DEADLINE-based, not a decrementing counter: browsers
  // throttle timers in a background tab, so a tick-per-second tally would
  // grant extra minutes to whoever leaves the popup open in another tab. The
  // interval only reads the clock; the remaining time is (deadline - now).
  const ATTENTION_BUDGET_MS = 10 * 60_000;
  const attentionOn = detail.attentionTimer;
  // Drives the clock drawn inside the popup; the countdown itself runs off
  // the deadline below, so this is display state and nothing reads it back.
  const [attentionLeftMs, setAttentionLeftMs] = useState(ATTENTION_BUDGET_MS);
  // When the running countdown hits zero; null while no popup is up.
  const attentionDeadline = useRef<number | null>(null);
  const attentionTicker = useRef<number | null>(null);
  const [attentionExpired, setAttentionExpired] = useState(false);
  // The timeout is a one-way door and fires a write — never twice.
  const attentionFired = useRef(false);

  const clearFocusTimer = () => {
    if (focusTimer.current !== null) {
      window.clearTimeout(focusTimer.current);
      focusTimer.current = null;
    }
    focusDeadline.current = null;
  };
  const stopAttentionTicker = () => {
    if (attentionTicker.current !== null) {
      window.clearInterval(attentionTicker.current);
      attentionTicker.current = null;
    }
  };
  /** Countdown ran out: stop everything, show the stopped modal, reset the attempt. */
  const expireAttention = () => {
    if (attentionFired.current) return;
    attentionFired.current = true;
    stopAttentionTicker();
    clearFocusTimer();
    attentionDeadline.current = null;
    setAttentionLeftMs(0);
    setAttentionExpired(true);
    onAttentionTimeout();
  };
  /** Start the countdown — called as the popup goes up. Always a full ten. */
  const runAttentionTimer = () => {
    if (!attentionOn || attentionFired.current) return;
    attentionDeadline.current = Date.now() + ATTENTION_BUDGET_MS;
    // Set the clock before the first tick, or the popup opens showing 0:00
    // (or the previous countdown's last value) for up to half a second.
    setAttentionLeftMs(ATTENTION_BUDGET_MS);
    stopAttentionTicker();
    attentionTicker.current = window.setInterval(() => {
      const left = (attentionDeadline.current ?? 0) - Date.now();
      if (left <= 0) {
        expireAttention();
        return;
      }
      setAttentionLeftMs(left);
    }, 500);
  };
  /**
   * Stop the countdown — called as the popup is dismissed. What is left is
   * DISCARDED, not banked: the next popup is a fresh ten minutes.
   */
  const stopAttentionTimer = () => {
    if (attentionDeadline.current === null) return;
    attentionDeadline.current = null;
    stopAttentionTicker();
    setAttentionLeftMs(ATTENTION_BUDGET_MS);
  };

  /** Put the popup up and start its attention countdown. Never twice over. */
  const openFocusPopup = () => {
    if (modalOpenRef.current || attentionFired.current) return;
    clearFocusTimer();
    modalOpenRef.current = true;
    setShowFocusModal(true);
    runAttentionTimer();
  };
  const armFocusTimer = () => {
    clearFocusTimer();
    focusDeadline.current = Date.now() + INACTIVITY_MS;
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      openFocusPopup();
    }, INACTIVITY_MS);
  };
  // Any respondent activity restarts the countdown — unless the popup is up,
  // when the only way forward is the Resume button.
  const noteActivity = () => {
    if (modalOpenRef.current) return;
    armFocusTimer();
  };
  const dismissFocusPopup = () => {
    // The budget may have run out between the click and this handler; the
    // stopped modal has no Resume, but a queued click must not restart the run.
    if (attentionFired.current) return;
    stopAttentionTimer();
    modalOpenRef.current = false;
    setShowFocusModal(false);
    onFocusPopup();
    armFocusTimer();
  };

  useEffect(() => {
    armFocusTimer();
    const onVisibility = () => {
      // Neither countdown pauses for a hidden tab. The attention budget runs
      // because walking away from the popup is exactly what it is counting;
      // the inactivity countdown runs because switching tabs mid-assessment
      // is itself the inattention it is watching for. Nothing to do on the
      // way out, then — and on the way back, only catch the case where the
      // deadline passed while a throttled or frozen timer never fired.
      if (document.hidden || modalOpenRef.current) return;
      if (focusDeadline.current !== null && Date.now() >= focusDeadline.current) {
        openFocusPopup();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearFocusTimer();
      stopAttentionTicker();
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
    // Auto-advance needs an interaction that is ATOMIC AND TERMINAL: one
    // gesture that both answers the question and finishes it. A tap on a
    // choice is that — single choice, EQUALS on its last tick, or a grid once
    // EVERY row is filled. Under MIN/MAX there is no such signal, and
    // advancing would slide the page away mid-selection.
    //
    // A LINEAR_SCALE never qualifies, whatever the numbers say. Its cap is 1,
    // so any point looks "settled", but the control is a slider: onChange
    // fires on every value the thumb passes, a click on the track is already
    // a full answer, and 350ms is not long enough to move 7 to 6. Worse, a
    // stray click would record a number the respondent never meant AND carry
    // them off the question before they saw it — the very failure the unset
    // thumb exists to prevent, arriving from the other end.
    const settled = slotsOf(q).every((s) => {
      const n = (updated[s] ?? []).length;
      return n === q.minSelections && n === q.maxSelections;
    });
    if (!autoNext || isScale || !settled) return;
    // Where the beat after the tap lands: the next BLANK — computed from the
    // answers this tap just produced, because the render's `pending` still
    // counts the question they have this moment finished. Null means nothing
    // is blank any more, and then it stays put: auto-advance exists to carry
    // someone through work, not through finished work, and the bar is already
    // offering Submit. Being last is not the end condition — blanks can lie
    // in front of the last question.
    const after = questions
      .map((_, qi) => qi)
      .filter((qi) => !isQuestionAnswered(qi, updated, textAnswers));
    const target = nextPendingFrom(index, after);
    if (target === null) return;
    clearAdvance();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      setIndex(target);
    }, 350);
  };

  const isQuestionAnswered = (
    qi: number,
    a: Record<string, number[]> = answers,
    t: Record<string, string> = textAnswers,
  ): boolean => {
    const qq = questions[qi];
    if (qq === undefined) return false;
    return slotsOf(qq).every((slot) => slotSatisfied(qq, slot, a, t));
  };
  const answeredCount = questions.reduce((n, _, i) => n + (isQuestionAnswered(i) ? 1 : 0), 0);

  // ── Live-tracking heartbeat ─────────────────────────────────────────────
  // Tells the admin tracking page where this respondent is: an immediate
  // ping on every question change plus one every 10s in between. Redis-only
  // on the server and best-effort here — failures are swallowed, and the
  // page reads silence itself as the signal (no signal → disconnected). The
  // ref keeps the interval's payload current without re-arming the timer on
  // every answer selection; browsers throttling hidden-tab timers is
  // deliberately unfought, since a hidden tab SHOULD read as silence.
  const HEARTBEAT_MS = 10_000;
  const beatRef = useRef({ currentQuestion: 1, answeredCount: 0, totalQuestions: total });
  beatRef.current = { currentQuestion: index + 1, answeredCount, totalQuestions: total };
  useEffect(() => {
    const ping = () => {
      // An abandoned attempt must fall silent — the abandon call just
      // deleted the server-side beat, and re-creating it would show a
      // stopped respondent as live. Mid-submit pings are skipped the same
      // way; submit deletes the beat too.
      if (attentionFired.current || submitting) return;
      portalAssessmentsApi
        .heartbeat(detail.respondentAssessmentMappingId, beatRef.current)
        .catch(() => {
          /* silence is itself the disconnection signal */
        });
    };
    ping();
    const t = window.setInterval(ping, HEARTBEAT_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // ── Partial-answer saving ───────────────────────────────────────────────
  // Two triggers, both sending the FULL snapshot (take.tsx builds it): the
  // respondent crossing into another section, or — when the paper has no
  // sections to cross between — every few newly answered questions. Refs,
  // not state: a save must never cause a redraw. Both no-op when
  // onPartialSave is absent (the assessment's toggle is off).
  const PARTIAL_SAVE_EVERY = 5;
  const sectionKeyOf = (qi: number): string =>
    questions[qi]?.sectionId != null ? String(questions[qi].sectionId) : '__none__';
  const distinctSections = new Set(questions.map((_, qi) => sectionKeyOf(qi))).size;
  const lastSectionKey = useRef(sectionKeyOf(startAt));
  // Starts at the mount count so a resume never re-saves what was just
  // backfilled from the very snapshot being written.
  const lastSavedCount = useRef(answeredCount);
  useEffect(() => {
    if (!onPartialSave) return;
    const key = sectionKeyOf(index);
    if (key !== lastSectionKey.current) {
      lastSectionKey.current = key;
      lastSavedCount.current = answeredCount;
      onPartialSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  useEffect(() => {
    if (!onPartialSave || distinctSections > 1) return;
    if (answeredCount - lastSavedCount.current >= PARTIAL_SAVE_EVERY) {
      lastSavedCount.current = answeredCount;
      onPartialSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredCount]);

  // Group questions into ordered sections (preserving first-appearance order),
  // keeping each question's absolute index so navigation still works. Flat
  // questionnaires collapse to a single untitled group.
  //
  // First appearance IS section order: the server delivers every question of
  // section 1, then every question of section 2 — so each group's indices are
  // one contiguous run.
  const sectionById = new Map(detail.sections.map((s) => [s.sectionId, s]));
  const sections: { key: string; title: string | null; instruction: string | null; indices: number[] }[] = [];
  const sectionByKey = new Map<string, number>();
  questions.forEach((qq, qi) => {
    const key = qq.sectionId !== null ? String(qq.sectionId) : '__none__';
    let pos = sectionByKey.get(key);
    if (pos === undefined) {
      const section = qq.sectionId !== null ? sectionById.get(qq.sectionId) : undefined;
      pos = sections.length;
      sectionByKey.set(key, pos);
      sections.push({
        key,
        title: section?.name?.trim() || null,
        // isBlankRichText, not trim(): an author who emptied the editor left
        // "<p><br></p>" behind, which would draw an empty section banner.
        instruction: isBlankRichText(section?.instruction) ? null : (section?.instruction ?? null),
        indices: [],
      });
    }
    sections[pos].indices.push(qi);
  });
  const hasSections = sections.some((s) => s.title);

  // Absolute index → where that question sits INSIDE its section, which is
  // how it is NUMBERED. A placement's sortOrder is per-section on the backend
  // and the authoring wizard numbers each section from 1, so a global running
  // number would show "27" where the author sees "7".
  const placeOf = new Map<number, { pos: number; title: string | null; instruction: string | null }>();
  sections.forEach((sec) => {
    sec.indices.forEach((qi, pos) => {
      placeOf.set(qi, {
        pos,
        title: sec.title,
        // Only the section's first question carries it — this is the banner
        // shown when the respondent crosses into a new section.
        instruction: pos === 0 ? sec.instruction : null,
      });
    });
  });
  const here = placeOf.get(index);
  // The question index panel lets respondents see their progress and jump
  // between questions. Per-assessment toggle (create/edit form); defaults on.
  const showIndex = detail.showQuestionIndex;
  // Phones get the same panel as a disclosure instead of a sidebar, CLOSED by
  // default: rendered open it is a full screen of numbered squares plus a
  // legend sitting on top of the question, which is what pushed the question
  // itself below the fold. Collapsed it costs one 44px row.
  const [navOpen, setNavOpen] = useState(false);

  // How a question is NAMED when we have to point at it — "Section B · Q4",
  // numbered inside its section exactly as the navigator numbers it, so the
  // label sends them to the square they are looking at. Flat questionnaires
  // (no section names) get the plain number. PortalAssessmentService builds
  // the same string server-side for the submit-validator messages.
  const labelOf = (qi: number): string => {
    const place = placeOf.get(qi);
    if (place === undefined) return `Q${qi + 1}`;
    return place.title ? `${place.title} · Q${place.pos + 1}` : `Q${place.pos + 1}`;
  };
  // Every question still short of its rule, in delivery order. Recomputed
  // each render, so the pending banner shrinks as they fill them in and
  // disappears on its own once nothing is left.
  const pending = questions.map((_, qi) => qi).filter((qi) => !isQuestionAnswered(qi));
  // Marked amber in the navigator: left unanswered after being visited, or —
  // once the sweep has started — anything still unanswered, including blanks
  // that were jumped straight over and never opened.
  const isSkipped = (qi: number): boolean =>
    !isQuestionAnswered(qi) && (sweeping || visited.has(qi));
  const PENDING_SHOWN = 5;
  // Where forward goes. While ANYTHING is blank it means "the next blank",
  // wrapping past the end so a question skipped early is still reached from
  // the last one. Once nothing is blank it is the ordinary next question
  // again, so a finished paper can still be paged through for review.
  const nextTarget = pending.length > 0
    ? nextPendingFrom(index, pending)
    : isLast ? null : index + 1;
  const showNext = nextTarget !== null;
  // Submit exists only when the paper is complete. It is never rendered and
  // then refused: an unfinished assessment simply has no Submit button, and
  // Next is what walks them to the state where one appears.
  const showSubmit = pending.length === 0;
  // Forward is about to jump BACKWARDS — everything ahead is answered and only
  // earlier blanks are left. That is the moment the missing Submit button
  // needs explaining, so the banner is raised on ARRIVING at this state, not
  // on pressing anything. Sticky for the rest of the sweep: a banner that
  // vanished whenever the next blank happened to lie ahead would flicker on
  // and off between hops.
  const wrapping = nextTarget !== null && nextTarget < index;
  useEffect(() => {
    if (wrapping) setSweeping(true);
  }, [wrapping]);
  useEffect(() => {
    if (pending.length === 0) setSweeping(false);
  }, [pending.length]);

  // Belt and braces: Submit is only rendered with nothing pending, so this
  // branch cannot normally fire. An incomplete set must never reach the
  // server, and if one ever tried, the respondent belongs on the first blank.
  const trySubmit = () => {
    if (pending.length > 0) {
      goTo(pending[0]);
      return;
    }
    onSubmit();
  };

  // The navigator, rendered twice: as the sticky sidebar on a large screen and
  // as a collapsed disclosure above the question on a phone. Defined once, so
  // the two can never drift.
  const navigatorBody = (
    <>
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
              <div className="grid grid-cols-8 sm:grid-cols-10 lg:grid-cols-5 gap-1.5">
                {/* pos is the number the respondent sees — it restarts at 1
                    in every section, matching the authoring screen. qi stays
                    the absolute index, which is what navigation and answers
                    use. */}
                {sec.indices.map((qi, pos) => {
                  const qq = questions[qi];
                  const isCurrent = qi === index;
                  const isAnswered = isQuestionAnswered(qi);
                  const skipped = isSkipped(qi);
                  return (
                    <button
                      key={qq.questionId}
                      type="button"
                      onClick={() => {
                        goTo(qi);
                        // Jumping from the phone sheet closes it, so the
                        // question landed on is what fills the screen.
                        setNavOpen(false);
                      }}
                      title={`${sec.title ? `${sec.title} · ` : ''}Question ${pos + 1}${
                        isAnswered ? ' — answered' : skipped ? ' — not answered' : ''
                      }`}
                      className={cn(
                        'h-9 lg:h-8 w-full rounded-md text-xs font-medium border transition-colors',
                        isCurrent
                          ? 'border-primary bg-primary text-primary-foreground'
                          : isAnswered
                            ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20'
                            : skipped
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {pos + 1}
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
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-500/20 border border-amber-500/50" /> Skipped
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border border-border bg-background" /> Not answered
        </div>
      </div>
    </>
  );

  return (
    // min-h-dvh, not min-h-screen: 100vh on a mobile browser counts the
    // retracting address bar, so a 100vh screen never quite fits one.
    <div
      className="flex-1 min-h-dvh w-full bg-muted/20"
      onPointerDown={noteActivity}
      onKeyDown={noteActivity}
    >
      <BrandHeader
        title={title}
        subtitle={subtitle}
        maxWidth={showIndex ? '6xl' : '3xl'}
        progress={progress}
        /* Section name + the GLOBAL count: the navigator numbers restart at 1
           in each section, so the header is where "how far through the whole
           assessment am I" still has to be answerable. */
        right={(
          <div className="text-xs text-muted-foreground shrink-0">
            {/* A phone has no room for "Section B · Question 3 of 40" beside
                the assessment name, so the wording shortens to the part that
                matters rather than wrapping or truncating. */}
            <span className="hidden sm:inline">
              {here?.title ? `${here.title} · ` : ''}Question {index + 1} of {total}
            </span>
            <span className="sm:hidden font-medium tabular-nums">
              {index + 1} / {total}
            </span>
          </div>
        )}
      />

      <div
        className={cn(
          'mx-auto px-4 py-5 sm:px-5 sm:py-8',
          showIndex
            ? 'max-w-6xl grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-4 sm:gap-6'
            : 'max-w-3xl',
        )}
      >
        {showIndex && (
          <>
            {/* PHONE / TABLET — a single collapsed row. Open it to jump, and
                jumping closes it again. Rendered as the sidebar is on desktop
                it would be a grid of forty squares plus a legend standing
                between the respondent and the question. */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setNavOpen((o) => !o)}
                aria-expanded={navOpen}
                className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-sm shadow-xs transition-colors hover:border-primary/40"
              >
                <span className="flex items-center gap-2 min-w-0 font-medium">
                  <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">Question index</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {answeredCount}/{total} answered
                  </span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', navOpen && 'rotate-180')} />
                </span>
              </button>
              {navOpen && (
                <Card className="mt-2">
                  {/* Capped and scrollable: a sixty-question paper would
                      otherwise be a screenful of squares to scroll past. */}
                  <CardContent className="p-4 max-h-[45dvh] overflow-y-auto overscroll-contain">
                    {navigatorBody}
                  </CardContent>
                </Card>
              )}
            </div>

            <aside className="hidden lg:block lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardContent className="p-4">{navigatorBody}</CardContent>
              </Card>
            </aside>
          </>
        )}

        <main>
          {/* The section's own instruction, on the question that opens it —
              the respondent's only signal that they have crossed from one
              section into the next. Authored per section in the wizard;
              sections without one show nothing. */}
          {here?.instruction && (
            <div className="mb-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              {here.title && (
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{here.title}</p>
              )}
              <RichText value={here.instruction} className="mt-1 text-sm text-foreground" />
            </div>
          )}
          <Card>
            <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {q.stem && <p className="text-[0.9375rem] sm:text-base font-medium leading-relaxed">{q.stem}</p>}
              {/* The author's help text. Deliberately quieter than the stem
                  and pulled tight under it (-mt-2 against the container's
                  space-y): it qualifies the question rather than adding a
                  second one, and reading as a separate paragraph would make a
                  respondent look for something to answer in it. */}
              {q.description && (
                <p className="-mt-2 sm:-mt-3 text-sm text-muted-foreground leading-relaxed">
                  {q.description}
                </p>
              )}
              <Media url={q.mediaUrl ?? undefined} type={mediaTypeFor(q.contentType, q.mediaUrl)} />

              {isGrid && (
                /* Every row is mandatory, so the count is the thing to show:
                   on a long grid an unrated row is easy to scroll past. */
                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs font-medium',
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
                    'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
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
                <>
                  {/* PHONE — one block per statement, its scale laid out left
                      to right underneath it. The table below needs a sideways
                      swipe to reach the last column on a 390px screen, and a
                      column the respondent never scrolled to is a column they
                      never considered. Stacking keeps every point on screen
                      and still reads in scale order, which is the one thing a
                      Likert row cannot lose. */}
                  <div className="sm:hidden space-y-2.5">
                    {q.rows.map((row, ri) => {
                      const slot = answerKey(q.questionId, row.questionRowId);
                      const rowPicked = picked(slot);
                      const rowDone = slotSatisfied(q, slot);
                      return (
                        <div
                          key={row.questionRowId}
                          className={cn(
                            'rounded-lg border p-3',
                            rowDone ? 'border-border bg-background' : 'border-primary/30 bg-primary/[0.03]',
                          )}
                        >
                          <p className="flex gap-2 text-sm">
                            <span className="shrink-0 text-xs text-muted-foreground">{ri + 1}.</span>
                            <span>{row.rowText}</span>
                          </p>
                          {/* An even grid rather than flex-wrap: wrapping
                              stretched the leftover option across the whole
                              second line, which read as a bigger, different
                              kind of choice than the four beside it. */}
                          <div
                            className="scale-grid mt-2.5 gap-1.5"
                            style={
                              {
                                '--scale-cols': gridColumns,
                                '--scale-cols-narrow': gridColumnsNarrow,
                              } as CSSProperties
                            }
                          >
                            {q.options.map((opt, oi) => {
                              const on = rowPicked.includes(opt.optionId);
                              return (
                                <button
                                  key={opt.optionId}
                                  type="button"
                                  onClick={() => selectOption(opt.optionId, row.questionRowId)}
                                  aria-pressed={on}
                                  className={cn(
                                    // break-words is the backstop: the column
                                    // count already gives each point room for
                                    // an ordinary label, but nothing stops an
                                    // author writing one long word.
                                    'min-h-11 rounded-md border px-1 py-1.5 text-[0.625rem] font-medium leading-tight break-words transition-colors',
                                    on
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-border bg-background text-muted-foreground',
                                  )}
                                >
                                  {opt.optionText || `Option ${oi + 1}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* TABLET AND UP — rows x shared columns, one pick per row.
                     Every row is mandatory, so an unanswered one is marked
                     rather than left to be discovered by the Next button. The
                     table scrolls sideways rather than wrapping, because a
                     Likert row is only readable in scale order. */}
                  <div className="hidden sm:block overflow-x-auto overscroll-x-contain -mx-2 px-2">
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
                </>
              ) : isText ? (
                /* Free text. No auto-advance: there is no moment that says
                   "done" while someone is typing, and sliding the page away
                   mid-sentence is the worst thing this screen could do. */
                <textarea
                  rows={3}
                  value={textAnswers[answerKey(q.questionId)] ?? ''}
                  onChange={(e) =>
                    setTextAnswers({ ...textAnswers, [answerKey(q.questionId)]: e.target.value })
                  }
                  placeholder="Type your answer…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              ) : isScale ? (
                /* A slider, not a row of buttons — which is what lets the
                   author pick any range: 0—100 is unusable as a hundred
                   buttons and natural as a track.

                   It starts UNSET, and that is the important part. A thumb
                   parked at the midpoint would make an untouched question
                   look answered, and every respondent who skipped it would
                   silently record the middle — invisible in the data
                   afterwards. Until they interact there is no value, and
                   Next stays closed.

                   Underneath it is still an ordinary cap-1 question: the
                   value maps to the option whose text is that number and
                   goes through selectOption, so submitting is unchanged. */
                <ScaleSlider
                  question={q}
                  selectedOptionId={selected[0]}
                  onPick={(optionId) => selectOption(optionId)}
                />
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
                        'w-full text-left rounded-lg border p-3.5 sm:p-4 transition-colors',
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
                          {/* space-y-2 would put this as far from its own
                              label as the label is from the next option, so
                              it is pulled back up — help text has to read as
                              part of the choice it qualifies. */}
                          {opt.description && (
                            <p className="-mt-1 text-xs text-muted-foreground leading-relaxed">
                              {opt.description}
                            </p>
                          )}
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

          {/* Raised once forward starts jumping backwards, and cleared by
              answering — the list is live, so it shrinks as they work through
              it. Long lists are capped: naming twenty questions is a wall of
              text, and the chips are for jumping, not for taking inventory. */}
          {sweeping && pending.length > 0 && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                {pending.length} question{pending.length === 1 ? '' : 's'} still to answer
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {pending.slice(0, PENDING_SHOWN).map((qi) => (
                  <button
                    key={questions[qi].questionId}
                    type="button"
                    onClick={() => goTo(qi)}
                    className="rounded-md border border-red-300 dark:border-red-800 bg-background px-2 py-1 text-[0.6875rem] font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    {labelOf(qi)}
                  </button>
                ))}
                {pending.length > PENDING_SHOWN && (
                  <span className="text-[0.6875rem] text-red-700/80 dark:text-red-400/80">
                    and {pending.length - PENDING_SHOWN} more
                  </span>
                )}
              </div>
              {/* The chips only reach the first few; the button reaches all of
                  them, one at a time. Said here because this is where they
                  are reading when it changes under them. */}
              {showNext && (
                <p className="mt-2 text-[0.6875rem] text-red-700/80 dark:text-red-400/80">
                  Next takes you to the next pending question.
                </p>
              )}
            </div>
          )}

          {/* The other end of the same sweep: nothing left, and Submit is now
              in the bar under them rather than at the end of the paper. Only
              away from the last question — there Submit is where it has
              always been and needs no announcement. */}
          {pending.length === 0 && !isLast && (
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-green-500/40 bg-green-500/5 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>All {total} questions answered — you can submit now.</span>
            </div>
          )}

          {submitError && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {submitError}
            </div>
          )}

          {/* Pinned to the bottom of the phone screen, in normal flow from sm
              up. On a long question — a twenty-row grid, ten options with
              images — Next was a scroll away at the end of the page; pinned,
              the way forward is always under the thumb. Sticky and never
              fixed, so it still comes to rest at the end of the content, and
              the safe-area inset keeps it clear of the home indicator. */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            {/* All three buttons show in one state only — a cleared sweep,
                mid-paper — and there Previous drops its label on a phone so
                the two that matter keep a full-width target. */}
            <Button
              variant="outline"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              className={cn(
                'h-11 sm:h-8.5 sm:flex-none',
                showNext && showSubmit ? 'flex-none px-3' : 'flex-1',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className={cn(showNext && showSubmit && 'sr-only sm:not-sr-only')}>Previous</span>
            </Button>
            {nextTarget !== null && (
              <Button
                /* Demoted to outline while Submit stands beside it: one
                   primary action on screen, and it is the one that ends the
                   assessment. */
                variant={showSubmit ? 'outline' : 'primary'}
                onClick={() => goTo(nextTarget)}
                disabled={!answered}
                className="h-11 flex-1 sm:h-8.5 sm:flex-none"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
            {showSubmit && (
              <Button
                variant="primary"
                onClick={trySubmit}
                disabled={!answered || submitting}
                className="h-11 flex-1 sm:h-8.5 sm:flex-none"
              >
                {submitting ? 'Submitting...' : (
                  <span>
                    Submit<span className={cn(showNext && 'hidden sm:inline')}> Assessment</span>
                  </span>
                )}
                <Check className="h-4 w-4" />
              </Button>
            )}
          </div>
        </main>
      </div>

      {(showFocusModal || attentionExpired) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-sm">
            {attentionExpired ? (
              /* The budget is gone. Same modal, different state — the
                 respondent is not being nudged any more, the attempt is over
                 and the only way on is out. No Resume: the attempt has already
                 been handed back unstarted, so continuing here would type
                 answers into an attempt the server no longer considers
                 in flight. */
              <CardContent className="p-6 space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                  <TimerOff className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Assessment stopped</h2>
                  <p className="text-sm text-muted-foreground">
                    A focus reminder went unanswered for {ATTENTION_BUDGET_MS / 60_000} minutes,
                    so this attempt has been stopped. It has been reset — start it again
                    from your dashboard whenever you are ready.
                  </p>
                </div>
                {attentionResetError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                    {attentionResetError}
                  </p>
                )}
                <Button variant="primary" className="w-full" onClick={onRestart}>
                  Restart Assessment
                </Button>
              </CardContent>
            ) : (
              <CardContent className="p-6 space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Still with us?</h2>
                  <p className="text-sm text-muted-foreground">
                    We noticed you've stepped away for a moment. Tap below whenever
                    you're ready to pick up where you left off.
                  </p>
                </div>
                {/* Only with the timer armed: what it costs to sit here. The
                    number is the WHOLE attempt's remaining budget, not this
                    popup's — that is what actually runs out. */}
                {attentionOn && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                    <div className="flex items-center justify-center gap-2">
                      <Timer className="h-6 w-6 shrink-0" />
                      {/* tabular-nums: the digits change twice a second, and
                          proportional ones re-measure the line each time —
                          the clock would twitch while they are reading it. */}
                      <span className="text-3xl font-bold tabular-nums tracking-tight">
                        {formatCountdown(attentionLeftMs)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium">remaining before your session resets</p>
                  </div>
                )}
                <Button variant="primary" className="w-full" onClick={dismissFocusPopup}>
                  Resume Assessment
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
