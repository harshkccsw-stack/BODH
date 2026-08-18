package com.bodhpsychometric.repository.demographics;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import com.bodhpsychometric.model.demographics.QuestionnaireDemographicField;

public interface QuestionnaireDemographicFieldRepository extends JpaRepository<QuestionnaireDemographicField, Long> {

    boolean existsByDemographicFieldDemographicFieldId(Long demographicFieldId);

    /** Portal delivery fetch — field eagerly, so the form DTO never lazy-loads per row. */
    @Query("select qdf from QuestionnaireDemographicField qdf join fetch qdf.demographicField "
            + "where qdf.questionnaire.questionnaireId = :questionnaireId order by qdf.sortOrder asc")
    List<QuestionnaireDemographicField> findForPortalDelivery(Long questionnaireId);

    List<QuestionnaireDemographicField> findByQuestionnaireQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    /**
     * Which questionnaires map this field into their form — the portal content
     * cache's eviction fan-out when a demographic field is edited.
     */
    @Query("select distinct qdf.questionnaire.questionnaireId from QuestionnaireDemographicField qdf "
            + "where qdf.demographicField.demographicFieldId = :demographicFieldId")
    List<Long> findQuestionnaireIdsMappingField(Long demographicFieldId);

    void deleteByQuestionnaireQuestionnaireId(Long questionnaireId);
}
