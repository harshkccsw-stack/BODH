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
 * The scoring engine, end to end through the report export: one respondent
 * answers all three question types against a two-level MQT tree, and the
 * export sheet must carry the numbers the rule implies.
 *
 * The fixture is deliberately one of each type over ONE tree, because the
 * interesting cases are how they differ:
 * <ul>
 * <li>the MCQ is multi-select — its two picked options both count, while its
 * question-level flat score counts once, not twice;</li>
 * <li>the linear scale needs no special case — the point picked is the score,
 * and its question-level row (sent as 9) is stored 0;</li>
 * <li>the grid's columns are scored under BOTH traits, and each row's
 * nomination is what decides which half of that lands.</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
class MqtScoringExportTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String score(int mqtId, int value) {
        return score(mqtId, String.valueOf(value));
    }

    /** Scores are decimal — this overload writes the literal as given. */
    private static String score(int mqtId, String value) {
        return "{\"measuredQualityTypeId\":" + mqtId + ",\"score\":" + value + "}";
    }

    @Test
    void everyQuestionTypeAddsUpAndRollsUpTheTree() throws Exception {
        // ── Taxonomy: one MQ, Verbal with Vocabulary under it ─────────────
        String mq = postJson("/api/qualities/create",
                "{\"name\":\"__smoke__Cognition\",\"description\":null}");
        int measuredQualityId = JsonPath.read(mq, "$.measuredQualityId");
        int verbal = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":null,"
                        + "\"name\":\"Verbal\"}"), "$.measuredQualityTypeId");
        int vocabulary = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":" + verbal + ","
                        + "\"name\":\"Vocabulary\"}"), "$.measuredQualityTypeId");

        // ── Q1: multi-select MCQ, two of three options, flat score on Verbal ──
        String mcqBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ mcq\",\"mediaUrl\":null,\"riskFlag\":false,"
                        + "\"selectionRule\":\"MAX\",\"selectionCount\":2,\"options\":["
                        + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[" + score(vocabulary, 3) + "]},"
                        + "{\"optionText\":\"B\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[" + score(vocabulary, 4) + "]},"
                        + "{\"optionText\":\"C\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[" + score(verbal, 5) + "]}],"
                        + "\"mqtScores\":[" + score(verbal, 2) + "]}");
        int mcqId = JsonPath.read(mcqBody, "$.questionId");
        int optionA = JsonPath.read(mcqBody, "$.options[0].optionId");
        int optionB = JsonPath.read(mcqBody, "$.options[1].optionId");

        // ── Q2: linear scale on Verbal — the point picked IS the score ────
        String scaleBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"LINEAR_SCALE\",\"stem\":\"__smoke__ scale\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"scaleLowLabel\":\"Low\","
                        + "\"scaleHighLabel\":\"High\",\"options\":[],"
                        + "\"mqtScores\":[" + score(verbal, 9) + "]}");
        int scaleId = JsonPath.read(scaleBody, "$.questionId");
        int pointThree = JsonPath.read(scaleBody, "$.options[2].optionId");

        // ── Q3: grid — columns scored under BOTH traits, rows name one each ──
        String columns = "";
        for (int n = 1; n <= 3; n++) {
            columns += (n == 1 ? "" : ",")
                    + "{\"optionText\":\"C" + n + "\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                    + "\"mqtScores\":[" + score(vocabulary, n) + "," + score(verbal, n) + "]}";
        }
        String gridBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\",\"stem\":\"__smoke__ grid\","
                        + "\"mediaUrl\":null,\"riskFlag\":false,\"options\":[" + columns + "],"
                        + "\"rows\":[{\"rowText\":\"Vocab item\",\"measuredQualityTypeIds\":[" + vocabulary + "]},"
                        + "{\"rowText\":\"Verbal item\",\"measuredQualityTypeIds\":[" + verbal + "]}],"
                        + "\"mqtScores\":[]}");
        int gridId = JsonPath.read(gridBody, "$.questionId");
        int vocabRow = JsonPath.read(gridBody, "$.rows[0].questionRowId");
        int verbalRow = JsonPath.read(gridBody, "$.rows[1].questionRowId");
        int gridTwo = JsonPath.read(gridBody, "$.options[1].optionId");
        int gridThree = JsonPath.read(gridBody, "$.options[2].optionId");

        // ── Delivery chain ───────────────────────────────────────────────
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ scoring QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + mcqId + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + scaleId + ",\"sectionId\":null,\"sortOrder\":2},"
                                + "{\"questionId\":" + gridId + ",\"sectionId\":null,\"sortOrder\":3}]"))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ scoring Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Scoring Taker\",\"email\":\"scoring.taker@test.local\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,"
                        + "\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"scoring.taker@test.local\",\"dob\":\"2007-07-07\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // ── The attempt ──────────────────────────────────────────────────
        // MCQ  → A + B          Vocabulary 3 + 4, and Verbal 2 ONCE (not twice)
        // scale→ point 3        Verbal 3
        // grid → vocab row C2   Vocabulary 2 (the column's Verbal 2 is filtered out)
        //        verbal row C3  Verbal 3     (the column's Vocabulary 3 is filtered out)
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":["
                                + "{\"questionId\":" + mcqId + ",\"optionId\":" + optionA + "},"
                                + "{\"questionId\":" + mcqId + ",\"optionId\":" + optionB + "},"
                                + "{\"questionId\":" + scaleId + ",\"optionId\":" + pointThree + "},"
                                + "{\"questionId\":" + gridId + ",\"optionId\":" + gridTwo
                                + ",\"questionRowId\":" + vocabRow + "},"
                                + "{\"questionId\":" + gridId + ",\"optionId\":" + gridThree
                                + ",\"questionRowId\":" + verbalRow + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // ── The sheet ────────────────────────────────────────────────────
        // Vocabulary own = 3 + 4 (MCQ) + 2 (grid)          = 9
        // Verbal     own = 2 (flat, once) + 3 (point) + 3  = 8
        // Verbal subtree = 8 + 9 = 17, and the MQ is that same 17.
        String path = " › ";
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId
                        + "/respondent/" + respondentUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mqColumns.length()").value(1))
                .andExpect(jsonPath("$.mqColumns[0].measuredQualityId").value(measuredQualityId))
                .andExpect(jsonPath("$.mqColumns[0].name").value("__smoke__Cognition"))
                // Depth-first from the root, each labelled by its full path —
                // MQT names are not unique, so the path is the header.
                .andExpect(jsonPath("$.mqtColumns.length()").value(2))
                .andExpect(jsonPath("$.mqtColumns[0].measuredQualityTypeId").value(verbal))
                .andExpect(jsonPath("$.mqtColumns[0].depth").value(0))
                .andExpect(jsonPath("$.mqtColumns[0].hasChildren").value(true))
                .andExpect(jsonPath("$.mqtColumns[0].path").value("__smoke__Cognition" + path + "Verbal"))
                .andExpect(jsonPath("$.mqtColumns[1].measuredQualityTypeId").value(vocabulary))
                .andExpect(jsonPath("$.mqtColumns[1].depth").value(1))
                .andExpect(jsonPath("$.mqtColumns[1].hasChildren").value(false))
                .andExpect(jsonPath("$.mqtColumns[1].parentTypeId").value(verbal))
                .andExpect(jsonPath("$.mqtColumns[1].path")
                        .value("__smoke__Cognition" + path + "Verbal" + path + "Vocabulary"))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].mqtScores." + verbal).value(8))
                .andExpect(jsonPath("$.rows[0].mqtScores." + vocabulary).value(9))
                .andExpect(jsonPath("$.rows[0].mqtTotals." + verbal).value(17))
                .andExpect(jsonPath("$.rows[0].mqtTotals." + vocabulary).value(9))
                .andExpect(jsonPath("$.rows[0].mqScores." + measuredQualityId).value(17));

        // The audit trail behind those numbers: 4 edges for the MCQ (its flat
        // score + one per option), 6 for the scale (its flat row, stored 0,
        // + one per generated point) and 6 for the grid — 2 rows x 3 columns,
        // each column's OTHER trait filtered out by the row's nomination.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId
                        + "/respondent/" + respondentUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scoringKey.length()").value(16))
                // The flat one comes first and names no option — it lands on
                // any answer at all.
                .andExpect(jsonPath("$.scoringKey[0].questionTag").value("Q_1"))
                .andExpect(jsonPath("$.scoringKey[0].optionText").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.scoringKey[0].score").value(2))
                .andExpect(jsonPath("$.scoringKey[0].mqtPath")
                        .value("__smoke__Cognition" + path + "Verbal"))
                // The grid row can only ever earn what it nominates.
                .andExpect(jsonPath("$.scoringKey[?(@.rowText=='Vocab item')]",
                        org.hamcrest.Matchers.hasSize(3)))
                .andExpect(jsonPath("$.scoringKey[?(@.rowText=='Vocab item' "
                                + "&& @.mqtPath=='__smoke__Cognition" + path + "Verbal" + path + "Vocabulary')]",
                        org.hamcrest.Matchers.hasSize(3)));

        // The assessment-wide export scores the same respondent identically —
        // one plan, one rule, whichever button was pressed.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mqtColumns.length()").value(2))
                .andExpect(jsonPath("$.rows[0].mqtScores." + verbal).value(8))
                .andExpect(jsonPath("$.rows[0].mqtTotals." + verbal).value(17));

        // ── Unplacing a question takes its score with it ──────────────────
        // The MCQ's answers survive, but it has no column in the sheet any
        // more, so it must not sit inside a total either: Vocabulary loses
        // 3 + 4, Verbal loses its flat 2.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + scaleId + ",\"sectionId\":null,\"sortOrder\":1},"
                                + "{\"questionId\":" + gridId + ",\"sectionId\":null,\"sortOrder\":2}]"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId
                        + "/respondent/" + respondentUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].mqtScores." + vocabulary).value(2))
                .andExpect(jsonPath("$.rows[0].mqtScores." + verbal).value(6))
                .andExpect(jsonPath("$.rows[0].mqScores." + measuredQualityId).value(8))
                // ...and the key loses that question's four edges with it.
                .andExpect(jsonPath("$.scoringKey.length()").value(12));
    }

    /**
     * Decimal scores survive the round trip and add up cleanly.
     *
     * Two things are at stake and neither is visible from a whole number:
     * a score is kept to 2 decimals rather than truncated to an int (0.75
     * used to store as 0), and the engine's totals are ROUNDED on the way out
     * — 0.1 + 0.2 is 0.30000000000000004 in binary, which is true, unreadable,
     * and not what the same total typed by hand would show in the sheet.
     */
    @Test
    void decimalScoresRoundTripAndSumCleanly() throws Exception {
        int measuredQualityId = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__Precision\",\"description\":null}"), "$.measuredQualityId");
        int trait = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + measuredQualityId + ",\"parentTypeId\":null,"
                        + "\"name\":\"Fractional\"}"), "$.measuredQualityTypeId");

        // Option C carries three decimals: more precision than the column
        // holds, so it is rounded to 2 rather than rejected or truncated.
        String mcqBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ decimals\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"selectionRule\":\"MAX\",\"selectionCount\":2,\"options\":["
                        + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[" + score(trait, "0.1") + "]},"
                        + "{\"optionText\":\"B\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[" + score(trait, "0.2") + "]},"
                        + "{\"optionText\":\"C\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[" + score(trait, "0.126") + "]}],"
                        + "\"mqtScores\":[" + score(trait, "0.3") + "]}");
        int questionId = JsonPath.read(mcqBody, "$.questionId");
        int optionA = JsonPath.read(mcqBody, "$.options[0].optionId");
        int optionB = JsonPath.read(mcqBody, "$.options[1].optionId");

        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mqtScores[0].score").value(0.3))
                .andExpect(jsonPath("$.options[0].mqtScores[0].score").value(0.1))
                .andExpect(jsonPath("$.options[1].mqtScores[0].score").value(0.2))
                .andExpect(jsonPath("$.options[2].mqtScores[0].score").value(0.13));

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ decimals QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ decimals Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Decimal Taker\",\"email\":\"decimal.taker@test.local\","
                        + "\"dob\":\"07-07-2007\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000001\","
                        + "\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"decimal.taker@test.local\",\"dob\":\"2007-07-07\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":["
                                + "{\"questionId\":" + questionId + ",\"optionId\":" + optionA + "},"
                                + "{\"questionId\":" + questionId + ",\"optionId\":" + optionB + "}]}"))
                .andExpect(status().isOk());

        // 0.1 + 0.2 + 0.3 (flat, once) = 0.6 — and NOT 0.6000000000000001,
        // which is what the same three doubles add to untouched.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId
                        + "/respondent/" + respondentUserId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].mqtScores." + trait).value(0.6))
                .andExpect(jsonPath("$.rows[0].mqtTotals." + trait).value(0.6))
                .andExpect(jsonPath("$.rows[0].mqScores." + measuredQualityId).value(0.6))
                // The audit trail keeps the edges as authored, C included —
                // an unpicked option is still part of the key.
                .andExpect(jsonPath("$.scoringKey[?(@.optionText=='A')].score",
                        org.hamcrest.Matchers.contains(0.1)))
                .andExpect(jsonPath("$.scoringKey[?(@.optionText=='C')].score",
                        org.hamcrest.Matchers.contains(0.13)));
    }

    /**
     * A questionnaire whose questions are scored against nothing still exports
     * — with empty column lists and empty score maps, not a 500 and not a
     * sheet full of nulls.
     */
    @Test
    void anUnscoredQuestionnaireExportsWithNoScoreColumns() throws Exception {
        String questionBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ unscored\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}");
        int questionId = JsonPath.read(questionBody, "$.questionId");
        int optionYes = JsonPath.read(questionBody, "$.options[0].optionId");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ unscored QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ unscored Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Unscored Taker\",\"email\":\"unscored.taker@test.local\","
                        + "\"dob\":\"08-08-2008\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,"
                        + "\"organizationId\":null}"), "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"unscored.taker@test.local\",\"dob\":\"2008-08-08\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId
                                + ",\"optionId\":" + optionYes + "}]}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mqColumns.length()").value(0))
                .andExpect(jsonPath("$.mqtColumns.length()").value(0))
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].mqtScores").isEmpty())
                .andExpect(jsonPath("$.rows[0].mqScores").isEmpty());
    }
}
