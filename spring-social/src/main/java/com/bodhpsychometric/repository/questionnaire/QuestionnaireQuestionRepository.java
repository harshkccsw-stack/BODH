package com.bodhpsychometric.repository.questionnaire;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;

public interface QuestionnaireQuestionRepository extends JpaRepository<QuestionnaireQuestion, Long> {

    List<QuestionnaireQuestion> findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionnaireQuestionIdAsc(
            Long questionnaireId);

    List<QuestionnaireQuestion> findByQuestionQuestionId(Long questionId);

    List<QuestionnaireQuestion> findBySectionSectionId(Long sectionId);

    void deleteByQuestionnaireQuestionnaireId(Long questionnaireId);

    long countByQuestionnaireQuestionnaireId(Long questionnaireId);

    boolean existsByQuestionQuestionId(Long questionId);
}
