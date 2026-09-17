package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * Adopting a library rule is a COPY, dependencies included, references
 * rewritten — the "adopt" button the portability panel showed verdicts for
 * and never had.
 *
 * <p>Three things are pinned: the closure comes along and the copied band
 * reads the copied score, not the original; a second adoption is refused
 * rather than duplicated; and a rule the target cannot score fails the whole
 * copy with nothing written.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportRuleForkTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void forkingCopiesTheClosureAndRewritesItsReferences() throws Exception {
        String bearer = auth();

        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Fork Drive\",\"description\":null}"), "$.measuredQualityId");
        int trait = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,\"name\":\"Fork Drive\"}"),
                "$.measuredQualityTypeId");
        int other = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,\"name\":\"Fork Other\"}"),
                "$.measuredQualityTypeId");
        String i1 = likertItem("__smoke__ F1", trait);
        String i2 = likertItem("__smoke__ F2", trait);
        String o1 = likertItem("__smoke__ FO1", other);

        // A and B both score the trait; C scores something else entirely.
        int a = assessment("A", i1, i2);
        int b = assessment("B", i1, i2);
        int c = assessment("C", o1);

        String score = rule("""
                {"name":"__smoke__ Fork score","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]","assessmentId":%d}"""
                .formatted(trait, a));
        String scoreSlug = JsonPath.read(score, "$.slug");
        String band = rule("""
                {"name":"__smoke__ Fork band","stage":"BAND","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:%s], 5, 'Low', 'High')","assessmentId":%d}"""
                .formatted(scoreSlug, a));
        int bandId = JsonPath.read(band, "$.reportRuleId");

        // ── copy the band onto B: the score comes with it, rewired ────────
        String copied = mvc.perform(post("/api/report-rules/fork/" + bandId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + b + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> slugs = JsonPath.read(copied, "$[*].slug");
        assertEquals(List.of("a" + b + "-" + scoreSlug, "a" + b + "-" + JsonPath.read(band, "$.slug")),
                slugs, "dependency first, then the rule asked for, both prefixed");
        List<Integer> homes = JsonPath.read(copied, "$[*].assessmentId");
        assertEquals(List.of(b, b), homes, "both copies are homed on B");
        String copiedBandExpression = JsonPath.read(copied, "$[1].latest.expression");
        assertTrue(copiedBandExpression.contains("[rule:a" + b + "-" + scoreSlug + "]"),
                "the copied band reads the COPIED score: " + copiedBandExpression);
        assertTrue(!copiedBandExpression.contains("[rule:" + scoreSlug + "]"),
                "and no longer the original");
        String notes = JsonPath.read(copied, "$[1].latest.notes");
        assertTrue(notes.contains("Copied from"), "provenance is written into the notes: " + notes);

        // ── a second adoption is refused, not duplicated ──────────────────
        mvc.perform(post("/api/report-rules/fork/" + bandId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + b + "}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("already")));

        // ── C cannot score the trait: refused, and nothing is written ─────
        mvc.perform(post("/api/report-rules/fork/" + bandId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + c + "}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("mqt:" + trait)));
        String all = mvc.perform(get("/api/report-rules/getAll")
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals(0, JsonPath.<List<?>>read(all, "$[?(@.assessmentId == " + c + ")]").size(),
                "all or nothing: the refused copy left no rule behind on C");

        // Copying onto its own home is refused too.
        mvc.perform(post("/api/report-rules/fork/" + bandId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + a + "}"))
                .andExpect(status().isConflict());
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private int assessment(String label, String... items) throws Exception {
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Fork QNR " + label + "\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        StringBuilder placements = new StringBuilder("[");
        int order = 0;
        for (String item : items) {
            placements.append(order == 0 ? "" : ",")
                    .append("{\"questionId\":").append((int) JsonPath.read(item, "$.questionId"))
                    .append(",\"sectionId\":null,\"sortOrder\":").append(++order).append("}");
        }
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placements.append("]").toString()))
                .andExpect(status().isOk());
        return JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Fork " + label + "\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
    }

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + (String) JsonPath.read(body, "$.token");
    }

    private String likertItem(String stem, int mqtId) throws Exception {
        StringBuilder options = new StringBuilder();
        for (int point = 1; point <= 5; point++) {
            options.append(point == 1 ? "" : ",")
                    .append("{\"optionText\":\"").append(point).append("\",")
                    .append("\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[")
                    .append("{\"measuredQualityTypeId\":").append(mqtId)
                    .append(",\"score\":").append(point).append("}]}");
        }
        return postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":[" + options + "],\"mqtScores\":[]}");
    }

    private String rule(String json) throws Exception {
        return mvc.perform(post("/api/report-rules/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }
}
