import type {
  MqtScorePayload,
  QuestionContentType,
  QuestionOptionPayload,
  QuestionPayload,
  SelectionRule,
} from './questionApis';
import type { MqtChoice } from './question-form-modal';

// ── The questions-sheet rules, with NO runtime imports ─────────────────────
// Everything here is pure: rows in, payloads and errors out. It is kept apart
// from the upload modal so it runs under vitest without React, axios or the
// icon set — three bugs in one day lived in these functions and were invisible
// to typecheck and to the backend suite. Both upload paths (the template and
// the AI mapper) call parseQuestionRows; only the score-key resolver differs.
// The `import type` lines above are erased at compile time and must stay
// type-only, or this module grows a dependency on the API client.

// What the selectRule cell may say. Matched after lowercasing and stripping
// separators, so "At Least", "at_least" and "atleast" all land here.
const SELECT_RULES: Record<string, SelectionRule> = {
  min: 'MIN', atleast: 'MIN',
  max: 'MAX', atmost: 'MAX', upto: 'MAX',
  equals: 'EQUALS', equal: 'EQUALS', exactly: 'EQUALS',
};

/**
 * The selectRule/selectCount pair for one row, validated against the options
 * that row actually carries. Both blank = single choice, which is what every
 * sheet written before these columns existed says — so old sheets import
 * unchanged and produce no errors.
 */
function parseSelection(
  row: Record<string, string>,
  optionCount: number,
  rowNo: number,
  errors: string[],
): { selectionRule: SelectionRule | null; selectionCount: number | null } {
  const none = { selectionRule: null, selectionCount: null };
  const ruleCell = (row.selectrule || '').toLowerCase().replace(/[\s_-]/g, '');
  const countCell = (row.selectcount || '').trim();
  if (!ruleCell) {
    // A count with no rule is always a typo — importing it as single choice
    // would silently ship a question that contradicts the sheet.
    if (countCell) errors.push(`Row ${rowNo}: selectCount ${countCell} needs a selectRule (min/max/equals)`);
    return none;
  }
  const rule = SELECT_RULES[ruleCell];
  if (!rule) {
    errors.push(`Row ${rowNo}: selectRule "${row.selectrule}" is not min/max/equals`);
    return none;
  }
  if (!countCell) {
    errors.push(`Row ${rowNo}: selectRule "${row.selectrule}" needs a selectCount`);
    return none;
  }
  // Excel hands back 3 or 3.0 for the same cell, so parse as a number and
  // demand an integer rather than pattern-matching the text.
  const count = Number(countCell);
  if (!Number.isInteger(count) || count < 1) {
    errors.push(`Row ${rowNo}: selectCount "${countCell}" is not a whole number above 0`);
    return none;
  }
  if (count > optionCount) {
    errors.push(`Row ${rowNo}: selectCount ${count} but the row only has ${optionCount} option${optionCount === 1 ? '' : 's'}`);
    return none;
  }
  return { selectionRule: rule, selectionCount: count };
}

/**
 * One score-cell key ("Extraversion", "14") → an MQT id, or null having pushed
 * an error. Swapped out by the AI import path, which resolves taxonomy PATHS
 * and hands back NEGATIVE ids standing for nodes that do not exist yet — see
 * `pendingMqtId` in ai-sheet-import.tsx. Everything downstream treats those as
 * ordinary ids until the import payload is built, which is what lets one
 * parser serve both flows.
 */
export type MqtKeyResolver = (key: string, where: string, errors: string[]) => number | null;

/** The character the MQT tree path is written with — `MQ \u203a MQT \u203a MQT`. */
export const PATH_MARK = '\u203a';

/** Spacing around the separator varies; the segments are what matter. */
function normalisePath(value: string): string {
  return value.split(PATH_MARK).map((part) => part.trim().toLowerCase()).join('|');
}

/**
 * The template's own rule: an id, a full TREE PATH, or a name that is
 * unambiguous among choices.
 *
 * <p>The path form is the one worth knowing about. MQT names are deliberately
 * not unique, so `Self-Efficacy` alone may match two different constructs and
 * the sheet has always had to fall back to an id for those. A path —
 * `Internal Drive \u203a Self-Efficacy`, exactly as the template's `mqts` tab
 * has always printed it in its `tree` column — says which one without anybody
 * having to look an id up. It is also what an AI-mapped sheet writes, which is
 * what makes that sheet re-uploadable here unchanged.
 */
/** What a score-cell key turns out to be, before deciding what to say about it. */
type KeyLookup =
  | { kind: 'found'; id: number }
  | { kind: 'unknown-id'; id: number }
  | { kind: 'unknown'; form: 'path' | 'name' }
  | { kind: 'ambiguous'; form: 'path' | 'name'; count: number };

/** The matching itself, with no opinion about what an unknown key means. */
function lookupKey(key: string, choices: MqtChoice[]): KeyLookup {
  if (/^\d+$/.test(key)) {
    const id = Number(key);
    return choices.some((c) => c.id === id) ? { kind: 'found', id } : { kind: 'unknown-id', id };
  }
  if (key.includes(PATH_MARK)) {
    const want = normalisePath(key);
    const hits = choices.filter((c) => normalisePath(c.label) === want);
    if (hits.length === 0) return { kind: 'unknown', form: 'path' };
    if (hits.length > 1) return { kind: 'ambiguous', form: 'path', count: hits.length };
    return { kind: 'found', id: hits[0].id };
  }
  const matches = choices.filter((c) => c.name.toLowerCase() === key.toLowerCase());
  if (matches.length === 0) return { kind: 'unknown', form: 'name' };
  if (matches.length > 1) return { kind: 'ambiguous', form: 'name', count: matches.length };
  return { kind: 'found', id: matches[0].id };
}

/** The wording each miss has always had — unchanged, and stated in one place. */
function keyProblem(where: string, key: string, hit: KeyLookup): string {
  switch (hit.kind) {
    case 'unknown-id': return `${where}: no MQT with id ${hit.id}`;
    case 'unknown': return hit.form === 'path'
      ? `${where}: no measured quality type at "${key}"`
      : `${where}: no MQT named "${key}"`;
    case 'ambiguous': return `${where}: "${key}" matches ${hit.count} MQTs — use the id instead`;
    default: return '';
  }
}

export function mqtKeyResolver(choices: MqtChoice[]): MqtKeyResolver {
  return (key, where, errors) => {
    const hit = lookupKey(key, choices);
    if (hit.kind === 'found') return hit.id;
    errors.push(keyProblem(where, key, hit));
    return null;
  };
}

/**
 * The upload's FIRST pass: resolve what exists, and collect what does not
 * instead of refusing the sheet over it.
 *
 * <p>A name the bank has never heard of used to end the upload, which meant
 * a sheet bringing its own constructs could not be imported at all until
 * somebody typed the taxonomy in by hand. Collected here, the same names
 * become proposals the reviewer accepts or rejects — and only then are they
 * created, together with the questions.
 *
 * <p>Two misses are NOT collected, because neither can be created: an id
 * that does not exist (nothing says what to call it) and a name that matches
 * several MQTs (nothing says which was meant). Those stay errors, as before.
 *
 * @param unresolved filled in as a side effect: key → the sheet rows using it
 */
export function collectingResolver(
  choices: MqtChoice[],
  unresolved: Map<string, Set<number>>,
): MqtKeyResolver {
  return (key, where, errors) => {
    const hit = lookupKey(key, choices);
    if (hit.kind === 'found') return hit.id;
    if (hit.kind === 'unknown') {
      // "Row 7 option3Scores" — the row is what makes this a question count
      // rather than a cell count.
      const row = Number(/^Row (\d+)/.exec(where)?.[1] ?? 0);
      const rows = unresolved.get(key) ?? new Set<number>();
      rows.add(row);
      unresolved.set(key, rows);
      return null;
    }
    errors.push(keyProblem(where, key, hit));
    return null;
  };
}

/** Collected keys, as the path resolver endpoint wants them. */
export function unresolvedCounts(
  unresolved: Map<string, Set<number>>,
): { pathKey: string; questionCount: number }[] {
  return [...unresolved.entries()].map(([pathKey, rows]) => ({ pathKey, questionCount: rows.size }));
}

/**
 * The SECOND pass, once the reviewer has said what the unknown names are:
 * what exists still resolves as it always did, and what does not comes from
 * the plan — an id to use, a negative ref for something about to be created,
 * or null for a name deliberately left unmapped.
 */
export function planAwareResolver(
  choices: MqtChoice[],
  keyToId: Map<string, number | null>,
): MqtKeyResolver {
  return (key, where, errors) => {
    const hit = lookupKey(key, choices);
    if (hit.kind === 'found') return hit.id;
    if (keyToId.has(key)) return keyToId.get(key) ?? null;
    errors.push(keyProblem(where, key, hit));
    return null;
  };
}

/**
 * A score cell's entries. `|` and `,` both separate them: "A:4, B:2" is two
 * scores, exactly like "A:4 | B:2" — the comma is what people type.
 *
 * <p>A comma piece with no `:` cannot be a score on its own, so it is the
 * front of a quality NAME that has a comma in it — "Quality, Testing &
 * Operations:1" — and is joined back onto the piece after it. Joined with the
 * cell's own text, not a normalised ", ": the AI route's plan keys on the name
 * exactly as the sheet spelled it. Only a trailing piece with no `:` is left
 * to fail as "not name:score".
 *
 * <p>A DECIMAL comma — "A: 0,5", a digit, a comma, then nothing but digits —
 * is what a spreadsheet in a comma-decimal locale writes, and it is
 * ambiguous: 0.5, or a score of 0 and a stray "5". It is never guessed. That
 * one entry is SKIPPED with a warning and the question imports without it —
 * one unreadable score is no reason to refuse ninety questions, and a missing
 * score shows on the question afterwards, where a guessed one would not.
 */
function scoreEntries(raw: string, where: string, warnings: string[]): string[] {
  const out: string[] = [];
  for (const group of raw.split('|')) {
    const pieces = group.split(',');
    let name = ''; // the front of a comma-containing name, untrimmed
    for (let i = 0; i < pieces.length; i++) {
      const joined = name ? `${name},${pieces[i]}` : pieces[i];
      const piece = joined.trim();
      if (!piece) continue;
      if (!piece.includes(':') && i < pieces.length - 1) {
        name = joined;
        continue;
      }
      name = '';
      const next = (pieces[i + 1] ?? '').trim();
      if (piece.includes(':') && /\d$/.test(piece) && /^\d+$/.test(next)) {
        warnings.push(`${where}: "${piece},${next}" skipped — a comma separates scores, so it is not `
          + `read as ${piece}.${next}. The question imports without it; if that was meant, add the score `
          + 'on the question after import');
        i++;
        continue;
      }
      out.push(piece);
    }
  }
  return out;
}

/**
 * "Extraversion:3 | 14:0.5, Grit:1" → payload entries, appending problems to
 * errors.
 *
 * Scores are decimal: a cell may weight an option at 0.25 as readily as 3.
 * Rounded to the 2 decimals the backend stores — NOT truncated, which is what
 * this did while the column was an int and would silently upload 0.75 as 0.
 */
function parseScoreCell(
  raw: string,
  where: string,
  resolve: MqtKeyResolver,
  errors: string[],
  warnings: string[],
): MqtScorePayload[] {
  const out: MqtScorePayload[] = [];
  for (const part of scoreEntries(raw, where, warnings)) {
    const sep = part.lastIndexOf(':');
    if (sep < 0) {
      errors.push(`${where}: "${part}" is not name:score`);
      continue;
    }
    const key = part.slice(0, sep).trim();
    const score = Number(part.slice(sep + 1).trim());
    if (!Number.isFinite(score)) { errors.push(`${where}: score in "${part}" is not a number`); continue; }
    const id = resolve(key, where, errors);
    if (id != null) out.push({ measuredQualityTypeId: id, score: Math.round(score * 100) / 100 });
  }
  return out;
}

export interface ParsedQuestions {
  payloads: QuestionPayload[];
  sections: (string | null)[];
  rowNos: number[];
  errors: string[];
  /**
   * Problems that do NOT block the import, each naming its row like an error
   * does: a score that was skipped rather than guessed at. The question still
   * imports; the author fixes the score on it afterwards.
   */
  warnings: string[];
  /**
   * Headers this template does not know, as the sheet spells them. Ignored by
   * the import — a warning, not an error — but named, because a misspelt
   * `option1` or `scores` is otherwise a question silently missing its
   * answers or its scoring.
   */
  unknownColumns: string[];
}

/** The template's own columns, after the case/space/_/- folding every header gets. */
const KNOWN_COLUMNS = new Set([
  'stem', 'description', 'type', 'mediaurl', 'risk', 'shuffle',
  'selectrule', 'selectcount', 'otheroption', 'section', 'scores',
]);
const OPTION_COLUMN = /^option\d+(description|scores)?$/;

const foldHeader = (header: string) => header.toLowerCase().replace(/[\s_-]/g, '');

/**
 * Headers no rule reads. A header-less column that holds data comes back from
 * the reader as `__EMPTY…`; it is reported as unnamed, and dropped entirely
 * when it holds nothing (a stray formatted cell, not a column).
 */
function unknownColumnsOf(rawRows: Record<string, unknown>[]): string[] {
  const headers = new Set<string>();
  for (const r of rawRows) Object.keys(r).forEach((k) => headers.add(k));
  const out: string[] = [];
  for (const header of headers) {
    if (header.startsWith('__EMPTY')) {
      const used = rawRows.some((r) => String(r[header] ?? '').trim() !== '');
      if (used && !out.includes('(a column with no header)')) out.push('(a column with no header)');
      continue;
    }
    const folded = foldHeader(header);
    if (!KNOWN_COLUMNS.has(folded) && !OPTION_COLUMN.test(folded)) out.push(header);
  }
  return out;
}

/**
 * Does the sheet have any `option1…N` column at all? A sheet with a `stem`
 * column and none of these is the template's shape in name only — its
 * answers are somewhere the template cannot see, which is the AI route's job.
 */
export function hasOptionColumns(rawRows: Record<string, unknown>[]): boolean {
  return rawRows.some((r) => Object.keys(r).some((k) => /^option\d+$/.test(foldHeader(k))));
}

/**
 * "Row 2: X", "Row 3: X" … "Row 43: X" → "Rows 2–43: X". One problem in forty
 * rows is one problem, and reading it forty times buries every other one.
 * A message that names no row passes through untouched, in its place.
 */
export function groupRowErrors(errors: string[]): string[] {
  const order: string[] = [];
  const rowsByRest = new Map<string, number[]>();
  const loose = new Map<string, string>();
  errors.forEach((e, i) => {
    const m = /^Row (\d+)([\s\S]*)$/.exec(e);
    if (!m) {
      const key = `#${i}`;
      loose.set(key, e);
      order.push(key);
      return;
    }
    const rest = m[2];
    if (!rowsByRest.has(rest)) {
      rowsByRest.set(rest, []);
      order.push(rest);
    }
    rowsByRest.get(rest)!.push(Number(m[1]));
  });
  return order.map((key) => {
    const plain = loose.get(key);
    if (plain != null) return plain;
    const rows = [...new Set(rowsByRest.get(key)!)].sort((a, b) => a - b);
    if (rows.length === 1) return `Row ${rows[0]}${key}`;
    const ranges: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
      ranges.push(j === i ? String(rows[i]) : `${rows[i]}–${rows[j]}`);
      i = j;
    }
    return `Rows ${ranges.join(', ')}${ranges.length > 1 ? ` (${rows.length} rows)` : ''}${key}`;
  });
}

/** One sheet row's warnings, for the review card of that question. */
export function warningsForRow(warnings: string[], rowNo: number | undefined): string[] {
  return rowNo == null ? [] : warnings.filter((w) => w.startsWith(`Row ${rowNo} `));
}

/**
 * A leading item number, as sheets write them: "1. ", "12) ", "(3) ", "Q4: ",
 * "1.) ". Needs whitespace after the mark, so "2.5 hours" and "1-2 times"
 * keep their digits. Mirrors StemMatcher.LEADING_ITEM_NUMBER on the backend,
 * which ignores the same prefix when looking for a stem already in the bank.
 */
export const LEADING_ITEM_NUMBER = /^\s*(?:q\s*)?\(?\d{1,3}\s*[.):]\)?\s+/i;

/** The stem without its leading item number — unchanged if that would leave nothing. */
export function stripItemNumber(stem: string): string {
  const stripped = stem.replace(LEADING_ITEM_NUMBER, '').trim();
  return stripped || stem;
}

/**
 * Is this our template, or somebody else's sheet?
 *
 * A `stem` column is the whole test, and the question being asked is
 * deliberately narrow: NOT "will this import cleanly" but "is this the format
 * at all". A sheet of ours with bad rows is fixed IN the sheet — the red error
 * box — and must never be routed to the AI mapper, which would turn a fixable
 * typo into a re-interpretation. Only a sheet with rows and no `stem` column
 * is a foreign format.
 */
export function looksLikeOurTemplate(rawRows: Record<string, unknown>[]): boolean {
  return rawRows.some((r) =>
    Object.keys(r).some((k) => k.toLowerCase().replace(/[\s_-]/g, '') === 'stem'));
}

/**
 * Rows → payloads. THE validator, for both upload paths: the template upload
 * below and the AI import, which differs only in how a score-cell key becomes
 * an MQT id (`resolve`). Anything else that ever diverges between the two is a
 * bug, not a feature.
 */
export function parseQuestionRows(
  rawRows: Record<string, unknown>[],
  choices: MqtChoice[],
  resolve?: MqtKeyResolver,
): ParsedQuestions {
  const resolveMqt = resolve ?? mqtKeyResolver(choices);
  const payloads: QuestionPayload[] = [];
  // sections[i]/rowNos[i] belong to payloads[i] — the raw section cell
  // (matched or ignored by the caller depending on where the upload
  // happens) and the sheet row it came from, for error messages.
  const sections: (string | null)[] = [];
  const rowNos: number[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  rawRows.forEach((r, i) => {
    const rowNo = i + 2; // sheet row: 1 is the header
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      row[k.toLowerCase().replace(/[\s_-]/g, '')] = String(v ?? '').trim();
    }
    if (!Object.values(row).some(Boolean)) return; // fully blank row

    const stem = row.stem || '';
    if (!stem) { errors.push(`Row ${rowNo}: stem is required`); return; }
    const typeRaw = (row.type || 'TEXT').toUpperCase();
    if (!['TEXT', 'IMAGE', 'VIDEO', 'URL'].includes(typeRaw)) {
      errors.push(`Row ${rowNo}: type "${row.type}" is not TEXT/IMAGE/VIDEO/URL`);
      return;
    }
    const type = typeRaw as QuestionContentType;
    const mediaUrl = row.mediaurl || '';
    if (type !== 'TEXT' && !mediaUrl) {
      errors.push(`Row ${rowNo}: a ${type.toLowerCase()} question needs mediaUrl`);
      return;
    }
    const riskFlag = ['1', 'true', 'yes', 'y'].includes((row.risk || '').toLowerCase());
    // Blank = false = the authored order, which is what every sheet written
    // before this column existed means. Read exactly like `risk`, so the two
    // yes/no columns behave the same.
    const shuffleOptions = ['1', 'true', 'yes', 'y'].includes((row.shuffle || '').toLowerCase());
    const mqtScores = parseScoreCell(row.scores || '', `Row ${rowNo} scores`, resolveMqt, errors, warnings);

    const optionNums = Object.keys(row)
      .map((k) => k.match(/^option(\d+)$/))
      .filter((m): m is RegExpMatchArray => m != null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    const options: QuestionOptionPayload[] = [];
    const optionByNumber = new Map<number, QuestionOptionPayload>();
    for (const n of optionNums) {
      const text = row[`option${n}`] || '';
      if (!text) continue; // empty option cell — fine, sheet just has spare columns
      const option: QuestionOptionPayload = {
        optionText: text,
        // optionNDescription, beside optionNScores. Blank = none, so every
        // sheet written before the column existed imports unchanged.
        description: row[`option${n}description`] || null,
        contentType: 'TEXT',
        mediaUrl: null,
        mqtScores: parseScoreCell(
          row[`option${n}scores`] || '', `Row ${rowNo} option${n}Scores`, resolveMqt, errors, warnings),
      };
      options.push(option);
      optionByNumber.set(n, option);
    }
    // Every placed question is mandatory, so one with nothing to pick would
    // stop every respondent at it. Mirrors QuestionController.validateType.
    if (options.length === 0) {
      errors.push(`Row ${rowNo}: no options — a question needs at least one (fill in option1, option2, …)`);
      return;
    }
    // otherOption = the NUMBER of the option that is the "Other…" row — the
    // one respondents type into. Its label, description and scores are that
    // optionN's own columns, so the sheet stays optionN-shaped and "at most
    // one per question" is what a single cell can say. Blank = none, which is
    // what every sheet written before the column existed means.
    const otherRaw = row.otheroption || '';
    if (otherRaw) {
      const n = Number(otherRaw);
      const other = Number.isInteger(n) ? optionByNumber.get(n) : undefined;
      if (!other) {
        errors.push(`Row ${rowNo}: otherOption "${otherRaw}" must be the number of a filled option column (option1…N)`);
      } else {
        other.contentType = 'FREE_TEXT';
      }
    }

    // After the option loop on purpose: the count is validated against the
    // options this row actually carries.
    const selection = parseSelection(row, options.length, rowNo, errors);

    payloads.push({
      contentType: type,
      // The sheet writes MCQs only. A linear scale has no option columns to
      // fill in and a grid has no flat-row shape at all, so both are authored
      // in the form; every sheet ever written already means MCQ.
      questionType: 'MCQ',
      stem,
      // Optional help text under the stem. Blank = none, so old sheets are
      // unaffected; there is nothing to validate — any text is acceptable.
      description: row.description || null,
      mediaUrl: type === 'TEXT' ? null : mediaUrl,
      riskFlag,
      shuffleOptions,
      ...selection,
      scaleFrom: null,
      scaleTo: null,
      scaleLowLabel: null,
      scaleHighLabel: null,
      options,
      rows: [],
      mqtScores,
      // MCQs only, so never a game — a game question is made in the form —
      // and never a short answer's format.
      gameId: null,
      answerFormat: null,
    });
    sections.push(row.section || null);
    rowNos.push(rowNo);
  });

  if (payloads.length === 0 && errors.length === 0) errors.push('No data rows found in the sheet');
  return { payloads, sections, rowNos, errors, warnings, unknownColumns: unknownColumnsOf(rawRows) };
}


/* ===================== sections ===================== */
// Inside a sectioned questionnaire each row's `section` cell is matched to one
// of its sections by name. A blank or unknown name used to refuse the whole
// sheet; now it is a question the author answers before anything is written:
// leave the row unassigned (the default — Step 2 places it), put it in a
// section, create the section, or copy the name down from the row above.
// Guessing is still never an option: nothing lands anywhere nobody chose.

/** One of the questionnaire's sections, as the upload sees it. */
export interface SectionRef {
  sectionId: number;
  name: string;
}

/** Where one row's section cell points, before anybody has chosen anything. */
export type SectionCell =
  | { kind: 'blank' }
  | { kind: 'matched'; sectionId: number }
  | { kind: 'unknown'; key: string; value: string }
  | { kind: 'ambiguous'; value: string; count: number };

/** Trimmed, case-insensitive — the same match the AI route makes. */
export function classifySectionCell(cell: string | null, sections: SectionRef[]): SectionCell {
  const value = (cell || '').trim();
  if (!value) return { kind: 'blank' };
  const key = value.toLowerCase();
  const hits = sections.filter((s) => s.name.trim().toLowerCase() === key);
  if (hits.length === 1) return { kind: 'matched', sectionId: hits[0].sectionId };
  if (hits.length > 1) return { kind: 'ambiguous', value, count: hits.length };
  return { kind: 'unknown', key, value };
}

/**
 * For each row, the nearest non-blank section cell ABOVE it — what "fill down"
 * copies. Worked out over the sheet's own order at parse time, so dropping a
 * row in review cannot change what the rows below it inherited.
 */
export function sectionCellsAbove(cells: (string | null)[]): (string | null)[] {
  let last: string | null = null;
  return cells.map((cell) => {
    const above = last;
    if ((cell || '').trim()) last = cell;
    return above;
  });
}

/**
 * What happens to rows whose section cell is blank: unassigned, copied down
 * from the row above, or one existing section for all of them. `off` — turn
 * the questionnaire's sections off — is offered only when EVERY row is blank.
 */
export type BlankSectionChoice = 'none' | 'fill' | 'off' | `id:${number}`;

/** What happens to a section name the questionnaire does not have. */
export type NameSectionChoice = 'none' | 'new' | `id:${number}`;

/** Where one row lands: an existing section, one about to be created (by name key), or unassigned. */
export type RowPlacement = { sectionId: number } | { createKey: string } | null;

export function placeRow(
  cell: string | null,
  above: string | null,
  sections: SectionRef[],
  blank: BlankSectionChoice,
  names: Record<string, NameSectionChoice>,
): RowPlacement {
  const byName = (c: SectionCell): RowPlacement => {
    if (c.kind === 'matched') return { sectionId: c.sectionId };
    if (c.kind === 'unknown') {
      const choice = names[c.key] ?? 'none';
      if (choice === 'new') return { createKey: c.key };
      if (choice.startsWith('id:')) return { sectionId: Number(choice.slice(3)) };
    }
    // Unassigned, or ambiguous — which is refused as an error upstream.
    return null;
  };
  const own = classifySectionCell(cell, sections);
  if (own.kind !== 'blank') return byName(own);
  if (blank === 'fill') return above == null ? null : byName(classifySectionCell(above, sections));
  if (blank.startsWith('id:')) return { sectionId: Number(blank.slice(3)) };
  return null;
}
