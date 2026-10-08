import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router';
import { AlertTriangle, Check, CirclePause, Gamepad2, Maximize, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PortalGame, PortalOption } from '@/lib/api';
import { gameComponentFor, type GameResult } from './registry';

// ── Fullscreen ──────────────────────────────────────────────────────────────
// Browser fullscreen needs a user gesture, so the Launch button calls this in
// its own click handler — by the time the overlay mounts the gesture is spent.
// Refusal is normal (iPhone Safari has no element fullscreen; an iframe may
// forbid it) and changes nothing: the overlay fills the viewport either way.
// Esc leaves browser fullscreen and cannot be prevented, which is also fine —
// the overlay stays, and with it the game.
export function requestGameFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    /* refused — the overlay is the fullscreen */
  });
}

function exitGameFullscreen() {
  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    document.exitFullscreen().catch(() => {
      /* already left */
    });
  }
}

// ── Records (debug) ─────────────────────────────────────────────────────────
// What is SAVED travels with the submit (take.tsx → game_result, one row per
// part). This is a debugging copy: every finished game is printed to the
// console and appended to localStorage, exactly as it will be submitted.
export const GAME_RECORDS_KEY = 'bodh.gameRecords';
const MAX_STORED_RECORDS = 50;

export interface GameRecord {
  gameId: number;
  gameCode: string;
  gameName: string;
  gameVersion: number;
  /** respondentAssessmentMappingId — which attempt played it. */
  attemptId: number;
  questionId: number;
  optionId: number;
  startedAt: string;
  finishedAt: string;
  /** Launch to finish, instructions and all — each game times its own parts. */
  durationMs: number;
  result: GameResult;
}

function recordGame(record: GameRecord) {
  console.group(`[game] ${record.gameCode} v${record.gameVersion} — question ${record.questionId}`);
  console.log(record);
  console.table(record.result.parts);
  console.groupEnd();
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(GAME_RECORDS_KEY) ?? '[]');
    const records = Array.isArray(stored) ? stored : [];
    records.push(record);
    localStorage.setItem(GAME_RECORDS_KEY, JSON.stringify(records.slice(-MAX_STORED_RECORDS)));
  } catch {
    /* storage full, blocked or private — the console copy stands */
  }
}

// ── The launch card ─────────────────────────────────────────────────────────
// What a GAMES question shows in place of its option list: the game, and one
// way to start it. The option itself is never tappable — it is picked by
// FINISHING the game, so a question cannot read as answered unplayed.
export function GameLaunchCard({
  option,
  completed,
  onLaunch,
}: {
  option: PortalOption;
  completed: boolean;
  onLaunch: () => void;
}) {
  const game = option.game ?? null;
  const playable = game !== null && gameComponentFor(game.code) !== null;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5',
        completed ? 'border-green-500/40 bg-green-500/5' : 'border-border',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            completed ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-primary/10 text-primary',
          )}
        >
          {completed ? <Check className="h-5 w-5" /> : <Gamepad2 className="h-5 w-5" />}
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium">{game?.name || 'Game'}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {completed
              ? 'Completed — you can move on to the next question.'
              : playable
                ? 'Opens full screen and runs until it is finished, so make sure you have time. Stay on this screen while you play — switching tabs or apps pauses the game.'
                : 'This game is not available right now. Please contact your administrator.'}
          </p>
        </div>
      </div>
      {!completed && (
        <Button variant="primary" size="lg" onClick={onLaunch} disabled={!playable} className="h-11 sm:h-10">
          <Play className="h-4 w-4" />
          Launch game
        </Button>
      )}
    </div>
  );
}

// ── Leaving the screen ──────────────────────────────────────────────────────
// A browser says nothing BEFORE a tab switch, an app switch or a minimise —
// the page only hears about it once it has happened. So:
//   before   the launch card says leaving pauses the game, and the two signs
//            of someone about to leave — the pointer leaving the page, full
//            screen being exited — raise a notice. The game keeps running.
//   gone     the tab is hidden, or the window has lost focus for longer than
//            BLUR_GRACE_MS: the game is SUSPENDED (GameProps.suspended) and
//            every game file freezes its own clocks.
//   back     an opaque warning covers the game until Resume is pressed — the
//            game picks up where it stood, and the click re-enters full
//            screen (which needs a gesture; a tab switch exits it).
/** A focus loss shorter than this is a blink (full screen starting, a browser prompt), not leaving. */
const BLUR_GRACE_MS = 300;
/** How long a "stay on this screen" notice stays up. */
const NOTICE_MS = 6000;

type LeaveNotice = 'fullscreen' | 'pointer';

// ── The renderer ────────────────────────────────────────────────────────────
// Renders one game over the whole page, on the SAME page — no route change, no
// reload, the take flow's state untouched underneath. Portalled to <body> so
// the runner can be made inert behind it without making the game inert too.
//
// The respondent cannot leave until the game calls onComplete: Back is
// blocked (useBlocker, swallowed), a reload or tab close asks first
// (beforeunload), and nothing behind the overlay is reachable. Leaving the
// screen pauses the game (above).
class GameErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[game] crashed', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GameRenderer({
  game,
  attemptId,
  questionId,
  optionId,
  onFinished,
  onUnavailable,
}: {
  game: PortalGame;
  attemptId: number;
  questionId: number;
  optionId: number;
  /** The game ended normally; its result has been recorded. */
  onFinished: (result: GameResult) => void;
  /** The game could not run at all (unknown code, failed to load, crashed) — the only other way out. */
  onUnavailable: () => void;
}) {
  const GameComponent = gameComponentFor(game.code);
  const startedAt = useRef(Date.now());
  const finished = useRef(false);
  const overlay = useRef<HTMLDivElement>(null);

  // Back: swallowed while the game runs. useBlocker holds a POP on the URL
  // it came from; reset() keeps the respondent exactly where they are.
  const blocker = useBlocker(true);
  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers only show the prompt when returnValue is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    // The page underneath must not scroll under the game's own scrolling.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus moves INTO the game, off the Launch button — a Space press in a
    // keyboard game must never reach a control behind the overlay.
    overlay.current?.focus();
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.body.style.overflow = overflow;
      exitGameFullscreen();
    };
  }, []);

  // Away: the game is suspended and the warning is up. The ref is for the
  // listeners, which are attached once.
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const [timesAway, setTimesAway] = useState(0);
  const [notice, setNotice] = useState<LeaveNotice | null>(null);

  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const leave = () => {
      if (finished.current || awayRef.current) return;
      awayRef.current = true;
      setAway(true);
      setTimesAway((n) => n + 1);
      setNotice(null);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    // Switching to another app, minimising, or clicking into the address bar
    // only blurs the window — the tab stays visible. Counted once it lasts.
    const onBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (!document.hasFocus()) leave();
      }, BLUR_GRACE_MS);
    };
    const onFocus = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    if (document.visibilityState === 'hidden') leave(); // gone before the game even mounted
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // The warning before leaving. Neither sign stops the game.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const show = (kind: LeaveNotice) => {
      if (finished.current || awayRef.current) return;
      setNotice(kind);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setNotice(null), NOTICE_MS);
    };
    // A mouse heading for the tab strip, the dock or another window leaves
    // the page first. Touch has no pointer to leave with.
    const onMouseLeave = () => show('pointer');
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) show('fullscreen');
      else setNotice((n) => (n === 'fullscreen' ? null : n));
    };
    const root = document.documentElement;
    root.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      root.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const resume = () => {
    awayRef.current = false;
    setAway(false);
    requestGameFullscreen(); // this click is the gesture full screen needs
    overlay.current?.focus();
  };

  const handleComplete = (result: GameResult) => {
    // A game calls this once; a double tap on its last button must not
    // record twice or hand back twice.
    if (finished.current) return;
    finished.current = true;
    const now = Date.now();
    recordGame({
      gameId: game.gameId,
      gameCode: game.code,
      gameName: game.name,
      gameVersion: game.version,
      attemptId,
      questionId,
      optionId,
      startedAt: new Date(startedAt.current).toISOString(),
      finishedAt: new Date(now).toISOString(),
      durationMs: now - startedAt.current,
      result,
    });
    onFinished(result);
  };

  const unavailable = (message: string) => (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
          <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="primary" className="w-full" onClick={onUnavailable}>
          Back to the question
        </Button>
      </div>
    </div>
  );

  return createPortal(
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label={game.name}
      tabIndex={-1}
      // Above everything the take flow draws, the focus popup included. The
      // games paint their own background; this one only shows while loading.
      className="fixed inset-0 z-[1000] overflow-y-auto overscroll-contain bg-[#f5f2ea] outline-none"
    >
      {GameComponent ? (
        <GameErrorBoundary fallback={unavailable('Something went wrong with this game. Go back and launch it again.')}>
          <Suspense
            fallback={
              <div className="flex min-h-dvh items-center justify-center text-sm text-[#8a8578]">Loading game…</div>
            }
          >
            {/* Inert while away: nothing in the game takes focus or a click behind the warning. */}
            <div inert={away}>
              <GameComponent onComplete={handleComplete} suspended={away} />
            </div>
          </Suspense>
        </GameErrorBoundary>
      ) : (
        unavailable(`"${game.name}" is not available in this version of the portal. Please contact your administrator.`)
      )}

      {notice && !away && <LeaveNoticeBanner kind={notice} onDismiss={() => setNotice(null)} />}

      {/* Opaque, like a game's own Pause screen: a frozen round must not be studied. */}
      {away && <AwayWarning timesAway={timesAway} onResume={resume} />}
    </div>,
    document.body,
  );
}

// Drawn over the game in the games' own palette, not the portal theme — the
// games paint a fixed light background whatever the portal's mode.
function AwayWarning({ timesAway, onResume }: { timesAway: number; onResume: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="game-away-title"
      aria-describedby="game-away-body"
      className="fixed inset-0 z-100 flex items-center justify-center bg-[#f5f2ea] p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#ddd7c7] bg-white px-6 py-8 text-center sm:px-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <CirclePause className="h-6 w-6 text-amber-600" />
        </div>
        <h2 id="game-away-title" className="text-lg font-semibold text-[#1a1a1a]">
          Game paused
        </h2>
        <p id="game-away-body" className="mt-2 text-sm leading-relaxed text-[#4a463d]">
          You left the game screen, so the game and its timer have been stopped. Please stay on this screen until
          the game is finished — switching tabs or apps, or minimising, pauses it again.
        </p>
        {timesAway > 1 && (
          <p className="mt-3 text-sm font-medium text-amber-700">You have left the game {timesAway} times.</p>
        )}
        <button
          type="button"
          autoFocus
          onClick={onResume}
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-[#c2820a] px-8 text-sm font-bold uppercase tracking-wider text-[#fff8ea] hover:bg-[#a86f08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2820a]"
        >
          <Play className="h-4 w-4" />
          Resume game
        </button>
      </div>
    </div>
  );
}

function LeaveNoticeBanner({ kind, onDismiss }: { kind: LeaveNotice; onDismiss: () => void }) {
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-3 z-90 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="leading-snug">
            {kind === 'fullscreen' ? 'You have left full screen. ' : ''}
            Stay on this screen until the game ends — switching tabs or apps, or minimising, will pause the game.
          </p>
          {kind === 'fullscreen' && (
            <button
              type="button"
              onClick={requestGameFullscreen}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
            >
              <Maximize className="h-3.5 w-3.5" />
              Back to full screen
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-m-1 rounded p-1 text-amber-700 hover:bg-amber-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
