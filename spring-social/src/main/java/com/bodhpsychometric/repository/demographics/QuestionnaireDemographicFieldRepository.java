package com.bodhpsychometric.repository.demographics;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;

public interface QuestionnaireDemographicFieldRepository extends JpaRepository<QuestionnaireDemographicField, Long> {

    boolean existsByDemographicFieldDemographicFieldId(Long demographicFieldId);

    List<QuestionnaireDemographicField> findByQuestionnaireQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    void deleteByQuestionnaireQuestionnaireId(Long questionnaireId);
}
