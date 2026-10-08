package com.bodhpsychometric;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.bodhpsychometric.dto.StagedSubmission;
import com.bodhpsychometric.model.assessment.RespondentAssessmentMapping;
import com.bodhpsychometric.repository.assessment.RespondentAssessmentMappingRepository;
import com.bodhpsychometric.service.AssessmentSubmissionWriter;
import com.jayway.jsonpath.JsonPath;

/**
 * V45 (2026-10-08): an attempt records when it was started (first begin) and
 * completed (when the submit reached the server), the Raw Data export carries
 * both, and a reset or abandon clears them. Redis is off in tests, so submit
 * writes straight through; the digest's half — the envelope's time reaching
 * the writer — is covered by the writer and envelope checks below.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AttemptTimestampsTest {

    @Autowired private MockMvc mvc;
    @Autowired private RespondentAssessmentMappingRepository mappings;
    @Autowired private AssessmentSubmissionWriter writer;

    private String postJson(String path, String body) throws Exception {
        return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private record Attempt(int assessmentId, int mappingId, String bearer) {
    }

    /** A one-question assessment allotted to a fresh respondent, logged in. */
    private Attempt allot(String prefix, String email, String dob, String isoDob) throws Exception {
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
        int respondentId = JsonPath.read(postJson("/api/respondents/create",
                "{\"name\":\"" + prefix + " Taker\",\"email\":\"" + email + "\",\"dob\":\"" + dob + "\","
                        + "\"phoneCountryCode\":\"+91\",\"phone\":\"9000000005\",\"gender\":\"FEMALE\","
                        + "\"isConsented\":false,\"organizationId\":null}"),
                "$.respondentUserId");
        postJson("/api/respondent-assessments/assign",
                "{\"assessmentId\":" + assessmentId + ",\"respondentUserIds\":[" + respondentId + "]}");

        String login = mvc.perform(post("/api/portal/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"dob\":\"" + isoDob + "\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return new Attempt(assessmentId,
                JsonPath.read(login, "$.respondent.allottedAssessments[0].respondentAssessmentMappingId"),
                "Bearer " + (String) JsonPath.read(login, "$.token"));
    }

    private void begin(Attempt a) throws Exception {
        mvc.perform(post("/api/portal/assessments/begin/" + a.mappingId()).header("Authorization", a.bearer())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"demographics\":[]}"))
                .andExpect(status().isOk());
    }

    private RespondentAssessmentMapping row(Attempt a) {
        return mappings.findById((long) a.mappingId()).orElseThrow();
    }

    @Test
    void beginStampsTheStartSubmitTheCompletionAndResetClearsBoth() throws Exception {
        Attempt a = allot("Stamps", "stamps.taker@test.local", "06-06-2006", "2006-06-06");
        assertThat(row(a).getStartedAt()).isNull();

        begin(a);
        OffsetDateTime started = row(a).getStartedAt();
        assertThat(started).isNotNull();
        assertThat(row(a).getCompletedAt()).isNull();

        // A re-launch of the ONGOING attempt keeps the first start.
        Thread.sleep(20);
        begin(a);
        assertThat(row(a).getStartedAt().toInstant()).isEqualTo(started.toInstant());

        String detail = mvc.perform(get("/api/portal/assessments/getById/" + a.mappingId())
                        .header("Authorization", a.bearer()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        int questionId = JsonPath.read(detail, "$.questions[0].questionId");
        int optionId = JsonPath.read(detail, "$.questions[0].options[0].optionId");
        mvc.perform(post("/api/portal/assessments/submit/" + a.mappingId()).header("Authorization", a.bearer())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answers\":[{\"questionId\":" + questionId + ",\"optionId\":" + optionId + "}]}"))
                .andExpect(status().isOk());

        OffsetDateTime completed = row(a).getCompletedAt();
        assertThat(completed).isNotNull();
        assertThat(completed.toInstant()).isAfterOrEqualTo(started.toInstant());
        assertThat(row(a).getStartedAt().toInstant()).isEqualTo(started.toInstant());

        // The Raw Data export carries both, as ISO instants.
        String sheet = mvc.perform(get("/api/reports/export/assessment/" + a.assessmentId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rows.length()").value(1))
                .andExpect(jsonPath("$.rows[0].startedAt").value(Matchers.notNullValue()))
                .andExpect(jsonPath("$.rows[0].completedAt").value(Matchers.notNullValue()))
                .andReturn().getResponse().getContentAsString();
        assertThat(Instant.parse(JsonPath.read(sheet, "$.rows[0].completedAt")))
                .isEqualTo(completed.toInstant());

        mvc.perform(post("/api/reports/resetAssessment/" + a.mappingId())).andExpect(status().isOk());
        assertThat(row(a).getStartedAt()).isNull();
        assertThat(row(a).getCompletedAt()).isNull();
    }

    @Test
    void abandonEndsTheAttemptSoTheNextBeginIsANewStart() throws Exception {
        Attempt a = allot("Abandon Stamps", "abandon.stamps@test.local", "07-07-2007", "2007-07-07");
        begin(a);
        assertThat(row(a).getStartedAt()).isNotNull();

        mvc.perform(post("/api/portal/assessments/abandon/" + a.mappingId()).header("Authorization", a.bearer()))
                .andExpect(status().isOk());
        assertThat(row(a).getStartedAt()).isNull();

        begin(a);
        assertThat(row(a).getStartedAt()).isNotNull();
    }

    @Test
    void theWriterRecordsTheSubmitTimeItIsGivenNotItsOwn() throws Exception {
        Attempt a = allot("Digest Stamps", "digest.stamps@test.local", "08-08-2008", "2008-08-08");
        begin(a);

        // What the digest does: the envelope's time, however late it writes.
        OffsetDateTime submitted = OffsetDateTime.of(2026, 10, 1, 9, 30, 0, 0, ZoneOffset.UTC);
        writer.persist((long) a.mappingId(), List.of(), 0, null, submitted);
        assertThat(row(a).getCompletedAt().toInstant()).isEqualTo(submitted.toInstant());

        // A retry racing a finished write changes nothing.
        writer.persist((long) a.mappingId(), List.of(), 0, null, submitted.plusHours(3));
        assertThat(row(a).getCompletedAt().toInstant()).isEqualTo(submitted.toInstant());
    }

    @Test
    void theEnvelopeKeepsTheMomentOfSubmit() {
        StagedSubmission staged = StagedSubmission.of(1L, 2L, 3L, List.of(), 0, null);
        assertThat(staged.submittedAt().toInstant())
                .isCloseTo(Instant.now(), org.assertj.core.api.Assertions.within(5, ChronoUnit.SECONDS));
        // A retry copy keeps the original time, not the retry's.
        assertThat(staged.withFailure("boom").submittedAt()).isEqualTo(staged.submittedAt());
        // No time on the envelope → null, and the writer then uses its own.
        assertThat(new StagedSubmission(1L, 2L, 3L, List.of(), 0, 0L, 0, null, null).submittedAt()).isNull();
    }
}
