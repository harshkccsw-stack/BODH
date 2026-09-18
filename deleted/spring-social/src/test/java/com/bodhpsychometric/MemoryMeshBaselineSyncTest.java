package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.MethodOrderer.OrderAnnotation;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.security.SyncKeyGuard;
import com.jayway.jsonpath.JsonPath;

/**
 * The baseline doors: MemoryMesh replaces the questions, stores a person's
 * answers (creating the person if the earlier mirror never ran), and cannot
 * remove a question that has been answered. Enforcement on, key required.
 */
@SpringBootTest(properties = {
        "app.sync.memorymesh-key=test-sync-key",
        "app.security.require-auth=true" })
@AutoConfigureMockMvc
@TestMethodOrder(OrderAnnotation.class)
class MemoryMeshBaselineSyncTest {

    private static final String KEY = SyncKeyGuard.KEY_HEADER;
    private static long q1;
    private static long q2;

    @Autowired
    private MockMvc mvc;

    @Test
    @Order(1)
    void questionsAreReplacedInOrderAndLockedByTheKey() throws Exception {
        mvc.perform(put("/api/sync/memorymesh/baseline/questions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("[{\"text\":\"x\",\"active\":true}]"))
                .andExpect(status().isUnauthorized());

        String body = mvc.perform(put("/api/sync/memorymesh/baseline/questions")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        [{"text":"I leave things until the last minute.","active":true},
                         {"text":"I plan my week in advance.","active":true}]"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].sortOrder").value(0))
                .andExpect(jsonPath("$[1].sortOrder").value(1))
                .andReturn().getResponse().getContentAsString();
        q1 = ((Number) JsonPath.read(body, "$[0].baselineQuestionId")).longValue();
        q2 = ((Number) JsonPath.read(body, "$[1].baselineQuestionId")).longValue();

        mvc.perform(get("/api/sync/memorymesh/baseline/questions").header(KEY, "test-sync-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].text").value("I leave things until the last minute."));
    }

    @Test
    @Order(2)
    void answersCreateThePersonIfNeededAndAreBounded() throws Exception {
        String person = """
                "respondent":{"name":"Baseline Person","email":"mm.baseline@test.local",\
                "phoneCountryCode":"+91","phone":"9700000021","dob":"1993-03-03","gender":"MALE"}""";

        mvc.perform(post("/api/sync/memorymesh/baseline/answers")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + person + ",\"answers\":[{\"baselineQuestionId\":%d,\"value\":6}]}".formatted(q1)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("from 1 to 5")));

        mvc.perform(post("/api/sync/memorymesh/baseline/answers")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + person + ",\"answers\":[{\"baselineQuestionId\":999999,\"value\":3}]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/sync/memorymesh/baseline/answers")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + person + ",\"answers\":[{\"baselineQuestionId\":%d,\"value\":4},{\"baselineQuestionId\":%d,\"value\":2}]}"
                        .formatted(q1, q2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stored").value(2))
                .andExpect(jsonPath("$.serialId").value(Matchers.matchesPattern("USR-\\d{6}")));

        // The person the answers created can sign in here, like any mirrored respondent.
        mvc.perform(post("/api/portal/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"mm.baseline@test.local\",\"dob\":\"1993-03-03\"}"))
                .andExpect(status().isOk());

        // Re-sending is an upsert, not a duplicate.
        mvc.perform(post("/api/sync/memorymesh/baseline/answers")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + person + ",\"answers\":[{\"baselineQuestionId\":%d,\"value\":5}]}".formatted(q1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stored").value(1));
    }

    @Test
    @Order(3)
    void anAnsweredQuestionCannotBeRemovedButCanBeRetired() throws Exception {
        mvc.perform(put("/api/sync/memorymesh/baseline/questions")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("[{\"baselineQuestionId\":%d,\"text\":\"I leave things until the last minute.\",\"active\":true}]"
                        .formatted(q1)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("retire it instead")));

        mvc.perform(put("/api/sync/memorymesh/baseline/questions")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        [{"baselineQuestionId":%d,"text":"I plan my week in advance.","active":false},
                         {"baselineQuestionId":%d,"text":"I leave things until the last minute.","active":true}]"""
                        .formatted(q2, q1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].baselineQuestionId").value(q2))
                .andExpect(jsonPath("$[0].active").value(false))
                .andExpect(jsonPath("$[0].sortOrder").value(0));
    }
}
