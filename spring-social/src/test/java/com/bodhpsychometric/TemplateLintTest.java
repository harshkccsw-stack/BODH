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

    @Test
    void nullAndBlankAreNotErrors() {
        assertThat(lint.check(null)).isEmpty();
        assertThat(lint.check("  ")).isEmpty();
    }
}
