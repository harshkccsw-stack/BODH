package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * Phase A of the consolidation plan: the guards the documents described and
 * the code did not have.
 *
 * <ol>
 *   <li>A cohort-relative rule over fewer completed respondents than the
 *       minimum produces nothing, is reported {@code TOO_SMALL}, and blocks
 *       approval — instead of a z-score of exactly 0 for everybody.</li>
 *   <li>A SELECTED respondent scope narrows who RECEIVES a report and not the
 *       cohort the rules run over.</li>
 *   <li>Approval records who, when and over how many; a clone starts with
 *       none of that.</li>
 *   <li>The list endpoint computes no blockers at all, and the check endpoint
 *       is where the cohort is evaluated.</li>
 *   <li>An unfinished attempt is no longer banded by its blank score.</li>
 * </ol>
 *
 * <p>The test profile sets {@code app.report.min-cohort-size} to 3, so the
 * guard is exercised with two completions and released with the third.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportCohortGuardTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void cohortRelativeRulesWaitForTheMinimumAndApprovalIsRecorded() throws Exception {
        String bearer = auth();

        // ── the instrument: one trait, four Likert items ──────────────────
        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Guard Drive\",\"description\":null}"), "$.measuredQualityId");
        int trait = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,\"name\":\"Internal Drive\"}"),
                "$.measuredQualityTypeId");
        String i1 = likertItem("__smoke__ G1", trait);
        String i2 = likertItem("__smoke__ G2", trait);
        String i3 = likertItem("__smoke__ G3", trait);
        String i4 = likertItem("__smoke__ G4", trait);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Guard QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        StringBuilder placements = new StringBuilder("[");
        int order = 0;
        for (String item : new String[] { i1, i2, i3, i4 }) {
            placements.append(order == 0 ? "" : ",")
                    .append("{\"questionId\":").append((int) JsonPath.read(item, "$.questionId"))
                    .append(",\"sectionId\":null,\"sortOrder\":").append(++order).append("}");
        }
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(placements.append("]").toString()))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Guard Drive\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");

        // Two finish. One is allotted and never starts.
        int one = submit(assessmentId, "guard.one@test.local", new int[] { 4, 5, 2, 3 }, i1, i2, i3, i4);
        int two = submit(assessmentId, "guard.two@test.local", new int[] { 2, 2, 4, 2 }, i1, i2, i3, i4);
        allotOnly(assessmentId, "guard.idle@test.local");

        // ── the rules ─────────────────────────────────────────────────────
        String score = rule("""
                {"name":"__smoke__ Guard score","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]","assessmentId":%d}"""
                .formatted(trait, assessmentId));
        String scoreSlug = JsonPath.read(score, "$.slug");
        int scoreVersion = JsonPath.read(score, "$.latest.reportRuleVersionId");

        String z = rule("""
                {"name":"__smoke__ Guard z","stage":"SCORE","stepOrder":2,
                 "definitionKind":"EXPRESSION","expression":"ZSCORE([rule:%s])","assessmentId":%d}"""
                .formatted(scoreSlug, assessmentId));
        String zSlug = JsonPath.read(z, "$.slug");
        int zVersion = JsonPath.read(z, "$.latest.reportRuleVersionId");

        String band = rule("""
                {"name":"__smoke__ Guard band","stage":"BAND","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:%s], 0, 'Below average', 'At or above')",
                 "assessmentId":%d}""".formatted(zSlug, assessmentId));
        String bandSlug = JsonPath.read(band, "$.slug");
        int bandVersion = JsonPath.read(band, "$.latest.reportRuleVersionId");

        // (5) A band on the RAW score with an else branch. The idle attempt's
        // score is null; it used to fall into 'Low' because "" <= "10".
        String rawBand = rule("""
                {"name":"__smoke__ Guard raw band","stage":"BAND","stepOrder":2,
                 "definitionKind":"EXPRESSION",
                 "expression":"IF([rule:%s] <= 10, 'Low', 'High')","assessmentId":%d}"""
                .formatted(scoreSlug, assessmentId));
        String rawBandSlug = JsonPath.read(rawBand, "$.slug");
        int rawBandVersion = JsonPath.read(rawBand, "$.latest.reportRuleVersionId");

        // ── (1) the dry run says TOO_SMALL, and the band downstream errors ──
        String dry = mvc.perform(post("/api/report-rules/dry-run")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals("TOO_SMALL", ruleField(dry, zSlug, "status"),
                "two completed of a minimum of three: the z-score must not print");
        assertEquals("ERROR", ruleField(dry, bandSlug, "status"),
                "a band reading a suppressed z-score has nothing to band");
        assertEquals("EVALUATED", ruleField(dry, scoreSlug, "status"),
                "the raw score is not cohort-relative and runs regardless");
        // (5) Only the respondent who scored 10 is 'Low'. The idle attempt's
        // blank score used to satisfy "<= 10" as a string and made it two.
        assertEquals(1, ((Number) ruleField(dry, rawBandSlug, "summary.bands.Low")).intValue(),
                "exactly one real respondent scored 10 or under; the unfinished attempt "
                        + "must not be banded by its blank score");

        // ── the template and computation ──────────────────────────────────
        String template = mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Guard layout","description":null,
                                 "html":"<html><body><h1>${name}</h1><p>${band}</p></body></html>"}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int templateId = JsonPath.read(template, "$.reportTemplateId");
        bind(bearer, templateId, "name", "{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}");

        String created = mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Guard computation","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d,%d,%d,%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, scoreVersion, zVersion,
                                        bandVersion, rawBandVersion)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int computationId = JsonPath.read(created, "$.reportComputationId");

        bind(bearer, templateId, "band", "{\"binderType\":\"VALUE\"}");
        mvc.perform(put("/api/report-computations/answerTag/" + computationId + "/band")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ruleSlug\":\"" + bandSlug + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/report-templates/publish/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());

        // (4) A read carries only the cheap blockers — none here — while the
        // check carries the cohort's verdict.
        mvc.perform(get("/api/report-computations/getById/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.directBlockers").isEmpty());
        String check = mvc.perform(post("/api/report-computations/check/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(2))
                .andExpect(jsonPath("$.cohortSize").value(3))
                .andExpect(jsonPath("$.minCohortSize").value(3))
                .andReturn().getResponse().getContentAsString();
        assertTrue(JsonPath.<List<String>>read(check, "$.blockers").stream()
                        .anyMatch(b -> b.contains("compare respondents to the cohort")),
                "the check must name the guard: " + check);

        // (1) Approval refuses, naming the guard.
        mvc.perform(post("/api/report-computations/approve/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("compare respondents to the cohort")));

        // The list computes nothing per row.
        String list = mvc.perform(get("/api/report-computations/getAll")
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<Map<String, Object>> rows = JsonPath.read(list,
                "$[?(@.reportComputationId == " + computationId + ")]");
        assertEquals(1, rows.size());
        assertNull(rows.get(0).get("directBlockers"), "the list carries no blockers at all");

        // ── the third completion releases the guard ───────────────────────
        int three = submit(assessmentId, "guard.three@test.local", new int[] { 3, 3, 3, 3 },
                i1, i2, i3, i4);

        // ── try-before-accepting: unsaved formulae over the real cohort ──
        // A draft band on the raw score, and a draft that STANDS IN for the
        // saved score rule (same slug). Nothing is written by either.
        String drafts = mvc.perform(post("/api/report-rules/evaluate-draft")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"assessmentId":%d,"drafts":[
                                  {"slug":"draft-band","expression":"NORMBAND([rule:%s], 12, 'Low', 'High')"}
                                ]}""".formatted(assessmentId, scoreSlug)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals("EVALUATED", ruleField(drafts, "draft-band", "status"));
        assertEquals(1, ((Number) ruleField(drafts, "draft-band", "summary.bands.Low")).intValue(),
                "10 is below the draft cut of 12");
        assertEquals(2, ((Number) ruleField(drafts, "draft-band", "summary.bands.High")).intValue(),
                "14 and 12 are at or above it");

        String overridden = mvc.perform(post("/api/report-rules/evaluate-draft")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"assessmentId":%d,"drafts":[
                                  {"slug":"%s","expression":"[mqt:%d] * 2"},
                                  {"slug":"draft-band","expression":"NORMBAND([rule:%s], 12, 'Low', 'High')"}
                                ]}""".formatted(assessmentId, scoreSlug, trait, scoreSlug)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals(3, ((Number) ruleField(overridden, "draft-band", "summary.bands.High")).intValue(),
                "the draft score doubles everyone, so nobody is Low against the same cut");
        mvc.perform(get("/api/report-rules/getById/" + (int) JsonPath.read(score, "$.reportRuleId"))
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(jsonPath("$.latestVersion").value(1));

        // (2) Narrow the recipients to two of the three BEFORE approval.
        mvc.perform(put("/api/report-computations/update/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Guard computation","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d,%d,%d,%d],
                                 "sourcePrompt":"n/a","respondentScope":"SELECTED",
                                 "respondentIds":[%d,%d]}"""
                                .formatted(assessmentId, templateId, scoreVersion, zVersion,
                                        bandVersion, rawBandVersion, one, three)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/report-computations/check/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(3))
                .andExpect(jsonPath("$.blockers").isEmpty())
                .andExpect(jsonPath("$.rules[?(@.slug == '" + zSlug + "')].status").value("EVALUATED"));

        // (3) Approval is recorded.
        String approved = mvc.perform(post("/api/report-computations/approve/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.approvedCohortSize").value(3))
                .andReturn().getResponse().getContentAsString();
        assertNotNull(JsonPath.read(approved, "$.approvedByUserId"), "who approved");
        assertNotNull(JsonPath.read(approved, "$.approvedAt"), "when");

        // (2) The recipients list shows the cohort AND who gets a PDF.
        String recipients = mvc.perform(get("/api/report-computations/recipients/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals(4, JsonPath.<List<?>>read(recipients, "$[*]").size(),
                "three completed and one idle are all in the cohort");
        assertEquals(2, JsonPath.<List<?>>read(recipients, "$[?(@.recipient == true)]").size(),
                "only the two selected receive a report");
        assertEquals(List.of(two), JsonPath.<List<Integer>>read(recipients,
                "$[?(@.recipient == false && @.status == 'COMPLETED')].respondentUserId"),
                "the completed respondent outside the scope is listed and not a recipient");

        // (2) The batch honours the scope: two PDFs, two skipped (one idle,
        // one completed but not selected).
        var response = mvc.perform(post("/api/report-computations/generate/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Report-Count", "2"))
                .andExpect(header().string("X-Report-Skipped", "2"))
                .andReturn().getResponse();
        String manifest = null;
        int pdfs = 0;
        try (ZipInputStream zip =
                new ZipInputStream(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                byte[] bytes = zip.readAllBytes();
                if (entry.getName().equals("values.json")) {
                    manifest = new String(bytes, StandardCharsets.UTF_8);
                } else {
                    pdfs++;
                }
            }
        }
        assertEquals(2, pdfs);
        assertNotNull(manifest);
        assertTrue(manifest.contains("\"approvedCohortSize\": 3"),
                "the manifest records the cohort the approval was judged over: " + manifest);
        assertTrue(manifest.contains("\"approvedByUserId\": ") && !manifest.contains("\"approvedByUserId\": null"),
                "and who approved: " + manifest);

        // (3) A clone starts unapproved, with no provenance.
        mvc.perform(post("/api/report-computations/clone/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.approvedByUserId").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.approvedCohortSize").value(org.hamcrest.Matchers.nullValue()));
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private static Object ruleField(String dryRun, String slug, String path) {
        List<Object> hits = JsonPath.read(dryRun, "$.rules[?(@.slug == '" + slug + "')]." + path);
        return hits.isEmpty() ? null : hits.get(0);
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

    private void bind(String bearer, int templateId, String tag, String body) throws Exception {
        mvc.perform(put("/api/report-templates/bindTag/" + templateId + "/" + tag)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    private int respondent(int assessmentId, String email) throws Exception {
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ " + email + "\",\"email\":\"" + email + "\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\","
                        + "\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,"
                        + "\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":["
                        + respondentUserId + "]}");
        return respondentUserId;
    }

    private void allotOnly(int assessmentId, String email) throws Exception {
        respondent(assessmentId, email);
    }

    /** Creates, allots, begins and submits; returns the respondentUserId. */
    private int submit(int assessmentId, String email, int[] points, String... items)
            throws Exception {
        int respondentUserId = respondent(assessmentId, email);

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"2007-07-07\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        StringBuilder answers = new StringBuilder("[");
        for (int i = 0; i < items.length; i++) {
            answers.append(i == 0 ? "" : ",")
                    .append("{\"questionId\":").append((int) JsonPath.read(items[i], "$.questionId"))
                    .append(",\"optionId\":")
                    .append((int) JsonPath.read(items[i], "$.options[" + (points[i] - 1) + "].optionId"))
                    .append("}");
        }
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId)
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":" + answers.append("]") + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));
        return respondentUserId;
    }
}
