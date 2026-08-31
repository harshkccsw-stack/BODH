package com.bodhpsychometric.dto.validation;

/**
 * The one definition of what a phone number looks like on a respondent record,
 * following E.164 — the ITU standard every dialable international number obeys.
 *
 * <p>Until 2026-08-31 a phone was a single free-text column checked by one
 * loose regex COPIED into four places, and which could not know how long a
 * number should be because it did not know the country. It is now two values —
 * a dial code and a national number — and these constants are what every one
 * of those four creation points compiles or annotates against, so the portal
 * form, the dashboard form, the wizard's inline rows and the XLSX sheet cannot
 * disagree with each other or with the entity.
 *
 * <p>They are Strings rather than compiled {@link java.util.regex.Pattern}s
 * because {@code @Pattern(regexp = ...)} needs a compile-time constant.
 * Callers that cannot use bean validation — the sheet path, which must answer
 * with a numbered row issue rather than a 400 for the whole upload — compile
 * them once themselves.
 */
public final class PhoneRules {

    /**
     * An ITU country calling code as the user picks it: a literal '+' and one
     * to three digits, never starting with 0. Stored WITH the '+' so the pair
     * (code, number) concatenates into an E.164 string with no further
     * knowledge of what either half means.
     */
    public static final String COUNTRY_CODE_REGEX = "^\\+[1-9][0-9]{0,2}$";

    /**
     * The national (subscriber) number: digits only — no spaces, brackets,
     * dashes, '+' or country code.
     *
     * <p>E.164 caps the WHOLE number at 15 digits and the country code takes
     * one to three of them, which leaves 14 here. There is no standard minimum;
     * 4 is a sanity floor, comfortably below the shortest real national numbers
     * in use.
     *
     * <p>A leading 0 is the domestic trunk prefix and is not part of the
     * international form, so it is dropped when dialling from abroad — every
     * message about this field says so. It is not rejected outright, because a
     * handful of numbering plans do carry a significant leading zero and this
     * validator has no country-by-country knowledge to tell them apart.
     */
    public static final String NATIONAL_NUMBER_REGEX = "^[0-9]{4,14}$";

    /** E.164's hard ceiling: country code and subscriber number together. */
    public static final int E164_MAX_DIGITS = 15;

    public static final String COUNTRY_CODE_MESSAGE =
            "Select a country code (e.g. +91)";

    public static final String NATIONAL_NUMBER_MESSAGE =
            "Enter a valid phone number — digits only, without the country code "
                    + "or a leading 0";

    public static final String E164_MESSAGE =
            "Country code and phone number together cannot be more than "
                    + E164_MAX_DIGITS + " digits";

    /**
     * The one rule neither field can check alone: their combined length.
     *
     * <p>Lenient about a malformed half on purpose — true here means "these two
     * do not break E.164 together", and whether each is well-formed on its own
     * is the job of the two patterns above. Reporting one bad field as three
     * problems helps nobody.
     */
    public static boolean withinE164(String countryCode, String nationalNumber) {
        int digits = digitCount(countryCode) + digitCount(nationalNumber);
        return digits <= E164_MAX_DIGITS;
    }

    private static int digitCount(String value) {
        if (value == null) {
            return 0;
        }
        int count = 0;
        for (int i = 0; i < value.length(); i++) {
            if (Character.isDigit(value.charAt(i))) {
                count++;
            }
        }
        return count;
    }

    private PhoneRules() {
    }
}
