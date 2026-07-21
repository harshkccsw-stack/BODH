package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * End-to-end over the seeded superadmin: SuperAdminSeeder inserts the row
 * from test application.yml at startup, then /api/auth/login must accept the
 * same credentials and reject wrong ones.
 */
@SpringBootTest
@AutoConfigureMockMvc
class DashboardAuthControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void seededSuperadminCanLogIn() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.superAdmin").value(true))
                .andExpect(jsonPath("$.user.dashboardAccess").value(true))
                .andExpect(jsonPath("$.user.serialId").isNotEmpty());
    }

    @Test
    void tokenRoundTripsThroughMe() throws Exception {
        String body = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andReturn().getResponse().getContentAsString();
        String token = com.jayway.jsonpath.JsonPath.read(body, "$.token");

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("superadmin@test.local"))
                .andExpect(jsonPath("$.superAdmin").value(true))
                .andExpect(jsonPath("$.dashboardAccess").value(true));

        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer not-a-real-token"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void respondentOnlyAccountCannotLogIn() throws Exception {
        // Profile creation speaks dd-MM-yyyy; login speaks ISO.
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Resp Only\",\"email\":\"resp.only@test.local\",\"dob\":\"10-01-2000\","
                                + "\"phone\":null,\"gender\":null,\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"resp.only@test.local\",\"dob\":\"2000-01-10\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void practitionerAccountCanLogIn() throws Exception {
        mvc.perform(post("/api/practitioners/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Pract\",\"email\":\"pract@test.local\",\"dob\":\"05-06-1985\","
                                + "\"phone\":null,\"practitionerStatus\":null,\"vertical\":null,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"pract@test.local\",\"dob\":\"1985-06-05\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.superAdmin").value(false))
                .andExpect(jsonPath("$.user.dashboardAccess").value(true));
    }

    @Test
    void wrongDobIsRejected() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1991-12-31\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownEmailIsRejected() throws Exception {
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isUnauthorized());
    }
}
