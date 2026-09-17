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
export function mqtKeyResolver(choices: MqtChoice[]): MqtKeyResolver {
  return (key, where, errors) => {
    if (/^\d+$/.test(key)) {
      const id = Number(key);
      if (!choices.some((c) => c.id === id)) { errors.push(`${where}: no MQT with id ${id}`); return null; }
      return id;
    }
    if (key.includes(PATH_MARK)) {
      const want = normalisePath(key);
      const hits = choices.filter((c) => normalisePath(c.label) === want);
      if (hits.length === 0) {
        errors.push(`${where}: no measured quality type at "${key}"`);
        return null;
      }
      if (hits.length > 1) {
        errors.push(`${where}: "${key}" matches ${hits.length} MQTs — use the id instead`);
        return null;
      }
      return hits[0].id;
    }
    const matches = choices.filter((c) => c.name.toLowerCase() === key.toLowerCase());
    if (matches.length === 0) { errors.push(`${where}: no MQT named "${key}"`); return null; }
    if (matches.length > 1) { errors.push(`${where}: "${key}" matches ${matches.length} MQTs — use the id instead`); return null; }
    return matches[0].id;
  };
}

/**
 * "Extraversion:3 | 14:0.5" → payload entries, appending problems to errors.
 *
 * Scores are decimal: a cell may weight an option at 0.25 as readily as 3.
 * Rounded to the 2 decimals the backend stores — NOT truncated, which is what
 * this did while the column was an int and would silently upload 0.75 as 0.
 */
function parseScoreCell(raw: string, where: string, resolve: MqtKeyResolver, errors: string[]): MqtScorePayload[] {
  const out: MqtScorePayload[] = [];
  for (const part of raw.split('|').map((p) => p.trim()).filter(Boolean)) {
    const sep = part.lastIndexOf(':');
    if (sep < 0) { errors.push(`${where}: "${part}" is not name:score`); continue; }
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
    const mqtScores = parseScoreCell(row.scores || '', `Row ${rowNo} scores`, resolveMqt, errors);

    const optionNums = Object.keys(row)
      .map((k) => k.match(/^option(\d+)$/))
      .filter((m): m is RegExpMatchArray => m != null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
    const options: QuestionOptionPayload[] = [];
    for (const n of optionNums) {
      const text = row[`option${n}`] || '';
      if (!text) continue; // empty option cell — fine, sheet just has spare columns
      options.push({
        optionText: text,
        // optionNDescription, beside optionNScores. Blank = none, so every
        // sheet written before the column existed imports unchanged.
        description: row[`option${n}description`] || null,
        contentType: 'TEXT',
        mediaUrl: null,
        mqtScores: parseScoreCell(row[`option${n}scores`] || '', `Row ${rowNo} option${n}Scores`, resolveMqt, errors),
      });
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
    });
    sections.push(row.section || null);
    rowNos.push(rowNo);
  });

  if (payloads.length === 0 && errors.length === 0) errors.push('No data rows found in the sheet');
  return { payloads, sections, rowNos, errors };
}

