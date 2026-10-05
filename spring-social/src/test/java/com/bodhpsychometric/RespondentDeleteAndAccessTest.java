package com.bodhpsychometric;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

/**
 * 2026-10-05: a reset hands an attempt back, after which the respondent can be
 * deleted (the untouched allotment goes with them); one identity may be both
 * practitioner and respondent; and a role group alone opens the dashboard.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RespondentDeleteAndAccessTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private int createRespondent(String name, String email, String dob) throws Exception {
        return JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"dob\":\"" + dob + "\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000002\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
    }

    /** A one-question questionnaire, an assessment on it, allotted to the respondent. */
    private int allot(String prefix, int respondentUserId) throws Exception {
        int questionId = JsonPath.read(postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + prefix + " stem\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Yes\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}"), "$.questionId");
        int qid = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"" + prefix + " QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":10,\"generalInstruction\":null}"),
                "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + qid + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":0}]"))
                .andExpect(status().isOk());
        int assessmentId = JsonPath.read(postJson("/api/assessments/create",
                "{\"name\":\"" + prefix + " Assessment\",\"questionnaireId\":" + qid + ","
                        + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false}"),
                "$.assessmentId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
        return assessmentId;
    }

    @Test
    void aStartedAttemptBlocksDeleteUntilItIsReset() throws Exception {
        int respondentId = createRespondent("Reset Then Delete", "reset.delete@test.local", "03-03-2003");
        allot("Reset Delete", respondentId);

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"reset.delete@test.local\",\"dob\":\"2003-03-03\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        mvc.perform(post("/api/portal/assessments/begin/" + mappingId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[]}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/respondents/delete-check/" + respondentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletable").value(false))
                .andExpect(jsonPath("$.startedAssessments[0]").value("Reset Delete Assessment"));
        mvc.perform(delete("/api/respondents/delete/" + respondentId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("Reports Hub")));

        mvc.perform(post("/api/reports/resetAssessment/" + mappingId))
                .andExpect(status().isOk());

        mvc.perform(get("/api/respondents/delete-check/" + respondentId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletable").value(true))
                .andExpect(jsonPath("$.untouchedAssessments[0]").value("Reset Delete Assessment"))
                .andExpect(jsonPath("$.keepsLogin").value(false));
        mvc.perform(delete("/api/respondents/delete/" + respondentId))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/respondents/getById/" + respondentId))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/respondents/delete-check/" + respondentId))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletingTheRespondentProfileOfAPractitionerKeepsTheirLogin() throws Exception {
        mvc.perform(post("/api/practitioners/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Both Hats\",\"email\":\"both.hats@test.local\",\"dob\":\"07-07-1987\","
                                + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000003\","
                                + "\"practitionerStatus\":null,\"vertical\":null,\"organizationId\":null}"))
                .andExpect(status().isCreated());
        // Same email + dob attaches a respondent profile to the same identity.
        int respondentId = createRespondent("Both Hats", "both.hats@test.local", "07-07-1987");
        allot("Both Hats", respondentId);

        mvc.perform(get("/api/respondents/delete-check/" + respondentId))
                .andExpect(jsonPath("$.deletable").value(true))
                .andExpect(jsonPath("$.keepsLogin").value(true));
        mvc.perform(delete("/api/respondents/delete/" + respondentId))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"both.hats@test.local\",\"dob\":\"1987-07-07\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void aRoleGroupOpensTheDashboardToARespondent() throws Exception {
        createRespondent("Respondent Admin", "resp.admin@test.local", "08-08-1988");
        String login = "{\"email\":\"resp.admin@test.local\",\"dob\":\"1988-08-08\"}";
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isForbidden());

        // Every identity is listed now, respondents included.
        String users = mvc.perform(get("/api/user-access/getAll"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].email", hasItem("resp.admin@test.local")))
                .andReturn().getResponse().getContentAsString();
        int userId = ((Number) JsonPath.<java.util.List<Object>>read(users,
                "$[?(@.email == 'resp.admin@test.local')].userId").get(0)).intValue();
        Boolean isRespondent = JsonPath.<java.util.List<Boolean>>read(users,
                "$[?(@.email == 'resp.admin@test.local')].respondent").get(0);
        org.junit.jupiter.api.Assertions.assertTrue(isRespondent);

        int roleId = JsonPath.read(postJson("/api/roles/create",
                "{\"name\":\"Access Test Reports\",\"description\":null,\"urlPaths\":[\"/reports/*\"]}"), "$.id");
        int groupId = JsonPath.read(postJson("/api/role-groups/create",
                "{\"name\":\"Access Test Group\",\"description\":null,\"roleIds\":[" + roleId + "]}"),
                "$.roleGroupId");
        mvc.perform(put("/api/user-access/assign-role-group/" + userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleGroupId\":" + groupId + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roleGroupName").value("Access Test Group"));

        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.urlPaths", hasItem("/reports/*")));
    }

    @Test
    void theSheetAttachesAPractitionersEmailInsteadOfRefusingIt() throws Exception {
        int orgId = JsonPath.read(postJson("/api/organizations/create",
                "{\"name\":\"Sheet Attach Org\",\"orgEmail\":null,\"description\":null,"
                        + "\"logoBase64\":null,\"coBrandLogoBase64\":null,\"assessmentIds\":[]}"),
                "$.organizationId");
        mvc.perform(post("/api/practitioners/create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Sheet Pract\",\"email\":\"sheet.pract@test.local\",\"dob\":\"09-09-1989\","
                                + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000004\","
                                + "\"practitionerStatus\":null,\"vertical\":null,\"organizationId\":null}"))
                .andExpect(status().isCreated());

        String row = "{\"row\":2,\"name\":\"Sheet Pract\",\"email\":\"sheet.pract@test.local\",\"dob\":\"%s\","
                + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000004\",\"employeeId\":null,\"gender\":\"MALE\"}";

        // Wrong dob is still a real problem — it is the credential.
        mvc.perform(post("/api/respondents/bulk-validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organizationId\":" + orgId + ",\"rows\":[" + row.formatted("10-10-1990") + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.issues[0].message").value(containsString("different date of birth")));

        mvc.perform(post("/api/respondents/bulk-create")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organizationId\":" + orgId + ",\"rows\":[" + row.formatted("09-09-1989") + "]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$[0].email").value("sheet.pract@test.local"));

        // Now both profiles on one identity, and a second sheet row is refused.
        mvc.perform(post("/api/respondents/bulk-validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"organizationId\":" + orgId + ",\"rows\":[" + row.formatted("09-09-1989") + "]}"))
                .andExpect(jsonPath("$.issues[0].message").value("A respondent with this email already exists"));
        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"sheet.pract@test.local\",\"dob\":\"1989-09-09\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void anyoneCanBeMadeSuperadminAndBack() throws Exception {
        createRespondent("Respondent Super", "resp.super@test.local", "11-11-1991");
        String login = "{\"email\":\"resp.super@test.local\",\"dob\":\"1991-11-11\"}";
        String users = mvc.perform(get("/api/user-access/getAll"))
                .andReturn().getResponse().getContentAsString();
        int userId = ((Number) JsonPath.<java.util.List<Object>>read(users,
                "$[?(@.email == 'resp.super@test.local')].userId").get(0)).intValue();

        // A "/*" role is a legal role — the full-access checkbox stores exactly that.
        int roleId = JsonPath.read(postJson("/api/roles/create",
                "{\"name\":\"Access Test Full\",\"description\":null,\"urlPaths\":[\"/*\"]}"), "$.id");
        int groupId = JsonPath.read(postJson("/api/role-groups/create",
                "{\"name\":\"Access Test Full Group\",\"description\":null,\"roleIds\":[" + roleId + "]}"),
                "$.roleGroupId");
        mvc.perform(put("/api/user-access/assign-role-group/" + userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleGroupId\":" + groupId + "}"))
                .andExpect(status().isOk());

        // The full-access role alone reaches the activity log (superadmin-only
        // before 2026-10-05) — the token carries no superadmin flag here.
        String roleLogin = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.superAdmin").value(false))
                .andReturn().getResponse().getContentAsString();
        String roleToken = JsonPath.read(roleLogin, "$.token");
        mvc.perform(get("/api/activity/getAll").header("Authorization", "Bearer " + roleToken))
                .andExpect(status().isOk());

        // A narrower role does not.
        int narrowRoleId = JsonPath.read(postJson("/api/roles/create",
                "{\"name\":\"Access Test Admin Section\",\"description\":null,\"urlPaths\":[\"/admin/*\"]}"), "$.id");
        int narrowGroupId = JsonPath.read(postJson("/api/role-groups/create",
                "{\"name\":\"Access Test Admin Group\",\"description\":null,\"roleIds\":[" + narrowRoleId + "]}"),
                "$.roleGroupId");
        mvc.perform(put("/api/user-access/assign-role-group/" + userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleGroupId\":" + narrowGroupId + "}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/activity/getAll").header("Authorization", "Bearer " + roleToken))
                .andExpect(status().isForbidden());

        // Superadmin clears the group it makes redundant.
        mvc.perform(put("/api/user-access/assign-superadmin/" + userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.superAdmin").value(true))
                .andExpect(jsonPath("$.roleGroupId").doesNotExist())
                .andExpect(jsonPath("$.respondent").value(true));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.superAdmin").value(true))
                .andExpect(jsonPath("$.user.urlPaths", hasItem("/*")));

        mvc.perform(put("/api/user-access/revoke-superadmin/" + userId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.superAdmin").value(false));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isForbidden());

        mvc.perform(put("/api/user-access/assign-superadmin/999999"))
                .andExpect(status().isNotFound());
    }
}
