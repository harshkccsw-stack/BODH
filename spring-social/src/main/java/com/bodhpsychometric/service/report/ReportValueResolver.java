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
        Map<String, String> out = new LinkedHashMap<>();
        for (ReportTagBinding binding : template.getBindings()) {
            out.put(binding.getTag(), escape(valueFor(binding, coreValues)));
        }
        return out;
    }

    /** Raw value for one binding, before escaping. Null means "use fallback". */
    private String valueFor(ReportTagBinding binding, Map<String, String> coreValues) {
        String raw = switch (binding.getBinderType()) {
            case ReportTagBinding.TYPE_CORE -> coreValues.get(binding.getCoreField());
            case ReportTagBinding.TYPE_LITERAL -> binding.getLiteralText();
            // UNBOUND, and the P2 types, resolve to nothing. Rendering is
            // gated on a published template where every tag is bound, so this
            // is only reachable from a draft preview — where showing the
            // fallback is exactly the right signal that work remains.
            default -> null;
        };
        if (raw == null || raw.isBlank()) {
            return binding.getFallbackText();
        }
        return raw;
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
