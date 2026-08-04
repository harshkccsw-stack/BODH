package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.scoring.QuestionMqtScore;

public interface QuestionMqtScoreRepository extends JpaRepository<QuestionMqtScore, Long> {

    boolean existsByQuestionQuestionId(Long questionId);

    java.util.List<QuestionMqtScore> findByQuestionQuestionId(Long questionId);

    void deleteByQuestionQuestionId(Long questionId);

    /** Any question scored against a trait belonging to this MQ — blocks its delete. */
    boolean existsByMeasuredQualityType_MeasuredQuality_MeasuredQualityId(Long measuredQualityId);

    /** Any question scored against one of these traits — blocks an MQT subtree delete. */
    boolean existsByMeasuredQualityType_MeasuredQualityTypeIdIn(java.util.Collection<Long> measuredQualityTypeIds);
}
