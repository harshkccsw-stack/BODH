package com.bodhpsychometric.repository.questionnaire;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.questionnaire.QuestionnaireQuestion;

public interface QuestionnaireQuestionRepository extends JpaRepository<QuestionnaireQuestion, Long> {

    List<QuestionnaireQuestion> findByQuestionnaireQuestionnaireIdOrderBySortOrderAscQuestionnaireQuestionIdAsc(
            Long questionnaireId);

    /** Portal delivery fetch — question + options + section eagerly, in display order. */
    @Query("select qq from QuestionnaireQuestion qq "
            + "join fetch qq.question q left join fetch q.options left join fetch qq.section "
            + "where qq.questionnaire.questionnaireId = :questionnaireId "
            + "order by qq.sortOrder asc, qq.questionnaireQuestionId asc")
    List<QuestionnaireQuestion> findForPortalDelivery(Long questionnaireId);

    List<QuestionnaireQuestion> findByQuestionQuestionId(Long questionId);

    List<QuestionnaireQuestion> findBySectionSectionId(Long sectionId);

    void deleteByQuestionnaireQuestionnaireId(Long questionnaireId);

    long countByQuestionnaireQuestionnaireId(Long questionnaireId);

    boolean existsByQuestionQuestionId(Long questionId);
}
