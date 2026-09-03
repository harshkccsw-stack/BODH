package com.bodhpsychometric.service.report;

import java.awt.Font;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.io.InputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;

import jakarta.annotation.PostConstruct;

/**
 * Makes the Devanagari face available to BOTH renderers, which is two
 * different registrations of the same file.
 *
 * <p>The runtime image is {@code eclipse-temurin:25-jre}. <b>A JRE ships no
 * system fonts at all</b> — fontconfig inside the container sees only DejaVu.
 * So there is no "use the system Devanagari font" option; the face has to
 * travel with the jar, and it does, at
 * {@code src/main/resources/fonts/NotoSansDevanagari-Regular.ttf}.
 *
 * <p><b>Why twice.</b> OpenHTMLtoPDF draws the HTML body and Batik draws
 * inline SVG, and <b>Batik does not read OpenHTMLtoPDF's font registry — it
 * resolves through AWT.</b> Register with only {@code useFont()} and every SVG
 * label silently falls back to base-14 Times-Roman, which has no Devanagari:
 * in the P0a spike {@code सजगता} came out as five tofu boxes inside the bar
 * chart while the identical string was perfect in a table two inches below.
 * Register with only AWT and the body text loses the face instead. Both halves
 * are load-bearing; deleting either brings back a partial, silent failure.
 *
 * <p>The AWT half is a JVM-global side effect, so it is done once at startup
 * and guarded by a flag rather than repeated per render.
 *
 * <p>Latin text also renders from this face — Noto Sans Devanagari carries a
 * full Latin set — which is why one font covers the whole document and the
 * output PDF ends up with exactly one embedded font. That is worth keeping:
 * "how many fonts are in this PDF" is then a one-number health check, and
 * {@code ReportRendererTest} asserts on it.
 */
@Component
public class ReportFontRegistry {

    private static final Logger log = LoggerFactory.getLogger(ReportFontRegistry.class);

    /** The family name templates must use — in CSS and in SVG font-family. */
    public static final String FONT_FAMILY = "Noto Sans Devanagari";

    public static final String FONT_PATH = "fonts/NotoSansDevanagari-Regular.ttf";

    private boolean awtRegistered;

    /**
     * Register with AWT once, for Batik. Failure is logged and not fatal: the
     * body text still renders correctly from the {@code useFont()} half, and
     * refusing to start the whole application because charts would have the
     * wrong font is the worse trade.
     */
    @PostConstruct
    public void registerWithAwt() {
        try (InputStream in = open()) {
            Font font = Font.createFont(Font.TRUETYPE_FONT, in);
            awtRegistered = GraphicsEnvironment.getLocalGraphicsEnvironment().registerFont(font);
            if (awtRegistered) {
                log.info("Registered '{}' with AWT for SVG text rendering", font.getFontName());
            } else {
                log.warn("AWT refused to register '{}' — a font of that name was already "
                        + "present. SVG labels may render in the wrong face.", FONT_FAMILY);
            }
        } catch (IOException | java.awt.FontFormatException e) {
            log.error("Could not register the report font with AWT. Inline SVG labels will "
                    + "fall back to an unembedded font and non-Latin text in charts will "
                    + "render as empty boxes.", e);
        }
    }

    /**
     * The other half: hand the same file to OpenHTMLtoPDF for the HTML body.
     * The supplier is called per render, so the stream is opened fresh each
     * time rather than shared.
     */
    public void applyTo(PdfRendererBuilder builder) {
        builder.useFont(this::openQuietly, FONT_FAMILY);
    }

    public boolean isAwtRegistered() {
        return awtRegistered;
    }

    private InputStream open() throws IOException {
        return new ClassPathResource(FONT_PATH).getInputStream();
    }

    private InputStream openQuietly() {
        try {
            return open();
        } catch (IOException e) {
            // Returning null makes OpenHTMLtoPDF skip the face, which produces
            // a wrong-looking PDF rather than a failed request. The font is
            // packaged in the jar, so this means the jar is broken.
            log.error("Report font missing from the classpath at {}", FONT_PATH, e);
            return null;
        }
    }
}
