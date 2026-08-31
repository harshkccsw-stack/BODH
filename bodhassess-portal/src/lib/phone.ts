/**
 * Phone entry rules, shared by every form that creates or edits a respondent.
 *
 * A respondent's phone is TWO values following E.164, the ITU standard every
 * dialable international number obeys: a dial code picked from a list, and a
 * digits-only national number. Before 2026-08-31 it was one free-text field
 * checked by a loose pattern, which could not check anything meaningful because
 * it did not know the country. Picking the country is what removed that.
 *
 * These regexes mirror PhoneRules on the backend exactly. This file is
 * duplicated verbatim between bodhassess-app and bodhassess-portal — they are
 * separate packages with no shared module, the same way the old PHONE_RE was
 * duplicated. Change one, change the other, and change PhoneRules with them.
 */

export interface DialCode {
  /** ITU country calling code, '+' included — what is stored and sent. */
  code: string;
  country: string;
  /** ISO 3166-1 alpha-2, used only to derive the flag. */
  iso: string;
}

/**
 * ISO country code → flag emoji, by mapping each letter to its regional
 * indicator symbol.
 *
 * <p>Windows Chrome ships no flag glyphs and falls back to rendering the two
 * letters ("IN"), which is why the dial code is always shown BESIDE the flag
 * rather than the flag standing alone — the control stays readable either way.
 */
export function flagEmoji(iso: string): string {
  return String.fromCodePoint(
    ...iso
      .toUpperCase()
      .split('')
      .map((c) => 127397 + c.charCodeAt(0)),
  );
}

/** The entry for a stored code, for rendering what is currently picked. */
export function findDialCode(code: string): DialCode | undefined {
  return DIAL_CODES.find((d) => d.code === code);
}

/** Mirrors PhoneRules.COUNTRY_CODE_REGEX. */
export const COUNTRY_CODE_RE = /^\+[1-9][0-9]{0,2}$/;

/**
 * Mirrors PhoneRules.NATIONAL_NUMBER_REGEX. E.164 caps the whole number at 15
 * digits and the dial code takes one to three of them, leaving 14 here; 4 is a
 * sanity floor, below the shortest real national numbers in use.
 */
export const NATIONAL_NUMBER_RE = /^[0-9]{4,14}$/;

/** E.164's ceiling — dial code and national number counted together. */
export const E164_MAX_DIGITS = 15;

/** Word-for-word PhoneRules.NATIONAL_NUMBER_MESSAGE, so a client-side
 *  rejection and a server-side one read identically. */
export const PHONE_ERROR =
  'Enter a valid phone number — digits only, without the country code or a leading 0';

/** Mirrors PhoneRules.E164_MESSAGE. */
export const E164_ERROR =
  `Country code and phone number together cannot be more than ${E164_MAX_DIGITS} digits`;

/** The rule as resting hint text: what to type, and the two things people
 *  reliably include that do not belong in this field. */
export const PHONE_HINT =
  'Digits only — no spaces or brackets, and leave off the country code and any leading 0.';

/** Pre-selected on a blank form. A default beats an empty select: it is the
 *  right answer for most people here and a visible one to change for the rest. */
export const DEFAULT_DIAL_CODE = '+91';

/**
 * Alphabetical by country, which is how someone scans for their own. Several
 * codes appear twice (+1 for the US and Canada, +7 for Russia and Kazakhstan)
 * — that is the real world, and harmless: only the code is stored, and the two
 * countries sharing it agree about what it means.
 */
export const DIAL_CODES: DialCode[] = [
  { code: '+93', country: 'Afghanistan', iso: 'AF' },
  { code: '+355', country: 'Albania', iso: 'AL' },
  { code: '+213', country: 'Algeria', iso: 'DZ' },
  { code: '+54', country: 'Argentina', iso: 'AR' },
  { code: '+374', country: 'Armenia', iso: 'AM' },
  { code: '+61', country: 'Australia', iso: 'AU' },
  { code: '+43', country: 'Austria', iso: 'AT' },
  { code: '+994', country: 'Azerbaijan', iso: 'AZ' },
  { code: '+973', country: 'Bahrain', iso: 'BH' },
  { code: '+880', country: 'Bangladesh', iso: 'BD' },
  { code: '+375', country: 'Belarus', iso: 'BY' },
  { code: '+32', country: 'Belgium', iso: 'BE' },
  { code: '+975', country: 'Bhutan', iso: 'BT' },
  { code: '+591', country: 'Bolivia', iso: 'BO' },
  { code: '+387', country: 'Bosnia and Herzegovina', iso: 'BA' },
  { code: '+267', country: 'Botswana', iso: 'BW' },
  { code: '+55', country: 'Brazil', iso: 'BR' },
  { code: '+673', country: 'Brunei', iso: 'BN' },
  { code: '+359', country: 'Bulgaria', iso: 'BG' },
  { code: '+855', country: 'Cambodia', iso: 'KH' },
  { code: '+237', country: 'Cameroon', iso: 'CM' },
  { code: '+1', country: 'Canada', iso: 'CA' },
  { code: '+56', country: 'Chile', iso: 'CL' },
  { code: '+86', country: 'China', iso: 'CN' },
  { code: '+57', country: 'Colombia', iso: 'CO' },
  { code: '+506', country: 'Costa Rica', iso: 'CR' },
  { code: '+385', country: 'Croatia', iso: 'HR' },
  { code: '+53', country: 'Cuba', iso: 'CU' },
  { code: '+357', country: 'Cyprus', iso: 'CY' },
  { code: '+420', country: 'Czechia', iso: 'CZ' },
  { code: '+45', country: 'Denmark', iso: 'DK' },
  { code: '+593', country: 'Ecuador', iso: 'EC' },
  { code: '+20', country: 'Egypt', iso: 'EG' },
  { code: '+503', country: 'El Salvador', iso: 'SV' },
  { code: '+372', country: 'Estonia', iso: 'EE' },
  { code: '+251', country: 'Ethiopia', iso: 'ET' },
  { code: '+679', country: 'Fiji', iso: 'FJ' },
  { code: '+358', country: 'Finland', iso: 'FI' },
  { code: '+33', country: 'France', iso: 'FR' },
  { code: '+995', country: 'Georgia', iso: 'GE' },
  { code: '+49', country: 'Germany', iso: 'DE' },
  { code: '+233', country: 'Ghana', iso: 'GH' },
  { code: '+30', country: 'Greece', iso: 'GR' },
  { code: '+502', country: 'Guatemala', iso: 'GT' },
  { code: '+504', country: 'Honduras', iso: 'HN' },
  { code: '+852', country: 'Hong Kong', iso: 'HK' },
  { code: '+36', country: 'Hungary', iso: 'HU' },
  { code: '+354', country: 'Iceland', iso: 'IS' },
  { code: '+91', country: 'India', iso: 'IN' },
  { code: '+62', country: 'Indonesia', iso: 'ID' },
  { code: '+98', country: 'Iran', iso: 'IR' },
  { code: '+964', country: 'Iraq', iso: 'IQ' },
  { code: '+353', country: 'Ireland', iso: 'IE' },
  { code: '+972', country: 'Israel', iso: 'IL' },
  { code: '+39', country: 'Italy', iso: 'IT' },
  { code: '+81', country: 'Japan', iso: 'JP' },
  { code: '+962', country: 'Jordan', iso: 'JO' },
  { code: '+7', country: 'Kazakhstan', iso: 'KZ' },
  { code: '+254', country: 'Kenya', iso: 'KE' },
  { code: '+965', country: 'Kuwait', iso: 'KW' },
  { code: '+996', country: 'Kyrgyzstan', iso: 'KG' },
  { code: '+856', country: 'Laos', iso: 'LA' },
  { code: '+371', country: 'Latvia', iso: 'LV' },
  { code: '+961', country: 'Lebanon', iso: 'LB' },
  { code: '+218', country: 'Libya', iso: 'LY' },
  { code: '+370', country: 'Lithuania', iso: 'LT' },
  { code: '+352', country: 'Luxembourg', iso: 'LU' },
  { code: '+853', country: 'Macau', iso: 'MO' },
  { code: '+261', country: 'Madagascar', iso: 'MG' },
  { code: '+265', country: 'Malawi', iso: 'MW' },
  { code: '+60', country: 'Malaysia', iso: 'MY' },
  { code: '+960', country: 'Maldives', iso: 'MV' },
  { code: '+223', country: 'Mali', iso: 'ML' },
  { code: '+356', country: 'Malta', iso: 'MT' },
  { code: '+230', country: 'Mauritius', iso: 'MU' },
  { code: '+52', country: 'Mexico', iso: 'MX' },
  { code: '+373', country: 'Moldova', iso: 'MD' },
  { code: '+377', country: 'Monaco', iso: 'MC' },
  { code: '+976', country: 'Mongolia', iso: 'MN' },
  { code: '+382', country: 'Montenegro', iso: 'ME' },
  { code: '+212', country: 'Morocco', iso: 'MA' },
  { code: '+258', country: 'Mozambique', iso: 'MZ' },
  { code: '+95', country: 'Myanmar', iso: 'MM' },
  { code: '+264', country: 'Namibia', iso: 'NA' },
  { code: '+977', country: 'Nepal', iso: 'NP' },
  { code: '+31', country: 'Netherlands', iso: 'NL' },
  { code: '+64', country: 'New Zealand', iso: 'NZ' },
  { code: '+505', country: 'Nicaragua', iso: 'NI' },
  { code: '+234', country: 'Nigeria', iso: 'NG' },
  { code: '+389', country: 'North Macedonia', iso: 'MK' },
  { code: '+47', country: 'Norway', iso: 'NO' },
  { code: '+968', country: 'Oman', iso: 'OM' },
  { code: '+92', country: 'Pakistan', iso: 'PK' },
  { code: '+970', country: 'Palestine', iso: 'PS' },
  { code: '+507', country: 'Panama', iso: 'PA' },
  { code: '+675', country: 'Papua New Guinea', iso: 'PG' },
  { code: '+595', country: 'Paraguay', iso: 'PY' },
  { code: '+51', country: 'Peru', iso: 'PE' },
  { code: '+63', country: 'Philippines', iso: 'PH' },
  { code: '+48', country: 'Poland', iso: 'PL' },
  { code: '+351', country: 'Portugal', iso: 'PT' },
  { code: '+974', country: 'Qatar', iso: 'QA' },
  { code: '+40', country: 'Romania', iso: 'RO' },
  { code: '+7', country: 'Russia', iso: 'RU' },
  { code: '+250', country: 'Rwanda', iso: 'RW' },
  { code: '+966', country: 'Saudi Arabia', iso: 'SA' },
  { code: '+221', country: 'Senegal', iso: 'SN' },
  { code: '+381', country: 'Serbia', iso: 'RS' },
  { code: '+65', country: 'Singapore', iso: 'SG' },
  { code: '+421', country: 'Slovakia', iso: 'SK' },
  { code: '+386', country: 'Slovenia', iso: 'SI' },
  { code: '+252', country: 'Somalia', iso: 'SO' },
  { code: '+27', country: 'South Africa', iso: 'ZA' },
  { code: '+82', country: 'South Korea', iso: 'KR' },
  { code: '+34', country: 'Spain', iso: 'ES' },
  { code: '+94', country: 'Sri Lanka', iso: 'LK' },
  { code: '+249', country: 'Sudan', iso: 'SD' },
  { code: '+46', country: 'Sweden', iso: 'SE' },
  { code: '+41', country: 'Switzerland', iso: 'CH' },
  { code: '+963', country: 'Syria', iso: 'SY' },
  { code: '+886', country: 'Taiwan', iso: 'TW' },
  { code: '+992', country: 'Tajikistan', iso: 'TJ' },
  { code: '+255', country: 'Tanzania', iso: 'TZ' },
  { code: '+66', country: 'Thailand', iso: 'TH' },
  { code: '+216', country: 'Tunisia', iso: 'TN' },
  { code: '+90', country: 'Turkey', iso: 'TR' },
  { code: '+993', country: 'Turkmenistan', iso: 'TM' },
  { code: '+256', country: 'Uganda', iso: 'UG' },
  { code: '+380', country: 'Ukraine', iso: 'UA' },
  { code: '+971', country: 'United Arab Emirates', iso: 'AE' },
  { code: '+44', country: 'United Kingdom', iso: 'GB' },
  { code: '+1', country: 'United States', iso: 'US' },
  { code: '+598', country: 'Uruguay', iso: 'UY' },
  { code: '+998', country: 'Uzbekistan', iso: 'UZ' },
  { code: '+58', country: 'Venezuela', iso: 'VE' },
  { code: '+84', country: 'Vietnam', iso: 'VN' },
  { code: '+967', country: 'Yemen', iso: 'YE' },
  { code: '+260', country: 'Zambia', iso: 'ZM' },
  { code: '+263', country: 'Zimbabwe', iso: 'ZW' },
];

/** Longest first, so a lookup matches '+971' before '+97'. */
const CODES_BY_LENGTH = [...new Set(DIAL_CODES.map((d) => d.code))].sort(
  (a, b) => b.length - a.length,
);

/**
 * Keep only digits, capped at E.164's maximum national length. Bound to the
 * input's onChange so the field can never hold anything the rule would reject —
 * pasting "+91 98765 43210" yields visible digits to fix rather than a silent
 * failure at submit.
 */
export function onlyPhoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '').slice(0, 14);
}

/** Both halves well-formed, and inside E.164's total. */
export function isValidPhone(countryCode: string, phone: string): boolean {
  return (
    COUNTRY_CODE_RE.test(countryCode) &&
    NATIONAL_NUMBER_RE.test(phone) &&
    withinE164(countryCode, phone)
  );
}

/** The one rule neither half can check alone — mirrors PhoneRules.withinE164. */
export function withinE164(countryCode: string, phone: string): boolean {
  const digits = (countryCode || '').replace(/\D/g, '').length + (phone || '').replace(/\D/g, '').length;
  return digits <= E164_MAX_DIGITS;
}

/** Says which of the two rules was broken, so the message names the real
 *  problem instead of always blaming the shape of the number. */
export function phoneError(countryCode: string, phone: string): string {
  if (!NATIONAL_NUMBER_RE.test(phone)) return PHONE_ERROR;
  if (!withinE164(countryCode, phone)) return E164_ERROR;
  return PHONE_ERROR;
}

/**
 * Best-effort split of what is already on file, for opening an edit form.
 *
 * A row written since the split needs no work. An older one has free text in
 * `phone` and no code at all: if it starts with '+' the leading digits are
 * matched against the known dial codes (longest first) and the rest is kept
 * as the number; otherwise the country is genuinely unknown and comes back
 * empty, which the form shows as an unpicked select rather than guessing a
 * country nobody stated.
 *
 * The number half comes back empty unless what is left is a plausible national
 * number — a half-recovered field would be submitted unread.
 */
export function splitStoredPhone(
  countryCode: string | null | undefined,
  phone: string | null | undefined,
): { phoneCountryCode: string; phone: string } {
  const storedCode = (countryCode || '').trim();
  const storedPhone = (phone || '').trim();
  if (storedCode) {
    return { phoneCountryCode: storedCode, phone: onlyPhoneDigits(storedPhone) };
  }
  if (!storedPhone) {
    return { phoneCountryCode: DEFAULT_DIAL_CODE, phone: '' };
  }
  if (storedPhone.startsWith('+')) {
    const digits = storedPhone.replace(/\D/g, '');
    for (const code of CODES_BY_LENGTH) {
      const bare = code.slice(1);
      if (digits.startsWith(bare)) {
        const rest = digits.slice(bare.length);
        return { phoneCountryCode: code, phone: NATIONAL_NUMBER_RE.test(rest) ? rest : '' };
      }
    }
  }
  // No '+' and no code on file: the digits could be a national number or could
  // already have a country baked into them, and nothing here can tell. They are
  // kept so a correct number is not thrown away, and the country deliberately
  // comes back BLANK — which leaves the select unpicked, blocks submit, and puts
  // a human in front of the number before it is saved.
  const digits = storedPhone.replace(/\D/g, '');
  return { phoneCountryCode: '', phone: NATIONAL_NUMBER_RE.test(digits) ? digits : '' };
}
