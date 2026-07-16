package com.bodhpsychometric.bodhassess.domain.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.bodhassess.domain.questionnaire.QuestionnaireSection;

public interface QuestionnaireSectionRepository extends JpaRepository<QuestionnaireSection, Long> {

    List<QuestionnaireSection> findByQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    boolean existsByQuestionnaireId(Long questionnaireId);
}
