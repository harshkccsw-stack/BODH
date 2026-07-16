package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireDemographicField;

public interface QuestionnaireDemographicFieldRepository extends JpaRepository<QuestionnaireDemographicField, Long> {

    List<QuestionnaireDemographicField> findByQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    boolean existsByFieldId(Long fieldId);
}
