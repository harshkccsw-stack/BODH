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
 * SHORT_ANSWER — the first question type with no options. The answer is text
 * in {@code AssessmentAnswer.answerText}, the question-level MQT score is
 * earned for ANSWERING (not for what was written), and everything that
 * assumes an option has to step around it.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ShortAnswerTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private int newMqt(String tag) throws Exception {
        String mq = postJson("/api/qualities/create", "{\"name\":\"" + tag + "\",\"description\":null}");
        int measuredQualityId = JsonPath.read(mq, "$.measuredQualityId");
        String mqt = postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":null,"
                        + "\"name\":\"" + tag + " type\"}");
        return JsonPath.read(mqt, "$.measuredQualityTypeId");
    }

    private static String shortAnswerJson(String stem, String extraFields, String mqtScores) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"SHORT_ANSWER\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false," + extraFields
                + "\"options\":[],\"rows\":[],\"mqtScores\":[" + mqtScores + "]}";
    }

    @Test
    void aShortAnswerHasNoOptionsButKeepsItsQuestionLevelScore() throws Exception {
        int mqtId = newMqt("__smoke__shortq");
        String body = postJson("/api/questions/create",
                shortAnswerJson("__smoke__ what did you notice?", "",
                        "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":3}"));
        int questionId = JsonPath.read(body, "$.questionId");

        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionType").value("SHORT_ANSWER"))
                .andExpect(jsonPath("$.options.length()").value(0))
                .andExpect(jsonPath("$.rows.length()").value(0))
                .andExpect(jsonPath("$.selectionRule").doesNotExist())
                // Kept, and kept AS WRITTEN — unlike a linear scale, whose
                // question-level row is normalised to 0.
                .andExpect(jsonPath("$.mqtScores[0].measuredQualityTypeId").value(mqtId))
                .andExpect(jsonPath("$.mqtScores[0].score").value(3));
    }

    @Test
    void everythingThatImpliesOptionsIsRefused() throws Exception {
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"SHORT_ANSWER\","
                                + "\"stem\":\"__smoke__ short with options\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                                + "\"mqtScores\":[]}],\"rows\":[],\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("no options")));

        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(shortAnswerJson("__smoke__ short ruled",
                                "\"selectionRule\":\"MAX\",\"selectionCount\":2,", "")))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(shortAnswerJson("__smoke__ short shuffled", "\"shuffleOptions\":true,", "")))
                .andExpect(status().isBadRequest());

        // PARAGRAPH is in the enum only so widening it was paid for once —
        // nothing may write it until the type is built.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"PARAGRAPH\","
                                + "\"stem\":\"__smoke__ paragraph\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[],\"rows\":[],\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("not available yet")));
    }

    @Test
    void itIsDeliveredTypedSubmittedAndExportedAsText() throws Exception {
        int mqtId = newMqt("__smoke__shortportal");
        String questionBody = postJson("/api/questions/create",
                shortAnswerJson("__smoke__ describe your week", "",
                        "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":3}"));
        int questionId = JsonPath.read(questionBody, "$.questionId");

        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ short QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ short Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Short Taker\",\"email\":\"short.taker@test.local\",\"dob\":\"05-05-2005\","
                        + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"short.taker@test.local\",\"dob\":\"2005-05-05\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].questionType").value("SHORT_ANSWER"))
                .andExpect(jsonPath("$.questions[0].options.length()").value(0))
                .andExpect(jsonPath("$.questions[0].rows.length()").value(0));

        // Blank is not an answer, and neither is silence.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"answerText\":\"   \"}]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"answers\":[]}"))
                .andExpect(status().isBadRequest());

        // Picking is not typing: an option on a short answer is refused, and
        // so is a second answer for the same question.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":1}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("answerText")));
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"answerText\":\"one\"},"
                                + "{\"questionId\":" + questionId + ",\"answerText\":\"two\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("twice")));

        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId
                                + ",\"answerText\":\"  Busy, but good.  \"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // The sheet reads the text straight out of answerText — trimmed, and
        // with no option to look up.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("Busy, but good."));
    }
}
