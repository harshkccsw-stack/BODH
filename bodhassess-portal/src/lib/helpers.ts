// Date helpers used by the respondent flow. Copied verbatim from the admin
// app so behaviour matches exactly. All locale-independent.

// DD/MM/YYYY — accepts Date, ISO string, or epoch ms. '' for invalid input.
export function formatDDMMYYYY(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Convert a user-entered DD/MM/YYYY string to the ISO YYYY-MM-DD wire format
// the API expects. '' for anything that isn't a valid calendar date.
export function ddmmyyyyToIso(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = String(input).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return '';
  const test = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  if (test.getFullYear() !== y || test.getMonth() + 1 !== mo || test.getDate() !== d) return '';
  return `${yyyy}-${mm}-${dd}`;
}

// Auto-format a DD/MM/YYYY input as the user types: strip non-digits, insert
// '/' after the day and month. Caps at 10 chars (8 digits + 2 slashes).
export function autoFormatDdmmyyyy(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// DD/MM/YYYY HH:mm — same as formatDDMMYYYY with a 24-hour time appended.
export function formatDDMMYYYYTime(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mins}`;
}

// ── Birth-date bounds ──────────────────────────────────────────────────────
// A date that can actually be someone's birthday: 1900-01-01 up to and
// including today. Mirrors the backend's @BirthDate constraint.
//
// Deliberately a SEPARATE check rather than a tightening of ddmmyyyyToIso:
// that function also parses the dob typed at LOGIN, where dob is the password
// and whatever is already stored has to keep working. An account created
// before this rule must still be able to sign in.
export const EARLIEST_BIRTH_DATE_ISO = '1900-01-01';

export const BIRTH_DATE_ERROR =
  'Date of birth must be a real date between 01/01/1900 and today';

// Takes the ISO 'YYYY-MM-DD' that ddmmyyyyToIso produces. ISO dates compare
// lexicographically in calendar order, so plain string comparison is correct
// here and sidesteps timezone questions entirely.
export function isBirthDateInRange(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return iso >= EARLIEST_BIRTH_DATE_ISO && iso <= todayIso;
}
