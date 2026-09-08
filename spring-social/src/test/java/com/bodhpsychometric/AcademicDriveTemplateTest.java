package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.jayway.jsonpath.JsonPath;

/**
 * The Academic Drive report layout, proved to render.
 *
 * <p>A template is only worth shipping if it survives the renderer, and the
 * failures that matter here are all silent ones: a margin box with no
 * font-family prints the page number in an unembedded font, an external
 * resource arrives blank, and a tag nobody bound renders as nothing at all
 * rather than as an error. So this loads the real file, parses it the way the
 * editor does, binds every tag, and produces an actual PDF.
 *
 * <p>The template is checked in at
 * {@code src/main/resources/report-templates/academic-drive-report.html} so
 * the file the test proves is the same file an author pastes into the editor.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AcademicDriveTemplateTest {

    /** Tags filled from the respondent, not from a rule. */
    private static final String[][] CORE_TAGS = {
        { "respondent_name", "core:name" },
        { "serial_id", "core:serialId" },
        { "organization", "core:organizationName" },
        { "dob", "core:dob" },
        { "assessment_name", "core:assessmentName" },
        { "report_date", "core:reportDate" },
        { "protocol_status", "core:status" },
    };

    @Autowired
    private MockMvc mvc;

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + (String) JsonPath.read(body, "$.token");
    }

    private static String templateHtml() throws Exception {
        return new String(new ClassPathResource("report-templates/academic-drive-report.html")
                .getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }

    @Autowired
    private com.bodhpsychometric.service.report.TemplateTagParser parser;

    @Autowired
    private com.bodhpsychometric.service.report.ReportRenderer renderer;

    /**
     * The worst case: every tag resolves to nothing.
     *
     * <p>That is not hypothetical — a callout that does not apply, a profile
     * note that does not fire and a suppressed score all resolve to the empty
     * string, and a respondent can legitimately produce all three at once. The
     * document has to stay well-formed with every hole empty, including the one
     * inside {@code style="width: ${…}%"}, or the report fails for the quietest
     * respondents rather than the loudest.
     */
    @Test
    void theLayoutStillRendersWhenEveryValueIsEmpty() throws Exception {
        String html = templateHtml();
        java.util.Map<String, String> empty = new java.util.LinkedHashMap<>();
        parser.parse(html).forEach(tag -> empty.put(tag, ""));

        byte[] pdf = renderer.toPdf(parser.substitute(html, empty)).bytes();
        assertTrue(pdf.length > 1000, "an all-empty report is still a page");
        assertEquals('%', (char) pdf[0]);
    }

    @Test
    void theAcademicDriveLayoutParsesLintsCleanAndRendersAPdf() throws Exception {
        String bearer = auth();
        String html = templateHtml();

        String created = mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(new ObjectMapper().writeValueAsString(java.util.Map.of(
                                "name", "__smoke__ Academic Drive report",
                                "description", "Reference layout for the Academic Drive workbook",
                                "html", html))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int templateId = JsonPath.read(created, "$.reportTemplateId");

        // Every ${tag} the file contains became a binding row, in document order.
        List<String> tags = JsonPath.read(created, "$.bindings[*].tag");
        assertEquals(23, tags.size(), "the parser should find every placeholder: " + tags);
        assertTrue(tags.contains("internal_drive_pct"),
                "the bar width is a bound tag, so the bar IS the score: " + tags);

        // No lint ERROR — margin boxes carry a font-family and nothing loads
        // over the network. This is what publish refuses on.
        List<String> errors = JsonPath.read(created,
                "$.lint[?(@.severity == 'ERROR')].message");
        assertTrue(errors.isEmpty(), "the layout must publish as-is, but: " + errors);

        // Bind the respondent-derived tags for real; everything else is filled
        // by rules at delivery, so a literal stands in to make the page whole.
        for (String[] pair : CORE_TAGS) {
            mvc.perform(put("/api/report-templates/bindTag/" + templateId + "/" + pair[0])
                            .header(HttpHeaders.AUTHORIZATION, bearer)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"binderType\":\"CORE\",\"coreField\":\"" + pair[1] + "\"}"))
                    .andExpect(status().isOk());
        }
        for (String tag : tags) {
            if (java.util.Arrays.stream(CORE_TAGS).anyMatch(p -> p[0].equals(tag))) {
                continue;
            }
            // A percentage must be a number even in the stand-in, or the bar's
            // inline style becomes "width: sample%" and the row collapses.
            String value = tag.endsWith("_pct") ? "62" : "sample";
            mvc.perform(put("/api/report-templates/bindTag/" + templateId + "/" + tag)
                            .header(HttpHeaders.AUTHORIZATION, bearer)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"binderType\":\"LITERAL\",\"literalText\":\"" + value + "\"}"))
                    .andExpect(status().isOk());
        }

        mvc.perform(post("/api/report-templates/publish/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));

        var rendered = mvc.perform(get("/api/report-templates/preview/" + templateId + ".pdf")
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andReturn().getResponse();
        assertEquals(200, rendered.getStatus(),
                "render failed: " + rendered.getContentAsString());
        byte[] pdf = rendered.getContentAsByteArray();

        assertTrue(pdf.length > 2000, "a two-column A4 page should be well over 2 KB, was "
                + pdf.length + " bytes");
        assertEquals('%', (char) pdf[0]);
        assertEquals('P', (char) pdf[1]);
    }
}
