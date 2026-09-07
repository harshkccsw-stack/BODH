package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.scoring.OptionMqtScore;

public interface OptionMqtScoreRepository extends JpaRepository<OptionMqtScore, Long> {

    boolean existsByOptionQuestionQuestionId(Long questionId);

    /**
     * Scoring-plan fetch — (optionId, mqtId, score) for every option of every
     * question placed in this questionnaire. This is the layer that actually
     * scores: a respondent's contribution is the sum over the options they
     * picked. Grid columns are ordinary options and come back here too.
     */
    @Query("select s.option.optionId, s.measuredQualityType.measuredQualityTypeId, s.score "
            + "from OptionMqtScore s where s.option.question.questionId in "
            + "(select qq.question.questionId from QuestionnaireQuestion qq "
            + "where qq.questionnaire.questionnaireId = :questionnaireId)")
    java.util.List<Object[]> findForQuestionnaire(Long questionnaireId);

    /**
     * (questionId, mqtId, score) for the report engine's shape probe.
     *
     * <p>Deliberately NOT the same projection as {@link #findForQuestionnaire}:
     * that one is keyed by option because scoring sums the options a respondent
     * picked, and it therefore cannot say how many QUESTIONS feed a trait. The
     * shape probe needs exactly that — a factor built from four items and one
     * built from eight produce different ranges from identical column keys, and
     * that difference is invisible to every other check.
     */
    @Query("select s.option.question.questionId, s.measuredQualityType.measuredQualityTypeId, s.score "
            + "from OptionMqtScore s where s.option.question.questionId in "
            + "(select qq.question.questionId from QuestionnaireQuestion qq "
            + "where qq.questionnaire.questionnaireId = :questionnaireId)")
    java.util.List<Object[]> findQuestionShapeFor(Long questionnaireId);

    java.util.List<OptionMqtScore> findByOptionQuestionQuestionId(Long questionId);

    void deleteByOptionQuestionQuestionId(Long questionId);

    /** Any option scored against a trait belonging to this MQ — blocks its delete. */
    boolean existsByMeasuredQualityType_MeasuredQuality_MeasuredQualityId(Long measuredQualityId);

    /** Any option scored against one of these traits — blocks an MQT subtree delete. */
    boolean existsByMeasuredQualityType_MeasuredQualityTypeIdIn(java.util.Collection<Long> measuredQualityTypeIds);
}
