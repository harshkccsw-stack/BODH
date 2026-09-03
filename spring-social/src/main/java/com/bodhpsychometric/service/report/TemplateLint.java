package com.bodhpsychometric.service.report;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

/**
 * Refuses the template mistakes that produce a broken PDF SILENTLY.
 *
 * <p>Every rule here was found the hard way by the P0a spike
 * (docs/report-engine-build-plan.md §4.1), rendering inside the real
 * {@code eclipse-temurin:25-jre} image. None of them throws, none logs a
 * warning, and the first two do not even make the document look wrong on the
 * page a reviewer happens to open — which is exactly why they are worth a lint
 * rather than a note in a wiki.
 *
 * <p><b>1. SVG {@code <text>} with no {@code font-family}.</b> Batik does not
 * read OpenHTMLtoPDF's font registry — it resolves through AWT — so an SVG
 * label ignores the embedded face and falls back to base-14 Times-Roman, which
 * has no Devanagari. In the spike the string {@code सजगता} rendered as five
 * tofu boxes inside a bar chart while the identical string was perfect in a
 * table two inches below it. Partial, silent, and in charts, where nobody
 * looks first.
 *
 * <p><b>2. A {@code @page} margin box with no {@code font-family}.</b> Margin
 * boxes do not inherit {@code body}'s font, so the page-number footer quietly
 * used unembedded Times-Roman. Visual review passed this; only a font-embedding
 * assertion caught it.
 *
 * <p><b>3. An external resource URL.</b> The renderer denies these at load
 * time anyway ({@code ReportRenderer}'s URI resolver), so this rule is not the
 * security control — it is the one that tells the AUTHOR their logo will be
 * blank, instead of letting them find out from a client's PDF.
 *
 * <p>Findings are returned, never thrown, and each carries a fix. Publishing
 * refuses on any ERROR; saving a draft records them so the editor can show
 * them as you type. WARN never blocks anything.
 */
@Component
public class TemplateLint {

    public enum Severity { ERROR, WARN }

    /**
     * @param severity ERROR blocks publish; WARN is advisory
     * @param rule     stable machine-readable id, for tests and the UI
     * @param message  what is wrong AND how to fix it, in one sentence
     */
    public record Finding(Severity severity, String rule, String message) {
    }

    private static final Pattern SVG_TEXT =
            Pattern.compile("<text\\b([^>]*)>", Pattern.CASE_INSENSITIVE);

    private static final Pattern HAS_FONT_FAMILY =
            Pattern.compile("font-family\\s*[=:]", Pattern.CASE_INSENSITIVE);

    /** {@code @top-left}, {@code @bottom-center}, and the rest. */
    private static final Pattern MARGIN_BOX =
            Pattern.compile("@(top|bottom)-(left|center|centre|right)\\b[^{]*\\{([^}]*)\\}",
                    Pattern.CASE_INSENSITIVE);

    /** src/href pointing anywhere but a data: URI. */
    private static final Pattern EXTERNAL_RESOURCE =
            Pattern.compile("(?:src|href)\\s*=\\s*[\"']\\s*((?:https?:)?//[^\"']+|(?:https?|ftp|file):[^\"']+)",
                    Pattern.CASE_INSENSITIVE);

    /** A stylesheet link is fine to flag but is not the same as an image. */
    private static final Pattern STYLESHEET_LINK =
            Pattern.compile("<link\\b[^>]*rel\\s*=\\s*[\"']?stylesheet", Pattern.CASE_INSENSITIVE);

    public List<Finding> check(String html) {
        List<Finding> findings = new ArrayList<>();
        if (html == null || html.isBlank()) {
            return findings;
        }

        int unstyledSvgText = 0;
        Matcher m = SVG_TEXT.matcher(html);
        while (m.find()) {
            if (!HAS_FONT_FAMILY.matcher(m.group(1)).find()) {
                unstyledSvgText++;
            }
        }
        if (unstyledSvgText > 0) {
            findings.add(new Finding(Severity.ERROR, "svg-text-font-family",
                    unstyledSvgText + " SVG <text> element" + (unstyledSvgText == 1 ? "" : "s")
                            + " have no font-family. Charts render their labels in an "
                            + "unembedded fallback font, so any non-Latin text becomes empty "
                            + "boxes. Add font-family=\"" + ReportFontRegistry.FONT_FAMILY
                            + "\" to every <text> element."));
        }

        Matcher boxes = MARGIN_BOX.matcher(html);
        int unstyledBoxes = 0;
        while (boxes.find()) {
            String body = boxes.group(3);
            // Only a box that actually prints something can print it wrongly.
            if (body.toLowerCase().contains("content") && !HAS_FONT_FAMILY.matcher(body).find()) {
                unstyledBoxes++;
            }
        }
        if (unstyledBoxes > 0) {
            findings.add(new Finding(Severity.ERROR, "page-margin-font-family",
                    unstyledBoxes + " @page margin box" + (unstyledBoxes == 1 ? "" : "es")
                            + " print text without a font-family. Margin boxes do not inherit "
                            + "the body font, so headers and page numbers use an unembedded "
                            + "font. Add font-family: \"" + ReportFontRegistry.FONT_FAMILY
                            + "\" inside the margin box rule."));
        }

        Matcher ext = EXTERNAL_RESOURCE.matcher(html);
        List<String> urls = new ArrayList<>();
        while (ext.find() && urls.size() < 5) {
            urls.add(ext.group(1));
        }
        if (!urls.isEmpty()) {
            findings.add(new Finding(Severity.ERROR, "external-resource",
                    "The template loads " + urls.size() + " external resource"
                            + (urls.size() == 1 ? "" : "s") + " (" + String.join(", ", urls)
                            + "). Rendering blocks all network access, so these arrive blank. "
                            + "Embed images as data: URIs and put CSS in a <style> block."));
        }

        if (STYLESHEET_LINK.matcher(html).find()) {
            findings.add(new Finding(Severity.WARN, "external-stylesheet",
                    "A <link rel=\"stylesheet\"> will not load. Move the rules into an "
                            + "inline <style> block or the report renders unstyled."));
        }

        if (html.toLowerCase().contains("<script")) {
            findings.add(new Finding(Severity.WARN, "script-tag",
                    "<script> never runs — the PDF renderer has no JavaScript engine. "
                            + "Anything computed in script must come from a bound tag instead."));
        }

        return findings;
    }

    /** True when nothing found would block publishing. */
    public boolean isPublishable(List<Finding> findings) {
        return findings.stream().noneMatch(f -> f.severity() == Severity.ERROR);
    }
}
