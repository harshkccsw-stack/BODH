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
 * Portal mirror of DashboardAuthControllerTest: same email + dob credential,
 * but the gate flips — respondent profiles get in, practitioner-only and
 * superadmin accounts get 403. The login body also carries the respondent's
 * allotted assessment attempts.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PortalAuthControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void respondentCanLogInAndGetsAllottedAssessments() throws Exception {
        // Profile creation speaks dd-MM-yyyy; login speaks ISO.
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Resp\",\"email\":\"portal.resp@test.local\",\"dob\":\"15-03-1999\","
                                + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.resp@test.local\",\"dob\":\"1999-03-15\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.respondent.name").value("Portal Resp"))
                .andExpect(jsonPath("$.respondent.email").value("portal.resp@test.local"))
                .andExpect(jsonPath("$.respondent.serialId").isNotEmpty())
                .andExpect(jsonPath("$.respondent.allottedAssessments").isArray())
                .andExpect(jsonPath("$.respondent.allottedAssessments").isEmpty());
    }

    @Test
    void tokenRoundTripsThroughMe() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Me\",\"email\":\"portal.me@test.local\",\"dob\":\"20-08-1998\","
                                + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        String body = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.me@test.local\",\"dob\":\"1998-08-20\"}"))
                .andReturn().getResponse().getContentAsString();
        String token = com.jayway.jsonpath.JsonPath.read(body, "$.token");

        mvc.perform(get("/api/portal/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("portal.me@test.local"))
                .andExpect(jsonPath("$.name").value("Portal Me"))
                .andExpect(jsonPath("$.allottedAssessments").isArray());

        mvc.perform(get("/api/portal/me").header("Authorization", "Bearer not-a-real-token"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/portal/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void nonRespondentAccountsCannotLogIn() throws Exception {
        // The seeded superadmin holds no respondent profile.
        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/practitioners/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Pract\",\"email\":\"portal.pract@test.local\",\"dob\":\"01-02-1980\","
                                + "\"phone\":\"+91 90000 00000\",\"practitionerStatus\":null,\"vertical\":null,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.pract@test.local\",\"dob\":\"1980-02-01\"}"))
                .andExpect(status().isForbidden());
    }

    /**
     * The second credential: the same dob password, but the identifier is the
     * respondent's employee id instead of their email. Case-insensitive,
     * matching the column's collation.
     */
    @Test
    void respondentCanLogInWithEmployeeId() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Emp\",\"email\":\"portal.emp@test.local\",\"dob\":\"05-05-1995\","
                                + "\"phone\":\"+91 90000 00000\",\"employeeId\":\"EMP1042\",\"gender\":\"MALE\","
                                + "\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.employeeId").value("EMP1042"));

        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"emp1042\",\"dob\":\"1995-05-05\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.respondent.employeeId").value("EMP1042"))
                .andExpect(jsonPath("$.respondent.email").value("portal.emp@test.local"));

        // The email identifier still works for the same account.
        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"portal.emp@test.local\",\"dob\":\"1995-05-05\"}"))
                .andExpect(status().isOk());

        // Right code, wrong password.
        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"EMP1042\",\"dob\":\"1995-05-06\"}"))
                .andExpect(status().isUnauthorized());

        // No such code.
        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"identifier\":\"EMP9999\",\"dob\":\"1995-05-05\"}"))
                .andExpect(status().isUnauthorized());
    }

    /** Optional means optional: no code on file, email login unaffected. */
    @Test
    void employeeIdIsOptionalAndValidated() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Blank\",\"email\":\"portal.blank@test.local\",\"dob\":\"09-09-1989\","
                                + "\"phone\":\"+91 90000 00000\",\"employeeId\":\"  \",\"gender\":\"MALE\","
                                + "\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.employeeId").doesNotExist());

        // Alphanumeric is what keeps '@' out, so the login split stays unambiguous.
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Bad\",\"email\":\"portal.bad@test.local\",\"dob\":\"09-09-1989\","
                                + "\"phone\":\"+91 90000 00000\",\"employeeId\":\"EMP-104@2\",\"gender\":\"MALE\","
                                + "\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isBadRequest());
    }

    /** Unique per organization — these two share the null (unaffiliated) scope. */
    @Test
    void duplicateEmployeeIdIsRejected() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Dup A\",\"email\":\"portal.dupa@test.local\",\"dob\":\"01-01-1990\","
                                + "\"phone\":\"+91 90000 00000\",\"employeeId\":\"DUP7\",\"gender\":\"MALE\","
                                + "\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Dup B\",\"email\":\"portal.dupb@test.local\",\"dob\":\"02-02-1990\","
                                + "\"phone\":\"+91 90000 00000\",\"employeeId\":\"dup7\",\"gender\":\"MALE\","
                                + "\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isConflict());
    }

    @Test
    void wrongDobAndUnknownEmailAreRejected() throws Exception {
        mvc.perform(post("/api/respondents/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Wrong\",\"email\":\"portal.wrong@test.local\",\"dob\":\"11-11-1991\","
                                + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.wrong@test.local\",\"dob\":\"1991-11-12\"}"))
                .andExpect(status().isUnauthorized());

        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.nobody@test.local\",\"dob\":\"1990-01-01\"}"))
                .andExpect(status().isUnauthorized());
    }
}
