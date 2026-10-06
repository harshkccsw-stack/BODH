package com.bodhpsychometric;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
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
 * 2026-10-06: the reports' assessment dropdown narrows to an organization's
 * catalog when Live Tracking has an organization picked.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportAssessmentDropdownTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private int createAssessment(String prefix) throws Exception {
        int questionId = JsonPath.read(postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + prefix + " stem\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}"), "$.questionId");
        int qid = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"" + prefix + " QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":10,\"generalInstruction\":null}"),
                "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + qid + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":0}]"))
                .andExpect(status().isOk());
        return JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"" + prefix + " Assessment\",\"questionnaireId\":" + qid + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
    }

    @Test
    void anOrganizationNarrowsTheDropdownToItsCatalog() throws Exception {
        int mapped = createAssessment("Dropdown Mapped");
        createAssessment("Dropdown Unmapped");
        int orgId = JsonPath.read(postJson("/api/organizations/create",
                "{\"name\":\"Dropdown Org\",\"orgEmail\":null,\"description\":null,"
                        + "\"logoBase64\":null,\"coBrandLogoBase64\":null,\"assessmentIds\":[" + mapped + "]}"),
                "$.organizationId");

        mvc.perform(get("/api/reports/getAssessments").param("search", "dropdown"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(2));

        mvc.perform(get("/api/reports/getAssessments").param("organizationId", String.valueOf(orgId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].assessmentId").value(mapped))
                .andExpect(jsonPath("$.items[*].name", not(hasItem("Dropdown Unmapped Assessment"))));

        // Search still applies inside the catalog, case-insensitively.
        mvc.perform(get("/api/reports/getAssessments")
                        .param("organizationId", String.valueOf(orgId)).param("search", "MAPPED"))
                .andExpect(jsonPath("$.totalItems").value(1));
        mvc.perform(get("/api/reports/getAssessments")
                        .param("organizationId", String.valueOf(orgId)).param("search", "unmapped"))
                .andExpect(jsonPath("$.totalItems").value(0));
    }
}
