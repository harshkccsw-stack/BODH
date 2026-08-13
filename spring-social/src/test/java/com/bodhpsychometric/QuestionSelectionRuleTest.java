package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * How many options a respondent may pick: the author-time rules on the
 * question endpoints, and what the portal's submit does with them.
 *
 * The single-choice path is covered by PortalAssessmentControllerTest, whose
 * payloads never mention a rule — which is also the proof that omitting the
 * two fields still means one option.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionSelectionRuleTest {

    @Autowired
    private MockMvc mvc;

    /** A question payload with `n` options, and whatever selection fields are passed. */
    private static String questionJson(String stem, int optionCount, String selectionFields) {
        StringBuilder options = new StringBuilder();
        for (int i = 0; i < optionCount; i++) {
            options.append(i == 0 ? "" : ",")
                    .append("{\"optionText\":\"opt").append(i + 1)
                    .append("\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}");
        }
        return "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,\"riskFlag\":false,"
                + selectionFields
                + "\"options\":[" + options + "],\"mqtScores\":[]}";
    }

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    // ── Author time ──────────────────────────────────────────────────────

    @Test
    void selectionRuleAndCountAreValidatedAgainstTheOptionList() throws Exception {
        // A count with no rule is a typo, not something to silently drop.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("sel orphan count", 3, "\"selectionCount\":2,")))
                .andExpect(status().isBadRequest());

        // A rule with no count, or a count below 1, cannot be applied.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("sel orphan rule", 3, "\"selectionRule\":\"MAX\",")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("sel zero", 3,
                                "\"selectionRule\":\"MIN\",\"selectionCount\":0,")))
                .andExpect(status().isBadRequest());

        // More than the question has to give.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("sel too many", 3,
                                "\"selectionRule\":\"EQUALS\",\"selectionCount\":4,")))
                .andExpect(status().isBadRequest());

        // Blank option rows are dropped before counting, so this is 2 options,
        // not 3 — the count must be checked against what actually gets stored.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"stem\":\"sel blank row\",\"mediaUrl\":null,"
                                + "\"riskFlag\":false,\"selectionRule\":\"EQUALS\",\"selectionCount\":3,"
                                + "\"options\":["
                                + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"B\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"  \",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest());

        // Valid, and echoed back on both the create and the read.
        String body = postJson("/api/questions/create",
                questionJson("sel valid max", 4, "\"selectionRule\":\"MAX\",\"selectionCount\":2,"));
        int questionId = JsonPath.read(body, "$.questionId");
        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.selectionRule").value("MAX"))
                .andExpect(jsonPath("$.selectionCount").value(2));

        // No rule at all → single choice, both fields null.
        String plain = postJson("/api/questions/create", questionJson("sel none", 2, ""));
        int plainId = JsonPath.read(plain, "$.questionId");
        mvc.perform(get("/api/questions/getById/" + plainId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.selectionRule").doesNotExist())
                .andExpect(jsonPath("$.selectionCount").doesNotExist());

        // Clearing the rule clears the count with it, even when the payload
        // still carries one.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("sel valid max", 4, "\"selectionCount\":2,")))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("sel valid max", 4, "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.selectionRule").doesNotExist())
                .andExpect(jsonPath("$.selectionCount").doesNotExist());
    }

    @Test
    void bulkCreateValidatesEverySelectionRuleBeforeWritingAny() throws Exception {
        int before = ((java.util.List<?>) JsonPath.read(
                mvc.perform(get("/api/questions/getAll")).andReturn().getResponse().getContentAsString(),
                "$[*].questionId")).size();

        // Item 2 of 3 is broken: the whole batch must be refused, and the
        // message must name the position (a return mid-write would commit
        // item 1 behind the error).
        mvc.perform(post("/api/questions/bulk-create").contentType(MediaType.APPLICATION_JSON)
                        .content("[" + questionJson("sel bulk 1", 3, "\"selectionRule\":\"MAX\",\"selectionCount\":2,")
                                + "," + questionJson("sel bulk 2", 3, "\"selectionRule\":\"EQUALS\",\"selectionCount\":9,")
                                + "," + questionJson("sel bulk 3", 3, "") + "]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("question 2")));

        int after = ((java.util.List<?>) JsonPath.read(
                mvc.perform(get("/api/questions/getAll")).andReturn().getResponse().getContentAsString(),
                "$[*].questionId")).size();
        org.junit.jupiter.api.Assertions.assertEquals(before, after,
                "a refused bulk must leave nothing behind");

        // The same batch with item 2 fixed writes all three, rules intact.
        mvc.perform(post("/api/questions/bulk-create").contentType(MediaType.APPLICATION_JSON)
                        .content("[" + questionJson("sel bulk 1", 3, "\"selectionRule\":\"MAX\",\"selectionCount\":2,")
                                + "," + questionJson("sel bulk 2", 3, "\"selectionRule\":\"EQUALS\",\"selectionCount\":3,")
                                + "," + questionJson("sel bulk 3", 3, "") + "]"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].selectionRule").value("MAX"))
                .andExpect(jsonPath("$[1].selectionCount").value(3))
                .andExpect(jsonPath("$[2].selectionRule").doesNotExist());
    }

    // ── Delivery ─────────────────────────────────────────────────────────

    /** questionId, its three optionIds, the assessment, and a logged-in respondent. */
    private record Fixture(int questionId, int optionA, int optionB, int optionC,
            int assessmentId, int respondentUserId, String token, int mappingId) {
    }

    /** One EQUALS-2 question of three options, placed, assigned and begun. */
    private Fixture buildMultiFixture(String tag, String email, String dobCreate, String dobLogin,
            String selectionFields) throws Exception {
        String questionBody = postJson("/api/questions/create",
                questionJson(tag + " stem", 3, selectionFields));
        int questionId = JsonPath.read(questionBody, "$.questionId");

        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"" + tag + " QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"" + tag + " Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"" + tag + " Taker\",\"email\":\"" + email + "\",\"dob\":\"" + dobCreate + "\","
                        + "\"phone\":null,\"gender\":null,\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"" + dobLogin + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        return new Fixture(questionId,
                JsonPath.read(questionBody, "$.options[0].optionId"),
                JsonPath.read(questionBody, "$.options[1].optionId"),
                JsonPath.read(questionBody, "$.options[2].optionId"),
                assessmentId, respondentUserId, token, mappingId);
    }

    private static String answers(int questionId, int... optionIds) {
        StringBuilder sb = new StringBuilder("{\"answers\":[");
        for (int i = 0; i < optionIds.length; i++) {
            sb.append(i == 0 ? "" : ",")
                    .append("{\"questionId\":").append(questionId)
                    .append(",\"optionId\":").append(optionIds[i]).append("}");
        }
        return sb.append("]}").toString();
    }

    @Test
    void portalEnforcesTheSelectionRuleAndStoresOneRowPerOption() throws Exception {
        Fixture f = buildMultiFixture("Sel Equals", "sel.equals@test.local", "05-05-2005", "2005-05-05",
                "\"selectionRule\":\"EQUALS\",\"selectionCount\":2,");
        String bearer = "Bearer " + f.token();

        // The portal is told the rule AND the bounds it resolves to.
        mvc.perform(get("/api/portal/assessments/getById/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].selectionRule").value("EQUALS"))
                .andExpect(jsonPath("$.questions[0].selectionCount").value(2))
                .andExpect(jsonPath("$.questions[0].minSelections").value(2))
                .andExpect(jsonPath("$.questions[0].maxSelections").value(2));

        // Below the floor and above the cap are both refused.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionA())))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionA(), f.optionB(), f.optionC())))
                .andExpect(status().isBadRequest());

        // A repeated (question, option) pair is deduped, not rejected: it
        // would otherwise breach uqAaRespondentAssessmentQuestionOption and
        // surface as a 500 at commit. Three entries, two distinct → valid.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionA(), f.optionB(), f.optionA())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.isPersisted").value(true));

        // Two rows landed, and the export joins them in option order.
        mvc.perform(get("/api/reports/export/assessment/" + f.assessmentId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("opt1; opt2"));

        // The popup counts QUESTIONS, not answer rows: 1 of 1, never 2 of 1.
        mvc.perform(get("/api/reports/getRespondentDetail/" + f.respondentUserId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessments[0].answeredQuestions").value(1))
                .andExpect(jsonPath("$.assessments[0].totalQuestions").value(1));

        // With answers on the books, how many options it takes is locked.
        mvc.perform(put("/api/questions/update/" + f.questionId()).contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("Sel Equals stem", 3,
                                "\"selectionRule\":\"EQUALS\",\"selectionCount\":3,")))
                .andExpect(status().isConflict());
        // …but an edit that leaves the rule alone still goes through.
        mvc.perform(put("/api/questions/update/" + f.questionId()).contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("Sel Equals stem edited", 3,
                                "\"selectionRule\":\"EQUALS\",\"selectionCount\":2,")))
                .andExpect(status().isOk());
    }

    @Test
    void maxRuleAcceptsAnythingFromOneUpToTheCap() throws Exception {
        Fixture f = buildMultiFixture("Sel Max", "sel.max@test.local", "07-07-2007", "2007-07-07",
                "\"selectionRule\":\"MAX\",\"selectionCount\":2,");
        String bearer = "Bearer " + f.token();

        mvc.perform(get("/api/portal/assessments/getById/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(jsonPath("$.questions[0].minSelections").value(1))
                .andExpect(jsonPath("$.questions[0].maxSelections").value(2));

        // Zero selections is still "unanswered" — every question is mandatory.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"answers\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionA(), f.optionB(), f.optionC())))
                .andExpect(status().isBadRequest());

        // One is enough under MAX.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionC())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));
    }

    @Test
    void minRuleHasNoCeilingBeyondTheOptionList() throws Exception {
        Fixture f = buildMultiFixture("Sel Min", "sel.min@test.local", "08-08-2008", "2008-08-08",
                "\"selectionRule\":\"MIN\",\"selectionCount\":2,");
        String bearer = "Bearer " + f.token();

        mvc.perform(get("/api/portal/assessments/getById/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(jsonPath("$.questions[0].minSelections").value(2))
                .andExpect(jsonPath("$.questions[0].maxSelections").value(3));

        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionA())))
                .andExpect(status().isBadRequest());

        // All three is fine — MIN puts no ceiling on how many they tick.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId()).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(f.questionId(), f.optionA(), f.optionB(), f.optionC())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        mvc.perform(get("/api/reports/export/assessment/" + f.assessmentId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("opt1; opt2; opt3"));
    }
}
