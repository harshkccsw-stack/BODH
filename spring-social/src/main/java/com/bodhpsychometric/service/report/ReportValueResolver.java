package com.bodhpsychometric.service.report;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.bodhpsychometric.model.report.ReportTagBinding;
import com.bodhpsychometric.model.report.ReportTemplate;

/**
 * Turns a template's bindings plus a set of core values into the
 * {@code tag → text} map the renderer substitutes.
 *
 * <p><b>Escaping happens here and only here.</b> Every resolved value is
 * HTML-escaped on the way out, once. Doing it at the source would risk a value
 * escaped twice printing {@code &amp;amp;}; doing it in the renderer would mean
 * every future binder type has to remember. One place, applied to everything,
 * including {@code LITERAL}.
 *
 * <p>That makes {@code LITERAL} plain text by design. An author who wants bold
 * or a line break puts the markup in the template HTML around the tag, which
 * is where markup belongs and where the lint can see it. The alternative —
 * trusting binding text as HTML — reintroduces exactly the injection surface
 * the renderer's network deny was built to close.
 */
@Service
public class ReportValueResolver {

    private final ReportCoreResolver core;

    public ReportValueResolver(ReportCoreResolver core) {
        this.core = core;
    }

    /**
     * @param coreValues raw (unescaped) core values — from
     *        {@link ReportCoreResolver#resolve} for a real attempt, or
     *        {@link ReportCoreResolver#sampleValues()} for a preview
     */
    public Map<String, String> resolve(ReportTemplate template, Map<String, String> coreValues) {
        return resolve(template, coreValues, Map.of());
    }

    /**
     * @param ruleValues one respondent's computed values, keyed by rule slug —
     *        {@code EvaluatedCohort.valuesFor(row)}. Empty for a preview with no
     *        cohort behind it, which is why every VALUE tag then shows its
     *        fallback rather than a zero.
     */
    public Map<String, String> resolve(ReportTemplate template, Map<String, String> coreValues,
            Map<String, Object> ruleValues) {
        return resolve(template, coreValues, ruleValues, Map.of());
    }

    /**
     * @param narratives one respondent's generated prose, keyed by tag — from
     *        {@link ReportNarrativeService#resolveForCohort}. Empty when the
     *        template has no NARRATIVE tag, which is the ordinary case and the
     *        reason this is an overload rather than a required argument.
     */
    public Map<String, String> resolve(ReportTemplate template, Map<String, String> coreValues,
            Map<String, Object> ruleValues, Map<String, String> narratives) {
        Map<String, String> out = new LinkedHashMap<>();
        for (ReportTagBinding binding : template.getBindings()) {
            out.put(binding.getTag(),
                    escape(valueFor(binding, coreValues, ruleValues, narratives)));
        }
        return out;
    }

    /** Raw value for one binding, before escaping. Null means "use fallback". */
    private String valueFor(ReportTagBinding binding, Map<String, String> coreValues,
            Map<String, Object> ruleValues, Map<String, String> narratives) {
        String raw = switch (binding.getBinderType()) {
            case ReportTagBinding.TYPE_CORE -> coreValues.get(binding.getCoreField());
            case ReportTagBinding.TYPE_LITERAL -> binding.getLiteralText();
            case ReportTagBinding.TYPE_VALUE -> computed(binding, ruleValues);
            // Escaped on the way out like everything else, which is what keeps
            // a model unable to emit markup into a PDF. It is handed in already
            // written rather than generated here: one call covers every
            // narrative tag for a respondent, and that call cannot happen once
            // per binding inside a loop.
            case ReportTagBinding.TYPE_NARRATIVE -> narratives.get(binding.getTag());
            // UNBOUND and COMPUTED resolve to nothing. COMPUTED is deliberately
            // vague — "a computation fills this, we have not said which" — so
            // it is an authoring placeholder, not something renderable.
            default -> null;
        };
        if (raw == null || raw.isBlank()) {
            return binding.getFallbackText();
        }
        return raw;
    }

    /**
     * One computed value, formatted.
     *
     * <p>A key that is absent and a key whose value is null are the same thing
     * here — both yield the fallback — but they are NOT the same upstream, and
     * the difference is caught before this point: delivery refuses a cohort with
     * any failed rule, so a null arriving here means the formula genuinely had
     * nothing to say about this respondent (an unanswered optional section),
     * not that it broke.
     */
    private String computed(ReportTagBinding binding, Map<String, Object> ruleValues) {
        if (binding.getOutputKey() == null) {
            return null;
        }
        Object value = ruleValues.get(binding.getOutputKey());
        return format(value, binding.getFormat());
    }

    /**
     * Numbers print without a trailing {@code .0} unless a format asks otherwise.
     *
     * <p>The evaluator works in doubles throughout, so a sum of integer option
     * scores arrives as {@code 44.0}. Printing that on a report is wrong in a way
     * everybody notices and nobody can explain, and "44.0" is not what the
     * psychometrician's workbook says. A format of {@code 0.0} / {@code 0.00}
     * asks for decimals back where a mean or a z-score wants them.
     */
    static String format(Object value, String format) {
        if (value == null) {
            return null;
        }
        if (!(value instanceof Number number)) {
            return String.valueOf(value);
        }
        double d = number.doubleValue();
        if (format != null && !format.isBlank()) {
            try {
                return new java.text.DecimalFormat(format.trim()).format(d);
            } catch (IllegalArgumentException ignored) {
                // A format nobody can parse must not lose the number. Fall
                // through to the default rendering.
            }
        }
        if (d == Math.rint(d) && !Double.isInfinite(d)) {
            return String.valueOf((long) d);
        }
        return java.math.BigDecimal.valueOf(d)
                .setScale(2, java.math.RoundingMode.HALF_UP)
                .stripTrailingZeros()
                .toPlainString();
    }

    /**
     * Minimal, complete HTML text escaping. Quotes included: a value may land
     * inside an attribute, and a respondent named {@code O"Brien} must not be
     * able to close one.
     */
    public static String escape(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder(value.length() + 16);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&' -> sb.append("&amp;");
                case '<' -> sb.append("&lt;");
                case '>' -> sb.append("&gt;");
                case '"' -> sb.append("&quot;");
                case '\'' -> sb.append("&#39;");
                default -> sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Exposed so the controller can build a preview without a respondent. */
    public Map<String, String> sampleCoreValues() {
        return core.sampleValues();
    }
}
