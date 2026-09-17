package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * The backend behind the two-page flow: Report Setup answers placeholders on
 * the computation, and Generate Reports chooses who receives one at generation
 * time.
 *
 * <ol>
 *   <li>A published template needs no computation to exist: VALUE is a shape.</li>
 *   <li>{@code forTemplate} finds or creates the one computation per pair, with
 *       every formula rule of the assessment pinned.</li>
 *   <li>A placeholder is answered on the computation, and only with a pinned
 *       rule; template-answered tags are refused here.</li>
 *   <li>{@code generate} takes the recipients as an argument; a single final
 *       PDF requires approval and refuses a non-recipient.</li>
 * </ol>
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportSetupFlowTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void setupAnswersOnTheComputationAndGenerateChoosesRecipients() throws Exception {
        String bearer = auth();

        int mq = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__ Flow Drive\",\"description\":null}"), "$.measuredQualityId");
        int trait = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mq + ",\"parentTypeId\":null,\"name\":\"Flow Drive\"}"),
                "$.measuredQualityTypeId");
        String i1 = likertItem("__smoke__ FL1", trait);
        String i2 = likertItem("__smoke__ FL2", trait);

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ Flow QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + (int) JsonPath.read(i1, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":1},{\"questionId\":"
                                + (int) JsonPath.read(i2, "$.questionId")
                                + ",\"sectionId\":null,\"sortOrder\":2}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ Flow\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");

        int one = submit(assessmentId, "flow.one@test.local", new int[] { 4, 5 }, i1, i2);
        int two = submit(assessmentId, "flow.two@test.local", new int[] { 2, 2 }, i1, i2);
        allotOnly(assessmentId, "flow.idle@test.local");

        // ── the Rules step: one formula, one plain-language rule ──────────
        String score = rule("""
                {"name":"__smoke__ Flow score","stage":"SCORE","stepOrder":1,
                 "definitionKind":"EXPRESSION","expression":"[mqt:%d]","assessmentId":%d}"""
                .formatted(trait, assessmentId));
        String scoreSlug = JsonPath.read(score, "$.slug");
        rule("""
                {"name":"__smoke__ Flow prose","stage":"PROFILE","stepOrder":1,
                 "definitionKind":"STATEMENT","statementText":"Describe the drive.",
                 "assessmentId":%d}""".formatted(assessmentId));

        // ── (1) a template is finished with no computation in sight ──────
        String template = mvc.perform(post("/api/report-templates/create")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"__smoke__ Flow layout","description":null,
                                 "html":"<html><body><h1>${name}</h1><p>${score}</p></body></html>"}"""))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int templateId = JsonPath.read(template, "$.reportTemplateId");
        bind(bearer, templateId, "name", "{\"binderType\":\"CORE\",\"coreField\":\"core:name\"}");
        bind(bearer, templateId, "score", "{\"binderType\":\"VALUE\"}");
        mvc.perform(post("/api/report-templates/publish/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());

        // ── (2) the Layout step: the computation for this pair ────────────
        String created = mvc.perform(post("/api/report-computations/forTemplate")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId + ",\"reportTemplateId\":"
                                + templateId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("DIRECT"))
                .andExpect(jsonPath("$.reportTemplateId").value(templateId))
                .andReturn().getResponse().getContentAsString();
        int computationId = JsonPath.read(created, "$.reportComputationId");
        List<String> pinned = JsonPath.read(created, "$.rules[*].slug");
        assertEquals(List.of(scoreSlug), pinned,
                "every FORMULA rule of the assessment is pinned; the statement is not");

        String again = mvc.perform(post("/api/report-computations/forTemplate")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId + ",\"reportTemplateId\":"
                                + templateId + "}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals(computationId, (int) JsonPath.read(again, "$.reportComputationId"),
                "one computation per assessment and template");

        String byAssessment = mvc.perform(get("/api/report-computations/getByAssessment/" + assessmentId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals(List.of(computationId),
                JsonPath.<List<Integer>>read(byAssessment, "$[*].reportComputationId"));

        // ── (3) answering placeholders ────────────────────────────────────
        String unanswered = mvc.perform(post("/api/report-computations/check/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(JsonPath.<List<String>>read(unanswered, "$.blockers").stream()
                        .anyMatch(b -> b.contains("no rule chosen") && b.contains("score")),
                "an unanswered VALUE tag is named: " + unanswered);

        mvc.perform(put("/api/report-computations/answerTag/" + computationId + "/name")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ruleSlug\":\"" + scoreSlug + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("answered on the template")));
        mvc.perform(put("/api/report-computations/answerTag/" + computationId + "/score")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ruleSlug\":\"no-such\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("not pinned")));
        String answered = mvc.perform(put("/api/report-computations/answerTag/" + computationId + "/score")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ruleSlug\":\"" + scoreSlug + "\",\"format\":\"0.0\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertEquals(List.of(scoreSlug),
                JsonPath.<List<String>>read(answered, "$.tagGuidance[?(@.tag == 'score')].ruleSlug"));

        mvc.perform(post("/api/report-computations/check/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers").isEmpty());
        mvc.perform(post("/api/report-computations/approve/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));

        // Frozen: no re-pinning after approval.
        mvc.perform(post("/api/report-computations/repin/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict());

        // ── (4) who receives a report is chosen at generation time ────────
        String recipients = mvc.perform(get("/api/report-computations/recipients/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int attemptOne = JsonPath.<List<Integer>>read(recipients,
                "$[?(@.respondentUserId == " + one + ")].attemptId").get(0);
        int attemptTwo = JsonPath.<List<Integer>>read(recipients,
                "$[?(@.respondentUserId == " + two + ")].attemptId").get(0);
        int attemptIdle = JsonPath.<List<Integer>>read(recipients,
                "$[?(@.recipient == false)].attemptId").get(0);

        mvc.perform(post("/api/report-computations/generate/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"attemptIds\":[" + attemptOne + "]}"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Report-Count", "1"))
                .andExpect(header().string("X-Report-Skipped", "2"));

        // Asking for someone who has not finished is a refusal, not a silent skip.
        mvc.perform(post("/api/report-computations/generate/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"attemptIds\":[" + attemptIdle + "]}"))
                .andExpect(status().isBadRequest());

        // No body at all: everyone who completed, as before.
        mvc.perform(post("/api/report-computations/generate/" + computationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Report-Count", "2"));

        // One respondent's FINAL report, inline, with the answered format applied.
        var pdf = mvc.perform(get("/api/report-computations/report/" + computationId + "/"
                        + attemptTwo + ".pdf")
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/pdf"))
                .andReturn().getResponse().getContentAsByteArray();
        assertTrue(pdf.length > 500 && pdf[0] == '%' && pdf[1] == 'P', "a real PDF");

        mvc.perform(get("/api/report-computations/report/" + computationId + "/"
                        + attemptIdle + ".pdf")
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isConflict());

        // ── (5) a new version of the template keeps the answers ───────────
        // newVersion writes a NEW template row, so the approved computation
        // stays on the version it was approved against — and setting up the
        // new one used to mean answering every placeholder again from nothing.
        String v2 = mvc.perform(post("/api/report-templates/newVersion/" + templateId)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int v2Id = JsonPath.read(v2, "$.reportTemplateId");
        assertTrue(v2Id != templateId, "a version is a separate template row");
        mvc.perform(post("/api/report-templates/publish/" + v2Id)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk());

        String onV2 = mvc.perform(post("/api/report-computations/forTemplate")
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assessmentId\":" + assessmentId + ",\"reportTemplateId\":"
                                + v2Id + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andReturn().getResponse().getContentAsString();
        assertTrue((int) JsonPath.read(onV2, "$.reportComputationId") != computationId,
                "a new version gets its own computation; the approved one is untouched");
        assertEquals(List.of(scoreSlug),
                JsonPath.<List<String>>read(onV2, "$.tagGuidance[?(@.tag == 'score')].ruleSlug"),
                "the placeholder answers come across from the previous version");
        assertEquals(List.of("0.0"),
                JsonPath.<List<String>>read(onV2, "$.tagGuidance[?(@.tag == 'score')].format"),
                "and so does the format");
        mvc.perform(post("/api/report-computations/check/" + JsonPath.<Integer>read(
                        onV2, "$.reportComputationId"))
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.blockers").isEmpty());
    }

    // ── helpers ───────────────────────────────────────────────────────────

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
