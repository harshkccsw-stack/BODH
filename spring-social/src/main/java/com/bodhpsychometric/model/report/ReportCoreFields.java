package com.bodhpsychometric.model.report;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The facts a {@code CORE} binding may print — the half of a report that needs
 * no rules at all.
 *
 * <p>One place, because three things have to agree about this list: the
 * authoring UI's dropdown, the validator that refuses an unknown
 * {@code coreField}, and the resolver that actually fetches the value. A
 * fourth copy in a database CHECK constraint was deliberately not added: the
 * set grows with the product and every addition would then be a migration.
 *
 * <p>Keys are namespaced {@code core:} to match
 * {@code DataStudioDatasetService}'s column vocabulary, so the same name means
 * the same thing in a report template as it does in a Data Studio sheet. That
 * consistency is the reason for the prefix — there is no second namespace here
 * for it to collide with.
 *
 * <p>Deliberately excluded: email, employee id, phone. A report is a document
 * that gets handed to somebody, and none of those belong on it by default. A
 * template that genuinely needs one can carry it as LITERAL text, which at
 * least makes it a decision somebody wrote down.
 *
 * <p><b>There is deliberately no "assessed on" date, and it is not an
 * oversight.</b> {@code RespondentAssessmentMapping} carries no timestamp of
 * any kind — no {@code completedAt}, no {@code createdAt} — so the date a
 * respondent actually sat the assessment <b>is not recorded anywhere in the
 * database</b>. The available near-misses are all wrong: the assessment's
 * {@code startDate} / {@code endDate} are the availability window, not a
 * sitting, and would print the same date for everyone. A report that states a
 * date it cannot know is worse than one that omits it, so {@link #REPORT_DATE}
 * (today, honestly) is offered and the sitting date is not. Adding
 * {@code completedAt} to the mapping is a change to an EXISTING table plus a
 * backfill decision for every attempt already completed — it belongs to P2,
 * where {@code inputs_hash} and the batch need it anyway.
 */
public final class ReportCoreFields {

    private ReportCoreFields() {
    }

    public static final String NAME = "core:name";
    public static final String DOB = "core:dob";
    public static final String GENDER = "core:gender";
    public static final String ORGANIZATION_NAME = "core:organizationName";
    public static final String ASSESSMENT_NAME = "core:assessmentName";
    public static final String REPORT_DATE = "core:reportDate";
    public static final String SERIAL_ID = "core:serialId";
    public static final String ATTEMPT_STATUS = "core:status";

    /** Key to the label the authoring UI shows. Insertion order is UI order. */
    public static final Map<String, String> KEYS = buildKeys();

    private static Map<String, String> buildKeys() {
        Map<String, String> keys = new LinkedHashMap<>();
        keys.put(NAME, "Respondent name");
        keys.put(DOB, "Date of birth");
        keys.put(GENDER, "Gender");
        keys.put(ORGANIZATION_NAME, "Organization");
        keys.put(ASSESSMENT_NAME, "Assessment");
        keys.put(REPORT_DATE, "Report date");
        keys.put(SERIAL_ID, "Serial ID");
        keys.put(ATTEMPT_STATUS, "Attempt status");
        // unmodifiableMap, NOT Map.copyOf — the latter returns an UNORDERED
        // immutable map, which would silently scramble the dropdown this
        // class exists to order.
        return java.util.Collections.unmodifiableMap(keys);
    }

    public static boolean isKnown(String key) {
        return key != null && KEYS.containsKey(key);
    }
}
