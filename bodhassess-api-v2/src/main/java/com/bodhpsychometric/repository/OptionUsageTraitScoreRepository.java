package com.bodhpsychometric.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.model.questionnaire.OptionUsageTraitScore;

public interface OptionUsageTraitScoreRepository extends JpaRepository<OptionUsageTraitScore, Long> {

    List<OptionUsageTraitScore> findByOptionUsageId(Long optionUsageId);

    /** Scoring-engine fetch: all option-level credits of a questionnaire. */
    @Query("select s from OptionUsageTraitScore s join fetch s.placement join fetch s.optionUsage ou"
            + " where ou.usage.questionnaire.id = :questionnaireId")
    List<OptionUsageTraitScore> findByQuestionnaireId(@Param("questionnaireId") Long questionnaireId);

    boolean existsByPlacementId(Long placementId);
}
