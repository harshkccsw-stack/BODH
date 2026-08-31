package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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
 * Display order of a SECTIONED questionnaire, through every reader at once:
 * the dashboard list, the portal take flow and the export sheet.
 *
 * The rule under test: a placement's sortOrder is per-SECTION (the wizard
 * numbers each section from 0), so section comes first and position second.
 * Sorting by sortOrder alone interleaves the sections — it handed the
 * respondent question 1 of every section before question 2 of any of them,
 * and gave the export sheet columns in that same braided order.
 *
 * Every fixture name is prefixed so a shared database can be cleaned up by
 * hand if this ever runs somewhere other than H2.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SectionDisplayOrderTest {

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

    private int createSection(int questionnaireId, String name) throws Exception {
        return JsonPath.read(postJson("/api/questionnaire/" + questionnaireId + "/sections",
                "{\"name\":\"" + name + "\",\"instruction\":\"Read " + name + " carefully.\"}"),
                "$.sectionId");
    }

    @Test
    void sectionedQuestionnaireIsDeliveredSectionBySectionEverywhere() throws Exception {
        int a1 = createQuestion("Order A one");
        int a2 = createQuestion("Order A two");
        int b1 = createQuestion("Order B one");
        int b2 = createQuestion("Order B two");

        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"Order Sectioned QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":10,"
                        + "\"generalInstruction\":null,\"hasSections\":true}"), "$.questionnaireId");
        int sectionA = createSection(questionnaireId, "Order Part A");
        int sectionB = createSection(questionnaireId, "Order Part B");

        // Exactly what the wizard sends: sortOrder restarts at 0 in each
        // section. The payload is deliberately braided so that only the
        // section-first ordering — not the order rows were written in — can
        // produce the assertions below.
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + a1 + ",\"sectionId\":" + sectionA + ",\"sortOrder\":0},"
                                + "{\"questionId\":" + b1 + ",\"sectionId\":" + sectionB + ",\"sortOrder\":0},"
                                + "{\"questionId\":" + a2 + ",\"sectionId\":" + sectionA + ",\"sortOrder\":1},"
                                + "{\"questionId\":" + b2 + ",\"sectionId\":" + sectionB + ",\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        // ── The dashboard list (wizard edit-load, import picker, preview) ──
        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].stem").value("Order A one"))
                .andExpect(jsonPath("$[1].stem").value("Order A two"))
                .andExpect(jsonPath("$[2].stem").value("Order B one"))
                .andExpect(jsonPath("$[3].stem").value("Order B two"))
                // The tags counted this way all along — now the order agrees.
                .andExpect(jsonPath("$[0].questionTag").value("Section_A_Q_1"))
                .andExpect(jsonPath("$[1].questionTag").value("Section_A_Q_2"))
                .andExpect(jsonPath("$[2].questionTag").value("Section_B_Q_1"))
                .andExpect(jsonPath("$[3].questionTag").value("Section_B_Q_2"));

        // ── The portal take flow ─────────────────────────────────────────
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"Order Sectioned Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"Order Taker\",\"email\":\"order.taker@test.local\",\"dob\":\"03-03-2003\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"order.taker@test.local\",\"dob\":\"2003-03-03\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        mvc.perform(get("/api/portal/assessments/getById/" + mappingId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questions.length()").value(4))
                .andExpect(jsonPath("$.questions[0].stem").value("Order A one"))
                .andExpect(jsonPath("$.questions[1].stem").value("Order A two"))
                .andExpect(jsonPath("$.questions[2].stem").value("Order B one"))
                .andExpect(jsonPath("$.questions[3].stem").value("Order B two"))
                // Sections in their own order, each with the instruction the
                // portal now renders above that section's first question.
                .andExpect(jsonPath("$.sections.length()").value(2))
                .andExpect(jsonPath("$.sections[0].name").value("Order Part A"))
                .andExpect(jsonPath("$.sections[0].instruction").value("Read Order Part A carefully."))
                .andExpect(jsonPath("$.sections[1].name").value("Order Part B"));

        // ── What an unfinished submission is TOLD ────────────────────────
        // The pending questions are named the way the portal's question index
        // names them — inside their section, so Part B starts at Q1 again —
        // and never by questionId, which names nothing the respondent can see.
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/portal/assessments/submit/" + mappingId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(
                        "4 questions are still pending")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(
                        "Order Part A · Q1, Order Part A · Q2, Order Part B · Q1, Order Part B · Q2")));

        // ── The export sheet's columns ───────────────────────────────────
        mvc.perform(get("/api/reports/export/assessment/" + assessmentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.questionColumns.length()").value(4))
                .andExpect(jsonPath("$.questionColumns[0].questionTag").value("Section_A_Q_1"))
                .andExpect(jsonPath("$.questionColumns[1].questionTag").value("Section_A_Q_2"))
                .andExpect(jsonPath("$.questionColumns[2].questionTag").value("Section_B_Q_1"))
                .andExpect(jsonPath("$.questionColumns[3].questionTag").value("Section_B_Q_2"));

        // ── Section-less placements sort LAST, not first ─────────────────
        // Deleting a section detaches its questions rather than deleting them
        // (and clears their tags), so a sectioned questionnaire can legally
        // hold placements with no section. They belong at the end — that is
        // where the wizard's "unassigned" group and the preview put them.
        mvc.perform(delete("/api/questionnaire/" + questionnaireId + "/sections/" + sectionA))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/questions/getByQuestionnaireId/" + questionnaireId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].stem").value("Order B one"))
                .andExpect(jsonPath("$[1].stem").value("Order B two"))
                .andExpect(jsonPath("$[2].stem").value("Order A one"))
                .andExpect(jsonPath("$[3].stem").value("Order A two"))
                // Part B is the only section left, so it inherits the A letter.
                .andExpect(jsonPath("$[0].questionTag").value("Section_A_Q_1"))
                .andExpect(jsonPath("$[2].questionTag").doesNotExist());
    }
}
