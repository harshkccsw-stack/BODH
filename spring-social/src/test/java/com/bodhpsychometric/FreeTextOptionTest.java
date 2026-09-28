package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * The FREE_TEXT option — the Google-Forms "Other…" row on an MCQ. Picked like
 * any option, and its typed text rides on the SAME answer row as the
 * optionId. Not the SHORT_ANSWER question type ({@link ShortAnswerTest}).
 */
@SpringBootTest
@AutoConfigureMockMvc
class FreeTextOptionTest {

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

    private static String option(String text, String contentType, String mediaUrl, String scores) {
        return "{\"optionText\":" + (text == null ? "null" : "\"" + text + "\"")
                + ",\"contentType\":\"" + contentType + "\",\"mediaUrl\":"
                + (mediaUrl == null ? "null" : "\"" + mediaUrl + "\"")
                + ",\"mqtScores\":[" + scores + "]}";
    }

    /** Four ordinary options plus the "Other…" row, the question the feature was asked for. */
    private static String mcqWithOther(String stem, String extraFields, String options) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false," + extraFields
                + "\"options\":[" + options + "],\"rows\":[],\"mqtScores\":[]}";
    }

    private static String fourPlusOther(int mqtId) {
        return option("Red", "TEXT", null, "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":1}") + ","
                + option("Green", "TEXT", null, "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":2}") + ","
                + option("Blue", "TEXT", null, "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":3}") + ","
                + option("Yellow", "TEXT", null, "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":4}") + ","
                + option("Other", "FREE_TEXT", null, "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":0.5}");
    }

    @Test
    void anMcqMayCarryOneLabelledOtherOptionAndNothingElseMay() throws Exception {
        int mqtId = newMqt("__smoke__othermqt");
        String body = postJson("/api/questions/create",
                mcqWithOther("__smoke__ favourite colour?", "", fourPlusOther(mqtId)));
        int questionId = JsonPath.read(body, "$.questionId");

        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.options.length()").value(5))
                .andExpect(jsonPath("$.options[4].contentType").value("FREE_TEXT"))
                .andExpect(jsonPath("$.options[4].optionText").value("Other"))
                // It scores like any option: the score is for CHOOSING Other.
                .andExpect(jsonPath("$.options[4].mqtScores[0].score").value(0.5));

        // Two "Other" rows.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(mcqWithOther("__smoke__ two others", "",
                                option("A", "TEXT", null, "") + "," + option("Other", "FREE_TEXT", null, "")
                                        + "," + option("Something else", "FREE_TEXT", null, ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("only one short-answer option")));

        // No label — the text IS the button.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(mcqWithOther("__smoke__ unlabelled other", "",
                                option("A", "TEXT", null, "") + ","
                                        + option(null, "FREE_TEXT", "https://x.test/a.png", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("needs a label")));

        // A media URL on a text box.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(mcqWithOther("__smoke__ media other", "",
                                option("A", "TEXT", null, "") + ","
                                        + option("Other", "FREE_TEXT", "https://x.test/a.png", ""))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("media URL")));

        // The stem cannot be one.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"FREE_TEXT\",\"questionType\":\"MCQ\","
                                + "\"stem\":\"__smoke__ free stem\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[" + option("A", "TEXT", null, "") + "," + option("B", "TEXT", null, "")
                                + "],\"rows\":[],\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("stem")));

        // A grid's columns are a shared scale.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\","
                                + "\"stem\":\"__smoke__ grid other\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[" + option("Agree", "TEXT", null, "") + ","
                                + option("Other", "FREE_TEXT", null, "") + "],"
                                + "\"rows\":[{\"rowText\":\"Row one\",\"measuredQualityTypeIds\":[" + mqtId + "]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("shared rating scale")));
    }

    @Test
    void itIsDeliveredLastUnderShuffleAndSubmittedWithItsText() throws Exception {
        int mqtId = newMqt("__smoke__otherportal");
        String questionBody = postJson("/api/questions/create",
                mcqWithOther("__smoke__ how do you commute?", "\"shuffleOptions\":true,", fourPlusOther(mqtId)));
        int questionId = JsonPath.read(questionBody, "$.questionId");

        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ other QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ other Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":true}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Other Taker\",\"email\":\"other.taker@test.local\",\"dob\":\"05-05-2005\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000001\",\"gender\":\"FEMALE\",\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"other.taker@test.local\",\"dob\":\"2005-05-05\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // Shuffled — but "Other" is the escape hatch after the alternatives,
        // so it is delivered LAST whatever the seed did to the rest.
        String detail = mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].options.length()").value(5))
                .andExpect(jsonPath("$.questions[0].options[4].contentType").value("FREE_TEXT"))
                .andExpect(jsonPath("$.questions[0].options[4].sortOrder").value(4))
                .andReturn().getResponse().getContentAsString();
        int otherId = JsonPath.read(detail, "$.questions[0].options[4].optionId");
        int redId = -1;
        for (int i = 0; i < 4; i++) {
            if ("Red".equals(JsonPath.read(detail, "$.questions[0].options[" + i + "].optionText"))) {
                redId = JsonPath.read(detail, "$.questions[0].options[" + i + "].optionId");
            }
        }

        // Picking Other and writing nothing is not an answer.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + otherId + "}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("written in")));
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + otherId
                                + ",\"answerText\":\"   \"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("written in")));

        // Text on an ordinary option is still refused.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + redId
                                + ",\"answerText\":\"crimson\"}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("not by typing")));

        // Other with its text: one row carrying both.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + otherId
                                + ",\"answerText\":\"  Cycle, mostly  \"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // The OPTION is what scores (0.5 for choosing Other); the text is not
        // a number. The export cell shows what they WROTE, behind the label
        // so the choice stays countable — trimmed, like a short answer.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("Other: Cycle, mostly"));
    }
}
