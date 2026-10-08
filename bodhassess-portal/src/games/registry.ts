import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { PortalGamePart } from '@/lib/api';

// ── The game contract ───────────────────────────────────────────────────────
// ONE GAME = ONE FILE. Each file in this folder default-exports a component
// that owns everything about its game — screens, timings, groups, scoring,
// telemetry — and talks to the outside world through exactly this:

/**
 * What a game hands back: one entry per PART of the game, in the order
 * played, each already in game_result's column shape (PortalGamePart) — so
 * the game file, not anything downstream, decides how its numbers map onto
 * the columns. Baseline is one part; Color Clash + Mackworth Clock is two.
 */
export interface GameResult {
  parts: PortalGamePart[];
}

export interface GameProps {
  /**
   * Call ONCE, when the game is over (completed, timed out, or its end
   * condition met). The renderer then records the result and hands the
   * respondent back to the question. There is no "cancel": a running game
   * has no way out but its own end.
   */
  onComplete: (result: GameResult) => void;
  /**
   * True while the respondent is AWAY from the game — the tab is hidden, the
   * window has lost focus (another app, minimised) — and until they press
   * Resume on the renderer's warning. While true a game must freeze
   * everything that runs on time (rounds, countdowns, response windows,
   * pointer telemetry) and leave that time out of what it reports. It is not
   * a break the respondent chose: never counted in pauseCount /
   * pauseDurationMs. The renderer covers the game meanwhile, so no clicks
   * arrive — but a window-level key listener must ignore it too.
   */
  suspended: boolean;
}

// ── The registry ────────────────────────────────────────────────────────────
// game.code (from the backend's catalog, PortalOption.game) → the file that
// renders it. HARDCODED on purpose: a game is code, so which code plays which
// file is a frontend decision, shipped with the files themselves. Codes are
// stored upper case by the backend.
//
// Lazy, so the take flow's bundle does not carry every game to respondents
// whose assessment has none.
const GAMES: Record<string, LazyExoticComponent<ComponentType<GameProps>>> = {
  BASELINE: lazy(() => import('./baseline')),
  COLOR_CLASH_MACKWORTH: lazy(() => import('./color-clash-mackworth')),
};

/** The component for a game code, or null when this portal build has none. */
export function gameComponentFor(code: string | null | undefined) {
  return code ? (GAMES[code.toUpperCase()] ?? null) : null;
}
