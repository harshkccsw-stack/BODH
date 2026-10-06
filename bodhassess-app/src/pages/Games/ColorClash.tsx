import { useState, useRef, useEffect, useCallback } from "react";

/* ============================================================
   PAUSABLE TIMERS
   ------------------------------------------------------------
   Drop-in replacements for setInterval / setTimeout that can be
   paused and resumed without losing their place.

   When paused, each timer remembers how long was left until it
   would next fire. On resume it waits exactly that remaining time,
   then carries on as normal. So a round that was 1.2s from ending
   when the player paused will still end 1.2s after they resume.

   (The same helper is copied into ColorClash and MakeworthClock
   so each game file works on its own.)
   ============================================================ */

/** Like setInterval, but with pause() and resume(). Call start() to begin. */
class PausableInterval {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private nextFireAt = 0;
  private remaining = 0;
  private state: "idle" | "running" | "paused" = "idle";

  private fn: () => void;
  private ms: number;

  constructor(fn: () => void, ms: number) {
    this.fn = fn;
    this.ms = ms;
  }

  start() {
    this.clear();
    this.state = "running";
    this.arm(this.ms);
  }

  pause() {
    if (this.state !== "running") return;
    this.remaining = Math.max(0, this.nextFireAt - Date.now());
    this.clear();
    this.state = "paused";
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "running";
    this.arm(this.remaining);
  }

  stop() {
    this.clear();
    this.state = "idle";
  }

  /** Wait `firstDelay`, fire once, then fire every `ms` after that. */
  private arm(firstDelay: number) {
    this.nextFireAt = Date.now() + firstDelay;
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.nextFireAt = Date.now() + this.ms;
      // Set up the repeating interval BEFORE calling fn, so that if fn
      // calls stop() (e.g. the game ends on this tick) it is cleared too.
      this.intervalId = setInterval(() => {
        this.nextFireAt = Date.now() + this.ms;
        this.fn();
      }, this.ms);
      this.fn();
    }, firstDelay);
  }

  private clear() {
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    if (this.intervalId !== null) clearInterval(this.intervalId);
    this.timeoutId = null;
    this.intervalId = null;
  }
}

/** Like setTimeout, but with pause() and resume(). Starts immediately. */
class PausableTimeout {
  private fn: () => void;
  private id: ReturnType<typeof setTimeout> | null = null;
  private fireAt = 0;
  private remaining: number;
  private done = false;

  constructor(fn: () => void, ms: number) {
    this.fn = fn;
    this.remaining = ms;
    this.schedule();
  }

  pause() {
    if (this.id === null) return;
    clearTimeout(this.id);
    this.id = null;
    this.remaining = Math.max(0, this.fireAt - Date.now());
  }

  resume() {
    if (this.done || this.id !== null) return;
    this.schedule();
  }

  stop() {
    if (this.id !== null) clearTimeout(this.id);
    this.id = null;
    this.done = true;
  }

  private schedule() {
    this.fireAt = Date.now() + this.remaining;
    this.id = setTimeout(() => {
      this.id = null;
      this.done = true;
      this.fn();
    }, this.remaining);
  }
}

/* ============================================================
   1. THE DATA
   ------------------------------------------------------------
   Every color has a NAME (the word we might display/ask about)
   and an actual CSS color it can be drawn in.
   ============================================================ */
type ColorDef = { name: string; css: string };

const COLORS: ColorDef[] = [
  { name: "RED", css: "#ef4444" },
  { name: "BLUE", css: "#3b82f6" },
  { name: "GREEN", css: "#22c55e" },
  { name: "BLACK", css: "#000000" },
  { name: "WHITE", css: "#ffffff" },
  { name: "YELLOW", css: "#eab308" },
  { name: "PURPLE", css: "#a855f7" },
  { name: "ORANGE", css: "#f97316" },
];

const ROUND_MS = 3000; // how often the word + options change
const BLANK_MS = 250; // how long the blank flash lasts
const GAME_SECONDS = 70; // total game length
const NEXT_PRESS_MS = 180; // how long NEXT stays pressed before results are handed over
const TIMER_WARN_SECONDS = 10; // timer border turns red at or below this many seconds

/* 100vh measures the viewport *behind* mobile browser chrome, so the
   option buttons can end up below the fold. dvh tracks the visible
   area instead; we fall back where it isn't supported. */
const VIEWPORT_HEIGHT =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("height: 100dvh")
    ? "100dvh"
    : "100vh";

/** Looks up the actual CSS color for a color name, e.g. "RED" -> "#ef4444". */
function getColorCss(name: string): string {
  return COLORS.find((c) => c.name === name)?.css ?? "#1a1a1a";
}

/** Everything the session recorded, handed to the parent on Next. */
export type ClashResult = {
  hits: number;
  wrong: number;
  omissions: number;
  responseTimes: number[];
  avgLatencyMs: number;
  completionSeconds: number;
  mouseDistancePx: number;
  mouseIdleSeconds: number;
  /**
   * Which pointer types the participant actually used ("mouse", "touch",
   * "pen"). Finger travel and cursor travel are not the same measure, so
   * mouseDistancePx should be read against this rather than pooled.
   */
  inputTypes: string[];
  /** How many times the player paused (always 0 for groups without a Pause button). */
  pauseCount: number;
  /** Total time spent paused, in seconds. Not included in completionSeconds. */
  pausedSeconds: number;
};

/* ============================================================
   2. SMALL HELPERS (pure functions, no React involved)
   ============================================================ */
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const picked: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Builds one round: a printed word + a different ink color + 4 shuffled options. */
function buildRound() {
  const wordChoice = pickRandom(COLORS, 1)[0];

  let inkChoice: ColorDef;
  do {
    inkChoice = pickRandom(COLORS, 1)[0];
  } while (inkChoice.name === wordChoice.name);

  // The correct answer is the INK color the word is drawn in —
  // that's the Stroop trick: read the color, not the printed word.
  const distractorsPool = COLORS.filter((c) => c.name !== inkChoice.name);
  const distractors = pickRandom(distractorsPool, 3).map((c) => c.name);
  const options = shuffle([inkChoice.name, ...distractors]);

  return {
    wordText: wordChoice.name,
    inkCss: inkChoice.css,
    correctAnswer: inkChoice.name,
    options,
  };
}

/* ============================================================
   3. THE COMPONENT
   ------------------------------------------------------------
   showHud: when true (groups 3, 6 and 9), the countdown and the
   running score are shown in the header. When false (every other
   group), nothing about time or performance is displayed.
   Everything is recorded identically either way.

   allowPause: when true (groups 1, 2 and 3), a Pause button sits
   in the header. Pausing freezes the countdown, the current round
   and the reaction-time clock, and hides the word and buttons
   until the player presses Resume.

   Clicking an option gives no right/wrong feedback on screen:
   the clicked button just looks pressed until the next round.
   ============================================================ */
export default function ColorClash({
  onProceed,
  showHud = false,
  allowPause = false,
}: {
  onProceed?: (result: ClashResult) => void;
  showHud?: boolean;
  allowPause?: boolean;
}) {
  // --- State that drives what's on screen ---
  const [wordText, setWordText] = useState("RED");
  const [inkCss, setInkCss] = useState("#ef4444");
  const [options, setOptions] = useState<string[]>(["RED", "BLUE", "GREEN", "BLACK"]);
  const [selected, setSelected] = useState<string | null>(null); // button the player clicked, this round
  const [blank, setBlank] = useState(false); // true only while the stage area is flashed blank
  const [paused, setPaused] = useState(false); // true while the Pause overlay is showing

  // timeLeft is tracked every second. It is shown only when showHud is
  // true; the effect below watches it and ends the session at 0.
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);

  // Performance counters: recorded for the whole session. The score is
  // shown live only when showHud is true; all of them leave this
  // component through onProceed.
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // --- Telemetry state ---
  const [responseTimes, setResponseTimes] = useState<number[]>([]); // ms, one per correct hit
  const [mouseDistance, setMouseDistance] = useState(0); // pixels
  const [idleSeconds, setIdleSeconds] = useState(0);

  // --- NEXT button feedback ---
  const [nextHeld, setNextHeld] = useState(false); // finger / mouse is down on it right now
  const [nextSent, setNextSent] = useState(false); // clicked; results are being handed over
  const nextSentRef = useRef(false); // blocks a second click before state has updated

  // --- Refs for values the interval callbacks need "live", without
  //     re-creating the interval every render ---
  const correctAnswerRef = useRef<string>("RED");
  const answeredRef = useRef(false); // has the player clicked something THIS round?
  const roundTimerRef = useRef<PausableInterval | null>(null);
  const countdownRef = useRef<PausableInterval | null>(null);
  const blankTimerRef = useRef<PausableTimeout | null>(null);

  // --- Pause bookkeeping ---
  const pausedRef = useRef(false); // read by callbacks that must ignore input while paused
  const pauseStartedAtRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const pauseCountRef = useRef(0);

  // --- Telemetry refs ---
  const gameOverRef = useRef(false); // lets the mouse listener check the LATEST game state
  const startTimeRef = useRef<number>(0); // when the current session started
  const elapsedRef = useRef(0); // total task time, frozen the moment the session ends
  const roundStartTimeRef = useRef<number>(0); // when the CURRENT round's options became visible
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const lastMoveTimestamp = useRef<number>(Date.now());
  const distanceRef = useRef(0);
  const idleRef = useRef(0);
  const inputTypesRef = useRef<Set<string>>(new Set());

  /** Swap in a brand-new word + ink color + option set. */
  const newRound = useCallback(() => {
    answeredRef.current = false;
    setSelected(null);
    roundStartTimeRef.current = Date.now(); // the clock starts the moment this round appears

    const round = buildRound();
    correctAnswerRef.current = round.correctAnswer;
    setWordText(round.wordText);
    setInkCss(round.inkCss);
    setOptions(round.options);
  }, []);

  /** Runs every ROUND_MS: blank the stage briefly, then load the next round. */
  const cycleStep = useCallback(() => {
    // If nothing was clicked before this round ended, that's a miss.
    if (!answeredRef.current) {
      setMissCount((m) => m + 1);
    }

    setBlank(true); // ONLY the stage (word + options) blanks — header stays untouched
    blankTimerRef.current?.stop();
    blankTimerRef.current = new PausableTimeout(() => {
      newRound();
      setBlank(false);
    }, BLANK_MS);
  }, [newRound]);

  /** Player clicked one of the 4 option buttons. */
  const handleAnswer = (chosen: string) => {
    if (answeredRef.current || pausedRef.current) return; // ignore extra clicks, and any while paused
    answeredRef.current = true;
    setSelected(chosen);

    if (chosen === correctAnswerRef.current) {
      setScore((s) => s + 1);
      const latency = Date.now() - roundStartTimeRef.current;
      setResponseTimes((rt) => [...rt, latency]);
    } else {
      setWrongCount((w) => w + 1);
    }
  };

  const endGame = useCallback(() => {
    gameOverRef.current = true; // stops the mouse-distance listener from counting anything further
    roundTimerRef.current?.stop();
    countdownRef.current?.stop();
    blankTimerRef.current?.stop();

    // Freeze the elapsed time here rather than recomputing it during
    // render, so the recorded figure is the length of the task itself
    // and not however long the end screen sat there.
    elapsedRef.current = Math.round((Date.now() - startTimeRef.current) / 1000);
    setGameOver(true);
  }, []);

  const startGame = useCallback(() => {
    setTimeLeft(GAME_SECONDS);
    setScore(0);
    setWrongCount(0);
    setMissCount(0);
    setGameOver(false);
    setBlank(false);
    blankTimerRef.current?.stop();

    // Reset pause state for the new session.
    pausedRef.current = false;
    totalPausedMsRef.current = 0;
    pauseCountRef.current = 0;
    setPaused(false);

    // Reset telemetry for the new session.
    gameOverRef.current = false;
    startTimeRef.current = Date.now();
    elapsedRef.current = 0;
    distanceRef.current = 0;
    idleRef.current = 0;
    inputTypesRef.current = new Set();
    lastMoveTimestamp.current = Date.now();
    setResponseTimes([]);
    setMouseDistance(0);
    setIdleSeconds(0);

    newRound();

    roundTimerRef.current?.stop();
    countdownRef.current?.stop();
    roundTimerRef.current = new PausableInterval(cycleStep, ROUND_MS);
    roundTimerRef.current.start();
    countdownRef.current = new PausableInterval(() => {
      setTimeLeft((t) => t - 1);

      // Idle-time bookkeeping: if the mouse hasn't moved in the last
      // full second, count that second as idle.
      if (Date.now() - lastMoveTimestamp.current >= 1000) {
        idleRef.current += 1;
        setIdleSeconds(idleRef.current);
      }
    }, 1000);
    countdownRef.current.start();
  }, [cycleStep, newRound]);

  // Track pointer movement for the "cursor distance" metric. pointermove
  // covers mouse, touch and pen; mousemove alone never fires on a touch
  // device, which would leave distance at 0 and mark every second idle.
  // Attached once on mount; gated by gameOverRef so it stops counting the
  // instant the game ends, even though the listener itself stays attached.
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (gameOverRef.current || pausedRef.current) return; // no tracking after the game ends or while paused
      inputTypesRef.current.add(e.pointerType);
      const pos = { x: e.clientX, y: e.clientY };
      if (lastMousePos.current) {
        const dx = pos.x - lastMousePos.current.x;
        const dy = pos.y - lastMousePos.current.y;
        distanceRef.current += Math.sqrt(dx * dx + dy * dy);
        setMouseDistance(Math.round(distanceRef.current));
      }
      lastMousePos.current = pos;
      lastMoveTimestamp.current = Date.now();
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  // Kick the game off once, on mount.
  useEffect(() => {
    startGame();
    return () => {
      roundTimerRef.current?.stop();
      countdownRef.current?.stop();
      blankTimerRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch the countdown and end the game the moment it hits 0.
  useEffect(() => {
    if (timeLeft <= 0 && !gameOver) {
      endGame();
    }
  }, [timeLeft, gameOver, endGame]);

  /* ---------- Derived ----------
     avgLatency is computed so the parent gets it ready-made in the
     result payload. displayTime never goes below 0 on screen. */
  const avgLatency =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
  const displayTime = Math.max(0, timeLeft);

  const buildResult = (): ClashResult => ({
    hits: score,
    wrong: wrongCount,
    omissions: missCount,
    responseTimes,
    avgLatencyMs: avgLatency,
    completionSeconds: elapsedRef.current,
    mouseDistancePx: mouseDistance,
    mouseIdleSeconds: idleSeconds,
    inputTypes: Array.from(inputTypesRef.current),
    pauseCount: pauseCountRef.current,
    pausedSeconds: Math.round(totalPausedMsRef.current / 1000),
  });

  /** Pause: freeze every timer where it is and cover the stage. */
  const pauseGame = () => {
    if (pausedRef.current || gameOverRef.current) return;
    pausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    pauseCountRef.current += 1;
    roundTimerRef.current?.pause();
    countdownRef.current?.pause();
    blankTimerRef.current?.pause();
    setPaused(true);
  };

  /** Resume: carry on exactly where the game left off. */
  const resumeGame = () => {
    if (!pausedRef.current) return;
    const pausedFor = Date.now() - pauseStartedAtRef.current;
    totalPausedMsRef.current += pausedFor;

    // Shift every "started at" timestamp forward by the pause, so reaction
    // times, total task time and idle time all exclude the paused period.
    startTimeRef.current += pausedFor;
    roundStartTimeRef.current += pausedFor;
    lastMoveTimestamp.current += pausedFor;
    lastMousePos.current = null; // don't count the jump from where the pointer was before pausing

    pausedRef.current = false;
    setPaused(false);
    roundTimerRef.current?.resume();
    countdownRef.current?.resume();
    blankTimerRef.current?.resume();
  };

  /** NEXT clicked: show the button pressed, then hand the results to the parent. */
  const handleNext = () => {
    if (nextSentRef.current) return; // ignore double clicks
    nextSentRef.current = true;
    setNextSent(true);
    setNextHeld(false);

    // Capture the results now, but hand them over a moment later so the
    // pressed look is actually seen before the parent swaps screens.
    const result = buildResult();
    setTimeout(() => {
      if (onProceed) {
        onProceed(result);
      } else {
        // No parent to hand off to (standalone preview): spring back.
        nextSentRef.current = false;
        setNextSent(false);
      }
    }, NEXT_PRESS_MS);
  };

  return (
    <div style={styles.screen}>
      {/* ---------- Header ----------
          Always shows the title. For showHud groups it also shows the
          running score and the countdown on the right. */}
      <header
        style={{ ...styles.header, ...(showHud || allowPause ? styles.headerWithHud : {}) }}
      >
        <div style={styles.title}>
          Stroop <b style={{ color: "#1a1a1a" }}>Clash</b>
        </div>

        {(showHud || allowPause) && (
          <div style={styles.headerRight}>
            {showHud && (
              <div style={styles.hudGroup}>
                <div style={styles.scoreRow}>
                  SCORE <span style={styles.scoreValue}>{score}</span>
                </div>
                <div style={styles.scoreRow}>
                  WRONG <span style={styles.scoreValue}>{wrongCount}</span>
                </div>
                <div style={styles.scoreRow}>
                  MISSED <span style={styles.scoreValue}>{missCount}</span>
                </div>
                <div
                  style={{
                    ...styles.timerBox,
                    ...(displayTime <= TIMER_WARN_SECONDS ? styles.timerBoxWarn : {}),
                  }}
                >
                  <span style={styles.timerLabel}>TIME</span>
                  <span style={styles.timerValue}>{displayTime}</span>
                </div>
              </div>
            )}

            {allowPause && (
              <button
                style={styles.pauseButton}
                onClick={(e) => {
                  e.currentTarget.blur();
                  pauseGame();
                }}
              >
                Take a break
              </button>
            )}
          </div>
        )}
      </header>

      {/* ---------- Task instruction ----------
          Sits OUTSIDE the stage wrapper on purpose, so it stays put
          through the 250ms blank flash between rounds. */}
      <p style={styles.instruction}>
        Choose the color the word is printed in, not the word itself.
      </p>

      {/* ---------- Stage: ONLY this wrapper blanks every round ---------- */}
      <div style={styles.stageWrapper}>
        <main style={styles.main}>
          <div style={{ ...styles.word, color: inkCss }}>{wordText}</div>
        </main>

        <footer style={styles.footer}>
          {options.map((name) => {
            // Only the button the player clicked changes: it sinks in and
            // stays pressed until the next round. No right/wrong colouring,
            // and the correct answer is not revealed.
            const isPressed = selected === name;
            return (
              <button
                key={name}
                disabled={!!selected}
                onClick={() => handleAnswer(name)}
                style={{
                  ...styles.optionBtn,
                  backgroundColor: getColorCss(name),
                  ...(isPressed ? styles.optionBtnPressed : {}),
                }}
              >
                {name}
              </button>
            );
          })}
        </footer>

        {/* The 250ms blank flash — sized to cover just the stage, not the header */}
        <div style={{ ...styles.blankOverlay, opacity: blank ? 1 : 0 }} />
      </div>

      {/* ---------- Pause overlay ----------
          Opaque, so the word and options can't be studied while paused. */}
      {paused && (
        <div style={styles.pauseOverlay}>
          <div style={styles.pauseCard}>
            <h1 style={styles.pauseTitle}>Paused</h1>
            <p style={styles.pauseBody}>
              The timer is stopped. Press Resume when you're ready to continue.
            </p>
            <button style={styles.resumeButton} onClick={resumeGame}>
              Resume
            </button>
          </div>
        </div>
      )}

      {/* ---------- Game-over panel ----------
          No figures are shown. Hits, wrong answers, omissions, latency,
          mouse distance and idle time are all still recorded, and travel
          to the parent through onProceed rather than onto the screen.

          The NEXT button lives inside this panel, so it only appears
          once time is up and the full session has been recorded. */}
      {gameOver && (
        <div style={styles.gameOverOverlay}>
          <div style={styles.goCard}>
            <h1 style={styles.goTitle}>Time's up</h1>
            <p style={styles.goDetail}>Thank you — your responses have been recorded.</p>
          </div>

          <button
            style={{
              ...styles.nextButton,
              ...(nextHeld || nextSent ? styles.nextButtonPressed : {}),
            }}
            onPointerDown={() => setNextHeld(true)}
            onPointerUp={() => setNextHeld(false)}
            onPointerLeave={() => setNextHeld(false)}
            onPointerCancel={() => setNextHeld(false)}
            onClick={handleNext}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   4. STYLES
   ------------------------------------------------------------
   Background is off-white per request. Word text gets a thin
   dark outline so a WHITE word stays visible against the
   off-white background (otherwise it would nearly vanish).

   headerWithHud / hudGroup / scoreRow / scoreValue / timerBox /
   timerBoxWarn / timerLabel / timerValue are used only by the
   showHud groups. goScore and the metric* entries are still
   unused, kept for a future end-of-session figures screen.
   ============================================================ */
const styles: { [key: string]: React.CSSProperties } = {
  screen: {
    position: "relative",
    height: VIEWPORT_HEIGHT,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#f5f2ea", // off-white
    color: "#1a1a1a",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    padding: "20px 28px",
  },
  // Pushes the score + timer to the right-hand side of the header.
  headerWithHud: {
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  hudGroup: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px 16px",
  },
  title: {
    fontSize: 15,
    letterSpacing: 3,
    color: "#8a8578",
    textTransform: "uppercase",
  },
  instruction: {
    fontSize: 15,
    lineHeight: 1.5,
    color: "#5c5849",
    margin: "0 auto",
    padding: "0 28px",
    maxWidth: 420,
    textAlign: "center",
  },
  scoreRow: {
    fontFamily: "'Consolas', 'Courier New', monospace",
    fontSize: 13,
    color: "#8a8578",
  },
  scoreValue: {
    color: "#1a1a1a",
    fontSize: 16,
  },
  timerBox: {
    display: "flex",
    alignItems: "baseline",
    gap: 6,
    fontFamily: "'Consolas', 'Courier New', monospace",
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    padding: "8px 14px",
    borderRadius: 8,
  },
  timerBoxWarn: {
    borderColor: "#dc2626",
  },
  timerLabel: {
    fontSize: 11,
    color: "#8a8578",
    letterSpacing: 2,
  },
  timerValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#c2820a",
    minWidth: "2ch",
    textAlign: "right",
  },
  // This wrapper is the ONLY thing that blanks every round —
  // header and instruction sit outside it and are untouched.
  stageWrapper: {
    position: "relative",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  main: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  word: {
    fontSize: "clamp(48px, 10vw, 110px)",
    fontWeight: 800,
    letterSpacing: 4,
    textTransform: "uppercase",
    userSelect: "none",
    // Thin dark outline so a WHITE word stays visible on the
    // off-white background instead of nearly disappearing.
    WebkitTextStroke: "1.5px #7a7568",
    paintOrder: "stroke fill",
  } as React.CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: "clamp(8px, 2.5vw, 16px)",
    padding: "clamp(18px, 6vw, 36px) clamp(12px, 4vw, 36px)",
  },
  optionBtn: {
    // Two per row on a phone, four across on a wide screen.
    flex: "1 1 clamp(120px, 40%, 130px)",
    minWidth: 0,
    maxWidth: 170,
    padding: "clamp(13px, 3.5vw, 16px) 12px",
    fontSize: "clamp(13px, 3.6vw, 16px)",
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    border: "3px solid transparent",
    borderRadius: 10,
    cursor: "pointer",
    color: "#ffffff",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    // Black outline around the letters so the label stays readable
    // no matter which color fills the button.
    WebkitTextStroke: "1px #000000",
    paintOrder: "stroke fill",
    // Resting edge under every option, so a pressed button has
    // something to visibly sink into (same idea as the NEXT button).
    boxShadow: "0 4px 0 rgba(0,0,0,0.3)",
    transition: "transform 0.06s ease, box-shadow 0.06s ease, filter 0.06s ease",
  } as React.CSSProperties,
  // The option the player clicked: it sinks 3px, its edge shrinks and
  // the fill darkens slightly. Same look whether the answer was right
  // or wrong, so the screen gives no feedback on correctness.
  optionBtnPressed: {
    transform: "translateY(3px)",
    boxShadow: "0 1px 0 rgba(0,0,0,0.3)",
    filter: "brightness(0.88)",
  },
  // Blank flash — only covers the stageWrapper (word + options),
  // never the header, thanks to `position: absolute` + `inset: 0`
  // inside a `position: relative` stageWrapper.
  blankOverlay: {
    position: "absolute",
    inset: 0,
    background: "#f5f2ea",
    pointerEvents: "none",
    transition: "opacity 0.1s linear",
    zIndex: 5,
  },
  gameOverOverlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(245,242,234,0.92)",
    zIndex: 60,
  },
  goCard: {
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 16,
    padding: "clamp(28px, 7vw, 40px) clamp(22px, 7vw, 48px)",
    textAlign: "center",
    maxWidth: 460,
    width: "min(460px, calc(100% - 32px))",
  },
  goTitle: {
    margin: "0 0 6px",
    fontSize: 22,
    letterSpacing: 2,
    color: "#8a8578",
    textTransform: "uppercase",
  },
  goScore: {
    fontSize: 54,
    fontWeight: 800,
    color: "#c2820a",
    margin: "10px 0",
  },
  goDetail: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#4a463d",
    margin: 0, // no buttons below the text any more, so no bottom gap
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    margin: "12px 0 32px",
  },
  metric: {
    background: "#f5f2ea",
    borderRadius: 10,
    padding: "14px 10px",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 800,
    color: "#1a1a1a",
  },
  metricLabel: {
    fontSize: 10,
    letterSpacing: 1,
    color: "#8a8578",
    textTransform: "uppercase",
    marginTop: 4,
  },
  // Holds the live figures (showHud groups) and the Pause button (allowPause groups).
  headerRight: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "8px 16px",
  },
  pauseButton: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background: "#ffffff",
    color: "#1a1a1a",
    border: "1px solid #ddd7c7",
    borderRadius: 8,
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
  } as React.CSSProperties,
  // Fully opaque so nothing on the task screen can be seen while paused.
  pauseOverlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f2ea",
    zIndex: 50,
  },
  pauseCard: {
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 16,
    padding: "clamp(28px, 7vw, 40px) clamp(22px, 7vw, 48px)",
    textAlign: "center",
    maxWidth: 460,
    width: "min(460px, calc(100% - 32px))",
  },
  pauseTitle: {
    margin: "0 0 12px",
    fontSize: 22,
    letterSpacing: 2,
    color: "#8a8578",
    textTransform: "uppercase",
  },
  pauseBody: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#4a463d",
    margin: "0 0 24px",
  },
  resumeButton: {
    padding: "14px 36px",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background: "#c2820a",
    color: "#fff8ea",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    touchAction: "manipulation",
  } as React.CSSProperties,
  // Bottom-right corner of the screen. Positioned against the fixed
  // game-over overlay, so it stays pinned to the corner while the
  // "Time's up" card remains centred. The safe-area inset keeps it
  // clear of the home indicator on phones.
  nextButton: {
    position: "absolute",
    right: 28,
    bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
    padding: "14px 30px",
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    border: "none",
    borderRadius: 10,
    background: "#1a1a1a",
    color: "#ffffff",
    cursor: "pointer",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    // Resting edge: gives the button some height so pressing it has
    // something to visibly sink into.
    boxShadow: "0 4px 0 #000000",
    transition: "transform 0.06s ease, box-shadow 0.06s ease, background 0.06s ease",
  },
  // Applied while the button is held down and after it has been clicked:
  // it sinks 3px, its edge shrinks, and the fill lightens slightly.
  nextButtonPressed: {
    transform: "translateY(3px)",
    boxShadow: "0 1px 0 #000000",
    background: "#3a3a3a",
  },
};