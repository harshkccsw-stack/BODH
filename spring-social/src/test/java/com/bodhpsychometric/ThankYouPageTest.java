package com.bodhpsychometric;

import static org.hamcrest.Matchers.containsString;
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

import com.bodhpsychometric.model.assessment.AssessmentThankYou;
import com.jayway.jsonpath.JsonPath;

/**
 * The per-assessment thank-you page (V46), end to end: the message under
 * "Thank you!" (editor HTML, default when unset) and the contact person /
 * researcher pair (both or neither). Null in a request keeps what is stored,
 * blank clears it, and the portal reads all of it live.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ThankYouPageTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private void putAssessment(int assessmentId, String body, int expectedStatus) throws Exception {
        mvc.perform(put("/api/assessments/update/" + assessmentId)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus));
    }

    @Test
    void thankYouPageIsStoredValidatedAndReachesThePortalLive() throws Exception {
        String question = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"__smoke__ thank-you: one\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":[{\"optionText\":\"A\",\"contentType\":\"TEXT\","
                        + "\"mediaUrl\":null,\"mqtScores\":[]}],\"mqtScores\":[]}");
        int questionId = JsonPath.read(question, "$.questionId");
        int questionnaireId = JsonPath.read(postJson("/api/questionnaire/create",
                "{\"name\":\"__smoke__ thank-you QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}"), "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":0}]"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/assessments/thank-you-template"))
                .andExpect(jsonPath("$.thankYouMessage").value(AssessmentThankYou.DEFAULT_HTML));

        // Nothing sent → the default message and no contact, i.e. today's page.
        String base = "\"name\":\"__smoke__ thank-you Assessment\",\"questionnaireId\":" + questionnaireId + ","
                + "\"showTermsAndConditions\":false,\"status\":\"ACTIVE\",\"autoNext\":false";
        int assessmentId = JsonPath.read(postJson("/api/assessments/create", "{" + base + "}"), "$.assessmentId");
        mvc.perform(get("/api/assessments/getById/" + assessmentId))
                .andExpect(jsonPath("$.thankYouMessage").value(AssessmentThankYou.DEFAULT_HTML))
                .andExpect(jsonPath("$.contactName").doesNotExist())
                .andExpect(jsonPath("$.contactEmail").doesNotExist());

        // The contact is both or neither, the email must be an address, and
        // the message is held to the editor's markup.
        putAssessment(assessmentId, "{" + base + ",\"contactName\":\"Dr. Rao\"}", 400);
        putAssessment(assessmentId, "{" + base + ",\"contactEmail\":\"rao@uni.edu\"}", 400);
        putAssessment(assessmentId, "{" + base + ",\"contactName\":\"Dr. Rao\",\"contactEmail\":\"not-an-address\"}",
                400);
        mvc.perform(put("/api/assessments/update/" + assessmentId).contentType(MediaType.APPLICATION_JSON)
                        .content("{" + base + ",\"thankYouMessage\":\"<p>Hi</p><script>x</script>\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("<script>")));

        String custom = "<p>Thanks for taking part in the <b>leadership study</b>.</p>";
        putAssessment(assessmentId, "{" + base + ",\"thankYouMessage\":\"" + custom + "\","
                + "\"contactName\":\"  Dr. Rao \",\"contactEmail\":\"rao@uni.edu\"}", 200);
        mvc.perform(get("/api/assessments/getById/" + assessmentId))
                .andExpect(jsonPath("$.thankYouMessage").value(custom))
                .andExpect(jsonPath("$.contactName").value("Dr. Rao"))
                .andExpect(jsonPath("$.contactEmail").value("rao@uni.edu"));

        // A caller that does not know the fields (omits them) keeps them.
        putAssessment(assessmentId, "{" + base + "}", 200);
        mvc.perform(get("/api/assessments/getById/" + assessmentId))
                .andExpect(jsonPath("$.thankYouMessage").value(custom))
                .andExpect(jsonPath("$.contactName").value("Dr. Rao"));
        // Clearing one half while the other stays stored is still half a contact.
        putAssessment(assessmentId, "{" + base + ",\"contactEmail\":\"\"}", 400);

        int respondentUserId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"__smoke__ Thanks Taker\",\"email\":\"thanks.taker@test.local\","
                        + "\"dob\":\"08-08-2008\",\"phoneCountryCode\":\"+91\",\"phone\":\"9000000000\","
                        + "\"gender\":\"FEMALE\",\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");
        String loginBody = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"thanks.taker@test.local\",\"dob\":\"2008-08-08\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + (String) JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(jsonPath("$.thankYouMessage").value(custom))
                .andExpect(jsonPath("$.contactName").value("Dr. Rao"))
                .andExpect(jsonPath("$.contactEmail").value("rao@uni.edu"));

        // Blank clears: the message falls back to the default, the contact
        // row goes — and the portal sees it on the next load.
        putAssessment(assessmentId, "{" + base + ",\"thankYouMessage\":\"<p><br></p>\","
                + "\"contactName\":\"\",\"contactEmail\":\"\"}", 200);
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId).header("Authorization", bearer))
                .andExpect(jsonPath("$.thankYouMessage").value(AssessmentThankYou.DEFAULT_HTML))
                .andExpect(jsonPath("$.contactName").doesNotExist())
                .andExpect(jsonPath("$.contactEmail").doesNotExist());
    }
}
