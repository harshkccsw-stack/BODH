package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.model.game.GameResult;
import com.bodhpsychometric.repository.game.GameResultRepository;
import com.jayway.jsonpath.JsonPath;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * GAMES questions (V41/V42): a catalog of games. Each GAMES question has ONE
 * generated option linked to a game, and any number of questions may share a
 * game. The portal renders the game by the option's game code; finishing it
 * submits that option like any single choice.
 */
@SpringBootTest
@AutoConfigureMockMvc
class GamesTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private GameResultRepository gameResults;

    private String send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,
            String body, int expectedStatus) throws Exception {
        return mvc.perform(req.contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus))
                .andReturn().getResponse().getContentAsString();
    }

    private int newGame(String code, String name) throws Exception {
        String body = send(post("/api/games/create"),
                "{\"code\":\"" + code + "\",\"name\":\"" + name + "\",\"description\":null}", 201);
        return JsonPath.read(body, "$.gameId");
    }

    private static String gameQuestionJson(String stem, Object gameId, String extraFields) {
        return "{\"contentType\":\"TEXT\",\"questionType\":\"GAMES\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false," + extraFields
                + "\"options\":[],\"rows\":[],\"mqtScores\":[],\"gameId\":" + gameId + "}";
    }

    @Test
    void theCatalogNormalisesCodesAndRefusesDuplicates() throws Exception {
        String body = send(post("/api/games/create"),
                "{\"code\":\"  smoke_catalog \",\"name\":\" Smoke Catalog \",\"description\":\"  \"}", 201);
        int gameId = JsonPath.read(body, "$.gameId");
        mvc.perform(get("/api/games/getById/" + gameId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SMOKE_CATALOG"))
                .andExpect(jsonPath("$.name").value("Smoke Catalog"))
                .andExpect(jsonPath("$.description").value(nullValue()))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.usedByQuestionIds.length()").value(0));

        // Unique whatever the spelling — the registry keys on one spelling.
        send(post("/api/games/create"), "{\"code\":\"Smoke_Catalog\",\"name\":\"Again\"}", 409);
        // A code is a registry key: no spaces, no punctuation.
        send(post("/api/games/create"), "{\"code\":\"smoke catalog\",\"name\":\"Spaced\"}", 400);
        send(post("/api/games/create"), "{\"code\":\"smoke-dash\",\"name\":\"Dashed\"}", 400);
        send(post("/api/games/create"), "{\"code\":\"SMOKE_NO_NAME\",\"name\":\" \"}", 400);
        send(post("/api/games/create"), "{\"code\":\"SMOKE_V0\",\"name\":\"V0\",\"version\":0}", 400);

        // Update: omitted active/version mean unchanged, not reset.
        send(put("/api/games/update/" + gameId),
                "{\"code\":\"SMOKE_CATALOG\",\"name\":\"Smoke Catalog\",\"active\":false,\"version\":3}", 200);
        send(put("/api/games/update/" + gameId), "{\"code\":\"SMOKE_CATALOG\",\"name\":\"Renamed\"}", 200);
        mvc.perform(get("/api/games/getById/" + gameId))
                .andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.version").value(3));

        send(put("/api/games/update/999999"), "{\"code\":\"SMOKE_GONE\",\"name\":\"Gone\"}", 404);
        mvc.perform(delete("/api/games/delete/" + gameId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/games/getById/" + gameId)).andExpect(status().isNotFound());
    }

    @Test
    void aGameQuestionHasExactlyOneGeneratedOptionLinkedToItsGame() throws Exception {
        int gameId = newGame("SMOKE_ONE", "Smoke One");

        String body = send(post("/api/questions/create"), gameQuestionJson("__smoke__ play one", gameId, ""), 201);
        int questionId = JsonPath.read(body, "$.questionId");
        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(jsonPath("$.questionType").value("GAMES"))
                .andExpect(jsonPath("$.options.length()").value(1))
                .andExpect(jsonPath("$.options[0].optionText").value(nullValue()))
                .andExpect(jsonPath("$.options[0].game.gameId").value(gameId))
                .andExpect(jsonPath("$.options[0].game.code").value("SMOKE_ONE"))
                .andExpect(jsonPath("$.options[0].game.name").value("Smoke One"));

        // The catalog now names the question behind the game.
        mvc.perform(get("/api/games/getById/" + gameId))
                .andExpect(jsonPath("$.usedByQuestionIds[0]").value(questionId));

        // Everything that is not a game is refused, each for its own reason.
        send(post("/api/questions/create"), gameQuestionJson("__smoke__ no game", "null", ""), 400);
        send(post("/api/questions/create"), gameQuestionJson("__smoke__ ghost game", 999999, ""), 400);
        send(post("/api/questions/create"),
                gameQuestionJson("__smoke__ ruled game", gameId, "\"selectionRule\":\"MAX\",\"selectionCount\":1,"), 400);
        send(post("/api/questions/create"),
                gameQuestionJson("__smoke__ shuffled game", gameId, "\"shuffleOptions\":true,"), 400);
        String withOptions = send(post("/api/questions/create"),
                "{\"contentType\":\"TEXT\",\"questionType\":\"GAMES\",\"stem\":\"__smoke__ authored\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[{\"optionText\":\"Play\","
                        + "\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],\"rows\":[],"
                        + "\"mqtScores\":[],\"gameId\":" + gameId + "}", 400);
        org.assertj.core.api.Assertions.assertThat(withOptions).contains("send gameId, not options");
        // …and a game on anything but a game question would be silently lost.
        send(post("/api/questions/create"),
                "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ mcq with game\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[{\"optionText\":\"A\","
                        + "\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],\"rows\":[],"
                        + "\"mqtScores\":[],\"gameId\":" + gameId + "}", 400);

        // MANY-TO-ONE (V42): a second question may launch the same game, each
        // through its own option…
        String again = send(post("/api/questions/create"), gameQuestionJson("__smoke__ play one again", gameId, ""), 201);
        int againId = JsonPath.read(again, "$.questionId");
        int againOption = JsonPath.read(again, "$.options[0].optionId");
        org.assertj.core.api.Assertions.assertThat(againOption)
                .isNotEqualTo(JsonPath.<Integer>read(body, "$.options[0].optionId"));
        // …and so may two items of one batch.
        int free = newGame("SMOKE_BATCH", "Smoke Batch");
        String batch = send(post("/api/questions/bulk-create"),
                "[" + gameQuestionJson("__smoke__ batch a", free, "") + ","
                        + gameQuestionJson("__smoke__ batch b", free, "") + "]", 201);
        int batchA = JsonPath.read(batch, "$[0].questionId");
        int batchB = JsonPath.read(batch, "$[1].questionId");
        mvc.perform(get("/api/games/getById/" + free))
                .andExpect(jsonPath("$.usedByQuestionIds.length()").value(2));
        mvc.perform(get("/api/games/getById/" + gameId))
                .andExpect(jsonPath("$.usedByQuestionIds.length()").value(2))
                .andExpect(jsonPath("$.usedByQuestionIds[1]").value(againId));

        // A game in use cannot be deleted; every question using it is named.
        String blocked = mvc.perform(delete("/api/games/delete/" + gameId))
                .andExpect(status().isConflict()).andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(blocked).contains("#" + questionId).contains("#" + againId);

        // Unanswered, so the game may be swapped — the old game keeps its other
        // question, the new one gains this.
        send(put("/api/questions/update/" + questionId), gameQuestionJson("__smoke__ play one", free, ""), 200);
        mvc.perform(get("/api/games/getById/" + gameId))
                .andExpect(jsonPath("$.usedByQuestionIds.length()").value(1))
                .andExpect(jsonPath("$.usedByQuestionIds[0]").value(againId));
        mvc.perform(get("/api/games/getById/" + free))
                .andExpect(jsonPath("$.usedByQuestionIds.length()").value(3));

        // Retired: no new question may take it, but the question already on it
        // keeps saving.
        send(put("/api/games/update/" + gameId), "{\"code\":\"SMOKE_ONE\",\"name\":\"Smoke One\",\"active\":false}", 200);
        send(post("/api/questions/create"), gameQuestionJson("__smoke__ retired", gameId, ""), 400);
        send(put("/api/games/update/" + free), "{\"code\":\"SMOKE_BATCH\",\"name\":\"Smoke Batch\",\"active\":false}", 200);
        send(put("/api/questions/update/" + questionId), gameQuestionJson("__smoke__ play one, edited", free, ""), 200);

        // Switching away to an MCQ drops the game option and its link.
        send(put("/api/questions/update/" + questionId),
                "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ now mcq\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[{\"optionText\":\"A\","
                        + "\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],\"rows\":[],"
                        + "\"mqtScores\":[]}", 200);
        mvc.perform(get("/api/games/getById/" + free))
                .andExpect(jsonPath("$.usedByQuestionIds.length()").value(2))
                .andExpect(jsonPath("$.usedByQuestionIds[0]").value(batchA))
                .andExpect(jsonPath("$.usedByQuestionIds[1]").value(batchB));
    }

    @Test
    void thePortalDeliversEachGameQuestionAndFinishingThemSubmitsTheirOptions() throws Exception {
        // One questionnaire, three game questions: two launching the SAME game,
        // one launching another — each with its own single option.
        int gameId = newGame("SMOKE_PORTAL", "Smoke Portal");
        int secondGame = newGame("SMOKE_PORTAL_TWO", "Smoke Portal Two");
        String questionBody = send(post("/api/questions/create"), gameQuestionJson("__smoke__ play portal", gameId, ""), 201);
        int questionId = JsonPath.read(questionBody, "$.questionId");
        int optionId = JsonPath.read(questionBody, "$.options[0].optionId");
        String repeatBody = send(post("/api/questions/create"), gameQuestionJson("__smoke__ play portal again", gameId, ""), 201);
        int repeatId = JsonPath.read(repeatBody, "$.questionId");
        int repeatOption = JsonPath.read(repeatBody, "$.options[0].optionId");
        String twoBody = send(post("/api/questions/create"), gameQuestionJson("__smoke__ play portal two", secondGame, ""), 201);
        int twoId = JsonPath.read(twoBody, "$.questionId");
        int twoOption = JsonPath.read(twoBody, "$.options[0].optionId");

        String questionnaireBody = send(post("/api/questionnaire/create"),
                "{\"name\":\"__smoke__ games QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}", 201);
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        send(put("/api/questionnaire/" + questionnaireId + "/questions"),
                "[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1},"
                        + "{\"questionId\":" + repeatId + ",\"sectionId\":null,\"sortOrder\":2},"
                        + "{\"questionId\":" + twoId + ",\"sectionId\":null,\"sortOrder\":3}]", 200);
        String assessmentBody = send(post("/api/assessments/create"),
                "{\"name\":\"__smoke__ games Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}", 201);
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");
        String respondentBody = send(post("/api/respondents/create"),
                "{\"name\":\"__smoke__ Game Player\",\"email\":\"game.player@test.local\",\"dob\":\"06-06-2006\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000001\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}", 201);
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        send(post("/api/respondent-assessments/assign"),
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}", 201);

        String loginBody = send(post("/api/portal/login"),
                "{\"email\":\"game.player@test.local\",\"dob\":\"2006-06-06\"}", 200);
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody, "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // Each question arrives with its own one option and the code its
        // registry renders by — the same game twice, then the other.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions.length()").value(3))
                .andExpect(jsonPath("$.questions[0].questionType").value("GAMES"))
                .andExpect(jsonPath("$.questions[0].minSelections").value(1))
                .andExpect(jsonPath("$.questions[0].maxSelections").value(1))
                .andExpect(jsonPath("$.questions[0].options.length()").value(1))
                .andExpect(jsonPath("$.questions[0].options[0].optionId").value(optionId))
                .andExpect(jsonPath("$.questions[0].options[0].game.code").value("SMOKE_PORTAL"))
                .andExpect(jsonPath("$.questions[0].options[0].game.version").value(1))
                .andExpect(jsonPath("$.questions[1].options.length()").value(1))
                .andExpect(jsonPath("$.questions[1].options[0].optionId").value(repeatOption))
                .andExpect(jsonPath("$.questions[1].options[0].game.code").value("SMOKE_PORTAL"))
                .andExpect(jsonPath("$.questions[2].options.length()").value(1))
                .andExpect(jsonPath("$.questions[2].options[0].optionId").value(twoOption))
                .andExpect(jsonPath("$.questions[2].options[0].game.code").value("SMOKE_PORTAL_TWO"));

        // Not finishing every game is not an answer set.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"answers\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + optionId + "}]}"))
                .andExpect(status().isBadRequest());
        // A question's option belongs to it alone, even when the game is shared.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + repeatOption + "}]}"))
                .andExpect(status().isBadRequest());
        // Finishing each picks its option — ordinary single choices.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + optionId + "},"
                                + "{\"questionId\":" + repeatId + ",\"optionId\":" + repeatOption + "},"
                                + "{\"questionId\":" + twoId + ",\"optionId\":" + twoOption + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // Answered: the game is now part of the frozen option…
        int other = newGame("SMOKE_PORTAL_OTHER", "Smoke Portal Other");
        String locked = send(put("/api/questions/update/" + questionId),
                gameQuestionJson("__smoke__ play portal", other, ""), 409);
        org.assertj.core.api.Assertions.assertThat(locked).contains("options are locked");
        // …a stem edit is still fine (the same game regenerates the same option)…
        send(put("/api/questions/update/" + questionId), gameQuestionJson("__smoke__ play portal, reworded", gameId, ""), 200);
        // …and the game's code is locked, though its name is not.
        mvc.perform(put("/api/games/update/" + gameId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"SMOKE_PORTAL_RENAMED\",\"name\":\"Smoke Portal\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("code is locked")));
        send(put("/api/games/update/" + gameId), "{\"code\":\"SMOKE_PORTAL\",\"name\":\"Smoke Portal v2\",\"version\":2}", 200);
    }

    /** One game part in the submit payload; {@code extra} adds the optional fields. */
    private static String part(String code, int hits, int falseAlarms, int omissions, long durationMs, String extra) {
        return "{\"partCode\":\"" + code + "\",\"hits\":" + hits + ",\"falseAlarms\":" + falseAlarms
                + ",\"omissions\":" + omissions + ",\"durationMs\":" + durationMs
                + ",\"mouseDistancePx\":1200,\"mouseIdleSeconds\":7" + extra + "}";
    }

    private static String result(Object questionId, String... parts) {
        return "{\"questionId\":" + questionId + ",\"parts\":[" + String.join(",", parts) + "]}";
    }

    @Test
    void finishedGamesAreStoredOnePartPerRowInTheSubmitTransaction() throws Exception {
        int baselineGame = newGame("SMOKE_SAVE_ONE", "Smoke Save One");
        int twoPartGame = newGame("SMOKE_SAVE_TWO", "Smoke Save Two");
        String q1 = send(post("/api/questions/create"), gameQuestionJson("__smoke__ save baseline", baselineGame, ""), 201);
        String q2 = send(post("/api/questions/create"), gameQuestionJson("__smoke__ save two parts", twoPartGame, ""), 201);
        String q3 = send(post("/api/questions/create"), gameQuestionJson("__smoke__ save no result", baselineGame, ""), 201);
        String q4 = send(post("/api/questions/create"),
                "{\"contentType\":\"TEXT\",\"questionType\":\"MCQ\",\"stem\":\"__smoke__ save mcq\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[{\"optionText\":\"A\","
                        + "\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],\"rows\":[],"
                        + "\"mqtScores\":[]}", 201);
        int[] qid = new int[4];
        int[] opt = new int[4];
        String[] bodies = { q1, q2, q3, q4 };
        for (int i = 0; i < 4; i++) {
            qid[i] = JsonPath.read(bodies[i], "$.questionId");
            opt[i] = JsonPath.read(bodies[i], "$.options[0].optionId");
        }

        int questionnaireId = JsonPath.read(send(post("/api/questionnaire/create"),
                "{\"name\":\"__smoke__ save QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}", 201), "$.questionnaireId");
        StringBuilder placements = new StringBuilder("[");
        for (int i = 0; i < 4; i++) {
            placements.append(i == 0 ? "" : ",").append("{\"questionId\":").append(qid[i])
                    .append(",\"sectionId\":null,\"sortOrder\":").append(i + 1).append("}");
        }
        send(put("/api/questionnaire/" + questionnaireId + "/questions"), placements.append("]").toString(), 200);
        int assessmentId = JsonPath.read(send(post("/api/assessments/create"),
                "{\"name\":\"__smoke__ save Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}", 201),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(send(post("/api/respondents/create"),
                "{\"name\":\"__smoke__ Game Saver\",\"email\":\"game.saver@test.local\",\"dob\":\"07-07-2007\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000002\",\"gender\":\"MALE\","
                        + "\"isConsented\":false,\"organizationId\":null}", 201), "$.respondentUserId");
        send(post("/api/respondent-assessments/assign"),
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}", 201);
        String login = send(post("/api/portal/login"), "{\"email\":\"game.saver@test.local\",\"dob\":\"2007-07-07\"}", 200);
        String bearer = "Bearer " + (String) JsonPath.read(login, "$.token");
        int mappingId = JsonPath.read(login, "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        StringBuilder answers = new StringBuilder("\"answers\":[");
        for (int i = 0; i < 4; i++) {
            answers.append(i == 0 ? "" : ",").append("{\"questionId\":").append(qid[i])
                    .append(",\"optionId\":").append(opt[i]).append("}");
        }
        answers.append("]");
        String clashExtra = ",\"instructionTimeMs\":8000,\"groupNumber\":3,\"groupName\":\" IND-DIM \","
                + "\"pauseCount\":1,\"pauseDurationMs\":5000,"
                + "\"startedAt\":\"2026-10-06T10:00:00.000Z\",\"endedAt\":\"2026-10-06T10:01:15.000Z\"";
        String clockExtra = ",\"instructionTimeMs\":4000,\"groupNumber\":3,\"groupName\":\"IND-DIM\","
                + "\"pauseCount\":0,\"pauseDurationMs\":0";
        String good1 = "{\"questionId\":" + qid[0] + ",\"gameId\":999999,\"gameVersion\":77,\"parts\":["
                + part("baseline", 299, 28, 28, 280000, "") + "]}";
        String good2 = result(qid[1], part("COLOR_CLASH", 15, 5, 4, 70000, clashExtra),
                part("MACKWORTH_CLOCK", 10, 6, 5, 300000, clockExtra));

        // Every refusal leaves nothing written — the transaction never starts.
        String[] refused = {
            result(qid[3], part("X", 1, 0, 0, 10, "")),                                   // not a game question
            result(999999, part("X", 1, 0, 0, 10, "")),                                  // not in this assessment
            good1 + "," + good1,                                                         // two sets for one game
            result(qid[0]),                                                              // no parts
            result(qid[0], "{\"partCode\":\"X\",\"falseAlarms\":0,\"omissions\":0,\"durationMs\":1,"
                    + "\"mouseDistancePx\":0,\"mouseIdleSeconds\":0}"),             // hits missing
            result(qid[0], part("X", 1, 0, 0, -5, "")),                                 // negative duration
            result(qid[0], part("bad code", 1, 0, 0, 10, "")),                          // malformed part code
            result(qid[1], part("SAME", 1, 0, 0, 10, ""), part("SAME", 1, 0, 0, 10, "")), // part twice
            result(qid[0], part("X", 1, 0, 0, 10, ",\"groupName\":\"" + "x".repeat(31) + "\"")),
            result(qid[0], part("X", 1, 0, 0, 10,
                    ",\"startedAt\":\"2026-10-06T10:00:00Z\",\"endedAt\":\"2026-10-06T09:00:00Z\"")),
        };
        for (String bad : refused) {
            mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{" + answers + ",\"gameResults\":[" + bad + "]}"))
                    .andExpect(status().isBadRequest());
        }
        assertThat(gameResults.findForRespondentAssessment((long) respondentUserId, (long) assessmentId)).isEmpty();

        // Accepted: q1 and q2 with results, q3 answered with none — the answer
        // alone records that it was finished.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{" + answers + ",\"gameResults\":[" + good1 + "," + good2 + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        List<GameResult> rows = gameResults.findForRespondentAssessment((long) respondentUserId, (long) assessmentId);
        assertThat(rows).extracting(GameResult::getPartCode).containsExactly("BASELINE", "COLOR_CLASH", "MACKWORTH_CLOCK");
        GameResult baseline = rows.get(0);
        // The game and its version come from the delivered content, never the client.
        assertThat(baseline.getGame().getGameId()).isEqualTo((long) baselineGame);
        assertThat(baseline.getGameVersion()).isEqualTo(1);
        assertThat(baseline.getAnswer().getOption().getOptionId()).isEqualTo((long) opt[0]);
        assertThat(baseline.getPartOrder()).isEqualTo(1);
        assertThat(baseline.getHits()).isEqualTo(299);
        assertThat(baseline.getFalseAlarms()).isEqualTo(28);
        assertThat(baseline.getOmissions()).isEqualTo(28);
        assertThat(baseline.getDurationMs()).isEqualTo(280000L);
        assertThat(baseline.getMouseDistancePx()).isEqualTo(1200L);
        assertThat(baseline.getMouseIdleSeconds()).isEqualTo(7);
        assertThat(baseline.getInstructionTimeMs()).isNull();
        assertThat(baseline.getGroupNumber()).isNull();
        assertThat(baseline.getPauseCount()).isNull();

        GameResult clash = rows.get(1);
        GameResult clock = rows.get(2);
        assertThat(clash.getAnswer().getAssessmentAnswerId()).isEqualTo(clock.getAnswer().getAssessmentAnswerId());
        assertThat(clash.getGame().getGameId()).isEqualTo((long) twoPartGame);
        assertThat(clash.getPartOrder()).isEqualTo(1);
        assertThat(clock.getPartOrder()).isEqualTo(2);
        // The group rides on BOTH rows, trimmed.
        assertThat(clash.getGroupNumber()).isEqualTo(3);
        assertThat(clash.getGroupName()).isEqualTo("IND-DIM");
        assertThat(clock.getGroupNumber()).isEqualTo(3);
        assertThat(clock.getGroupName()).isEqualTo("IND-DIM");
        assertThat(clash.getInstructionTimeMs()).isEqualTo(8000L);
        assertThat(clock.getInstructionTimeMs()).isEqualTo(4000L);
        assertThat(clash.getPauseCount()).isEqualTo(1);
        assertThat(clash.getPauseDurationMs()).isEqualTo(5000L);
        assertThat(clock.getPauseCount()).isZero();
        assertThat(clash.getStartedAt().toInstant()).isEqualTo(java.time.Instant.parse("2026-10-06T10:00:00Z"));
        assertThat(clash.getEndedAt().toInstant()).isEqualTo(java.time.Instant.parse("2026-10-06T10:01:15Z"));
        assertThat(clock.getStartedAt()).isNull();

        // The export sheet: a game question's own cell names the game (its
        // option has no label), and each game part is a block of columns
        // right after it, in question then part order — from the data, so the
        // game answered without a result (Q_3) gets its cell but no block.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].answers.Q_1").value("Smoke Save One"))
                .andExpect(jsonPath("$.rows[0].answers.Q_2").value("Smoke Save Two"))
                .andExpect(jsonPath("$.rows[0].answers.Q_3").value("Smoke Save One"))
                .andExpect(jsonPath("$.rows[0].answers.Q_4").value("A"))
                .andExpect(jsonPath("$.gameColumns.length()").value(3))
                .andExpect(jsonPath("$.gameColumns[0].key").value("Q_1_BASELINE"))
                .andExpect(jsonPath("$.gameColumns[0].gameCode").value("SMOKE_SAVE_ONE"))
                .andExpect(jsonPath("$.gameColumns[1].key").value("Q_2_COLOR_CLASH"))
                .andExpect(jsonPath("$.gameColumns[2].key").value("Q_2_MACKWORTH_CLOCK"))
                .andExpect(jsonPath("$.gameColumns[2].partOrder").value(2))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_1_BASELINE.hits").value(299))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_1_BASELINE.gameVersion").value(1))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_1_BASELINE.groupName").value(nullValue()))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_2_COLOR_CLASH.falseAlarms").value(5))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_2_COLOR_CLASH.groupName").value("IND-DIM"))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_2_COLOR_CLASH.pauseDurationMs").value(5000))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_2_MACKWORTH_CLOCK.durationMs").value(300000))
                .andExpect(jsonPath("$.rows[0].gameParts.Q_2_MACKWORTH_CLOCK.instructionTimeMs").value(4000));

        // A practitioner reset deletes the answer set — and its game results with it.
        mvc.perform(post("/api/reports/resetAssessment/" + mappingId)).andExpect(status().isOk());
        assertThat(gameResults.findForRespondentAssessment((long) respondentUserId, (long) assessmentId)).isEmpty();
    }
}
