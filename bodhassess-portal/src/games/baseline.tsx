import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { PortalGamePart } from '@/lib/api';
import type { GameProps } from './registry';

/* ============================================================
   ATTENTION BASELINE — one game, one file
   ------------------------------------------------------------
   intro -> how to play -> round 1 -> round 2 -> complete.
   Everything this game needs lives here: timings, the letter
   generator, the screens, and what it records.

   WHAT IT RECORDS — overall, never per letter or per round —
   as ONE game_result part, BASELINE:
     hits               target letters clicked
     falseAlarms        non-target letters clicked
     omissions          targets still unclicked when their block closed
     durationMs         round 1 start to round 2 end
     mouseDistancePx    pointer travel during the rounds
     mouseIdleSeconds   seconds, during the rounds, with no pointer movement
     startedAt/endedAt  the browser clock at round 1 start / round 2 end
   No pause, no group, no instruction timing — those columns stay
   empty. Handed over once, through onComplete, when the
   respondent presses Continue on the last screen.
   ============================================================ */

/** The one part this game reports. */
const PART_CODE = 'BASELINE';

/* ============================================================
   CONSTANTS
   ============================================================ */
const TASK1_SECONDS = 70; // round 1: selective attention
const TASK2_SECONDS = 210; // round 2: sustained attention (3.5 min)
const GRID_SECONDS = 10; // each block auto-advances after this many seconds
const COLUMNS = 8; // items across
const ROWS = 4; // rows down  -> 32 items on screen
const MIN_TARGETS = 2; // per row
const MAX_TARGETS = 4; // per row
const MAX_TARGET_RUN = 2; // most targets allowed side by side in a row (KK ok, KKK not)
const FINISH_PRESS_MS = 180; // how long the final button stays pressed before results are handed over

/* 100vh measures the viewport *behind* mobile browser chrome. dvh tracks
   the visible area instead; we fall back where it isn't supported. */
const VIEWPORT_HEIGHT =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('height: 100dvh')
    ? '100dvh'
    : '100vh';

/* The pool the target is drawn from: the full alphabet. */
const LETTER_POOL = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/* ============================================================
   POINTER TELEMETRY
   ------------------------------------------------------------
   Pointer travel and idle seconds, counted only while tracking
   is on (the two rounds). pointermove covers mouse, touch and
   pen — mousemove alone never fires on a touch device, which
   would leave distance at 0 and mark every second idle.
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

  start() {
    this.tracking = true;
  }

  stop() {
    this.tracking = false;
  }

  /** Called once a second by the round clock: a second with no movement is an idle second. */
  tickIdle() {
    if (this.tracking && Date.now() - this.lastMoveAt >= 1000) this.idleSeconds += 1;
  }
}

/* ============================================================
   ITEM GENERATION
   Each block picks its own target letter. Everything else in the
   block is drawn from the remaining letters in the pool.
   Every row of COLUMNS carries MIN_TARGETS..MAX_TARGETS targets,
   and no more than MAX_TARGET_RUN of them ever sit side by side.
   ============================================================ */
let itemCounter = 0;

type Item = { id: string; letter: string; isTarget: boolean };
type Block = { targetLetter: string; rows: Item[][] };
type Phase = 'intro' | 'preview' | 'task1' | 'task2' | 'complete';

function makeItem(letter: string, isTarget: boolean): Item {
  itemCounter++;
  return { id: `i${itemCounter}`, letter, isTarget };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** True if the row contains a run of targets longer than `max`. */
function hasLongRun(items: Item[], max: number): boolean {
  let run = 0;
  for (const item of items) {
    run = item.isTarget ? run + 1 : 0;
    if (run > max) return true;
  }
  return false;
}

/**
 * Deterministic fallback: lay the distractors out first, then deal the
 * targets round-robin into the gaps between them, never putting more
 * than `max` into any one gap. Only reached if the random draws below
 * all happen to fail, which is vanishingly rare at these row sizes.
 */
function layoutIntoGaps(targets: Item[], distractors: Item[], max: number): Item[] {
  const gaps: Item[][] = Array.from({ length: distractors.length + 1 }, () => []);
  const order = shuffle(gaps.map((_, i) => i)); // random gap order, so it isn't a fixed pattern

  let placed = 0;
  for (let pass = 0; pass < max && placed < targets.length; pass++) {
    for (const g of order) {
      if (placed >= targets.length) break;
      gaps[g].push(targets[placed++]);
    }
  }

  const out: Item[] = [];
  for (let i = 0; i < gaps.length; i++) {
    out.push(...gaps[i]);
    if (i < distractors.length) out.push(distractors[i]);
  }
  return out;
}

/**
 * Shuffles the row, rejecting any arrangement with a target run longer
 * than `max`. Rejection sampling keeps the placement genuinely random
 * (unlike a spacing rule, which would make positions predictable);
 * the gap layout is only a safety net.
 */
function shuffleWithRunCap(targets: Item[], distractors: Item[], max: number): Item[] {
  const all = [...targets, ...distractors];
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = shuffle(all);
    if (!hasLongRun(candidate, max)) return candidate;
  }
  return layoutIntoGaps(targets, distractors, max);
}

function generateRow(targetLetter: string): Item[] {
  const pool = LETTER_POOL.filter((l) => l !== targetLetter);
  const targetCount = MIN_TARGETS + Math.floor(Math.random() * (MAX_TARGETS - MIN_TARGETS + 1));

  const targets: Item[] = [];
  for (let i = 0; i < targetCount; i++) targets.push(makeItem(targetLetter, true));

  const distractors: Item[] = [];
  for (let i = 0; i < COLUMNS - targetCount; i++) {
    const letter = pool[Math.floor(Math.random() * pool.length)];
    distractors.push(makeItem(letter, false));
  }

  return shuffleWithRunCap(targets, distractors, MAX_TARGET_RUN);
}

/** Picks a target letter (never the same as the previous block) and builds ROWS rows. */
function generateGrid(previousTarget: string | null): Block {
  const choices = LETTER_POOL.filter((l) => l !== previousTarget);
  const targetLetter = choices[Math.floor(Math.random() * choices.length)];
  const rows: Item[][] = [];
  for (let r = 0; r < ROWS; r++) rows.push(generateRow(targetLetter));
  return { targetLetter, rows };
}

/* ============================================================
   COMPONENT
   ------------------------------------------------------------
   No countdown and no running score are shown during the rounds.
   Every counter lives in a ref: nothing on screen reads them, so
   counting never costs a render.
   ============================================================ */
export default function Baseline({ onComplete }: GameProps) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [block, setBlock] = useState<Block>(() => generateGrid(null));
  const [clickedIds, setClickedIds] = useState<Set<string>>(new Set());

  /* ---------- Final button feedback ----------
     Purely visual, plus a guard against double clicks. */
  const [finishHeld, setFinishHeld] = useState(false); // finger / mouse is down on it right now
  const [finishSent, setFinishSent] = useState(false); // clicked; results are being handed over
  const finishSentRef = useRef(false); // blocks a second click before state has updated

  /* ---------- Refs: authoritative while a round runs ---------- */
  const phaseRef = useRef<Phase>('intro');
  const blockRef = useRef(block); // misses always read the block on screen
  const clickedIdsRef = useRef<Set<string>>(new Set());
  const gridTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef(0); // wall-clock end of the current round
  const countsRef = useRef({ correct: 0, incorrect: 0, missed: 0 });
  const startedAtRef = useRef<number | null>(null); // round 1 start
  const endedAtRef = useRef<number | null>(null); // round 2 end
  const telemetryRef = useRef(new PointerTelemetry());

  const setBlockBoth = (b: Block) => {
    blockRef.current = b;
    setBlock(b);
  };

  /** Closes the block on screen: every target in it still unclicked is a miss. */
  const closeBlock = () => {
    const clicked = clickedIdsRef.current;
    countsRef.current.missed += blockRef.current.rows
      .flat()
      .filter((i) => i.isTarget && !clicked.has(i.id)).length;
  };

  /* ---------- Advance to a new block (refs only, so no stale closure) ---------- */
  const advanceGrid = useCallback(() => {
    // Ignore a Next press that lands after the round clock has already stopped.
    if (tickRef.current === null) return;

    closeBlock();
    if (gridTimeoutRef.current) clearTimeout(gridTimeoutRef.current);
    clickedIdsRef.current = new Set();
    setClickedIds(new Set());
    setBlockBoth(generateGrid(blockRef.current.targetLetter));
    gridTimeoutRef.current = setTimeout(advanceGrid, GRID_SECONDS * 1000);
  }, []);

  const handleItemClick = (item: Item) => {
    if (clickedIdsRef.current.has(item.id)) return;
    clickedIdsRef.current.add(item.id);
    setClickedIds(new Set(clickedIdsRef.current));
    if (item.isTarget) countsRef.current.correct += 1;
    else countsRef.current.incorrect += 1;
  };

  /* ---------- End of a round: called by the tick, never inferred from state ---------- */
  const endTask = useCallback(() => {
    if (gridTimeoutRef.current) clearTimeout(gridTimeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    gridTimeoutRef.current = null;
    tickRef.current = null;

    closeBlock();

    if (phaseRef.current === 'task1') {
      setPhase('task2');
    } else {
      telemetryRef.current.stop();
      endedAtRef.current = Date.now();
      setPhase('complete');
    }
  }, []);

  /* ---------- Start / stop a timed round ----------
     The countdown runs on a 1s interval but is never rendered.
     Timing is driven by deadlineRef (wall-clock), so nothing
     depends on a visible counter. */
  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== 'task1' && phase !== 'task2') return;

    const totalSeconds = phase === 'task1' ? TASK1_SECONDS : TASK2_SECONDS;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    telemetryRef.current.start();
    deadlineRef.current = Date.now() + totalSeconds * 1000;
    clickedIdsRef.current = new Set();
    setClickedIds(new Set());
    setBlockBoth(generateGrid(blockRef.current.targetLetter));

    gridTimeoutRef.current = setTimeout(advanceGrid, GRID_SECONDS * 1000);
    tickRef.current = setInterval(() => {
      telemetryRef.current.tickIdle();
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      if (remaining === 0) endTask();
    }, 1000);

    return () => {
      if (gridTimeoutRef.current) clearTimeout(gridTimeoutRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [phase, advanceGrid, endTask]);

  /* ---------- Pointer tracking: attached for the life of the game ---------- */
  useEffect(() => {
    const telemetry = telemetryRef.current;
    telemetry.attach();
    return () => telemetry.detach();
  }, []);

  /** Final button clicked: show it pressed, then hand the results over. */
  const handleFinish = () => {
    if (finishSentRef.current) return; // ignore double clicks
    finishSentRef.current = true;
    setFinishSent(true);
    setFinishHeld(false);

    // Build the result now, but hand it over a moment later so the
    // pressed look is actually seen before the game closes.
    const telemetry = telemetryRef.current;
    const startedAt = startedAtRef.current ?? Date.now();
    const endedAt = endedAtRef.current ?? startedAt;
    const part: PortalGamePart = {
      partCode: PART_CODE,
      hits: countsRef.current.correct,
      falseAlarms: countsRef.current.incorrect,
      omissions: countsRef.current.missed,
      durationMs: endedAt - startedAt,
      mouseDistancePx: Math.round(telemetry.distance),
      mouseIdleSeconds: telemetry.idleSeconds,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
    };
    setTimeout(() => onComplete({ parts: [part] }), FINISH_PRESS_MS);
  };

  /* ============================================================
     Intro
     ============================================================ */
  if (phase === 'intro') {
    return (
      <div style={styles.screen}>
        <div style={styles.card}>
          <h1 style={styles.h1}>Attention baseline</h1>
          <p style={styles.body}>
            You'll see a block of letters, four rows of eight, drawn at random from A to Z.
          </p>
          <p style={styles.body}>
            One letter is named at the top of the screen. Click every copy of that letter and leave
            the rest alone.
          </p>
          <div style={styles.exampleRow}>
            <Example letter="K" caption="Target is K" good />
            <Example letter="R" caption="Skip" good={false} />
            <Example letter="M" caption="Skip" good={false} />
          </div>
          <p style={styles.body}>
            Every {GRID_SECONDS} seconds the block is replaced <b>and the target letter changes</b>,
            so check the top of the screen each time. You can press Next to move on early.
          </p>
          <p style={styles.body}>There are two rounds, the second longer than the first.</p>
          <button style={styles.primaryButton} onClick={() => setPhase('preview')}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     Preview — annotated still of the round screen
     ------------------------------------------------------------
     Shown once, before round one. Nothing on it is live.
     ============================================================ */
  if (phase === 'preview') {
    return (
      <div style={styles.screen}>
        <div style={{ ...styles.card, maxWidth: 600 }}>
          <h1 style={{ ...styles.h1, textAlign: 'center' }}>How to play</h1>
          <TaskPreview />
          <button style={styles.primaryButton} onClick={() => setPhase('task1')}>
            Start round one
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     Round 1 / Round 2
     ------------------------------------------------------------
     No countdown and no running score are shown.
     ============================================================ */
  if (phase === 'task1' || phase === 'task2') {
    return (
      <div style={styles.screen}>
        <header style={styles.header}>
          <div style={styles.eyebrow}>CANCELLATION-TASK</div>
        </header>

        <main style={styles.main}>
          <p style={styles.instruction}>
            Click every copy of the letter shown below, and leave the rest alone. The letter changes
            each time the block is replaced.
          </p>

          {/* Re-keyed on the target letter so it repaints the moment the block turns over */}
          <div style={styles.cueBar} key={block.targetLetter}>
            <span style={styles.cueText}>Click every</span>
            <span style={styles.cueLetter}>{block.targetLetter}</span>
          </div>

          <div style={styles.grid}>
            {block.rows.map((rowItems, rowIndex) => (
              <div key={rowIndex} style={styles.gridRow}>
                {rowItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    aria-label={`letter ${item.letter}`}
                    style={{
                      ...styles.cell,
                      ...(clickedIds.has(item.id) ? styles.cellClicked : {}),
                    }}
                  >
                    <span style={styles.cellLetter}>{item.letter}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <button style={styles.nextButton} onClick={advanceGrid}>
            Next
          </button>
        </main>
      </div>
    );
  }

  /* ============================================================
     Complete — no figures are shown; they leave through onComplete.
     ============================================================ */
  return (
    <div style={styles.screen}>
      <div style={{ ...styles.card, maxWidth: 460 }}>
        <h1 style={styles.h1}>Baseline complete</h1>
        <p style={styles.body}>Thank you — your responses have been recorded.</p>

        <button
          style={{
            ...styles.primaryButton,
            ...styles.pressable,
            ...(finishHeld || finishSent ? styles.pressablePressed : {}),
          }}
          onPointerDown={() => setFinishHeld(true)}
          onPointerUp={() => setFinishHeld(false)}
          onPointerCancel={() => setFinishHeld(false)}
          onPointerLeave={() => setFinishHeld(false)}
          onClick={handleFinish}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   ANNOTATED MOCK OF THE ROUND SCREEN
   ------------------------------------------------------------
   One SVG: a miniature of the real screen with numbered step
   boxes and arrows pointing at the part each step refers to.
   Nothing here is live. The letters are fixed rather than
   generated, so every respondent sees exactly the same example.
   ============================================================ */
const INK = {
  paper: '#f5f2ea',
  line: '#ddd7c7',
  ink: '#1a1a1a',
  muted: '#8a8578',
  gold: '#c2820a',
  cream: '#fbeed2',
};

const PREVIEW_TARGET = 'K';
const PREVIEW_ROWS = [
  ['R', 'K', 'M', 'K', 'W', 'B', 'K', 'T'],
  ['K', 'D', 'K', 'S', 'V', 'K', 'L', 'P'],
  ['N', 'Q', 'K', 'K', 'F', 'H', 'K', 'Z'],
  ['K', 'X', 'B', 'K', 'R', 'K', 'M', 'Y'],
];
/** Cells drawn as already clicked, as "row,col" — shows what a hit looks like. */
const PREVIEW_CLICKED = new Set(['0,1', '0,3']);

function StepBox({ x, y, w, n, text }: { x: number; y: number; w: number; n: number; text: string }) {
  const h = 34;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#ffffff" stroke={INK.line} />
      <circle cx={x + 19} cy={y + h / 2} r={10} fill={INK.gold} />
      <text
        x={x + 19}
        y={y + h / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={800}
        fill="#fff8ea"
      >
        {n}
      </text>
      <text x={x + 36} y={y + h / 2} dominantBaseline="central" fontSize={12} fill={INK.ink}>
        {text}
      </text>
    </g>
  );
}

function TaskPreview() {
  const cell = 26;
  const gap = 5;
  const gridX = 40;
  const gridY = 108;

  const arrow = {
    stroke: INK.gold,
    strokeWidth: 1.6,
    fill: 'none',
    markerEnd: 'url(#baselineArrow)',
  };

  return (
    <svg
      width="100%"
      viewBox="0 0 500 322"
      style={styles.previewSvg}
      role="img"
      aria-label="Preview of the task screen with four numbered steps"
    >
      <defs>
        <marker
          id="baselineArrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
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

      <rect x={15} y={15} width={470} height={292} rx={12} fill={INK.paper} stroke={INK.line} />
      <text x={40} y={42} fontSize={11} fill={INK.muted}>
        CANCELLATION-TASK
      </text>

      {/* The cue pill */}
      <rect x={40} y={58} width={168} height={36} rx={18} fill={INK.ink} />
      <text x={56} y={76} dominantBaseline="central" fontSize={12} fill={INK.paper}>
        Click every
      </text>
      <circle cx={188} cy={76} r={14} fill={INK.gold} />
      <text
        x={188}
        y={76}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={15}
        fontWeight={800}
        fill="#fff8ea"
      >
        {PREVIEW_TARGET}
      </text>

      {/* The letter grid */}
      {PREVIEW_ROWS.map((row, r) =>
        row.map((letter, c) => {
          const x = gridX + c * (cell + gap);
          const y = gridY + r * (cell + gap);
          const isClicked = PREVIEW_CLICKED.has(`${r},${c}`);
          return (
            <g key={`${r},${c}`}>
              <rect
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={5}
                fill={isClicked ? INK.cream : '#ffffff'}
                stroke={isClicked ? INK.gold : INK.line}
                strokeWidth={isClicked ? 2 : 1}
              />
              <text
                x={x + cell / 2}
                y={y + cell / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontWeight={800}
                fill={INK.ink}
              >
                {letter}
              </text>
            </g>
          );
        }),
      )}

      {/* The Next button */}
      <rect x={40} y={252} width={72} height={28} rx={7} fill="#ffffff" stroke={INK.line} />
      <text x={76} y={266} textAnchor="middle" dominantBaseline="central" fontSize={12} fill={INK.ink}>
        Next
      </text>

      <StepBox x={296} y={58} w={182} n={1} text="Check the letter shown" />
      <path d="M296 75 L212 76" {...arrow} />

      <StepBox x={296} y={118} w={182} n={2} text="Click every copy of it" />
      <path d="M296 135 L253 122" {...arrow} />

      <StepBox x={296} y={178} w={182} n={3} text="Leave the others alone" />
      <path d="M296 195 L253 190" {...arrow} />

      <StepBox x={296} y={246} w={182} n={4} text="Or press Next to move on" />
      <path d="M296 263 L120 266" {...arrow} />
    </svg>
  );
}

/* ---------- Small pieces ---------- */
function Example({ letter, caption, good }: { letter: ReactNode; caption: ReactNode; good: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ ...styles.cell, cursor: 'default', ...(good ? styles.cellClicked : {}) }}>
        <span style={styles.cellLetter}>{letter}</span>
      </div>
      <div style={{ fontSize: 12, color: '#8a8578', marginTop: 6 }}>{caption}</div>
    </div>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const styles: Record<string, CSSProperties> = {
  screen: {
    minHeight: VIEWPORT_HEIGHT,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f2ea',
    color: '#1a1a1a',
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: '20px 28px',
    flexWrap: 'wrap',
    gap: 12,
  },
  eyebrow: { fontSize: 14, color: '#8a8578' },
  h1: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 14,
    // Set here explicitly: without its own colour, an h1 rule in the app's
    // global stylesheet (colour, opacity or gradient text) can fade it.
    color: '#1a1a1a',
    WebkitTextFillColor: '#1a1a1a',
    opacity: 1,
  },
  body: { fontSize: 15, lineHeight: 1.6, color: '#4a463d', marginBottom: 14, maxWidth: '60ch' },
  instruction: {
    fontSize: 15,
    lineHeight: 1.5,
    color: '#4a463d',
    margin: 0,
    maxWidth: '52ch',
    textAlign: 'center',
  },
  previewSvg: {
    display: 'block',
    marginBottom: 8,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(14px, 4vw, 24px)',
    padding: 'clamp(12px, 4vw, 24px)',
  },
  cueBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: '#1a1a1a',
    color: '#f5f2ea',
    padding: '8px 12px 8px 20px',
    borderRadius: 999,
  },
  cueText: { fontSize: 'clamp(14px, 3.8vw, 16px)' },
  cueLetter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'clamp(36px, 10vw, 44px)',
    height: 'clamp(36px, 10vw, 44px)',
    borderRadius: '50%',
    background: '#c2820a',
    color: '#fff8ea',
    fontSize: 'clamp(20px, 5.5vw, 26px)',
    fontWeight: 800,
    lineHeight: 1,
    flexShrink: 0,
  },
  grid: { display: 'flex', flexDirection: 'column', gap: 'clamp(4px, 1.4vw, 10px)' },
  gridRow: { display: 'flex', gap: 'clamp(4px, 1.4vw, 10px)' },
  exampleRow: { display: 'flex', gap: 16, margin: '18px 0 22px' },
  cell: {
    // Eight of these plus gaps must fit the viewport width, so the size
    // is viewport-relative with a fixed ceiling for desktop.
    width: 'clamp(34px, 10.2vw, 60px)',
    height: 'clamp(34px, 10.2vw, 60px)',
    background: '#ffffff',
    color: '#1a1a1a',
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    WebkitAppearance: 'none',
    appearance: 'none',
    border: '1px solid #ddd7c7',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },
  cellClicked: { borderColor: '#c2820a', background: '#fbeed2', color: '#1a1a1a' },
  cellLetter: {
    fontSize: 'clamp(16px, 4.6vw, 26px)',
    fontWeight: 800,
    lineHeight: 1,
    color: '#1a1a1a',
    WebkitTextFillColor: '#1a1a1a',
  },
  nextButton: {
    padding: '12px 26px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background: '#ffffff',
    color: '#1a1a1a',
    border: '1px solid #ddd7c7',
    borderRadius: 10,
    cursor: 'pointer',
  },
  card: {
    maxWidth: 640,
    width: 'min(640px, calc(100% - 24px))',
    margin: 'auto',
    background: '#ffffff',
    border: '1px solid #ddd7c7',
    borderRadius: 16,
    padding: 'clamp(22px, 6vw, 32px) clamp(18px, 6vw, 40px)',
    boxSizing: 'border-box',
  },
  primaryButton: {
    width: '100%',
    padding: '16px 32px',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background: '#1a1a1a',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    marginTop: 12,
  },
  // Press feedback, layered on top of primaryButton for the final
  // Continue button only. The resting edge gives the button some height
  // so pressing it has something to sink into.
  pressable: {
    boxShadow: '0 4px 0 #000000',
    transition: 'transform 0.06s ease, box-shadow 0.06s ease, background 0.06s ease',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
  // Applied while the button is held down and after it has been clicked:
  // it sinks 3px, its edge shrinks, and the fill lightens slightly.
  pressablePressed: {
    transform: 'translateY(3px)',
    boxShadow: '0 1px 0 #000000',
    background: '#3a3a3a',
  },
};
