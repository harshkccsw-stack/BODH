package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.scoring.OptionMqtScore;

public interface OptionMqtScoreRepository extends JpaRepository<OptionMqtScore, Long> {

    boolean existsByOptionQuestionQuestionId(Long questionId);

    java.util.List<OptionMqtScore> findByOptionQuestionQuestionId(Long questionId);

    void deleteByOptionQuestionQuestionId(Long questionId);

    /** Any option scored against a trait belonging to this MQ — blocks its delete. */
    boolean existsByMeasuredQualityType_MeasuredQuality_MeasuredQualityId(Long measuredQualityId);

    /** Any option scored against one of these traits — blocks an MQT subtree delete. */
    boolean existsByMeasuredQualityType_MeasuredQualityTypeIdIn(java.util.Collection<Long> measuredQualityTypeIds);
}
