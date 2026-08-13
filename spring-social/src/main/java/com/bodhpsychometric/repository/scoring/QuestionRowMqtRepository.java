package com.bodhpsychometric.repository.scoring;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.scoring.QuestionRowMqt;

public interface QuestionRowMqtRepository extends JpaRepository<QuestionRowMqt, Long> {

    java.util.List<QuestionRowMqt> findByQuestionRowQuestionQuestionId(Long questionId);

    void deleteByQuestionRowQuestionQuestionId(Long questionId);

    /** Any grid row measuring a trait of this MQ — blocks its delete. */
    boolean existsByMeasuredQualityType_MeasuredQuality_MeasuredQualityId(Long measuredQualityId);

    /** Any grid row measuring one of these traits — blocks an MQT subtree delete. */
    boolean existsByMeasuredQualityType_MeasuredQualityTypeIdIn(java.util.Collection<Long> measuredQualityTypeIds);
}
