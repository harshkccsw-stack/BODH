package com.bodhpsychometric.service.report;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.model.auth.RespondentUser;
import com.bodhpsychometric.model.organization.Organization;
import com.bodhpsychometric.model.report.ReportCoreFields;

/**
 * Fills {@code CORE} bindings — the half of a report that is already in the
 * database and needs no rule, no generated code and no AI.
 *
 * <p>This is what makes P1 shippable on its own: a template of headings,
 * boilerplate and these fields renders as a real, correct, deliverable PDF
 * before the computation engine exists at all.
 *
 * <p>Two things it deliberately does NOT do:
 *
 * <ul>
 *   <li><b>Invent a sitting date.</b> See {@link ReportCoreFields} — the
 *       attempt carries no timestamp, so there is no honest value for it and
 *       the field is not offered.</li>
 *   <li><b>HTML-escape.</b> Escaping happens once, in
 *       {@link ReportValueResolver}, so there is exactly one place that
 *       decides it and no chance of a value being escaped twice and printing
 *       {@code &amp;amp;}.</li>
 * </ul>
 */
@Service
public class ReportCoreResolver {

    /** ISO by default. A binding's {@code format} overrides per tag. */
    private static final DateTimeFormatter DEFAULT_DATE = DateTimeFormatter.ISO_LOCAL_DATE;

    /**
     * Every core value for one attempt. Values may be null — a respondent
     * with no organization is normal — and the caller applies the binding's
     * fallback text.
     */
    public Map<String, String> resolve(RespondentAssessmentMapping attempt) {
        RespondentUser respondent = attempt.getRespondent();
        Organization organization = respondent.getOrganization();

        Map<String, String> values = new LinkedHashMap<>();
        values.put(ReportCoreFields.NAME, respondent.getName());
        values.put(ReportCoreFields.DOB, format(respondent.getUser().getDob(), null));
        values.put(ReportCoreFields.GENDER,
                respondent.getGender() == null ? null : label(respondent.getGender().name()));
        values.put(ReportCoreFields.ORGANIZATION_NAME,
                organization == null ? null : organization.getName());
        values.put(ReportCoreFields.ASSESSMENT_NAME, attempt.getAssessment().getName());
        values.put(ReportCoreFields.REPORT_DATE, format(LocalDate.now(), null));
        values.put(ReportCoreFields.SERIAL_ID, respondent.getUser().getSerialId());
        values.put(ReportCoreFields.ATTEMPT_STATUS, label(attempt.getAssessmentStatus().name()));
        return values;
    }

    /**
     * Stand-in values for previewing a template with no respondent behind it.
     *
     * <p>Not a convenience: it is the only way to check a layout while
     * authoring, and — with the development database empty — the only way to
     * exercise the render path at all today. The Devanagari name is
     * deliberate, so a preview reproduces the font problem P0a found rather
     * than hiding it behind Latin text that would look fine either way.
     */
    public Map<String, String> sampleValues() {
        Map<String, String> values = new LinkedHashMap<>();
        values.put(ReportCoreFields.NAME, "प्रिया शर्मा");
        values.put(ReportCoreFields.DOB, "2001-03-14");
        values.put(ReportCoreFields.GENDER, "Female");
        values.put(ReportCoreFields.ORGANIZATION_NAME, "Sample Organization");
        values.put(ReportCoreFields.ASSESSMENT_NAME, "Sample Assessment");
        values.put(ReportCoreFields.REPORT_DATE, format(LocalDate.now(), null));
        values.put(ReportCoreFields.SERIAL_ID, "SAMPLE-0001");
        values.put(ReportCoreFields.ATTEMPT_STATUS, "Completed");
        return values;
    }

    /** Apply a binding's {@code format} to a date, falling back to ISO. */
    public String format(LocalDate date, String pattern) {
        if (date == null) {
            return null;
        }
        if (pattern == null || pattern.isBlank()) {
            return DEFAULT_DATE.format(date);
        }
        try {
            return DateTimeFormatter.ofPattern(pattern).format(date);
        } catch (IllegalArgumentException e) {
            // A bad pattern is an authoring mistake, not a reason to fail a
            // whole report at render time. Print the ISO date and move on.
            return DEFAULT_DATE.format(date);
        }
    }

    /** PREFER_NOT_TO_SAY → "Prefer not to say". Enum names are not copy. */
    private static String label(String enumName) {
        if (enumName == null || enumName.isBlank()) {
            return null;
        }
        String spaced = enumName.replace('_', ' ').toLowerCase();
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}
