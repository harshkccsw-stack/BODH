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
 * The activity viewer's endpoint. Two things are worth pinning: that the
 * super-admin gate holds even while app.security.require-auth is OFF (this
 * table is not something to leave open during that rollout), and that reading
 * the trail does not itself get recorded.
 */
@SpringBootTest(properties = "app.activity.async=false")
@AutoConfigureMockMvc
class ActivityLogViewerTest {

    @Autowired
    private MockMvc mvc;

    private String tokenFor(String email, String isoDob) throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"" + isoDob + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    /**
     * The global flag is off in this context, so every OTHER endpoint answers
     * anonymous callers. This one must not.
     */
    @Test
    void anonymousIsRefusedEvenWhileTheGlobalFlagIsOff() throws Exception {
        mvc.perform(get("/api/reports/getRespondents"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/activity/getAll"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aSuperAdminSeesThePage() throws Exception {
        mvc.perform(get("/api/activity/getAll")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor("superadmin@test.local", "1990-01-01")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.totalItems").exists());
    }

    /**
     * 403, not 401 — the apiClient logs a user out on 401, and being sent to
     * the login screen for opening a page you simply lack rights to would be
     * both wrong and baffling.
     */
    @Test
    void aNonSuperAdminIsForbiddenNotLoggedOut() throws Exception {
        mvc.perform(post("/api/practitioners/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Plain Practitioner\",\"email\":\"plain.pract@test.local\","
                                + "\"dob\":\"12-06-1991\",\"phone\":null,\"gender\":null,"
                                + "\"status\":\"ACTIVE\",\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(get("/api/activity/getAll")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenFor("plain.pract@test.local", "1991-06-12")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    /** Filters are what make a table of every request usable. */
    @Test
    void theOutcomeFilterNarrowsToFailures() throws Exception {
        String token = tokenFor("superadmin@test.local", "1990-01-01");

        // Guarantee one of each.
        mvc.perform(get("/api/qualities/getAll")).andExpect(status().isOk());
        mvc.perform(get("/api/questions/getById/abc")).andExpect(status().isBadRequest());

        mvc.perform(get("/api/activity/getAll?outcome=CLIENT_ERROR&size=100")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.outcome != 'CLIENT_ERROR')]").isEmpty())
                .andExpect(jsonPath("$.items[0]").exists());
    }

    /** Reading the trail must not fill the trail with people reading it. */
    @Test
    void theViewersOwnReadsAreNotRecorded() throws Exception {
        String token = tokenFor("superadmin@test.local", "1990-01-01");

        mvc.perform(get("/api/activity/getAll?size=100")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());

        mvc.perform(get("/api/activity/getAll?search=%2Fapi%2Factivity&size=100")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
    }
}
