package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.transaction.support.TransactionTemplate;

import com.bodhpsychometric.model.assessment.Assessment;
import com.bodhpsychometric.model.assessment.enums.AssessmentStatus;
import com.bodhpsychometric.model.question.Option;
import com.bodhpsychometric.model.question.Question;
import com.bodhpsychometric.model.question.enums.ContentType;
import com.bodhpsychometric.model.question.enums.QuestionType;
import com.bodhpsychometric.model.questionnaire.Questionnaire;
import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;
import com.bodhpsychometric.repository.assessment.AssessmentRepository;
import com.bodhpsychometric.repository.question.QuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireQuestionRepository;
import com.bodhpsychometric.repository.questionnaire.QuestionnaireRepository;
import com.bodhpsychometric.security.SyncKeyGuard;
import com.jayway.jsonpath.JsonPath;

/** A mirrored attempt lands as an allotment plus answers, and the Reports pages then show it. */
@SpringBootTest(properties = { "app.sync.memorymesh-key=test-sync-key", "app.security.require-auth=true" })
@AutoConfigureMockMvc
class MemoryMeshAttemptSyncTest {

    private static final String KEY = SyncKeyGuard.KEY_HEADER;

    @Autowired private MockMvc mvc;
    @Autowired private TransactionTemplate tx;
    @Autowired private QuestionRepository questions;
    @Autowired private QuestionnaireRepository questionnaires;
    @Autowired private QuestionnaireQuestionRepository placements;
    @Autowired private AssessmentRepository assessments;

    private record Seed(Long assessmentId, Long questionId, Long otherQuestionId) {
    }

    private Seed seed() {
        return tx.execute(status -> {
            Question q = new Question();
            q.setQuestionTexString("I finish what I start.");
            q.setContentType(ContentType.TEXT);
            q.setQuestionType(QuestionType.MCQ);
            for (int i = 0; i < 2; i++) {
                Option o = new Option();
                o.setOptionText(i == 0 ? "Agree" : "Disagree");
                o.setContentType(ContentType.TEXT);
                o.setSortOrder(i);
                q.addOption(o);
            }
            q = questions.save(q);
            Question other = new Question();
            other.setQuestionTexString("Unrelated");
            other.setContentType(ContentType.TEXT);
            other.setQuestionType(QuestionType.SHORT_ANSWER);
            other = questions.save(other);

            Questionnaire qn = new Questionnaire();
            qn.setName("Mirror questionnaire");
            qn.setHasSections(false);
            qn = questionnaires.save(qn);
            QuestionnaireQuestion p = new QuestionnaireQuestion();
            p.setQuestionnaire(qn);
            p.setQuestion(q);
            p.setSortOrder(0);
            placements.save(p);

            Assessment a = new Assessment();
            a.setName("Mirror assessment");
            a.setQuestionnaire(qn);
            a.setStatus(AssessmentStatus.ACTIVE);
            a = assessments.save(a);
            return new Seed(a.getAssessmentId(), q.getQuestionId(), other.getQuestionId());
        });
    }

    @Test
    void anAttemptIsStoredReplacedOnResendAndVisibleInReports() throws Exception {
        Seed s = seed();
        String person = """
                "respondent":{"name":"Mirror Person","email":"mm.attempt@test.local",\
                "phoneCountryCode":"+91","phone":"9700000041","dob":"1994-04-04","gender":"FEMALE"}""";

        mvc.perform(post("/api/sync/memorymesh/attempts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{" + person + ",\"assessmentId\":%d,\"answers\":[]}".formatted(s.assessmentId())))
                .andExpect(status().isUnauthorized());

        // By position: option 1 of the question = "Disagree".
        String body = mvc.perform(post("/api/sync/memorymesh/attempts")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{" + person + ",\"assessmentId\":%d,\"sourceMappingId\":77,"
                        + "\"answers\":[{\"questionId\":%d,\"optionPosition\":1}]}").formatted(s.assessmentId(), s.questionId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stored").value(1))
                .andReturn().getResponse().getContentAsString();
        long respondentId = ((Number) JsonPath.read(body, "$.respondentUserId")).longValue();

        // Bad answers are refused as a whole.
        mvc.perform(post("/api/sync/memorymesh/attempts")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{" + person + ",\"assessmentId\":%d,\"answers\":[{\"questionId\":%d,\"optionPosition\":5}]}")
                        .formatted(s.assessmentId(), s.questionId())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(Matchers.containsString("no option at position")));
        mvc.perform(post("/api/sync/memorymesh/attempts")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{" + person + ",\"assessmentId\":999999,\"answers\":[]}")))
                .andExpect(status().isNotFound());

        // Re-sent: replaced, not doubled.
        mvc.perform(post("/api/sync/memorymesh/attempts")
                .header(KEY, "test-sync-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{" + person + ",\"assessmentId\":%d,"
                        + "\"answers\":[{\"questionId\":%d,\"optionPosition\":0},{\"questionId\":%d,\"answerText\":\"free text\"}]}")
                        .formatted(s.assessmentId(), s.questionId(), s.otherQuestionId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stored").value(2));

        // Our own Reports see the attempt.
        String admin = JsonPath.read(mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"superadmin@test.local\",\"dob\":\"1990-01-01\"}"))
                .andReturn().getResponse().getContentAsString(), "$.token");
        mvc.perform(get("/api/reports/getRespondentDetail/" + respondentId)
                .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("mm.attempt@test.local"))
                .andExpect(jsonPath("$.assessments.length()").value(Matchers.greaterThanOrEqualTo(1)));
    }
}
