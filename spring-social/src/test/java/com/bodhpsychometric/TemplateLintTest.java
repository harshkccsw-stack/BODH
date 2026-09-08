package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.report.TemplateLint;

/**
 * Each rule here corresponds to a failure the P0a spike hit for real, inside
 * the eclipse-temurin:25-jre runtime image. They are all SILENT failures —
 * nothing throws, nothing logs — which is why they are worth a lint.
 */
class TemplateLintTest {

    private final TemplateLint lint = new TemplateLint();

    private List<String> rules(String html) {
        return lint.check(html).stream().map(TemplateLint.Finding::rule).toList();
    }

    @Test
    void svgTextWithoutFontFamilyIsAnError() {
        // Batik resolves through AWT, not openhtmltopdf's font registry, so an
        // unstyled <text> silently falls back to Times-Roman and any
        // Devanagari in it renders as empty boxes -- inside the chart only.
        String html = "<svg><text x='1' y='2'>सजगता</text></svg>";
        assertThat(rules(html)).contains("svg-text-font-family");
        assertThat(lint.isPublishable(lint.check(html))).isFalse();
    }

    @Test
    void svgTextWithFontFamilyPasses() {
        String html = "<svg><text x='1' y='2' font-family=\"Noto Sans Devanagari\">सजगता</text></svg>";
        assertThat(rules(html)).doesNotContain("svg-text-font-family");
    }

    @Test
    void theErrorMessageNamesTheFontToUse() {
        String message = lint.check("<svg><text>x</text></svg>").get(0).message();
        assertThat(message).contains("Noto Sans Devanagari");
    }

    @Test
    void pageMarginBoxPrintingWithoutAFontIsAnError() {
        // Margin boxes do not inherit body's font-family. Visual review passed
        // this in the spike; only a font-embedding assertion caught it.
        String html = "<style>@page{@bottom-center{content:\"Page \" counter(page);}}</style>";
        assertThat(rules(html)).contains("page-margin-font-family");
    }

    @Test
    void pageMarginBoxWithAFontPasses() {
        String html = "<style>@page{@bottom-center{"
                + "content:\"Page \" counter(page); font-family:\"Noto Sans Devanagari\";}}</style>";
        assertThat(rules(html)).doesNotContain("page-margin-font-family");
    }

    @Test
    void aMarginBoxThatPrintsNothingIsNotFlagged() {
        String html = "<style>@page{@bottom-center{margin:0;}}</style>";
        assertThat(rules(html)).doesNotContain("page-margin-font-family");
    }

    @Test
    void externalResourcesAreAnError() {
        String html = "<img src=\"https://cdn.example.com/logo.png\"/>";
        assertThat(rules(html)).contains("external-resource");
    }

    @Test
    void theMetadataEndpointIsCaughtLikeAnyOtherExternalUrl() {
        // The renderer denies this regardless; the lint is so the AUTHOR is
        // told rather than a client discovering a blank image.
        String html = "<img src=\"http://169.254.169.254/latest/meta-data/\"/>";
        assertThat(rules(html)).contains("external-resource");
    }

    @Test
    void dataUriImagesArePermitted() {
        // Organization.logoBase64 is stored exactly like this.
        String html = "<img src=\"data:image/png;base64,iVBORw0KGgo=\"/>";
        assertThat(rules(html)).doesNotContain("external-resource");
    }

    @Test
    void scriptAndStylesheetLinksWarnButDoNotBlockPublishing() {
        String html = "<link rel=\"stylesheet\" href=\"data:text/css,\"/><script>x()</script>";
        List<TemplateLint.Finding> findings = lint.check(html);
        assertThat(findings).extracting(TemplateLint.Finding::rule)
                .contains("external-stylesheet", "script-tag");
        assertThat(findings).allMatch(f -> f.severity() == TemplateLint.Severity.WARN);
        assertThat(lint.isPublishable(findings)).isTrue();
    }

    @Test
    void aCleanTemplateHasNoFindings() {
        String html = """
                <style>@page{@bottom-center{content:counter(page);
                  font-family:"Noto Sans Devanagari";}}
                  body{font-family:"Noto Sans Devanagari";}</style>
                <img src="data:image/png;base64,iVBORw0KGgo="/>
                <p>${name}</p>
                <svg><text font-family="Noto Sans Devanagari">80</text></svg>
                """;
        assertThat(lint.check(html)).isEmpty();
        assertThat(lint.isPublishable(lint.check(html))).isTrue();
    }

    /**
     * A margin box whose content includes a {@code ${tag}} is still checked for
     * its font-family.
     *
     * <p>The body pattern used to stop at the first {@code \}}, which for
     * {@code content: "${serial_id}"} is the tag's own — so the rule was
     * truncated before its font-family and a correct footer was reported as
     * missing one. A reference number in a running footer is an ordinary thing
     * to want, and it was unpublishable.
     */
    @Test
    void aMarginBoxContainingATagIsNotFalselyFlagged() {
        String html = """
                <style>@page{@bottom-right{content:"${serial_id}";
                  font-family:"Noto Sans Devanagari";}}
                  body{font-family:"Noto Sans Devanagari";}</style>
                <p>${name}</p>
                """;
        assertThat(rules(html)).doesNotContain("page-margin-font-family");
    }

    /** And one that genuinely lacks the font is still caught, tag or no tag. */
    @Test
    void aMarginBoxContainingATagButNoFontIsStillFlagged() {
        String html = """
                <style>@page{@bottom-right{content:"${serial_id}";}}
                  body{font-family:"Noto Sans Devanagari";}</style>
                """;
        assertThat(rules(html)).contains("page-margin-font-family");
    }

    /**
     * Named HTML entities abort the render, so they must block the publish.
     *
     * <p>Caught here rather than at render because a template that publishes
     * and then cannot render fails for the first real respondent instead of for
     * the author who typed it.
     */
    @Test
    void namedHtmlEntitiesAreRefused() {
        assertThat(rules("<p>Drive &middot; Execution</p>")).contains("named-entity");
        assertThat(rules("<p>range 4 &ndash; 20</p>")).contains("named-entity");
    }

    /** The five XML declares, and numeric references, are fine. */
    @Test
    void xmlEntitiesAndNumericReferencesArePermitted() {
        String html = "<p>a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos; "
                + "&#183; &#8211; &#x2014;</p>";
        assertThat(rules(html)).doesNotContain("named-entity");
    }

    /**
     * The failure this prevents is the most confusing one the renderer has: an
     * unclosed void element is reported against the element AROUND it, so a
     * stray {@code <br>} in a table cell surfaces as "element type td must be
     * terminated" pointing at a line where nothing looks wrong.
     */
    @Test
    void unclosedVoidElementsAreRefused() {
        assertThat(rules("<td>Drive<br>Execution</td>")).contains("unclosed-void-element");
        assertThat(rules("<p><img src=\"data:image/png;base64,iVBOR\"></p>"))
                .contains("unclosed-void-element");
        assertThat(rules("<hr>")).contains("unclosed-void-element");
    }

    @Test
    void selfClosedVoidElementsArePermitted() {
        String html = "<td>Drive<br/>Execution</td><hr />"
                + "<img src=\"data:image/png;base64,iVBOR\"/>"
                + "<meta charset=\"utf-8\"/>";
        assertThat(rules(html)).doesNotContain("unclosed-void-element");
    }

    @Test
    void nullAndBlankAreNotErrors() {
        assertThat(lint.check(null)).isEmpty();
        assertThat(lint.check("  ")).isEmpty();
    }
}
