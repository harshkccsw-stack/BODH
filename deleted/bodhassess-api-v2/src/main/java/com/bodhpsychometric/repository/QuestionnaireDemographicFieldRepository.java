package com.bodhpsychometric.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.QuestionnaireDemographicField;

public interface QuestionnaireDemographicFieldRepository extends JpaRepository<QuestionnaireDemographicField, Long> {

    List<QuestionnaireDemographicField> findByQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    boolean existsByFieldId(Long fieldId);
}
