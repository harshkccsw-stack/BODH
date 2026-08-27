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
 * The Likert grid: rows are the items and NAME the MQTs they measure, the
 * options are the shared columns and carry the scores exactly as an MCQ's
 * options do. One pick per row, every row mandatory, one export column per
 * row.
 */
@SpringBootTest
@AutoConfigureMockMvc
class LikertGridTest {

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

    /**
     * Two rows measuring DIFFERENT MQTs, three columns scored under both —
     * the data-entry shape the row-nomination model implies.
     */
    private static String gridJson(String stem, int mqtA, int mqtB, String extraFields) {
        String columns = "";
        for (int score = 1; score <= 3; score++) {
            columns += (score == 1 ? "" : ",")
                    + "{\"optionText\":\"C" + score + "\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                    + "\"mqtScores\":[{\"measuredQualityTypeId\":" + mqtA + ",\"score\":" + score + "},"
                    + "{\"measuredQualityTypeId\":" + mqtB + ",\"score\":" + score + "}]}";
        }
        return "{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\",\"stem\":\"" + stem + "\","
                + "\"mediaUrl\":null,\"riskFlag\":false," + extraFields
                + "\"options\":[" + columns + "],"
                + "\"rows\":["
                + "{\"rowText\":\"Row one\",\"measuredQualityTypeIds\":[" + mqtA + "]},"
                + "{\"rowText\":\"Row two\",\"measuredQualityTypeIds\":[" + mqtB + "]}],"
                + "\"mqtScores\":[]}";
    }

    @Test
    void rowsNameTheirOwnMqtsAndColumnsCarryTheScores() throws Exception {
        int mqtA = newMqt("__smoke__gridA");
        int mqtB = newMqt("__smoke__gridB");

        String body = postJson("/api/questions/create", gridJson("__smoke__ grid", mqtA, mqtB, ""));
        int questionId = JsonPath.read(body, "$.questionId");

        mvc.perform(get("/api/questions/getById/" + questionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionType").value("LIKERT_GRID"))
                .andExpect(jsonPath("$.rows.length()").value(2))
                .andExpect(jsonPath("$.rows[0].rowText").value("Row one"))
                .andExpect(jsonPath("$.rows[0].sortOrder").value(0))
                // The row NOMINATES — no score of its own anywhere in the shape.
                .andExpect(jsonPath("$.rows[0].mqts.length()").value(1))
                .andExpect(jsonPath("$.rows[0].mqts[0].measuredQualityTypeId").value(mqtA))
                .andExpect(jsonPath("$.rows[1].mqts[0].measuredQualityTypeId").value(mqtB))
                // The columns are ordinary scored options.
                .andExpect(jsonPath("$.options.length()").value(3))
                .andExpect(jsonPath("$.options[2].mqtScores.length()").value(2))
                .andExpect(jsonPath("$.options[2].mqtScores[0].score").value(3));
    }

    @Test
    void aGridNeedsRowsColumnsAndNoSelectionRule() throws Exception {
        int mqtA = newMqt("__smoke__gridBadA");
        int mqtB = newMqt("__smoke__gridBadB");

        // One pick per row for now — a rule has no UI to honour it.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(gridJson("__smoke__ grid ruled", mqtA, mqtB,
                                "\"selectionRule\":\"MAX\",\"selectionCount\":2,")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value(org.hamcrest.Matchers.containsString("one answer per row")));

        // No rows at all, and blank rows dropped before counting.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\","
                                + "\"stem\":\"__smoke__ grid rowless\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                                + "{\"optionText\":\"B\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"rows\":[{\"rowText\":\"   \",\"measuredQualityTypeIds\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("at least one row")));

        // One column is a checkbox list wearing a table's clothes.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"contentType\":\"TEXT\",\"questionType\":\"LIKERT_GRID\","
                                + "\"stem\":\"__smoke__ grid one column\",\"mediaUrl\":null,\"riskFlag\":false,"
                                + "\"options\":[{\"optionText\":\"Only\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                                + "\"rows\":[{\"rowText\":\"Row\",\"measuredQualityTypeIds\":[]}],"
                                + "\"mqtScores\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("two columns")));

        // A row naming an MQT that does not exist is refused like any other
        // unknown reference.
        mvc.perform(post("/api/questions/create").contentType(MediaType.APPLICATION_JSON)
                        .content(gridJson("__smoke__ grid ghost mqt", mqtA, 999_999, "")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void everyRowIsAnsweredOnceAndExportsAsItsOwnColumn() throws Exception {
        int mqtA = newMqt("__smoke__gridPortalA");
        int mqtB = newMqt("__smoke__gridPortalB");
        String questionBody = postJson("/api/questions/create",
                gridJson("__smoke__ grid portal", mqtA, mqtB, ""));
        int questionId = JsonPath.read(questionBody, "$.questionId");
        int rowOne = JsonPath.read(questionBody, "$.rows[0].questionRowId");
        int rowTwo = JsonPath.read(questionBody, "$.rows[1].questionRowId");
        int columnOne = JsonPath.read(questionBody, "$.options[0].optionId");
        int columnThree = JsonPath.read(questionBody, "$.options[2].optionId");

        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ grid QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ grid Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Grid Taker\",\"email\":\"grid.taker@test.local\",\"dob\":\"05-05-2005\","
                        + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"grid.taker@test.local\",\"dob\":\"2005-05-05\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        // Delivered as rows x columns, with no scoring data anywhere in it.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions[0].questionType").value("LIKERT_GRID"))
                .andExpect(jsonPath("$.questions[0].rows.length()").value(2))
                .andExpect(jsonPath("$.questions[0].rows[0].rowText").value("Row one"))
                .andExpect(jsonPath("$.questions[0].options.length()").value(3))
                .andExpect(jsonPath("$.questions[0].minSelections").value(1))
                .andExpect(jsonPath("$.questions[0].maxSelections").value(1));

        // A grid answer without its row, and a row on a question that has
        // none, are both refused.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId
                                + ",\"optionId\":" + columnOne + "}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("questionRowId")));

        // A row from another question — the rule the schema cannot express.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + columnOne
                                + ",\"questionRowId\":999999}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("does not belong")));

        // Half a grid is not an answer: row two is still missing. The message
        // names the QUESTION as the respondent's index numbers it — an
        // unrated row sends them back to the same one grid, and a row id
        // names nothing they can see.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + columnOne
                                + ",\"questionRowId\":" + rowOne + "}]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("1 question is still pending")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("Q1")));

        // Two columns on ONE row breaches the per-row cap of 1...
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + columnOne
                                + ",\"questionRowId\":" + rowOne + "},"
                                + "{\"questionId\":" + questionId + ",\"optionId\":" + columnThree
                                + ",\"questionRowId\":" + rowOne + "},"
                                + "{\"questionId\":" + questionId + ",\"optionId\":" + columnOne
                                + ",\"questionRowId\":" + rowTwo + "}]}"))
                .andExpect(status().isBadRequest());

        // ...while the SAME column on both rows is perfectly normal, and is
        // exactly what the old four-column unique key would have rejected.
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId).header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + columnOne
                                + ",\"questionRowId\":" + rowOne + "},"
                                + "{\"questionId\":" + questionId + ",\"optionId\":" + columnOne
                                + ",\"questionRowId\":" + rowTwo + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));

        // One column per ROW in the sheet, tagged _R1 / _R2 and carrying the
        // row's text — not one cell with both ratings joined together.
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionColumns.length()").value(2))
                .andExpect(jsonPath("$.questionColumns[0].questionTag").value("Q_1_R1"))
                .andExpect(jsonPath("$.questionColumns[0].rowText").value("Row one"))
                .andExpect(jsonPath("$.questionColumns[1].questionTag").value("Q_1_R2"))
                .andExpect(jsonPath("$.rows[0].answers.Q_1_R1").value("C1"))
                .andExpect(jsonPath("$.rows[0].answers.Q_1_R2").value("C1"));
    }

    @Test
    void rowsAreLockedOnceAnswersExistButTheirMqtsAreNot() throws Exception {
        int mqtA = newMqt("__smoke__gridLockA");
        int mqtB = newMqt("__smoke__gridLockB");
        String body = postJson("/api/questions/create", gridJson("__smoke__ grid lock", mqtA, mqtB, ""));
        int questionId = JsonPath.read(body, "$.questionId");

        // Re-nominating a row's MQTs is scoring: owned by this flow, rebuilt
        // on every save, never frozen.
        String swapped = gridJson("__smoke__ grid lock", mqtA, mqtB, "")
                .replace("\"rowText\":\"Row one\",\"measuredQualityTypeIds\":[" + mqtA + "]",
                        "\"rowText\":\"Row one\",\"measuredQualityTypeIds\":[" + mqtA + "," + mqtB + "]");
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(swapped))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[0].mqts.length()").value(2));

        // Re-wording a row is not: it is what an answer points at.
        mvc.perform(put("/api/questions/update/" + questionId).contentType(MediaType.APPLICATION_JSON)
                        .content(gridJson("__smoke__ grid lock", mqtA, mqtB, "")
                                .replace("Row two", "Row two, reworded")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows[1].rowText").value("Row two, reworded"));
    }
}
