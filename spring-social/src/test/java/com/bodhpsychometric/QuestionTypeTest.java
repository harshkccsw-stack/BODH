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
 * The question TYPE axis: MCQ (what every payload written before the field
 * existed means) and LINEAR_SCALE, whose options are generated rather than
 * authored.
 *
 * The MCQ path is covered everywhere else — QuestionSelectionRuleTest's
 * payloads never mention a type, which is also the proof that omitting it
 * still means MCQ.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionTypeTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    /** A fresh MQT to map a question onto, returned as its id. */
    private int newMqt(String tag) throws Exception {
        String mq = postJson("/api/qualities/create",
                "{\"name\":\"" + tag + "\",\"description\":null}");
        int measuredQualityId = JsonPath.read(mq, "$.measuredQualityId");
        String mqt = postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":null,"
                        + "\"name\":\"" + tag + " type\"}");
        return JsonPath.read(mqt, "$.measuredQualityTypeId");
    }

    private static String scaleJson(String stem, String extraFields, String mqtScores) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"LINEAR_SCALE\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false," + extraFields
                + "\"options\":[],\"mqtScores\":[" + mqtScores + "]}";
    }

    @Test
    void aLinearScaleGeneratesItsFivePointsAndDerivesTheirScores() throws Exception {
        int mqtId = newMqt("__smoke__scale");

        String body = postJson("/api/questions/create", scaleJson("__smoke__ scale stem",
                "\"scaleLowLabel\":\"Smart\",\"scaleHighLabel\":\"Fool\",",
                "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":9}"));
        int questionId = JsonPath.read(body, "$.questionId");

        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionType").value("LINEAR_SCALE"))
                .andExpect(jsonPath("$.scaleLowLabel").value("Smart"))
                .andExpect(jsonPath("$.scaleHighLabel").value("Fool"))
                // Five points, in order, whatever the caller sent as options.
                .andExpect(jsonPath("$.options.length()").value(5))
                .andExpect(jsonPath("$.options[0].optionText").value("1"))
                .andExpect(jsonPath("$.options[4].optionText").value("5"))
                // The point picked IS the score: each generated point carries
                // its own value for the MQT the QUESTION was mapped to...
                .andExpect(jsonPath("$.options[0].mqtScores[0].measuredQualityTypeId").value(mqtId))
                .andExpect(jsonPath("$.options[0].mqtScores[0].score").value(1))
                .andExpect(jsonPath("$.options[4].mqtScores[0].score").value(5))
                // ...and the question-level row is a nomination, never a flat
                // score, however big a number the payload carried.
                .andExpect(jsonPath("$.mqtScores[0].measuredQualityTypeId").value(mqtId))
                .andExpect(jsonPath("$.mqtScores[0].score").value(0))
                // A scale is one pick — no rule leaks in.
                .andExpect(jsonPath("$.selectionRule").doesNotExist());
    }

    @Test
    void aLinearScaleCannotCarryASelectionRule() throws Exception {
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(scaleJson("__smoke__ scale ruled",
                                "\"selectionRule\":\"MAX\",\"selectionCount\":2,", "")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("one answer")));

        // A stray count with no rule is refused on a scale as well — the same
        // typo it always was, not something to silently drop.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(scaleJson("__smoke__ scale counted", "\"selectionCount\":2,", "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void switchingTypeReplacesTheOptionsAndClearsTheLabels() throws Exception {
        // Authored as an MCQ, with option-level scores of its own.
        String mcq = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ switch\",\"mediaUrl\":null,\"riskFlag\":false,"
                        + "\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}");
        int questionId = JsonPath.read(mcq, "$.questionId");
        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(jsonPath("$.questionType").value("MCQ"))
                .andExpect(jsonPath("$.options.length()").value(2));

        // → scale: the two authored options are replaced by the five points.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(scaleJson("__smoke__ switch",
                                "\"scaleLowLabel\":\"Low\",\"scaleHighLabel\":\"High\",", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.options.length()").value(5))
                .andExpect(jsonPath("$.scaleLowLabel").value("Low"));

        // → back to MCQ: the labels go with the type, so nothing is left
        // behind that no screen would ever show again.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ switch\","
                                + "\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"scaleLowLabel\":\"Low\",\"scaleHighLabel\":\"High\","
                                + "\"options\":["
                                + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionType").value("MCQ"))
                .andExpect(jsonPath("$.options.length()").value(2))
                .andExpect(jsonPath("$.scaleLowLabel").doesNotExist())
                .andExpect(jsonPath("$.scaleHighLabel").doesNotExist());
    }

    /**
     * The delivery half: a scale reaches the portal as a cap-1 question whose
     * options are the points, is answered like any other single-choice
     * question, and exports as the number picked.
     */
    @Test
    void aScaleIsDeliveredAndAnsweredLikeAnyOtherSingleChoiceQuestion() throws Exception {
        int mqtId = newMqt("__smoke__scaleportal");
        String questionBody = postJson("/api/questions/create", scaleJson("__smoke__ portal scale",
                "\"scaleLowLabel\":\"Never\",\"scaleHighLabel\":\"Always\",",
                "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":0}"));
        int questionId = JsonPath.read(questionBody, "$.questionId");
        int pointThree = JsonPath.read(questionBody, "$.options[2].optionId");

        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ scale QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ scale Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Scale Taker\",\"email\":\"scale.taker@test.local\",\"dob\":\"05-05-2005\","
                        + "\"phone\":null,\"gender\":null,\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"scale.taker@test.local\",\"dob\":\"2005-05-05\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // Rendered as a scale, gated as a single choice.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].questionType").value("LINEAR_SCALE"))
                .andExpect(jsonPath("$.questions[0].scaleLowLabel").value("Never"))
                .andExpect(jsonPath("$.questions[0].scaleHighLabel").value("Always"))
                .andExpect(jsonPath("$.questions[0].minSelections").value(1))
                .andExpect(jsonPath("$.questions[0].maxSelections").value(1))
                .andExpect(jsonPath("$.questions[0].options.length()").value(5))
                .andExpect(jsonPath("$.questions[0].options[2].optionText").value("3"));

        // Two points would breach the cap, exactly as on any single choice.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + pointThree + "},"
                                + "{\"questionId\":" + questionId + ",\"optionId\":"
                                + (int) (Integer) JsonPath.read(questionBody, "$.options[4].optionId") + "}]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId
                                + ",\"optionId\":" + pointThree + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // The export cell is the point picked — the option text, as always.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("3"));
    }

    @Test
    void bulkCreateValidatesTypeRulesBeforeWritingAny() throws Exception {
        int before = ((java.util.List<?>) JsonPath.read(
                mvc.perform(get("/api/questions/getAll")).andReturn().getResponse().getContentAsString(),
                "$[*].questionId")).size();

        mvc.perform(post("/api/questions/bulk-create").contentType(MediaType.APPLICATION_JSON)
                        .content("[" + scaleJson("__smoke__ bulk scale 1", "", "")
                                + "," + scaleJson("__smoke__ bulk scale 2",
                                        "\"selectionRule\":\"EQUALS\",\"selectionCount\":2,", "") + "]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("question 2")));

        int after = ((java.util.List<?>) JsonPath.read(
                mvc.perform(get("/api/questions/getAll")).andReturn().getResponse().getContentAsString(),
                "$[*].questionId")).size();
        org.junit.jupiter.api.Assertions.assertEquals(before, after,
                "a refused bulk must leave nothing behind");
    }
}
