package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.bodhpsychometric.bodhassess.domain.questionnaire.ItemUsageTraitScore;

public interface ItemUsageTraitScoreRepository extends JpaRepository<ItemUsageTraitScore, Long> {

    List<ItemUsageTraitScore> findByUsageId(Long usageId);

    /** Scoring-engine fetch: all question-level credits of a questionnaire. */
    @Query("select s from ItemUsageTraitScore s join fetch s.placement"
            + " where s.usage.questionnaire.id = :questionnaireId")
    List<ItemUsageTraitScore> findByQuestionnaireId(@Param("questionnaireId") Long questionnaireId);

    boolean existsByPlacementId(Long placementId);
}
