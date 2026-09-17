package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.bodhpsychometric.service.report.ReportFontRegistry;
import com.bodhpsychometric.service.report.ReportRenderer;
import com.bodhpsychometric.service.report.TemplateTagParser;

/**
 * The assertions that make the P0a findings permanent.
 *
 * <p>Two of the three failures P0a hit were invisible to visual review: SVG
 * labels rendering in a fallback font, and the page footer using unembedded
 * Times-Roman. Both were caught only by parsing the produced PDF and asking
 * which fonts actually drew glyphs. That check lives here so it runs forever.
 */
class ReportRendererTest {

    private static ReportFontRegistry fonts;
    private static ReportRenderer renderer;
    private static final TemplateTagParser PARSER = new TemplateTagParser();

    private static final String DEVANAGARI_NAME = "प्रिया शर्मा";

    @BeforeAll
    static void setUp() {
        fonts = new ReportFontRegistry();
        fonts.registerWithAwt();
        renderer = new ReportRenderer(fonts);
    }

    private static String page(String body) {
        return """
                <html><head><meta charset="utf-8"/><style>
                  @page { size: A4; margin: 15mm;
                    @bottom-center { content: counter(page);
                      font-family: "Noto Sans Devanagari"; font-size: 8pt; } }
                  body { font-family: "Noto Sans Devanagari"; font-size: 10pt; }
                </style></head><body>
                """ + body + "</body></html>";
    }

    @Test
    void rendersAPdf() {
        byte[] pdf = renderer.toPdf(page("<p>Hello</p>")).bytes();
        assertThat(pdf).isNotEmpty();
        assertThat(new String(pdf, 0, 5)).isEqualTo("%PDF-");
    }

    @Test
    void devanagariSurvivesTheRoundTrip() throws Exception {
        byte[] pdf = renderer.toPdf(page("<p>" + DEVANAGARI_NAME + "</p>")).bytes();
        try (PDDocument doc = PDDocument.load(pdf)) {
            assertThat(new PDFTextStripper().getText(doc)).contains(DEVANAGARI_NAME);
        }
    }

    /**
     * The check that caught the unembedded page footer. A font may be declared
     * in a page's resources and never used; what matters is whether an
     * unembedded font actually puts ink on the page, because that is the one
     * that renders as boxes on someone else's machine.
     */
    @Test
    void everyFontThatDrawsAGlyphIsEmbedded() throws Exception {
        String body = "<p>" + DEVANAGARI_NAME + " and Latin text</p>"
                + "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='30'>"
                + "<text x='0' y='20' font-family=\"Noto Sans Devanagari\">80</text></svg>";
        byte[] pdf = renderer.toPdf(page(body)).bytes();

        try (PDDocument doc = PDDocument.load(pdf)) {
            List<String> unembedded = new ArrayList<>();
            List<String> embedded = new ArrayList<>();
            for (PDPage p : doc.getPages()) {
                collectFonts(p.getResources(), embedded, unembedded);
            }

            Map<String, Integer> drawing = fontsThatDrawGlyphs(doc);
            assertThat(drawing).isNotEmpty();

            List<String> drawingButUnembedded = drawing.keySet().stream()
                    .filter(unembedded::contains)
                    .toList();

            assertThat(drawingButUnembedded)
                    .as("fonts drawing glyphs but not embedded — these render as boxes "
                            + "on a machine without them installed; the runtime JRE image "
                            + "has no system fonts at all")
                    .isEmpty();
            assertThat(embedded).anyMatch(f -> f.contains("Noto"));
        }
    }

    @Test
    void inlineSvgRenders() {
        String body = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'>"
                + "<rect x='0' y='0' width='100' height='20' fill='#2b5c8a'/></svg>";
        assertThat(renderer.toPdf(page(body)).bytes()).isNotEmpty();
    }

    @Test
    void externalResourcesAreBlockedAndReported() {
        var rendered = renderer.toPdf(page(
                "<img src=\"http://169.254.169.254/latest/meta-data/\" width='10' height='10'/>"));
        assertThat(rendered.blockedUris())
                .as("the cloud metadata endpoint must never be fetched by the renderer")
                .anyMatch(u -> u.contains("169.254.169.254"));
        assertThat(rendered.bytes()).isNotEmpty();
    }

    @Test
    void aDataUriImageIsNotBlocked() {
        // 1x1 transparent PNG — the shape Organization.logoBase64 stores.
        String png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        var rendered = renderer.toPdf(page("<img src=\"data:image/png;base64," + png + "\"/>"));
        assertThat(rendered.blockedUris()).isEmpty();
    }

    @Test
    void aPageBreakProducesASecondPage() throws Exception {
        byte[] pdf = renderer.toPdf(page(
                "<p>one</p><div style='page-break-before:always'></div><p>two</p>")).bytes();
        try (PDDocument doc = PDDocument.load(pdf)) {
            assertThat(doc.getNumberOfPages()).isEqualTo(2);
        }
    }

    @Test
    void malformedHtmlFailsWithAMessageTheAuthorCanActOn() {
        // Not a 500 and not a silent blank page.
        org.junit.jupiter.api.Assertions.assertThrows(
                ReportRenderer.RenderFailedException.class,
                () -> renderer.toPdf("<html><body><p>unclosed <<< &nbsp"));
    }

    @Test
    void substitutedValuesAppearInTheRenderedPdf() throws Exception {
        String html = PARSER.substitute(page("<p>${name}</p>"), Map.of("name", DEVANAGARI_NAME));
        try (PDDocument doc = PDDocument.load(renderer.toPdf(html).bytes())) {
            assertThat(new PDFTextStripper().getText(doc)).contains(DEVANAGARI_NAME);
        }
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private static void collectFonts(PDResources res, List<String> embedded,
            List<String> unembedded) {
        if (res == null) {
            return;
        }
        for (COSName name : res.getFontNames()) {
            try {
                PDFont font = res.getFont(name);
                if (font == null) {
                    continue;
                }
                PDFontDescriptor fd = font.getFontDescriptor();
                boolean isEmbedded = fd != null && (fd.getFontFile() != null
                        || fd.getFontFile2() != null || fd.getFontFile3() != null);
                (isEmbedded ? embedded : unembedded).add(font.getName());
            } catch (Exception ignored) {
                // A font we cannot read is not a font we can assert on.
            }
        }
        for (COSName xn : res.getXObjectNames()) {
            try {
                if (res.getXObject(xn) instanceof
                        org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject form) {
                    collectFonts(form.getResources(), embedded, unembedded);
                }
            } catch (Exception ignored) {
                // Same.
            }
        }
    }

    private static Map<String, Integer> fontsThatDrawGlyphs(PDDocument doc) throws Exception {
        Map<String, Integer> used = new TreeMap<>();
        PDFTextStripper stripper = new PDFTextStripper() {
            @Override
            protected void writeString(String text, List<TextPosition> positions) {
                for (TextPosition p : positions) {
                    if (p.getFont() != null && p.getUnicode() != null && !p.getUnicode().isBlank()) {
                        used.merge(p.getFont().getName(), 1, Integer::sum);
                    }
                }
            }
        };
        stripper.getText(doc);
        return used;
    }
}
