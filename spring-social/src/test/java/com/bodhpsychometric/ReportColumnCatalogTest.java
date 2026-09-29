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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * The taxonomy structure the rule author's column picker draws its tree from.
 *
 * <p>A score column's label is its full path, which is the only safe identity
 * (MQT names are deliberately not unique) and is unreadable in a narrow picker
 * — truncation eats the tail, which is the only part that differs between
 * siblings, and it eats the "(subtree total)" suffix that is the ONLY thing
 * separating a node's own score from its subtree total. Picking the wrong one
 * of those does not fail; it produces a quietly wrong report.
 *
 * <p>So the structure travels as fields beside the label, and this pins the
 * three things the picker relies on: a parent key that always resolves to a
 * column that exists, an own/subtree pair sharing one MQT id, and a label left
 * exactly as it was — export sheets and the AI catalog still read it.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportColumnCatalogTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + (String) JsonPath.read(body, "$.token");
    }

    @Test
    void scoreColumnsCarryTheirPlaceInTheTree() throws Exception {
        // One MQ, a root MQT and two children — enough for siblings, a parent
        // with a subtree, and a leaf without one.
        int mqId = JsonPath.read(postJson("/api/qualities/create",
                "{\"name\":\"__smoke__Fundamental Skillset\",\"description\":null}"),
                "$.measuredQualityId");
        int cognitive = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mqId + ",\"parentTypeId\":null,"
                        + "\"name\":\"Cognitive check\"}"), "$.measuredQualityTypeId");
        int verbal = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mqId + ",\"parentTypeId\":" + cognitive + ","
                        + "\"name\":\"Verbal\"}"), "$.measuredQualityTypeId");
        int numeric = JsonPath.read(postJson("/api/quality-types/create",
                "{\"measuredQualityId\":" + mqId + ",\"parentTypeId\":" + cognitive + ","
                        + "\"name\":\"Numeric\"}"), "$.measuredQualityTypeId");

        int questionId = JsonPath.read(postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ catalog q\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[{\"measuredQualityTypeId\":" + verbal + ",\"score\":1}]},"
                        + "{\"optionText\":\"B\",\"contentType\":\"TEXT\",\"mediaUrl\":null,"
                        + "\"mqtScores\":[{\"measuredQualityTypeId\":" + numeric + ",\"score\":1}]}],"
                        + "\"mqtScores\":[]}"), "$.questionId");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ catalog QNR\",\"shortName\":null,\"category\":null,"
                        + "\"vertical\":null,\"description\":null,\"durationMinutes\":null,"
                        + "\"generalInstruction\":null,\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"__smoke__ catalog Assessment\",\"questionnaireId\":" + questionnaireId
                        + ",\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");

        String columns = "$.[?(@.key=='mqt:%d')]";
        mvc.perform(get("/api/report-rules/columns/getByAssessment/" + assessmentId)
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isOk())
                // The label is untouched: still the full path, still what the
                // export sheet and the model's column catalog read.
                .andExpect(jsonPath(String.format(columns, cognitive) + ".label")
                        .value("__smoke__Fundamental Skillset › Cognitive check"))
                .andExpect(jsonPath(String.format(columns, verbal) + ".label")
                        .value("__smoke__Fundamental Skillset › Cognitive check › Verbal"))
                // The root sits at depth 0 under its MQ and has no parent...
                .andExpect(jsonPath(String.format(columns, cognitive) + ".score.role").value("own"))
                .andExpect(jsonPath(String.format(columns, cognitive) + ".score.depth").value(0))
                .andExpect(jsonPath(String.format(columns, cognitive) + ".score.nodeName")
                        .value("Cognitive check"))
                .andExpect(jsonPath(String.format(columns, cognitive) + ".score.parentKey")
                        .value((Object) null))
                .andExpect(jsonPath(String.format(columns, cognitive) + ".score.mqName")
                        .value("__smoke__Fundamental Skillset"))
                // ...and each child names it, by a key that is itself a column.
                .andExpect(jsonPath(String.format(columns, verbal) + ".score.depth").value(1))
                .andExpect(jsonPath(String.format(columns, verbal) + ".score.nodeName").value("Verbal"))
                .andExpect(jsonPath(String.format(columns, verbal) + ".score.parentKey")
                        .value("mqt:" + cognitive))
                .andExpect(jsonPath(String.format(columns, numeric) + ".score.parentKey")
                        .value("mqt:" + cognitive))
                // The subtree total is the parent's, keyed by the SAME id — the
                // pairing the picker hangs its Σ on — and only a node with
                // children gets one.
                .andExpect(jsonPath("$.[?(@.key=='mqtt:" + cognitive + "')].score.role")
                        .value("subtree"))
                .andExpect(jsonPath("$.[?(@.key=='mqtt:" + cognitive + "')].score.nodeName")
                        .value("Cognitive check"))
                .andExpect(jsonPath("$.[?(@.key=='mqtt:" + verbal + "')]").isEmpty())
                .andExpect(jsonPath("$.[?(@.key=='mq:" + mqId + "')].score.role").value("mqTotal"))
                // Nothing outside the scores group pretends to have a place in
                // the taxonomy.
                .andExpect(jsonPath("$.[?(@.key=='core:name')].score").value((Object) null));
    }
}
