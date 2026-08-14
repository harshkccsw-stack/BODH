package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.scoring.QuestionRowMqt;

public interface QuestionRowMqtRepository extends JpaRepository<QuestionRowMqt, Long> {

    java.util.List<QuestionRowMqt> findByQuestionRowQuestionQuestionId(Long questionId);

    /**
     * Scoring-plan fetch — (questionRowId, mqtId) for every grid row of every
     * question placed in this questionnaire. No score column by design: this
     * is the FILTER, not a value. A pick on row R of column C credits only the
     * MQTs R names here, each with the score C carries for that MQT.
     */
    @Query("select r.questionRow.questionRowId, r.measuredQualityType.measuredQualityTypeId "
            + "from QuestionRowMqt r where r.questionRow.question.questionId in "
            + "(select qq.question.questionId from QuestionnaireQuestion qq "
            + "where qq.questionnaire.questionnaireId = :questionnaireId)")
    java.util.List<Object[]> findForQuestionnaire(Long questionnaireId);

    void deleteByQuestionRowQuestionQuestionId(Long questionId);

    /** Any grid row measuring a trait of this MQ — blocks its delete. */
    boolean existsByMeasuredQualityType_MeasuredQuality_MeasuredQualityId(Long measuredQualityId);

    /** Any grid row measuring one of these traits — blocks an MQT subtree delete. */
    boolean existsByMeasuredQualityType_MeasuredQualityTypeIdIn(java.util.Collection<Long> measuredQualityTypeIds);
}
