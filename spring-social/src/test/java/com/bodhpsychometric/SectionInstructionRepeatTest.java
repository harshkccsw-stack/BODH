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
 * "Show instruction on each question" (V35), from the authoring endpoint to
 * the payload the portal renders from.
 *
 * The flag decides one thing only: whether the section's instruction is drawn
 * above EVERY question of that section or just the one that opens it. The
 * drawing is the runner's, so what the backend owes it is the flag itself —
 * per section, on the take payload, and defaulted OFF for anything authored
 * before the field existed (which is what every section did until now).
 */
@SpringBootTest
@AutoConfigureMockMvc
class SectionInstructionRepeatTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void theFlagIsAuthoredPerSectionAndReachesTheTakePayload() throws Exception {
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"Repeat Instruction QNR\",\"durationMinutes\":10,\"hasSections\":true}"),
                "$.questionnaireId");

        // Part A repeats its instruction; Part B is authored by a client that
        // does not know the field exists, which must mean off rather than 400.
        int partA = JsonPath.read(postJson("/api/questionnaire/" + questionnaireId + "/sections",
                "{\"name\":\"Repeat Part A\",\"instruction\":\"Rate each statement as it applies to you at work.\","
                        + "\"showInstructionOnEachQuestion\":true}"), "$.sectionId");
        int partB = JsonPath.read(postJson("/api/questionnaire/" + questionnaireId + "/sections",
                "{\"name\":\"Repeat Part B\",\"instruction\":\"Answer honestly.\"}"), "$.sectionId");

        mvc.perform(get("/api/questionnaire/" + questionnaireId + "/sections"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].showInstructionOnEachQuestion").value(true))
                .andExpect(jsonPath("$[1].showInstructionOnEachQuestion").value(false));

        // The PUT replaces every field, the flag included: turning it on is an
        // edit like any other, and a body that omits it turns it off the same
        // way an omitted instruction clears one.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/sections/" + partB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Repeat Part B\",\"instruction\":\"Answer honestly.\","
                                + "\"showInstructionOnEachQuestion\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.showInstructionOnEachQuestion").value(true));
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/sections/" + partB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Repeat Part B\",\"instruction\":\"Answer honestly.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.showInstructionOnEachQuestion").value(false));

        // ── What the respondent's payload carries ────────────────────────
        int question = JsonPath.read(postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"Repeat instruction question\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}"), "$.questionId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + question + ",\"sectionId\":" + partA
                                + ",\"sortOrder\":0}]"))
                .andExpect(status().isOk());

        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"Repeat Instruction Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"Repeat Taker\",\"email\":\"repeat.taker@test.local\",\"dob\":\"04-04-2004\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000004\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"repeat.taker@test.local\",\"dob\":\"2004-04-04\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        // Only sections that hold a question appear in the payload, so Part B
        // (empty) is absent — what matters is that Part A arrives with both
        // its instruction and the flag that decides how often it is drawn.
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sections.length()").value(1))
                .andExpect(jsonPath("$.sections[0].name").value("Repeat Part A"))
                .andExpect(jsonPath("$.sections[0].instruction")
                        .value("Rate each statement as it applies to you at work."))
                .andExpect(jsonPath("$.sections[0].showInstructionOnEachQuestion").value(true));
    }
}
