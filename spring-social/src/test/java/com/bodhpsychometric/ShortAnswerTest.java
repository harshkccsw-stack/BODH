package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionTemplate;

import com.bodhpsychometric.model.assessment.AssessmentAnswer;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.repository.assessment.AssessmentAnswerRepository;
import com.bodhpsychometric.repository.question.OptionRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
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

    @Autowired
    private OptionRepository options;

    @Autowired
    private QuestionRepository questions;

    @Autowired
    private AssessmentAnswerRepository answers;

    @Autowired
    private TransactionTemplate tx;

    /** The generated text slot as stored — the API never shows it. */
    private Option textSlot(long questionId) {
        return options.findTextAnswerOptions(List.of(questionId)).get(questionId);
    }

    /** Every option row the question owns in the database, hidden or not. */
    private List<String> storedOptions(long questionId) {
        return tx.execute(status -> questions.findById(questionId).orElseThrow().getOptions().stream()
                .map(o -> o.getContentType() + ":" + o.getOptionText())
                .toList());
    }

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

        // V40: ONE option IS stored — the generated text slot the answer row
        // will point at — FREE_TEXT, unlabelled, and absent from the API.
        assertThat(storedOptions(questionId)).containsExactly("FREE_TEXT:null");
        assertThat(textSlot(questionId)).isNotNull();
    }

    @Test
    void switchingTypeReplacesTheTextSlotAndLeavesNothingBehind() throws Exception {
        String body = postJson("/api/questions/create", shortAnswerJson("__smoke__ switch me", "", ""));
        int questionId = JsonPath.read(body, "$.questionId");
        long slotBefore = textSlot(questionId).getOptionId();

        // Unanswered, so the type may change: the slot goes, the choices come.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ switch me\","
                                + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":["
                                + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"rows\":[],\"mqtScores\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.options.length()").value(2));
        assertThat(storedOptions(questionId)).containsExactly("TEXT:Yes", "TEXT:No");
        assertThat(options.findById(slotBefore)).isEmpty();

        // And back: the choices go, a fresh slot comes, still hidden.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(shortAnswerJson("__smoke__ switch me", "", "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.options.length()").value(0));
        assertThat(storedOptions(questionId)).containsExactly("FREE_TEXT:null");
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

        // GAMES is built (V42) but takes a game, never authored options — a
        // payload with neither a gameId nor anything else to go on is refused.
        // The rest of its rules live in GamesTest.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"GAMES\","
                                + "\"stem\":\"__smoke__ games\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"Play\",\"contentType\":\"TEXT\","
                                + "\"mediaUrl\":null,\"mqtScores\":[]}],\"rows\":[],\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("needs a game")));
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
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
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

        // V40: the row carries the question's text slot AND the text, the
        // same shape as an "Other…" answer — the portal sent text only.
        List<AssessmentAnswer> stored = answers.findForExport((long) assessmentId, List.of((long) respondentUserId));
        assertThat(stored).hasSize(1);
        assertThat(stored.get(0).getOption()).isNotNull();
        assertThat(stored.get(0).getOption().getOptionId()).isEqualTo(textSlot(questionId).getOptionId());
        assertThat(stored.get(0).getOption().getContentType()).isEqualTo(ContentType.FREE_TEXT);
        assertThat(stored.get(0).getAnswerText()).isEqualTo("Busy, but good.");

        // Answered, yet still editable: the slot is regenerated identically,
        // so a stem edit does not read as "its options are locked".
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(shortAnswerJson("__smoke__ describe your week, briefly", "",
                                "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":3}")))
                .andExpect(status().isOk());
        assertThat(textSlot(questionId).getOptionId()).isEqualTo(stored.get(0).getOption().getOptionId());
    }
}
