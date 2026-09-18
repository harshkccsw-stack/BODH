package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.bodhpsychometric.controller.sync.MemoryMeshSyncController;

/**
 * The MemoryMesh mirror door, with enforcement ON: the endpoint has no bearer
 * of its own, so this is what proves the public-list entry and the key check
 * together do the right thing — reachable without a token, closed without the
 * key.
 */
@SpringBootTest(properties = {
        "app.sync.memorymesh-key=test-sync-key",
        "app.security.require-auth=true" })
@AutoConfigureMockMvc
class MemoryMeshSyncTest {

    private static final String KEY = MemoryMeshSyncController.KEY_HEADER;

    @Autowired
    private MockMvc mvc;

    private static String body(String email, String phone, String dob) {
        return """
                {"name":"Mirrored Person","email":"%s","phoneCountryCode":"+91",\
                "phone":"%s","dob":"%s","gender":"FEMALE","sourceUserId":42}""".formatted(email, phone, dob);
    }

    private ResultActions sync(String key, String json) throws Exception {
        var request = post("/api/sync/memorymesh/respondents")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json);
        if (key != null) {
            request.header(KEY, key);
        }
        return mvc.perform(request);
    }

    @Test
    void withoutTheKeyItIsUnauthorizedEvenThoughThePathIsPublic() throws Exception {
        // Not the filter's "Sign in to continue" — the path is public — but
        // the controller's own lock is shut.
        sync(null, body("mm.nokey@test.local", "9700000001", "1994-08-05"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid sync key"));
        sync("wrong-key", body("mm.nokey@test.local", "9700000001", "1994-08-05"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aNewPersonBecomesAnIdentityAndAProfileAndCanSignInToThePortal() throws Exception {
        sync("test-sync-key", body("mm.new@test.local", "9700000002", "1994-08-05"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.created").value(true))
                .andExpect(jsonPath("$.email").value("mm.new@test.local"))
                // The serial code is derived from the id, like every other creation point.
                .andExpect(jsonPath("$.serialId").value(Matchers.matchesPattern("USR-\\d{6}")));

        // The whole point: the person now signs in to BodhAssess with the same
        // email and date of birth they registered with on MemoryMesh.
        mvc.perform(post("/api/portal/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"mm.new@test.local\",\"dob\":\"1994-08-05\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void mirroringTheSamePersonTwiceIsIdempotent() throws Exception {
        sync("test-sync-key", body("mm.twice@test.local", "9700000003", "1990-01-31"))
                .andExpect(status().isCreated());
        sync("test-sync-key", body("mm.twice@test.local", "9700000003", "1990-01-31"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(false));
    }

    @Test
    void aMatchingEmailWithADifferentDobIsRefused() throws Exception {
        sync("test-sync-key", body("mm.clash@test.local", "9700000004", "1988-03-14"))
                .andExpect(status().isCreated());
        // dob is the credential: a mismatch means the mirror is not this person.
        sync("test-sync-key", body("mm.clash@test.local", "9700000005", "1988-03-15"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("date of birth")));
    }

    @Test
    void theIdentityMinimumAppliesHereToo() throws Exception {
        sync("test-sync-key", """
                {"name":"No Gender","email":"mm.nogender@test.local","phoneCountryCode":"+91",\
                "phone":"9700000006","dob":"1991-02-02"}""")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Gender is required"));

        String future = java.time.LocalDate.now().plusYears(1).toString();
        sync("test-sync-key", body("mm.future@test.local", "9700000007", future))
                .andExpect(status().isBadRequest());
    }
}
