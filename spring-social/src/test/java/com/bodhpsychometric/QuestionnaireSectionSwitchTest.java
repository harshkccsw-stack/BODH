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
 * Turning a questionnaire's sections on and off, through the catalog update.
 *
 * <p>Off DELETES the sections and leaves one list in the order a respondent
 * saw it, re-tagged Q_1..Q_n — it used to flip the flag alone and leave the
 * sections and their tags behind. An update that omits the flag changes
 * nothing. And once any respondent has started an assessment on the
 * questionnaire, the switch is refused both ways.
 *
 * Every fixture name is prefixed so a shared database can be cleaned up by
 * hand if this ever runs somewhere other than H2.
 */
@SpringBootTest
@AutoConfigureMockMvc
class QuestionnaireSectionSwitchTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private int createQuestion(String stem) throws Exception {
        return JsonPath.read(postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + stem + "\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"No\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}"), "$.questionId");
    }

    private int createQuestionnaire(String name, boolean sectioned) throws Exception {
        return JsonPath.read(postJson("/api/questionnaire/create", catalogBody(name, sectioned)),
                "$.questionnaireId");
    }

    /** The catalog body; `hasSections` null leaves the field out altogether. */
    private static String catalogBody(String name, Boolean hasSections) {
        return "{\"name\":\"" + name + "\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                + "\"description\":null,\"durationMinutes\":10,\"generalInstruction\":null"
                + (hasSections == null ? "" : ",\"hasSections\":" + hasSections) + "}";
    }

    private int createSection(int questionnaireId, String name) throws Exception {
        return JsonPath.read(postJson("/api/questionnaire/" + questionnaireId + "/sections",
                "{\"name\":\"" + name + "\",\"instruction\":\"About " + name + ".\"}"), "$.sectionId");
    }

    /** Two sections, braided on purpose so only section-first order passes. */
    private int sectionedFixture(String prefix) throws Exception {
        int a1 = createQuestion(prefix + " A one");
        int a2 = createQuestion(prefix + " A two");
        int b1 = createQuestion(prefix + " B one");
        int qid = createQuestionnaire(prefix + " QNR", true);
        int partA = createSection(qid, prefix + " Part A");
        int partB = createSection(qid, prefix + " Part B");
        mvc.perform(put("/api/questionnaire/" + qid + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + b1 + ",\"sectionId\":" + partB + ",\"sortOrder\":0},"
                                + "{\"questionId\":" + a2 + ",\"sectionId\":" + partA + ",\"sortOrder\":1},"
                                + "{\"questionId\":" + a1 + ",\"sectionId\":" + partA + ",\"sortOrder\":0}]"))
                .andExpect(status().isOk());
        return qid;
    }

    @Test
    void turningSectionsOffDeletesThemAndKeepsTheOrderRespondentsSaw() throws Exception {
        int qid = sectionedFixture("Switch Off");

        mvc.perform(put("/api/questionnaire/update/" + qid)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(catalogBody("Switch Off QNR", false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasSections").value(false));

        mvc.perform(get("/api/questionnaire/" + qid + "/sections"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mvc.perform(get("/api/questions/getByQuestionnaireId/" + qid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].stem").value("Switch Off A one"))
                .andExpect(jsonPath("$[1].stem").value("Switch Off A two"))
                .andExpect(jsonPath("$[2].stem").value("Switch Off B one"))
                .andExpect(jsonPath("$[0].questionTag").value("Q_1"))
                .andExpect(jsonPath("$[1].questionTag").value("Q_2"))
                .andExpect(jsonPath("$[2].questionTag").value("Q_3"));
    }

    @Test
    void anUpdateThatLeavesTheFlagOutChangesNothing() throws Exception {
        int qid = sectionedFixture("Switch Omit");

        mvc.perform(put("/api/questionnaire/update/" + qid)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(catalogBody("Switch Omit QNR renamed", null)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Switch Omit QNR renamed"))
                .andExpect(jsonPath("$.hasSections").value(true));

        mvc.perform(get("/api/questionnaire/" + qid + "/sections"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void theSwitchIsRefusedBothWaysOnceSomebodyHasStarted() throws Exception {
        int qid = sectionedFixture("Switch Locked");
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"Switch Locked Assessment\",\"questionnaireId\":" + qid + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"Switch Taker\",\"email\":\"switch.taker@test.local\",\"dob\":\"04-04-2004\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000001\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        // Allotted but not started: nobody has seen the layout yet, so the
        // switch is still allowed. Turn it off and back on to prove it.
        mvc.perform(put("/api/questionnaire/update/" + qid)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(catalogBody("Switch Locked QNR", false)))
                .andExpect(status().isOk());
        mvc.perform(put("/api/questionnaire/update/" + qid)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(catalogBody("Switch Locked QNR", true)))
                .andExpect(status().isOk());

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"switch.taker@test.local\",\"dob\":\"2004-04-04\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        mvc.perform(put("/api/questionnaire/update/" + qid)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(catalogBody("Switch Locked QNR", false)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(
                        "1 respondent has already started")));
        // Everything else on the row still saves.
        mvc.perform(put("/api/questionnaire/update/" + qid)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(catalogBody("Switch Locked QNR renamed", true)))
                .andExpect(status().isOk());
    }
}
