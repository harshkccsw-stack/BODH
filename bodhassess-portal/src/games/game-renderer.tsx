import { Component, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router';
import { AlertTriangle, Check, Gamepad2, Play } from 'lucide-react';
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
                ? 'Opens full screen. Once it starts it runs until it is finished, so make sure you have time.'
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

// ── The renderer ────────────────────────────────────────────────────────────
// Renders one game over the whole page, on the SAME page — no route change, no
// reload, the take flow's state untouched underneath. Portalled to <body> so
// the runner can be made inert behind it without making the game inert too.
//
// The respondent cannot leave until the game calls onComplete: Back is
// blocked (useBlocker, swallowed), a reload or tab close asks first
// (beforeunload), and nothing behind the overlay is reachable.
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
            <GameComponent onComplete={handleComplete} />
          </Suspense>
        </GameErrorBoundary>
      ) : (
        unavailable(`"${game.name}" is not available in this version of the portal. Please contact your administrator.`)
      )}
    </div>,
    document.body,
  );
}
