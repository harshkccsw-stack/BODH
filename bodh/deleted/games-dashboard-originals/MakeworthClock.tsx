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
  private id: ReturnType<typeof setTimeout> | null = null;
  private fireAt = 0;
  private remaining: number;
  private done = false;
  private fn: () => void;

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
   CONSTANTS
   ------------------------------------------------------------
   Keeping every tunable number here means you can change the
   game's difficulty later without hunting through the logic.
   ============================================================ */
const TOTAL_SECONDS = 300;      // 5 minutes, 1 tick per second = 300 ticks
const TOTAL_JUMPS = 15;         // how many "double jump" targets appear
const RESPONSE_WINDOW_MS = 2000; // how long the player has to react to a jump
const TICKS_PER_REVOLUTION = 60; // a normal clock face has 60 tick marks
const NEXT_PRESS_MS = 180;      // how long NEXT stays pressed before results are handed over

/* ============================================================
   ENVIRONMENT HELPERS
   ------------------------------------------------------------
   100vh measures the viewport *behind* mobile browser chrome, so
   the response button can end up below the fold. dvh tracks the
   visible area instead; we fall back where it isn't supported.
   ============================================================ */
const VIEWPORT_HEIGHT =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("height: 100dvh")
    ? "100dvh"
    : "100vh";

/** True on touch devices, where there is no spacebar to mention. */
const IS_COARSE_POINTER =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

/** Formats a number of seconds as m:ss, e.g. 245 -> "4:05". */
function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, "0")}`;
}

/* ============================================================
   HELPER: choose which seconds will be "double jump" moments
   ------------------------------------------------------------
   We pick 15 random second-indices (avoiding the very start/end)
   BEFORE the game starts, so the whole 5-minute session is
   pre-planned but unpredictable to the player.
   ============================================================ */
function pickJumpSeconds(): number[] {
  // Build a pool of every possible second (skipping the very first/last
  // few so a jump never happens right at the start or end), then shuffle
  // it completely at random and take the first 15. This gives a truly
  // unbiased, patternless selection — no minimum spacing rule, no fixed
  // rhythm, nothing a player could learn to anticipate.
  const pool: number[] = [];
  for (let s = 3; s < TOTAL_SECONDS - 3; s++) pool.push(s);

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, TOTAL_JUMPS).sort((a, b) => a - b);
}

type Phase = "running" | "finished";

/** Everything the session recorded, handed to the parent on Next. */
export type ClockResult = {
  hits: number;
  omissions: number;
  falseAlarms: number;
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
  jumpSeconds: number[];
  /** How many times the player paused (always 0 for groups without a Pause button). */
  pauseCount: number;
  /** Total time spent paused, in seconds. Not included in completionSeconds. */
  pausedSeconds: number;
};

/* ------------------------------------------------------------
   showHud: when true (groups 3, 6 and 9), the countdown and the
   running score (hits) are shown in the header. When false
   (every other group), nothing about time or performance is
   displayed. Everything is recorded identically either way.

   allowPause: when true (groups 1, 2 and 3), a Pause button sits
   in the header. Pausing freezes the pointer, the countdown and
   any open response window, and hides the clock until the player
   presses Resume. Spacebar presses are ignored while paused.
   ------------------------------------------------------------ */
export default function MakeworthClock({
  onProceed,
  showHud = false,
  allowPause = false,
}: {
  onProceed?: (result: ClockResult) => void;
  showHud?: boolean;
  allowPause?: boolean;
}) {
  /* ---------- Game state ---------- */
  // The elapsed-seconds counter lives in a ref, not state. The
  // per-second re-render is already driven by setPointerStep below,
  // so the on-screen timer (showHud groups) updates every tick anyway.
  const [pointerStep, setPointerStep] = useState(0); // raw step count; angle = step % 60
  const [phase, setPhase] = useState<Phase>("running");
  const [pressed, setPressed] = useState(false); // purely visual: the button's "clicked" look
  const [paused, setPaused] = useState(false); // true while the Pause overlay is showing

  /* ---------- NEXT button feedback ----------
     Purely visual, plus a guard against double clicks. */
  const [nextHeld, setNextHeld] = useState(false); // finger / mouse is down on it right now
  const [nextSent, setNextSent] = useState(false); // clicked; results are being handed over
  const nextSentRef = useRef(false); // blocks a second click before state has updated

  /* ---------- Telemetry state ----------
     Recorded for the whole session. Hits are shown live as the
     score only for showHud groups; everything leaves this
     component through onProceed. */
  const [hits, setHits] = useState(0);
  const [omissions, setOmissions] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const [mouseDistance, setMouseDistance] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);

  /* ---------- Refs: values the interval/listener callbacks need
       "live" without re-creating themselves every render ---------- */
  const jumpSecondsRef = useRef<number[] | null>(null);
  if (jumpSecondsRef.current === null) {
    // Computed exactly ONCE per session, the very first time this
    // component renders — never recalculated afterwards, guaranteeing
    // exactly TOTAL_JUMPS (15) double-jumps across the whole 5 minutes.
    jumpSecondsRef.current = pickJumpSeconds();
  }
  const awaitingRef = useRef<{ jumpTime: number; resolved: boolean } | null>(null);
  const responseTimeoutRef = useRef<PausableTimeout | null>(null);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const elapsedRef = useRef(0); // total task time, frozen the moment the session ends

  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const lastMoveTimestamp = useRef<number>(Date.now());
  const distanceRef = useRef(0);
  const idleRef = useRef(0);
  const inputTypesRef = useRef<Set<string>>(new Set());

  const mainIntervalRef = useRef<PausableInterval | null>(null);

  // Live copies of phase / paused for the keyboard listener, which is
  // attached once and would otherwise only ever see the first render's values.
  const phaseRef = useRef<Phase>("running");
  const pausedRef = useRef(false);
  const pauseStartedAtRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const pauseCountRef = useRef(0);

  /* ============================================================
     RESOLVING A JUMP EVENT — called whenever the player reacts
     ============================================================ */
  const registerResponse = useCallback(() => {
    if (phaseRef.current !== "running" || pausedRef.current) return;
    const now = Date.now();

    // Visual acknowledgement only. It fires for every response, right or
    // wrong, so it tells the participant the input landed without telling
    // them anything about their performance.
    setPressed(true);
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    pressTimeoutRef.current = setTimeout(() => setPressed(false), 130);

    if (awaitingRef.current && !awaitingRef.current.resolved) {
      const elapsedSinceJump = now - awaitingRef.current.jumpTime;
      if (elapsedSinceJump <= RESPONSE_WINDOW_MS) {
        // Correct, in-time detection.
        awaitingRef.current.resolved = true;
        setHits((h) => h + 1);
        setResponseTimes((rt) => [...rt, elapsedSinceJump]);
        return;
      }
    }
    // No active, unresolved jump window -> this click didn't correspond
    // to a real target, so it's a false alarm.
    setFalseAlarms((f) => f + 1);
  }, []);

  const secondsElapsedRef = useRef(0);
  const pointerStepRef = useRef(0);

  const tick = useCallback(() => {
    const prevSeconds = secondsElapsedRef.current;
    const nextSeconds = prevSeconds + 1;
    secondsElapsedRef.current = nextSeconds;

    // Is THIS second one of our pre-planned double-jump moments?
    const isJumpSecond = jumpSecondsRef.current!.includes(prevSeconds);
    pointerStepRef.current += isJumpSecond ? 2 : 1;

    if (isJumpSecond) {
      // If a previous jump's response window is still open and
      // nobody answered it in time, that's an omission.
      if (awaitingRef.current && !awaitingRef.current.resolved) {
        setOmissions((o) => o + 1);
      }
      responseTimeoutRef.current?.stop();

      const jumpTime = Date.now();
      awaitingRef.current = { jumpTime, resolved: false };

      responseTimeoutRef.current = new PausableTimeout(() => {
        if (awaitingRef.current && !awaitingRef.current.resolved) {
          setOmissions((o) => o + 1);
          awaitingRef.current.resolved = true; // close the window
        }
      }, RESPONSE_WINDOW_MS);
    }

    // Idle-time bookkeeping: if the mouse hasn't moved in the last
    // full second, count that second as idle.
    if (Date.now() - lastMoveTimestamp.current >= 1000) {
      idleRef.current += 1;
      setIdleSeconds(idleRef.current);
    }

    // Plain, one-shot state update — this just pushes the already-
    // computed pointer position to the screen, with no side effects
    // hidden inside it, so nothing here can ever run twice by accident.
    setPointerStep(pointerStepRef.current);

    if (nextSeconds >= TOTAL_SECONDS) {
      // Freeze the elapsed time here rather than reading the clock during
      // render, so the recorded figure is the length of the task itself
      // and not however long the end screen sat there.
      elapsedRef.current = Math.round((Date.now() - startTimeRef.current) / 1000);
      phaseRef.current = "finished";
      setPhase("finished");
    }
  }, []);

  /* ============================================================
     SET UP: main timer, keyboard listener, mouse tracking
     ============================================================ */
  useEffect(() => {
    startTimeRef.current = Date.now();
    mainIntervalRef.current = new PausableInterval(tick, 1000);
    mainIntervalRef.current.start();

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault(); // stop the page from scrolling
        registerResponse();
      }
    };
    window.addEventListener("keydown", handleKeydown);

    const handlePointerMove = (e: PointerEvent) => {
      if (pausedRef.current) return; // no tracking while paused
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
    // pointermove covers mouse, touch and pen. mousemove alone never fires
    // on a touch device, which would leave distance at 0 and mark every
    // second as idle.
    window.addEventListener("pointermove", handlePointerMove);

    return () => {
      mainIntervalRef.current?.stop();
      responseTimeoutRef.current?.stop();
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("pointermove", handlePointerMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the main interval the instant the game finishes.
  useEffect(() => {
    if (phase === "finished") {
      mainIntervalRef.current?.stop();
    }
  }, [phase]);

  /* ============================================================
     DERIVED VALUES
     ------------------------------------------------------------
     avgLatency is computed so the parent gets it ready-made in the
     result payload. timeLeft is read from the ref on each render
     (one render per tick) and is shown only for showHud groups.
     ============================================================ */
  const angleDeg = (pointerStep % TICKS_PER_REVOLUTION) * (360 / TICKS_PER_REVOLUTION);
  const avgLatency =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;
  const timeLeft = TOTAL_SECONDS - secondsElapsedRef.current;

  const buildResult = (): ClockResult => ({
    hits,
    omissions,
    falseAlarms,
    responseTimes,
    avgLatencyMs: avgLatency,
    completionSeconds: elapsedRef.current,
    mouseDistancePx: mouseDistance,
    mouseIdleSeconds: idleSeconds,
    inputTypes: Array.from(inputTypesRef.current),
    jumpSeconds: jumpSecondsRef.current!,
    pauseCount: pauseCountRef.current,
    pausedSeconds: Math.round(totalPausedMsRef.current / 1000),
  });

  /** Pause: freeze the pointer, the countdown and any open response window. */
  const pauseGame = () => {
    if (pausedRef.current || phaseRef.current !== "running") return;
    pausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    pauseCountRef.current += 1;
    mainIntervalRef.current?.pause();
    responseTimeoutRef.current?.pause();
    setPressed(false);
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
    lastMoveTimestamp.current += pausedFor;
    lastMousePos.current = null; // don't count the jump from where the pointer was before pausing
    if (awaitingRef.current) awaitingRef.current.jumpTime += pausedFor;

    pausedRef.current = false;
    setPaused(false);
    mainIntervalRef.current?.resume();
    responseTimeoutRef.current?.resume();
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

  /* ============================================================
     RENDER: finished screen
     ------------------------------------------------------------
     No figures are shown. Hits, omissions, false alarms, latency,
     mouse distance and idle time are all still recorded, and travel
     to the parent through onProceed rather than onto the screen.

     The NEXT button is pinned to the bottom-right corner of the
     screen and only exists here, once the session is complete.
     ============================================================ */
  if (phase === "finished") {
    return (
      <div style={styles.screen}>
        <div style={styles.summaryCard}>
          <h1 style={styles.summaryTitle}>Session Complete</h1>
          <p style={styles.summaryBody}>
            Thank you — your responses have been recorded.
          </p>
        </div>

        <button
          style={{
            ...styles.nextButton,
            ...(nextHeld || nextSent ? styles.nextButtonPressed : {}),
          }}
          onPointerDown={() => setNextHeld(true)}
          onPointerUp={() => setNextHeld(false)}
          onPointerCancel={() => setNextHeld(false)}
          onPointerLeave={() => setNextHeld(false)}
          onClick={handleNext}
        >
          Next
        </button>
      </div>
    );
  }

  /* ============================================================
     RENDER: the running clock task
     ------------------------------------------------------------
     For showHud groups the header also shows the score (hits) and
     the countdown. For every other group, only the title is shown.
     ============================================================ */
  return (
    <div style={styles.screen}>
      <header
        style={{ ...styles.header, ...(showHud || allowPause ? styles.headerWithHud : {}) }}
      >
        <div style={styles.title}>
          Mackworth <b style={{ color: "#1a1a1a" }}>Clock</b>
        </div>

        {(showHud || allowPause) && (
          <div style={styles.headerRight}>
            {showHud && (
              <div style={styles.hudGroup}>
                <div style={styles.scoreRow}>
                  SCORE <span style={styles.scoreValue}>{hits}</span>
                </div>
                <div style={styles.scoreRow}>
                  WRONG <span style={styles.scoreValue}>{falseAlarms}</span>
                </div>
                <div style={styles.scoreRow}>
                  MISSED <span style={styles.scoreValue}>{omissions}</span>
                </div>
                <div style={styles.timerBox}>
                  <span style={styles.timerLabel}>TIME</span>
                  <span style={styles.timerValue}>{formatTime(timeLeft)}</span>
                </div>
              </div>
            )}

            {allowPause && (
              <button
                style={styles.pauseButton}
                onClick={(e) => {
                  e.currentTarget.blur(); // so a later Spacebar press can't re-trigger it
                  pauseGame();
                }}
              >
                Take a break
              </button>
            )}
          </div>
        )}
      </header>

      <main style={styles.main}>
        <p style={styles.instruction}>
          The pointer normally moves one mark at a time. Respond the moment it
          skips two.
        </p>
        <ClockFace angleDeg={angleDeg} />
      </main>

      <footer style={styles.footer}>
        <button
          style={{ ...styles.targetButton, ...(pressed ? styles.targetButtonPressed : {}) }}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onClick={registerResponse}
        >
          TARGET DETECTED
        </button>
        {!IS_COARSE_POINTER && <p style={styles.hint}>or press Spacebar</p>}
      </footer>

      {/* Pause overlay: opaque, so the clock can't be watched while paused. */}
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
    </div>
  );
}

/* ============================================================
   SMALL SUB-COMPONENTS
   ============================================================ */
function ClockFace({ angleDeg }: { angleDeg: number }) {
  const size = 280;
  const center = size / 2;
  const marks = [];
  for (let i = 0; i < TICKS_PER_REVOLUTION; i++) {
    const deg = (i * 360) / TICKS_PER_REVOLUTION;
    const isMajor = i % 5 === 0; // slightly longer mark every 5 ticks
    const outer = center - 10;
    const inner = isMajor ? center - 22 : center - 16;
    const rad = (deg * Math.PI) / 180;
    const x1 = center + outer * Math.sin(rad);
    const y1 = center - outer * Math.cos(rad);
    const x2 = center + inner * Math.sin(rad);
    const y2 = center - inner * Math.cos(rad);
    marks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#c9c2ae"
        strokeWidth={isMajor ? 2.5 : 1.5}
      />
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      // Scales down on narrow screens instead of overflowing.
      style={{ width: "min(280px, 74vw)", height: "auto", display: "block" }}
    >
      <circle cx={center} cy={center} r={center - 6} fill="#ffffff" stroke="#ddd7c7" strokeWidth={2} />
      {marks}
      {/* The pointer, rotated by angleDeg around the center */}
      <line
        x1={center}
        y1={center}
        x2={center}
        y2={center - (center - 30)}
        stroke="#c2820a"
        strokeWidth={4}
        strokeLinecap="round"
        transform={`rotate(${angleDeg} ${center} ${center})`}
      />
      <circle cx={center} cy={center} r={6} fill="#1a1a1a" />
    </svg>
  );
}

/* ============================================================
   STYLES
   ------------------------------------------------------------
   headerWithHud / hudGroup / timerBox / timerLabel / timerValue /
   scoreRow / scoreValue are used only by the showHud groups.
   The metric* entries are still unused, kept for a future
   end-of-session figures screen.
   ============================================================ */
const styles: { [key: string]: React.CSSProperties } = {
  screen: {
    height: VIEWPORT_HEIGHT,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#f5f2ea",
    color: "#1a1a1a",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    padding: "clamp(14px, 4vw, 20px) clamp(16px, 5vw, 28px)",
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
  timerLabel: {
    fontSize: 11,
    color: "#8a8578",
    letterSpacing: 2,
  },
  timerValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#c2820a",
    minWidth: "4ch",
    textAlign: "right",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  instruction: {
    fontSize: 15,
    lineHeight: 1.5,
    color: "#5c5849",
    margin: 0,
    padding: "0 20px",
    maxWidth: 420,
    textAlign: "center",
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    padding: "clamp(20px, 6vw, 36px)",
  },
  targetButton: {
    padding: "clamp(16px, 4.5vw, 20px) clamp(28px, 10vw, 48px)",
    fontSize: "clamp(15px, 4vw, 18px)",
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: "uppercase",
    background: "#c2820a",
    color: "#fff8ea",
    border: "4px solid transparent",
    borderRadius: 12,
    cursor: "pointer",
    // Stops a double-tap being read as a zoom gesture, which would
    // otherwise swallow rapid responses on mobile.
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    boxShadow: "0 4px 0 #8f5f07",
    transform: "translateY(0)",
    transition: "transform 70ms ease-out, box-shadow 70ms ease-out, background-color 70ms ease-out, border-color 70ms ease-out",
  } as React.CSSProperties,
  targetButtonPressed: {
    background: "#a86f08",
    boxShadow: "0 1px 0 #8f5f07",
    transform: "translateY(3px)",
  },
  hint: {
    fontSize: 12,
    color: "#8a8578",
    margin: 0,
  },
  summaryCard: {
    margin: "auto",
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 16,
    padding: "clamp(28px, 7vw, 40px) clamp(22px, 7vw, 48px)",
    textAlign: "center",
    maxWidth: 460,
    width: "min(460px, calc(100% - 32px))",
  },
  summaryTitle: {
    fontSize: 22,
    letterSpacing: 2,
    color: "#8a8578",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  summaryBody: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#4a463d",
    margin: 0, // no button below the text any more, so no bottom gap
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginBottom: 32,
  },
  metric: {
    background: "#f5f2ea",
    borderRadius: 10,
    padding: "14px 10px",
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 800,
    color: "#1a1a1a",
  },
  metricLabel: {
    fontSize: 11,
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
  // Bottom-right corner of the screen, pinned to the viewport. The
  // safe-area inset keeps it clear of the home indicator on phones.
  // The resting edge (boxShadow) gives the button some height so that
  // pressing it has something to visibly sink into.
  nextButton: {
    position: "fixed",
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