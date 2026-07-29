package com.bodhpsychometric.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.bodhpsychometric.model.questionnaire.QuestionnaireSection;

public interface QuestionnaireSectionRepository extends JpaRepository<QuestionnaireSection, Long> {

    List<QuestionnaireSection> findByQuestionnaireIdOrderBySortOrderAsc(Long questionnaireId);

    boolean existsByQuestionnaireId(Long questionnaireId);
}
