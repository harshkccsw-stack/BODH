import type { ReportColumn } from './reportRulesApi';

/**
 * Names for the references inside a rule — `[mqt:14]` read back as "Internal
 * Drive".
 *
 * A formula stores KEYS and must keep storing them: MQT names are deliberately
 * not unique, and a renamed trait would silently change what a stored name
 * meant. So nothing here rewrites a formula. It only says, beside the formula,
 * what each key is — which is the one thing a reviewer needs to check a
 * formula (theirs or the AI's) against the sentence it came from.
 *
 * Pure and free of `@/` imports, like column-tree.ts, so it can be run outside
 * the browser.
 */

/** What one reference resolves to on this assessment. */
export interface RefInfo {
  /** As written inside the brackets — `mqt:14`. */
  key: string;
  kind: 'column' | 'rule';
  /** Short name for inline display: "Internal Drive", "Drive score". */
  name: string;
  /**
   * Which of the look-alike score columns this is — "own score", "whole
   * branch", "MQ total" — or null where there is nothing to confuse it with.
   * `mqt:9` and `mqtt:9` differ by one letter and are different numbers; this
   * is where that difference becomes readable.
   */
  qualifier: string | null;
  /** The full path and the key, for a tooltip. */
  title: string;
  /** False when nothing on this assessment answers the key. */
  known: boolean;
}

export type RefResolver = (key: string) => RefInfo;

/** A rule as far as naming it is concerned. */
export interface NamedRule {
  slug: string;
  name: string;
}

const RULE_PREFIX = 'rule:';

/**
 * The families a reference can name. Used to tell `[mqt:14]` in plain text
 * from an ordinary bracketed aside like "[reverse keyed]" — only the first is
 * a reference.
 */
const REF_PREFIX = /^(?:core|demo|ans|mqt|mqtt|mq|rule):\S/;

/**
 * Build the resolver for one assessment's columns and the rules a formula may
 * read. Rebuild it whenever either list changes.
 */
export function buildRefResolver(columns: ReportColumn[], rules: NamedRule[]): RefResolver {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const ruleBySlug = new Map(rules.map((r) => [r.slug, r]));

  // A node name shared by two own-score columns cannot stand alone — two
  // "Verbal" chips would read identically. Those get their parent in front.
  const nameCount = new Map<string, number>();
  for (const c of columns) {
    if (c.score?.role !== 'own' || !c.score.nodeName) continue;
    const n = c.score.nodeName.trim().toLowerCase();
    nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  // Every key with a subtree column has children, so its own score is the
  // look-alike of that total and gets labelled as such.
  const hasBranch = new Set(
    columns.filter((c) => c.score?.role === 'subtree').map((c) => idOf(c.key)),
  );

  const scoreName = (c: ReportColumn): string => {
    const s = c.score!;
    const base = s.nodeName || c.label;
    if ((nameCount.get(base.trim().toLowerCase()) ?? 0) < 2) return base;
    const parent = s.parentKey ? byKey.get(s.parentKey)?.score?.nodeName : null;
    const front = parent || s.mqName;
    return front ? `${front} › ${base}` : base;
  };

  return (key: string): RefInfo => {
    if (key.startsWith(RULE_PREFIX)) {
      const slug = key.slice(RULE_PREFIX.length);
      const rule = ruleBySlug.get(slug);
      return rule
        ? { key, kind: 'rule', name: rule.name, qualifier: 'rule', title: `Rule “${rule.name}” — ${key}`, known: true }
        : { key, kind: 'rule', name: key, qualifier: null, title: `No active rule has the slug “${slug}”`, known: false };
    }

    const c = byKey.get(key);
    if (!c) {
      return { key, kind: 'column', name: key, qualifier: null, title: 'This assessment has no column with this key', known: false };
    }
    const title = `${c.label} — ${key}`;
    const s = c.score;
    if (s?.role === 'mqTotal') {
      return { key, kind: 'column', name: s.mqName || s.nodeName || c.label, qualifier: 'MQ total', title, known: true };
    }
    if (s?.role === 'subtree') {
      return { key, kind: 'column', name: scoreName(c), qualifier: 'whole branch', title, known: true };
    }
    if (s?.role === 'own') {
      return {
        key, kind: 'column', name: scoreName(c),
        qualifier: hasBranch.has(idOf(key)) ? 'own score' : null,
        title, known: true,
      };
    }
    // Answers are labelled by their question tag alone, so say what they are.
    return {
      key, kind: 'column', name: c.label,
      qualifier: c.group === 'answers' ? 'answer' : null,
      title, known: true,
    };
  };
}

/** The id half of a key — `mqt:14` and `mqtt:14` share it. */
const idOf = (key: string) => key.slice(key.indexOf(':') + 1);

/** A formula or a sentence, cut into plain text and references. */
export type Segment =
  | { type: 'text'; text: string }
  | { type: 'ref'; key: string; raw: string };

const KEYWORDS = new Set(['AND', 'OR', 'NOT', 'BY']);
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c) || (c.length === 1 && c.toLowerCase() !== c.toUpperCase());
const isIdentPart = (c: string) => isIdentStart(c) || /[0-9:]/.test(c);

/**
 * Cut a FORMULA the way the server's lexer reads it (ExpressionService.Lexer):
 * a bracket is always a reference, a bare identifier is a reference unless it
 * is a keyword or a function name, and nothing inside a string literal is
 * either — `'see [mqt:14]'` is text the formula prints.
 */
export function formulaSegments(formula: string): Segment[] {
  const out: Segment[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };

  let i = 0;
  while (i < formula.length) {
    const c = formula[i];
    if (c === '"' || c === '\'') {
      const end = formula.indexOf(c, i + 1);
      const stop = end === -1 ? formula.length : end + 1;
      text += formula.slice(i, stop);
      i = stop;
      continue;
    }
    if (c === '[') {
      const end = formula.indexOf(']', i + 1);
      if (end === -1 || end === i + 1) {
        text += formula.slice(i);
        break;
      }
      flush();
      out.push({ type: 'ref', key: formula.slice(i + 1, end), raw: formula.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    // A number, digits first — so the "e" or ":" after one is never mistaken
    // for the start of an identifier.
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula[j])) j++;
      text += formula.slice(i, j);
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < formula.length && isIdentPart(formula[j])) j++;
      const word = formula.slice(i, j);
      let k = j;
      while (k < formula.length && /\s/.test(formula[k])) k++;
      const isCall = formula[k] === '(';
      if (isCall || KEYWORDS.has(word.toUpperCase())) {
        text += word;
      } else {
        flush();
        out.push({ type: 'ref', key: word, raw: word });
      }
      i = j;
      continue;
    }
    text += c;
    i++;
  }
  flush();
  return out;
}

/**
 * Cut PLAIN-LANGUAGE text: only a bracket that starts with a column family or
 * `rule:` is a reference. A sheet's own "[reverse keyed]" stays prose.
 */
export function statementSegments(statement: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[([^\]\n]+)\]/g;
  let last = 0;
  for (let m = re.exec(statement); m; m = re.exec(statement)) {
    if (!REF_PREFIX.test(m[1])) continue;
    if (m.index > last) out.push({ type: 'text', text: statement.slice(last, m.index) });
    out.push({ type: 'ref', key: m[1], raw: m[0] });
    last = m.index + m[0].length;
  }
  if (last < statement.length) out.push({ type: 'text', text: statement.slice(last) });
  return out;
}

/** Each distinct key referenced, in first-seen order. */
export function distinctRefs(segments: Segment[]): string[] {
  const seen: string[] = [];
  for (const s of segments) {
    if (s.type === 'ref' && !seen.includes(s.key)) seen.push(s.key);
  }
  return seen;
}

/**
 * What a picker click puts into plain-language text: the name a reader
 * understands, then the key that makes it unambiguous — "Execution (whole
 * branch) [mqtt:9]". When the key already carries the name (an answer's tag),
 * the key alone.
 */
export function namedToken(info: RefInfo): string {
  const token = `[${info.key}]`;
  if (!info.known || token.includes(info.name)) return token;
  const phrase = info.qualifier && info.kind !== 'rule'
    ? `${info.name} (${info.qualifier})`
    : info.name;
  return `${phrase} ${token}`;
}
