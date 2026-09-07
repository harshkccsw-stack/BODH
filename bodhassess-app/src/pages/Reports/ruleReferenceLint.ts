/**
 * The guidance prompt's rule references, checked as the author types.
 *
 * MIRRORS RuleReferenceLint.java — the backend runs the same two checks when a
 * computation is read or marked ready, so anything written through the API is
 * covered too. This copy exists to say it immediately rather than after a save.
 * Change one, change the other: a browser hint that disagrees with the warning
 * on the assembled prompt is worse than no hint.
 *
 * The prompt's job is to REFER to rules that the assembled prompt states in
 * full, and the slug is the join. Two ways for that join to be wrong:
 *
 *  - named but not selected — reads perfectly, and the definition is simply
 *    absent from the prompt, so the model is asked to apply logic it never got;
 *  - selected but never named — usually a leftover tick.
 *
 * The two directions match differently, on purpose:
 *
 *  - a dangling reference accuses the author of a mistake, so only an explicit
 *    `slug` in backticks counts — prose cannot trip it. Without that, the
 *    one-word slug `extraversion` matches the word inside another rule's NAME,
 *    and "fill from the Extraversion composite" is reported as naming a rule
 *    nobody named. The insert rail writes the backticks, so the miss this
 *    trades for (a bare slug goes unwarned) costs little;
 *  - "never named" must not nag, so any whole-token mention of the slug or the
 *    rule's name counts, backticks or not.
 *
 * A token matching no rule in the library is never reported either way: it is
 * almost certainly a value the report prints ("low", "average"), and a warning
 * that fires on ordinary prose is one people learn to ignore.
 */

export interface RuleRef {
  slug: string;
  name: string;
}

export interface ReferenceFindings {
  /** Slugs of real library rules the guidance names but did not select. */
  namedButNotSelected: string[];
  /** Names of selected rules the guidance never refers to. */
  selectedButNotNamed: string[];
}

const EMPTY: ReferenceFindings = { namedButNotSelected: [], selectedButNotNamed: [] };

const isTokenChar = (c: string) => c !== '' && /[a-z0-9-]/.test(c);

/**
 * Whole-token match, written by hand rather than with a lookbehind: the
 * boundary has to exclude '-' as well as letters and digits, or the rule
 * `extraversion` is found inside a mention of `extraversion-composite` and the
 * author is warned about a rule nobody named.
 */
export const mentions = (lowerText: string, lowerToken: string): boolean => {
  if (!lowerToken) return false;
  for (let i = lowerText.indexOf(lowerToken); i !== -1; i = lowerText.indexOf(lowerToken, i + 1)) {
    const before = i === 0 ? '' : lowerText[i - 1];
    const after = lowerText[i + lowerToken.length] ?? '';
    if (!isTokenChar(before) && !isTokenChar(after)) return true;
  }
  return false;
};

/**
 * Every `...` span, lowercased and trimmed. What an author put in backticks is
 * what they meant as an identifier.
 */
const backtickedTokens = (lowerText: string): Set<string> => {
  const out = new Set<string>();
  for (const m of lowerText.matchAll(/`([^`\n]+)`/g)) {
    const token = m[1].trim();
    if (token) out.add(token);
  }
  return out;
};

export const checkReferences = (
  prompt: string,
  selected: RuleRef[],
  librarySlugs: string[],
): ReferenceFindings => {
  if (!prompt.trim()) return EMPTY;
  const text = prompt.toLowerCase();
  const selectedSlugs = new Set(selected.map((r) => r.slug.toLowerCase()));

  const quoted = backtickedTokens(text);
  const namedButNotSelected = librarySlugs.filter(
    (slug) => slug && !selectedSlugs.has(slug.toLowerCase()) && quoted.has(slug.toLowerCase()),
  );

  // The name counts as a reference too: "the Extraversion composite" names the
  // rule as plainly as its slug does.
  const selectedButNotNamed = selected
    .filter((r) => !mentions(text, r.slug.toLowerCase()) && !mentions(text, r.name.toLowerCase()))
    .map((r) => r.name);

  return { namedButNotSelected, selectedButNotNamed };
};
