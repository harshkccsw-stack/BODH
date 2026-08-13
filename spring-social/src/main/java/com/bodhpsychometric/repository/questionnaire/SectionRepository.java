package com.bodhpsychometric.repository.questionnaire;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.Section;

public interface SectionRepository extends JpaRepository<Section, Long> {

    /** A questionnaire's sections in insertion order. */
    List<Section> findByQuestionnaire_QuestionnaireIdOrderBySectionIdAsc(Long questionnaireId);

    /**
     * A questionnaire's sections in DISPLAY order — what the author arranged.
     * This is the one to use anywhere order is user-visible (the sections
     * list, and the Section_A/B/C report tag letters, which follow it);
     * sectionId only breaks ties.
     */
    List<Section> findByQuestionnaire_QuestionnaireIdOrderBySortOrderAscSectionIdAsc(Long questionnaireId);
}
