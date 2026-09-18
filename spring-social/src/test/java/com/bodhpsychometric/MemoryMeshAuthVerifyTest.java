package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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

/** MemoryMesh's sign-in fallback: the same checks as the portal login, by email, employee id, or phone pair. */
@SpringBootTest(properties = { "app.sync.memorymesh-key=test-sync-key", "app.security.require-auth=true" })
@AutoConfigureMockMvc
@TestMethodOrder(OrderAnnotation.class)
class MemoryMeshAuthVerifyTest {

    private static final String KEY = SyncKeyGuard.KEY_HEADER;

    @Autowired
    private MockMvc mvc;

    private org.springframework.test.web.servlet.ResultActions verify(String json) throws Exception {
        return mvc.perform(post("/api/sync/memorymesh/auth/verify")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json));
    }

    @Test
    @Order(1)
    void aPersonMirroredHereIsVerifiedByEmailOrPhoneAndRefusedOnAWrongDob() throws Exception {
        mvc.perform(post("/api/sync/memorymesh/respondents")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"name":"Verify Person","email":"mm.verify@test.local","phoneCountryCode":"+91",\
                        "phone":"9700000031","dob":"1992-02-02","gender":"OTHER"}"""))
                .andExpect(status().isCreated());

        verify("{\"identifier\":\"mm.verify@test.local\",\"dob\":\"1992-02-02\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("mm.verify@test.local"))
                .andExpect(jsonPath("$.phone").value("9700000031"))
                .andExpect(jsonPath("$.gender").value("OTHER"))
                .andExpect(jsonPath("$.dob").value("1992-02-02"))
                .andExpect(jsonPath("$.serialId").isNotEmpty());

        verify("{\"phoneCountryCode\":\"+91\",\"phone\":\"9700000031\",\"dob\":\"1992-02-02\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("mm.verify@test.local"));

        verify("{\"identifier\":\"mm.verify@test.local\",\"dob\":\"1992-02-03\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid credentials"));
        verify("{\"identifier\":\"nobody@test.local\",\"dob\":\"1992-02-02\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid credentials"));
        verify("{\"dob\":\"1992-02-02\"}")
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Order(2)
    void withoutTheKeyItIsShut() throws Exception {
        mvc.perform(post("/api/sync/memorymesh/auth/verify")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"identifier\":\"mm.verify@test.local\",\"dob\":\"1992-02-02\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid sync key"));
    }
}
