package com.bodhpsychometric;

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
 * End-to-end over the portal take-flow read side: builds the real chain
 * (question → questionnaire → placement + demographic form → assessment →
 * assignment) through the public endpoints, then fetches the attempt as the
 * respondent would. One big test because the chain is the point; the
 * ownership/status error paths reuse the same fixture.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PortalAssessmentControllerTest {

    @Autowired
    private MockMvc mvc;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    void respondentFetchesTheirAllotmentWithFullQuestionnaireContent() throws Exception {
        // ── Fixture: bank question with two options ──────────────────────
        String questionBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"How do you feel today?\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"Good\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"Bad\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}");
        int questionId = JsonPath.read(questionBody, "$.questionId");

        // ── Questionnaire with the question placed and one demographic field ──
        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"Portal Take QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":\"desc\",\"durationMinutes\":10,"
                        + "\"generalInstruction\":\"Answer honestly.\",\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");

        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String fieldBody = postJson("/api/demographic-fields/create",
                "{\"label\":\"Portal Take Grade\",\"fieldType\":\"DROPDOWN\",\"placeholder\":null,"
                        + "\"options\":[\"9th\",\"10th\"]}");
        int demographicFieldId = JsonPath.read(fieldBody, "$.demographicFieldId");

        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/demographic-fields")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"demographicFieldId\":" + demographicFieldId + ",\"required\":true}]"))
                .andExpect(status().isOk());

        // ── ACTIVE assessment assigned to a fresh respondent ─────────────
        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"Portal Take Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":true,\"status\":\"ACTIVE\",\"autoNext\":true}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"Portal Taker\",\"email\":\"portal.taker@test.local\",\"dob\":\"02-02-2002\","
                        + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");

        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        // ── Portal login hands back the attempt id ───────────────────────
        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.taker@test.local\",\"dob\":\"2002-02-02\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");

        // ── The fetch under test ─────────────────────────────────────────
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.respondentAssessmentMappingId").value(mappingId))
                .andExpect(jsonPath("$.attemptNumber").doesNotExist())
                .andExpect(jsonPath("$.assessmentStatus").value("NOT_STARTED"))
                .andExpect(jsonPath("$.isPersisted").value(false))
                .andExpect(jsonPath("$.assessmentName").value("Portal Take Assessment"))
                .andExpect(jsonPath("$.showTermsAndConditions").value(true))
                .andExpect(jsonPath("$.autoNext").value(true))
                .andExpect(jsonPath("$.questionnaireName").value("Portal Take QNR"))
                .andExpect(jsonPath("$.generalInstruction").value("Answer honestly."))
                .andExpect(jsonPath("$.hasSections").value(false))
                .andExpect(jsonPath("$.questions.length()").value(1))
                .andExpect(jsonPath("$.questions[0].stem").value("How do you feel today?"))
                .andExpect(jsonPath("$.questions[0].options.length()").value(2))
                .andExpect(jsonPath("$.questions[0].options[0].optionText").value("Good"))
                // Scoring data must never reach the respondent.
                .andExpect(jsonPath("$.questions[0].mqtScores").doesNotExist())
                .andExpect(jsonPath("$.questions[0].options[0].mqtScores").doesNotExist())
                .andExpect(jsonPath("$.questions[0].riskFlag").doesNotExist())
                .andExpect(jsonPath("$.demographicFields.length()").value(1))
                .andExpect(jsonPath("$.demographicFields[0].label").value("Portal Take Grade"))
                .andExpect(jsonPath("$.demographicFields[0].required").value(true))
                .andExpect(jsonPath("$.demographicFields[0].options.length()").value(2));

        // ── Error paths on the same fixture ──────────────────────────────
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/portal/assessments/getById/999999")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());

        // A different respondent must not see this attempt.
        postJson("/api/respondents/create",
                "{\"name\":\"Portal Other\",\"email\":\"portal.other@test.local\",\"dob\":\"03-03-2003\","
                        + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
        String otherLogin = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.other@test.local\",\"dob\":\"2003-03-03\"}"))
                .andReturn().getResponse().getContentAsString();
        String otherToken = JsonPath.read(otherLogin, "$.token");
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId)
                        .header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden());

        // Deactivated assessment stops serving its attempts.
        mvc.perform(put("/api/assessments/update/" + assessmentId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Take Assessment\",\"questionnaireId\":" + questionnaireId + ","
                                + "\"showTermsAndConditions\":true,\"status\":\"INACTIVE\",\"autoNext\":true}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/portal/assessments/getById/" + mappingId)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isConflict());
    }

    /** One attempt-fixture for the write-side tests. */
    private record Fixture(int questionId, int option1Id, int option2Id, int foreignOptionId,
            int questionnaireId, int fieldId, int assessmentId, int respondentUserId,
            String token, int mappingId) {
    }

    private Fixture buildFixture(String tag, String email, String dobCreate, String dobLogin) throws Exception {
        String questionBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + tag + " stem\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"A\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]},"
                        + "{\"optionText\":\"B\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}");
        int questionId = JsonPath.read(questionBody, "$.questionId");
        int option1Id = JsonPath.read(questionBody, "$.options[0].optionId");
        int option2Id = JsonPath.read(questionBody, "$.options[1].optionId");

        // A bank question NOT placed in the questionnaire — its option is the
        // "foreign option" for the belongs-to check.
        String foreignBody = postJson("/api/questions/create",
                "{\"contentType\":\"TEXT\",\"stem\":\"" + tag + " foreign\",\"mediaUrl\":null,"
                        + "\"riskFlag\":false,\"options\":["
                        + "{\"optionText\":\"X\",\"contentType\":\"TEXT\",\"mediaUrl\":null,\"mqtScores\":[]}],"
                        + "\"mqtScores\":[]}");
        int foreignOptionId = JsonPath.read(foreignBody, "$.options[0].optionId");

        String questionnaireBody = postJson("/api/questionnaire/create",
                "{\"name\":\"" + tag + " QNR\",\"shortName\":null,\"category\":null,\"vertical\":null,"
                        + "\"description\":null,\"durationMinutes\":null,\"generalInstruction\":null,"
                        + "\"hasSections\":false}");
        int questionnaireId = JsonPath.read(questionnaireBody, "$.questionnaireId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"questionId\":" + questionId + ",\"sectionId\":null,\"sortOrder\":1}]"))
                .andExpect(status().isOk());

        String fieldBody = postJson("/api/demographic-fields/create",
                "{\"label\":\"" + tag + " Grade\",\"fieldType\":\"DROPDOWN\",\"placeholder\":null,"
                        + "\"options\":[\"9th\",\"10th\"]}");
        int fieldId = JsonPath.read(fieldBody, "$.demographicFieldId");
        mvc.perform(put("/api/questionnaire/" + questionnaireId + "/demographic-fields")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("[{\"demographicFieldId\":" + fieldId + ",\"required\":true}]"))
                .andExpect(status().isOk());

        String assessmentBody = postJson("/api/assessments/create",
                "{\"name\":\"" + tag + " Assessment\",\"questionnaireId\":" + questionnaireId + ","
                        + "\"showTermsAndConditions\":true,\"status\":\"ACTIVE\",\"autoNext\":false}");
        int assessmentId = JsonPath.read(assessmentBody, "$.assessmentId");

        String respondentBody = postJson("/api/respondents/create",
                "{\"name\":\"" + tag + " Taker\",\"email\":\"" + email + "\",\"dob\":\"" + dobCreate + "\","
                        + "\"phone\":\"+91 90000 00000\",\"gender\":\"MALE\",\"isConsented\":false,\"organizationId\":null}");
        int respondentUserId = JsonPath.read(respondentBody, "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentUserId + "]}");

        String loginBody = mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"" + dobLogin + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String token = JsonPath.read(loginBody, "$.token");
        int mappingId = JsonPath.read(loginBody,
                "$.respondent.allottedAssessments[0].respondentAssessmentMappingId");
        return new Fixture(questionId, option1Id, option2Id, foreignOptionId,
                questionnaireId, fieldId, assessmentId, respondentUserId, token, mappingId);
    }

    @Test
    void beginAndSubmitWalkTheAllotmentToCompleted() throws Exception {
        Fixture f = buildFixture("Portal Flow", "portal.flow@test.local", "04-04-2004", "2004-04-04");
        String bearer = "Bearer " + f.token();

        // Submit before begin is refused.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":" + f.option1Id() + "}]}"))
                .andExpect(status().isConflict());

        // Begin: required field missing → 400; bad dropdown choice → 400.
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"12th\"}]}"))
                .andExpect(status().isBadRequest());

        // Begin OK → ONGOING; consent stamped on the profile.
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"9th\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("ONGOING"))
                .andExpect(jsonPath("$.isPersisted").value(false));
        mvc.perform(get("/api/respondents/getById/" + f.respondentUserId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isConsented").value(true));

        // Re-begin replaces the form (re-launch) and stays ONGOING.
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"10th\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("ONGOING"));

        // Submit: foreign option → 400; question outside the questionnaire → 400; empty → 400.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":" + f.foreignOptionId() + "}]}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[]}"))
                .andExpect(status().isBadRequest());

        // Submit OK → COMPLETED; a second submit is refused; unmapping is refused.
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":" + f.option2Id() + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"))
                // The durability fact check: answers are committed to SQL.
                .andExpect(jsonPath("$.isPersisted").value(true));
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":" + f.option1Id() + "}]}"))
                .andExpect(status().isConflict());
        mvc.perform(delete("/api/respondent-assessments/delete/" + f.mappingId()))
                .andExpect(status().isConflict());
    }

    @Test
    void onePairGetsOneAllotmentAndNoReattempt() throws Exception {
        Fixture f = buildFixture("Portal Once", "portal.once@test.local", "09-09-1999", "1999-09-09");
        String bearer = "Bearer " + f.token();
        String body = "{\"assessmentId\":" + f.assessmentId()
                + ",\"respondentUserIds\":[" + f.respondentUserId() + "]}";

        // The pair already holds its one allotment — assigning again is refused.
        mvc.perform(post("/api/respondent-assessments/assign")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        // The re-attempt endpoint is gone for good.
        mvc.perform(post("/api/respondent-assessments/reattempt")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isNotFound());

        // Walk it to COMPLETED, then prove it stays a single closed allotment:
        // no second row, no second submit, and the portal still lists one.
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"9th\"}]}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":" + f.option1Id() + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.isPersisted").value(true));

        mvc.perform(post("/api/respondent-assessments/assign")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/portal/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"portal.once@test.local\",\"dob\":\"1999-09-09\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.respondent.allottedAssessments.length()").value(1))
                .andExpect(jsonPath("$.respondent.allottedAssessments[0].assessmentStatus").value("COMPLETED"))
                .andExpect(jsonPath("$.respondent.allottedAssessments[0].isPersisted").value(true));
    }

    /**
     * The attention timer's two halves: the flag reaches the respondent's
     * payload (the portal cannot start a countdown it was never told about),
     * and the abandon call the countdown makes when it runs out puts the
     * attempt back to NOT_STARTED — which is what lets them launch it again.
     */
    @Test
    void attentionTimerAttemptIsAbandonedBackToNotStarted() throws Exception {
        Fixture f = buildFixture("Portal Timer", "portal.timer@test.local", "07-07-2007", "2007-07-07");
        String bearer = "Bearer " + f.token();

        // Off unless asked for — an omitted field must never arm the timer.
        mvc.perform(get("/api/portal/assessments/getById/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attentionTimer").value(false));

        mvc.perform(put("/api/assessments/update/" + f.assessmentId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Portal Timer Assessment\",\"questionnaireId\":" + f.questionnaireId()
                                + ",\"showTermsAndConditions\":true,\"status\":\"ACTIVE\",\"autoNext\":false,"
                                + "\"attentionTimer\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attentionTimer").value(true));
        mvc.perform(get("/api/portal/assessments/getById/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attentionTimer").value(true));

        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"9th\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("ONGOING"));

        // Budget spent → the portal abandons the attempt. Anonymous callers
        // cannot, and a second call is a harmless no-op.
        mvc.perform(post("/api/portal/assessments/abandon/" + f.mappingId()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/portal/assessments/abandon/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("NOT_STARTED"))
                .andExpect(jsonPath("$.isPersisted").value(false));
        mvc.perform(post("/api/portal/assessments/abandon/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("NOT_STARTED"));

        // And it really is takeable again, all the way to COMPLETED — after
        // which abandon is refused, since a submitted attempt is frozen.
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"10th\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("ONGOING"));
        mvc.perform(post("/api/portal/assessments/submit/" + f.mappingId())
                        .header("Authorization", bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + f.questionId() + ",\"optionId\":"
                                + f.option1Id() + "}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("COMPLETED"));
        mvc.perform(post("/api/portal/assessments/abandon/" + f.mappingId()).header("Authorization", bearer))
                .andExpect(status().isConflict());
    }

    @Test
    void ongoingAllotmentCanBeUnmapped() throws Exception {
        Fixture f = buildFixture("Portal Unmap", "portal.unmap@test.local", "06-06-2006", "2006-06-06");
        mvc.perform(post("/api/portal/assessments/begin/" + f.mappingId())
                        .header("Authorization", "Bearer " + f.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"demographics\":[{\"demographicFieldId\":" + f.fieldId() + ",\"value\":\"10th\"}]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessmentStatus").value("ONGOING"));

        // ONGOING is not frozen — the allotment (and its demographics) may go.
        mvc.perform(delete("/api/respondent-assessments/delete/" + f.mappingId()))
                .andExpect(status().isNoContent());
    }
}
