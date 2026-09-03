package com.bodhpsychometric.service.report;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.openhtmltopdf.extend.FSStream;
import com.openhtmltopdf.extend.FSStreamFactory;
import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;
import com.openhtmltopdf.svgsupport.BatikSVGDrawer;

/**
 * Turns a resolved template into bytes — HTML for the interactive view, PDF
 * for the delivered document.
 *
 * <p>The same substituted HTML backs both, which is what makes the
 * {@code PDF | Interactive} pair the prototype pages ask for nearly free:
 * serving the page costs a content type, not a second renderer.
 *
 * <h2>Network access is denied, at the renderer</h2>
 *
 * <p>The HTML is <b>authored by users and rendered server-side</b>, inside the
 * network, by a library that will happily fetch whatever the document names.
 * {@code <img src="http://169.254.169.254/latest/meta-data/">} in a template is
 * a cloud-credential read with a report as the delivery mechanism.
 *
 * <p>The control is a URI resolver that refuses everything except {@code data:}
 * URIs — not HTML validation, which is a denylist and would be wrong forever
 * after the first construct nobody thought of. P0a proved this: the metadata
 * URL was refused, no request left the container, and the PDF carried no
 * broken-image artifact. {@link TemplateLint}'s external-resource rule exists
 * only so an author is told at save time, rather than finding out from a
 * client's blank logo.
 *
 * <p>Fonts are unaffected — they are supplied as streams by
 * {@link ReportFontRegistry}, never fetched by URI.
 */
@Service
public class ReportRenderer {

    private static final Logger log = LoggerFactory.getLogger(ReportRenderer.class);

    /**
     * Base URI handed to the renderer. Deliberately a path that does not
     * exist: nothing may resolve relative to the filesystem, and this makes a
     * template that tries look obviously wrong rather than accidentally work
     * on one machine.
     */
    private static final String BASE_URI = "file:///report-template/";

    private final ReportFontRegistry fonts;

    public ReportRenderer(ReportFontRegistry fonts) {
        this.fonts = fonts;
    }

    /** What a render refused to load, for the caller to surface or assert on. */
    public record Rendered(byte[] bytes, List<String> blockedUris) {
    }

    /**
     * The template could not be rendered. Its own type rather than
     * {@link IllegalStateException} because the handler maps that to 409, and
     * "your template is malformed" is not a conflict — it is an unprocessable
     * document, and the author needs the underlying message to fix it.
     */
    public static class RenderFailedException extends RuntimeException {
        public RenderFailedException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /**
     * Render substituted HTML to PDF.
     *
     * @throws RenderFailedException if the renderer fails — almost always
     *         malformed HTML in the template, so the underlying message is
     *         carried through to the author rather than swallowed.
     */
    public Rendered toPdf(String html) {
        List<String> blocked = new CopyOnWriteArrayList<>();
        ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
        long started = System.currentTimeMillis();
        try {
            PdfRendererBuilder builder = new PdfRendererBuilder();
            builder.useFastMode();
            builder.withHtmlContent(html, BASE_URI);
            fonts.applyTo(builder);
            builder.useSVGDrawer(new BatikSVGDrawer());
            builder.useUriResolver((baseUri, uri) -> {
                if (uri == null) {
                    return null;
                }
                if (uri.startsWith("data:")) {
                    return uri;
                }
                blocked.add(uri);
                return null;
            });
            // Belt and braces: even if a resolver returned a URI, there is no
            // stream factory registered for http/https, so nothing can be
            // opened over the network.
            builder.useHttpStreamImplementation(new DenyAllStreamFactory(blocked));
            builder.toStream(out);
            builder.run();
        } catch (Exception e) {
            throw new RenderFailedException("Could not render this template to PDF: "
                    + e.getMessage(), e);
        }
        if (!blocked.isEmpty()) {
            log.warn("Report render blocked {} external resource(s): {}",
                    blocked.size(), blocked);
        }
        log.debug("Rendered report PDF in {} ms ({} bytes)",
                System.currentTimeMillis() - started, out.size());
        return new Rendered(out.toByteArray(), List.copyOf(blocked));
    }

    /**
     * The interactive form. The HTML is already substituted; this only exists
     * so both formats go through one place and pick up the same font stack.
     */
    public String toHtml(String substitutedHtml) {
        return substitutedHtml;
    }

    /**
     * Refuses to open anything. Registered for http/https so a URL that
     * somehow survives the resolver still cannot reach the network.
     */
    private record DenyAllStreamFactory(List<String> blocked) implements FSStreamFactory {
        @Override
        public FSStream getUrl(String uri) {
            blocked.add(uri);
            return null;
        }
    }

}
