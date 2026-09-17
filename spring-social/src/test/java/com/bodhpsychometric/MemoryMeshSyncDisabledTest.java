package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.controller.sync.MemoryMeshSyncController;

/**
 * The default: no key configured, so the door does not exist for anyone. A
 * public-listed endpoint must never be open by omission.
 */
@SpringBootTest
@AutoConfigureMockMvc
class MemoryMeshSyncDisabledTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void withNoKeyConfiguredEveryCallIsForbiddenEvenWithAKey() throws Exception {
        mvc.perform(post("/api/sync/memorymesh/respondents")
                .header(MemoryMeshSyncController.KEY_HEADER, "anything")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"X","email":"mm.disabled@test.local","phoneCountryCode":"+91",\
                        "phone":"9700000099","dob":"1994-08-05","gender":"MALE"}"""))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("MemoryMesh sync is not enabled on this server"));
    }
}
