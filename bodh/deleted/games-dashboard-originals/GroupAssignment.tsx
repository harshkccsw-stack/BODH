import { useEffect, useRef, useState } from "react";
import ColorClash from "./ColorClash";
import MakeWorthClock from "./MakeworthClock";

// The full journey a player goes through, in order:
// select group -> preview task 1 -> group instructions -> countdown ->
// Color Clash -> preview task 2 -> group instructions (task 2) -> countdown ->
// Makeworth Clock -> done.
type View =
  | "select"
  | "instructions"
  | "preview"
  | "countdown"
  | "game1"
  | "preview2"
  | "instructionsBeforeGame2"
  | "game2"
  | "complete";

const COUNTDOWN_SECONDS = 3;
const GROUP_COUNT = 9;
// Groups that see the live timer and score during both games.
// Every other group plays with them hidden.
const GROUPS_WITH_HUD = new Set([3, 6, 9]);
// Groups that get a Pause button during both games.
const GROUPS_WITH_PAUSE = new Set([1, 2, 3]);

/* 100vh measures the viewport *behind* mobile browser chrome, which can
   push the fixed bottom bar off screen. dvh tracks the visible area. */
const VIEWPORT_HEIGHT =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("height: 100dvh")
    ? "100dvh"
    : "100vh";

/* ============================================================
   PER-GROUP INSTRUCTIONS
   ------------------------------------------------------------
   One entry per group. Each group has TWO instruction pages:

     paragraphs   — page 1: shown after the Color Clash
                    "How to play" screen, just before Color
                    Clash starts
     beforeGame2  — page 2: shown after the Makeworth Clock
                    "How to play" screen, just before Makeworth
                    Clock starts

   Each page is an array with one string per paragraph.
   `label` is the start of the heading ("Group 1"); `name` is the
   short name shown under "Group N" on the selection screen and
   under every instructions heading.

   Edit a group's text here and only that group changes.
   ============================================================ */
type GroupInstructions = {
  label: string;
  name: string;
  paragraphs: string[];
  beforeGame2: string[];
};

/* The words after "Group N — " in the heading of each page.
   Shared by every group; change them here. */
const PAGE_TITLES = {
  intro: "Instructions",
  beforeGame2: "Second Task",
};

const INSTRUCTIONS: Record<number, GroupInstructions> = {
  1: {
    label: "Group 1",
    name: "IND-INM",
    paragraphs: [
      "Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best! ",
      "You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish. ",
    ],
    beforeGame2: 
    ["Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best! ",
     "You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish."
    ],

  },
  2: {
    label: "Group 2",
    name: "IND-EXM",
    paragraphs: [
      "This task gives you opportunity to compete directly against other participants and become top scorer.",
      "You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish. "
    ],
    beforeGame2: 
    ["This task gives you opportunity to compete directly against other participants and become top scorer.",
     "You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish. "
    ],
  },
  3: {
    label: "Group 3",
    name: "IND-DIM ",
    paragraphs: [
      "In this task you will be able to track your progress and accuracy on screen as you work.",
      "You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish. "
    ],
    beforeGame2: [
      "In this task you will be able to track your progress and accuracy on screen as you work.",
      "You may start whenever you are ready and during the task when you will hit next button then only the next screen or step will appear. Feel free to take breaks when you wish. "
    ],
  },
  4: {
    label: "Group 4",
    name: "EXD-INM",
    paragraphs: [
      "Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best! ",
      "There might be some background noise and disruptions. You will have to work through it to finish the task. "
    ],
    beforeGame2: [
      "Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best! ",
      "There might be some background noise and disruptions. You will have to work through it to finish the task. "
    ],
  },
  5: {
    label: "Group 5",
    name: "EXD-EXM",
    paragraphs: [
      "This task gives you opportunity to compete directly against other participants and become top scorer.",
      "There might be some background noise and disruptions. You will have to work through it to finish the task."
    ],
    beforeGame2: [
      "This task gives you opportunity to compete directly against other participants and become top scorer.",
      "There might be some background noise and disruptions. You will have to work through it to finish the task."
    ],
  },
  6: {
    label: "Group 6",
    name: "EXD-DIM ",
    paragraphs: [
      "In this task you will be able to track your progress and accuracy on screen as you work.",
      "There might be some background noise and disruptions. You will have to work through it to finish the task."
    ],
    beforeGame2: [
      "In this task you will be able to track your progress and accuracy on screen as you work.",
      "There might be some background noise and disruptions. You will have to work through it to finish the task."
    ],
  },
  7: {
    label: "Group 7",
    name: "DID-INM",
    paragraphs: [
      "Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best! ",
      "While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well."
    ],
    beforeGame2: [
      "Your performance on the cancellation task was average. This task provides you opportunity to excel and make your performance above average. Do your best! ",
      "While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well."
    ],
  },
  8: {
    label: "Group 8",
    name: "DID-EXM",
    paragraphs: [
      "This task gives you opportunity to compete directly against other participants and become top scorer.",
      "While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well."
    ],
    beforeGame2: [
      "This task gives you opportunity to compete directly against other participants and become top scorer.",
      "While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well."
    ],
  },
  9: {
    label: "Group 9",
    name: "DID-DIM ",
    paragraphs: [
      "In this task you will be able to track your progress and accuracy on screen as you work.",
      "While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well."
    ],
    beforeGame2: [
      "In this task you will be able to track your progress and accuracy on screen as you work.",
      "While working on this task you will keep your phone with you (on the desk in front of you). Choose your favorite or go to digital platform and keep it open throughout the task. Feel free to check feeds and notifications during the task as well."
    ],
  },
};

/* Shown if a group somehow has no entry above, or one of its pages
   is an empty array — better a visible warning during a session
   than a silently blank card. */
const MISSING_TEXT = [
  "No instruction text has been set for this group. Please tell the researcher before continuing.",
];

const MISSING_INSTRUCTIONS: GroupInstructions = {
  label: "Instructions unavailable",
  name: "",
  paragraphs: MISSING_TEXT,
  beforeGame2: MISSING_TEXT,
};

/** Falls back to the warning text when a page has no paragraphs. */
const withFallback = (paragraphs: string[] | undefined) =>
  paragraphs && paragraphs.length > 0 ? paragraphs : MISSING_TEXT;

/* ============================================================
   CONFIRMATION TICK BOX + HIDDEN TIMING
   ------------------------------------------------------------
   Both group instruction pages show a tick box under the text.
   The Submit button stays disabled until the box is ticked, and
   Submit then starts that task's countdown.

   For each task, the time spent on the "How to play" screen and
   on the group instruction page is measured in the background
   and never shown to the player. A page's clock runs from the
   moment it appears until the player leaves it. If they return
   with Back, that visit is added to the total. When the player
   presses Submit, that task's totals are sent to `onPageTime`.
   ============================================================ */
const CONFIRM_TEXT = "I have read and understood the instructions.";

type TaskKey = "task1" | "task2";
type TimedPage = "preview" | "instructions";

const TASK_NAMES: Record<TaskKey, string> = {
  task1: "STROOP Clash",
  task2: "Makeworth Clock",
};

/* Which screens are timed, and which task and page each belongs to. */
const TIMED_VIEWS: Partial<Record<View, { task: TaskKey; page: TimedPage }>> = {
  preview: { task: "task1", page: "preview" },
  instructions: { task: "task1", page: "instructions" },
  preview2: { task: "task2", page: "preview" },
  instructionsBeforeGame2: { task: "task2", page: "instructions" },
};

/** What `onPageTime` receives, once per task. */
export type PageTimeRecord = {
  group: number;
  groupName: string;
  task: string; // "Color Clash" or "Makeworth Clock"
  previewMs: number; // total time on the task's "How to play" screen
  previewVisits: number; // 1 unless the player came back to it with Back
  instructionsMs: number; // total time on the task's group instruction page
  instructionsVisits: number;
  recordedAt: string; // ISO date-time when the player pressed Submit
};

type PageClock = { ms: number; visits: number };
type PageTimes = Record<TaskKey, Record<TimedPage, PageClock>>;
type ActiveClock = { task: TaskKey; page: TimedPage; startedAt: number };

const emptyPageTimes = (): PageTimes => ({
  task1: { preview: { ms: 0, visits: 0 }, instructions: { ms: 0, visits: 0 } },
  task2: { preview: { ms: 0, visits: 0 }, instructions: { ms: 0, visits: 0 } },
});

/** Stops the page clock that is running (if any) and adds that visit to
    its total. performance.now() is used because, unlike Date.now(), it
    can't jump if the device clock changes mid-session. */
function stopClock(active: { current: ActiveClock | null }, times: { current: PageTimes }) {
  const running = active.current;
  if (!running) return;
  const clock = times.current[running.task][running.page];
  clock.ms += performance.now() - running.startedAt;
  clock.visits += 1;
  active.current = null;
}

export default function GroupAssignment({
  onStartTask,
  onPageTime,
}: {
  onStartTask?: (group: number) => void;
  /** Receives the hidden page times for a task when its Submit is pressed. */
  onPageTime?: (record: PageTimeRecord) => void;
}) {
  const [view, setView] = useState<View>("select");
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  // true only for groups 3, 6 and 9 — passed into both games.
  const showHud = selectedGroup !== null && GROUPS_WITH_HUD.has(selectedGroup);
  // true only for groups 1, 2 and 3 — passed into both games.
  const allowPause = selectedGroup !== null && GROUPS_WITH_PAUSE.has(selectedGroup);
  // The picked group's text for both instruction pages.
  const content =
    (selectedGroup !== null && INSTRUCTIONS[selectedGroup]) || MISSING_INSTRUCTIONS;

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Which game the countdown hands off to. A ref, not state, so the
  // interval below always reads the current value without the effect
  // having to re-run and restart the count.
  const countdownTargetRef = useRef<View>("game1");

  // Whether the confirmation box is ticked on each group instruction page.
  const [ticked, setTicked] = useState<Record<TaskKey, boolean>>({
    task1: false,
    task2: false,
  });
  // Hidden page timing: running totals, plus the clock for the page on screen now.
  const pageTimesRef = useRef<PageTimes>(emptyPageTimes());
  const activeClockRef = useRef<ActiveClock | null>(null);

  const handlePick = (groupNumber: number) => {
    setSelectedGroup(groupNumber);
    setTicked({ task1: false, task2: false });
    pageTimesRef.current = emptyPageTimes();
    setView("preview");
  };

  const handleCancel = () => {
    setSelectedGroup(null);
    setView("select");
  };

  /** Runs the shared 3-2-1 screen, then moves on to `target`. */
  const startCountdown = (target: View) => {
    countdownTargetRef.current = target;
    setCountdown(COUNTDOWN_SECONDS);
    setView("countdown");
  };

  /** Sends one task's final page times to the parent app. */
  const reportPageTime = (task: TaskKey) => {
    if (selectedGroup === null) return;
    // Close the visit to the page on screen now, so it's in the totals.
    stopClock(activeClockRef, pageTimesRef);
    const t = pageTimesRef.current[task];
    const record: PageTimeRecord = {
      group: selectedGroup,
      groupName: (INSTRUCTIONS[selectedGroup]?.name ?? "").trim(),
      task: TASK_NAMES[task],
      previewMs: Math.round(t.preview.ms),
      previewVisits: t.preview.visits,
      instructionsMs: Math.round(t.instructions.ms),
      instructionsVisits: t.instructions.visits,
      recordedAt: new Date().toISOString(),
    };
    if (onPageTime) onPageTime(record);
    // Visible only in the browser's developer console, never on screen.
    // Delete this line if you don't want it.
    console.info("[page time]", record);
  };

  /** Submit on group instruction page 1: record the times, start Color Clash. */
  const handleSubmitFirst = () => {
    if (selectedGroup === null || !ticked.task1) return;
    reportPageTime("task1");
    if (onStartTask) onStartTask(selectedGroup); // optional hook for the parent app
    startCountdown("game1");
  };

  /** Submit on group instruction page 2: record the times, start Makeworth Clock. */
  const handleSubmitSecond = () => {
    if (!ticked.task2) return;
    reportPageTime("task2");
    startCountdown("game2");
  };

  /* ---------- Run the 3-second countdown whenever we enter that view ----------
     The transition happens in the interval body, not inside the state updater.
     Updaters must stay pure: React invokes them twice in StrictMode, which
     would otherwise fire setView twice and clear the interval mid-update. */
  useEffect(() => {
    if (view !== "countdown") return;

    const deadline = Date.now() + COUNTDOWN_SECONDS * 1000;

    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setCountdown(remaining);

      if (remaining === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        setView(countdownTargetRef.current); // countdown finished -> launch the queued game
      }
    }, 200); // sub-second tick so the number lands on time

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = null;
    };
  }, [view]);

  /* Hidden page timer. Starts a clock when a timed screen appears; the
     cleanup stops it when the player leaves that screen by any button. */
  useEffect(() => {
    const timed = TIMED_VIEWS[view];
    if (!timed) return;
    activeClockRef.current = { ...timed, startedAt: performance.now() };
    return () => stopClock(activeClockRef, pageTimesRef);
  }, [view]);

  /* Every screen opens at the top, so a long instruction page doesn't
     start halfway down because the previous page was scrolled. */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  /* ---------- Screen 1: pick one of 9 groups ---------- */
  if (view === "select") {
    return (
      <div style={styles.screen}>
        <h1 style={styles.title}>Select a Group</h1>
        <div style={styles.grid}>
          {Array.from({ length: GROUP_COUNT }, (_, i) => i + 1).map((num) => (
            <button key={num} style={styles.groupButton} onClick={() => handlePick(num)}>
              <span style={styles.groupNumber}>Group {num}</span>
              {INSTRUCTIONS[num]?.name && (
                <span style={styles.groupName}>{INSTRUCTIONS[num].name}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ---------- Screen 2: annotated still of the first task ---------- */
  if (view === "preview") {
    return (
      <div style={styles.screen}>
        <div style={styles.previewCard}>
          <h1 style={styles.previewTitle}>How to play</h1>
          <ColorClashPreview />
        </div>

        <div style={styles.bottomBar}>
          <button style={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
          <button style={styles.startButton} onClick={() => setView("instructions")}>
            Next
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Screen 3: instructions page 1 — tick the box, then Submit ---------- */
  if (view === "instructions") {
    return (
      <InstructionScreen
        heading={`${content.label} — ${PAGE_TITLES.intro}`}
        name={content.name}
        paragraphs={withFallback(content.paragraphs)}
        confirm={{
          ticked: ticked.task1,
          onChange: (value) => setTicked((t) => ({ ...t, task1: value })),
        }}
        back={{ label: "Back", onClick: () => setView("preview") }}
        next={{ label: "NEXT", onClick: handleSubmitFirst }}
      />
    );
  }

  /* ---------- Screen 4: the 3-2-1 countdown, shared by both games ---------- */
  if (view === "countdown") {
    return (
      <div style={styles.screen}>
        <div style={styles.countdownText}>Game starts in</div>
        <div style={{ margin: 10 }}></div>
        <div style={styles.countdownNumber}>{countdown}</div>
      </div>
    );
  }

  /* ---------- Screen 5: Color Clash — when it finishes, preview game 2 ---------- */
  if (view === "game1") {
    return (
      <ColorClash
        showHud={showHud}
        allowPause={allowPause}
        onProceed={() => setView("preview2")}
      />
    );
  }

  /* ---------- Screen 6: annotated still of the second task ----------
     No Back button: the first game is over and can't be returned to. */
  if (view === "preview2") {
    return (
      <div style={styles.screen}>
        <div style={styles.previewCard}>
          <h1 style={styles.previewTitle}>How to play</h1>
          <MakeworthClockPreview />
        </div>

        <div style={styles.bottomBar}>
          <span />
          <button style={styles.startButton} onClick={() => setView("instructionsBeforeGame2")}>
            Next
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Screen 7: instructions page 2 — tick the box, then Submit ---------- */
  if (view === "instructionsBeforeGame2") {
    return (
      <InstructionScreen
        heading={`${content.label} — ${PAGE_TITLES.beforeGame2}`}
        name={content.name}
        paragraphs={withFallback(content.beforeGame2)}
        confirm={{
          ticked: ticked.task2,
          onChange: (value) => setTicked((t) => ({ ...t, task2: value })),
        }}
        back={{ label: "Back", onClick: () => setView("preview2") }}
        next={{ label: "Submit", onClick: handleSubmitSecond }}
      />
    );
  }

  /* ---------- Screen 8: Makeworth Clock — when it finishes, we're done ---------- */
  if (view === "game2") {
    return (
      <MakeWorthClock
        showHud={showHud}
        allowPause={allowPause}
        onProceed={() => setView("complete")}
      />
    );
  }

  /* ---------- Screen 9: both tasks finished ---------- */
  return (
    <div style={styles.screen}>
      <h1 style={styles.title}>All tasks complete</h1>
      <p style={styles.instructionsText}>
        Thanks — Group {selectedGroup} has finished both tasks.
      </p>
      <button
        style={{ ...styles.startButton, marginTop: 24 }}
        onClick={() => {
          setSelectedGroup(null);
          setView("select");
        }}
      >
        Back to Group Selection
      </button>
    </div>
  );
}

/* ============================================================
   INSTRUCTION SCREEN
   ------------------------------------------------------------
   Shared layout for both instruction pages: a white card with
   the heading, the group's short name and its paragraphs, plus
   the fixed bottom bar. Leave out `back` to show only the
   forward button (it stays on the right).

   Pass `confirm` to add the tick box under the text. The forward
   button is then disabled until the box is ticked.
   ============================================================ */
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
  confirm?: { ticked: boolean; onChange: (value: boolean) => void };
  back?: BarButton;
  next: BarButton;
}) {
  const locked = confirm !== undefined && !confirm.ticked;

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

        {confirm && (
          <label style={styles.tickRow}>
            <input
              type="checkbox"
              checked={confirm.ticked}
              onChange={(e) => confirm.onChange(e.target.checked)}
              style={styles.tickBox}
            />
            <span>{CONFIRM_TEXT}</span>
          </label>
        )}
      </div>

      <div style={styles.bottomBar}>
        {back ? (
          <button style={styles.cancelButton} onClick={back.onClick}>
            {back.label}
          </button>
        ) : (
          <span />
        )}
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
   SHARED PIECES FOR THE TWO ANNOTATED MOCKS
   ------------------------------------------------------------
   Both previews are drawn as one SVG: a miniature of the real
   game screen, with numbered step boxes and arrows pointing at
   the part of the screen each step refers to. Nothing here is
   live — no state, no handlers, no timers.
   ============================================================ */
const INK = {
  paper: "#f5f2ea",
  line: "#ddd7c7",
  ink: "#1a1a1a",
  muted: "#8a8578",
  gold: "#c2820a",
  goldDeep: "#8f5f07",
};

/** A numbered callout: gold disc with the step number, then short text. */
function StepBox({
  x,
  y,
  w,
  n,
  text,
}: {
  x: number;
  y: number;
  w: number;
  n: number;
  text: string;
}) {
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
    <marker
      id="prevArrow"
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
);

const arrowProps = {
  stroke: INK.gold,
  strokeWidth: 1.6,
  fill: "none",
  markerEnd: "url(#prevArrow)",
};

/* ============================================================
   MOCK 1 — COLOR CLASH
   The word reads BLUE but is printed in green ink, so the
   correct answer is the GREEN button. Steps point that out.
   ============================================================ */
const CLASH_OPTIONS = [
  { name: "RED", css: "#ef4444" },
  { name: "BLUE", css: "#3b82f6" },
  { name: "GREEN", css: "#22c55e" },
  { name: "PURPLE", css: "#a855f7" },
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
              stroke={opt.name === "GREEN" ? INK.ink : "transparent"}
              strokeWidth={opt.name === "GREEN" ? 2.5 : 0}
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
      <path d={`M252 81 L200 100`} {...arrowProps} />

      <StepBox x={252} y={116} w={216} n={2} text="Look at the ink colour" />
      <path d={`M252 135 L200 122`} {...arrowProps} />

      <StepBox x={140} y={252} w={220} n={3} text="Click that colour" />
      <path d={`M310 252 L310 246`} {...arrowProps} />
    </svg>
  );
}

/* ============================================================
   MOCK 2 — MAKEWORTH CLOCK
   Dashed hand = where the pointer was, solid hand = where it
   moved to. The gap between them is the two-mark skip.
   ============================================================ */
function MakeworthClockPreview() {
  const cx = 128;
  const cy = 150;
  const r = 74;
  const ticks = 60;
  const degPerTick = 360 / ticks;

  const marks = [];
  for (let i = 0; i < ticks; i++) {
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
        stroke={isSkipMark ? INK.gold : "#c9c2ae"}
        strokeWidth={isSkipMark ? 3 : isMajor ? 2 : 1.2}
      />
    );
  }

  const hand = (step: number, faint: boolean) => (
    <line
      x1={cx}
      y1={cy}
      x2={cx}
      y2={cy - (r - 20)}
      stroke={faint ? "#cfc7b4" : INK.gold}
      strokeWidth={faint ? 3 : 4}
      strokeLinecap="round"
      strokeDasharray={faint ? "4 4" : undefined}
      transform={`rotate(${step * degPerTick} ${cx} ${cy})`}
    />
  );

  return (
    <svg
      width="100%"
      viewBox="0 0 500 322"
      style={styles.previewSvg}
      role="img"
      aria-label="Preview of the Makeworth Clock screen with three numbered steps"
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
      <path d={`M252 81 L206 110`} {...arrowProps} />

      <StepBox x={252} y={140} w={216} n={2} text="Sometimes it skips a mark" />
      <path d={`M252 159 L172 118`} {...arrowProps} />

      <StepBox x={252} y={218} w={216} n={3} text="Press the button when it does" />
      <path d={`M252 237 L194 262`} {...arrowProps} />

      <text x={128} y={110} textAnchor="middle" fontSize={11} fill={INK.muted}>
        was
      </text>
    </svg>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  screen: {
    position: "relative",
    minHeight: VIEWPORT_HEIGHT,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f2ea",
    color: "#1a1a1a",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    // Room for the fixed bottom bar, so a long instruction card can
    // scroll without the buttons sitting on top of the text.
    padding: "24px 16px 104px",
    boxSizing: "border-box",
  },
  title: {
    fontSize: 24,
    letterSpacing: 1,
    marginBottom: 28,
    textAlign: "center",
    // Set here explicitly: without its own colour, an h1 rule in the app's
    // global stylesheet (colour, opacity or gradient text) can fade it.
    color: "#1a1a1a",
    WebkitTextFillColor: "#1a1a1a",
    opacity: 1,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    width: "100%",
    maxWidth: 480,
  },
  groupButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "18px 4px",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 1,
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 10,
    cursor: "pointer",
    color: "#1a1a1a",
  },
  groupNumber: {
    display: "block",
  },
  // The short name shown under "Group N" on each selection button.
  groupName: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    color: "#8a8578",
  },
  // The same name, shown under the heading on every instructions page.
  instructionsName: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: 1,
    color: "#8a8578",
    textAlign: "center",
    margin: "0 0 24px",
  },
  instructionsCard: {
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 16,
    padding: "36px 40px",
    maxWidth: 560,
    width: "100%",
  },
  instructionsText: {
    fontSize: 15,
    lineHeight: 1.6,
    color: "#4a463d",
    marginBottom: 14,
  },
  previewCard: {
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 16,
    padding: "24px 28px 26px",
    maxWidth: 580,
    width: "100%",
  },
  previewTitle: {
    fontSize: 20,
    letterSpacing: 1,
    margin: "0 0 16px",
    textAlign: "center",
    // Set here explicitly: without its own colour, an h1 rule in the app's
    // global stylesheet (colour, opacity or gradient text) can fade it.
    color: "#1a1a1a",
    WebkitTextFillColor: "#1a1a1a",
    opacity: 1,
  },
  previewSvg: {
    display: "block",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
  },
  // The "I have read and understood" row under the text on each instruction page.
  // The whole row is the click target, not just the small box.
  tickRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    padding: "14px 16px",
    background: "#faf8f2",
    border: "1px solid #ddd7c7",
    borderRadius: 10,
    fontSize: 15,
    lineHeight: 1.4,
    color: "#1a1a1a",
    cursor: "pointer",
    userSelect: "none",
  },
  tickBox: {
    width: 22,
    height: 22,
    flexShrink: 0,
    margin: 0,
    accentColor: "#c2820a",
    cursor: "pointer",
  },
  // Applied on top of startButton while Submit is locked.
  buttonDisabled: {
    background: "#ddd7c7",
    color: "#8a8578",
    cursor: "not-allowed",
  },
  bottomBar: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    padding: "16px clamp(12px, 4vw, 24px)",
    // Clears the iOS home indicator.
    paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
    background: "#f5f2ea",
    borderTop: "1px solid #e6e0d0",
    boxSizing: "border-box",
  },
  cancelButton: {
    padding: "14px clamp(16px, 5vw, 28px)",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "'Segoe UI', Roboto, Arial, sans-serif",
    background: "#ffffff",
    border: "1px solid #ddd7c7",
    borderRadius: 10,
    cursor: "pointer",
    color: "#4a463d",
    touchAction: "manipulation",
  } as React.CSSProperties,
  startButton: {
    padding: "14px clamp(16px, 5vw, 28px)",
    fontSize: 14,
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
  countdownText: {
    fontSize: 18,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#8a8578",
    marginBottom: 12,
  },
  countdownNumber: {
    fontSize: 120,
    fontWeight: 800,
    color: "#c2820a",
  },
};