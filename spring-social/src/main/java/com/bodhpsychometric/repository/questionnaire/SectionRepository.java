package com.bodhpsychometric.repository.questionnaire;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.Section;

public interface SectionRepository extends JpaRepository<Section, Long> {

    /** A questionnaire's sections in insertion order. */
    List<Section> findByQuestionnaire_QuestionnaireIdOrderBySectionIdAsc(Long questionnaireId);
}
