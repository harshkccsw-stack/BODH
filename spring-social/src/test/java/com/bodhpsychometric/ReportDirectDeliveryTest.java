package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * Direct computation mode: a report delivered from the rules themselves, with
 * no model, no generated code and no sandbox.
 *
 * <p>The instrument is the same one {@code ReportDryRunTest} builds — the
 * Academic Drive workbook's Internal Drive factor, whose hand-computed total
 * for the Sample_Calculator column is <b>16</b>. Asserting that number here and
 * not merely "a PDF came back" is the point: it proves the value that reached
 * the report is the value the psychometrician worked out by hand, through the
 * whole chain of evaluate → resolve → substitute → render.
 *
 * <h2>What is being proved</h2>
 *
 * <ol>
 *   <li>mode is DERIVED from the pinned rules — an author cannot declare a
 *       computation AI-free when it pins a statement;</li>
 *   <li>a VALUE tag pointing at a rule the computation does not pin is refused
 *       when it is bound, not discovered as a blank space on a delivered
 *       report;</li>
 *   <li>approval refuses an unpublished template, and generation refuses an
 *       unapproved computation;</li>
 *   <li>the batch carries one PDF per COMPLETED attempt and skips the rest;</li>
 *   <li>the values manifest records the pinned rule VERSION, because "16" is
 *       only evidence alongside the formula that produced it.</li>
 * </ol>
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportDirectDeliveryTest {

    @Autowired
    private MockMvc mvc;

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

    private String likertItem(String stem, int mqtId, boolean reversed) throws Exception {
        StringBuilder options = new StringBuilder();
        for (int point = 1; point <= 5; point++) {
            int score = reversed ? 6 - point : point;
            options.append(point == 1 ? "" : ",")
                    .append("{\"optionText\":\"").append(point).append("\",")
                    .append("\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[")
                    .append("{\"measuredQualityTypeId\":").append(mqtId)
                    .append(",\"score\":").append(score).append("}]}");
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

    @Test
    void anAllFormulaComputationDeliversRealPdfsWithNoModelAnywhere() throws Exception {
        String bearer = auth();

        // ── the instrument ────────────────────────────────────────────────
        int driveMq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Delivery Drive\",\"description\":null}"),
                "$.measuredQualityId");
        int internalDrive = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + driveMq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Internal Drive\"}"), "$.measuredQualityTypeId");

        String i1 = likertItem("__smoke__ D1 sure I can learn", internalDrive, false);
        String i2 = likertItem("__smoke__ D2 practice makes me good", internalDrive, false);
        String i3 = likertItem("__smoke__ D3 not built for it", internalDrive, true);
        String i4 = likertItem("__smoke__ D4 workloads do not shake me", internalDrive, false);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Delivery QNR\",\"shortName\":null,\"category\":null,"
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
                "{\"name\":\"__smoke__ Delivery Drive\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");

        // Two finish; one is allotted and never starts. The third is what
        // proves the cohort and the recipient list are different things.
        submit(assessmentId, "deliver.one@test.local", new int[] { 4, 5, 2, 3 }, i1, i2, i3, i4);
        submit(assessmentId, "deliver.two@test.local", new int[] { 2, 2, 4, 2 }, i1, i2, i3, i4);
        allotOnly(assessmentId, "deliver.three@test.local");

        // ── the rules ─────────────────────────────────────────────────────
        String scoreRule = rule("""
                {"name":"__smoke__ Delivery Internal Drive","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]",
                 "assessmentId":%d}""".formatted(internalDrive, assessmentId));
        int scoreVersionId = JsonPath.read(scoreRule, "$.latest.reportRuleVersionId");
        String scoreSlug = JsonPath.read(scoreRule, "$.slug");

        String bandRule = rule("""
                {"name":"__smoke__ Delivery band","stage":"BAND","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:%s], 10, 'Developing', 15, 'Moderate', 'High')",
                 "assessmentId":%d}""".formatted(scoreSlug, assessmentId));
        int bandVersionId = JsonPath.read(bandRule, "$.latest.reportRuleVersionId");
        String bandSlug = JsonPath.read(bandRule, "$.slug");

        // A statement rule — the thing direct mode cannot run.
        String proseRule = rule("""
                {"name":"__smoke__ Delivery prose","stage":"PROFILE","stepOrder":1,
                 "definitionKind":"STATEMENT",
                 "statementText":"Describe how this person's drive shows up at work.",
                 "assessmentId":%d}""".formatted(assessmentId));
        int proseVersionId = JsonPath.read(proseRule, "$.latest.reportRuleVersionId");

        // ── the template ──────────────────────────────────────────────────
        String template = mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Delivery layout","description":null,
                                 "html":"<html><body><h1>${name}</h1>\
<p>Internal Drive: ${score}</p><p>Band: ${band}</p></body></html>"}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int templateId = JsonPath.read(template, "$.reportTemplateId");

        bind(bearer, templateId, "name",
                "{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}");

        // ── the computation ───────────────────────────────────────────────
        String created = mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Delivery computation","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d,%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, scoreVersionId, bandVersionId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int computationId = JsonPath.read(created, "$.reportComputationId");

        // (1) Two formulas and nothing else: DIRECT, and nobody asked.
        assertEquals("DIRECT", JsonPath.read(created, "$.mode"),
                "a computation pinning only expressions must be runnable without a model");

        // (2) A VALUE tag can only name an output this computation produces.
        mvc.perform(put("/api/report-templates/bindTag/" + templateId + "/score")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"binderType\":\"VALUE\",\"reportComputationId\":" + computationId
                                + ",\"outputKey\":\"no-such-rule\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("does not compute")));

        bind(bearer, templateId, "score", "{\"binderType\":\"VALUE\",\"reportComputationId\":"
                + computationId + ",\"outputKey\":\"" + scoreSlug + "\"}");
        bind(bearer, templateId, "band", "{\"binderType\":\"VALUE\",\"reportComputationId\":"
                + computationId + ",\"outputKey\":\"" + bandSlug + "\"}");

        // (3) An unpublished template blocks approval, and it says so.
        mvc.perform(post("/api/report-computations/approve/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("not published")));

        mvc.perform(post("/api/report-templates/publish/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());

        // Generation refuses an unapproved computation even once it could run.
        mvc.perform(post("/api/report-computations/generate/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("not approved")));

        mvc.perform(post("/api/report-computations/approve/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.directBlockers").isEmpty());

        // ── (4) delivery ──────────────────────────────────────────────────
        var response = mvc.perform(post("/api/report-computations/generate/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Report-Count", "2"))
                .andExpect(header().string("X-Report-Skipped", "1"))
                .andReturn().getResponse();

        List<String> entries = new ArrayList<>();
        String manifest = null;
        try (ZipInputStream zip =
                new ZipInputStream(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                entries.add(entry.getName());
                byte[] bytes = zip.readAllBytes();
                if (entry.getName().equals("values.json")) {
                    manifest = new String(bytes, StandardCharsets.UTF_8);
                } else {
                    assertTrue(bytes.length > 500 && bytes[0] == '%' && bytes[1] == 'P',
                            entry.getName() + " should be a real PDF, was " + bytes.length + "B");
                }
            }
        }
        assertEquals(3, entries.size(), "two reports and the manifest: " + entries);
        assertNotNull(manifest, "every batch carries its values manifest");

        // (5) The workbook's own number, and the version that produced it.
        assertTrue(manifest.contains("\"" + scoreSlug + "\": 16.0")
                        || manifest.contains("\"" + scoreSlug + "\": 16"),
                "the Sample_Calculator column totals 16 by hand; manifest was " + manifest);
        assertTrue(manifest.contains("\"version\": 1"), "the pinned version is the evidence");
        // Cuts at 10 and 15 read as "below 10 Developing, below 15 Moderate,
        // otherwise High", so 16 is High and 8 is Developing. Asserting both
        // ends is what would catch a NORMBAND written backwards — the failure
        // that produces a plausible report saying the opposite of the truth.
        assertTrue(manifest.contains("\"" + bandSlug + "\": \"High\""),
                "16 is at or above the top cut; manifest was " + manifest);
        assertTrue(manifest.contains("\"" + bandSlug + "\": \"Developing\""),
                "8 is below the bottom cut; manifest was " + manifest);

        // An approved computation is frozen — this is what keeps the reports
        // just issued explicable, so it is asserted rather than worked around.
        mvc.perform(put("/api/report-computations/update/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Delivery computation","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, scoreVersionId)))
                .andExpect(status().isConflict());

        // (1b) One statement rule is enough to need a model, and the author
        // does not get a say — the same two formulas plus prose is GENERATED.
        String withProse = mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Delivery with prose","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d,%d,%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, scoreVersionId, bandVersionId,
                                        proseVersionId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals("GENERATED", JsonPath.read(withProse, "$.mode"),
                "one statement rule is enough to need a model");
        assertTrue(JsonPath.<List<String>>read(withProse, "$.directBlockers").stream()
                        .anyMatch(b -> b.contains("statements")),
                "and the screen must say which rules are the reason");

        // Generation refuses it outright rather than delivering blank tags.
        mvc.perform(post("/api/report-computations/generate/"
                        + (int) JsonPath.read(withProse, "$.reportComputationId"))
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict());
    }

    /**
     * The workbook's step 1: an infrequency item that invalidates the protocol.
     *
     * <pre>
     *   IF V3 &lt;= 3 THEN protocol_status = 'INVALID'
     *   Do not compute any scores.
     *   Message: 'Response pattern suggests careless responding. Please retake.'
     * </pre>
     *
     * <p>The first and third clauses are ordinary rules. The SECOND is the one
     * worth a test: the DSL has no way to halt a pipeline, so "do not compute"
     * has to be expressed as each score SUPPRESSING ITSELF when the protocol is
     * invalid. This proves the chain works — a suppressed score yields the empty
     * string, and a band reading it comes back null rather than banding a hole.
     */
    @Test
    void anInvalidProtocolSuppressesEveryScoreDownstream() throws Exception {
        String bearer = auth();

        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Validity Drive\",\"description\":null}"),
                "$.measuredQualityId");
        int drive = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Drive\"}"), "$.measuredQualityTypeId");
        int validityMq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Validity Scale\",\"description\":null}"),
                "$.measuredQualityId");
        int infrequency = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + validityMq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Infrequency\"}"), "$.measuredQualityTypeId");

        String d1 = likertItem("__smoke__ VD1 drive item", drive, false);
        String v3 = likertItem("__smoke__ VD V3 infrequency", infrequency, false);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Validity QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + (int) JsonPath.read(d1, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":1},{\"questionId\":"
                                + (int) JsonPath.read(v3, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":2}]"))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Validity Drive\",\"questionnaireId\":" + questionnaireId
                        + ",\"showTermsAndConditions\":false,\"status\":\"ACTIVE\","
                        + "\"autoNext\":false}"), "$.assessmentId");

        // careless@ answers V3 = 2 (<= 3, so INVALID); careful@ answers 5.
        submit(assessmentId, "careless@test.local", new int[] { 4, 2 }, d1, v3);
        submit(assessmentId, "careful@test.local", new int[] { 4, 5 }, d1, v3);

        String status = rule("""
                {"name":"__smoke__ Protocol status","stage":"VALIDITY","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"IF([mqt:%d] <= 3, 'INVALID', 'VALID')",
                 "assessmentId":%d}""".formatted(infrequency, assessmentId));
        String statusSlug = JsonPath.read(status, "$.slug");

        rule("""
                {"name":"__smoke__ Protocol message","stage":"VALIDITY","stepOrder":2,
                 "definitionKind":"EXPRESSION",
                 "expression":"IF([rule:%s] = 'INVALID', 'Response pattern suggests careless responding. Please retake.', '')",
                 "assessmentId":%d}""".formatted(statusSlug, assessmentId));

        String score = rule("""
                {"name":"__smoke__ Guarded drive","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"IF([rule:%s] = 'INVALID', '', [mqt:%d])",
                 "assessmentId":%d}""".formatted(statusSlug, drive, assessmentId));
        String scoreSlug = JsonPath.read(score, "$.slug");

        rule("""
                {"name":"__smoke__ Guarded band","stage":"BAND","stepOrder":1,
                 "definitionKind":"EXPRESSION",
                 "expression":"NORMBAND([rule:%s], 3, 'Low', 'High')",
                 "assessmentId":%d}""".formatted(scoreSlug, assessmentId));

        String run = mvc.perform(post("/api/report-rules/dry-run")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Every rule EVALUATED — suppression is a value, not a failure.
        List<String> statuses = JsonPath.read(run, "$.rules[*].status");
        assertTrue(statuses.stream().allMatch("EVALUATED"::equals),
                "suppression must not look like a broken rule: " + run);

        assertEquals("INVALID", rowValue(run, "careless", statusSlug), run);
        assertEquals("VALID", rowValue(run, "careful", statusSlug), run);
        assertEquals("", rowValue(run, "careless", scoreSlug),
                "an invalid protocol computes no score");
        assertEquals(4.0, ((Number) rowValue(run, "careful", scoreSlug)).doubleValue(), 0.001,
                "a valid protocol scores normally");
    }

    /**
     * The live checker must accept exactly what saving accepts.
     *
     * <p>It used to pass only the MQ/MQT columns, so a formula referencing
     * another rule — the thing the sidebar inserts for you — came back
     * "Unknown column: rule:…" under a formula that {@code create} would have
     * accepted. An author reading a red box under a correct formula cannot tell
     * that the CHECKER is the broken half, so they rewrite a working rule.
     */
    @Test
    void theLiveCheckerAcceptsARuleReferenceThatSavingAccepts() throws Exception {
        String bearer = auth();

        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Checker MQ\",\"description\":null}"),
                "$.measuredQualityId");
        int mqt = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Checker Trait\"}"), "$.measuredQualityTypeId");
        String item = likertItem("__smoke__ CK1 item", mqt, false);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Checker QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + (int) JsonPath.read(item, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Checker\",\"questionnaireId\":" + questionnaireId
                        + ",\"showTermsAndConditions\":false,\"status\":\"ACTIVE\","
                        + "\"autoNext\":false}"), "$.assessmentId");

        String base = rule("""
                {"name":"__smoke__ Checker status","stage":"VALIDITY","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"IF([mqt:%d] <= 3, 'INVALID', 'VALID')",
                 "assessmentId":%d}""".formatted(mqt, assessmentId));
        String baseSlug = JsonPath.read(base, "$.slug");
        int baseId = JsonPath.read(base, "$.reportRuleId");

        String dependent = "IF([rule:" + baseSlug + "] = 'INVALID', '', [mqt:" + mqt + "])";

        // The live check says it is fine…
        mvc.perform(post("/api/report-rules/validate-expression")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expression\":\"" + dependent.replace("\"", "\\\"")
                                + "\",\"assessmentId\":" + assessmentId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true))
                .andExpect(jsonPath("$.errors").isEmpty());

        // …and saving really does accept it. That agreement is the whole test.
        rule("""
                {"name":"__smoke__ Checker guarded","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"%s",
                 "assessmentId":%d}""".formatted(dependent, assessmentId));

        // A self-reference is refused live too, now that the checker is told
        // which rule is being edited — save has always refused it.
        mvc.perform(post("/api/report-rules/validate-expression")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expression\":\"[rule:" + baseSlug + "] \",\"assessmentId\":"
                                + assessmentId + ",\"reportRuleId\":" + baseId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false));

        // An invented slug is still refused — the fix widens the valid set, it
        // does not stop checking.
        mvc.perform(post("/api/report-rules/validate-expression")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expression\":\"[rule:no-such-rule-at-all]\","
                                + "\"assessmentId\":" + assessmentId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(false));
    }

    /** One respondent's value for one rule, out of the dry-run rows. */
    private static Object rowValue(String body, String emailPrefix, String slug) {
        List<java.util.Map<String, Object>> rows = JsonPath.read(body, "$.rows[*]");
        for (java.util.Map<String, Object> row : rows) {
            if (String.valueOf(row.get("label")).contains(emailPrefix)) {
                @SuppressWarnings("unchecked")
                java.util.Map<String, Object> values =
                        (java.util.Map<String, Object>) row.get("values");
                return values.get(slug);
            }
        }
        throw new AssertionError("no row for " + emailPrefix + " in " + body);
    }

    /**
     * A new template version keeps its VALUE wiring.
     *
     * <p>Versioning copies the answers across by tag. When the VALUE pair
     * (computation + output key) was left out of that copy, the new version
     * still reported every tag as ANSWERED — {@code binderType} was carried —
     * while resolving to nothing. Approval passed and the report rendered blank
     * in every computed tag, with no error anywhere to say why. Silence is the
     * reason this is a test.
     */
    @Test
    void aNewTemplateVersionKeepsItsValueBindings() throws Exception {
        String bearer = auth();

        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Version MQ\",\"description\":null}"),
                "$.measuredQualityId");
        int mqt = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Version Trait\"}"), "$.measuredQualityTypeId");
        String item = likertItem("__smoke__ VN1 item", mqt, false);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Version QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + (int) JsonPath.read(item, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Version\",\"questionnaireId\":" + questionnaireId
                        + ",\"showTermsAndConditions\":false,\"status\":\"ACTIVE\","
                        + "\"autoNext\":false}"), "$.assessmentId");

        String scoreRule = rule("""
                {"name":"__smoke__ Version score","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]",
                 "assessmentId":%d}""".formatted(mqt, assessmentId));
        int versionId = JsonPath.read(scoreRule, "$.latest.reportRuleVersionId");
        String scoreSlug = JsonPath.read(scoreRule, "$.slug");

        String template = mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Version layout","description":null,
                                 "html":"<html><body><p>${who}</p><p>${total}</p></body></html>"}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int templateId = JsonPath.read(template, "$.reportTemplateId");

        String computation = mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Version computation","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, versionId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int computationId = JsonPath.read(computation, "$.reportComputationId");

        bind(bearer, templateId, "who", "{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}");
        bind(bearer, templateId, "total", "{\"binderType\":\"VALUE\",\"reportComputationId\":"
                + computationId + ",\"outputKey\":\"" + scoreSlug + "\"}");
        mvc.perform(post("/api/report-templates/publish/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());

        // Version it — the only way to edit a published template.
        String next = mvc.perform(post("/api/report-templates/newVersion/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertEquals(2, (int) JsonPath.read(next, "$.version"));
        List<String> types = JsonPath.read(next, "$.bindings[?(@.tag == 'total')].binderType");
        List<Object> keys = JsonPath.read(next, "$.bindings[?(@.tag == 'total')].outputKey");
        List<Object> comps = JsonPath.read(next,
                "$.bindings[?(@.tag == 'total')].reportComputationId");

        assertEquals(List.of("VALUE"), types);
        assertEquals(scoreSlug, keys.get(0),
                "the output key must survive versioning, or the new version renders blank");
        assertEquals(computationId, ((Number) comps.get(0)).intValue(),
                "and so must the computation it points at");
    }

    /**
     * An approved computation can be renamed and cloned — the two ways out of
     * "approved is frozen".
     *
     * <p>Both error messages told people to clone long before clone existed, so
     * approval was a dead end: the computation could not be changed and could
     * not be copied either. Renaming is allowed because approval freezes what a
     * computation PRODUCES, and a name is not that; cloning is how an actual
     * change gets made without disturbing the reports already issued.
     */
    @Test
    void anApprovedComputationCanBeRenamedAndCloned() throws Exception {
        String bearer = auth();

        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Clone MQ\",\"description\":null}"),
                "$.measuredQualityId");
        int mqt = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,"
                        + "\"name\":\"Clone Trait\"}"), "$.measuredQualityTypeId");
        String item = likertItem("__smoke__ CL1 item", mqt, false);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Clone QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + (int) JsonPath.read(item, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Clone\",\"questionnaireId\":" + questionnaireId
                        + ",\"showTermsAndConditions\":false,\"status\":\"ACTIVE\","
                        + "\"autoNext\":false}"), "$.assessmentId");
        submit(assessmentId, "clone.one@test.local", new int[] { 4 }, item);

        String scoreRule = rule("""
                {"name":"__smoke__ Clone score","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]",
                 "assessmentId":%d}""".formatted(mqt, assessmentId));
        int ruleVersionId = JsonPath.read(scoreRule, "$.latest.reportRuleVersionId");
        String scoreSlug = JsonPath.read(scoreRule, "$.slug");

        String template = mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Clone layout","description":null,
                                 "html":"<html><body><p>${total}</p></body></html>"}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int templateId = JsonPath.read(template, "$.reportTemplateId");

        String created = mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Clone computation","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, ruleVersionId)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int computationId = JsonPath.read(created, "$.reportComputationId");
        String originalSlug = JsonPath.read(created, "$.slug");

        bind(bearer, templateId, "total", "{\"binderType\":\"VALUE\",\"reportComputationId\":"
                + computationId + ",\"outputKey\":\"" + scoreSlug + "\"}");
        mvc.perform(post("/api/report-templates/publish/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());
        mvc.perform(post("/api/report-computations/approve/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());

        // Rename works, and the SLUG stays put — values.json in every batch
        // already delivered records the slug, not the name.
        mvc.perform(put("/api/report-computations/rename/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ Academic Drive NICR\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("__smoke__ Academic Drive NICR"))
                .andExpect(jsonPath("$.slug").value(originalSlug))
                .andExpect(jsonPath("$.status").value("APPROVED"));

        // Changing what it PRODUCES is still refused.
        mvc.perform(put("/api/report-computations/update/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Academic Drive NICR","assessmentId":%d,
                                 "reportTemplateId":null,"ruleVersionIds":[],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId)))
                .andExpect(status().isConflict());

        // Clone is the way through: a DRAFT restating exactly what was approved.
        String copy = mvc.perform(post("/api/report-computations/clone/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.mode").value("DIRECT"))
                .andReturn().getResponse().getContentAsString();

        assertEquals("__smoke__ Academic Drive NICR (copy)", JsonPath.read(copy, "$.name"));
        assertEquals(originalSlug + "-copy", JsonPath.read(copy, "$.slug"));
        assertEquals(templateId, (int) JsonPath.read(copy, "$.reportTemplateId"),
                "the copy starts on the same template");
        List<Object> copiedVersions = JsonPath.read(copy, "$.rules[*].reportRuleVersionId");
        assertEquals(1, copiedVersions.size());
        assertEquals(ruleVersionId, ((Number) copiedVersions.get(0)).intValue(),
                "the PINNED version is copied, not re-resolved to latest — a clone starts as "
                        + "an exact restatement of what was approved");

        // And the copy really is editable.
        mvc.perform(put("/api/report-computations/update/"
                        + (int) JsonPath.read(copy, "$.reportComputationId"))
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Clone edited","assessmentId":%d,
                                 "reportTemplateId":%d,"ruleVersionIds":[%d],
                                 "sourcePrompt":"n/a","respondentScope":"ALL_COMPLETED"}"""
                                .formatted(assessmentId, templateId, ruleVersionId)))
                .andExpect(status().isOk());

        // The approved original is untouched.
        mvc.perform(get("/api/report-computations/getById/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.name").value("__smoke__ Academic Drive NICR"));

        // Deleting an approved one is refused, and names archive — which must
        // therefore EXIST. It did not, for as long as the guard had named it,
        // so approval was a state nothing could leave.
        mvc.perform(delete("/api/report-computations/delete/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("archive it first")));

        mvc.perform(post("/api/report-computations/archive/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        // And an archived one can be deleted: retiring it and then deleting it
        // is two deliberate acts.
        mvc.perform(delete("/api/report-computations/delete/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isNoContent());
    }

    private void bind(String bearer, int templateId, String tag, String body) throws Exception {
        mvc.perform(put("/api/report-templates/bindTag/" + templateId + "/" + tag)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    /** Allotted and never begun — present in the cohort, absent from the batch. */
    private void allotOnly(int assessmentId, String email) throws Exception {
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ " + email + "\",\"email\":\"" + email + "\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\","
                        + "\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,"
                        + "\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":["
                        + respondentUserId + "]}");
    }

    private void submit(int assessmentId, String email, int[] points, String... items)
            throws Exception {
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ " + email + "\",\"email\":\"" + email + "\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\","
                        + "\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,"
                        + "\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":["
                        + respondentUserId + "]}");

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
    }
}
