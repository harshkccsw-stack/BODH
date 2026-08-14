package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.scoring.QuestionMqtScore;

public interface QuestionMqtScoreRepository extends JpaRepository<QuestionMqtScore, Long> {

    boolean existsByQuestionQuestionId(Long questionId);

    /**
     * Scoring-plan fetch — (questionId, mqtId, score) for every question placed
     * in this questionnaire. A projection rather than entities: the plan only
     * needs the three numbers, and the FK ids come off the join columns with no
     * extra join and nothing lazy left to touch.
     */
    @Query("select s.question.questionId, s.measuredQualityType.measuredQualityTypeId, s.score "
            + "from QuestionMqtScore s where s.question.questionId in "
            + "(select qq.question.questionId from QuestionnaireQuestion qq "
            + "where qq.questionnaire.questionnaireId = :questionnaireId)")
    java.util.List<Object[]> findForQuestionnaire(Long questionnaireId);

    java.util.List<QuestionMqtScore> findByQuestionQuestionId(Long questionId);

    void deleteByQuestionQuestionId(Long questionId);

    /** Any question scored against a trait belonging to this MQ — blocks its delete. */
    boolean existsByMeasuredQualityType_MeasuredQuality_MeasuredQualityId(Long measuredQualityId);

    /** Any question scored against one of these traits — blocks an MQT subtree delete. */
    boolean existsByMeasuredQualityType_MeasuredQualityTypeIdIn(java.util.Collection<Long> measuredQualityTypeIds);
}
