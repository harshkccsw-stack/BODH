package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * shuffleOptions: the author-time rules, and what the portal actually
 * delivers. The order is never stored — it is derived per attempt from
 * (mappingId, questionId) — so the properties worth pinning down are that one
 * attempt always sees the SAME order, different attempts do not all see the
 * same one, and the delivered list is always a permutation of the authored
 * options with sortOrder renumbered to match.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionShuffleOptionsTest {

    /** Enough options that two attempts landing on the same order by chance is 1 in 40320. */
    private static final int OPTIONS = 8;

    @Autowired
    private MockMvc mvc;

    private static String questionJson(String stem, int optionCount, String extraFields) {
        StringBuilder options = new StringBuilder();
        for (int i = 0; i < optionCount; i++) {
            options.append(i == 0 ? "" : ",")
                    .append("{\"optionText\":\"opt").append(i + 1)
                    .append("\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}");
        }
        return "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,\"riskFlag\":false,"
                + extraFields
                + "\"options\":[" + options + "],\"mqtScores\":[]}";
    }

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    // ── Author time ──────────────────────────────────────────────────────

    @Test
    void shuffleIsStoredOnAnMcqAndRefusedOnOrderedTypes() throws Exception {
        String body = postJson("/api/questions/create",
                questionJson("__smoke__ shuffle on", 3, "\"shuffleOptions\":true,"));
        int questionId = JsonPath.read(body, "$.questionId");
        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shuffleOptions").value(true))
                // The bank read is always the AUTHORED order — only delivery shuffles.
                .andExpect(jsonPath("$.options[0].optionText").value("opt1"))
                .andExpect(jsonPath("$.options[0].sortOrder").value(0));

        // Omitting the field means what it always meant: authored order.
        String plain = postJson("/api/questions/create", questionJson("__smoke__ shuffle absent", 3, ""));
        mvc.perform(get("/api/questions/getById/" + (int) JsonPath.read(plain, "$.questionId")))
                .andExpect(jsonPath("$.shuffleOptions").value(false));

        // A scale's points are ordinal; a grid's columns are one shared rating
        // scale. Both refuse the flag rather than quietly dropping it.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"LINEAR_SCALE\","
                                + "\"stem\":\"__smoke__ shuffled scale\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"shuffleOptions\":true,\"scaleLowLabel\":\"Low\",\"scaleHighLabel\":\"High\","
                                + "\"options\":[],\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\","
                                + "\"stem\":\"__smoke__ shuffled grid\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"shuffleOptions\":true,"
                                + "\"options\":["
                                + "{\"optionText\":\"C1\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"C2\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"rows\":[{\"rowText\":\"Row one\",\"measuredQualityTypeIds\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest());

        // Switching a shuffled MCQ to a scale drops the flag instead of
        // leaving one behind that would reorder the points 1—5.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"LINEAR_SCALE\","
                                + "\"stem\":\"__smoke__ shuffle on\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[],\"mqtScores\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shuffleOptions").value(false));
    }

    // ── Delivery ─────────────────────────────────────────────────────────

    /** The option ids, in the order this attempt is served them. */
    private List<Integer> deliveredOrder(int mappingId, String token) throws Exception {
        String body = mvc.perform(get("/api/portal/assessments/getById/" + mappingId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.questions[0].options[*].optionId");
    }

    /** A logged-in respondent assigned to `assessmentId`, with their attempt begun. */
    private record Taker(String token, int mappingId) {
    }

    private Taker newTaker(String tag, String email, int assessmentId) throws Exception {
        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"" + tag + "\",\"email\":\"" + email + "\",\"dob\":\"09-09-2009\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"2009-09-09\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());
        return new Taker(token, mappingId);
    }

    /** questionId + the authored option ids, placed in an ACTIVE assessment. */
    private record Delivery(int questionId, List<Integer> authoredOptionIds, int assessmentId) {
    }

    private Delivery buildDelivery(String tag, boolean shuffle) throws Exception {
        String questionBody = postJson("/api/questions/create",
                questionJson(tag + " stem", OPTIONS, shuffle ? "\"shuffleOptions\":true," : ""));
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
        return new Delivery(questionId,
                JsonPath.read(questionBody, "$.options[*].optionId"),
                JsonPath.read(assessmentBody, "$.assessmentId"));
    }

    @Test
    void aShuffledQuestionIsStablePerAttemptAndDiffersBetweenAttempts() throws Exception {
        Delivery d = buildDelivery("__smoke__ Shuffle", true);
        Taker one = newTaker("__smoke__ Shuffle One", "shuffle.one@test.local", d.assessmentId());
        Taker two = newTaker("__smoke__ Shuffle Two", "shuffle.two@test.local", d.assessmentId());
        Taker three = newTaker("__smoke__ Shuffle Three", "shuffle.three@test.local", d.assessmentId());

        List<Integer> first = deliveredOrder(one.mappingId(), one.token());

        // Same options, every one of them, exactly once — a shuffle, not a
        // filter and not a duplication.
        Assertions.assertEquals(OPTIONS, first.size());
        Assertions.assertEquals(new java.util.HashSet<>(d.authoredOptionIds()), new java.util.HashSet<>(first));

        // Stable: the same attempt reloading the page must not be handed a
        // different arrangement of the same question.
        Assertions.assertEquals(first, deliveredOrder(one.mappingId(), one.token()),
                "an attempt must see the same order every time it loads");

        // …and not everyone sees the same one. Three attempts, so a false
        // failure would need two independent 1-in-40320 collisions.
        List<Integer> second = deliveredOrder(two.mappingId(), two.token());
        List<Integer> third = deliveredOrder(three.mappingId(), three.token());
        Assertions.assertFalse(first.equals(second) && first.equals(third),
                "three attempts all delivered in the same order — the seed is not varying");

        // sortOrder is the DELIVERED position, so a client that sorts by it
        // cannot undo the shuffle.
        String body = mvc.perform(get("/api/portal/assessments/getById/" + one.mappingId())
                        .header("Authorization", "Bearer " + one.token()))
                .andExpect(jsonPath("$.questions[0].options[0].sortOrder").value(0))
                .andExpect(jsonPath("$.questions[0].options[" + (OPTIONS - 1) + "].sortOrder")
                        .value(OPTIONS - 1))
                .andReturn().getResponse().getContentAsString();
        Assertions.assertEquals(first, JsonPath.read(body, "$.questions[0].options[*].optionId"));

        // The answer still points at an optionId, so submitting the first
        // option AS DELIVERED is an ordinary single-choice submission.
        mvc.perform(post("/api/portal/assessments/submit/" + one.mappingId())
                        .header("Authorization", "Bearer " + one.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + d.questionId()
                                + ",\"optionId\":" + first.get(0) + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // Presentation only — flipping the flag is allowed even with answers
        // on the books, unlike the option set or the selection rule.
        mvc.perform(put("/api/questions/update/" + d.questionId()).contentType(MediaType.APPLICATION_JSON)
                        .content(questionJson("__smoke__ Shuffle stem", OPTIONS, "")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shuffleOptions").value(false));
    }

    @Test
    void anUnshuffledQuestionIsStillDeliveredInTheAuthoredOrder() throws Exception {
        Delivery d = buildDelivery("__smoke__ NoShuffle", false);
        Taker taker = newTaker("__smoke__ NoShuffle One", "noshuffle.one@test.local", d.assessmentId());
        Assertions.assertEquals(d.authoredOptionIds(),
                deliveredOrder(taker.mappingId(), taker.token()),
                "without the flag the respondent sees exactly what was authored");
    }
}
