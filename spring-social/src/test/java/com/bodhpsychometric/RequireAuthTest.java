package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
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
 * Enforcing mode — what happens once app.security.require-auth is flipped on.
 * Pinned now, while the flag is still off in every environment, so the switch
 * is a known quantity rather than an experiment on staging.
 */
@SpringBootTest(properties = "app.security.require-auth=true")
@AutoConfigureMockMvc
class RequireAuthTest {

    @Autowired
    private MockMvc mvc;

    private String superAdminToken() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    @Test
    void anonymousIsRejectedWithTheUsualMessageShape() throws Exception {
        mvc.perform(get("/api/reports/getRespondents"))
                .andExpect(status().isUnauthorized())
                // Both frontends read e?.response?.data?.message — a filter
                // sits outside ApiExceptionHandler, so this shape is written
                // by hand and has to be asserted.
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void aGarbageTokenIsRejectedToo() throws Exception {
        mvc.perform(get("/api/reports/getRespondents")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-real-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aValidTokenGetsThrough() throws Exception {
        mvc.perform(get("/api/reports/getRespondents")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + superAdminToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    /** Sign-in cannot require a token, or nobody could ever get one. */
    @Test
    void theSignInDoorStaysOpen() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@test.local\",\"dob\":\"1990-01-01\"}"))
                // 401 for bad credentials — NOT for missing authentication.
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or date of birth"));
    }

    @Test
    void portalSelfRegistrationStaysOpen() throws Exception {
        // No token, and the link is bogus — what matters is that the filter
        // let it reach the controller to say so.
        mvc.perform(post("/api/portal/register/__no_such_token__")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"X\",\"email\":\"x@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().is(org.hamcrest.Matchers.not(401)));
    }

    /**
     * Browsers send no Authorization on a CORS preflight. Rejecting OPTIONS
     * would break every cross-origin call before it was made.
     */
    @Test
    void corsPreflightIsNeverRejected() throws Exception {
        mvc.perform(options("/api/reports/getRespondents")
                        .header(HttpHeaders.ORIGIN, "http://localhost:3000")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk());
    }
}
