package com.bodhpsychometric;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Comparator;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.model.activity.ActivityLog;
import com.bodhpsychometric.model.activity.enums.ActivityOutcome;
import com.bodhpsychometric.repository.activity.ActivityLogRepository;

/**
 * The activity trail. Runs the recorder synchronously (the queue and its
 * writer thread are exercised in production, but a test cannot assert on a row
 * a background thread has not written yet).
 *
 * Every request is recorded, reads included — which is what these assertions
 * are really pinning: that a plain GET produces a row at all.
 */
@SpringBootTest(properties = "app.activity.async=false")
@AutoConfigureMockMvc
class ActivityLogTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ActivityLogRepository activityLogs;

    /** The newest row — every test here makes exactly one request. */
    private ActivityLog latest() {
        List<ActivityLog> all = activityLogs.findAll();
        assertTrue(!all.isEmpty(), "no activity was recorded at all");
        return all.stream()
                .max(Comparator.comparing(ActivityLog::getActivityLogId))
                .orElseThrow();
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
    void aPlainReadIsRecorded() throws Exception {
        // Query in the URL, not .param(): the trail stores the raw query
        // string, which is how a real request arrives.
        mvc.perform(get("/api/reports/getRespondents?size=1"))
                .andExpect(status().isOk());

        ActivityLog row = latest();
        assertEquals("GET", row.getMethod());
        assertEquals("/api/reports/getRespondents", row.getPath());
        assertEquals("/api/reports/getRespondents", row.getPathTemplate());
        assertEquals("size=1", row.getQueryString());
        assertEquals(200, row.getHttpStatus());
        assertEquals(ActivityOutcome.SUCCESS, row.getOutcome());
        assertNotNull(row.getOccurredAt());
        assertNotNull(row.getRequestId(), "the row must be joinable to the log lines");
    }

    /** With require-auth off, an anonymous call is normal — recorded, no who. */
    @Test
    void anAnonymousCallIsRecordedWithoutAnActor() throws Exception {
        mvc.perform(get("/api/qualities/getAll")).andExpect(status().isOk());

        ActivityLog row = latest();
        assertNull(row.getActorUserId());
        assertNull(row.getActorEmail());
    }

    @Test
    void anAuthenticatedCallRecordsWhoDidIt() throws Exception {
        String token = superAdminToken();
        mvc.perform(get("/api/qualities/getAll")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());

        ActivityLog row = latest();
        assertNotNull(row.getActorUserId());
        assertEquals("superadmin@test.local", row.getActorEmail());
        assertTrue(row.isActorSuperAdmin());
    }

    @Test
    void aFailedRequestIsRecordedAsAClientError() throws Exception {
        mvc.perform(get("/api/questions/getById/abc")).andExpect(status().isBadRequest());

        ActivityLog row = latest();
        assertEquals(400, row.getHttpStatus());
        assertEquals(ActivityOutcome.CLIENT_ERROR, row.getOutcome());
    }

    /**
     * The reason this is a filter and not a HandlerInterceptor: nothing
     * handled this request, so an interceptor would never have run.
     */
    @Test
    void anUnknownEndpointIsStillRecorded() throws Exception {
        mvc.perform(get("/api/no-such-endpoint-at-all")).andExpect(status().isNotFound());

        ActivityLog row = latest();
        assertEquals("/api/no-such-endpoint-at-all", row.getPath());
        assertEquals(404, row.getHttpStatus());
        assertNull(row.getPathTemplate(), "nothing matched, so there is no template");
    }

    /** A write is what the trail is really for. */
    @Test
    void aMutationRecordsItsTemplateNotItsIds() throws Exception {
        mvc.perform(post("/api/qualities/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__smoke__activity\",\"description\":null}"))
                .andExpect(status().isCreated());

        ActivityLog row = latest();
        assertEquals("POST", row.getMethod());
        assertEquals("/api/qualities/create", row.getPathTemplate());
        assertEquals(ActivityOutcome.SUCCESS, row.getOutcome());
    }
}
