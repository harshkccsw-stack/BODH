package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireItemOption;

public interface QuestionnaireItemOptionRepository extends JpaRepository<QuestionnaireItemOption, Long> {

    List<QuestionnaireItemOption> findByUsageIdOrderByDisplayOrderAsc(Long usageId);

    Optional<QuestionnaireItemOption> findByUsageIdAndOptionId(Long usageId, Long optionId);

    /** Coverage check input for the every-option-has-a-row invariant. */
    long countByUsageId(Long usageId);
}
