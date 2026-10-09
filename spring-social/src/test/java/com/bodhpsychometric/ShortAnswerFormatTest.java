package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.stream.Collectors;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.dto.DsDatasetResponse;
import com.bodhpsychometric.service.datastudio.DataStudioDatasetService;
import com.jayway.jsonpath.JsonPath;

/**
 * What a SHORT_ANSWER accepts (V48): TEXT, or a WHOLE_NUMBER — digits only.
 * A rule on the short answer, not a type of its own, so the answer is stored
 * and scored exactly as any short answer is; what changes is the submit
 * check, the edit lock, and Data Studio reading the column as a number.
 *
 * Also pins the linear scale on an author-chosen range, beside it: the point
 * picked IS the trait score.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ShortAnswerFormatTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private DataStudioDatasetService datasets;

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

    private static String score(int mqtId, int value) {
        return "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":" + value + "}";
    }

    @Test
    void aShortAnswerStoresItsFormatAndAnyOtherTypeHasNone() throws Exception {
        // Omitted means TEXT — what every short answer meant before V48 — and
        // it is written down, not left null.
        int plain = JsonPath.read(postJson("/api/questions/create",
                shortAnswerJson("__smoke__ fmt plain", "", "")), "$.questionId");
        mvc.perform(get("/api/questions/getById/" + plain))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answerFormat").value("TEXT"));

        int whole = JsonPath.read(postJson("/api/questions/create",
                shortAnswerJson("__smoke__ fmt whole", "\"answerFormat\":\"WHOLE_NUMBER\",", "")), "$.questionId");
        mvc.perform(get("/api/questions/getById/" + whole))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answerFormat").value("WHOLE_NUMBER"));

        // Refused on any other type, TEXT included: it would be dropped, and
        // the caller would believe it was stored.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ fmt mcq\",\"mediaUrl\":null,"
                                + "\"riskFlag\":false,\"answerFormat\":\"TEXT\",\"options\":["
                                + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("only for a short answer")));

        // Switching away from SHORT_ANSWER clears it.
        mvc.perform(put("/api/questions/update/" + whole).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ fmt whole\","
                                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":["
                                + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"rows\":[],\"mqtScores\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answerFormat").doesNotExist());
    }

    @Test
    void aWholeNumberIsCheckedAtSubmitScoredForAnsweringAndReadAsANumber() throws Exception {
        int countMqt = newMqt("__smoke__fmtcount");
        int scaleMqt = newMqt("__smoke__fmtscale");

        // Q_1: whole number, worth 3 for answering. Q_2: a 0—10 scale.
        // Q_3: a text short answer.
        int numberQ = JsonPath.read(postJson("/api/questions/create",
                shortAnswerJson("__smoke__ how many books this year?", "\"answerFormat\":\"WHOLE_NUMBER\",",
                        score(countMqt, 3))), "$.questionId");
        String scaleBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"LINEAR_SCALE\",\"stem\":\"__smoke__ fmt scale\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"scaleFrom\":0,\"scaleTo\":10,"
                        + "\"options\":[],\"mqtScores\":[" + score(scaleMqt, 9) + "]}");
        int scaleQ = JsonPath.read(scaleBody, "$.questionId");
        int pointSeven = JsonPath.read(scaleBody, "$.options[7].optionId");
        int textQ = JsonPath.read(postJson("/api/questions/create",
                shortAnswerJson("__smoke__ fmt anything else?", "", "")), "$.questionId");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ fmt QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + numberQ + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + scaleQ + ",\"sectionId\":null,\"sortOrder\":2},"
                                + "{\"questionId\":" + textQ + ",\"sectionId\":null,\"sortOrder\":3}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ fmt Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Format Taker\",\"email\":\"format.taker@test.local\",\"dob\":\"06-06-2006\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"format.taker@test.local\",\"dob\":\"2006-06-06\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // The portal is told, so it can check as the respondent types.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].answerFormat").value("WHOLE_NUMBER"))
                .andExpect(jsonPath("$.questions[1].answerFormat").doesNotExist())
                .andExpect(jsonPath("$.questions[2].answerFormat").value("TEXT"));

        // Digits only: no decimal (dot or comma), no thousands separator, no
        // sign, no words, no inner space, at most 15 digits.
        for (String bad : new String[] { "12.5", "3,5", "1,000", "1 000", "-3", "+5", "five", "1234567890123456" }) {
            mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(answers(numberQ, bad, scaleQ, pointSeven, textQ)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value(Matchers.containsString("needs a number")));
        }
        // The TEXT short answer beside it still takes anything.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(answers(numberQ, "  42 ", scaleQ, pointSeven, textQ)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // Stored as typed (trimmed); scored for ANSWERING — 3, not 42 — and
        // the scale's point 7 is 7 on its trait, not the 9 the author typed.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionColumns[0].answerFormat").value("WHOLE_NUMBER"))
                .andExpect(jsonPath("$.questionColumns[1].answerFormat").doesNotExist())
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("42"))
                .andExpect(jsonPath("$.rows[0].answers.Q_2").value("7"))
                .andExpect(jsonPath("$.rows[0].mqtScores." + countMqt).value(3))
                .andExpect(jsonPath("$.rows[0].mqtScores." + scaleMqt).value(7));

        // Data Studio: the whole-number column is numeric, the others text.
        DsDatasetResponse ds = datasets.dataset((long) assessmentId, null).orElseThrow();
        Map<String, String> types = ds.columns().stream()
                .collect(Collectors.toMap(DsDatasetResponse.Column::key, DsDatasetResponse.Column::type));
        assertThat(types).containsEntry("ans:Q_1", "number")
                .containsEntry("ans:Q_2", "string")
                .containsEntry("ans:Q_3", "string");

        // Answered: TEXT → WHOLE_NUMBER would strand text answers, so it is
        // locked; WHOLE_NUMBER → TEXT only widens, so it passes.
        mvc.perform(put("/api/questions/update/" + textQ).contentType(MediaType.APPLICATION_JSON)
                        .content(shortAnswerJson("__smoke__ fmt anything else?", "\"answerFormat\":\"WHOLE_NUMBER\",", "")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("limited to numbers")));
        mvc.perform(put("/api/questions/update/" + numberQ).contentType(MediaType.APPLICATION_JSON)
                        .content(shortAnswerJson("__smoke__ how many books this year?", "\"answerFormat\":\"TEXT\",",
                                score(countMqt, 3))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answerFormat").value("TEXT"));
    }

    private static String answers(int numberQ, String typed, int scaleQ, int scalePoint, int textQ) {
        return "{\"answers\":["
                + "{\"questionId\":" + numberQ + ",\"answerText\":\"" + typed + "\"},"
                + "{\"questionId\":" + scaleQ + ",\"optionId\":" + scalePoint + "},"
                + "{\"questionId\":" + textQ + ",\"answerText\":\"Nothing, thanks\"}]}";
    }
}
