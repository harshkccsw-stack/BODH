import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { PortalGamePart } from '@/lib/api';
import type { GameProps } from './registry';

/* ============================================================
   COLOR CLASH + MACKWORTH CLOCK — one game, one file
   ------------------------------------------------------------
   The whole journey, in order:

     select group -> how to play (Color Clash) -> group
     instructions -> 3-2-1 -> COLOR CLASH -> how to play
     (Mackworth Clock) -> group instructions (second task)
     -> 3-2-1 -> MACKWORTH CLOCK -> onComplete(result)

   Everything the game needs lives in this file: the nine groups
   and their instruction text, which groups see the live score or
   get a Pause button, both tasks' timings, the annotated previews
   and what each part records.

   WHAT IT RECORDS — TWO game_result parts, in order:
     COLOR_CLASH
       hits                right colour clicked
       falseAlarms         wrong colour clicked
       omissions           rounds that ended with nothing clicked
     MACKWORTH_CLOCK
       hits                double jumps caught inside the window
       falseAlarms         responses with no jump to catch
       omissions           double jumps let go by
     and on BOTH rows:
       durationMs          that part's play time, pauses excluded
       mouseDistancePx, mouseIdleSeconds   during that part
       instructionTimeMs   time on that part's "How to play" and
                           group instruction pages, every visit summed
       groupNumber / groupName   the group picked at the start
       pauseCount / pauseDurationMs   breaks taken in that part —
                           null for groups with no Pause button
       startedAt / endedAt the browser clock at the part's start and
                           end (pauses inside the span)
   ============================================================ */

/** What a part measures itself; the journey adds its code, group and instruction time. */
type PartNumbers = Pick<
  PortalGamePart,
  | 'hits'
  | 'falseAlarms'
  | 'omissions'
  | 'durationMs'
  | 'mouseDistancePx'
  | 'mouseIdleSeconds'
  | 'pauseCount'
  | 'pauseDurationMs'
  | 'startedAt'
  | 'endedAt'
>;

/* ============================================================
   ENVIRONMENT
   ------------------------------------------------------------
   100vh measures the viewport *behind* mobile browser chrome, so
   a fixed bottom bar or the option buttons can end up below the
   fold. dvh tracks the visible area; we fall back where it isn't
   supported.
   ============================================================ */
const VIEWPORT_HEIGHT =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height: 100dvh')
    ? '100dvh'
    : '100vh';

/** True on touch devices, where there is no spacebar to mention. */
const IS_COARSE_POINTER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

/* ============================================================
   SETTINGS — the journey
   ============================================================ */
const COUNTDOWN_SECONDS = 3;
const GROUP_COUNT = 9;
// Groups that see the live timer and score during both tasks.
// Every other group plays with them hidden.
const GROUPS_WITH_HUD = new Set([3, 6, 9]);
// Groups that get a Pause button during both tasks.
const GROUPS_WITH_PAUSE = new Set([1, 2, 3]);
const NEXT_PRESS_MS = 180; // how long a final Next stays pressed before the results move on

/* ============================================================
   SETTINGS — Color Clash
   ------------------------------------------------------------
   Every colour has a NAME (the word shown/asked about) and the
   actual CSS colour it can be drawn in.
   ============================================================ */
type ColorDef = { name: string; css: string };

const COLORS: ColorDef[] = [
  { name: 'RED', css: '#ef4444' },
  { name: 'BLUE', css: '#3b82f6' },
  { name: 'GREEN', css: '#22c55e' },
  { name: 'BLACK', css: '#000000' },
  { name: 'WHITE', css: '#ffffff' },
  { name: 'YELLOW', css: '#eab308' },
  { name: 'PURPLE', css: '#a855f7' },
  { name: 'ORANGE', css: '#f97316' },
];

const ROUND_MS = 3000; // how often the word + options change
const BLANK_MS = 250; // how long the blank flash lasts
const CLASH_SECONDS = 70; // Color Clash length
const TIMER_WARN_SECONDS = 10; // HUD timer border turns red at or below this

/* ============================================================
   SETTINGS — Mackworth Clock
   ============================================================ */
const CLOCK_SECONDS = 300; // 5 minutes, 1 tick per second = 300 ticks
const TOTAL_JUMPS = 15; // how many "double jump" targets appear
const RESPONSE_WINDOW_MS = 2000; // how long the respondent has to react to a jump
const TICKS_PER_REVOLUTION = 60; // a normal clock face has 60 tick marks

/* ============================================================
   PER-GROUP INSTRUCTIONS
   ------------------------------------------------------------
   One entry per group. Each group has TWO instruction pages:

     paragraphs   — page 1: after Color Clash's "How to play",
                    just before Color Clash starts
     beforeGame2  — page 2: after Mackworth Clock's "How to
                    play", just before the clock starts

   Each page is an array with one string per paragraph. `label`
   starts the heading ("Group 1"); `name` is the short name shown
   under "Group N" on the selection screen and under every
   instructions heading — and the groupName that is recorded.

   Edit a group's text here and only that group changes.
   ============================================================ */
type GroupInstructions = {
  label: string;
  name: string;
  paragraphs: string[];
  beforeGame2: string[];
};

/* The words after "Group N — " in the heading of each page. */
const PAGE_TITLES = {
  intro: 'Instructions',
  beforeGame2: 'Second Task',
};

const TEXT = {
  average:
    'Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best!',
  compete:
    'This task gives you opportunity to compete directly against other participants and become top scorer.',
  track: 'In this task you will be able to track your progress and accuracy on screen as you work.',
  selfPaced:
    'You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish.',
  noise:
    'There might be some background noise and disruptions. You will have to work through it to finish the task.',
  phone:
    'While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well.',
};

const INSTRUCTIONS: Record<number, GroupInstructions> = {
  1: { label: 'Group 1', name: 'IND-INM', paragraphs: [TEXT.average, TEXT.selfPaced], beforeGame2: [TEXT.average, TEXT.selfPaced] },
  2: { label: 'Group 2', name: 'IND-EXM', paragraphs: [TEXT.compete, TEXT.selfPaced], beforeGame2: [TEXT.compete, TEXT.selfPaced] },
  3: { label: 'Group 3', name: 'IND-DIM', paragraphs: [TEXT.track, TEXT.selfPaced], beforeGame2: [TEXT.track, TEXT.selfPaced] },
  4: { label: 'Group 4', name: 'EXD-INM', paragraphs: [TEXT.average, TEXT.noise], beforeGame2: [TEXT.average, TEXT.noise] },
  5: { label: 'Group 5', name: 'EXD-EXM', paragraphs: [TEXT.compete, TEXT.noise], beforeGame2: [TEXT.compete, TEXT.noise] },
  6: { label: 'Group 6', name: 'EXD-DIM', paragraphs: [TEXT.track, TEXT.noise], beforeGame2: [TEXT.track, TEXT.noise] },
  7: { label: 'Group 7', name: 'DID-INM', paragraphs: [TEXT.average, TEXT.phone], beforeGame2: [TEXT.average, TEXT.phone] },
  8: { label: 'Group 8', name: 'DID-EXM', paragraphs: [TEXT.compete, TEXT.phone], beforeGame2: [TEXT.compete, TEXT.phone] },
  9: { label: 'Group 9', name: 'DID-DIM', paragraphs: [TEXT.track, TEXT.phone], beforeGame2: [TEXT.track, TEXT.phone] },
};

/* Shown if a group somehow has no entry above, or one of its pages
   is an empty array — better a visible warning during a session
   than a silently blank card. */
const MISSING_TEXT = [
  'No instruction text has been set for this group. Please tell the researcher before continuing.',
];

const MISSING_INSTRUCTIONS: GroupInstructions = {
  label: 'Instructions unavailable',
  name: '',
  paragraphs: MISSING_TEXT,
  beforeGame2: MISSING_TEXT,
};

/** Falls back to the warning text when a page has no paragraphs. */
const withFallback = (paragraphs: string[] | undefined) =>
  paragraphs && paragraphs.length > 0 ? paragraphs : MISSING_TEXT;

/* Both group instruction pages show this tick box under the text;
   the forward button stays disabled until it is ticked. */
const CONFIRM_TEXT = 'I have read and understood the instructions.';

/* ============================================================
   PAUSABLE TIMERS
   ------------------------------------------------------------
   Drop-in replacements for setInterval / setTimeout that can be
   paused and resumed without losing their place. When paused,
   each remembers how long was left until it would next fire; on
   resume it waits exactly that long, then carries on as normal.
   So a round 1.2s from ending when the respondent paused still
   ends 1.2s after they resume.
   ============================================================ */

/** Like setInterval, but with pause() and resume(). Call start() to begin. */
class PausableInterval {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private nextFireAt = 0;
  private remaining = 0;
  private state: 'idle' | 'running' | 'paused' = 'idle';
  private fn: () => void;
  private ms: number;

  constructor(fn: () => void, ms: number) {
    this.fn = fn;
    this.ms = ms;
  }

  start() {
    this.clear();
    this.state = 'running';
    this.arm(this.ms);
  }

  pause() {
    if (this.state !== 'running') return;
    this.remaining = Math.max(0, this.nextFireAt - Date.now());
    this.clear();
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.arm(this.remaining);
  }

  stop() {
    this.clear();
    this.state = 'idle';
  }

  /** Wait `firstDelay`, fire once, then fire every `ms` after that. */
  private arm(firstDelay: number) {
    this.nextFireAt = Date.now() + firstDelay;
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.nextFireAt = Date.now() + this.ms;
      // Set up the repeating interval BEFORE calling fn, so that if fn
      // calls stop() (e.g. the task ends on this tick) it is cleared too.
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
   POINTER TELEMETRY
   ------------------------------------------------------------
   Pointer travel and idle seconds for ONE part, counted only
   while it is tracking (running, not paused). pointermove covers
   mouse, touch and pen — mousemove alone never fires on a touch
   device, which would leave distance at 0 and mark every second
   idle. Nothing on screen reads these, so counting never costs a
   render.
   ============================================================ */
class PointerTelemetry {
  distance = 0;
  idleSeconds = 0;
  private tracking = false;
  private lastPos: { x: number; y: number } | null = null;
  private lastMoveAt = Date.now();

  private onMove = (e: PointerEvent) => {
    if (!this.tracking) return;
    const pos = { x: e.clientX, y: e.clientY };
    if (this.lastPos) this.distance += Math.hypot(pos.x - this.lastPos.x, pos.y - this.lastPos.y);
    this.lastPos = pos;
    this.lastMoveAt = Date.now();
  };

  attach() {
    window.addEventListener('pointermove', this.onMove);
  }

  detach() {
    window.removeEventListener('pointermove', this.onMove);
  }

  /** Fresh counts, tracking from now. */
  start() {
    this.distance = 0;
    this.idleSeconds = 0;
    this.lastPos = null;
    this.lastMoveAt = Date.now();
    this.tracking = true;
  }

  stop() {
    this.tracking = false;
  }

  pause() {
    this.tracking = false;
  }

  /** The pause is not idle time, and the jump from where the pointer was before it is not travel. */
  resume(pausedForMs: number) {
    this.lastMoveAt += pausedForMs;
    this.lastPos = null;
    this.tracking = true;
  }

  /** Called once a second by the part's own clock: a second with no movement is an idle second. */
  tickIdle() {
    if (this.tracking && Date.now() - this.lastMoveAt >= 1000) this.idleSeconds += 1;
  }

  /** The two numbers a part reports. */
  numbers() {
    return { mouseDistancePx: Math.round(this.distance), mouseIdleSeconds: this.idleSeconds };
  }
}

/* ============================================================
   THE GAME — the journey between the two parts
   ============================================================ */
type View = 'select' | 'preview1' | 'instructions1' | 'countdown' | 'clash' | 'preview2' | 'instructions2' | 'clock';

/* The screens whose time counts as each part's instruction time. */
const INSTRUCTION_VIEWS: Partial<Record<View, 'clash' | 'clock'>> = {
  preview1: 'clash',
  instructions1: 'clash',
  preview2: 'clock',
  instructions2: 'clock',
};

export default function ColorClashMackworth({ onComplete }: GameProps) {
  const [view, setView] = useState<View>('select');
  const [group, setGroup] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  // Whether the confirmation box is ticked on each group instruction page.
  const [ticked, setTicked] = useState({ first: false, second: false });

  // true only for groups 3, 6 and 9 — passed into both parts.
  const showHud = group !== null && GROUPS_WITH_HUD.has(group);
  // true only for groups 1, 2 and 3 — passed into both parts.
  const allowPause = group !== null && GROUPS_WITH_PAUSE.has(group);
  // The picked group's text for both instruction pages.
  const content = (group !== null && INSTRUCTIONS[group]) || MISSING_INSTRUCTIONS;

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Which part the countdown hands off to. A ref, not state, so the interval
  // always reads the current value without the effect re-running.
  const countdownTargetRef = useRef<View>('clash');
  // Each part's instruction time: every visit to its "How to play" and group
  // instruction pages, summed. performance.now() because, unlike Date.now(),
  // it cannot jump if the device clock changes mid-session.
  const instructionMsRef = useRef({ clash: 0, clock: 0 });
  // Color Clash's numbers, kept until the clock finishes and both go out together.
  const clashResultRef = useRef<PartNumbers | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const handlePick = (groupNumber: number) => {
    setGroup(groupNumber);
    setTicked({ first: false, second: false });
    instructionMsRef.current = { clash: 0, clock: 0 };
    setView('preview1');
  };

  const handleCancel = () => {
    setGroup(null);
    setView('select');
  };

  /** Runs the shared 3-2-1 screen, then moves on to `target`. */
  const startCountdown = (target: View) => {
    countdownTargetRef.current = target;
    setCountdown(COUNTDOWN_SECONDS);
    setView('countdown');
  };

  const handleClashDone = (result: PartNumbers) => {
    clashResultRef.current = result;
    setView('preview2');
  };

  const handleClockDone = (clock: PartNumbers) => {
    const clash = clashResultRef.current;
    if (clash === null || group === null) return; // unreachable: the clock only follows Color Clash
    // The group governs both parts (score display, Pause), so it rides on both rows.
    const groupName = (INSTRUCTIONS[group]?.name ?? '').trim();
    onComplete({
      parts: [
        {
          partCode: 'COLOR_CLASH',
          ...clash,
          instructionTimeMs: Math.round(instructionMsRef.current.clash),
          groupNumber: group,
          groupName,
        },
        {
          partCode: 'MACKWORTH_CLOCK',
          ...clock,
          instructionTimeMs: Math.round(instructionMsRef.current.clock),
          groupNumber: group,
          groupName,
        },
      ],
    });
  };

  /* ---------- The 3-second countdown, whenever we enter that view ----------
     The transition happens in the interval body, not inside a state
     updater: updaters must stay pure (StrictMode calls them twice). */
  useEffect(() => {
    if (view !== 'countdown') return;
    const deadline = Date.now() + COUNTDOWN_SECONDS * 1000;
    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        setView(countdownTargetRef.current);
      }
    }, 200); // sub-second tick so the number lands on time
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = null;
    };
  }, [view]);

  /* Hidden instruction timer: runs while a part's instruction screen is up;
     the cleanup adds the visit to that part's total when the respondent
     leaves it by any button — Back and a return visit included. */
  useEffect(() => {
    const part = INSTRUCTION_VIEWS[view];
    if (!part) return;
    const startedAt = performance.now();
    return () => {
      instructionMsRef.current[part] += performance.now() - startedAt;
    };
  }, [view]);

  /* Every screen opens at the top, so a long instruction page doesn't start
     halfway down because the previous one was scrolled. scrollIntoView
     rather than window.scrollTo: the game may be scrolling inside a
     container (the portal's overlay), not the window. */
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: 'start' });
  }, [view]);

  let screen: ReactNode;
  if (view === 'select') {
    /* ---------- Pick one of 9 groups ---------- */
    screen = (
      <div style={styles.screen}>
        <h1 style={styles.title}>Select a Group</h1>
        <div style={styles.grid}>
          {Array.from({ length: GROUP_COUNT }, (_, i) => i + 1).map((num) => (
            <button key={num} style={styles.groupButton} onClick={() => handlePick(num)}>
              <span style={styles.groupNumber}>Group {num}</span>
              {INSTRUCTIONS[num]?.name && <span style={styles.groupName}>{INSTRUCTIONS[num].name}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (view === 'preview1') {
    /* ---------- Annotated still of Color Clash ---------- */
    screen = (
      <div style={styles.screen}>
        <div style={styles.previewCard}>
          <h1 style={styles.previewTitle}>How to play</h1>
          <ColorClashPreview />
        </div>
        <div style={styles.bottomBar}>
          <button style={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
          <button style={styles.startButton} onClick={() => setView('instructions1')}>
            Next
          </button>
        </div>
      </div>
    );
  } else if (view === 'instructions1') {
    /* ---------- Group instructions, page 1 — tick, then start Color Clash ---------- */
    screen = (
      <InstructionScreen
        heading={`${content.label} — ${PAGE_TITLES.intro}`}
        name={content.name}
        paragraphs={withFallback(content.paragraphs)}
        confirm={{ ticked: ticked.first, onChange: (value) => setTicked((t) => ({ ...t, first: value })) }}
        back={{ label: 'Back', onClick: () => setView('preview1') }}
        next={{ label: 'Next', onClick: () => ticked.first && startCountdown('clash') }}
      />
    );
  } else if (view === 'countdown') {
    /* ---------- 3-2-1, shared by both parts ---------- */
    screen = (
      <div style={styles.screen}>
        <div style={styles.countdownText}>Game starts in</div>
        <div style={{ margin: 10 }} />
        <div style={styles.countdownNumber}>{countdown}</div>
      </div>
    );
  } else if (view === 'clash') {
    screen = <ColorClash showHud={showHud} allowPause={allowPause} onProceed={handleClashDone} />;
  } else if (view === 'preview2') {
    /* ---------- Annotated still of the Mackworth Clock ----------
       No Back button: Color Clash is over and can't be returned to. */
    screen = (
      <div style={styles.screen}>
        <div style={styles.previewCard}>
          <h1 style={styles.previewTitle}>How to play</h1>
          <MackworthClockPreview />
        </div>
        <div style={styles.bottomBar}>
          <span />
          <button style={styles.startButton} onClick={() => setView('instructions2')}>
            Next
          </button>
        </div>
      </div>
    );
  } else if (view === 'instructions2') {
    /* ---------- Group instructions, page 2 — tick, then start the clock ---------- */
    screen = (
      <InstructionScreen
        heading={`${content.label} — ${PAGE_TITLES.beforeGame2}`}
        name={content.name}
        paragraphs={withFallback(content.beforeGame2)}
        confirm={{ ticked: ticked.second, onChange: (value) => setTicked((t) => ({ ...t, second: value })) }}
        back={{ label: 'Back', onClick: () => setView('preview2') }}
        next={{ label: 'Submit', onClick: () => ticked.second && startCountdown('clock') }}
      />
    );
  } else {
    /* ---------- Mackworth Clock — its Next ends the whole game ---------- */
    screen = <MackworthClock showHud={showHud} allowPause={allowPause} onProceed={handleClockDone} />;
  }

  return <div ref={topRef}>{screen}</div>;
}

/* ============================================================
   PART 1 — COLOR CLASH
   ------------------------------------------------------------
   A colour word is printed in a DIFFERENT ink; the respondent
   clicks the ink's colour, not the word. A new round every
   ROUND_MS, with a brief blank between. A round that ends with
   nothing clicked is a miss.

   showHud: the countdown and running score in the header.
   allowPause: a Pause button; pausing freezes the countdown,
   the current round and the telemetry, and hides the stage.
   Clicking an option gives no right/wrong feedback: the clicked
   button just looks pressed until the next round.
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

/** Looks up the CSS colour for a colour name, e.g. "RED" -> "#ef4444". */
function getColorCss(name: string): string {
  return COLORS.find((c) => c.name === name)?.css ?? '#1a1a1a';
}

/** One round: a printed word + a different ink colour + 4 shuffled options. */
function buildRound() {
  const wordChoice = pickRandom(COLORS, 1)[0];
  let inkChoice: ColorDef;
  do {
    inkChoice = pickRandom(COLORS, 1)[0];
  } while (inkChoice.name === wordChoice.name);
  // The correct answer is the INK colour — read the colour, not the word.
  const distractors = pickRandom(
    COLORS.filter((c) => c.name !== inkChoice.name),
    3,
  ).map((c) => c.name);
  return {
    wordText: wordChoice.name,
    inkCss: inkChoice.css,
    correctAnswer: inkChoice.name,
    options: shuffle([inkChoice.name, ...distractors]),
  };
}

function ColorClash({
  onProceed,
  showHud,
  allowPause,
}: {
  onProceed: (result: PartNumbers) => void;
  showHud: boolean;
  allowPause: boolean;
}) {
  // --- What's on screen ---
  const [wordText, setWordText] = useState('RED');
  const [inkCss, setInkCss] = useState('#ef4444');
  const [options, setOptions] = useState<string[]>(['RED', 'BLUE', 'GREEN', 'BLACK']);
  const [selected, setSelected] = useState<string | null>(null); // button clicked this round
  const [blank, setBlank] = useState(false); // true only while the stage is flashed blank
  const [paused, setPaused] = useState(false);
  // Tracked every second; shown only with showHud. The effect below ends the
  // part at 0.
  const [timeLeft, setTimeLeft] = useState(CLASH_SECONDS);

  // Counters: state, because the HUD shows them live (showHud groups).
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  // --- Next button feedback ---
  const [nextHeld, setNextHeld] = useState(false);
  const [nextSent, setNextSent] = useState(false);
  const nextSentRef = useRef(false); // blocks a second click before state has updated

  // --- Refs the timer callbacks need "live" ---
  const correctAnswerRef = useRef('RED');
  const answeredRef = useRef(false); // clicked something THIS round?
  const roundTimerRef = useRef<PausableInterval | null>(null);
  const countdownRef = useRef<PausableInterval | null>(null);
  const blankTimerRef = useRef<PausableTimeout | null>(null);
  const pausedRef = useRef(false);
  const pauseStartedAtRef = useRef(0);
  const gameOverRef = useRef(false);
  const startTimeRef = useRef(0); // shifted forward by every pause
  const elapsedMsRef = useRef(0); // frozen the moment the part ends
  const telemetryRef = useRef(new PointerTelemetry());
  // Breaks taken, and the browser clock at the part's start and end.
  const pauseCountRef = useRef(0);
  const pausedMsRef = useRef(0);
  const startedAtRef = useRef(0);
  const endedAtRef = useRef(0);

  /** Swap in a brand-new word + ink colour + option set. */
  const newRound = useCallback(() => {
    answeredRef.current = false;
    setSelected(null);
    const round = buildRound();
    correctAnswerRef.current = round.correctAnswer;
    setWordText(round.wordText);
    setInkCss(round.inkCss);
    setOptions(round.options);
  }, []);

  /** Every ROUND_MS: blank the stage briefly, then load the next round. */
  const cycleStep = useCallback(() => {
    // Nothing clicked before this round ended: that's a miss.
    if (!answeredRef.current) setMissCount((m) => m + 1);
    setBlank(true); // ONLY the stage blanks — the header stays untouched
    blankTimerRef.current?.stop();
    blankTimerRef.current = new PausableTimeout(() => {
      newRound();
      setBlank(false);
    }, BLANK_MS);
  }, [newRound]);

  /** One of the 4 option buttons was clicked. */
  const handleAnswer = (chosen: string) => {
    if (answeredRef.current || pausedRef.current) return; // extra clicks, and any while paused
    answeredRef.current = true;
    setSelected(chosen);
    if (chosen === correctAnswerRef.current) setScore((s) => s + 1);
    else setWrongCount((w) => w + 1);
  };

  const endGame = useCallback(() => {
    gameOverRef.current = true;
    roundTimerRef.current?.stop();
    countdownRef.current?.stop();
    blankTimerRef.current?.stop();
    telemetryRef.current.stop();
    // Frozen here, so the figure is the task itself and not however long the
    // end screen sat there.
    elapsedMsRef.current = Date.now() - startTimeRef.current;
    endedAtRef.current = Date.now();
    setGameOver(true);
  }, []);

  const startGame = useCallback(() => {
    setTimeLeft(CLASH_SECONDS);
    setScore(0);
    setWrongCount(0);
    setMissCount(0);
    setGameOver(false);
    setBlank(false);
    blankTimerRef.current?.stop();
    pausedRef.current = false;
    setPaused(false);
    gameOverRef.current = false;
    startTimeRef.current = Date.now();
    startedAtRef.current = startTimeRef.current;
    elapsedMsRef.current = 0;
    pauseCountRef.current = 0;
    pausedMsRef.current = 0;
    telemetryRef.current.start();

    newRound();

    roundTimerRef.current?.stop();
    countdownRef.current?.stop();
    roundTimerRef.current = new PausableInterval(cycleStep, ROUND_MS);
    roundTimerRef.current.start();
    countdownRef.current = new PausableInterval(() => {
      setTimeLeft((t) => t - 1);
      telemetryRef.current.tickIdle();
    }, 1000);
    countdownRef.current.start();
  }, [cycleStep, newRound]);

  // Pointer tracking, attached for the life of the part; the telemetry
  // itself ignores movement while stopped or paused.
  useEffect(() => {
    const telemetry = telemetryRef.current;
    telemetry.attach();
    return () => telemetry.detach();
  }, []);

  // Kick the part off once, on mount.
  useEffect(() => {
    startGame();
    return () => {
      roundTimerRef.current?.stop();
      countdownRef.current?.stop();
      blankTimerRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // End the part the moment the countdown hits 0.
  useEffect(() => {
    if (timeLeft <= 0 && !gameOver) endGame();
  }, [timeLeft, gameOver, endGame]);

  const displayTime = Math.max(0, timeLeft);

  /** Pause: freeze every timer where it is and cover the stage. */
  const pauseGame = () => {
    if (pausedRef.current || gameOverRef.current) return;
    pausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    pauseCountRef.current += 1;
    roundTimerRef.current?.pause();
    countdownRef.current?.pause();
    blankTimerRef.current?.pause();
    telemetryRef.current.pause();
    setPaused(true);
  };

  /** Resume: carry on exactly where the part left off. */
  const resumeGame = () => {
    if (!pausedRef.current) return;
    const pausedFor = Date.now() - pauseStartedAtRef.current;
    // The pause is excluded from the game time and from idle time.
    startTimeRef.current += pausedFor;
    pausedMsRef.current += pausedFor;
    telemetryRef.current.resume(pausedFor);
    pausedRef.current = false;
    setPaused(false);
    roundTimerRef.current?.resume();
    countdownRef.current?.resume();
    blankTimerRef.current?.resume();
  };

  /** Next clicked: show the button pressed, then hand the numbers over. */
  const handleNext = () => {
    if (nextSentRef.current) return;
    nextSentRef.current = true;
    setNextSent(true);
    setNextHeld(false);
    const result: PartNumbers = {
      hits: score,
      falseAlarms: wrongCount,
      omissions: missCount,
      durationMs: elapsedMsRef.current,
      ...telemetryRef.current.numbers(),
      // Null for groups with no Pause button: not "never paused", never could.
      pauseCount: allowPause ? pauseCountRef.current : null,
      pauseDurationMs: allowPause ? pausedMsRef.current : null,
      startedAt: new Date(startedAtRef.current).toISOString(),
      endedAt: new Date(endedAtRef.current).toISOString(),
    };
    setTimeout(() => onProceed(result), NEXT_PRESS_MS);
  };

  return (
    <div style={styles.clashScreen}>
      {/* ---------- Header: the title, plus HUD and/or Pause for those groups ---------- */}
      <header style={{ ...styles.clashHeader, ...(showHud || allowPause ? styles.headerWithHud : {}) }}>
        <div style={styles.partTitle}>
          Stroop <b style={{ color: '#1a1a1a' }}>Clash</b>
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
                <div style={{ ...styles.timerBox, ...(displayTime <= TIMER_WARN_SECONDS ? styles.timerBoxWarn : {}) }}>
                  <span style={styles.timerLabel}>TIME</span>
                  <span style={{ ...styles.timerValue, minWidth: '2ch' }}>{displayTime}</span>
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

      {/* Outside the stage on purpose, so it stays put through the blank flash. */}
      <p style={styles.clashInstruction}>Choose the color the word is printed in, not the word itself.</p>

      {/* ---------- Stage: ONLY this wrapper blanks every round ---------- */}
      <div style={styles.stageWrapper}>
        <main style={styles.clashMain}>
          <div style={{ ...styles.word, color: inkCss }}>{wordText}</div>
        </main>

        <footer style={styles.clashFooter}>
          {options.map((name) => {
            // Only the clicked button changes: it sinks and stays pressed until
            // the next round. No right/wrong colouring; the answer is not revealed.
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

        {/* The blank flash — covers just the stage, not the header */}
        <div style={{ ...styles.blankOverlay, opacity: blank ? 1 : 0 }} />
      </div>

      {/* Opaque, so the word and options can't be studied while paused. */}
      {paused && <PauseOverlay onResume={resumeGame} />}

      {/* ---------- Time's up: no figures; Next carries them on ---------- */}
      {gameOver && (
        <div style={styles.gameOverOverlay}>
          <div style={styles.endCard}>
            <h1 style={styles.endTitle}>Time's up</h1>
            <p style={styles.endBody}>Thank you — your responses have been recorded.</p>
          </div>
          <button
            style={{ ...styles.nextButton, position: 'absolute', ...(nextHeld || nextSent ? styles.nextButtonPressed : {}) }}
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
   PART 2 — MACKWORTH CLOCK
   ------------------------------------------------------------
   A pointer steps one mark a second. TOTAL_JUMPS times, at
   moments planned before the part starts, it skips two marks;
   the respondent responds (button or Spacebar) within
   RESPONSE_WINDOW_MS. A response with no open window is
   incorrect; a window that closes unanswered is a miss.

   showHud: the countdown and running score in the header.
   allowPause: a Pause button; pausing freezes the pointer, the
   countdown, any open response window and the telemetry, and
   hides the clock. Spacebar presses are ignored while paused.
   ============================================================ */

/** Formats seconds as m:ss, e.g. 245 -> "4:05". */
function formatTime(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

/**
 * The seconds at which the pointer double-jumps, picked BEFORE the part
 * starts: every possible second (skipping the first and last few, so a jump
 * never lands right at the start or end), shuffled, first TOTAL_JUMPS taken.
 * No minimum spacing and no rhythm — nothing a respondent could learn to
 * anticipate.
 */
function pickJumpSeconds(): number[] {
  const pool: number[] = [];
  for (let s = 3; s < CLOCK_SECONDS - 3; s++) pool.push(s);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, TOTAL_JUMPS).sort((a, b) => a - b);
}

type ClockPhase = 'running' | 'finished';

function MackworthClock({
  onProceed,
  showHud,
  allowPause,
}: {
  onProceed: (result: PartNumbers) => void;
  showHud: boolean;
  allowPause: boolean;
}) {
  // The elapsed seconds live in a ref; the per-second re-render is driven by
  // setPointerStep, so the HUD timer updates every tick anyway.
  const [pointerStep, setPointerStep] = useState(0); // raw step count; angle = step % 60
  const [phase, setPhase] = useState<ClockPhase>('running');
  const [pressed, setPressed] = useState(false); // purely visual: the button's "clicked" look
  const [paused, setPaused] = useState(false);

  // Counters: state, because the HUD shows them live (showHud groups).
  const [hits, setHits] = useState(0);
  const [omissions, setOmissions] = useState(0);
  const [falseAlarms, setFalseAlarms] = useState(0);

  // --- Next button feedback ---
  const [nextHeld, setNextHeld] = useState(false);
  const [nextSent, setNextSent] = useState(false);
  const nextSentRef = useRef(false);

  /* ---------- Refs the interval/listener callbacks need "live" ---------- */
  // Planned exactly ONCE per part, on the first render.
  const jumpSecondsRef = useRef<number[] | null>(null);
  if (jumpSecondsRef.current === null) jumpSecondsRef.current = pickJumpSeconds();
  const awaitingRef = useRef<{ jumpTime: number; resolved: boolean } | null>(null);
  const responseTimeoutRef = useRef<PausableTimeout | null>(null);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mainIntervalRef = useRef<PausableInterval | null>(null);
  const startTimeRef = useRef(0); // shifted forward by every pause
  const elapsedMsRef = useRef(0); // frozen the moment the part ends
  // Breaks taken, and the browser clock at the part's start and end.
  const pauseCountRef = useRef(0);
  const pausedMsRef = useRef(0);
  const startedAtRef = useRef(0);
  const endedAtRef = useRef(0);
  const secondsElapsedRef = useRef(0);
  const pointerStepRef = useRef(0);
  const telemetryRef = useRef(new PointerTelemetry());
  // Live copies for the keyboard listener, which is attached once.
  const phaseRef = useRef<ClockPhase>('running');
  const pausedRef = useRef(false);
  const pauseStartedAtRef = useRef(0);

  /* ---------- A response: button or Spacebar ---------- */
  const registerResponse = useCallback(() => {
    if (phaseRef.current !== 'running' || pausedRef.current) return;
    const now = Date.now();

    // Visual acknowledgement only, for every response right or wrong: the
    // input landed, and nothing is said about performance.
    setPressed(true);
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    pressTimeoutRef.current = setTimeout(() => setPressed(false), 130);

    if (awaitingRef.current && !awaitingRef.current.resolved) {
      if (now - awaitingRef.current.jumpTime <= RESPONSE_WINDOW_MS) {
        awaitingRef.current.resolved = true;
        setHits((h) => h + 1);
        return;
      }
    }
    // No open, unanswered jump window: nothing to catch.
    setFalseAlarms((f) => f + 1);
  }, []);

  const tick = useCallback(() => {
    const prevSeconds = secondsElapsedRef.current;
    const nextSeconds = prevSeconds + 1;
    secondsElapsedRef.current = nextSeconds;

    // Is THIS second one of the planned double-jump moments?
    const isJumpSecond = jumpSecondsRef.current!.includes(prevSeconds);
    pointerStepRef.current += isJumpSecond ? 2 : 1;

    if (isJumpSecond) {
      // The previous jump's window still open and unanswered: a miss.
      if (awaitingRef.current && !awaitingRef.current.resolved) setOmissions((o) => o + 1);
      responseTimeoutRef.current?.stop();
      awaitingRef.current = { jumpTime: Date.now(), resolved: false };
      responseTimeoutRef.current = new PausableTimeout(() => {
        if (awaitingRef.current && !awaitingRef.current.resolved) {
          setOmissions((o) => o + 1);
          awaitingRef.current.resolved = true; // close the window
        }
      }, RESPONSE_WINDOW_MS);
    }

    telemetryRef.current.tickIdle();
    setPointerStep(pointerStepRef.current);

    if (nextSeconds >= CLOCK_SECONDS) {
      // Frozen here, so the figure is the task itself and not however long
      // the end screen sat there.
      elapsedMsRef.current = Date.now() - startTimeRef.current;
      endedAtRef.current = Date.now();
      telemetryRef.current.stop();
      phaseRef.current = 'finished';
      setPhase('finished');
    }
  }, []);

  /* ---------- Set up: main timer, keyboard, pointer tracking ---------- */
  useEffect(() => {
    startTimeRef.current = Date.now();
    startedAtRef.current = startTimeRef.current;
    telemetryRef.current.start();
    mainIntervalRef.current = new PausableInterval(tick, 1000);
    mainIntervalRef.current.start();

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // stop the page from scrolling
        registerResponse();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    const telemetry = telemetryRef.current;
    telemetry.attach();

    return () => {
      mainIntervalRef.current?.stop();
      responseTimeoutRef.current?.stop();
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
      window.removeEventListener('keydown', handleKeydown);
      telemetry.detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the main interval the instant the part finishes.
  useEffect(() => {
    if (phase === 'finished') mainIntervalRef.current?.stop();
  }, [phase]);

  const angleDeg = (pointerStep % TICKS_PER_REVOLUTION) * (360 / TICKS_PER_REVOLUTION);
  const timeLeft = CLOCK_SECONDS - secondsElapsedRef.current;

  /** Pause: freeze the pointer, the countdown, any open window and the telemetry. */
  const pauseGame = () => {
    if (pausedRef.current || phaseRef.current !== 'running') return;
    pausedRef.current = true;
    pauseStartedAtRef.current = Date.now();
    pauseCountRef.current += 1;
    mainIntervalRef.current?.pause();
    responseTimeoutRef.current?.pause();
    telemetryRef.current.pause();
    setPressed(false);
    setPaused(true);
  };

  /** Resume: carry on exactly where the part left off. */
  const resumeGame = () => {
    if (!pausedRef.current) return;
    const pausedFor = Date.now() - pauseStartedAtRef.current;
    // The pause is excluded from the game time, idle time and the open window.
    startTimeRef.current += pausedFor;
    pausedMsRef.current += pausedFor;
    telemetryRef.current.resume(pausedFor);
    if (awaitingRef.current) awaitingRef.current.jumpTime += pausedFor;
    pausedRef.current = false;
    setPaused(false);
    mainIntervalRef.current?.resume();
    responseTimeoutRef.current?.resume();
  };

  /** Next clicked: show the button pressed, then hand the numbers over. */
  const handleNext = () => {
    if (nextSentRef.current) return;
    nextSentRef.current = true;
    setNextSent(true);
    setNextHeld(false);
    const result: PartNumbers = {
      hits,
      falseAlarms,
      omissions,
      durationMs: elapsedMsRef.current,
      ...telemetryRef.current.numbers(),
      // Null for groups with no Pause button: not "never paused", never could.
      pauseCount: allowPause ? pauseCountRef.current : null,
      pauseDurationMs: allowPause ? pausedMsRef.current : null,
      startedAt: new Date(startedAtRef.current).toISOString(),
      endedAt: new Date(endedAtRef.current).toISOString(),
    };
    setTimeout(() => onProceed(result), NEXT_PRESS_MS);
  };

  /* ---------- Finished: no figures; Next ends the game ---------- */
  if (phase === 'finished') {
    return (
      <div style={styles.clockScreen}>
        <div style={{ ...styles.endCard, margin: 'auto' }}>
          <h1 style={{ ...styles.endTitle, marginBottom: 16 }}>Session Complete</h1>
          <p style={styles.endBody}>Thank you — your responses have been recorded.</p>
        </div>
        <button
          style={{ ...styles.nextButton, position: 'fixed', ...(nextHeld || nextSent ? styles.nextButtonPressed : {}) }}
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

  /* ---------- Running ---------- */
  return (
    <div style={styles.clockScreen}>
      <header style={{ ...styles.clockHeader, ...(showHud || allowPause ? styles.headerWithHud : {}) }}>
        <div style={styles.partTitle}>
          Mackworth <b style={{ color: '#1a1a1a' }}>Clock</b>
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
                  <span style={{ ...styles.timerValue, minWidth: '4ch' }}>{formatTime(timeLeft)}</span>
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

      <main style={styles.clockMain}>
        <p style={styles.clockInstruction}>
          The pointer normally moves one mark at a time. Respond the moment it skips two.
        </p>
        <ClockFace angleDeg={angleDeg} />
      </main>

      <footer style={styles.clockFooter}>
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

      {/* Opaque, so the clock can't be watched while paused. */}
      {paused && <PauseOverlay onResume={resumeGame} />}
    </div>
  );
}

function ClockFace({ angleDeg }: { angleDeg: number }) {
  const size = 280;
  const center = size / 2;
  const marks = [];
  for (let i = 0; i < TICKS_PER_REVOLUTION; i++) {
    const rad = (((i * 360) / TICKS_PER_REVOLUTION) * Math.PI) / 180;
    const isMajor = i % 5 === 0; // slightly longer mark every 5 ticks
    const outer = center - 10;
    const inner = isMajor ? center - 22 : center - 16;
    marks.push(
      <line
        key={i}
        x1={center + outer * Math.sin(rad)}
        y1={center - outer * Math.cos(rad)}
        x2={center + inner * Math.sin(rad)}
        y2={center - inner * Math.cos(rad)}
        stroke="#c9c2ae"
        strokeWidth={isMajor ? 2.5 : 1.5}
      />,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      // Scales down on narrow screens instead of overflowing.
      style={{ width: 'min(280px, 74vw)', height: 'auto', display: 'block' }}
    >
      <circle cx={center} cy={center} r={center - 6} fill="#ffffff" stroke="#ddd7c7" strokeWidth={2} />
      {marks}
      {/* The pointer, rotated by angleDeg around the center */}
      <line
        x1={center}
        y1={center}
        x2={center}
        y2={30}
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
   SHARED SCREENS
   ============================================================ */
function PauseOverlay({ onResume }: { onResume: () => void }) {
  return (
    <div style={styles.pauseOverlay}>
      <div style={styles.endCard}>
        <h1 style={{ ...styles.endTitle, marginBottom: 12 }}>Paused</h1>
        <p style={{ ...styles.endBody, marginBottom: 24 }}>
          The timer is stopped. Press Resume when you're ready to continue.
        </p>
        <button style={styles.resumeButton} onClick={onResume}>
          Resume
        </button>
      </div>
    </div>
  );
}

/* A group instruction page: a white card with the heading, the group's short
   name and its paragraphs, a tick box under the text, and the fixed bottom
   bar. The forward button stays disabled until the box is ticked. */
type BarButton = { label: string; onClick: () => void };

function InstructionScreen({
  heading,
  name,
  paragraphs,
  confirm,
  back,
  next,
}: {
  heading: string;
  name?: string;
  paragraphs: string[];
  confirm: { ticked: boolean; onChange: (value: boolean) => void };
  back: BarButton;
  next: BarButton;
}) {
  const locked = !confirm.ticked;
  return (
    <div style={styles.screen}>
      <div style={styles.instructionsCard}>
        <h1 style={{ ...styles.title, ...(name ? { marginBottom: 6 } : {}) }}>{heading}</h1>
        {name && <p style={styles.instructionsName}>{name}</p>}
        {paragraphs.map((text, i) => (
          <p key={i} style={styles.instructionsText}>
            {text}
          </p>
        ))}
        <label style={styles.tickRow}>
          <input
            type="checkbox"
            checked={confirm.ticked}
            onChange={(e) => confirm.onChange(e.target.checked)}
            style={styles.tickBox}
          />
          <span>{CONFIRM_TEXT}</span>
        </label>
      </div>

      <div style={styles.bottomBar}>
        <button style={styles.cancelButton} onClick={back.onClick}>
          {back.label}
        </button>
        <button
          style={locked ? { ...styles.startButton, ...styles.buttonDisabled } : styles.startButton}
          disabled={locked}
          onClick={() => {
            if (!locked) next.onClick();
          }}
        >
          {next.label}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   THE TWO ANNOTATED PREVIEWS
   ------------------------------------------------------------
   Each is one SVG: a miniature of the real task screen, with
   numbered step boxes and arrows pointing at the part each step
   refers to. Nothing here is live.
   ============================================================ */
const INK = {
  paper: '#f5f2ea',
  line: '#ddd7c7',
  ink: '#1a1a1a',
  muted: '#8a8578',
  gold: '#c2820a',
  goldDeep: '#8f5f07',
};

/** A numbered callout: gold disc with the step number, then short text. */
function StepBox({ x, y, w, n, text }: { x: number; y: number; w: number; n: number; text: string }) {
  const h = 38;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#ffffff" stroke={INK.line} />
      <circle cx={x + 21} cy={y + h / 2} r={11} fill={INK.gold} />
      <text
        x={x + 21}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={800}
        fill="#fff8ea"
      >
        {n}
      </text>
      <text x={x + 40} y={y + h / 2} dominantBaseline="central" fontSize={13} fill={INK.ink}>
        {text}
      </text>
    </g>
  );
}

const arrowDefs = (
  <defs>
    <marker id="clashClockArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path
        d="M2 1L8 5L2 9"
        fill="none"
        stroke="context-stroke"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </marker>
  </defs>
);

const arrowProps = {
  stroke: INK.gold,
  strokeWidth: 1.6,
  fill: 'none',
  markerEnd: 'url(#clashClockArrow)',
};

/* The word reads BLUE but is printed in green ink, so the correct answer is
   the GREEN button. */
const CLASH_OPTIONS = [
  { name: 'RED', css: '#ef4444' },
  { name: 'BLUE', css: '#3b82f6' },
  { name: 'GREEN', css: '#22c55e' },
  { name: 'PURPLE', css: '#a855f7' },
];

function ColorClashPreview() {
  const btnW = 100;
  const btnGap = 12;
  const rowW = CLASH_OPTIONS.length * btnW + (CLASH_OPTIONS.length - 1) * btnGap;
  const rowX = 15 + (470 - rowW) / 2;
  const btnY = 206;

  return (
    <svg
      width="100%"
      viewBox="0 0 500 322"
      style={styles.previewSvg}
      role="img"
      aria-label="Preview of the Color Clash screen with three numbered steps"
    >
      {arrowDefs}
      <rect x={15} y={15} width={470} height={292} rx={12} fill={INK.paper} stroke={INK.line} />
      <text x={36} y={44} fontSize={11} letterSpacing={2.5} fill={INK.muted}>
        STROOP CLASH
      </text>
      <text
        x={135}
        y={118}
        textAnchor="middle"
        fontSize={42}
        fontWeight={800}
        letterSpacing={2}
        fill="#22c55e"
        stroke="#7a7568"
        strokeWidth={1.2}
        paintOrder="stroke fill"
      >
        BLUE
      </text>

      {CLASH_OPTIONS.map((opt, i) => {
        const x = rowX + i * (btnW + btnGap);
        return (
          <g key={opt.name}>
            <rect
              x={x}
              y={btnY}
              width={btnW}
              height={38}
              rx={8}
              fill={opt.css}
              stroke={opt.name === 'GREEN' ? INK.ink : 'transparent'}
              strokeWidth={opt.name === 'GREEN' ? 2.5 : 0}
            />
            <text
              x={x + btnW / 2}
              y={btnY + 19}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight={700}
              letterSpacing={1}
              fill="#ffffff"
              stroke="#000000"
              strokeWidth={0.8}
              paintOrder="stroke fill"
            >
              {opt.name}
            </text>
          </g>
        );
      })}

      <StepBox x={252} y={62} w={216} n={1} text="Ignore what the word says" />
      <path d="M252 81 L200 100" {...arrowProps} />
      <StepBox x={252} y={116} w={216} n={2} text="Look at the ink colour" />
      <path d="M252 135 L200 122" {...arrowProps} />
      <StepBox x={140} y={252} w={220} n={3} text="Click that colour" />
      <path d="M310 252 L310 246" {...arrowProps} />
    </svg>
  );
}

/* Dashed hand = where the pointer was, solid hand = where it moved to. The
   gap between them is the two-mark skip. */
function MackworthClockPreview() {
  const cx = 128;
  const cy = 150;
  const r = 74;
  const degPerTick = 360 / TICKS_PER_REVOLUTION;

  const marks = [];
  for (let i = 0; i < TICKS_PER_REVOLUTION; i++) {
    const rad = (i * degPerTick * Math.PI) / 180;
    const isMajor = i % 5 === 0;
    const isSkipMark = i === 2;
    const outer = r - 4;
    const inner = isMajor ? r - 14 : r - 10;
    marks.push(
      <line
        key={i}
        x1={cx + outer * Math.sin(rad)}
        y1={cy - outer * Math.cos(rad)}
        x2={cx + inner * Math.sin(rad)}
        y2={cy - inner * Math.cos(rad)}
        stroke={isSkipMark ? INK.gold : '#c9c2ae'}
        strokeWidth={isSkipMark ? 3 : isMajor ? 2 : 1.2}
      />,
    );
  }

  const hand = (step: number, faint: boolean) => (
    <line
      x1={cx}
      y1={cy}
      x2={cx}
      y2={cy - (r - 20)}
      stroke={faint ? '#cfc7b4' : INK.gold}
      strokeWidth={faint ? 3 : 4}
      strokeLinecap="round"
      strokeDasharray={faint ? '4 4' : undefined}
      transform={`rotate(${step * degPerTick} ${cx} ${cy})`}
    />
  );

  return (
    <svg
      width="100%"
      viewBox="0 0 500 322"
      style={styles.previewSvg}
      role="img"
      aria-label="Preview of the Mackworth Clock screen with three numbered steps"
    >
      {arrowDefs}
      <rect x={15} y={15} width={470} height={292} rx={12} fill={INK.paper} stroke={INK.line} />
      <text x={36} y={44} fontSize={11} letterSpacing={2.5} fill={INK.muted}>
        MACKWORTH CLOCK
      </text>

      <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke={INK.line} strokeWidth={1.5} />
      {marks}
      {hand(0, true)}
      {hand(2, false)}
      <circle cx={cx} cy={cy} r={5} fill={INK.ink} />

      <rect x={70} y={252} width={116} height={34} rx={8} fill={INK.gold} />
      <rect x={70} y={286} width={116} height={3} rx={1.5} fill={INK.goldDeep} />
      <text
        x={128}
        y={269}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={800}
        letterSpacing={1.4}
        fill="#fff8ea"
      >
        TARGET DETECTED
      </text>

      <StepBox x={252} y={62} w={216} n={1} text="Watch the pointer move" />
      <path d="M252 81 L206 110" {...arrowProps} />
      <StepBox x={252} y={140} w={216} n={2} text="Sometimes it skips a mark" />
      <path d="M252 159 L172 118" {...arrowProps} />
      <StepBox x={252} y={218} w={216} n={3} text="Press the button when it does" />
      <path d="M252 237 L194 262" {...arrowProps} />

      <text x={128} y={110} textAnchor="middle" fontSize={11} fill={INK.muted}>
        was
      </text>
    </svg>
  );
}

/* ============================================================
   STYLES
   ------------------------------------------------------------
   One sheet for the whole game. Journey screens first, then
   what the two parts share, then each part's own.
   ============================================================ */
const FONT = "'Segoe UI', Roboto, Arial, sans-serif";

const styles: Record<string, CSSProperties> = {
  /* ---------- Journey screens: groups, previews, instructions, countdown ---------- */
  screen: {
    position: 'relative',
    minHeight: VIEWPORT_HEIGHT,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f2ea',
    color: '#1a1a1a',
    fontFamily: FONT,
    // Room for the fixed bottom bar, so a long instruction card can scroll
    // without the buttons sitting on top of the text.
    padding: '24px 16px 104px',
    boxSizing: 'border-box',
  },
  title: {
    fontSize: 24,
    letterSpacing: 1,
    marginBottom: 28,
    textAlign: 'center',
    // Set explicitly: without its own colour, an h1 rule in a global
    // stylesheet (colour, opacity or gradient text) can fade it.
    color: '#1a1a1a',
    WebkitTextFillColor: '#1a1a1a',
    opacity: 1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    width: '100%',
    maxWidth: 480,
  },
  groupButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '18px 4px',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    fontFamily: FONT,
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    borderRadius: 10,
    cursor: 'pointer',
    color: '#1a1a1a',
  },
  groupNumber: { display: 'block' },
  // The short name under "Group N" on each selection button.
  groupName: { display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: 1, color: '#8a8578' },
  // The same name, under the heading on every instructions page.
  instructionsName: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 1,
    color: '#8a8578',
    textAlign: 'center',
    margin: '0 0 24px',
  },
  instructionsCard: {
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    borderRadius: 16,
    padding: 'clamp(24px, 6vw, 36px) clamp(20px, 6vw, 40px)',
    maxWidth: 560,
    width: '100%',
    boxSizing: 'border-box',
  },
  instructionsText: { fontSize: 15, lineHeight: 1.6, color: '#4a463d', marginBottom: 14 },
  previewCard: {
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    borderRadius: 16,
    padding: '24px 28px 26px',
    maxWidth: 580,
    width: '100%',
    boxSizing: 'border-box',
  },
  previewTitle: {
    fontSize: 20,
    letterSpacing: 1,
    margin: '0 0 16px',
    textAlign: 'center',
    color: '#1a1a1a',
    WebkitTextFillColor: '#1a1a1a',
    opacity: 1,
  },
  previewSvg: { display: 'block', fontFamily: FONT },
  // The "I have read and understood" row; the whole row is the click target.
  tickRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    padding: '14px 16px',
    background: '#faf8f2',
    border: '1px solid #ddd7c7',
    borderRadius: 10,
    fontSize: 15,
    lineHeight: 1.4,
    color: '#1a1a1a',
    cursor: 'pointer',
    userSelect: 'none',
  },
  tickBox: { width: 22, height: 22, flexShrink: 0, margin: 0, accentColor: '#c2820a', cursor: 'pointer' },
  buttonDisabled: { background: '#ddd7c7', color: '#8a8578', cursor: 'not-allowed' },
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    gap: 12,
    justifyContent: 'space-between',
    padding: '16px clamp(12px, 4vw, 24px)',
    // Clears the iOS home indicator.
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
    background: '#f5f2ea',
    borderTop: '1px solid #e6e0d0',
    boxSizing: 'border-box',
  },
  cancelButton: {
    padding: '14px clamp(16px, 5vw, 28px)',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONT,
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    borderRadius: 10,
    cursor: 'pointer',
    color: '#4a463d',
    touchAction: 'manipulation',
  },
  startButton: {
    padding: '14px clamp(16px, 5vw, 28px)',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONT,
    background: '#c2820a',
    color: '#fff8ea',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  countdownText: { fontSize: 18, letterSpacing: 2, textTransform: 'uppercase', color: '#8a8578', marginBottom: 12 },
  countdownNumber: { fontSize: 120, fontWeight: 800, color: '#c2820a' },

  /* ---------- Shared by both parts ---------- */
  // Pushes the HUD / Pause to the right-hand side of the header.
  headerWithHud: { justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: '8px 16px',
  },
  hudGroup: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px' },
  partTitle: { fontSize: 15, letterSpacing: 3, color: '#8a8578', textTransform: 'uppercase' },
  scoreRow: { fontFamily: "'Consolas', 'Courier New', monospace", fontSize: 13, color: '#8a8578' },
  scoreValue: { color: '#1a1a1a', fontSize: 16 },
  timerBox: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    fontFamily: "'Consolas', 'Courier New', monospace",
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    padding: '8px 14px',
    borderRadius: 8,
  },
  timerBoxWarn: { borderColor: '#dc2626' },
  timerLabel: { fontSize: 11, color: '#8a8578', letterSpacing: 2 },
  timerValue: { fontSize: 22, fontWeight: 700, color: '#c2820a', textAlign: 'right' },
  pauseButton: {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONT,
    background: '#ffffff',
    color: '#1a1a1a',
    border: '1px solid #ddd7c7',
    borderRadius: 8,
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },
  // Fully opaque so nothing on the task screen can be seen while paused.
  pauseOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f2ea',
    zIndex: 50,
  },
  // The card used by Pause, Time's up and Session Complete.
  endCard: {
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    borderRadius: 16,
    padding: 'clamp(28px, 7vw, 40px) clamp(22px, 7vw, 48px)',
    textAlign: 'center',
    maxWidth: 460,
    width: 'min(460px, calc(100% - 32px))',
    boxSizing: 'border-box',
  },
  endTitle: { margin: '0 0 6px', fontSize: 22, letterSpacing: 2, color: '#8a8578', textTransform: 'uppercase' },
  endBody: { fontSize: 15, lineHeight: 1.6, color: '#4a463d', margin: 0 },
  resumeButton: {
    padding: '14px 36px',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: FONT,
    background: '#c2820a',
    color: '#fff8ea',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  // Bottom-right corner; each part sets `position` (absolute against the
  // Time's up overlay, fixed on Session Complete). The safe-area inset keeps
  // it clear of the home indicator; the resting edge gives a press something
  // to sink into.
  nextButton: {
    right: 28,
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    padding: '14px 30px',
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    border: 'none',
    borderRadius: 10,
    background: '#1a1a1a',
    color: '#ffffff',
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
    boxShadow: '0 4px 0 #000000',
    transition: 'transform 0.06s ease, box-shadow 0.06s ease, background 0.06s ease',
  },
  // While held down and after the click: it sinks 3px and the edge shrinks.
  nextButtonPressed: { transform: 'translateY(3px)', boxShadow: '0 1px 0 #000000', background: '#3a3a3a' },

  /* ---------- Color Clash ---------- */
  clashScreen: {
    position: 'relative',
    height: VIEWPORT_HEIGHT,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f2ea',
    color: '#1a1a1a',
    fontFamily: FONT,
    overflow: 'hidden',
  },
  clashHeader: { display: 'flex', justifyContent: 'flex-start', alignItems: 'center', padding: '20px 28px' },
  clashInstruction: {
    fontSize: 15,
    lineHeight: 1.5,
    color: '#5c5849',
    margin: '0 auto',
    padding: '0 28px',
    maxWidth: 420,
    textAlign: 'center',
  },
  // The ONLY thing that blanks every round — header and instruction sit outside it.
  stageWrapper: { position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' },
  clashMain: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  word: {
    fontSize: 'clamp(48px, 10vw, 110px)',
    fontWeight: 800,
    letterSpacing: 4,
    textTransform: 'uppercase',
    userSelect: 'none',
    // Thin dark outline so a WHITE word stays visible on the off-white background.
    WebkitTextStroke: '1.5px #7a7568',
    paintOrder: 'stroke fill',
  },
  clashFooter: {
    display: 'flex',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 'clamp(8px, 2.5vw, 16px)',
    padding: 'clamp(18px, 6vw, 36px) clamp(12px, 4vw, 36px)',
  },
  optionBtn: {
    // Two per row on a phone, four across on a wide screen.
    flex: '1 1 clamp(120px, 40%, 130px)',
    minWidth: 0,
    maxWidth: 170,
    padding: 'clamp(13px, 3.5vw, 16px) 12px',
    fontSize: 'clamp(13px, 3.6vw, 16px)',
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    border: '3px solid transparent',
    borderRadius: 10,
    cursor: 'pointer',
    color: '#ffffff',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    // Black outline so the label stays readable whatever colour fills the button.
    WebkitTextStroke: '1px #000000',
    paintOrder: 'stroke fill',
    boxShadow: '0 4px 0 rgba(0,0,0,0.3)',
    transition: 'transform 0.06s ease, box-shadow 0.06s ease, filter 0.06s ease',
  },
  // The clicked option sinks and darkens — the same whether right or wrong.
  optionBtnPressed: { transform: 'translateY(3px)', boxShadow: '0 1px 0 rgba(0,0,0,0.3)', filter: 'brightness(0.88)' },
  blankOverlay: {
    position: 'absolute',
    inset: 0,
    background: '#f5f2ea',
    pointerEvents: 'none',
    transition: 'opacity 0.1s linear',
    zIndex: 5,
  },
  gameOverOverlay: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(245,242,234,0.92)',
    zIndex: 60,
  },

  /* ---------- Mackworth Clock ---------- */
  clockScreen: {
    height: VIEWPORT_HEIGHT,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f2ea',
    color: '#1a1a1a',
    fontFamily: FONT,
    overflow: 'hidden',
  },
  clockHeader: {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 'clamp(14px, 4vw, 20px) clamp(16px, 5vw, 28px)',
  },
  clockMain: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  clockInstruction: {
    fontSize: 15,
    lineHeight: 1.5,
    color: '#5c5849',
    margin: 0,
    padding: '0 20px',
    maxWidth: 420,
    textAlign: 'center',
  },
  clockFooter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: 'clamp(20px, 6vw, 36px)',
  },
  targetButton: {
    padding: 'clamp(16px, 4.5vw, 20px) clamp(28px, 10vw, 48px)',
    fontSize: 'clamp(15px, 4vw, 18px)',
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: 'uppercase',
    background: '#c2820a',
    color: '#fff8ea',
    border: '4px solid transparent',
    borderRadius: 12,
    cursor: 'pointer',
    // Stops a double-tap being read as a zoom gesture, which would swallow
    // rapid responses on mobile.
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    boxShadow: '0 4px 0 #8f5f07',
    transform: 'translateY(0)',
    transition:
      'transform 70ms ease-out, box-shadow 70ms ease-out, background-color 70ms ease-out, border-color 70ms ease-out',
  },
  targetButtonPressed: { background: '#a86f08', boxShadow: '0 1px 0 #8f5f07', transform: 'translateY(3px)' },
  hint: { fontSize: 12, color: '#8a8578', margin: 0 },
};
