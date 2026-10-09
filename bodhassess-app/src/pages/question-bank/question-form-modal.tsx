import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Flag,
  Gamepad2,
  Image as ImageIcon,
  Link2,
  Loader2,
  PenLine,
  Plus,
  Shuffle,
  Target,
  Type,
  Video,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  questionApis,
  QUESTION_TYPES,
  GROUP_MEMBER_TYPES,
  ANSWER_FORMATS,
  MAX_WHOLE_NUMBER,
  numberRangeLabel,
  DEFAULT_SCALE_FROM,
  DEFAULT_SCALE_TO,
  MAX_SCALE_POINTS,
  type AnswerFormat,
  type MqtScorePayload,
  type MqtScoreView,
  type QuestionContentType,
  type QuestionPayload,
  type QuestionResponse,
  type QuestionType,
  type SelectionRule,
} from './questionApis';
import { qualitiesApi, type MQ, type MQT, type MeasuredQualityResponse, type MqtNodeResponse } from '../MeasuredQuality/qualitiesApi';
import { gamesApi, isPlayableCode, type GameResponse } from './gamesApi';

// The ONE create/edit form for bank questions. The Questions page renders it
// as a modal; the questionnaire wizard's Step 2 renders the same fields
// (QuestionFormFields) inline on the page, so authoring a question is
// identical everywhere.

// IMAGE/VIDEO need a file upload, and there is no object storage yet (MySQL
// is no place for videos, and base64 images are not worth it either) — both
// stay disabled until object storage lands. URL covers externally hosted
// media meanwhile.
//
// FREE_TEXT is the "Other…" row — an option the respondent picks and then
// types into. OPTIONS ONLY (optionsOnly): the stem toggle skips it, the
// backend refuses it there, and an MCQ may carry at most one.
export const CONTENT_TYPES: Array<{
  value: QuestionContentType;
  label: string;
  icon: typeof Type;
  disabled?: boolean;
  optionsOnly?: boolean;
}> = [
  { value: 'TEXT', label: 'Text', icon: Type },
  { value: 'IMAGE', label: 'Image', icon: ImageIcon, disabled: true },
  { value: 'VIDEO', label: 'Video', icon: Video, disabled: true },
  { value: 'URL', label: 'URL', icon: Link2 },
  { value: 'FREE_TEXT', label: 'Short answer', icon: PenLine, optionsOnly: true },
];

/** The option types a question of this shape may use — a grid's columns are a shared scale, never a text box. */
export const optionContentTypesFor = (questionType: QuestionType) =>
  CONTENT_TYPES.filter((t) => !t.optionsOnly || questionType === 'MCQ');

export const contentMeta = (t: QuestionContentType) => CONTENT_TYPES.find((c) => c.value === t) ?? CONTENT_TYPES[0];

// ── MQT choices — the flattened tree, labels showing the full path ─────────
export interface MqtChoice {
  id: number;
  label: string;
  name: string; // bare node name — what the XLSX scores column matches on
}

export function flattenMqts(mqs: MQ[]): MqtChoice[] {
  const out: MqtChoice[] = [];
  const walk = (nodes: MQT[] | undefined, prefix: string) => {
    for (const n of nodes || []) {
      out.push({ id: Number(n.id), label: `${prefix} › ${n.name}`, name: n.name });
      walk(n.children, `${prefix} › ${n.name}`);
    }
  };
  for (const mq of mqs) walk(mq.mqts, mq.name);
  return out;
}

/** getQualities() wire response → the flattened picker choices. */
export function choicesFromQualities(data: MeasuredQualityResponse[]): MqtChoice[] {
  return flattenMqts(
    data.map((m) => ({
      id: String(m.measuredQualityId),
      name: m.name,
      description: m.description || '',
      mqts: (m.mqts || []).map(function toMqt(n): MQT {
        return { id: String(n.measuredQualityTypeId), name: n.name, children: n.children?.map(toMqt) };
      }),
    })),
  );
}

// ── Score rows (shared by the question and each option) ────────────────────
export interface ScoreRow {
  mqtId: string; // '' until picked
  score: string; // input value; parsed on submit
}

/**
 * Scores are decimal — an option may half-count (0.5) or move in quarter
 * steps. Rounded to the 2 decimals the backend stores, so what the sheet and
 * the report show is what was typed here.
 */
const round2 = (n: number): number => Math.round(n * 100) / 100;

export const viewsToRows = (views: MqtScoreView[]): ScoreRow[] =>
  views.map((v) => ({ mqtId: String(v.measuredQualityTypeId), score: String(v.score) }));

export const rowsToPayload = (rows: ScoreRow[]): MqtScorePayload[] => {
  const seen = new Map<number, number>();
  for (const r of rows) {
    if (!r.mqtId) continue;
    seen.set(Number(r.mqtId), round2(Number(r.score) || 0));
  }
  return Array.from(seen.entries()).map(([measuredQualityTypeId, score]) => ({ measuredQualityTypeId, score }));
};

/**
 * Compact per-scope score editor: pick an MQT, give it a score. Shows what
 * is mapped and what is still left so authoring gaps are visible.
 */
export function ScoreEditor({
  title,
  rows,
  choices,
  onChange,
  onCreateChoice,
  hideScore = false,
}: {
  title: string;
  rows: ScoreRow[];
  choices: MqtChoice[];
  onChange: (rows: ScoreRow[]) => void;
  /**
   * Somewhere to put a measured quality type that does not exist yet.
   *
   * <p>Authoring a question is exactly when the gap is noticed, and leaving
   * the form to add one node on the Qualities page loses whatever has been
   * typed. Given a handler, the editor offers to create it here and hands
   * the new node back so the page's picker knows it too. Without one the
   * button is not shown — a preview has no business writing to the taxonomy.
   */
  onCreateChoice?: (choice: MqtChoice) => void;
  /**
   * Drops the number input, leaving a pure MQT nomination. Used by the linear
   * scale, where the point the respondent picks is the score and a number
   * here would be a second, contradictory answer to "how much".
   */
  hideScore?: boolean;
}) {
  const mapped = new Set(rows.filter((r) => r.mqtId).map((r) => r.mqtId));
  const remaining = choices.filter((c) => !mapped.has(String(c.id)));

  /*
   * The inline creator. `under` is where the new type hangs: an existing
   * measured quality, an existing type (making it a child), or a quality
   * created in the same breath. The qualities are fetched when the panel
   * opens rather than passed in — choices carry paths, not the ids of the
   * qualities at the top of them.
   */
  const [creating, setCreating] = useState(false);
  const [parents, setParents] = useState<MeasuredQualityResponse[]>([]);
  const [under, setUnder] = useState('');
  const [newName, setNewName] = useState('');
  const [newQualityName, setNewQualityName] = useState('');
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  /** Which score row the creator was opened from — where the new node lands. */
  const [rowForNew, setRowForNew] = useState(0);

  const openCreator = async () => {
    setCreating(true);
    setCreateError('');
    setNewName('');
    setNewQualityName('');
    try {
      const res = await qualitiesApi.getQualities();
      setParents(res.data);
      setUnder(res.data.length > 0 ? `mq:${res.data[0].measuredQualityId}` : 'new-mq');
    } catch (e: any) {
      setParents([]);
      setUnder('new-mq');
      setCreateError(e?.response?.data?.message || e?.message || 'Could not load the taxonomy');
    }
  };

  /** The label a new node will carry — the parent's path, then its own name. */
  const parentLabel = (): string => {
    if (under === 'new-mq') return newQualityName.trim();
    if (under.startsWith('mq:')) {
      const mq = parents.find((m) => String(m.measuredQualityId) === under.slice(3));
      return mq?.name ?? '';
    }
    const hit = choices.find((c) => String(c.id) === under.slice(4));
    return hit?.label ?? '';
  };

  const createNode = async (rowIndex: number) => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setCreateError('');
    // Declared OUTSIDE the try: the catch below reads all three to say which
    // of the two calls landed, and a `let` inside the try is out of scope there.
    let measuredQualityId: number | undefined;
    let parentTypeId: number | undefined;
    // Two calls, no transaction across them: if the quality lands and the
    // type does not, say which, so nobody hunts for a quality they think
    // failed to appear.
    let qualityMade = '';
    try {
      if (under === 'new-mq') {
        const quality = newQualityName.trim();
        if (!quality) { setCreateError('Name the measured quality too'); return; }
        // The backend does not refuse a duplicate MQ name, and two MQs called
        // the same thing split one trait's scores across two trees. Point at
        // the existing one instead.
        const clash = parents.find((m) => m.name.trim().toLowerCase() === quality.toLowerCase());
        if (clash) {
          setUnder(`mq:${clash.measuredQualityId}`);
          setCreateError(`"${clash.name}" already exists — it is now selected under "Under".`);
          return;
        }
        const made = await qualitiesApi.createQuality({ name: quality, description: '' });
        measuredQualityId = made.data.measuredQualityId;
        qualityMade = quality;
      } else if (under.startsWith('mq:')) {
        measuredQualityId = Number(under.slice(3));
      } else {
        parentTypeId = Number(under.slice(4));
      }
      // Same name twice among SIBLINGS is refused (the backend says so too,
      // with a 409); the same name under a different MQ or parent is fine.
      if (under !== 'new-mq') {
        const findNode = (nodes: MqtNodeResponse[], id: number): MqtNodeResponse | null => {
          for (const n of nodes) {
            if (n.measuredQualityTypeId === id) return n;
            const hit = findNode(n.children || [], id);
            if (hit) return hit;
          }
          return null;
        };
        const siblings = measuredQualityId != null
          ? parents.find((m) => m.measuredQualityId === measuredQualityId)?.mqts ?? []
          : parents.map((m) => findNode(m.mqts, parentTypeId!)).find(Boolean)?.children ?? [];
        if (siblings.some((n) => n.name.trim().toLowerCase() === name.toLowerCase())) {
          setCreateError(`"${parentLabel()}" already has a type named "${name}" — pick it from the list instead.`);
          return;
        }
      }
      const label = `${parentLabel()} › ${name}`;
      const made = await qualitiesApi.createQualityType({ name, measuredQualityId, parentTypeId });
      const choice: MqtChoice = { id: Number(made.data.measuredQualityTypeId), name, label };
      onCreateChoice?.(choice);
      // Straight into the row that asked for it — the reason for creating it.
      onChange(rows.map((r, j) => (j === rowIndex ? { ...r, mqtId: String(choice.id) } : r)));
      setCreating(false);
    } catch (e: any) {
      const said = e?.response?.data?.message || e?.message || 'Could not create it';
      setCreateError(qualityMade
        ? `${said} — "${qualityMade}" was created, the type was not. Pick it under "Under" and try the name again.`
        : said);
      // The quality exists now, so the next attempt must hang off it rather
      // than making a second one of the same name.
      if (qualityMade && measuredQualityId != null) {
        setUnder(`mq:${measuredQualityId}`);
        setParents((prev) => (prev.some((m) => m.measuredQualityId === measuredQualityId)
          ? prev
          : [...prev, { measuredQualityId, name: qualityMade, description: '', mqts: [] } as MeasuredQualityResponse]));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium inline-flex items-center gap-1">
          <Target className="h-3 w-3 text-primary" />
          {title}
          <span className="text-muted-foreground font-normal">
            — {mapped.size} of {choices.length} MQT{choices.length !== 1 ? 's' : ''} mapped
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          {/* Shown on every scope (question, option, grid row), and whether or
              not rows exist yet — it used to vanish once one mapping existed,
              which is why options appeared to have no way to create one. */}
          {onCreateChoice && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { onChange([...rows, { mqtId: '', score: '1' }]); setRowForNew(rows.length); openCreator(); }}
            >
              <Plus className="h-3 w-3" /> New MQT
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onChange([...rows, { mqtId: '', score: '1' }])}>
            <Plus className="h-3 w-3" /> Map MQT
          </Button>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={row.mqtId}
                onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, mqtId: e.target.value } : r)))}
                className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-primary"
              >
                <option value="">— pick an MQT —</option>
                {choices.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.label}{mapped.has(String(c.id)) && String(c.id) !== row.mqtId ? ' (mapped)' : ''}
                  </option>
                ))}
              </select>
              {!hideScore && (
                <input
                  type="number"
                  // Quarter steps on the arrows — the weights authors reach for
                  // most. Typing is not restricted to the grid: 0.1 is a
                  // legitimate weight and is kept, rounded to 2 decimals on
                  // submit like every other value.
                  step="0.25"
                  value={row.score}
                  onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, score: e.target.value } : r)))}
                  title="Score — decimals allowed (0.25, 0.5, 0.75); arrows step by 0.25"
                  className="w-20 h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-primary"
                />
              )}
              {onCreateChoice && (
                <button
                  type="button"
                  onClick={() => { setRowForNew(i); openCreator(); }}
                  className="rounded-md border border-border px-1.5 py-1 text-[0.6875rem] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  title="Create a measured quality type and map this row to it"
                >
                  + New
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-red-500 p-1"
                title="Remove mapping"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[0.6875rem] font-medium">
            New measured quality type
            <span className="ml-1 font-normal text-muted-foreground">
              — added to the taxonomy as soon as you create it, for every question to use
            </span>
          </p>
          {createError && (
            <p className="text-[0.6875rem] text-red-600 dark:text-red-400">{createError}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="text-[0.6875rem] text-muted-foreground">Under</label>
            <select
              value={under}
              onChange={(e) => setUnder(e.target.value)}
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
            >
              <optgroup label="New">
                <option value="new-mq">+ a new measured quality…</option>
              </optgroup>
              <optgroup label="Measured quality">
                {parents.map((mq) => (
                  <option key={mq.measuredQualityId} value={`mq:${mq.measuredQualityId}`}>{mq.name}</option>
                ))}
              </optgroup>
              {choices.length > 0 && (
                <optgroup label="Inside an existing type">
                  {choices.map((c) => (
                    <option key={c.id} value={`mqt:${c.id}`}>{c.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              onClick={() => setUnder(under === 'new-mq'
                ? (parents.length > 0 ? `mq:${parents[0].measuredQualityId}` : 'new-mq')
                : 'new-mq')}
              className="h-8 shrink-0 rounded-md border border-border bg-background px-2 text-[0.6875rem] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
              title={under === 'new-mq' ? 'Hang the new type under an existing quality instead' : 'Create a new measured quality for this type'}
            >
              {under === 'new-mq' ? 'Use existing MQ' : '+ New MQ'}
            </button>
          </div>
          {under === 'new-mq' && (
            <input
              value={newQualityName}
              onChange={(e) => setNewQualityName(e.target.value)}
              placeholder="New measured quality name"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
            />
          )}
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createNode(rowForNew); }}
            placeholder="New type name — e.g. Self-Efficacy"
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus:border-primary focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[0.6875rem] text-muted-foreground">
              {newName.trim() ? `${parentLabel()} › ${newName.trim()}` : 'Pick where it belongs and name it.'}
            </p>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => createNode(rowForNew)} disabled={busy || !newName.trim()}>
                {busy ? 'Creating…' : 'Create & map'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {remaining.length > 0 && (
        <p className="text-[0.6875rem] text-muted-foreground truncate" title={remaining.map((r) => r.label).join(', ')}>
          Left: {remaining.slice(0, 3).map((r) => r.label).join(', ')}{remaining.length > 3 ? ` +${remaining.length - 3} more` : ''}
        </p>
      )}
    </div>
  );
}

// ── Form model ─────────────────────────────────────────────────────────────

export interface OptionForm {
  optionText: string;
  /**
   * Optional help text under this option's label in the portal. Kept even
   * while `showDescription` is off, so unticking the box and reticking it
   * gives back what was typed — only the PAYLOAD drops it.
   */
  description: string;
  /** Whether the description box is revealed. Not sent; it gates the field. */
  showDescription: boolean;
  contentType: QuestionContentType;
  mediaUrl: string;
  mqtScores: ScoreRow[];
}

export const emptyOption = (): OptionForm => ({
  optionText: '',
  description: '',
  showDescription: false,
  contentType: 'TEXT',
  mediaUrl: '',
  mqtScores: [],
});

/**
 * One row of a LIKERT_GRID. `mqts` is ScoreRow so the row editor IS the
 * ScoreEditor an option uses, number and all: a row scores the MQTs it
 * names, earned when the row is answered whatever column is picked.
 */
export interface RowForm {
  rowText: string;
  mqts: ScoreRow[];
}

export const emptyRow = (): RowForm => ({ rowText: '', mqts: [] });

export interface QuestionForm {
  id: number | null;
  contentType: QuestionContentType;
  questionType: QuestionType;
  stem: string;
  /**
   * Optional help text under the stem in the portal. Kept even while
   * `showDescription` is off so the text survives a toggle; only the payload
   * drops it.
   */
  description: string;
  /** Whether the description box is revealed. Not sent; it gates the field. */
  showDescription: boolean;
  mediaUrl: string;
  riskFlag: boolean;
  /** '' = single choice. The count is a string so the input can be emptied. */
  selectionRule: SelectionRule | '';
  selectionCount: string;
  /**
   * MCQ only — randomise the order the options are DELIVERED in. Never sent
   * for a scale or a grid (both are ordered, and the backend 400s on it).
   */
  shuffleOptions: boolean;
  /**
   * LINEAR_SCALE only — the range, as strings so the inputs can be emptied
   * while typing. Blank on both ends means 1—5.
   */
  scaleFrom: string;
  scaleTo: string;
  /** LINEAR_SCALE only — captions under the first and last point. */
  scaleLowLabel: string;
  scaleHighLabel: string;
  /** MCQ options — and, on a LIKERT_GRID, its shared columns. */
  options: OptionForm[];
  /** LIKERT_GRID only — the statements. */
  rows: RowForm[];
  mqtScores: ScoreRow[];
  /**
   * GAMES only — the catalog game the question launches. The backend
   * generates the one option from it, so a game question authors no options.
   * Kept across a type switch, like the option rows.
   */
  gameId: number | null;
  /**
   * SHORT_ANSWER only — what the typed answer must be. Kept across a type
   * switch like gameId; only sent on a short answer.
   */
  answerFormat: AnswerFormat;
  /**
   * Number answers only — the range's ends as typed, '' = no limit. Strings
   * so the boxes can be emptied; only sent when the format is WHOLE_NUMBER.
   */
  answerMin: string;
  answerMax: string;
  /**
   * GROUP only — the member questions, each a full form of its own (its `id`
   * is the stored member's questionId on edit, null on a new member). The
   * stem doubles as the group's OPTIONAL heading, the one stem allowed to be
   * blank. Empty on every other type.
   */
  members: QuestionForm[];
  /**
   * PLACEMENT flag, carried only on a group MEMBER inside the questionnaire
   * builder: may this member be left blank in that questionnaire. Riding the
   * form keeps it attached to its member through reorders. Never part of the
   * bank payload — questionPayloadFrom ignores it — and meaningless in the
   * bank modal.
   */
  optional?: boolean;
  /**
   * Group MEMBERS only — whether its editor is folded down to a one-line
   * summary. Screen state like showDescription, kept on the form so it
   * follows the member through reorders and so the builder's Expand all /
   * Collapse all can reach inside groups. Never sent, and left out of
   * formSnapshot so folding a member is not an edit.
   */
  collapsed?: boolean;
}

/**
 * The form as the backend would see it, for "has this changed since it was
 * saved?" — screen-only state (a member folded, a member's per-placement
 * Optional flag, which the mapping PUT saves) stripped, so toggling either
 * does not send an identical bank question back to the server.
 */
export const formSnapshot = (form: QuestionForm): string =>
  JSON.stringify(form, (key, value) => (key === 'collapsed' || key === 'optional' ? undefined : value));

/** "MCQ · 4 options · 3 scores" — what a folded member header says it is. */
export const memberSummary = (form: QuestionForm): string => {
  const parts: string[] = [];
  if (form.questionType === 'LINEAR_SCALE') {
    const { from, to } = scaleRange(form);
    parts.push(`linear scale ${from}–${to}`);
  } else if (form.questionType === 'SHORT_ANSWER') {
    parts.push(
      form.answerFormat === 'WHOLE_NUMBER'
        ? `typed number ${numberRangeLabel(numberRange(form).min, numberRange(form).max)}`.trim()
        : 'typed answer',
    );
  } else {
    const n = liveOptions(form).length;
    parts.push(`${n} option${n === 1 ? '' : 's'}`);
    if (form.selectionRule) parts.push('multi-select');
  }
  const scores =
    form.mqtScores.filter((s) => s.mqtId).length +
    form.options.reduce((a, o) => a + o.mqtScores.filter((s) => s.mqtId).length, 0);
  parts.push(scores === 0 ? 'not scored' : `${scores} score${scores === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

/**
 * A group whose members with a problem are unfolded — called when a save is
 * refused, so the member the error names is open to fix rather than hidden
 * behind its summary line. Any other form comes back unchanged.
 */
export const unfoldMembersWithProblems = (form: QuestionForm): QuestionForm =>
  form.questionType !== 'GROUP'
    ? form
    : {
        ...form,
        members: form.members.map((m) => (validateQuestionForm(m) ? { ...m, collapsed: false } : m)),
      };

export const formFrom = (initial: QuestionResponse | null): QuestionForm =>
  initial == null
    ? {
        id: null,
        contentType: 'TEXT',
        questionType: 'MCQ',
        stem: '',
        description: '',
        showDescription: false,
        mediaUrl: '',
        riskFlag: false,
        selectionRule: '',
        selectionCount: '',
        shuffleOptions: false,
        scaleFrom: String(DEFAULT_SCALE_FROM),
        scaleTo: String(DEFAULT_SCALE_TO),
        scaleLowLabel: '',
        scaleHighLabel: '',
        // Four blank options by default — the common case. Blank rows are
        // dropped on save, so unwanted ones can just be left empty or removed.
        options: [emptyOption(), emptyOption(), emptyOption(), emptyOption()],
        rows: [emptyRow(), emptyRow()],
        mqtScores: [],
        gameId: null,
        answerFormat: 'TEXT',
        answerMin: '',
        answerMax: '',
        members: [],
      }
    : {
        id: initial.questionId,
        contentType: initial.contentType,
        // Questions saved before the type existed come back as MCQ; ?? keeps
        // a response from an older backend meaning the same thing.
        questionType: initial.questionType ?? 'MCQ',
        // Null on an unheaded GROUP — the one stem allowed to be blank.
        stem: initial.stem || '',
        description: initial.description || '',
        // Ticked exactly when there is something to show — reopening a
        // question that has a description must not hide it behind a box the
        // author has to remember to tick again.
        showDescription: !!initial.description,
        mediaUrl: initial.mediaUrl || '',
        riskFlag: initial.riskFlag,
        selectionRule: initial.selectionRule ?? '',
        selectionCount: initial.selectionCount == null ? '' : String(initial.selectionCount),
        // ?? false so a response from an older backend still opens the form.
        shuffleOptions: initial.shuffleOptions ?? false,
        // A scale saved before the range existed comes back null, and null
        // has always meant 1—5.
        scaleFrom: String(initial.scaleFrom ?? DEFAULT_SCALE_FROM),
        scaleTo: String(initial.scaleTo ?? DEFAULT_SCALE_TO),
        scaleLowLabel: initial.scaleLowLabel || '',
        scaleHighLabel: initial.scaleHighLabel || '',
        options: initial.options.map((o) => ({
          optionText: o.optionText || '',
          description: o.description || '',
          showDescription: !!o.description,
          contentType: o.contentType,
          mediaUrl: o.mediaUrl || '',
          mqtScores: viewsToRows(o.mqtScores || []),
        })),
        rows: (initial.rows || []).map((r) => ({
          rowText: r.rowText || '',
          mqts: viewsToRows(r.mqts || []),
        })),
        mqtScores: viewsToRows(initial.mqtScores || []),
        gameId: initial.options.find((o) => o.game)?.game?.gameId ?? null,
        // Null on every type but a short answer, and on a response from an
        // older backend — both mean text.
        answerFormat: initial.answerFormat ?? 'TEXT',
        answerMin: initial.answerMin == null ? '' : String(initial.answerMin),
        answerMax: initial.answerMax == null ? '' : String(initial.answerMax),
        // Saved members open folded, the way saved questions open collapsed in
        // the questionnaire builder: a group reads as its list of questions
        // first, and each unfolds to edit. New members start open.
        members: (initial.members ?? []).map((m) => ({ ...formFrom(m), collapsed: true })),
      };

/** Option rows that carry text or media, trimmed. Row order = display order. */
/**
 * A Number answer's range as it will be SENT — a blank end is null (no
 * limit). Only meaningful once validateQuestionForm has passed; a non-digit
 * end reads as null here and is reported there.
 */
export const numberRange = (form: QuestionForm): { min: number | null; max: number | null } => {
  const end = (v: string) => (/^[0-9]{1,15}$/.test(v.trim()) ? Number(v.trim()) : null);
  return { min: end(form.answerMin), max: end(form.answerMax) };
};

const liveOptions = (form: QuestionForm): OptionForm[] =>
  form.options
    .map((o) => ({ ...o, optionText: o.optionText.trim(), mediaUrl: o.mediaUrl.trim() }))
    // A description alone never keeps an option alive — help text under
    // nothing is nothing. Same rule the backend's sanitized() applies.
    .filter((o) => o.optionText || o.mediaUrl);

/**
 * The points a linear scale is made of. The backend GENERATES these on save
 * (they are not authored, and the payload's option list is ignored) — this is
 * the same list, for anything that has to SHOW a scale before it is saved:
 * the preview, and the "n options" summary on the questionnaire editor.
 */
export const scalePoints = (from: number, to: number): OptionForm[] =>
  to <= from || to - from + 1 > MAX_SCALE_POINTS
    ? []
    : Array.from({ length: to - from + 1 }, (_, i) => ({
        ...emptyOption(),
        optionText: String(from + i),
      }));

/**
 * The range as a pair of numbers, whatever state the two inputs are in. A
 * blank or half-typed end falls back to the default rather than NaN, so the
 * preview keeps rendering while someone is still typing.
 */
export const scaleRange = (form: QuestionForm): { from: number; to: number } => {
  const from = Number.parseInt(form.scaleFrom, 10);
  const to = Number.parseInt(form.scaleTo, 10);
  return {
    from: Number.isFinite(from) ? from : DEFAULT_SCALE_FROM,
    to: Number.isFinite(to) ? to : DEFAULT_SCALE_TO,
  };
};

/** What the respondent will actually be shown, whoever wrote it. */
export const effectiveOptions = (form: QuestionForm): OptionForm[] => {
  if (form.questionType === 'LINEAR_SCALE') {
    const { from, to } = scaleRange(form);
    return scalePoints(from, to);
  }
  // Free text has nothing to pick from at all — the one type with no options.
  if (form.questionType === 'SHORT_ANSWER') return [];
  // A game's one option is generated on save and has no label; the game is
  // what the respondent meets, and the launch card is not an option list.
  if (form.questionType === 'GAMES') return [];
  return liveOptions(form);
};

/**
 * Rows that will actually be stored, trimmed. Matches sanitizedRows on the
 * backend: a row survives on text OR a nomination, so trailing blank inputs
 * cost nothing.
 */
export const liveRows = (form: QuestionForm): RowForm[] =>
  form.questionType !== 'LIKERT_GRID'
    ? []
    : form.rows
        .map((r) => ({ ...r, rowText: r.rowText.trim(), mqts: r.mqts.filter((m) => m.mqtId) }))
        .filter((r) => r.rowText || r.mqts.length > 0);

/** null when the form can be saved, otherwise the first problem found. */
export function validateQuestionForm(form: QuestionForm): string | null {
  // A group first: its stem is the OPTIONAL heading, so the required-stem
  // rule below must not see it. Members are validated by exactly this
  // function — they are full questions — named by their position, the way
  // the backend's validateGroup names them.
  if (form.questionType === 'GROUP') {
    if (form.members.length < 2) return 'A group needs at least two questions';
    for (let i = 0; i < form.members.length; i++) {
      const problem = validateQuestionForm(form.members[i]);
      if (problem) return `Question ${i + 1} in the group: ${problem}`;
    }
    return null;
  }
  if (!form.stem.trim()) return 'Question text is required';
  if (form.contentType === 'FREE_TEXT') return 'The question stem cannot be a short-answer box';
  if (form.contentType !== 'TEXT' && !form.mediaUrl.trim()) {
    return `A ${form.contentType.toLowerCase()} question needs a media URL`;
  }
  // A scale has no authored options and no selection rule — its points are
  // generated and it is one pick by definition — so the option rules below
  // have nothing to check. Only the two labels are its own.
  if (form.questionType === 'LINEAR_SCALE') {
    if (form.scaleLowLabel.trim().length > 100 || form.scaleHighLabel.trim().length > 100) {
      return 'Scale labels are at most 100 characters';
    }
    // Mirrors validateType on the backend, message for message.
    const from = Number.parseInt(form.scaleFrom, 10);
    const to = Number.parseInt(form.scaleTo, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      return 'A scale needs a whole number at each end';
    }
    if (to <= from) return `Scale end (${to}) must be greater than the start (${from})`;
    if (to - from + 1 > MAX_SCALE_POINTS) {
      return `A scale of ${to - from + 1} points is too wide — the most is ${MAX_SCALE_POINTS}`;
    }
    return null;
  }
  // Free text: nothing else to check. No options, no rows, no rule — the
  // type switch already cleared them and the payload builder drops them.
  if (form.questionType === 'SHORT_ANSWER') {
    if (form.answerFormat !== 'WHOLE_NUMBER') return null;
    // Mirrors QuestionController.rangeProblem: each end optional, a whole
    // number 0 … MAX_WHOLE_NUMBER, and To above From.
    for (const [name, value] of [['From', form.answerMin], ['To', form.answerMax]] as const) {
      if (value.trim() && !/^[0-9]{1,15}$/.test(value.trim())) {
        return `The number range's ${name} must be a whole number from 0 to ${MAX_WHOLE_NUMBER}`;
      }
    }
    const { min, max } = numberRange(form);
    if (min != null && max != null && max <= min) {
      return `The number range's To (${max}) must be greater than its From (${min})`;
    }
    return null;
  }
  // A game: the game is the whole answer. Mirrors validateType's GAMES branch.
  if (form.questionType === 'GAMES') return form.gameId == null ? 'Pick the game this question launches' : null;
  const rows = liveOptions(form);
  const noun = form.questionType === 'LIKERT_GRID' ? 'Column' : 'Option';
  // Mirrors QuestionController.validateFreeTextOptions: the "Other…" row is
  // MCQ only, at most one, and its text is the label on the button.
  let freeText = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].contentType === 'FREE_TEXT') {
      freeText++;
      if (form.questionType === 'LIKERT_GRID') {
        return `${noun} ${i + 1} is a short-answer box — a grid's columns are a shared rating scale`;
      }
      if (!rows[i].optionText) {
        return `${noun} ${i + 1} is a short-answer option — it needs a label (e.g. "Other")`;
      }
      continue;
    }
    if (rows[i].contentType !== 'TEXT' && !rows[i].mediaUrl) {
      return `${noun} ${i + 1} is ${rows[i].contentType.toLowerCase()} — it needs a media URL`;
    }
  }
  if (freeText > 1) return 'A question can have only one short-answer option';
  // Mirrors validateType on the backend, so a grid's shape problems show
  // inline instead of coming back as a 400.
  if (form.questionType === 'LIKERT_GRID') {
    if (liveRows(form).length === 0) return 'A grid needs at least one row';
    if (rows.length < 2) return 'A grid needs at least two columns';
    return null;
  }
  // Mirrors validateType's MCQ floor: every placed question is mandatory, so
  // one with nothing to pick would stop every respondent at it.
  if (rows.length === 0) return 'A multiple-choice question needs at least one option';
  // Mirrors QuestionController.validateSelection, against the same option
  // list the backend will count (blank rows already dropped), so the problem
  // is reported inline instead of coming back as a 400.
  if (form.selectionRule) {
    const n = Number(form.selectionCount);
    if (!form.selectionCount.trim() || !Number.isInteger(n) || n < 1) {
      return 'How many options must be a whole number of at least 1';
    }
    if (n > rows.length) {
      return `This question has ${rows.length} option${rows.length === 1 ? '' : 's'} — ${n} cannot be selected`;
    }
  }
  return null;
}

/** Form → the wire payload. Validate first — this assumes a valid form. */
export function questionPayloadFrom(form: QuestionForm): QuestionPayload {
  // A group sends its heading (possibly blank — the backend stores blank as
  // null), its members, and NOTHING of its own: the backend refuses options,
  // rows, scores, a rule or a shuffle on the parent. A member carries its
  // stored questionId so an update edits it in place; a new member sends
  // none and is created.
  if (form.questionType === 'GROUP') {
    return {
      contentType: 'TEXT',
      questionType: 'GROUP',
      stem: form.stem.trim(),
      description: form.showDescription ? form.description.trim() || null : null,
      mediaUrl: null,
      riskFlag: false,
      selectionRule: null,
      selectionCount: null,
      shuffleOptions: false,
      scaleFrom: null,
      scaleTo: null,
      scaleLowLabel: null,
      scaleHighLabel: null,
      options: [],
      rows: [],
      mqtScores: [],
      gameId: null,
      answerFormat: null,
      answerMin: null,
      answerMax: null,
      members: form.members.map((m) => ({ ...questionPayloadFrom(m), questionId: m.id })),
    };
  }
  const scale = form.questionType === 'LINEAR_SCALE';
  const grid = form.questionType === 'LIKERT_GRID';
  const text = form.questionType === 'SHORT_ANSWER';
  const game = form.questionType === 'GAMES';
  // A scale's options and a game's one option are generated by the backend,
  // and a short answer has none at all; all three take one answer, so a rule
  // would be refused too. Cleared HERE as well as in the type switch, so a
  // form that reached this point some other way still saves.
  const rows = scale || text || game ? [] : liveOptions(form);
  const range = scaleRange(form);
  return {
    contentType: form.contentType,
    questionType: form.questionType,
    stem: form.stem.trim(),
    // Unticking the box clears the field on the wire while LEAVING the typed
    // text in the form, so a mis-click is one tick away from undone. A ticked
    // but empty box is null too — there is one representation of "none".
    description: form.showDescription ? form.description.trim() || null : null,
    mediaUrl: form.contentType === 'TEXT' ? null : form.mediaUrl.trim(),
    riskFlag: form.riskFlag,
    // Never send a count without a rule — the backend 400s on the pair, and
    // a stale count left behind by switching back to single choice is the
    // only way that happens.
    // A grid is one pick per row for now, so it sends no rule either.
    selectionRule: scale || grid || text || game ? null : form.selectionRule || null,
    selectionCount: !scale && !grid && !text && !game && form.selectionRule ? Number(form.selectionCount) : null,
    // A scale's points and a grid's columns are ordered, and a short answer
    // has nothing to order — the backend refuses the flag on all three, so it
    // is cleared here as well as in the type switch.
    shuffleOptions: !scale && !grid && !text && !game && form.shuffleOptions,
    scaleFrom: scale ? range.from : null,
    scaleTo: scale ? range.to : null,
    scaleLowLabel: scale ? form.scaleLowLabel.trim() || null : null,
    scaleHighLabel: scale ? form.scaleHighLabel.trim() || null : null,
    options: rows.map((o) => ({
      optionText: o.optionText || null,
      description: o.showDescription ? o.description.trim() || null : null,
      contentType: o.contentType,
      // A short-answer option is a box, not media — the backend refuses a
      // URL on it, so a stale one from a type switch must not travel.
      mediaUrl: o.contentType === 'TEXT' || o.contentType === 'FREE_TEXT' ? null : o.mediaUrl,
      mqtScores: rowsToPayload(o.mqtScores),
    })),
    // A row's scores travel exactly like an option's.
    rows: liveRows(form).map((r) => ({
      rowText: r.rowText || null,
      mqtScores: rowsToPayload(r.mqts),
    })),
    mqtScores: rowsToPayload(form.mqtScores),
    // Only a game question names a game — the backend refuses it elsewhere.
    gameId: game ? form.gameId : null,
    // Same for a short answer's format — and its range, Number only.
    answerFormat: text ? form.answerFormat : null,
    answerMin: text && form.answerFormat === 'WHOLE_NUMBER' ? numberRange(form).min : null,
    answerMax: text && form.answerFormat === 'WHOLE_NUMBER' ? numberRange(form).max : null,
  };
}

/**
 * Every field of a bank question — stem type, text, media URL, risk flag,
 * question-level MQT scores and the option list with per-option scores.
 * Fully controlled: it never saves anything, the host decides when to write.
 */
export function QuestionFormFields({
  form,
  onChange,
  choices,
  onCreateChoice,
  allowedTypes,
  showMemberOptional,
}: {
  form: QuestionForm;
  onChange: (next: QuestionForm) => void;
  choices: MqtChoice[];
  /** Passed on to every ScoreEditor — see there. Absent hides the offer. */
  onCreateChoice?: (choice: MqtChoice) => void;
  /**
   * Restricts the type dropdown — a GROUP's member editors pass
   * GROUP_MEMBER_TYPES (no games, grids or nested groups). Absent = all.
   */
  allowedTypes?: QuestionType[];
  /**
   * Questionnaire builder only: show an "Optional" checkbox on each group
   * member, bound to QuestionForm.optional — the per-PLACEMENT flag the
   * builder saves with the mapping. The bank modal leaves it off; a bank
   * question has no placement to be optional in.
   */
  showMemberOptional?: boolean;
}) {
  const set = (patch: Partial<QuestionForm>) => onChange({ ...form, ...patch });
  /** One group member's form patched in place — fold state, Optional, and the like. */
  const patchMember = (i: number, patch: Partial<QuestionForm>) =>
    set({ members: form.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const isScale = form.questionType === 'LINEAR_SCALE';
  const isGrid = form.questionType === 'LIKERT_GRID';
  const isText = form.questionType === 'SHORT_ANSWER';
  const isGame = form.questionType === 'GAMES';
  // A group is a heading over member questions: the parent authors no
  // content of its own, so the stem-type picker, risk flag, scores and
  // option machinery all give way to the members editor below.
  const isGroup = form.questionType === 'GROUP';
  const typeChoices = QUESTION_TYPES.filter((t) => !allowedTypes || allowedTypes.includes(t.value));
  // A grid's columns MAY carry scores of their own (the pre-2026-09-29 rule,
  // kept for label grids). Folded away unless some column already has one,
  // so the row editor is the one scoring surface an author meets by default.
  const [showColumnScores, setShowColumnScores] = useState(
    () => form.questionType === 'LIKERT_GRID' && form.options.some((o) => o.mqtScores.some((s) => s.mqtId)),
  );
  const range = scaleRange(form);
  const points = scalePoints(range.from, range.to);
  // Options that will actually be stored — what the selection count is
  // validated against, here and on the backend.
  const liveCount = liveOptions(form).length;
  const selectionHint = `${form.selectionCount || '?'} of ${liveCount}`;
  const patchOption = (i: number, patch: Partial<OptionForm>) =>
    set({ options: form.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const addOption = () => set({ options: [...form.options, emptyOption()] });
  const removeOption = (i: number) => set({ options: form.options.filter((_, j) => j !== i) });
  const moveOption = (i: number, dir: -1 | 1) => {
    const next = [...form.options];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ options: next });
  };
  const patchRow = (i: number, patch: Partial<RowForm>) =>
    set({ rows: form.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addRow = () => set({ rows: [...form.rows, emptyRow()] });
  const removeRow = (i: number) => set({ rows: form.rows.filter((_, j) => j !== i) });
  const moveRow = (i: number, dir: -1 | 1) => {
    const next = [...form.rows];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ rows: next });
  };

  return (
    <div className="space-y-4">
      {!isGroup && (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Stem type *</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONTENT_TYPES.filter((t) => !t.optionsOnly).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                disabled={t.disabled}
                onClick={() => set({ contentType: t.value })}
                title={t.disabled ? 'File upload needs object storage — coming later' : undefined}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                  form.contentType === t.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                  t.disabled && 'opacity-40 cursor-not-allowed hover:text-muted-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          Image & video need a file upload — disabled until object storage
          is set up. Use URL for externally hosted media.
        </p>
      </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{isGroup ? 'Group heading (optional)' : 'Question text *'}</label>
        <textarea
          rows={2}
          value={form.stem}
          onChange={(e) => set({ stem: e.target.value })}
          placeholder={isGroup
            ? 'e.g., About your week — shown once above the questions (or leave blank)'
            : 'e.g., I enjoy meeting new people.'}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Optional help text under the stem. Behind a checkbox rather than
          always on screen: most questions need none, and an empty box on
          every question is one more thing to read past. Unticking hides the
          field and clears it on save, but keeps what was typed until the
          modal closes — so a mis-click costs nothing. */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={form.showDescription}
            onChange={(e) => set({ showDescription: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="font-medium">Add a description</span>
          <span className="text-muted-foreground text-xs">
            — shown under the question while answering
          </span>
        </label>
        {form.showDescription && (
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g., Answer for how things have been over the last two weeks."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        )}
      </div>
      {form.contentType !== 'TEXT' && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Media URL *</label>
          <input
            value={form.mediaUrl}
            onChange={(e) => set({ mediaUrl: e.target.value })}
            placeholder="https://… (link to an image or video)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      )}

      {!isGroup && (
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.riskFlag}
          onChange={(e) => set({ riskFlag: e.target.checked })}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        <span className="font-medium inline-flex items-center gap-1">
          <Flag className="h-3.5 w-3.5 text-red-500" /> Risk flag
        </span>
        <span className="text-muted-foreground">— responses to this question are surfaced for risk review</span>
      </label>
      )}

      {/* What SHAPE the question is. Sits above the scoring and option
          editors because it decides which of them are shown at all. */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Question type *</label>
        <select
          value={form.questionType}
          onChange={(e) => {
            const questionType = e.target.value as QuestionType;
            // A scale is one pick and has no authored options, so leaving MCQ
            // clears the rule with it — the same reason the rule dropdown
            // clears its count. The option rows are LEFT ALONE so switching
            // back and forth does not throw away what was typed.
            set({
              questionType,
              ...(questionType === 'LINEAR_SCALE' || questionType === 'SHORT_ANSWER' || questionType === 'GAMES'
                ? { selectionRule: '' as const, selectionCount: '' }
                : {}),
              // Shuffling belongs to an MCQ: a scale's points and a grid's
              // columns are ordered, so leaving MCQ drops the flag rather
              // than sending one the backend would refuse.
              ...(questionType === 'MCQ' ? {} : { shuffleOptions: false }),
              // A group opens with two blank questions — the minimum it can
              // save with. Members already typed survive a switch away and
              // back, like option rows do.
              ...(questionType === 'GROUP' && form.members.length === 0
                ? { members: [formFrom(null), formFrom(null)] }
                : {}),
            });
          }}
          className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {typeChoices.map((t) => (
            <option key={t.value} value={t.value} disabled={t.disabled}>{t.label}</option>
          ))}
        </select>
        <p className="text-[0.6875rem] text-muted-foreground">
          {QUESTION_TYPES.find((t) => t.value === form.questionType)?.hint}
        </p>
      </div>

      {/* Question-level MQT scoring — not on a group: the parent is a
          heading, and every score lives on a member. */}
      {!isGroup && (
      <div className="rounded-lg border border-border/70 p-3">
        <ScoreEditor
          title={isScale ? 'Question → MQT mapping' : 'Question → MQT scores'}
          rows={form.mqtScores}
          choices={choices}
          onCreateChoice={onCreateChoice}
          onChange={(rows) => set({ mqtScores: rows })}
          hideScore={isScale}
        />
        {isScale && (
          <p className="text-[0.6875rem] text-muted-foreground mt-1.5">
            No number to enter — the point the respondent lands on IS the score
            for every MQT mapped here ({range.from} scores {range.from}, {range.to} scores {range.to}).
          </p>
        )}
        {isText && (
          <p className="text-[0.6875rem] text-muted-foreground mt-1.5">
            There is nothing to pick, so this score is earned for ANSWERING —
            the same whatever is written. Leave it unmapped for questions that
            collect text rather than measure something.
          </p>
        )}
        {isGame && (
          <p className="text-[0.6875rem] text-muted-foreground mt-1.5">
            How a game's results turn into scores is not decided yet — for now a
            score here is earned for FINISHING the game, whatever the result.
          </p>
        )}
      </div>
      )}

      {isGroup ? (
        /* The members editor: each member is a FULL question form of its own
           — same fields, same scoring, type restricted to what fits inside a
           group block. Nested recursion of this very component. */
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-sm font-medium">Questions in this group</label>
            <div className="flex items-center gap-2">
              {form.members.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => set({ members: form.members.map((m) => ({ ...m, collapsed: false })) })}
                    className="text-[0.6875rem] font-medium text-primary hover:underline"
                  >
                    Expand all
                  </button>
                  <span className="text-[0.6875rem] text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={() => set({ members: form.members.map((m) => ({ ...m, collapsed: true })) })}
                    className="text-[0.6875rem] font-medium text-primary hover:underline"
                  >
                    Collapse all
                  </button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => set({ members: [...form.members, formFrom(null)] })}
              >
                <Plus className="h-3 w-3" /> Add question
              </Button>
            </div>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            Shown together on one page, each question with its options laid out in a row.
            At least two. Questionnaires using this group follow membership changes
            automatically — until anyone has answered, when the set of questions locks.
            Wording and scores stay editable throughout.
          </p>
          {form.members.map((member, i) => {
            const folded = member.collapsed ?? false;
            const toggle = () => patchMember(i, { collapsed: !folded });
            // Shown on a folded member only: an unfolded one shows its own
            // fields, and a save refused for it unfolds it anyway.
            const problem = folded ? validateQuestionForm(member) : null;
            const memberStem = member.stem.trim();
            return (
            <div key={i} className={cn('rounded-lg border border-border bg-muted/20', folded ? 'px-3 py-2' : 'p-3 space-y-3')}>
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={toggle}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  title={folded ? 'Expand question' : 'Collapse question'}
                  aria-expanded={!folded}
                >
                  <ChevronRight className={cn('h-4 w-4 transition-transform', !folded && 'rotate-90')} />
                </button>
                <button type="button" onClick={toggle} className="min-w-0 flex-1 text-left">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">
                    Question {i + 1}{member.id == null && form.id != null ? ' · new' : ''}
                  </span>
                  {folded && (
                    <>
                      <span className={cn('block truncate text-sm font-medium', !memberStem && 'italic text-muted-foreground')}>
                        {memberStem || 'Untitled question'}
                      </span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">
                        {memberSummary(member)}
                        {problem && (
                          <span className="text-amber-700 dark:text-amber-400">{' · '}{problem}</span>
                        )}
                      </span>
                    </>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  {showMemberOptional && (
                    <label
                      className="mr-1 flex h-6 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs"
                      title="Optional questions can be left blank in this questionnaire. Saved with the questionnaire, not with the bank question."
                    >
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={member.optional ?? false}
                        onChange={(e) => patchMember(i, { optional: e.target.checked })}
                      />
                      Optional
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (i === 0) return;
                      const next = [...form.members];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      set({ members: next });
                    }}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1"
                    title="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (i === form.members.length - 1) return;
                      const next = [...form.members];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      set({ members: next });
                    }}
                    disabled={i === form.members.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1"
                    title="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ members: form.members.filter((_, j) => j !== i) })}
                    className="text-muted-foreground hover:text-red-500 p-1"
                    title="Remove this question from the group"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {!folded && (
                <QuestionFormFields
                  form={member}
                  onChange={(next) => set({ members: form.members.map((m, j) => (j === i ? next : m)) })}
                  choices={choices}
                  onCreateChoice={onCreateChoice}
                  allowedTypes={GROUP_MEMBER_TYPES}
                />
              )}
            </div>
            );
          })}
        </div>
      ) : isGame ? (
        <GamePicker gameId={form.gameId} onChange={(gameId) => set({ gameId })} />
      ) : isText ? (
        /* Typed answer: no options, no rows, no rule, no length limit. What
           it ACCEPTS is the one choice, then what the respondent will meet. */
        <div className="rounded-lg border border-border/70 p-3 space-y-2">
          <label className="text-sm font-medium">Answer</label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Accepts</span>
            <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Accepts">
              {ANSWER_FORMATS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={form.answerFormat === f.value}
                  onClick={() => set({ answerFormat: f.value })}
                  className={cn(
                    'h-7 rounded-md px-3 text-xs font-medium transition-colors',
                    form.answerFormat === f.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            {ANSWER_FORMATS.find((f) => f.value === form.answerFormat)?.hint}
            {form.answerFormat === 'TEXT' && ' Once anyone has answered, it can no longer be limited to numbers.'}
          </p>
          {form.answerFormat === 'WHOLE_NUMBER' && (
            /* The range: either end optional. A respondent typing outside
               it is told the range in the portal's warning, and submit
               refuses it. */
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Range</span>
                <span className="text-xs text-muted-foreground">from</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.answerMin}
                  onChange={(e) => set({ answerMin: e.target.value })}
                  placeholder="No limit"
                  aria-label="Smallest number accepted"
                  className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.answerMax}
                  onChange={(e) => set({ answerMax: e.target.value })}
                  placeholder="No limit"
                  aria-label="Largest number accepted"
                  className="h-9 w-28 rounded-lg border border-border bg-background px-2 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                Both ends are included. Leave either blank for no limit. Once anyone has
                answered, the range can only be widened.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
            <p className="text-[0.6875rem] text-muted-foreground mb-2">Respondents will see</p>
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
              {form.answerFormat === 'WHOLE_NUMBER' ? 'Enter a number' : 'Their answer…'}
            </div>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            A blank answer is refused at submit unless the questionnaire marks
            the question optional. Answers are exported and reported as written.
          </p>
        </div>
      ) : isScale ? (
        /* A scale is authored as a range and two captions: the points
           themselves are generated on save, so there is nothing to type. */
        <div className="rounded-lg border border-border/70 p-3 space-y-2">
          <label className="text-sm font-medium">Scale</label>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">From</span>
            <input
              type="number"
              value={form.scaleFrom}
              onChange={(e) => set({ scaleFrom: e.target.value })}
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="number"
              value={form.scaleTo}
              onChange={(e) => set({ scaleTo: e.target.value })}
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="text-xs text-muted-foreground">
              {points.length} point{points.length === 1 ? '' : 's'} · negative ends are allowed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 text-right text-xs text-muted-foreground shrink-0">{range.from}</span>
            <input
              value={form.scaleLowLabel}
              onChange={(e) => set({ scaleLowLabel: e.target.value })}
              maxLength={100}
              placeholder="Label for the low end (optional) — e.g. Strongly disagree"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 text-right text-xs text-muted-foreground shrink-0">{range.to}</span>
            <input
              value={form.scaleHighLabel}
              onChange={(e) => set({ scaleHighLabel: e.target.value })}
              maxLength={100}
              placeholder="Label for the high end (optional) — e.g. Strongly agree"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {/* The respondent drags a slider, so the preview is one too —
              unset, exactly as they first meet it. */}
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3 space-y-1.5">
            <p className="text-[0.6875rem] text-muted-foreground">Respondents will see</p>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="max-w-[40%] truncate">{form.scaleLowLabel}</span>
              <span className="max-w-[40%] truncate text-right">{form.scaleHighLabel}</span>
            </div>
            <div className="h-1.5 rounded-full bg-border" />
            <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground">
              <span>{range.from}</span>
              <span>{range.to}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
      {isGrid && (
        /* Rows are the statements. Each SCORES the MQTs it measures, exactly
           like an MCQ option — earned when the row is answered, whatever
           column the respondent picks. */
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Rows (statements)</label>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3 w-3" /> Add row
            </Button>
          </div>
          {form.rows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No rows yet — add the statements respondents rate.
            </p>
          ) : (
            <div className="space-y-2">
              {form.rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-border/70 p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <input
                      value={row.rowText}
                      onChange={(e) => patchRow(i, { rowText: e.target.value })}
                      placeholder={`Row ${i + 1} — e.g. I plan my week ahead`}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveRow(i, 1)} disabled={i === form.rows.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-500 p-1" title="Remove row">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <ScoreEditor
                    title={`Row ${i + 1} → MQT scores`}
                    rows={row.mqts}
                    choices={choices}
                    onCreateChoice={onCreateChoice}
                    onChange={(mqts) => patchRow(i, { mqts })}
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-[0.6875rem] text-muted-foreground">
            One pick per row, and every row must be answered. A row earns its scores
            when it is answered, whichever column is picked — the column is recorded
            as the answer. Rows lock once anyone has responded; their scores never do.
          </p>
        </div>
      )}

      {!isGrid && (
      /* How many options the respondent may pick. Sits directly above the
          option list because it changes what that list means. */
      <div className="rounded-lg border border-border/70 p-3 space-y-1.5">
        <label className="text-sm font-medium">How many options can be selected</label>
        <div className="flex items-center gap-2">
          <select
            value={form.selectionRule}
            onChange={(e) => {
              const rule = e.target.value as SelectionRule | '';
              // Leaving multi-select clears the count with it, so the payload
              // can never carry one without a rule.
              set({ selectionRule: rule, selectionCount: rule ? form.selectionCount || '2' : '' });
            }}
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Single choice — one option</option>
            <option value="MAX">Max — up to</option>
            <option value="MIN">Min — at least</option>
            <option value="EQUALS">Equals — exactly</option>
          </select>
          {form.selectionRule && (
            <>
              <input
                type="number"
                min={1}
                max={liveCount}
                value={form.selectionCount}
                onChange={(e) => set({ selectionCount: e.target.value })}
                className="h-9 w-20 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs text-muted-foreground">
                of {liveCount} option{liveCount === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          {form.selectionRule
            ? `Respondents tick checkboxes and must pick ${
                form.selectionRule === 'EQUALS'
                  ? `exactly ${selectionHint}`
                  : form.selectionRule === 'MAX'
                    ? `between 1 and ${selectionHint}`
                    : `at least ${selectionHint}`
              }. Locked once anyone has answered.`
            : 'Respondents pick one option, as radio buttons.'}
        </p>
      </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">{isGrid ? 'Columns (the rating scale)' : 'Options'}</label>
          <div className="flex items-center gap-2">
            {/* Shuffle sits beside Add option because it is about this list.
                Hidden on a grid — those columns are one shared rating scale
                and reordering them would scramble the scale itself. */}
            {!isGrid && (
              <button
                type="button"
                role="switch"
                aria-checked={form.shuffleOptions}
                onClick={() => set({ shuffleOptions: !form.shuffleOptions })}
                title={
                  form.shuffleOptions
                    ? 'Each respondent sees these options in a different order'
                    : 'Every respondent sees these options in the order below'
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2 h-8 text-xs font-medium transition-colors',
                  form.shuffleOptions
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
                )}
              >
                <Shuffle className="h-3 w-3" />
                Shuffle
                <span
                  className={cn(
                    'ml-0.5 h-4 w-7 rounded-full p-0.5 transition-colors',
                    form.shuffleOptions ? 'bg-primary' : 'bg-border',
                  )}
                >
                  <span
                    className={cn(
                      'block h-3 w-3 rounded-full bg-white transition-transform',
                      form.shuffleOptions && 'translate-x-3',
                    )}
                  />
                </span>
              </button>
            )}
            <Button variant="outline" size="sm" onClick={addOption}>
              <Plus className="h-3 w-3" /> Add {isGrid ? 'column' : 'option'}
            </Button>
          </div>
        </div>
        {!isGrid && form.shuffleOptions && (
          <p className="text-[0.6875rem] text-muted-foreground">
            Options are delivered in a random order — different for each respondent, and
            fixed for the whole of their attempt. The order below stays the authored one:
            it is what previews, exports and the scoring key use.
          </p>
        )}
        {isGrid && (
          <p className="text-[0.6875rem] text-muted-foreground">
            Columns are what respondents pick — numbers or words — and are recorded as the
            answer; the scores live on the rows.{' '}
            <button
              type="button"
              onClick={() => setShowColumnScores((v) => !v)}
              className="underline underline-offset-2 hover:text-foreground"
            >
              {showColumnScores ? 'Hide column scores' : 'Score the columns too (optional)'}
            </button>
          </p>
        )}
        {form.options.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {isGrid
              ? 'No columns yet — add the rating scale respondents pick from.'
              : 'No options yet — add the choices the respondent picks from.'}
          </p>
        ) : (
          <div className="space-y-2">
            {form.options.map((opt, i) => (
              <div key={i} className="rounded-lg border border-border/70 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <select
                    value={opt.contentType}
                    onChange={(e) => patchOption(i, { contentType: e.target.value as QuestionContentType })}
                    className="h-8 rounded-md border border-border bg-background px-1.5 text-xs focus:outline-none focus:border-primary"
                    title="Option type"
                  >
                    {optionContentTypesFor(form.questionType).map((t) => (
                      <option key={t.value} value={t.value} disabled={t.disabled && opt.contentType !== t.value}>
                        {t.label}{t.disabled ? ' (soon)' : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    value={opt.optionText}
                    onChange={(e) => patchOption(i, { optionText: e.target.value })}
                    placeholder={
                      opt.contentType === 'FREE_TEXT'
                        ? 'Label on the button, e.g. Other'
                        : `${isGrid ? 'Column' : 'Option'} ${i + 1} text${opt.contentType !== 'TEXT' ? ' (caption, optional)' : ''}`
                    }
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => moveOption(i, 1)} disabled={i === form.options.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-1" title="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => removeOption(i)} className="text-muted-foreground hover:text-red-500 p-1" title="Remove option">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {opt.contentType !== 'TEXT' && opt.contentType !== 'FREE_TEXT' && (
                  <input
                    value={opt.mediaUrl}
                    onChange={(e) => patchOption(i, { mediaUrl: e.target.value })}
                    placeholder="https://… (link to an image or video)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                )}
                {opt.contentType === 'FREE_TEXT' && (
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Picking this option opens a box the respondent types into. The scores below are
                    earned for choosing it — what they write is stored with the answer but never scored.
                    Auto-next does not fire on this pick; Next (or Enter in the box) does.
                  </p>
                )}
                {/* Per-option help text, same checkbox rule as the question's.
                    Smaller type than the question-level one: with four or five
                    options on screen, a full-size row each would drown the
                    option text they belong to.

                    Not offered on a LIKERT_GRID. Its options are the shared
                    rating columns, which the portal renders as table headers
                    and — on a phone — as ten-pixel buttons; there is nowhere
                    to put help text. Offering a box whose contents no
                    respondent would ever see is worse than not offering it. */}
                {!isGrid && (
                  <>
                    <label className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground cursor-pointer select-none w-fit">
                      <input
                        type="checkbox"
                        checked={opt.showDescription}
                        onChange={(e) => patchOption(i, { showDescription: e.target.checked })}
                        className="h-3 w-3 rounded border-border accent-primary"
                      />
                      Add a description
                    </label>
                    {opt.showDescription && (
                      <input
                        value={opt.description}
                        onChange={(e) => patchOption(i, { description: e.target.value })}
                        placeholder={`Option ${i + 1} description — shown under the option`}
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    )}
                  </>
                )}
                {(!isGrid || showColumnScores) && (
                  <ScoreEditor
                    title={`${isGrid ? 'Column' : 'Option'} ${i + 1} → MQT scores`}
                    rows={opt.mqtScores}
                    choices={choices}
                    onCreateChoice={onCreateChoice}
                    onChange={(rows) => patchOption(i, { mqtScores: rows })}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

/**
 * GAMES only: which catalog game the question launches. Any number of
 * questions may launch the same game, each through its own one option, so
 * every active game is offered; how many questions already use one is shown
 * for information. Retired games are not offered, except the one this question
 * already has.
 */
function GamePicker({ gameId, onChange }: { gameId: number | null; onChange: (gameId: number | null) => void }) {
  const [games, setGames] = useState<GameResponse[] | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    gamesApi
      .getAllGames()
      .then((res) => setGames(res.data))
      .catch((e: any) => setLoadError(e?.response?.data?.message || e?.message || 'Failed to load games'));
  }, []);

  const chosen = games?.find((g) => g.gameId === gameId) ?? null;

  return (
    <div className="rounded-lg border border-border/70 p-3 space-y-2">
      <label className="text-sm font-medium">Game *</label>
      {loadError ? (
        <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>
      ) : games == null ? (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading games…
        </p>
      ) : games.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No games in the catalog yet.</p>
      ) : (
        <select
          value={gameId ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Select a game…</option>
          {games.map((g) => {
            const retired = !g.active && g.gameId !== gameId;
            const uses = g.usedByQuestionIds.length;
            return (
              <option key={g.gameId} value={g.gameId} disabled={retired}>
                {g.name} ({g.code}, v{g.version})
                {retired ? ' — retired' : uses > 0 ? ` — in ${uses} question${uses === 1 ? '' : 's'}` : ''}
              </option>
            );
          })}
        </select>
      )}
      {chosen && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-3 space-y-1.5">
          <p className="text-[0.6875rem] text-muted-foreground">Respondents will see</p>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2">
            <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
            <span className="flex-1 text-sm">{chosen.name}</span>
            <span className="rounded-md bg-primary px-2 py-1 text-[0.6875rem] font-medium text-primary-foreground">
              Launch game
            </span>
          </div>
          {chosen.description && <p className="text-[0.6875rem] text-muted-foreground">{chosen.description}</p>}
          {!isPlayableCode(chosen.code) && (
            <p className="text-[0.6875rem] text-amber-700 dark:text-amber-400 inline-flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              The portal has no game file for code {chosen.code} yet — respondents would see "not available".
            </p>
          )}
        </div>
      )}
      <p className="text-[0.6875rem] text-muted-foreground">
        The game opens full screen and the respondent cannot leave it until it ends; finishing it
        answers the question. The same game can be used by any number of questions.
      </p>
    </div>
  );
}

/**
 * Create/edit modal for a bank question. Mount it to open (state resets on
 * every mount): `{open && <QuestionFormModal … />}`. Saves to the bank itself
 * and hands the saved question to onSaved — closing is the parent's call.
 */
export function QuestionFormModal({
  initial,
  choices,
  onClose,
  onSaved,
  onCreateChoice,
}: {
  /** null = create a new bank question; an existing question = edit it. */
  initial: QuestionResponse | null;
  choices: MqtChoice[];
  onClose: () => void;
  onSaved: (saved: QuestionResponse) => void | Promise<void>;
  /** Lets the form add a measured quality type the bank lacks — see ScoreEditor. */
  onCreateChoice?: (choice: MqtChoice) => void;
}) {
  const [form, setForm] = useState<QuestionForm>(() => formFrom(initial));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const problem = validateQuestionForm(form);
    if (problem) {
      setFormError(problem);
      // The member the message names may be folded away — open it.
      setForm(unfoldMembersWithProblems(form));
      return;
    }
    const payload = questionPayloadFrom(form);
    setSaving(true);
    try {
      const res = form.id != null
        ? await questionApis.updateQuestion(form.id, payload)
        : await questionApis.createQuestion(payload);
      await onSaved(res.data);
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <Card className="w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0">
          <CardTitle className="text-base">{form.id != null ? 'Edit Question' : 'Add Question'}</CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </CardHeader>
        <CardContent className="space-y-4 overflow-y-auto">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          <QuestionFormFields form={form} onChange={setForm} choices={choices} onCreateChoice={onCreateChoice} />
        </CardContent>
        <div className="flex justify-end gap-2 p-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {form.id != null ? 'Save' : 'Add Question'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
