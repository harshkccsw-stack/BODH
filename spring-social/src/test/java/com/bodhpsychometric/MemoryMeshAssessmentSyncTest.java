package com.bodhpsychometric;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
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

/** The read doors MemoryMesh's importer uses: the list, and one assessment flattened. */
@SpringBootTest(properties = { "app.sync.memorymesh-key=test-sync-key", "app.security.require-auth=true" })
@AutoConfigureMockMvc
class MemoryMeshAssessmentSyncTest {

    private static final String KEY = SyncKeyGuard.KEY_HEADER;

    @Autowired
    private MockMvc mvc;
    @Autowired
    private TransactionTemplate tx;
    @Autowired
    private QuestionRepository questions;
    @Autowired
    private QuestionnaireRepository questionnaires;
    @Autowired
    private QuestionnaireQuestionRepository placements;
    @Autowired
    private AssessmentRepository assessments;

    private Long seed() {
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

            Questionnaire qn = new Questionnaire();
            qn.setName("Sync questionnaire");
            qn.setHasSections(false);
            qn = questionnaires.save(qn);

            QuestionnaireQuestion p = new QuestionnaireQuestion();
            p.setQuestionnaire(qn);
            p.setQuestion(q);
            p.setSortOrder(0);
            placements.save(p);

            Assessment a = new Assessment();
            a.setName("Sync assessment");
            a.setQuestionnaire(qn);
            a.setStatus(AssessmentStatus.ACTIVE);
            return assessments.save(a).getAssessmentId();
        });
    }

    @Test
    void listsAndFlattensAnAssessmentBehindTheKey() throws Exception {
        Long id = seed();

        mvc.perform(get("/api/sync/memorymesh/assessments"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/sync/memorymesh/assessments").header(KEY, "test-sync-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.assessmentId == " + id + ")].name").value(Matchers.contains("Sync assessment")))
                .andExpect(jsonPath("$[?(@.assessmentId == " + id + ")].questionCount").value(Matchers.contains(1)));

        mvc.perform(get("/api/sync/memorymesh/assessments/" + id).header(KEY, "test-sync-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assessment.name").value("Sync assessment"))
                .andExpect(jsonPath("$.content.questionnaireName").value("Sync questionnaire"))
                .andExpect(jsonPath("$.content.questions.length()").value(1))
                .andExpect(jsonPath("$.content.questions[0].questionType").value("MCQ"))
                .andExpect(jsonPath("$.content.questions[0].stem").value("I finish what I start."))
                .andExpect(jsonPath("$.content.questions[0].options.length()").value(2))
                .andExpect(jsonPath("$.content.questions[0].options[1].optionText").value("Disagree"));

        mvc.perform(get("/api/sync/memorymesh/assessments/999999").header(KEY, "test-sync-key"))
                .andExpect(status().isNotFound());
    }
}
