package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Computation drafts, and the guarantee that nothing here reaches an AI.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ReportComputationControllerTest {

    @Autowired
    private MockMvc mvc;

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return "Bearer " + body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    @Test
    void anonymousIsRefused() throws Exception {
        mvc.perform(get("/api/report-computations/getAll"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aComputationNeedsARealAssessment() throws Exception {
        // Every column reference is checked against this assessment's live
        // column list, so a draft naming one that does not exist cannot be
        // checked at all and is refused rather than half-saved.
        String body = """
                {"name":"__smoke__ ghost","assessmentId":999999}
                """;
        mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aComputationWithoutAnAssessmentIs400() throws Exception {
        mvc.perform(post("/api/report-computations/create")
                        .header(HttpHeaders.AUTHORIZATION, auth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__ no assessment\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void gettingOneThatDoesNotExistIs404() throws Exception {
        mvc.perform(get("/api/report-computations/getById/999999")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isNotFound());
    }

    @Test
    void markingReadyOneThatDoesNotExistIs404() throws Exception {
        mvc.perform(post("/api/report-computations/markReady/999999")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isNotFound());
    }

    /**
     * The constraint stated as a test rather than a comment: there is no route
     * from a draft to generated code, because no provider has been chosen.
     */
    @Test
    void thereIsNoGenerateEndpoint() throws Exception {
        mvc.perform(post("/api/report-computations/generate/1")
                        .header(HttpHeaders.AUTHORIZATION, auth()))
                .andExpect(status().isNotFound());
    }
}
