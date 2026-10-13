/**
 * Person-name rule, shared by every form that creates or edits a respondent or
 * a practitioner (2026-10-13).
 *
 * Allowed: letters of ANY script, combining marks, spaces, apostrophes (' and
 * the ’ a phone keyboard types), hyphens and full stops — and at least one
 * letter. Marks and the zero-width joiners matter: Devanagari vowel signs are
 * marks and Indic half-forms need ZWJ/ZWNJ.
 *
 * Mirrors NameRules on the backend WORD FOR WORD, so the form and the server's
 * 400 never disagree. This file is duplicated verbatim between bodhassess-app
 * and bodhassess-portal — separate packages, no shared module, like phone.ts.
 * Change one, change the other, and change NameRules with them.
 */

/** The `name` column on both profile tables is varchar(255). */
export const NAME_MAX_LENGTH = 255;

export const NAME_TOO_LONG_MESSAGE = `Name cannot be longer than ${NAME_MAX_LENGTH} characters`;

export const NAME_NO_LETTER_MESSAGE = 'Name must contain at least one letter';

const ALLOWED_SUFFIX =
  " — only letters, spaces, apostrophes ('), hyphens (-) and full stops (.) are allowed";

/** Beyond this, the list ends in "or others" rather than growing. */
const MAX_LISTED = 5;

const ALLOWED_PUNCTUATION = " .'’-‌‍";
const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const INVISIBLE = /[\p{Z}\p{C}]/u;

/** A refused character as the message names it — invisible ones in words. */
function describe(ch: string): string {
  if (ch === '\t') return 'a tab';
  if (ch === '\n' || ch === '\r') return 'a line break';
  if (INVISIBLE.test(ch)) return 'an invisible character';
  return `"${ch}"`;
}

/** "A", "A or B", "A, B or C", and past MAX_LISTED "… or others". */
function listed(items: string[]): string {
  const shown = items.slice(0, MAX_LISTED);
  if (items.length > MAX_LISTED) shown.push('others');
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}`;
}

/**
 * Null when the name's characters are fine, otherwise the message to show.
 * Checks the TRIMMED value. Blank is null too — "Name is required" is each
 * form's own check.
 */
export function nameCharacterProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const refused: string[] = [];
  let hasLetter = false;
  // for..of walks code points, so an emoji is one character, as in Java.
  for (const ch of trimmed) {
    if (LETTER.test(ch)) {
      hasLetter = true;
    } else if (!MARK.test(ch) && !ALLOWED_PUNCTUATION.includes(ch)) {
      const described = describe(ch);
      if (!refused.includes(described)) refused.push(described);
    }
  }
  if (refused.length) return `Name cannot contain ${listed(refused)}${ALLOWED_SUFFIX}`;
  return hasLetter ? null : NAME_NO_LETTER_MESSAGE;
}

/**
 * The full check a respondent form runs after "required": length against the
 * column, then characters. A practitioner form caps at 20 with `maxLength`
 * and calls nameCharacterProblem directly.
 */
export function nameProblem(name: string): string | null {
  if (name.trim().length > NAME_MAX_LENGTH) return NAME_TOO_LONG_MESSAGE;
  return nameCharacterProblem(name);
}
