package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bodhpsychometric.security.ActorFilter;
import com.bodhpsychometric.security.RequestActor;

/**
 * Resolve-only mode — the default, and the whole point of shipping 3b before
 * 3c: identity becomes available on every request WITHOUT anything starting
 * to fail. Every assertion here is about behaviour NOT changing.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ActorFilterTest {

    @Autowired
    private MockMvc mvc;

    /** Echoes whatever the filter resolved, so the actor can be asserted. */
    @TestConfiguration
    static class ActorProbe {

        @RestController
        static class Probe {
            @GetMapping("/api/__test__/whoami")
            public String whoami() {
                RequestActor actor = ActorFilter.current();
                return actor.label() + "/" + actor.superAdmin();
            }
        }
    }

    private String superAdminToken() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll(".*\"token\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    @Test
    void aValidTokenIsResolvedIntoAnActor() throws Exception {
        mvc.perform(get("/api/__test__/whoami")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + superAdminToken()))
                .andExpect(status().isOk())
                // The seeded super admin, straight off the token claims.
                .andExpect(content().string(org.hamcrest.Matchers.endsWith("/true")));
    }

    @Test
    void noTokenIsAnonymousAndStillServed() throws Exception {
        mvc.perform(get("/api/__test__/whoami"))
                .andExpect(status().isOk())
                .andExpect(content().string("anonymous/false"));
    }

    /**
     * A malformed or expired token must behave exactly like no token while
     * enforcement is off — it is the caller's problem, not a server error,
     * and it must not change how the request is served.
     */
    @Test
    void aGarbageTokenIsAnonymousNotAnError() throws Exception {
        mvc.perform(get("/api/__test__/whoami")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer not-a-real-token"))
                .andExpect(status().isOk())
                .andExpect(content().string("anonymous/false"));
    }

    @Test
    void realEndpointsAreUnaffectedWithoutAToken() throws Exception {
        mvc.perform(get("/api/reports/getRespondents"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }
}
