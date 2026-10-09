package com.bodhpsychometric;

import static org.hamcrest.Matchers.containsString;
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
 * Optional questions (per placement) and the per-assessment question layout
 * (V41), end to end.
 *
 * The rules under test: an optional question may be left blank, but once it
 * is touched it is held to its rule like a required one — a grid is every row
 * or none, a multi-select still meets its count. The flag rides the
 * questionnaire's replace-all PUT (omitted = unchanged), and once anyone has
 * started it may only move required → optional. A completed attempt reports
 * how many optional questions it skipped. The layout is presentation only and
 * reaches the portal live.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OptionalQuestionAndLayoutTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String option(String text) {
        return "{\"optionText\":\"" + text + "\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}";
    }

    private String createMcq(String stem, String extraFields) throws Exception {
        return postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,\"riskFlag\":false,"
                        + extraFields + "\"options\":[" + option("A") + "," + option("B") + "," + option("C") + "],"
                        + "\"mqtScores\":[]}");
    }

    private String createGrid(String stem) throws Exception {
        return postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\",\"stem\":\"" + stem + "\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,"
                        + "\"options\":[" + option("Low") + "," + option("High") + "],"
                        + "\"rows\":[{\"rowText\":\"Row one\",\"mqtScores\":[]},"
                        + "{\"rowText\":\"Row two\",\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}");
    }

    private int createShortAnswer(String stem) throws Exception {
        return JsonPath.read(postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"SHORT_ANSWER\",\"stem\":\"" + stem + "\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[],\"rows\":[],\"mqtScores\":[]}"),
                "$.questionId");
    }

    private void putPlacements(int questionnaireId, String body, int expectedStatus) throws Exception {
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void optionalQuestionsMayBeSkippedButNotHalfAnswered() throws Exception {
        String required = createMcq("__smoke__ optional: required one", "");
        int requiredId = JsonPath.read(required, "$.questionId");
        int requiredOption = JsonPath.read(required, "$.options[0].optionId");

        // Optional AND multi-select: blank is fine, one pick is still short.
        String multi = createMcq("__smoke__ optional: pick two",
                "\"selectionRule\":\"MIN\",\"selectionCount\":2,");
        int multiId = JsonPath.read(multi, "$.questionId");
        int multiA = JsonPath.read(multi, "$.options[0].optionId");

        String grid = createGrid("__smoke__ optional: grid");
        int gridId = JsonPath.read(grid, "$.questionId");
        int gridLow = JsonPath.read(grid, "$.options[0].optionId");
        int rowOne = JsonPath.read(grid, "$.rows[0].questionRowId");

        int shortId = createShortAnswer("__smoke__ optional: comments");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ optional QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        putPlacements(questionnaireId,
                "[{\"questionId\":" + requiredId + ",\"sectionId\":null,\"sortOrder\":0},"
                        + "{\"questionId\":" + multiId + ",\"sectionId\":null,\"sortOrder\":1,\"optional\":true},"
                        + "{\"questionId\":" + gridId + ",\"sectionId\":null,\"sortOrder\":2,\"optional\":true},"
                        + "{\"questionId\":" + shortId + ",\"sectionId\":null,\"sortOrder\":3,\"optional\":true}]",
                200);

        // Re-saved by a caller that does not know the flag (an upload, an old
        // screen): OMITTED means unchanged, never "back to required".
        putPlacements(questionnaireId,
                "[{\"questionId\":" + requiredId + ",\"sectionId\":null,\"sortOrder\":0},"
                        + "{\"questionId\":" + multiId + ",\"sectionId\":null,\"sortOrder\":1},"
                        + "{\"questionId\":" + gridId + ",\"sectionId\":null,\"sortOrder\":2},"
                        + "{\"questionId\":" + shortId + ",\"sectionId\":null,\"sortOrder\":3}]",
                200);
        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].optional").value(false))
                .andExpect(jsonPath("$[1].optional").value(true))
                .andExpect(jsonPath("$[2].optional").value(true))
                .andExpect(jsonPath("$[3].optional").value(true));
        // A bank-wide read has no placement to speak for.
        mvc.perform(get("/api/questions/getById/" + requiredId))
                .andExpect(jsonPath("$.optional").doesNotExist());

        // No layout sent → one question per page, as before.
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ optional Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        mvc.perform(get("/api/assessments/getById/" + assessmentId))
                .andExpect(jsonPath("$.questionLayout").value("ONE_PER_PAGE"));

        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Optional Taker\",\"email\":\"optional.taker@test.local\","
                        + "\"dob\":\"06-06-2006\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\","
                        + "\"gender\":\"FEMALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"optional.taker@test.local\",\"dob\":\"2006-06-06\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionLayout").value("ONE_PER_PAGE"))
                .andExpect(jsonPath("$.questions[0].optional").value(false))
                .andExpect(jsonPath("$.questions[1].optional").value(true))
                .andExpect(jsonPath("$.questions[2].optional").value(true))
                .andExpect(jsonPath("$.questions[3].optional").value(true));

        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // The REQUIRED question still has to be answered — and only it is named.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"answers\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("1 question is still pending")))
                .andExpect(jsonPath("$.message").value(containsString("Q1")));

        // Touching an optional grid makes it all-or-nothing: one row rated of two.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + requiredId + ",\"optionId\":" + requiredOption + "},"
                                + "{\"questionId\":" + gridId + ",\"optionId\":" + gridLow
                                + ",\"questionRowId\":" + rowOne + "}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("1 question is still pending")))
                .andExpect(jsonPath("$.message").value(containsString("Q3")));

        // An answered optional question still meets its selection rule.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + requiredId + ",\"optionId\":" + requiredOption + "},"
                                + "{\"questionId\":" + multiId + ",\"optionId\":" + multiA + "}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("needs at least 2 selections")));

        // Required answered, every optional one left blank: complete.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + requiredId + ",\"optionId\":" + requiredOption + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // "Answered 1 of 4 · 3 optional skipped" — finished, not lost answers.
        mvc.perform(get("/api/reports/getRespondentDetail/" + respondentUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessments[0].attemptStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.assessments[0].answeredQuestions").value(1))
                .andExpect(jsonPath("$.assessments[0].totalQuestions").value(4))
                .andExpect(jsonPath("$.assessments[0].skippedOptionalQuestions").value(3));

        // Someone has started: optional → required is refused, because their
        // attempt was promised it could skip...
        putPlacements(questionnaireId,
                "[{\"questionId\":" + requiredId + ",\"sectionId\":null,\"sortOrder\":0},"
                        + "{\"questionId\":" + multiId + ",\"sectionId\":null,\"sortOrder\":1,\"optional\":false},"
                        + "{\"questionId\":" + gridId + ",\"sectionId\":null,\"sortOrder\":2},"
                        + "{\"questionId\":" + shortId + ",\"sectionId\":null,\"sortOrder\":3}]",
                409);
        // ...while required → optional only ever lets more submissions through.
        putPlacements(questionnaireId,
                "[{\"questionId\":" + requiredId + ",\"sectionId\":null,\"sortOrder\":0,\"optional\":true},"
                        + "{\"questionId\":" + multiId + ",\"sectionId\":null,\"sortOrder\":1},"
                        + "{\"questionId\":" + gridId + ",\"sectionId\":null,\"sortOrder\":2},"
                        + "{\"questionId\":" + shortId + ",\"sectionId\":null,\"sortOrder\":3}]",
                200);
        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(jsonPath("$[0].optional").value(true))
                .andExpect(jsonPath("$[1].optional").value(true));
    }

    @Test
    void optionalToRequiredIsFreeBeforeAnyoneStarts() throws Exception {
        int questionId = JsonPath.read(createMcq("__smoke__ optional: flip", ""), "$.questionId");
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ optional flip QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        putPlacements(questionnaireId,
                "[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":0,\"optional\":true}]", 200);
        putPlacements(questionnaireId,
                "[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":0,\"optional\":false}]", 200);
        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(jsonPath("$[0].optional").value(false));
    }

    @Test
    void layoutIsStoredAndReachesThePortalLive() throws Exception {
        int questionId = JsonPath.read(createMcq("__smoke__ layout: one", ""), "$.questionId");
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ layout QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        putPlacements(questionnaireId, "[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":0}]", 200);

        String create = "{\"name\":\"__smoke__ layout Assessment\",\"questionnaireId\":" + questionnaireId + ","
                + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false,"
                + "\"questionLayout\":\"SECTION_PER_PAGE\"}";
        int assessmentId = JsonPath.read(postJson("/api/assessments/create", create), "$.assessmentId");
        mvc.perform(get("/api/assessments/getById/" + assessmentId))
                .andExpect(jsonPath("$.questionLayout").value("SECTION_PER_PAGE"));

        // An unknown value is refused, not silently defaulted.
        mvc.perform(put("/api/assessments/update/" + assessmentId).contentType(MediaType.APPLICATION_JSON)
                        .content(create.replace("SECTION_PER_PAGE", "TWO_PER_PAGE")))
                .andExpect(status().isBadRequest());

        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Layout Taker\",\"email\":\"layout.taker@test.local\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\","
                        + "\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"layout.taker@test.local\",\"dob\":\"2007-07-07\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(jsonPath("$.questionLayout").value("SECTION_PER_PAGE"));

        // Read live off the assessment: flipping it back shows on the next load.
        mvc.perform(put("/api/assessments/update/" + assessmentId).contentType(MediaType.APPLICATION_JSON)
                        .content(create.replace("SECTION_PER_PAGE", "ONE_PER_PAGE")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(jsonPath("$.questionLayout").value("ONE_PER_PAGE"));
    }

    /**
     * V47: a section may override the assessment's layout for its own
     * questions. Null = the assessment decides; the section PUT replaces
     * every field, so leaving the layout out hands it back.
     */
    @Test
    void aSectionCanOverrideTheAssessmentLayout() throws Exception {
        int q1 = JsonPath.read(createMcq("__smoke__ section layout: one", ""), "$.questionId");
        int q2 = JsonPath.read(createMcq("__smoke__ section layout: two", ""), "$.questionId");
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ section layout QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":true}"), "$.questionnaireId");
        String sectionA = postJson("/api/questionnaire/" + questionnaireId + "/sections",
                "{\"name\":\"Battery\",\"instruction\":null,\"questionLayout\":\"SECTION_PER_PAGE\"}");
        int sectionAId = JsonPath.read(sectionA, "$.sectionId");
        org.junit.jupiter.api.Assertions.assertEquals("SECTION_PER_PAGE", JsonPath.read(sectionA, "$.questionLayout"));
        int sectionBId = JsonPath.read(postJson("/api/questionnaire/" + questionnaireId + "/sections",
                "{\"name\":\"Scenarios\",\"instruction\":null}"), "$.sectionId");
        putPlacements(questionnaireId,
                "[{\"questionId\":" + q1 + ",\"sectionId\":" + sectionAId + ",\"sortOrder\":0},"
                        + "{\"questionId\":" + q2 + ",\"sectionId\":" + sectionBId + ",\"sortOrder\":0}]", 200);

        mvc.perform(get("/api/questionnaire/" + questionnaireId + "/sections"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].questionLayout").value("SECTION_PER_PAGE"))
                .andExpect(jsonPath("$[1].questionLayout").doesNotExist());

        // An unknown value is refused, not read as "use the assessment's".
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/sections/" + sectionBId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Scenarios\",\"instruction\":null,\"questionLayout\":\"TWO_PER_PAGE\"}"))
                .andExpect(status().isBadRequest());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ section layout Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false,"
                        + "\"questionLayout\":\"ONE_PER_PAGE\"}"), "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Section Layout Taker\",\"email\":\"section.layout.taker@test.local\","
                        + "\"dob\":\"08-08-2008\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\","
                        + "\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"section.layout.taker@test.local\",\"dob\":\"2008-08-08\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        // The assessment's layout is the default; each section says its own.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(jsonPath("$.questionLayout").value("ONE_PER_PAGE"))
                .andExpect(jsonPath("$.sections[0].questionLayout").value("SECTION_PER_PAGE"))
                .andExpect(jsonPath("$.sections[1].questionLayout").doesNotExist());

        // A rename that leaves the layout out hands the section back to the
        // assessment — and the portal sees it at once (the PUT evicts the cache).
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/sections/" + sectionAId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Battery, renamed\",\"instruction\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionLayout").doesNotExist());
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(jsonPath("$.sections[0].questionLayout").doesNotExist());
    }
}
